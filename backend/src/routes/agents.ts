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

    const stateFilter = agent.state ? { equals: agent.state, mode: 'insensitive' as const } : undefined;
    const userLocalityCondition: any = {
      NOT: { id: agent.id },
      OR: [
        ...(agent.state ? [{ state: stateFilter }] : []),
        { agentId: agent.id },
      ],
    };

    const [workmen, riders, customers, vendors, pendingBookings, orders, totalUsers] = await Promise.all([
      prisma.user.count({ where: { role: 'HANDYMAN', ...userLocalityCondition, verificationStatus: 'VERIFIED' } }),
      prisma.user.count({ where: { role: 'RIDER', ...userLocalityCondition, verificationStatus: 'VERIFIED' } }),
      prisma.user.count({ where: { role: 'CUSTOMER', ...userLocalityCondition } }),
      prisma.user.count({ where: { role: 'VENDOR', ...userLocalityCondition } }),
      prisma.booking.count({
        where: {
          status: 'PENDING',
          OR: [
            ...(agent.state ? [{ state: stateFilter }, { customer: { state: stateFilter } }] : []),
            { customer: { agentId: agent.id } },
          ],
        },
      }),
      prisma.order.count({
        where: {
          OR: [
            ...(agent.state ? [{ state: stateFilter }, { user: { state: stateFilter } }] : []),
            { user: { agentId: agent.id } },
          ],
        },
      }),
      prisma.user.count({ where: userLocalityCondition }),
    ]);

    res.json({
      agent,
      stats: {
        workmen,
        riders,
        customers,
        vendors,
        pendingBookings,
        orders,
        totalUsers,
      },
    });
  } catch (error) { next(error); }
});

// GET /agents/bookings — all bookings (jobs) in agent's locality
router.get('/bookings', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, state: true, country: true } });
    const where: any = {};
    if (req.user!.role === 'AGENT' && agent?.state) {
      where.OR = [
        { state: { equals: agent.state, mode: 'insensitive' } },
        { customer: { state: { equals: agent.state, mode: 'insensitive' } } },
        { handyman: { state: { equals: agent.state, mode: 'insensitive' } } },
        { customer: { agentId: agent.id } },
      ];
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        service: true,
        escrows: true,
        customer: { select: { id: true, name: true, email: true, phone: true, state: true } },
        handyman: { select: { id: true, name: true, email: true, phone: true, specialty: true, state: true } },
      }
    });
    res.json(bookings);
  } catch (error) { next(error); }
});

// GET /agents/orders — all orders in agent's locality
router.get('/orders', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, state: true, country: true } });
    const where: any = {};
    if (req.user!.role === 'AGENT' && agent?.state) {
      where.OR = [
        { state: { equals: agent.state, mode: 'insensitive' } },
        { user: { state: { equals: agent.state, mode: 'insensitive' } } },
        { user: { agentId: agent.id } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, state: true } },
        rider: { select: { id: true, name: true, email: true, phone: true, state: true } },
        items: { include: { product: { select: { id: true, name: true, imageUrl: true } } } },
        escrows: true,
      }
    });
    res.json(orders);
  } catch (error) { next(error); }
});

