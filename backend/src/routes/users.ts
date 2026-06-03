import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

/**
 * GET /users
 * Authenticated, ADMIN role only.
 * Returns all users (excluding passwordHash) with a count of bookings
 * where they are the customer, plus a top-level total count.
 *
 * Each user object includes:
 *   id, email, name, role, phone, address, latitude, longitude,
 *   specialty, createdAt, bookingCount
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: admin access only' });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        address: true,
        currentLat: true,
        currentLng: true,
        specialty: true,
        createdAt: true,
        // Count bookings where this user is the customer
        _count: {
          select: {
            bookings: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Shape the response to rename/flatten fields for clarity
    const formatted = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      phone: u.phone ?? null,
      address: u.address ?? null,
      latitude: u.currentLat ?? null,
      longitude: u.currentLng ?? null,
      specialty: u.specialty ?? null,
      createdAt: u.createdAt,
      bookingCount: u._count.bookings,
    }));

    res.json({
      total: formatted.length,
      users: formatted,
    });
  } catch (error) {
    console.error('GET /users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * PATCH /users/location
 * Handyman pushes their current GPS coordinates.
 * Updates currentLat / currentLng on the User record.
 * Called every ~5s by the handyman's app when they have an active booking.
 */
router.patch('/location', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  const role = req.user?.role;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (role !== 'HANDYMAN') {
    return res.status(403).json({ error: 'Only handymen can update live location.' });
  }

  const { latitude, longitude } = req.body;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'latitude and longitude must be numbers.' });
  }

  // Basic sanity check on coordinate ranges
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Coordinates out of valid range.' });
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { currentLat: latitude, currentLng: longitude },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('PATCH /users/location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

export default router;

