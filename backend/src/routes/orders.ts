import { Router, Response, NextFunction } from 'express';
import { PaymentProvider, OrderStatus } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { sendNotification, notifyMany } from '../lib/notify';
import prisma from '../lib/prisma';

const router = Router();

// Get orders for a user
router.get('/', authenticateToken, async (req: AuthRequest, res, next) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const orders = await prisma.order.findMany({
      where: { userId },
      include: { items: { include: { product: true } }, escrows: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

// Get sales / order items for products owned by a vendor
router.get('/vendor', authenticateToken, async (req: AuthRequest, res, next) => {
  const userId = req.user?.userId;
  const role = req.user?.role;

  if (role !== 'VENDOR' && role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Vendor or Admin role required.' });
  }

  try {
    const orderItems = await prisma.orderItem.findMany({
      where: role === 'ADMIN' ? {} : { product: { vendorId: userId } },
      include: {
        product: true,
        order: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            escrows: true,
          },
        },
      },
      orderBy: {
        order: {
          createdAt: 'desc',
        },
      },
    });

    res.json(orderItems);
  } catch (error) {
    next(error);
  }
});

// Create an order (Checkout with Stock Verification and Backend Price Calculation)
router.post('/checkout', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  const { items, paymentProvider } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items are required for checkout' });
  }

  try {
    // 1. Gather all product IDs to query
    const productIds = items.map((i: any) => String(i.productId));
    const dbProducts = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const dbProductsMap = new Map(dbProducts.map(p => [p.id, p]));

    // 2. Validate stock and calculate true total amount based on DB prices
    let computedTotalAmount = 0;
    const checkoutItems: { productId: string; quantity: number; price: number }[] = [];

    for (const item of items) {
      const dbProduct = dbProductsMap.get(item.productId);
      if (!dbProduct) {
        return res.status(404).json({ error: `Product with ID ${item.productId} not found` });
      }

      if (dbProduct.stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for product: ${dbProduct.name}. Requested: ${item.quantity}, Available: ${dbProduct.stock}`,
        });
      }

      computedTotalAmount += dbProduct.price * item.quantity;
      checkoutItems.push({
        productId: dbProduct.id,
        quantity: item.quantity,
        price: dbProduct.price, // Trusting db price
      });
    }

    // 3. Process stock deduction and order creation in a transaction
    const order = await prisma.$transaction(async (tx) => {
      // Decrement stock for each product
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      }

      // Create order
      return tx.order.create({
        data: {
          userId,
          totalAmount: computedTotalAmount,
          paymentProvider: (paymentProvider as PaymentProvider) || 'NONE',
          status: 'PENDING',
          items: {
            create: checkoutItems,
          },
        },
        include: { items: true },
      });
    });

    // ── Multi-channel notifications ──────────────────────────────────────
    try {
      const itemsSummary = dbProducts.map(p => {
        const req = items.find((i: any) => i.productId === p.id);
        return `${req?.quantity || 1}× ${p.name}`;
      }).join(', ');

      // 1. Customer — order confirmation
      sendNotification({
        userId,
        title: '🛒 Order Placed Successfully',
        body: `Your order for ${itemsSummary} (₦${computedTotalAmount.toLocaleString()}) has been received and is being processed.`,
        type: 'ORDER',
        referenceId: order.id,
        emailSubject: '✅ Order Confirmed — FixMart',
        emailHtml: `<p style="font-size:16px;color:#374151">Hi there,</p>
          <p>Your order has been placed successfully!</p>
          <p><strong>Items:</strong> ${itemsSummary}</p>
          <p><strong>Total:</strong> ₦${computedTotalAmount.toLocaleString()}</p>
          <p>We'll notify you as soon as it ships. Thank you for shopping with <strong>FixMart</strong>!</p>`,
      }).catch(() => {});

      // 2. Each vendor — new sale alert
      const vendorIds = new Set(dbProducts.map(p => p.vendorId).filter(Boolean));
      for (const vendorId of vendorIds) {
        const vendorItems = dbProducts.filter(p => p.vendorId === vendorId);
        const vendorDesc = vendorItems.map(p => {
          const req = items.find((i: any) => i.productId === p.id);
          return `${req?.quantity || 1}× ${p.name}`;
        }).join(', ');
        sendNotification({
          userId: vendorId!,
          title: '📦 New Order Received',
          body: `New sale: ${vendorDesc}. Order total: ₦${computedTotalAmount.toLocaleString()}. Please prepare items for dispatch.`,
          type: 'ORDER',
          referenceId: order.id,
          emailSubject: '🛒 You Have a New Order — FixMart',
          emailHtml: `<p>A customer just placed a new order from your store.</p>
            <p><strong>Items ordered:</strong> ${vendorDesc}</p>
            <p><strong>Order Total:</strong> ₦${computedTotalAmount.toLocaleString()}</p>
            <p>Please log in to your dashboard to confirm and prepare the order.</p>`,
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[orders] Failed to dispatch notifications:', e);
    }

    res.status(201).json({ message: 'Order created successfully', order });
  } catch (error) {
    next(error);
  }
});

// Update Order Status (Cancel or Ship/Deliver)
router.patch('/:id/status', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user?.userId;
  const role = req.user?.role;

  if (!status) return res.status(400).json({ error: 'Status is required' });

  const validStatuses: OrderStatus[] = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status' });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Permissions check
    if (status === 'CANCELLED') {
      // Customers can cancel their own orders if they are pending, admins can cancel anything
      if (role !== 'ADMIN' && order.userId !== userId) {
        return res.status(403).json({ error: 'Forbidden. You do not have permission to cancel this order.' });
      }
      if (order.status === 'CANCELLED') {
        return res.status(400).json({ error: 'Order is already cancelled' });
      }
    } else {
      // Shipping and delivering requires Vendor, Admin, or the assigned Rider
      if (role !== 'ADMIN' && role !== 'VENDOR' && !(role === 'RIDER' && order.riderId === userId)) {
        return res.status(403).json({ error: 'Forbidden. Vendor, Admin, or assigned Rider access required.' });
      }
    }

    // Execute state update (with inventory release on cancellation)
    const updatedOrder = await prisma.$transaction(async (tx) => {
      if (status === 'CANCELLED') {
        // Restore stock levels
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                increment: item.quantity,
              },
            },
          });
        }
      }

      return tx.order.update({
        where: { id },
        data: { status },
      });
    });

    if (status === 'DELIVERED') {
      await prisma.escrow.updateMany({
        where: { orderId: id, status: 'HELD' },
        data: { autoReleaseAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      });
    }

    // ── Multi-channel notification to customer on status change ─────────
    const statusMessages: Record<string, { title: string; body: string }> = {
      PAID:      { title: '💳 Payment Confirmed',    body: `Your payment for order #${id.slice(-8).toUpperCase()} has been confirmed. We are preparing your items.` },
      SHIPPED:   { title: '🚚 Order Shipped',        body: `Great news! Your order #${id.slice(-8).toUpperCase()} is on its way. Track it in the app.` },
      DELIVERED: { title: '✅ Order Delivered',      body: `Your order #${id.slice(-8).toUpperCase()} has been delivered. Please confirm receipt in the app to release payment.` },
      CANCELLED: { title: '❌ Order Cancelled',      body: `Your order #${id.slice(-8).toUpperCase()} has been cancelled. If this was unexpected, please contact support.` },
    };
    const msgData = statusMessages[status];
    if (msgData) {
      sendNotification({
        userId: order.userId,
        title: msgData.title,
        body: msgData.body,
        type: 'ORDER',
        referenceId: id,
        emailSubject: msgData.title,
      }).catch(() => {});
    }

    res.json({ message: `Order status updated to ${status}`, order: updatedOrder });
  } catch (error) {
    next(error);
  }
});

