import { Router, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { sendNotification, notifyMany } from '../lib/notify';
import prisma from '../lib/prisma';

const router = Router();

// Get bookings for the logged-in user
router.get('/', authenticateToken, async (req: AuthRequest, res, next) => {
  const userId = req.user?.userId;
  const role = req.user?.role;
  
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const whereClause = role === 'HANDYMAN' 
      ? { handymanId: userId } 
      : { customerId: userId };

    const bookings = await prisma.booking.findMany({
      where: whereClause,
      include: { service: true, handyman: true, escrows: true },
    });
    res.json(bookings);
  } catch (error) {
    next(error);
  }
});

// Admin: Get ALL bookings across all users
// NOTE: Declared before /:id routes so Express never risks shadowing this static path.
router.get('/admin/all', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        service: true,
        customer: { select: { id: true, name: true, email: true, phone: true } },
        handyman: { select: { id: true, name: true, email: true, phone: true, specialty: true } },
      },
    });
    res.json(bookings);
  } catch (error) {
    next(error);
  }
});

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Get single booking by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  try {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { service: true, handyman: true, customer: true, escrows: true },
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (error) {
    next(error);
  }
});

// Create a new booking
router.post('/', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const customerId = req.user?.userId;
  const { serviceId, scheduledAt, address, latitude, longitude, autoAssign } = req.body;
  
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' });
  if (!serviceId || !scheduledAt || !address) {
    return res.status(400).json({ error: 'Missing serviceId, scheduledAt, or address' });
  }

  try {
    // Look up service in DB to retrieve verified price
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    let handymanId: string | null = null;
    let status = 'PENDING';
    let matchDistance: number | null = null;

    const customerLat = latitude ? parseFloat(latitude) : null;
    const customerLng = longitude ? parseFloat(longitude) : null;

    const MAX_RADIUS_KM = 50;   // primary search radius
    const FALLBACK_RADIUS_KM = 100; // wider fallback radius

    if (autoAssign && customerLat !== null && customerLng !== null) {
      // Find handymen actively IN_PROGRESS (on-site at a job) — ACCEPTED just means paid/confirmed
      // but does not mean the handyman is currently occupied.
      const busyHandymanRecords = await prisma.booking.findMany({
        where: { status: 'IN_PROGRESS' },
        select: { handymanId: true },
      });
      const busyIds = new Set(
        busyHandymanRecords.map((b) => b.handymanId).filter(Boolean) as string[]
      );

      // Fetch all VERIFIED handymen with a registered location
      const allHandymen = await prisma.user.findMany({
        where: {
          role: 'HANDYMAN',
          verificationStatus: 'VERIFIED',
          latitude: { not: null },
          longitude: { not: null },
        },
      });

      // Exclude busy handymen and compute distances
      const availableWithDist = allHandymen
        .filter((hm) => !busyIds.has(hm.id))
        .map((hm) => ({
          hm,
          dist: getDistanceKm(customerLat, customerLng, hm.latitude!, hm.longitude!),
        }))
        .sort((a, b) => a.dist - b.dist);

      // 1st pass — matching specialty within primary radius
      let best = availableWithDist.find(
        (x) => x.hm.specialty === service.category && x.dist <= MAX_RADIUS_KM
      );

      // 2nd pass — any specialty within primary radius
      if (!best) {
        best = availableWithDist.find((x) => x.dist <= MAX_RADIUS_KM);
      }

      // 3rd pass — matching specialty within fallback radius
      if (!best) {
        best = availableWithDist.find(
          (x) => x.hm.specialty === service.category && x.dist <= FALLBACK_RADIUS_KM
        );
      }

      // 4th pass — any verified available handyman within fallback radius
      if (!best) {
        best = availableWithDist.find((x) => x.dist <= FALLBACK_RADIUS_KM);
      }

      if (best) {
        handymanId = best.hm.id;
        matchDistance = Math.round(best.dist * 10) / 10;
        status = 'ACCEPTED';
      }
    }

    const newBooking = await prisma.booking.create({
      data: {
        customerId,
        serviceId,
        handymanId,
        scheduledAt: new Date(scheduledAt),
        address,
        latitude: customerLat,
        longitude: customerLng,
        totalPrice: service.basePrice,
        status,
      },
      include: { handyman: true, service: true }
    });

    // ── Multi-channel notifications ──────────────────────────────────────
    const scheduledStr = new Date(scheduledAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
    const assignedText = handymanId ? 'A professional has been assigned to your job.' : 'We will assign a professional shortly.';

    // 1. Customer confirmation
    sendNotification({
      userId: customerId,
      title: '📅 Booking Confirmed',
      body: `Your booking for "${service.name}" on ${scheduledStr} at ${address} is confirmed. ${assignedText}`,
      type: 'BOOKING',
      referenceId: newBooking.id,
      emailSubject: '✅ Booking Confirmed — FixMart',
      emailHtml: `<p>Hi there,</p>
        <p>Your service booking has been placed successfully!</p>
        <p><strong>Service:</strong> ${service.name}</p>
        <p><strong>Scheduled:</strong> ${scheduledStr}</p>
        <p><strong>Address:</strong> ${address}</p>
        <p>${assignedText}</p>
        <p>Open the app to track your booking in real time.</p>`,
    }).catch(() => {});

    // 2. Assigned handyman
    if (handymanId && status === 'ACCEPTED') {
      const distText = matchDistance !== null ? ` You are ${matchDistance} km away.` : '';
      sendNotification({
        userId: handymanId,
        title: '💼 New Job Assigned',
        body: `New job: ${service.name}. Address: ${address}.${distText} Scheduled: ${scheduledStr}.`,
        type: 'BOOKING',
        referenceId: newBooking.id,
        emailSubject: '🛠️ New Job Waiting for You — FixMart',
        emailHtml: `<p>You have been assigned a new job!</p>
          <p><strong>Service:</strong> ${service.name}</p>
          <p><strong>Address:</strong> ${address}</p>
          <p><strong>Scheduled:</strong> ${scheduledStr}</p>
          ${distText ? `<p><strong>Distance from you:</strong> ${matchDistance} km</p>` : ''}
          <p>Open the app to accept and begin live tracking.</p>`,
      }).catch(() => {});
    }

    res.status(201).json({ ...newBooking, matchDistance });
  } catch (error) {
    next(error);
  }
});

