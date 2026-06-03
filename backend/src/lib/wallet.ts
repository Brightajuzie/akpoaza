import prisma from './prisma';
import axios from 'axios';

export async function getOrCreateWallet(userId: string) {
  let wallet = await prisma.wallet.findUnique({
    where: { userId },
  });
  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: {
        userId,
        balance: 0.0,
        pendingBalance: 0.0,
      },
    });
  }
  return wallet;
}

export async function createEscrowForPaidItem(checkoutType: 'booking' | 'order', id: string, paidAmount?: number) {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'commission_rate' } });
  const commissionRate = setting ? parseFloat(setting.value) : 0.15;

  return prisma.$transaction(async (tx) => {
    if (checkoutType === 'booking') {
      const booking = await tx.booking.findUnique({
        where: { id },
        include: { service: true },
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      if (!booking.handymanId) {
        throw new Error('Booking has no handyman assigned');
      }

      const existingEscrows = await tx.escrow.findMany({
        where: { bookingId: id },
      });
      const totalEscrowed = existingEscrows.reduce((sum, e) => sum + e.amount, 0);

      // Determine transaction amount
      let transactionAmount = paidAmount;
      if (transactionAmount === undefined) {
        transactionAmount = booking.isSplitPayment ? booking.totalPrice / 2 : booking.totalPrice;
      }

      if (totalEscrowed >= booking.totalPrice) {
        return existingEscrows[existingEscrows.length - 1];
      }


      const commissionAmount = transactionAmount * commissionRate;
      const providerAmount = transactionAmount - commissionAmount;

      const escrow = await tx.escrow.create({
        data: {
          bookingId: id,
          providerId: booking.handymanId,
          amount: transactionAmount,
          commissionAmount,
          providerAmount,
          status: 'HELD',
        },
      });

      await tx.wallet.upsert({
        where: { userId: booking.handymanId },
        update: {
          pendingBalance: {
            increment: providerAmount,
          },
        },
        create: {
          userId: booking.handymanId,
          balance: 0.0,
          pendingBalance: providerAmount,
        },
      });

      // Increment amountPaid on booking
      await tx.booking.update({
        where: { id },
        data: {
          amountPaid: {
            increment: transactionAmount,
          },
        },
      });

      const walletRecord = await tx.wallet.findUnique({ where: { userId: booking.handymanId } });
      if (walletRecord) {
        await tx.transaction.create({
          data: {
            walletId: walletRecord.id,
            amount: providerAmount,
            type: 'PENDING_CLEARANCE',
            status: 'COMPLETED',
            description: `Pending clearance for booking #${id.substring(0, 8)} (${booking.service.name}) - payment ₦${transactionAmount.toFixed(2)}`,
            referenceId: id,
          },
        });
      }

      return escrow;

    } else if (checkoutType === 'order') {
      const order = await tx.order.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const existingEscrows = await tx.escrow.findMany({
        where: { orderId: id },
      });
      const totalEscrowed = existingEscrows.reduce((sum, e) => sum + e.amount, 0);

      let transactionAmount = paidAmount;
      if (transactionAmount === undefined) {
        transactionAmount = order.isSplitPayment ? order.totalAmount / 2 : order.totalAmount;
      }

      if (totalEscrowed >= order.totalAmount) {
        return existingEscrows;
      }


      const vendorItemsMap = new Map<string, typeof order.items>();
      for (const item of order.items) {
        const vendorId = item.product.vendorId;
        if (!vendorId) continue;
        if (!vendorItemsMap.has(vendorId)) {
          vendorItemsMap.set(vendorId, []);
        }
        vendorItemsMap.get(vendorId)!.push(item);
      }

      const escrows = [];

      for (const [vendorId, items] of vendorItemsMap.entries()) {
        const vendorSubtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        // Calculate fraction of this vendor's subtotal relative to order total
        const fraction = vendorSubtotal / order.totalAmount;
        const vendorAmountPaidThisTime = transactionAmount * fraction;

        const commissionAmount = vendorAmountPaidThisTime * commissionRate;
        const providerAmount = vendorAmountPaidThisTime - commissionAmount;

        const escrow = await tx.escrow.create({
          data: {
            orderId: id,
            providerId: vendorId,
            amount: vendorAmountPaidThisTime,
            commissionAmount,
            providerAmount,
            status: 'HELD',
          },
        });

        await tx.wallet.upsert({
          where: { userId: vendorId },
          update: {
            pendingBalance: {
              increment: providerAmount,
            },
          },
          create: {
            userId: vendorId,
            balance: 0.0,
            pendingBalance: providerAmount,
          },
        });

        const walletRecord = await tx.wallet.findUnique({ where: { userId: vendorId } });
        if (walletRecord) {
          await tx.transaction.create({
            data: {
              walletId: walletRecord.id,
              amount: providerAmount,
              type: 'PENDING_CLEARANCE',
              status: 'COMPLETED',
              description: `Pending clearance for order #${id.substring(0, 8)} - payment ₦${vendorAmountPaidThisTime.toFixed(2)}`,
              referenceId: id,
            },
          });
        }

        escrows.push(escrow);
      }

      // Update order amountPaid
      await tx.order.update({
        where: { id },
        data: {
          amountPaid: {
            increment: transactionAmount,
          },
        },
      });

      return escrows;
    }
  });
}

export async function releaseEscrow(escrowId: string) {
  return prisma.$transaction(async (tx) => {
    const escrow = await tx.escrow.findUnique({
      where: { id: escrowId },
    });

    if (!escrow) {
      throw new Error('Escrow record not found');
    }

    if (escrow.status !== 'HELD') {
      return escrow;
    }

    const updatedEscrow = await tx.escrow.update({
      where: { id: escrowId },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
      },
    });

    await tx.wallet.upsert({
      where: { userId: escrow.providerId },
      update: {
        pendingBalance: {
          decrement: escrow.providerAmount,
        },
        balance: {
          increment: escrow.providerAmount,
        },
      },
      create: {
        userId: escrow.providerId,
        balance: escrow.providerAmount,
        pendingBalance: 0.0,
      },
    });

    const providerWallet = await tx.wallet.findUnique({ where: { userId: escrow.providerId } });
    if (providerWallet) {
      await tx.transaction.create({
        data: {
          walletId: providerWallet.id,
          amount: escrow.providerAmount,
          type: 'ESCROW_RELEASE',
          status: 'COMPLETED',
          description: `Funds released for ${escrow.bookingId ? `booking #${escrow.bookingId.substring(0, 8)}` : `order #${escrow.orderId?.substring(0, 8)}`}`,
          referenceId: escrow.bookingId || escrow.orderId,
        },
      });
    }

    await tx.wallet.upsert({
      where: { userId: 'PLATFORM' },
      update: {
        balance: {
          increment: escrow.commissionAmount,
        },
      },
      create: {
        userId: 'PLATFORM',
        balance: escrow.commissionAmount,
        pendingBalance: 0.0,
      },
    });

    const platformWallet = await tx.wallet.findUnique({ where: { userId: 'PLATFORM' } });
    if (platformWallet) {
      await tx.transaction.create({
        data: {
          walletId: platformWallet.id,
          amount: escrow.commissionAmount,
          type: 'COMMISSION',
          status: 'COMPLETED',
          description: `Commission from ${escrow.bookingId ? `booking #${escrow.bookingId.substring(0, 8)}` : `order #${escrow.orderId?.substring(0, 8)}`}`,
          referenceId: escrow.bookingId || escrow.orderId,
        },
      });
    }

    return updatedEscrow;
  });
}

export async function triggerSplitWebhook(escrowId: string) {
  const WEBHOOK_SPLIT_SECRET = process.env.WEBHOOK_SPLIT_SECRET || 'local-split-secret-token';
  const port = process.env.PORT || 5000;
  const url = `http://localhost:${port}/api/payments/webhook/split`;
  try {
    await axios.post(url, {
      escrowId,
      secretToken: WEBHOOK_SPLIT_SECRET,
    }, { timeout: 5000 });
    console.log(`[SplitWebhook] Split triggered successfully for escrow: ${escrowId}`);
  } catch (err: any) {
    console.warn(`[SplitWebhook] Webhook trigger failed, executing split directly: ${err.message}`);
    // Fallback: execute release directly if webhook fails in local testing/dev
    try {
      await releaseEscrow(escrowId);
    } catch (fallbackErr: any) {
      console.error(`[SplitWebhookFallbackError] Failed to release escrow directly: ${fallbackErr.message}`);
    }
  }
}
