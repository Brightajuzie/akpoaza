import { Router, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { sendNotification } from '../lib/notify';
import prisma from '../lib/prisma';

const router = Router();

// Middleware: must be AGENT or ADMIN
const requireAgent = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'AGENT' && req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Agent access required.' });
  }
  next();
};

// GET /agents/my-region — get agent's own state/country info + stats
router.get('/my-region', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, state: true, country: true, verificationStatus: true }
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const [workmen, riders, pendingBookings, orders] = await Promise.all([
      prisma.user.count({ where: { role: 'HANDYMAN', state: agent.state || undefined, verificationStatus: 'VERIFIED' } }),
      prisma.user.count({ where: { role: 'RIDER', state: agent.state || undefined, verificationStatus: 'VERIFIED' } }),
      prisma.booking.count({ where: { state: agent.state || undefined, status: 'PENDING' } }),
      prisma.order.count({ where: { state: agent.state || undefined } }),
    ]);

    res.json({ agent, stats: { workmen, riders, pendingBookings, orders } });
  } catch (error) { next(error); }
});

// GET /agents/bookings — all bookings in agent's state
router.get('/bookings', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { state: true, country: true } });
    const where: any = {};
    if (req.user!.role === 'AGENT' && agent?.state) where.state = agent.state;

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        service: true,
        customer: { select: { id: true, name: true, email: true, phone: true, state: true } },
        handyman: { select: { id: true, name: true, email: true, phone: true, specialty: true, state: true } },
      }
    });
    res.json(bookings);
  } catch (error) { next(error); }
});

// GET /agents/orders — all orders in agent's state
router.get('/orders', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { state: true, country: true } });
    const where: any = {};
    if (req.user!.role === 'AGENT' && agent?.state) where.state = agent.state;

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, state: true } },
        rider: { select: { id: true, name: true, email: true, phone: true, state: true } },
        items: { include: { product: { select: { id: true, name: true, imageUrl: true } } } },
      }
    });
    res.json(orders);
  } catch (error) { next(error); }
});

// GET /agents/workmen — list handymen in agent's state
router.get('/workmen', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { state: true, country: true } });
    const where: any = { role: 'HANDYMAN' };
    if (req.user!.role === 'AGENT' && agent?.state) where.state = agent.state;

    const workmen = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, specialty: true, state: true, country: true, verificationStatus: true, latitude: true, longitude: true }
    });
    res.json(workmen);
  } catch (error) { next(error); }
});

// GET /agents/riders — list riders in agent's state
router.get('/riders', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { state: true, country: true } });
    const where: any = { role: 'RIDER' };
    if (req.user!.role === 'AGENT' && agent?.state) where.state = agent.state;

    const riders = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, vehicleType: true, state: true, country: true, verificationStatus: true, riderStatus: true, latitude: true, longitude: true }
    });
    res.json(riders);
  } catch (error) { next(error); }
});

// PATCH /agents/bookings/:id/assign — agent assigns a handyman to a booking
router.patch('/bookings/:id/assign', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { handymanId } = req.body;
  if (!handymanId) return res.status(400).json({ error: 'handymanId is required' });

  try {
    const [booking, handyman] = await Promise.all([
      prisma.booking.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true, email: true } } } }),
      prisma.user.findUnique({ where: { id: handymanId }, select: { id: true, name: true, specialty: true, verificationStatus: true } })
    ]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (!handyman) return res.status(404).json({ error: 'Handyman not found' });
    if (handyman.verificationStatus !== 'VERIFIED') return res.status(400).json({ error: 'Handyman is not verified' });

    const updated = await prisma.booking.update({
      where: { id },
      data: { handymanId, status: 'ACCEPTED' },
      include: { handyman: true, service: true, customer: true }
    });

    // Notify customer
    if (booking.customer) {
      sendNotification({
        userId: booking.customer.id,
        title: '✅ Workman Assigned!',
        body: `${handyman.name}${handyman.specialty ? ` (${handyman.specialty})` : ''} has been assigned to your booking by your regional agent.`,
        type: 'BOOKING',
        referenceId: id,
      }).catch(() => {});
    }
    // Notify handyman
    sendNotification({
      userId: handymanId,
      title: '🔧 New Job Assigned!',
      body: `You have been assigned a new booking by the regional agent. Check your bookings.`,
      type: 'BOOKING',
      referenceId: id,
    }).catch(() => {});

    res.json(updated);
  } catch (error) { next(error); }
});

// PATCH /agents/orders/:id/assign-rider — agent assigns a rider to an order
router.patch('/orders/:id/assign-rider', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { riderId } = req.body;
  if (!riderId) return res.status(400).json({ error: 'riderId is required' });

  try {
    const [order, rider] = await Promise.all([
      prisma.order.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, email: true } } } }),
      prisma.user.findUnique({ where: { id: riderId }, select: { id: true, name: true, verificationStatus: true } })
    ]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!rider) return res.status(404).json({ error: 'Rider not found' });
    if (rider.verificationStatus !== 'VERIFIED') return res.status(400).json({ error: 'Rider is not verified' });

    const updated = await prisma.order.update({
      where: { id },
      data: { riderId, status: 'SHIPPED' },
      include: { rider: true, user: true }
    });

    // Notify customer
    if (order.user) {
      sendNotification({
        userId: order.user.id,
        title: '🚴 Rider Assigned!',
        body: `${rider.name} has been assigned to deliver your order by the regional agent.`,
        type: 'ORDER',
        referenceId: id,
      }).catch(() => {});
    }
    // Notify rider
    sendNotification({
      userId: riderId,
      title: '📦 New Delivery!',
      body: 'You have been assigned a delivery by the regional agent. Check your deliveries.',
      type: 'ORDER',
      referenceId: id,
    }).catch(() => {});

    res.json(updated);
  } catch (error) { next(error); }
});

export default router;
