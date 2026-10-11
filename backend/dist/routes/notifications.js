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
exports.createNotification = createNotification;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = __importDefault(require("../lib/prisma"));
const notify_1 = require("../lib/notify");
const router = (0, express_1.Router)();
const MESSAGEABLE_ROLES = ['CUSTOMER', 'VENDOR', 'HANDYMAN', 'RIDER', 'AGENT'];
/**
 * Helper function to create a notification.
 * Can be imported and used by other route files.
 */
function createNotification(prismaClient, userId, title, body, type, referenceId) {
    return __awaiter(this, void 0, void 0, function* () {
        return prismaClient.notification.create({
            data: {
                userId,
                title,
                body,
                type,
                referenceId: referenceId !== null && referenceId !== void 0 ? referenceId : null,
            },
        });
    });
}
/**
 * GET /notifications
 * Authenticated — returns notifications for the logged-in user,
 * ordered by createdAt desc, limit 50.
 */
router.get('/', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const notifications = yield prisma_1.default.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        const unreadCount = notifications.filter((n) => !n.read).length;
        res.json({ notifications, unreadCount });
    }
    catch (error) {
        console.error('GET /notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
}));
/**
 * PATCH /notifications/:id/read
 * Authenticated — marks a notification as read.
 * Only the owning user may mark their own notification as read.
 */
router.patch('/:id/read', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        // Verify the notification belongs to the requesting user
        const existing = yield prisma_1.default.notification.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        if (existing.userId !== userId) {
            return res.status(403).json({ error: 'Forbidden: not your notification' });
        }
        const updated = yield prisma_1.default.notification.update({
            where: { id },
            data: { read: true },
        });
        res.json({ notification: updated });
    }
    catch (error) {
        console.error('PATCH /notifications/:id/read error:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
}));
/**
 * POST /notifications
 * Internal use — creates a notification.
 * No auth guard, but requires a valid userId in the request body.
 * Body: { userId, title, body, type, referenceId? }
 */
router.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, title, body, type, referenceId } = req.body;
        if (!userId || !title || !body || !type) {
            return res.status(400).json({
                error: 'Missing required fields: userId, title, body, type',
            });
        }
        const notification = yield createNotification(prisma_1.default, userId, title, body, type, referenceId);
        res.status(201).json({ notification });
    }
    catch (error) {
        console.error('POST /notifications error:', error);
        res.status(500).json({ error: 'Failed to create notification' });
    }
}));
/**
 * POST /notifications/admin/message
 * Authenticated, ADMIN role only.
 * Lets an admin message a single user, every user of a given role, or
 * every customer/vendor/artisan(handyman)/rider at once. Delivered via the
 * existing in-app + email + SMS notification pipeline (type: ADMIN_MESSAGE).
 *
 * Body: { title, body, target: 'USER' | 'ROLE' | 'ALL', role?, userId? }
 */
