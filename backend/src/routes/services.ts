import { Router, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

// Get all handyman services, with optional search filtering
router.get('/', async (req, res, next) => {
  const { search } = req.query;
  try {
    let whereClause: any = {};
    if (search) {
      const searchStr = String(search);
      whereClause.OR = [
        { name: { contains: searchStr, mode: 'insensitive' } },
        { description: { contains: searchStr, mode: 'insensitive' } },
        { category: { contains: searchStr, mode: 'insensitive' } },
      ];
    }
    const services = await prisma.service.findMany({
      where: whereClause,
      orderBy: [
        { featured: 'desc' },
        { name: 'asc' },
      ],
    });
    res.json(services);
  } catch (error) {
    next(error);
  }
});

// Get a single service by ID
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  try {
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json(service);
  } catch (error) {
    next(error);
  }
});

// Create a new handyman service (Admin only)
router.post('/', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  const { name, description, category, basePrice, imageUrl } = req.body;
  if (!name || !description || !category || basePrice === undefined) {
    return res.status(400).json({ error: 'Missing required fields (name, description, category, basePrice)' });
  }

  try {
    const newService = await prisma.service.create({
      data: {
        name,
        description,
        category,
        basePrice: parseFloat(basePrice),
        imageUrl: imageUrl ? String(imageUrl).trim() : null,
      },
    });
    res.status(201).json(newService);
  } catch (error) {
    next(error);
  }
});

// Update a handyman service (Admin only)
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  const { id } = req.params;
  const { name, description, category, basePrice, imageUrl } = req.body;

  try {
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const updatedService = await prisma.service.update({
      where: { id },
      data: {
        name,
        description,
        category,
        basePrice: basePrice !== undefined ? parseFloat(basePrice) : undefined,
        imageUrl: imageUrl !== undefined ? (imageUrl ? String(imageUrl).trim() : null) : undefined,
      },
    });
    res.json(updatedService);
  } catch (error) {
    next(error);
  }
});

// Delete all services (Admin only)
router.post('/delete-all', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  try {
    const allServices = await prisma.service.findMany({ select: { id: true } });
    const count = allServices.length;

    const bookings = await prisma.booking.findMany({ select: { id: true } });
    const bookingIds = bookings.map((b) => b.id);

    const txs: any[] = [
      prisma.review.deleteMany({ where: { serviceId: { not: null } } }),
    ];
    if (bookingIds.length > 0) {
      txs.push(prisma.escrow.deleteMany({ where: { bookingId: { in: bookingIds } } }));
    }
    txs.push(prisma.booking.deleteMany({}));
    txs.push(prisma.service.deleteMany({}));

    await prisma.$transaction(txs);

    res.json({ success: true, count, message: `All ${count} service(s) deleted successfully.` });
  } catch (error) {
    next(error);
  }
});

// Bulk delete services (Admin only)
router.post('/bulk-delete', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  try {
    const bookings = await prisma.booking.findMany({
      where: { serviceId: { in: ids } },
      select: { id: true },
    });
    const bookingIds = bookings.map((b) => b.id);

    const txs: any[] = [
      prisma.review.deleteMany({ where: { serviceId: { in: ids } } }),
    ];
    if (bookingIds.length > 0) {
      txs.push(prisma.escrow.deleteMany({ where: { bookingId: { in: bookingIds } } }));
    }
    txs.push(prisma.booking.deleteMany({ where: { serviceId: { in: ids } } }));
    txs.push(prisma.service.deleteMany({ where: { id: { in: ids } } }));

    await prisma.$transaction(txs);

    res.json({ success: true, count: ids.length, message: `${ids.length} service(s) deleted successfully.` });
  } catch (error) {
    next(error);
  }
});

// Delete a handyman service (Admin only)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  const { id } = req.params;

  try {
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const bookings = await prisma.booking.findMany({
      where: { serviceId: id },
      select: { id: true },
    });
    const bookingIds = bookings.map((b) => b.id);

    const txs: any[] = [
      prisma.review.deleteMany({ where: { serviceId: id } }),
    ];
    if (bookingIds.length > 0) {
      txs.push(prisma.escrow.deleteMany({ where: { bookingId: { in: bookingIds } } }));
    }
    txs.push(prisma.booking.deleteMany({ where: { serviceId: id } }));
    txs.push(prisma.service.delete({ where: { id } }));

    await prisma.$transaction(txs);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Toggle service boost (featured) status (Admin only)
router.patch('/:id/boost', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  const { id } = req.params;

  try {
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const updatedService = await prisma.service.update({
      where: { id },
      data: {
        featured: !service.featured,
      },
    });

    res.json(updatedService);
  } catch (error) {
    next(error);
  }
});

export default router;