// Get real-time coordinates/tracking for a booking
router.get('/:id/location', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  try {
    const booking = await prisma.booking.findUnique({
      where: { id },
      select: {
        id: true,
        customerId: true,
        handymanId: true,
        status: true,
        latitude: true,
        longitude: true,
      }
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    let providerLocation = null;

    if (booking.handymanId) {
      const provider = await prisma.user.findUnique({
        where: { id: booking.handymanId },
        select: {
          id: true,
          name: true,
          currentLat: true,
          currentLng: true,
          latitude: true,
          longitude: true,
        }
      });
      if (provider) {
        providerLocation = {
          id: provider.id,
          name: provider.name,
          lat: provider.currentLat !== null ? provider.currentLat : provider.latitude,
          lng: provider.currentLng !== null ? provider.currentLng : provider.longitude,
        };
      }
    }

    res.json({
      bookingId: booking.id,
      status: booking.status,
      customerLocation: {
        lat: booking.latitude,
        lng: booking.longitude,
      },
      providerLocation,
    });
  } catch (error) {
    next(error);
  }
});

// Update booking status (for Handymen or Admins)
router.patch('/:id/status', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { status } = req.body;
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (role !== 'HANDYMAN' && role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Only Handymen or Admins can update booking status.' });
  }

  const allowedStatuses = ['PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED'];
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    let updateData: any = { status };

    if (role === 'HANDYMAN') {
      if (status === 'ACCEPTED') {
        // Handyman accepting booking: check if already assigned
        if (booking.handymanId && booking.handymanId !== userId) {
          return res.status(403).json({ error: 'This booking is already accepted by another handyman.' });
        }
        // Self-assign
        updateData.handymanId = userId;
      } else {
        // Completing or cancelling booking: check if they are the assigned handyman
        if (booking.handymanId !== userId) {
          return res.status(403).json({ error: 'You are not assigned to this booking.' });
        }
      }
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: updateData,
      include: { service: true, customer: true },
    });

    // ── Multi-channel notifications on status change ──────────────────────
    const svcName = updatedBooking.service?.name || 'your service';
    const custName = updatedBooking.customer?.name || 'Customer';

    if (status === 'ACCEPTED' && updatedBooking.customerId) {
      // Notify customer
      sendNotification({
        userId: updatedBooking.customerId,
        title: '✅ Booking Accepted',
        body: `A professional has accepted your booking for "${svcName}". They are on their way!`,
        type: 'BOOKING',
        referenceId: id,
        emailSubject: '✅ Your Booking Was Accepted — FixMart',
        emailHtml: `<p>Good news, ${custName}!</p>
          <p>A professional has accepted your booking for <strong>${svcName}</strong> and will be heading to your location.</p>
          <p>Track them live in the app.</p>`,
      }).catch(() => {});

      // Confirm to handyman
      if (updatedBooking.handymanId) {
        sendNotification({
          userId: updatedBooking.handymanId,
          title: '💼 Job Confirmed',
          body: `You accepted the job for "${svcName}". Address: ${updatedBooking.address}.`,
          type: 'BOOKING',
          referenceId: id,
        }).catch(() => {});
      }
    } else if (status === 'COMPLETED' && updatedBooking.customerId) {
      await prisma.escrow.updateMany({
        where: { bookingId: id, status: 'HELD' },
        data: { autoReleaseAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      });
      sendNotification({
        userId: updatedBooking.customerId,
        title: '🎉 Job Completed',
        body: `Your booking for "${svcName}" is marked complete. Please confirm in the app to release payment to the professional.`,
        type: 'BOOKING',
        referenceId: id,
        emailSubject: '🎉 Job Completed — Action Required',
        emailHtml: `<p>Hi ${custName},</p>
          <p>Your booking for <strong>${svcName}</strong> has been marked as completed by the professional.</p>
          <p>Please open the app and confirm receipt to release their payment from escrow. Payment is automatically released after 24 hours if no action is taken.</p>`,
      }).catch(() => {});
    } else if (status === 'CANCELLED' && updatedBooking.customerId) {
      sendNotification({
        userId: updatedBooking.customerId,
        title: '❌ Booking Cancelled',
        body: `Your booking for "${svcName}" has been cancelled. Contact support if this is unexpected.`,
        type: 'BOOKING',
        referenceId: id,
        emailSubject: '❌ Booking Cancelled — FixMart',
      }).catch(() => {});
    }

    res.json(updatedBooking);
  } catch (error) {
    next(error);
  }
});