router.post('/admin/message', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const admin = req.user;
        if (admin.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden: admin access only' });
        }
        const { title, body, target, role, userId } = req.body;
        if (!title || typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ error: 'Message title is required' });
        }
        if (!body || typeof body !== 'string' || !body.trim()) {
            return res.status(400).json({ error: 'Message body is required' });
        }
        if (!['USER', 'ROLE', 'ALL'].includes(target)) {
            return res.status(400).json({ error: 'target must be USER, ROLE, or ALL' });
        }
        let recipients;
        if (target === 'USER') {
            if (!userId || typeof userId !== 'string') {
                return res.status(400).json({ error: 'userId is required when target is USER' });
            }
            const user = yield prisma_1.default.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, phone: true, pushToken: true },
            });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            recipients = [user];
        }
        else if (target === 'ROLE') {
            if (!MESSAGEABLE_ROLES.includes(role)) {
                return res.status(400).json({ error: `role must be one of ${MESSAGEABLE_ROLES.join(', ')}` });
            }
            recipients = yield prisma_1.default.user.findMany({
                where: { role: role },
                select: { id: true, email: true, phone: true, pushToken: true },
            });
        }
        else {
            recipients = yield prisma_1.default.user.findMany({
                where: { role: { in: MESSAGEABLE_ROLES } },
                select: { id: true, email: true, phone: true, pushToken: true },
            });
        }
        if (recipients.length === 0) {
            return res.status(404).json({ error: 'No matching recipients found' });
        }
        const emailHtml = `
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:20px;margin:18px 0">
        <p style="margin:0 0 10px 0;font-size:16px;font-weight:700;color:#166534">📢 Message from FixMart Management</p>
        <p style="margin:0;font-size:15px;color:#1F2937;line-height:1.6">${body.trim().replace(/\n/g, '<br>')}</p>
      </div>
      <p style="font-size:13px;color:#6B7280;line-height:1.5">
        This notification has also been delivered to your FixMart Mobile App alerts and active dashboard.
      </p>
    `;
        yield (0, notify_1.notifyMany)(recipients.map((r) => {
            var _a, _b, _c;
            return ({
                userId: r.id,
                title: title.trim(),
                body: body.trim(),
                type: 'ADMIN_MESSAGE',
                email: (_a = r.email) !== null && _a !== void 0 ? _a : undefined,
                phone: (_b = r.phone) !== null && _b !== void 0 ? _b : undefined,
                pushToken: (_c = r.pushToken) !== null && _c !== void 0 ? _c : undefined,
                emailSubject: `📢 FixMart Notification: ${title.trim()}`,
                emailHtml,
            });
        }));
        // Also notify the admin who dispatched it so it shows in their dashboard & alerts
        const targetDesc = target === 'ALL' ? 'All Users' : target === 'ROLE' ? `All ${role}s` : (recipients[0].email || '1 user');
        yield prisma_1.default.notification.create({
            data: {
                userId: admin.userId,
                title: `✅ Dispatched: ${title.trim()}`,
                body: `Broadcast delivered to ${recipients.length} user(s) (${targetDesc}). Channels: In-App, Push Notifications, Email, SMS.`,
                type: 'ADMIN_MESSAGE',
            },
        }).catch((e) => console.error('[admin/message] Admin self-notify error:', e));
        const stats = {
            total: recipients.length,
            inApp: recipients.length,
            emailQueued: recipients.filter((r) => !!r.email).length,
            smsQueued: recipients.filter((r) => !!r.phone).length,
            pushQueued: recipients.filter((r) => !!r.pushToken).length,
        };
        res.json({
            success: true,
            recipientCount: recipients.length,
            stats,
            message: `Message dispatched successfully to ${recipients.length} recipient(s). In-app: ${stats.inApp}, Emails: ${stats.emailQueued}, SMS: ${stats.smsQueued}, Phone Push: ${stats.pushQueued}.`,
        });
    }
    catch (error) {
        console.error('POST /notifications/admin/message error:', error);
        res.status(500).json({ error: 'Failed to send admin message' });
    }
}));
/**
 * GET /notifications/admin/campaigns/templates
 * Authenticated, ADMIN only.
 * Returns preset message campaigns with rich content for all channels.
 */
