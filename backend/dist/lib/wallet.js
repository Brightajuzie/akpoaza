"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateWallet = getOrCreateWallet;
exports.createEscrowForPaidItem = createEscrowForPaidItem;
exports.releaseEscrow = releaseEscrow;
exports.triggerSplitWebhook = triggerSplitWebhook;
const prisma_1 = __importDefault(require("./prisma"));
function getOrCreateWallet(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        let wallet = yield prisma_1.default.wallet.findUnique({
            where: { userId },
        });
        if (!wallet) {
            wallet = yield prisma_1.default.wallet.create({
                data: {
                    userId,
                    balance: 0.0,
                    pendingBalance: 0.0,
                },
            });
        }
        return wallet;
    });
}
function createEscrowForPaidItem(checkoutType, id, paidAmount) {
    return __awaiter(this, void 0, void 0, function* () {
        const setting = yield prisma_1.default.appSetting.findUnique({ where: { key: 'commission_rate' } });
        const commissionRate = setting ? parseFloat(setting.value) : 0.15;
        return prisma_1.default.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
            if (checkoutType === 'booking') {
                const booking = yield tx.booking.findUnique({
                    where: { id },
                    include: { service: true },
                });
                if (!booking) {
                    throw new Error('Booking not found');
                }
                if (!booking.handymanId) {
                    throw new Error('Booking has no handyman assigned');
                }
                const existingEscrows = yield tx.escrow.findMany({
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
                const escrow = yield tx.escrow.create({
                    data: {
                        bookingId: id,
                        providerId: booking.handymanId,
                        amount: transactionAmount,
                        commissionAmount,
                        providerAmount,
                        status: 'HELD',
                    },
                });
                yield tx.wallet.upsert({
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
                yield tx.booking.update({
                    where: { id },
                    data: {
                        amountPaid: {
                            increment: transactionAmount,
                        },
                    },
                });
                const walletRecord = yield tx.wallet.findUnique({ where: { userId: booking.handymanId } });
                if (walletRecord) {
                    yield tx.transaction.create({
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
            }
            else if (checkoutType === 'order') {
                const order = yield tx.order.findUnique({
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
                const existingEscrows = yield tx.escrow.findMany({
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
                const vendorItemsMap = new Map();
                for (const item of order.items) {
                    const vendorId = item.product.vendorId;
                    if (!vendorId)
                        continue;
                    if (!vendorItemsMap.has(vendorId)) {
                        vendorItemsMap.set(vendorId, []);
                    }
                    vendorItemsMap.get(vendorId).push(item);
                }
                const escrows = [];
                for (const [vendorId, items] of vendorItemsMap.entries()) {
                    const vendorSubtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                    // Calculate fraction of this vendor's subtotal relative to order total
                    const fraction = vendorSubtotal / order.totalAmount;
                    const vendorAmountPaidThisTime = transactionAmount * fraction;
                    const commissionAmount = vendorAmountPaidThisTime * commissionRate;
                    const providerAmount = vendorAmountPaidThisTime - commissionAmount;
                    const escrow = yield tx.escrow.create({
                        data: {
                            orderId: id,
                            providerId: vendorId,
                            amount: vendorAmountPaidThisTime,
                            commissionAmount,
                            providerAmount,
                            status: 'HELD',
                        },
                    });
                    yield tx.wallet.upsert({
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
                    const walletRecord = yield tx.wallet.findUnique({ where: { userId: vendorId } });
                    if (walletRecord) {
                        yield tx.transaction.create({
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
                yield tx.order.update({
                    where: { id },
                    data: {
                        amountPaid: {
                            increment: transactionAmount,
                        },
                    },
                });
                return escrows;
            }
        }), {
            timeout: 30000
        });
    });
}
function releaseEscrow(escrowId) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma_1.default.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const escrow = yield tx.escrow.findUnique({
                where: { id: escrowId },
            });
            if (!escrow) {
                throw new Error('Escrow record not found');
            }
            if (escrow.status !== 'HELD') {
                return escrow;
            }
            const updatedEscrow = yield tx.escrow.update({
                where: { id: escrowId },
                data: {
                    status: 'RELEASED',
                    releasedAt: new Date(),
                },
            });
            yield tx.wallet.upsert({
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
            const providerWallet = yield tx.wallet.findUnique({ where: { userId: escrow.providerId } });
            if (providerWallet) {
                yield tx.transaction.create({
                    data: {
                        walletId: providerWallet.id,
                        amount: escrow.providerAmount,
                        type: 'ESCROW_RELEASE',
                        status: 'COMPLETED',
                        description: `Funds released for ${escrow.bookingId ? `booking #${escrow.bookingId.substring(0, 8)}` : `order #${(_a = escrow.orderId) === null || _a === void 0 ? void 0 : _a.substring(0, 8)}`}`,
                        referenceId: escrow.bookingId || escrow.orderId,
                    },
                });
            }
            yield tx.wallet.upsert({
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
            const platformWallet = yield tx.wallet.findUnique({ where: { userId: 'PLATFORM' } });
            if (platformWallet) {
                yield tx.transaction.create({
                    data: {
                        walletId: platformWallet.id,
                        amount: escrow.commissionAmount,
                        type: 'COMMISSION',
                        status: 'COMPLETED',
                        description: `Commission from ${escrow.bookingId ? `booking #${escrow.bookingId.substring(0, 8)}` : `order #${(_b = escrow.orderId) === null || _b === void 0 ? void 0 : _b.substring(0, 8)}`}`,
                        referenceId: escrow.bookingId || escrow.orderId,
                    },
                });
            }
            return updatedEscrow;
        }), {
            timeout: 30000
        });
    });
}
/**
 * triggerSplitWebhook — releases an escrow by calling releaseEscrow() directly.
 *
 * The previous implementation made an HTTP POST to localhost which always fails
 * on cloud platforms like Render (no loopback server). We now call the release
 * function directly, which is both faster and production-safe.
 */
function triggerSplitWebhook(escrowId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield releaseEscrow(escrowId);
            console.log(`[EscrowRelease] Escrow ${escrowId} released successfully.`);
        }
        catch (err) {
            console.error(`[EscrowReleaseError] Failed to release escrow ${escrowId}: ${err.message}`);
            throw err; // Re-throw so callers can handle the failure
        }
    });
}
