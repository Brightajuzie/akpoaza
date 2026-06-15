import { Router, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getOrCreateWallet } from '../lib/wallet';

const router = Router();

// Retrieve wallet balance, pending balance, and history
router.get('/balance', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const wallet = await getOrCreateWallet(userId);

    // Fetch transaction history
    const transactions = await prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Fetch withdrawal history
    const withdrawals = await prisma.withdrawal.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      balance: wallet.balance,
      pendingBalance: wallet.pendingBalance,
      transactions,
      withdrawals,
    });
  } catch (error) {
    next(error);
  }
});

// Request withdrawal from virtual wallet to local bank
router.post('/withdraw', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  const { amount, instant, accountNumber, bankName, bankCode } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid withdrawal amount is required.' });
  if (!accountNumber || !bankName) return res.status(400).json({ error: 'Account number and bank name are required.' });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { verificationStatus: true, role: true }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    // KYC Check: Provider must be verified to withdraw
    if (user.role === 'HANDYMAN' || user.role === 'VENDOR' || user.role === 'RIDER') {
      if (user.verificationStatus !== 'VERIFIED') {
        return res.status(400).json({ error: 'Identity verification (KYC) required to withdraw funds.' });
      }
    }

    const wallet = await getOrCreateWallet(userId);

    if (wallet.balance < amount) {
      return res.status(400).json({ error: 'Insufficient cleared balance.' });
    }

    const isInstant = !!instant;
    const fee = isInstant ? 100.0 : 0.0;
    const netAmount = amount - fee;

    if (netAmount <= 0) {
      return res.status(400).json({ error: `Withdrawal amount must exceed the transaction fee of ₦${fee}.` });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Deduct funds from balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            decrement: amount,
          },
        },
      });

      // 2. Create withdrawal record
      const withdrawal = await tx.withdrawal.create({
        data: {
          walletId: wallet.id,
          amount,
          fee,
          netAmount,
          instant: isInstant,
          status: isInstant ? 'COMPLETED' : 'PENDING',
          payoutMethod: 'BANK_TRANSFER',
          accountNumber,
          bankName,
          bankCode: bankCode || null,
        },
      });

      // 3. Log negative transaction
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: -amount,
          type: 'WITHDRAWAL',
          status: isInstant ? 'COMPLETED' : 'PENDING',
          description: `Withdrawal (${isInstant ? 'Instant' : 'Standard batch'}) of ₦${amount.toFixed(2)} to ${bankName} A/C ${accountNumber}`,
          referenceId: withdrawal.id,
        },
      });

      return { updatedWallet, withdrawal };
    });

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

// Admin: Manual trigger to process batch withdrawals (simulates T+1 overnight settlement)
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

    const processedIds = pendingWithdrawals.map(w => w.id);

    await prisma.$transaction([
      prisma.withdrawal.updateMany({
        where: { id: { in: processedIds } },
        data: { status: 'COMPLETED' }
      }),
      prisma.transaction.updateMany({
        where: { referenceId: { in: processedIds }, type: 'WITHDRAWAL' },
        data: { status: 'COMPLETED' }
      })
    ]);

    res.json({
      success: true,
      count: processedIds.length,
      message: `Successfully processed ${processedIds.length} standard withdrawals.`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
