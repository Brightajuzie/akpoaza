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
const axios_1 = __importDefault(require("axios"));
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
function createEscrowForPaidItem(checkoutType, id) {
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
                const existing = yield tx.escrow.findFirst({
                    where: { bookingId: id },
                });
                if (existing)
                    return existing;
                const totalAmount = booking.totalPrice;
                const commissionAmount = totalAmount * commissionRate;
                const providerAmount = totalAmount - commissionAmount;
                const escrow = yield tx.escrow.create({
                    data: {
                        bookingId: id,
                        providerId: booking.handymanId,
                        amount: totalAmount,
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
                const walletRecord = yield tx.wallet.findUnique({ where: { userId: booking.handymanId } });
                if (walletRecord) {
                    yield tx.transaction.create({
                        data: {
                            walletId: walletRecord.id,
                            amount: providerAmount,
                            type: 'PENDING_CLEARANCE',
                            status: 'COMPLETED',
                            description: `Pending clearance for booking #${id.substring(0, 8)} (${booking.service.name})`,
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
                    const existing = yield tx.escrow.findFirst({
                        where: { orderId: id, providerId: vendorId },
                    });
                    if (existing) {
                        escrows.push(existing);
                        continue;
                    }
                    const vendorSubtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                    const commissionAmount = vendorSubtotal * commissionRate;
                    const providerAmount = vendorSubtotal - commissionAmount;
                    const escrow = yield tx.escrow.create({
                        data: {
                            orderId: id,
                            providerId: vendorId,
                            amount: vendorSubtotal,
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
                                description: `Pending clearance for order #${id.substring(0, 8)}`,
                                referenceId: id,
                            },
                        });
                    }
                    escrows.push(escrow);
                }
                return escrows;
            }
        }));
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
        }));
    });
}
function triggerSplitWebhook(escrowId) {
    return __awaiter(this, void 0, void 0, function* () {
        const WEBHOOK_SPLIT_SECRET = process.env.WEBHOOK_SPLIT_SECRET || 'local-split-secret-token';
        const port = process.env.PORT || 5000;
        const url = `http://localhost:${port}/api/payments/webhook/split`;
        try {
            yield axios_1.default.post(url, {
                escrowId,
                secretToken: WEBHOOK_SPLIT_SECRET,
            }, { timeout: 5000 });
            console.log(`[SplitWebhook] Split triggered successfully for escrow: ${escrowId}`);
        }
        catch (err) {
            console.warn(`[SplitWebhook] Webhook trigger failed, executing split directly: ${err.message}`);
            // Fallback: execute release directly if webhook fails in local testing/dev
            try {
                yield releaseEscrow(escrowId);
            }
            catch (fallbackErr) {
                console.error(`[SplitWebhookFallbackError] Failed to release escrow directly: ${fallbackErr.message}`);
            }
        }
    });
}
