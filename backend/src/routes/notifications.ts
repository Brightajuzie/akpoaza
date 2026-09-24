import { Router, Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { notifyMany } from '../lib/notify';

const router = Router();

const MESSAGEABLE_ROLES: Role[] = ['CUSTOMER', 'VENDOR', 'HANDYMAN', 'RIDER'];

/**
 * Helper function to create a notification.
 * Can be imported and used by other route files.
 */
export async function createNotification(
  prismaClient: PrismaClient,
  userId: string,
  title: string,
  body: string,
  type: string,
  referenceId?: string
) {
  return prismaClient.notification.create({
    data: {
      userId,
      title,
      body,
      type,
      referenceId: referenceId ?? null,
    },
  });
}

/**
 * GET /notifications
 * Authenticated — returns notifications for the logged-in user,
 * ordered by createdAt desc, limit 50.
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const unreadCount = notifications.filter((n) => !n.read).length;
    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('GET /notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * PATCH /notifications/:id/read
 * Authenticated — marks a notification as read.
 * Only the owning user may mark their own notification as read.
 */
router.patch('/:id/read', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    // Verify the notification belongs to the requesting user
    const existing = await prisma.notification.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden: not your notification' });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    res.json({ notification: updated });
  } catch (error) {
    console.error('PATCH /notifications/:id/read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * POST /notifications
 * Internal use — creates a notification.
 * No auth guard, but requires a valid userId in the request body.
 * Body: { userId, title, body, type, referenceId? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, title, body, type, referenceId } = req.body;

    if (!userId || !title || !body || !type) {
      return res.status(400).json({
        error: 'Missing required fields: userId, title, body, type',
      });
    }

    const notification = await createNotification(
      prisma,
      userId,
      title,
      body,
      type,
      referenceId
    );

    res.status(201).json({ notification });
  } catch (error) {
    console.error('POST /notifications error:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

/**
 * POST /notifications/admin/message
 * Authenticated, ADMIN role only.
 * Lets an admin message a single user, every user of a given role, or
 * every customer/vendor/artisan(handyman)/rider at once. Delivered via the
 * existing in-app + email + SMS notification pipeline (type: ADMIN_MESSAGE).
 *
 * Body: { title, body, target: 'USER' | 'ROLE' | 'ALL', role?, userId? }
 */
router.post('/admin/message', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
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

    let recipients: { id: string; email: string | null; phone: string | null }[];

    if (target === 'USER') {
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'userId is required when target is USER' });
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, phone: true },
      });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      recipients = [user];
    } else if (target === 'ROLE') {
      if (!MESSAGEABLE_ROLES.includes(role)) {
        return res.status(400).json({ error: `role must be one of ${MESSAGEABLE_ROLES.join(', ')}` });
      }
      recipients = await prisma.user.findMany({
        where: { role: role as Role },
        select: { id: true, email: true, phone: true },
      });
    } else {
      recipients = await prisma.user.findMany({
        where: { role: { in: MESSAGEABLE_ROLES } },
        select: { id: true, email: true, phone: true },
      });
    }

    if (recipients.length === 0) {
      return res.status(404).json({ error: 'No matching recipients found' });
    }

    await notifyMany(
      recipients.map((r) => ({
        userId: r.id,
        title: title.trim(),
        body: body.trim(),
        type: 'ADMIN_MESSAGE' as const,
        email: r.email ?? undefined,
        phone: r.phone ?? undefined,
        emailSubject: `📢 Message from FixMart Admin: ${title.trim()}`,
      }))
    );

    res.json({ success: true, recipientCount: recipients.length });
  } catch (error) {
    console.error('POST /notifications/admin/message error:', error);
    res.status(500).json({ error: 'Failed to send admin message' });
  }
});

export default router;
