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
const notify_1 = require("../lib/notify");
const router = (0, express_1.Router)();
// Get all settings as a key-value object
// If accessed by an Admin, all settings (including credentials) are returned.
// If public, sensitive passwords/secret keys are stripped for security.
router.get('/', auth_1.optionalAuthenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const settings = yield prisma_1.default.appSetting.findMany();
        const settingsObj = settings.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});
        const isAdmin = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'ADMIN';
        if (!isAdmin) {
            delete settingsObj['smtp_pass'];
            delete settingsObj['stripe_secret_key'];
            delete settingsObj['stripe_webhook_secret'];
            delete settingsObj['paystack_secret_key'];
            delete settingsObj['flutterwave_secret_key'];
            delete settingsObj['opay_secret_key'];
        }
        res.json(settingsObj);
    }
    catch (error) {
        next(error);
    }
}));
// Update settings (Admin only)
router.put('/', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const updates = req.body; // Expecting { key: value, key2: value2 }
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        return res.status(400).json({ error: 'Invalid settings payload. Expected a key-value object.' });
    }
    try {
        const prismaTxCalls = Object.entries(updates).map(([key, value]) => {
            return prisma_1.default.appSetting.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) },
            });
        });
        yield prisma_1.default.$transaction(prismaTxCalls);
        // Invalidate cached SMTP transport so new email settings take effect immediately
        (0, notify_1.resetMailer)();
        res.json({ message: 'Settings updated successfully', settings: updates });
    }
    catch (error) {
        next(error);
    }
}));
// Send a test email (Admin only)
router.post('/test-email', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    let { recipientEmail } = req.body;
    if (!recipientEmail) {
        // If not provided, try to use the current admin's email
        if ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId) {
            const adminUser = yield prisma_1.default.user.findUnique({
                where: { id: req.user.userId },
                select: { email: true },
            });
            recipientEmail = adminUser === null || adminUser === void 0 ? void 0 : adminUser.email;
        }
    }
    if (!recipientEmail) {
        return res.status(400).json({ error: 'Recipient email is required for the test email.' });
    }
    try {
        const result = yield (0, notify_1.sendTestEmail)(recipientEmail);
        res.json(result);
    }
    catch (err) {
        console.error('[test-email] Failed to send test email:', err);
        res.status(400).json({
            error: (err === null || err === void 0 ? void 0 : err.message) || 'Failed to send test email. Please verify your SMTP settings and app password.',
        });
    }
}));
exports.default = router;
