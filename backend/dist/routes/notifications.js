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
const MESSAGEABLE_ROLES = ['CUSTOMER', 'VENDOR', 'HANDYMAN', 'RIDER'];
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
                select: { id: true, email: true, phone: true },
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
                select: { id: true, email: true, phone: true },
            });
        }
        else {
            recipients = yield prisma_1.default.user.findMany({
                where: { role: { in: MESSAGEABLE_ROLES } },
                select: { id: true, email: true, phone: true },
            });
        }
        if (recipients.length === 0) {
            return res.status(404).json({ error: 'No matching recipients found' });
        }
        yield (0, notify_1.notifyMany)(recipients.map((r) => {
            var _a, _b;
            return ({
                userId: r.id,
                title: title.trim(),
                body: body.trim(),
                type: 'ADMIN_MESSAGE',
                email: (_a = r.email) !== null && _a !== void 0 ? _a : undefined,
                phone: (_b = r.phone) !== null && _b !== void 0 ? _b : undefined,
                emailSubject: `📢 Message from FixMart Admin: ${title.trim()}`,
            });
        }));
        res.json({ success: true, recipientCount: recipients.length });
    }
    catch (error) {
        console.error('POST /notifications/admin/message error:', error);
        res.status(500).json({ error: 'Failed to send admin message' });
    }
}));
exports.default = router;
