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
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const notifications_1 = require("./notifications");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
// Dojah Credentials (defaults to mock/sandbox mode if not defined in .env)
const DOJAH_APP_ID = process.env.DOJAH_APP_ID;
const DOJAH_SECRET_KEY = process.env.DOJAH_SECRET_KEY;
const DOJAH_BASE_URL = process.env.DOJAH_BASE_URL || 'https://api.dojah.io';
const IS_SANDBOX = !DOJAH_APP_ID || !DOJAH_SECRET_KEY || process.env.DOJAH_SANDBOX === 'true';
// Helper to deterministically hash BVN to check for duplicates without storing raw data
const hashBVN = (bvn) => {
    return crypto_1.default.createHash('sha256').update(bvn).digest('hex');
};
/**
 * GET /api/kyc/status
 * Get the KYC status for the authenticated user
 */
router.get('/status', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const user = yield prisma_1.default.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                verificationStatus: true,
                kycReferenceId: true,
                kycSubmittedAt: true,
                opayPhone: true,
                rejectionReason: true,
            },
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        console.error('GET /kyc/status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
/**
 * POST /api/kyc/bvn
 * Validate BVN via Dojah API or Sandbox Simulator
 * Body: { bvn: string, consent: boolean }
 */
router.post('/bvn', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const userId = req.user.userId;
    const { bvn, consent } = req.body;
    if (!consent) {
        return res.status(400).json({ error: 'User consent is mandatory for BVN verification' });
    }
    if (!bvn || bvn.length !== 11 || !/^\d+$/.test(bvn)) {
        return res.status(400).json({ error: 'Invalid BVN. Must be exactly 11 digits.' });
    }
    try {
        const hashed = hashBVN(bvn);
        // Prevent duplicate BVN usage
        const duplicate = yield prisma_1.default.user.findFirst({
            where: {
                bvnHash: hashed,
                verificationStatus: 'VERIFIED',
                NOT: { id: userId },
            },
        });
        if (duplicate) {
            return res.status(400).json({ error: 'This BVN is already verified by another account' });
        }
        // Call Dojah or Mock
        if (IS_SANDBOX) {
            console.log(`[KYC Sandbox] Mock BVN verification for User: ${userId}, BVN: ${bvn}`);
            // Retrieve the current user's name to simulate a match
            const currentUser = yield prisma_1.default.user.findUnique({ where: { id: userId } });
            // Mock data match
            return res.json({
                success: true,
                message: 'BVN verified successfully (Sandbox Mock)',
                data: {
                    bvn,
                    first_name: (currentUser === null || currentUser === void 0 ? void 0 : currentUser.name.split(' ')[0]) || 'John',
                    last_name: (currentUser === null || currentUser === void 0 ? void 0 : currentUser.name.split(' ')[1]) || 'Doe',
                    dob: '1990-01-01',
                    formatted_name: (currentUser === null || currentUser === void 0 ? void 0 : currentUser.name) || 'John Doe',
                    match_score: 98,
                },
            });
        }
        // Live Dojah Request
        try {
            const response = yield axios_1.default.post(`${DOJAH_BASE_URL}/api/v1/kyc/bvn`, { bvn }, {
                timeout: 10000, // 10 s – prevents backend hang when Dojah is unreachable
                headers: {
                    'Authorization': DOJAH_SECRET_KEY,
                    'AppId': DOJAH_APP_ID,
                    'Content-Type': 'application/json',
                },
            });
            const dojahData = (_a = response.data) === null || _a === void 0 ? void 0 : _a.entity;
            if (!dojahData) {
                return res.status(400).json({ error: 'BVN could not be verified with the provider.' });
            }
            // Check match score if returned, or construct success
            return res.json({
                success: true,
                message: 'BVN verified successfully',
                data: {
                    bvn: dojahData.bvn,
                    first_name: dojahData.first_name,
                    last_name: dojahData.last_name,
                    dob: dojahData.dob,
                    formatted_name: `${dojahData.first_name} ${dojahData.last_name}`,
                    match_score: dojahData.match_score || 100,
                },
            });
        }
        catch (apiError) {
            console.error('Dojah BVN API Error:', ((_b = apiError === null || apiError === void 0 ? void 0 : apiError.response) === null || _b === void 0 ? void 0 : _b.data) || apiError.message);
            return res.status(400).json({
                error: ((_d = (_c = apiError === null || apiError === void 0 ? void 0 : apiError.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.error) || 'Verification failed on Dojah server.',
            });
        }
    }
    catch (error) {
        console.error('POST /kyc/bvn error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
/**
 * POST /api/kyc/nin
 * Validate National Identity Number (NIN)
 * Body: { nin: string }
 */
router.post('/nin', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const userId = req.user.userId;
    const { nin } = req.body;
    if (!nin || nin.length !== 11 || !/^\d+$/.test(nin)) {
        return res.status(400).json({ error: 'Invalid NIN. Must be exactly 11 digits.' });
    }
    try {
        if (IS_SANDBOX) {
            console.log(`[KYC Sandbox] Mock NIN verification for User: ${userId}, NIN: ${nin}`);
            return res.json({
                success: true,
                message: 'NIN verified successfully (Sandbox Mock)',
                data: {
                    nin,
                    match_score: 100,
                },
            });
        }
        try {
            const response = yield axios_1.default.post(`${DOJAH_BASE_URL}/api/v1/kyc/nin`, { nin }, {
                timeout: 10000,
                headers: {
                    'Authorization': DOJAH_SECRET_KEY,
                    'AppId': DOJAH_APP_ID,
                    'Content-Type': 'application/json',
                },
            });
            const dojahData = (_a = response.data) === null || _a === void 0 ? void 0 : _a.entity;
            if (!dojahData) {
                return res.status(400).json({ error: 'NIN could not be verified with the provider.' });
            }
            return res.json({
                success: true,
                message: 'NIN verified successfully',
                data: dojahData,
            });
        }
        catch (apiError) {
            console.error('Dojah NIN API Error:', ((_b = apiError === null || apiError === void 0 ? void 0 : apiError.response) === null || _b === void 0 ? void 0 : _b.data) || apiError.message);
            return res.status(400).json({
                error: ((_d = (_c = apiError === null || apiError === void 0 ? void 0 : apiError.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.error) || 'NIN verification failed.',
            });
        }
    }
    catch (error) {
        console.error('POST /kyc/nin error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
/**
 * POST /api/kyc/liveness
 * Verify selfie liveness check
 * Body: { referenceId: string }
 */
router.post('/liveness', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const userId = req.user.userId;
    const { referenceId } = req.body;
    if (!referenceId) {
        return res.status(400).json({ error: 'Missing reference ID from SDK widget.' });
    }
    try {
        if (IS_SANDBOX) {
            console.log(`[KYC Sandbox] Mock Liveness check for reference ID: ${referenceId}`);
            return res.json({
                success: true,
                message: 'Selfie matching passed (Sandbox Mock)',
                confidence: 0.98,
            });
        }
        try {
            // Fetch selfie verify status from Dojah
            const response = yield axios_1.default.get(`${DOJAH_BASE_URL}/api/v1/kyc/liveness/verify?reference=${referenceId}`, {
                timeout: 10000,
                headers: {
                    'Authorization': DOJAH_SECRET_KEY,
                    'AppId': DOJAH_APP_ID,
                },
            });
            const entity = (_a = response.data) === null || _a === void 0 ? void 0 : _a.entity;
            if (!entity || !entity.verified) {
                return res.status(400).json({ error: 'Liveness/Selfie check failed verification.' });
            }
            return res.json({
                success: true,
                message: 'Selfie matching passed',
                confidence: entity.confidence || 1.0,
            });
        }
        catch (apiError) {
            console.error('Dojah Liveness Check API Error:', ((_b = apiError === null || apiError === void 0 ? void 0 : apiError.response) === null || _b === void 0 ? void 0 : _b.data) || apiError.message);
            return res.status(400).json({
                error: ((_d = (_c = apiError === null || apiError === void 0 ? void 0 : apiError.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.error) || 'Liveness check verification failed.',
            });
        }
    }
    catch (error) {
        console.error('POST /kyc/liveness error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
/**
 * POST /api/kyc/submit
 * Finalize the KYC submission. Transition status to PENDING_REVIEW or auto-approve
 * Body: { bvn?: string, nin?: string, opayPhone: string, referenceId?: string }
 */
router.post('/submit', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.userId;
    const { bvn, nin, opayPhone, referenceId } = req.body;
    if (!bvn && !nin) {
        return res.status(400).json({ error: 'Either BVN or NIN is required to complete verification.' });
    }
    if (!opayPhone) {
        return res.status(400).json({ error: 'OPay phone number is required for wallet payout configuration.' });
    }
    try {
        const docValue = bvn || nin;
        const hashed = hashBVN(docValue);
        // Prevent duplicate BVN/NIN usage
        const duplicate = yield prisma_1.default.user.findFirst({
            where: {
                bvnHash: hashed,
                verificationStatus: 'VERIFIED',
                NOT: { id: userId },
            },
        });
        if (duplicate) {
            return res.status(400).json({ error: 'This identity document is already verified by another account' });
        }
        // Save submission data and set status to PENDING_REVIEW
        const updatedUser = yield prisma_1.default.user.update({
            where: { id: userId },
            data: {
                verificationStatus: 'PENDING_REVIEW',
                bvnHash: hashed,
                kycReferenceId: referenceId || `MOCK_REF_${Date.now()}`,
                kycSubmittedAt: new Date(),
                opayPhone: opayPhone,
                rejectionReason: null, // Clear any previous rejection
            },
        });
        // Notify Admins about new KYC pending review
        const admins = yield prisma_1.default.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true },
        });
        for (const admin of admins) {
            yield (0, notifications_1.createNotification)(prisma_1.default, admin.id, '🔍 New KYC Submission Pending', `User ${updatedUser.name} (${updatedUser.role}) submitted verification details.`, 'SYSTEM', updatedUser.id);
        }
        res.json({
            success: true,
            message: 'KYC submitted successfully. Pending Admin review.',
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                verificationStatus: updatedUser.verificationStatus,
            },
        });
    }
    catch (error) {
        console.error('POST /kyc/submit error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
/**
 * GET /api/kyc/admin/reviews
 * Admin-only: list all pending, verified, or rejected submissions
 */
router.get('/admin/reviews', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const adminUser = yield prisma_1.default.user.findUnique({ where: { id: userId } });
        if (!adminUser || adminUser.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden: Admin access required.' });
        }
        const reviews = yield prisma_1.default.user.findMany({
            where: {
                role: { in: ['VENDOR', 'HANDYMAN'] },
                verificationStatus: { not: 'UNVERIFIED' },
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                verificationStatus: true,
                kycSubmittedAt: true,
                opayPhone: true,
                kycReferenceId: true,
                rejectionReason: true,
                phone: true,
            },
            orderBy: { kycSubmittedAt: 'desc' },
        });
        res.json({ reviews });
    }
    catch (error) {
        console.error('GET /kyc/admin/reviews error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
/**
 * PATCH /api/kyc/:userId/review
 * Admin-only: approve or reject user verification
 * Body: { status: 'VERIFIED' | 'REJECTED', reason?: string }
 */
router.patch('/:userId/review', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const adminId = req.user.userId;
    const targetUserId = req.params.userId;
    const { status, reason } = req.body;
    if (status !== 'VERIFIED' && status !== 'REJECTED') {
        return res.status(400).json({ error: 'Invalid verification status decision. Must be VERIFIED or REJECTED.' });
    }
    try {
        const adminUser = yield prisma_1.default.user.findUnique({ where: { id: adminId } });
        if (!adminUser || adminUser.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden: Admin access required.' });
        }
        const targetUser = yield prisma_1.default.user.findUnique({ where: { id: targetUserId } });
        if (!targetUser) {
            return res.status(404).json({ error: 'Target user not found.' });
        }
        const updatedUser = yield prisma_1.default.user.update({
            where: { id: targetUserId },
            data: {
                verificationStatus: status,
                rejectionReason: status === 'REJECTED' ? reason || 'Details did not match public database records.' : null,
            },
        });
        // Notify User
        const title = status === 'VERIFIED' ? '✅ Verification Approved!' : '❌ Verification Rejected';
        const body = status === 'VERIFIED'
            ? 'Congratulations, your identity has been verified! You can now accept jobs and list products.'
            : `Your verification request was rejected. Reason: ${reason || 'Invalid documents.'} Please update and re-submit.`;
        yield (0, notifications_1.createNotification)(prisma_1.default, targetUserId, title, body, 'SYSTEM', adminId);
        res.json({
            success: true,
            message: `KYC review submitted successfully. User status updated to ${status}.`,
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                verificationStatus: updatedUser.verificationStatus,
            },
        });
    }
    catch (error) {
        console.error('PATCH /kyc/:userId/review error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
exports.default = router;
