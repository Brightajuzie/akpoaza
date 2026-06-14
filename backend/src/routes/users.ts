import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
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
        opayPhone: true,
        verificationStatus: true,
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
      opayPhone: u.opayPhone ?? null,
      verificationStatus: u.verificationStatus,
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
  if (role !== 'HANDYMAN' && role !== 'RIDER') {
    return res.status(403).json({ error: 'Only handymen and riders can update live location.' });
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

/**
 * POST /users
 * ADMIN only.
 * Creates a new user with hashed password.
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    if (admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: admin access only' });
    }

    const {
      email,
      password,
      name,
      role,
      phone,
      opayPhone,
      specialty,
      address,
      latitude,
      longitude,
      verificationStatus,
    } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: role as any,
        phone: phone || null,
        opayPhone: opayPhone || phone || null,
        specialty: role === 'HANDYMAN' ? specialty : null,
        address: address || null,
        latitude: latitude ? parseFloat(latitude as any) : null,
        longitude: longitude ? parseFloat(longitude as any) : null,
        verificationStatus: verificationStatus || 'UNVERIFIED',
      },
    });

    const { passwordHash: _, ...userResponse } = newUser;
    res.status(201).json(userResponse);
  } catch (error) {
    console.error('POST /users error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * PUT /users/:id
 * ADMIN only.
 * Updates user profile details, including optional password hashing.
 */
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    if (admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: admin access only' });
    }

    const { id } = req.params;
    const {
      email,
      password,
      name,
      role,
      phone,
      opayPhone,
      specialty,
      address,
      latitude,
      longitude,
      verificationStatus,
    } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if new email conflicts with another user
    if (email && email !== existingUser.email) {
      const emailConflict = await prisma.user.findUnique({ where: { email } });
      if (emailConflict) {
        return res.status(400).json({ error: 'Email already in use by another user' });
      }
    }

    let passwordHash = undefined;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(password, salt);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        email: email || undefined,
        passwordHash,
        name: name || undefined,
        role: role ? (role as any) : undefined,
        phone: phone !== undefined ? phone : undefined,
        opayPhone: opayPhone !== undefined ? opayPhone : undefined,
        specialty: specialty !== undefined ? specialty : undefined,
        address: address !== undefined ? address : undefined,
        latitude: latitude !== undefined && latitude !== null ? parseFloat(latitude as any) : undefined,
        longitude: longitude !== undefined && longitude !== null ? parseFloat(longitude as any) : undefined,
        verificationStatus: verificationStatus || undefined,
      },
    });

    const { passwordHash: _, ...userResponse } = updatedUser;
    res.json(userResponse);
  } catch (error) {
    console.error('PUT /users/:id error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /users/:id
 * ADMIN only.
 * Performs a cascading transaction delete of all user-dependent entities to avoid database conflicts.
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.user!;
    if (admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: admin access only' });
    }

    const { id } = req.params;
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Deleting related records safely in transaction order
    await prisma.$transaction([
      prisma.review.deleteMany({ where: { OR: [{ authorId: id }, { handymanId: id }] } }),
      prisma.product.deleteMany({ where: { vendorId: id } }),
      prisma.orderItem.deleteMany({ where: { order: { userId: id } } }),
      prisma.order.deleteMany({ where: { userId: id } }),
      prisma.escrow.deleteMany({ where: { OR: [{ providerId: id }, { booking: { customerId: id } }] } }),
      prisma.booking.deleteMany({ where: { customerId: id } }),
      prisma.booking.updateMany({ where: { handymanId: id }, data: { handymanId: null } }),
      prisma.user.delete({ where: { id } }),
    ]);

    res.json({ success: true, message: 'User and all related records deleted successfully.' });
  } catch (error) {
    console.error('DELETE /users/:id error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;