router.get('/admin/campaigns/templates', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const admin = req.user;
        if (admin.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden: admin access only' });
        }
        const templates = [
            {
                id: 'WELCOME',
                name: '🎉 Welcome & Onboarding Guide',
                category: 'Registration',
                defaultTitle: '🎉 Welcome to FixMart — Your Account is Ready!',
                defaultBody: 'Welcome to FixMart! Explore verified artisans, genuine hardware supplies, and express parcel delivery. Your payments are 100% safeguarded by FixMart Escrow.',
                target: 'ALL',
                recommendedRole: 'ALL',
                channels: ['In-App Bell', 'Push Notification', 'HTML Email', 'SMS'],
            },
            {
                id: 'FIRST_WEEK',
                name: '🗓️ First Week of the Month Message',
                category: 'Monthly Engagement',
                defaultTitle: '🗓️ New Month, Fresh Starts with FixMart!',
                defaultBody: 'Happy New Month! Kick off the first week of the month with proactive home maintenance, restock workshop materials, and explore new verified artisans on FixMart.',
                target: 'ALL',
                recommendedRole: 'ALL',
                channels: ['In-App Bell', 'Push Notification', 'HTML Email', 'SMS'],
            },
            {
                id: 'WEEKEND',
                name: '⚡ Weekend Special & Emergency Repairs',
                category: 'Weekly Engagement',
                defaultTitle: '⚡ FixMart Weekend Alert: Relax While We Fix It!',
                defaultBody: 'Happy Weekend! Don\'t let pending household repairs spoil your break. Our verified plumbers, electricians, and technicians are on standby while you unwind.',
                target: 'ALL',
                recommendedRole: 'ALL',
                channels: ['In-App Bell', 'Push Notification', 'HTML Email', 'SMS'],
            },
            {
                id: 'INCOMPLETE_REG',
                name: '⚠️ Incomplete Registration Nudge',
                category: 'Account & KYC',
                defaultTitle: '⚠️ Action Required: Complete Your FixMart Profile',
                defaultBody: 'Your FixMart profile is missing key details (phone, delivery address, or KYC verification). Complete your profile now to unlock escrow payouts and verified badges.',
                target: 'INCOMPLETE',
                recommendedRole: 'ALL',
                channels: ['In-App Bell', 'Push Notification', 'HTML Email', 'SMS'],
            },
            {
                id: 'NON_UPLOAD',
                name: '📦 Non-Upload of Products & Services',
                category: 'Merchant Activation',
                defaultTitle: '📦 Start Selling: Upload Your Products & Services on FixMart!',
                defaultBody: 'Your storefront currently has 0 active listings! Upload your products and services today to get discovered by nearby customers and start earning daily income.',
                target: 'NON_UPLOAD',
                recommendedRole: 'VENDOR',
                channels: ['In-App Bell', 'Push Notification', 'HTML Email', 'SMS'],
            },
            {
                id: 'USER_GUIDE',
                name: '📘 Complete User Guide & Step-by-Step Prompts',
                category: 'Education & Trust',
                defaultTitle: '📘 FixMart Complete User Guide & Essential Tips',
                defaultBody: 'Master FixMart in minutes! Learn how to hire verified artisans, order genuine hardware tools, track deliveries live, and protect every payment with escrow.',
                target: 'ALL',
                recommendedRole: 'ALL',
                channels: ['In-App Bell', 'Push Notification', 'HTML Email', 'SMS'],
            },
        ];
        res.json({ templates });
    }
    catch (error) {
        console.error('GET /notifications/admin/campaigns/templates error:', error);
        res.status(500).json({ error: 'Failed to fetch campaign templates' });
    }
}));
/**
 * POST /notifications/admin/campaigns/dispatch
 * Authenticated, ADMIN only.
 * Dispatches a preset campaign across In-App, Push, Email, and SMS.
 * Body: { campaignId, target?: 'ALL' | 'ROLE' | 'USER' | 'INCOMPLETE' | 'NON_UPLOAD', role?, userId?, customTitle?, customBody? }
 */
