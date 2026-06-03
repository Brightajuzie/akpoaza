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
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = __importDefault(require("../lib/prisma"));
const wallet_1 = require("../lib/wallet");
const router = (0, express_1.Router)();
// Retrieve wallet balance, pending balance, and history
router.get('/balance', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const user = yield prisma_1.default.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const wallet = yield (0, wallet_1.getOrCreateWallet)(userId);
        // Fetch transaction history
        const transactions = yield prisma_1.default.transaction.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        // Fetch withdrawal history
        const withdrawals = yield prisma_1.default.withdrawal.findMany({
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
    }
    catch (error) {
        next(error);
    }
}));
// Request withdrawal from virtual wallet to local bank
router.post('/withdraw', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const { amount, instant, accountNumber, bankName, bankCode } = req.body;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    if (!amount || amount <= 0)
        return res.status(400).json({ error: 'Valid withdrawal amount is required.' });
    if (!accountNumber || !bankName)
        return res.status(400).json({ error: 'Account number and bank name are required.' });
    try {
        const user = yield prisma_1.default.user.findUnique({
            where: { id: userId },
            select: { verificationStatus: true, role: true }
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        // KYC Check: Provider must be verified to withdraw
        if (user.role === 'HANDYMAN' || user.role === 'VENDOR') {
            if (user.verificationStatus !== 'VERIFIED') {
                return res.status(400).json({ error: 'Identity verification (KYC) required to withdraw funds.' });
            }
        }
        const wallet = yield (0, wallet_1.getOrCreateWallet)(userId);
        if (wallet.balance < amount) {
            return res.status(400).json({ error: 'Insufficient cleared balance.' });
        }
        const isInstant = !!instant;
        const fee = isInstant ? 100.0 : 0.0;
        const netAmount = amount - fee;
        if (netAmount <= 0) {
            return res.status(400).json({ error: `Withdrawal amount must exceed the transaction fee of ₦${fee}.` });
        }
        const result = yield prisma_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // 1. Deduct funds from balance
            const updatedWallet = yield tx.wallet.update({
                where: { id: wallet.id },
                data: {
                    balance: {
                        decrement: amount,
                    },
                },
            });
            // 2. Create withdrawal record
            const withdrawal = yield tx.withdrawal.create({
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
            yield tx.transaction.create({
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
        }));
        res.json({
            success: true,
            message: isInstant ? 'Instant withdrawal completed.' : 'Withdrawal queued for batch settlement.',
            withdrawal: result.withdrawal,
            balance: result.updatedWallet.balance,
        });
    }
    catch (error) {
        next(error);
    }
}));
// Admin: Manual trigger to process batch withdrawals (simulates T+1 overnight settlement)
router.post('/admin/process-batch-payouts', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    try {
        const pendingWithdrawals = yield prisma_1.default.withdrawal.findMany({
            where: { status: 'PENDING' }
        });
        if (pendingWithdrawals.length === 0) {
            return res.json({ success: true, count: 0, message: 'No pending standard withdrawals to process.' });
        }
        const processedIds = pendingWithdrawals.map(w => w.id);
        yield prisma_1.default.$transaction([
            prisma_1.default.withdrawal.updateMany({
                where: { id: { in: processedIds } },
                data: { status: 'COMPLETED' }
            }),
            prisma_1.default.transaction.updateMany({
                where: { referenceId: { in: processedIds }, type: 'WITHDRAWAL' },
                data: { status: 'COMPLETED' }
            })
        ]);
        res.json({
            success: true,
            count: processedIds.length,
            message: `Successfully processed ${processedIds.length} standard withdrawals.`,
        });
    }
    catch (error) {
        next(error);
    }
}));
exports.default = router;
