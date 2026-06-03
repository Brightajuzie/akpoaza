import { Router, Response, NextFunction } from 'express';
import { PaymentProvider, OrderStatus } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { createNotification } from './notifications';
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

    // Notify vendors of the new order items
    try {
      const vendorIds = new Set(dbProducts.map(p => p.vendorId).filter(Boolean));
      for (const vendorId of vendorIds) {
        const vendorItems = dbProducts.filter(p => p.vendorId === vendorId);
        const itemsDesc = vendorItems.map(p => {
          const itemReq = items.find((i: any) => i.productId === p.id);
          return `${itemReq?.quantity || 1}x ${p.name}`;
        }).join(', ');

        await createNotification(
          prisma,
          vendorId!,
          '📦 New Order Received',
          `You received a new order for: ${itemsDesc}. Total order value: $${computedTotalAmount.toFixed(2)}`,
          'ORDER',
          order.id
        ).catch(() => {});
      }
    } catch (e) {
      console.error('Failed to notify vendors of new order', e);
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
      // Shipping and delivering requires Vendor or Admin access
      if (role !== 'ADMIN' && role !== 'VENDOR') {
        return res.status(403).json({ error: 'Forbidden. Vendor or Admin role required.' });
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

export default router;
