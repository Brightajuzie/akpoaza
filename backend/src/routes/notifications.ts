import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

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

export default router;
