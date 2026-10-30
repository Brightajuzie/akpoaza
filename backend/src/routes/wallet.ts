import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getOrCreateWallet } from '../lib/wallet';
import { sendNotification } from '../lib/notify';
import {
  getNigerianBanks,
  resolveBankAccount,
  initiateBankTransfer,
  verifyFlutterwaveTransaction,
} from '../lib/flutterwave';
import { processPaymentVerification } from './payments';

const router = Router();

// Retrieve wallet balance, pending balance, history, and withdrawal requirements
router.get('/balance', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, name: true, email: true, phone: true }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const wallet = await getOrCreateWallet(userId);

    // Fetch transaction history
    const transactions = await prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    // Fetch withdrawal history
    const withdrawals = await prisma.withdrawal.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    // Check if user has ever completed or requested a withdrawal before
    const previousWithdrawalsCount = await prisma.withdrawal.count({
      where: {
        walletId: wallet.id,
        status: { in: ['COMPLETED', 'PENDING'] },
      },
    });
    const isFirstWithdrawal = previousWithdrawalsCount === 0;

    // Get huge withdrawal threshold (defaults to 50,000 NGN)
    const thresholdSetting = await prisma.appSetting.findUnique({
      where: { key: 'huge_withdrawal_threshold' },
    });
    const hugeWithdrawalThreshold = thresholdSetting ? parseFloat(thresholdSetting.value) : 50000;

    res.json({
      balance: wallet.balance,
      pendingBalance: wallet.pendingBalance,
      isFirstWithdrawal,
      hugeWithdrawalThreshold,
      transactions,
      withdrawals,
    });
  } catch (error) {
    next(error);
  }
});

// Start a wallet top-up: creates a PENDING WalletFunding record
router.post('/fund', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  const { amount, currency } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount || '0'));
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Valid funding amount is required.' });
  }

  // Minimum funding check (₦100 or 1 unit of foreign currency)
  const cleanCurrency = String(currency || 'NGN').toUpperCase().trim();
  const minAmount = cleanCurrency === 'NGN' ? 100 : 1;
  if (numAmount < minAmount) {
    return res.status(400).json({
      error: `Minimum wallet funding amount is ${cleanCurrency === 'NGN' ? '₦100' : `${cleanCurrency} ${minAmount}`}.`,
    });
  }

  try {
    const funding = await prisma.walletFunding.create({
      data: {
        userId,
        amount: Math.round(numAmount * 100) / 100,
        currency: cleanCurrency,
        status: 'PENDING',
      },
    });

    res.json({
      success: true,
      fundingId: funding.id,
      amount: funding.amount,
      currency: funding.currency,
    });
  } catch (error) {
    next(error);
  }
});

// Fetch supported Nigerian banks for withdrawals and payouts
router.get('/banks', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const banks = await getNigerianBanks();
    res.json({ success: true, count: banks.length, banks });
  } catch (error) {
    next(error);
  }
});

// Verify 10-digit account number with bank and resolve account holder's name
router.post('/resolve-account', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { accountNumber, bankCode } = req.body;
  try {
    const result = await resolveBankAccount(accountNumber, bankCode);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Could not resolve bank account details.' });
  }
});

// Check & verify funding status for client-side auto-refresh
router.get('/fund/verify/:idOrRef', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  const { idOrRef } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Look up by id or by paymentRef
    let funding = await prisma.walletFunding.findFirst({
      where: {
        OR: [{ id: idOrRef }, { paymentRef: idOrRef }],
        userId,
      },
    });

    if (!funding) {
      return res.status(404).json({ error: 'Wallet funding record not found.' });
    }

    // If still pending, actively verify with payment gateway
    if (funding.status !== 'PAID' && funding.paymentRef) {
      try {
        if (funding.paymentProvider === 'FLUTTERWAVE') {
          const verifyResult = await verifyFlutterwaveTransaction(funding.paymentRef);
          if (verifyResult.successful) {
            await processPaymentVerification({
              provider: 'FLUTTERWAVE',
              reference: funding.paymentRef,
              checkoutType: 'wallet_funding',
              id: funding.id,
              chargedAmount: verifyResult.amount || funding.amount,
            });
            // Re-fetch updated funding
            funding = await prisma.walletFunding.findUnique({ where: { id: funding.id } }) || funding;
          }
        }
      } catch (verifyErr) {
        // Verification attempt failed, continue returning current record
      }
    }

    const wallet = await getOrCreateWallet(userId);

    res.json({
      success: true,
      status: funding.status,
      paid: funding.status === 'PAID',
      amount: funding.amount,
      balance: wallet.balance,
      funding,
    });
  } catch (error) {
    next(error);
  }
});