// Customer confirms item received (releases escrow)
router.post('/:id/confirm-receipt', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden. You are not the buyer of this order.' });
    }

    if (order.isSplitPayment && order.amountPaid < order.totalAmount) {
      return res.status(400).json({ error: 'Remaining split payment of 50% is required to confirm receipt.' });
    }

    const escrows = await prisma.escrow.findMany({
      where: { orderId: id, status: 'HELD' },
    });

    if (escrows.length === 0) {
      return res.status(400).json({ error: 'No active pending payments held in escrow for this order.' });
    }

    // Trigger the split webhook for each escrow
    const { triggerSplitWebhook } = require('../lib/wallet');
    for (const escrow of escrows) {
      await triggerSplitWebhook(escrow.id);
    }

    // Force update status of order to DELIVERED if not already
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status: 'DELIVERED' },
    });

    res.json({ success: true, message: 'Order receipt confirmed and funds released.', order: updatedOrder });
  } catch (error) {
    next(error);
  }
});

// Admin: Get all orders across all users
router.get('/admin/all', authenticateToken, async (req: AuthRequest, res, next) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, address: true } },
        items: { include: { product: true } },
        rider: { select: { id: true, name: true, phone: true, vehicleType: true, licensePlate: true } }
      },
    });
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

// Admin: List all verified riders (for assignment picker)
router.get('/riders', authenticateToken, async (req: AuthRequest, res, next) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  try {
    const riders = await prisma.user.findMany({
      where: { role: 'RIDER', verificationStatus: 'VERIFIED' },
      select: {
        id: true, name: true, email: true, phone: true,
        vehicleType: true, licensePlate: true,
        currentLat: true, currentLng: true,
        verificationStatus: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(riders);
  } catch (error) {
    next(error);
  }
});

// Admin: Assign a rider to a paid/shipped order

router.patch('/:id/assign-rider', authenticateToken, async (req: AuthRequest, res, next) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  const { id } = req.params;
  const { riderId } = req.body;

  try {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (riderId) {
      const rider = await prisma.user.findFirst({
        where: { id: riderId, role: 'RIDER', verificationStatus: 'VERIFIED' }
      });
      if (!rider) {
        return res.status(400).json({ error: 'Selected rider is not verified or does not exist.' });
      }
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { riderId: riderId || null },
      include: {
        user: { select: { id: true, name: true } },
        rider: { select: { id: true, name: true } }
      }
    });

    if (riderId) {
      // Notify customer that a rider has been assigned
      sendNotification({
        userId: updatedOrder.userId,
        title: '🚚 Rider Assigned to Your Order',
        body: `Rider ${updatedOrder.rider?.name} has been assigned to deliver your order #${id.slice(-8).toUpperCase()}. Track them live in the app.`,
        type: 'ORDER',
        referenceId: id,
        emailSubject: '🚚 Your Rider Has Been Assigned — FixMart',
        emailHtml: `<p>A rider has been assigned to your order!</p>
          <p><strong>Rider:</strong> ${updatedOrder.rider?.name}</p>
          <p><strong>Order:</strong> #${id.slice(-8).toUpperCase()}</p>
          <p>Open the app to track your rider's location in real time.</p>`,
      }).catch(() => {});

      // Notify rider of the new delivery job
      sendNotification({
        userId: riderId,
        title: '📦 New Delivery Job',
        body: `You have been assigned to deliver order #${id.slice(-8).toUpperCase()} to ${updatedOrder.user.name}. Please check the app for full details.`,
        type: 'ORDER',
        referenceId: id,
        emailSubject: '📦 New Delivery Assigned — FixMart',
      }).catch(() => {});
    }

    res.json(updatedOrder);
  } catch (error) {
    next(error);
  }
});