router.post('/admin/campaigns/dispatch', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const admin = req.user;
        if (admin.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden: admin access only' });
        }
        const { campaignId, target = 'ALL', role, userId } = req.body;
        if (!campaignId) {
            return res.status(400).json({ error: 'campaignId is required' });
        }
        let recipients = [];
        if (target === 'USER') {
            if (!userId)
                return res.status(400).json({ error: 'userId is required when target is USER' });
            const u = yield prisma_1.default.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true, email: true, phone: true, pushToken: true, role: true, verificationStatus: true, specialty: true, address: true },
            });
            if (!u)
                return res.status(404).json({ error: 'Target user not found' });
            recipients = [u];
        }
        else if (target === 'INCOMPLETE') {
            // Find users with missing phone, address, or unverified status
            recipients = yield prisma_1.default.user.findMany({
                where: {
                    OR: [
                        { phone: null },
                        { phone: '' },
                        { address: null },
                        { address: '' },
                        { verificationStatus: { in: ['UNVERIFIED', 'REJECTED'] } },
                    ],
                },
                select: { id: true, name: true, email: true, phone: true, pushToken: true, role: true, verificationStatus: true, specialty: true, address: true },
            });
        }
        else if (target === 'NON_UPLOAD') {
            // Find vendors with 0 products or handymen with 0 bookings/jobs
            recipients = yield prisma_1.default.user.findMany({
                where: {
                    OR: [
                        { role: 'VENDOR', products: { none: {} } },
                        { role: 'HANDYMAN', specialty: null },
                    ],
                },
                select: { id: true, name: true, email: true, phone: true, pushToken: true, role: true, verificationStatus: true, specialty: true, address: true },
            });
        }
        else if (target === 'ROLE') {
            if (!role || !MESSAGEABLE_ROLES.includes(role)) {
                return res.status(400).json({ error: `role must be one of ${MESSAGEABLE_ROLES.join(', ')}` });
            }
            recipients = yield prisma_1.default.user.findMany({
                where: { role: role },
                select: { id: true, name: true, email: true, phone: true, pushToken: true, role: true, verificationStatus: true, specialty: true, address: true },
            });
        }
        else {
            recipients = yield prisma_1.default.user.findMany({
                where: { role: { in: MESSAGEABLE_ROLES } },
                select: { id: true, name: true, email: true, phone: true, pushToken: true, role: true, verificationStatus: true, specialty: true, address: true },
            });
        }
        if (recipients.length === 0) {
            return res.status(404).json({ error: 'No matching recipients found for this target criteria' });
        }
        // Dispatch corresponding campaign
        yield Promise.allSettled(recipients.map((r) => {
            switch (campaignId) {
                case 'FIRST_WEEK':
                    return (0, notify_1.sendFirstWeekOfMonthNotification)(r);
                case 'WEEKEND':
                    return (0, notify_1.sendWeekendNotification)(r);
                case 'INCOMPLETE_REG': {
                    const missing = [];
                    if (!r.phone)
                        missing.push('Phone Number');
                    if (!r.address)
                        missing.push('Delivery Address');
                    if (r.verificationStatus !== 'VERIFIED')
                        missing.push('KYC Verification');
                    return (0, notify_1.sendIncompleteRegistrationNotification)(Object.assign(Object.assign({}, r), { missingFields: missing }));
                }
                case 'NON_UPLOAD':
                    return (0, notify_1.sendNonUploadNotification)(r);
                case 'USER_GUIDE':
                    return (0, notify_1.sendUserGuideNotification)(r);
                case 'WELCOME':
                    return (0, notify_1.sendWelcomeNotification)({
                        id: r.id,
                        name: r.name,
                        email: r.email || '',
                        role: r.role,
                        phone: r.phone,
                        pushToken: r.pushToken,
                        verificationStatus: r.verificationStatus,
                        specialty: r.specialty,
                    });
                default:
                    return (0, notify_1.sendUserGuideNotification)(r);
            }
        }));
        const stats = {
            total: recipients.length,
            inApp: recipients.length,
            emailQueued: recipients.filter((r) => !!r.email).length,
            smsQueued: recipients.filter((r) => !!r.phone).length,
            pushQueued: recipients.filter((r) => !!r.pushToken).length,
        };
        // Self-notify the admin
        yield prisma_1.default.notification.create({
            data: {
                userId: admin.userId,
                title: `✅ Campaign Sent: ${campaignId}`,
                body: `Multi-channel campaign dispatched to ${recipients.length} user(s). In-App: ${stats.inApp}, Emails: ${stats.emailQueued}, Push: ${stats.pushQueued}, SMS: ${stats.smsQueued}.`,
                type: 'ADMIN_MESSAGE',
            },
        }).catch(() => { });
        res.json({
            success: true,
            campaignId,
            recipientCount: recipients.length,
            stats,
            message: `Campaign "${campaignId}" dispatched to ${recipients.length} recipient(s) across all active channels!`,
        });
    }
    catch (error) {
        console.error('POST /notifications/admin/campaigns/dispatch error:', error);
        res.status(500).json({ error: 'Failed to dispatch campaign' });
    }
}));
exports.default = router;