// GET /agents/transactions — transactions, commissions, and escrow payments in agent's locality
router.get('/transactions', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, state: true, country: true }
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // 1. Agent's own commission transactions from wallet
    const agentWallet = await prisma.wallet.findUnique({
      where: { userId: agent.id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });

    const commissionTxList = (agentWallet?.transactions || []).map((t) => ({
      id: t.id,
      amount: t.amount,
      type: t.type, // e.g. AGENT_COMMISSION
      status: t.status,
      description: t.description || 'Regional Agent Commission',
      referenceId: t.referenceId,
      createdAt: t.createdAt,
      source: 'WALLET',
      isCommission: true,
    }));

    // 2. Booking / Job escrows and payments in agent's locality
    const bookingEscrows = await prisma.escrow.findMany({
      where: {
        booking: {
          OR: [
            ...(agent.state ? [
              { state: { equals: agent.state, mode: 'insensitive' as const } },
              { customer: { state: { equals: agent.state, mode: 'insensitive' as const } } }
            ] : []),
            { customer: { agentId: agent.id } },
          ],
        },
      },
      include: {
        booking: {
          select: {
            id: true,
            address: true,
            state: true,
            totalPrice: true,
            status: true,
            service: { select: { name: true, category: true } },
            customer: { select: { id: true, name: true, phone: true } },
            handyman: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });

    const jobTxList = bookingEscrows.map((e) => ({
      id: e.id,
      amount: e.amount,
      commissionAmount: e.commissionAmount,
      providerAmount: e.providerAmount,
      type: 'JOB_PAYMENT',
      status: e.status === 'RELEASED' ? 'COMPLETED' : e.status === 'HELD' ? 'HELD' : e.status,
      description: `Job: ${e.booking?.service?.name || 'Handyman Service'} for ${e.booking?.customer?.name || 'Customer'}`,
      referenceId: e.bookingId,
      createdAt: e.createdAt,
      source: 'BOOKING',
      party: e.booking?.customer?.name,
      provider: e.booking?.handyman?.name,
      jobStatus: e.booking?.status,
      isCommission: false,
    }));

    // 3. Order escrows and payments in agent's locality
    const orderEscrows = await prisma.escrow.findMany({
      where: {
        order: {
          OR: [
            ...(agent.state ? [
              { state: { equals: agent.state, mode: 'insensitive' as const } },
              { user: { state: { equals: agent.state, mode: 'insensitive' as const } } }
            ] : []),
            { user: { agentId: agent.id } },
          ],
        },
      },
      include: {
        order: {
          select: {
            id: true,
            deliveryAddress: true,
            state: true,
            totalAmount: true,
            status: true,
            user: { select: { id: true, name: true, phone: true } },
            rider: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });

    const orderTxList = orderEscrows.map((e) => ({
      id: e.id,
      amount: e.amount,
      commissionAmount: e.commissionAmount,
      providerAmount: e.providerAmount,
      type: 'ORDER_PAYMENT',
      status: e.status === 'RELEASED' ? 'COMPLETED' : e.status === 'HELD' ? 'HELD' : e.status,
      description: `Order #${e.orderId?.slice(-6).toUpperCase() || 'N/A'} by ${e.order?.user?.name || 'Customer'}`,
      referenceId: e.orderId,
      createdAt: e.createdAt,
      source: 'ORDER',
      party: e.order?.user?.name,
      provider: e.order?.rider?.name,
      orderStatus: e.order?.status,
      isCommission: false,
    }));

    // Merge and sort all transactions by latest
    const allTransactions = [...commissionTxList, ...jobTxList, ...orderTxList].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const totalCommission = commissionTxList.reduce((acc, c) => acc + (c.amount || 0), 0);
    const totalJobVolume = jobTxList.reduce((acc, j) => acc + (j.amount || 0), 0);
    const totalOrderVolume = orderTxList.reduce((acc, o) => acc + (o.amount || 0), 0);

    res.json({
      transactions: allTransactions,
      stats: {
        totalCommission,
        totalJobVolume,
        totalOrderVolume,
        totalTransactions: allTransactions.length,
      },
    });
  } catch (error) { next(error); }
});

// GET /agents/users — view users in agent's locality (customers, vendors, workmen, riders)
router.get('/users', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, state: true, country: true }
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { role, search } = req.query;
    const stateFilter = agent.state ? { equals: agent.state, mode: 'insensitive' as const } : undefined;

    const where: any = {
      NOT: { id: agent.id },
      OR: [
        ...(agent.state ? [{ state: stateFilter }] : []),
        { agentId: agent.id },
      ],
    };

    if (role && role !== 'ALL') {
      where.role = role as any;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.AND = [
        {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
            { phone: { contains: q } },
          ],
        },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        opayPhone: true,
        role: true,
        state: true,
        country: true,
        address: true,
        specialty: true,
        vehicleType: true,
        verificationStatus: true,
        createdAt: true,
        _count: {
          select: {
            bookings: true,
            orders: true,
            jobs: true,
            deliveries: true,
          },
        },
      },
    });

    res.json(users);
  } catch (error) { next(error); }
});

// GET /agents/workmen — list handymen in agent's state
router.get('/workmen', authenticateToken, requireAgent, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const agent = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, state: true, country: true } });
    const where: any = {
      role: 'HANDYMAN',
      OR: [
        ...(agent?.state ? [{ state: { equals: agent.state, mode: 'insensitive' as const } }] : []),
        { agentId: agent?.id },
      ],
    };

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
    const agent = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, state: true, country: true } });
    const where: any = {
      role: 'RIDER',
      OR: [
        ...(agent?.state ? [{ state: { equals: agent.state, mode: 'insensitive' as const } }] : []),
        { agentId: agent?.id },
      ],
    };

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