// Rider: Get available deliveries (paid/shipped without rider or assigned to me)
router.get('/rider/available', authenticateToken, async (req: AuthRequest, res, next) => {
  const role = req.user?.role;
  const userId = req.user?.userId;
  if (role !== 'RIDER') {
    return res.status(403).json({ error: 'Forbidden. Rider access required.' });
  }
  try {
    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['PAID', 'SHIPPED'] },
        OR: [
          { riderId: null },
          { riderId: userId }
        ]
      },
      include: {
        user: { select: { id: true, name: true, phone: true, address: true, latitude: true, longitude: true } },
        items: { include: { product: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

// Rider: Accept a delivery self-assign
router.patch('/:id/accept-delivery', authenticateToken, async (req: AuthRequest, res, next) => {
  const role = req.user?.role;
  const userId = req.user?.userId;
  if (role !== 'RIDER') {
    return res.status(403).json({ error: 'Forbidden. Rider access required.' });
  }
  const { id } = req.params;

  try {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.riderId && order.riderId !== userId) {
      return res.status(400).json({ error: 'This delivery has already been accepted by another rider.' });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { riderId: userId },
      include: {
        user: { select: { id: true, name: true } },
        rider: { select: { id: true, name: true } }
      }
    });

    sendNotification({
      userId: updatedOrder.userId,
      title: '🚚 Rider On the Way',
      body: `Rider ${updatedOrder.rider?.name} accepted your delivery and is on the way with order #${id.slice(-8).toUpperCase()}.`,
      type: 'ORDER',
      referenceId: id,
      emailSubject: '🚚 Rider is On the Way — FixMart',
    }).catch(() => {});

    res.json(updatedOrder);
  } catch (error) {
    next(error);
  }
});

// Get real-time coordinates/tracking for an order (called by customer or rider)
router.get('/:id/location', authenticateToken, async (req: AuthRequest, res, next) => {
  const { id } = req.params;
  try {
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        riderId: true,
        status: true,
      }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const customer = await prisma.user.findUnique({
      where: { id: order.userId },
      select: { name: true, address: true, latitude: true, longitude: true }
    });

    let riderLocation = null;
    if (order.riderId) {
      const rider = await prisma.user.findUnique({
        where: { id: order.riderId },
        select: {
          id: true,
          name: true,
          currentLat: true,
          currentLng: true,
          latitude: true,
          longitude: true,
          vehicleType: true,
          licensePlate: true,
        }
      });
      if (rider) {
        riderLocation = {
          id: rider.id,
          name: rider.name,
          lat: rider.currentLat !== null ? rider.currentLat : rider.latitude,
          lng: rider.currentLng !== null ? rider.currentLng : rider.longitude,
          vehicleType: rider.vehicleType,
          licensePlate: rider.licensePlate,
        };
      }
    }

    res.json({
      orderId: order.id,
      status: order.status,
      customerLocation: {
        name: customer?.name,
        address: customer?.address,
        lat: customer?.latitude,
        lng: customer?.longitude,
      },
      riderLocation,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