// (Admin: Get ALL bookings is now declared near the top of this file, before dynamic /:id routes.)

// Admin forcefully cancels a booking
router.patch('/:id/admin-cancel', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const role = req.user?.role;
  if (role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });

  try {
    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: { customer: true, handyman: true, service: true },
    });

    if (updatedBooking.customerId) {
      sendNotification({
        userId: updatedBooking.customerId,
        title: '❌ Booking Cancelled by Admin',
        body: `Your booking for "${updatedBooking.service?.name}" was cancelled by an administrator. Please contact support for assistance.`,
        type: 'BOOKING',
        referenceId: id,
        emailSubject: '❌ Booking Cancelled — FixMart',
      }).catch(() => {});
    }
    if (updatedBooking.handymanId) {
      sendNotification({
        userId: updatedBooking.handymanId,
        title: '❌ Job Cancelled by Admin',
        body: `The job for "${updatedBooking.service?.name}" was cancelled by an administrator.`,
        type: 'BOOKING',
        referenceId: id,
      }).catch(() => {});
    }

    res.json(updatedBooking);
  } catch (error) {
    next(error);
  }
});

// Admin forcefully reassigns a booking
router.patch('/:id/admin-reassign', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { newHandymanId } = req.body;
  const role = req.user?.role;

  if (role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
  if (!newHandymanId) return res.status(400).json({ error: 'newHandymanId is required' });

  try {
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const oldHandymanId = booking.handymanId;

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: { handymanId: newHandymanId, status: 'ACCEPTED' },
      include: { customer: true, handyman: true, service: true },
    });

    if (updatedBooking.customerId) {
      sendNotification({
        userId: updatedBooking.customerId,
        title: '🔄 Professional Reassigned',
        body: `Your booking for "${updatedBooking.service?.name}" has been reassigned to a new professional by an administrator.`,
        type: 'BOOKING',
        referenceId: id,
        emailSubject: '🔄 Booking Reassigned — FixMart',
      }).catch(() => {});
    }
    if (oldHandymanId) {
      sendNotification({
        userId: oldHandymanId,
        title: '🔄 Job Reassigned',
        body: `You have been unassigned from the job "${updatedBooking.service?.name}" by an administrator.`,
        type: 'BOOKING',
        referenceId: id,
      }).catch(() => {});
    }
    sendNotification({
      userId: newHandymanId,
      title: '💼 New Job Assigned by Admin',
      body: `An administrator assigned you to: "${updatedBooking.service?.name}". Address: ${updatedBooking.address}.`,
      type: 'BOOKING',
      referenceId: id,
      emailSubject: '🛠️ New Job Assigned — FixMart',
    }).catch(() => {});

    res.json(updatedBooking);
  } catch (error) {
    next(error);
  }
});

// Customer confirms job completed (releases escrow)
router.post('/:id/confirm-completion', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const customerId = req.user?.userId;
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.customerId !== customerId) {
      return res.status(403).json({ error: 'Forbidden. You are not the customer for this booking.' });
    }

    if (booking.isSplitPayment && booking.amountPaid < booking.totalPrice) {
      return res.status(400).json({ error: 'Remaining split payment of 50% is required to confirm completion.' });
    }

    const escrow = await prisma.escrow.findFirst({
      where: { bookingId: id, status: 'HELD' },
    });

    if (!escrow) {
      return res.status(400).json({ error: 'No active pending payment held in escrow for this booking.' });
    }

    // Trigger the split webhook
    const { triggerSplitWebhook } = require('../lib/wallet');
    await triggerSplitWebhook(escrow.id);

    // Force update status of booking to COMPLETED if not already
    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: { status: 'COMPLETED' },
      include: { service: true, handyman: true },
    });

    res.json({ success: true, message: 'Booking completion confirmed and funds released.', booking: updatedBooking });
  } catch (error) {
    next(error);
  }
});

export default router;