// Request an OTP for withdrawal authentication (required for first-time withdrawals)
router.post('/withdraw/request-otp', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: userId },
      data: {
        withdrawalOtp: otpHash,
        withdrawalOtpExpires: expiresAt,
      },
    });

    // Send OTP via notification, email, and SMS
    sendNotification({
      userId: user.id,
      title: '🔐 Withdrawal Authentication Code',
      body: `Your FixMart withdrawal authentication code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
      type: 'GENERAL',
      email: user.email,
      phone: user.phone || undefined,
      emailSubject: '🔐 Your FixMart Withdrawal Verification Code',
      emailHtml: `
        <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
          Hello <strong>${user.name}</strong>,
        </p>
        <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
          You requested to verify a withdrawal from your FixMart wallet. Enter the 6-digit authentication code below to proceed:
        </p>
        <div style="background:#F0FDF4;border:2px solid #86EFAC;border-radius:14px;padding:24px;text-align:center;margin:20px 0;">
          <p style="margin:0 0 8px;font-size:13px;color:#166534;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Withdrawal Security Code</p>
          <p style="margin:0;font-size:42px;font-weight:900;color:#0F172A;letter-spacing:10px;">${otp}</p>
          <p style="margin:12px 0 0;font-size:13px;color:#64748B;">⏰ Valid for 10 minutes</p>
        </div>
        <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 14px;border-radius:6px;margin:20px 0;">
          <p style="margin:0;font-size:12px;color:#92400E;line-height:1.45;">
            <strong>⚠️ Security Warning:</strong> Never share this code with anyone. FixMart staff will never ask for this code.
          </p>
        </div>
      `,
      smsText: `[FixMart] Your withdrawal verification code is: ${otp}. Valid for 10 minutes. Do not share.`,
    }).catch(() => {});

    res.json({
      success: true,
      message: 'A 6-digit verification code has been sent to your registered email.',
    });
  } catch (error) {
    next(error);
  }
});

// Request withdrawal from virtual wallet to local bank
router.post('/withdraw', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  const { amount, instant, accountNumber, bankName, bankCode, otp, livenessPhoto } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount || '0'));
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Valid withdrawal amount is required.' });
  }
  if (!accountNumber || !bankName) {
    return res.status(400).json({ error: 'Account number and bank name are required.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        verificationStatus: true,
        role: true,
        withdrawalOtp: true,
        withdrawalOtpExpires: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    // KYC Check: Provider must be verified to withdraw
    if (user.role === 'HANDYMAN' || user.role === 'VENDOR' || user.role === 'RIDER') {
      if (user.verificationStatus !== 'VERIFIED') {
        return res.status(400).json({ error: 'Identity verification (KYC) required to withdraw funds.' });
      }
    }

    const wallet = await getOrCreateWallet(userId);

    if (wallet.balance < numAmount) {
      return res.status(400).json({ error: 'Insufficient cleared balance.' });
    }

    const isInstant = !!instant;
    const fee = isInstant ? 100.0 : 0.0;
    const netAmount = numAmount - fee;

    if (netAmount <= 0) {
      return res.status(400).json({ error: `Withdrawal amount must exceed the transaction fee of ₦${fee}.` });
    }

    // ── 1. Check if First-Time Withdrawal (Requires OTP) ──────────────────────
    const previousWithdrawalsCount = await prisma.withdrawal.count({
      where: {
        walletId: wallet.id,
        status: { in: ['COMPLETED', 'PENDING'] },
      },
    });
    const isFirstWithdrawal = previousWithdrawalsCount === 0;

    if (isFirstWithdrawal) {
      if (!otp) {
        // Automatically dispatch OTP and notify frontend to prompt the user
        const newOtp = String(Math.floor(100000 + Math.random() * 900000));
        const newOtpHash = crypto.createHash('sha256').update(newOtp).digest('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.user.update({
          where: { id: userId },
          data: { withdrawalOtp: newOtpHash, withdrawalOtpExpires: expiresAt },
        });

        sendNotification({
          userId: user.id,
          title: '🔐 First Withdrawal Security Code',
          body: `Your FixMart first withdrawal verification code is: ${newOtp}. Expires in 10 minutes.`,
          type: 'GENERAL',
          email: user.email,
          emailSubject: '🔐 FixMart First-Time Withdrawal Verification Code',
          emailHtml: `
            <p style="font-size:16px;color:#1E293B">Hello <strong>${user.name}</strong>,</p>
            <p style="font-size:15px;color:#334155">As an extra security measure for your first withdrawal on FixMart, please use this verification code:</p>
            <div style="background:#F0FDF4;border:2px solid #86EFAC;border-radius:14px;padding:24px;text-align:center;margin:20px 0;">
              <p style="margin:0;font-size:42px;font-weight:900;color:#0F172A;letter-spacing:10px;">${newOtp}</p>
              <p style="margin:12px 0 0;font-size:13px;color:#64748B;">⏰ Valid for 10 minutes</p>
            </div>
          `,
          smsText: `[FixMart] Your first withdrawal code is: ${newOtp}. Valid for 10 min.`,
        }).catch(() => {});

        return res.status(400).json({
          requiresOtp: true,
          isFirstWithdrawal: true,
          error: 'First-time withdrawal requires authentication. A 6-digit security code has been sent to your email.',
        });
      }

      // Verify OTP
      if (!user.withdrawalOtp || !user.withdrawalOtpExpires) {
        return res.status(400).json({
          requiresOtp: true,
          error: 'No active verification code. Please request a new code.',
        });
      }

      if (new Date() > user.withdrawalOtpExpires) {
        return res.status(400).json({
          requiresOtp: true,
          error: 'Verification code has expired. Please request a new code.',
        });
      }

      const inputOtpHash = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
      if (inputOtpHash !== user.withdrawalOtp) {
        return res.status(400).json({
          requiresOtp: true,
          error: 'Incorrect verification code. Please check your email and try again.',
        });
      }
    }

    // ── 2. Check for Huge Amount Withdrawal (Requires Facial Life Check) ─────
    const thresholdSetting = await prisma.appSetting.findUnique({
      where: { key: 'huge_withdrawal_threshold' },
    });
    const hugeThreshold = thresholdSetting ? parseFloat(thresholdSetting.value) : 50000;
    const isHugeAmount = numAmount >= hugeThreshold;

    if (isHugeAmount) {
      const cleanPhoto = typeof livenessPhoto === 'string' ? livenessPhoto.trim() : '';
      if (!cleanPhoto) {
        return res.status(400).json({
          requiresLifeCheck: true,
          hugeThreshold,
          error: `High-value withdrawals (₦${hugeThreshold.toLocaleString()} and above) require a facial liveness check (selfie capture) to protect your funds.`,
        });
      }
    }

    // ── 3. Execute Transaction Atomically ────────────────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      // 1. Deduct funds from balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            decrement: numAmount,
          },
        },
      });

      // 2. Clear OTP on user if used
      if (isFirstWithdrawal) {
        await tx.user.update({
          where: { id: userId },
          data: {
            withdrawalOtp: null,
            withdrawalOtpExpires: null,
          },
        });
      }

      // 3. Create withdrawal record
      const withdrawal = await tx.withdrawal.create({
        data: {
          walletId: wallet.id,
          amount: numAmount,
          fee,
          netAmount,
          instant: isInstant,
          status: isInstant ? 'COMPLETED' : 'PENDING',
          payoutMethod: 'BANK_TRANSFER',
          accountNumber,
          bankName,
          bankCode: bankCode || null,
          livenessPhoto: isHugeAmount && typeof livenessPhoto === 'string' ? livenessPhoto.trim() : null,
          otpVerified: isFirstWithdrawal,
        },
      });

      // 4. Log negative transaction
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: -numAmount,
          type: 'WITHDRAWAL',
          status: isInstant ? 'COMPLETED' : 'PENDING',
          description: `Withdrawal (${isInstant ? 'Instant' : 'Standard batch'}) of ₦${numAmount.toFixed(2)} to ${bankName} A/C ${accountNumber}`,
          referenceId: withdrawal.id,
        },
      });

      return { updatedWallet, withdrawal };
    });

    // If instant withdrawal, dispatch real transfer via Flutterwave API
    if (isInstant) {
      try {
        const transferRes = await initiateBankTransfer({
          bankCode: String(bankCode || '044').trim(),
          accountNumber: String(accountNumber).trim(),
          amount: netAmount,
          narration: `FixMart Payout - ${accountNumber}`,
          reference: `TRF_${result.withdrawal.id}_${Date.now()}`,
        });
        console.log(`[Withdrawal] Instant bank payout dispatched: ${transferRes.reference} (ID: ${transferRes.transferId})`);
      } catch (transferErr: any) {
        // Rollback deduction if live transfer failed immediately
        console.error('[Withdrawal Transfer Failed]', transferErr.message);
        await prisma.$transaction([
          prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: numAmount } },
          }),
          prisma.withdrawal.update({
            where: { id: result.withdrawal.id },
            data: { status: 'FAILED' },
          }),
          prisma.transaction.create({
            data: {
              walletId: wallet.id,
              amount: numAmount,
              type: 'REFUND',
              status: 'COMPLETED',
              description: `Refund: transfer rejected by bank (${transferErr.message})`,
              referenceId: result.withdrawal.id,
            },
          }),
        ]);

        return res.status(400).json({
          error: `Bank transfer could not be dispatched: ${transferErr.message}. Your wallet balance has not been deducted.`,
        });
      }
    }

    // Notify user of successful withdrawal submission
    sendNotification({
      userId,
      title: isInstant ? '✅ Withdrawal Dispatched' : '⏳ Withdrawal Requested',
      body: isInstant
        ? `Your instant payout of ₦${netAmount.toLocaleString()} to ${bankName} (${accountNumber}) has been sent.`
        : `Your payout request of ₦${numAmount.toLocaleString()} to ${bankName} (${accountNumber}) has been queued for batch processing.`,
      type: 'PAYMENT',
      referenceId: result.withdrawal.id,
      email: user.email,
      emailSubject: isInstant ? '✅ FixMart Instant Withdrawal Confirmation' : '⏳ FixMart Withdrawal Request Queued',
    }).catch(() => {});

    res.json({
      success: true,
      message: isInstant ? 'Instant withdrawal completed.' : 'Withdrawal queued for batch settlement.',
      withdrawal: result.withdrawal,
      balance: result.updatedWallet.balance,
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Process batch withdrawals through bank transfers
router.post('/admin/process-batch-payouts', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  try {
    const pendingWithdrawals = await prisma.withdrawal.findMany({
      where: { status: 'PENDING' }
    });

    if (pendingWithdrawals.length === 0) {
      return res.json({ success: true, count: 0, message: 'No pending standard withdrawals to process.' });
    }

    let successCount = 0;
    let failCount = 0;

    for (const w of pendingWithdrawals) {
      try {
        await initiateBankTransfer({
          bankCode: w.bankCode || '044',
          accountNumber: w.accountNumber || '',
          amount: w.netAmount,
          narration: `FixMart Batch Payout - ${w.accountNumber}`,
          reference: `TRF_${w.id}_${Date.now()}`,
        });

        await prisma.$transaction([
          prisma.withdrawal.update({
            where: { id: w.id },
            data: { status: 'COMPLETED' },
          }),
          prisma.transaction.updateMany({
            where: { referenceId: w.id, type: 'WITHDRAWAL' },
            data: { status: 'COMPLETED' },
          }),
        ]);
        successCount++;
      } catch (err: any) {
        console.error(`[Batch Payout Failed for ${w.id}]:`, err.message);
        // Refund failed withdrawal to wallet
        await prisma.$transaction([
          prisma.withdrawal.update({
            where: { id: w.id },
            data: { status: 'FAILED' },
          }),
          prisma.wallet.update({
            where: { id: w.walletId },
            data: { balance: { increment: w.amount } },
          }),
          prisma.transaction.create({
            data: {
              walletId: w.walletId,
              amount: w.amount,
              type: 'REFUND',
              status: 'COMPLETED',
              description: `Refund: batch payout failed (${err.message})`,
              referenceId: w.id,
            },
          }),
        ]);
        failCount++;
      }
    }

    res.json({
      success: true,
      count: pendingWithdrawals.length,
      successCount,
      failCount,
      message: `Processed ${pendingWithdrawals.length} withdrawals: ${successCount} sent to bank, ${failCount} refunded due to bank errors.`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

