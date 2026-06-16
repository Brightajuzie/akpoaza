import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';

// Capture unhandled errors so nodemon shows the real crash reason
process.on('uncaughtException', (err) => {
  console.error('[FATAL uncaughtException]', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL unhandledRejection]', reason);
  process.exit(1);
});

// Load environment variables before importing routes
dotenv.config();

import productRoutes from './routes/products';
import serviceRoutes from './routes/services';
import bookingRoutes from './routes/bookings';
import orderRoutes from './routes/orders';
import paymentRoutes from './routes/payments';
import authRoutes from './routes/auth';
import reviewRoutes from './routes/reviews';
import settingRoutes from './routes/settings';
import notificationRoutes from './routes/notifications';
import analyticsRoutes from './routes/analytics';
import userRoutes from './routes/users';
import kycRoutes from './routes/kyc';
import uploadRoutes from './routes/upload';
import walletRoutes from './routes/wallet';
import parcelsRoutes from './routes/parcels';
<<<<<<< HEAD
import slidesRoutes from './routes/slides';
=======
>>>>>>> d74cc15965da6815edf7abdf37c172020b892227
import { errorHandler } from './middleware/errorHandler';
import prisma from './lib/prisma';
import { triggerSplitWebhook } from './lib/wallet';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',                                         // allow any origin (dev)
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
}));
// Webhook route must be parsed as raw body for Stripe signature verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Serve static uploads folder
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Basic health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend is running smoothly.' });
});

// Auth Routes
app.use('/api/auth', authRoutes);

// Feature Routes
app.use('/api/products', productRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/parcels', parcelsRoutes);
<<<<<<< HEAD
app.use('/api/slides', slidesRoutes);
=======
>>>>>>> d74cc15965da6815edf7abdf37c172020b892227

// Centralized Error Handler
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join_booking', (bookingId) => {
      socket.join(`booking_${bookingId}`);
      console.log(`Socket ${socket.id} joined booking_${bookingId}`);
    });

    socket.on('update_location', (data) => {
      socket.to(`booking_${data.bookingId}`).emit('location_update', {
        role: data.role,
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: Date.now()
      });
    });

    socket.on('join_order', (orderId) => {
      socket.join(`order_${orderId}`);
      console.log(`Socket ${socket.id} joined order_${orderId}`);
    });

    socket.on('update_order_location', (data) => {
      socket.to(`order_${data.orderId}`).emit('order_location_update', {
        role: data.role,
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: Date.now()
      });
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERROR] Port ${PORT} is already in use.`);
      console.error(`[FIX]   Run: npx kill-port ${PORT}   (or change PORT in your .env)\n`);
      process.exit(1);
    } else {
      throw err;
    }
  });

  // Graceful shutdown — nodemon sends SIGTERM on file-change restarts.
  // Closing the server here ensures the port is released before the new
  // process tries to bind, preventing the EADDRINUSE crash loop.
  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Graceful shutdown — closing server...`);
    server.closeAllConnections?.();
    server.close(async () => {
      await prisma.$disconnect();
      console.log('[Shutdown] Server closed. Port released.');
      process.exit(0);
    });
    // Force-exit after 3 s if connections hang
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  server.listen(PORT, () => {
    console.log(`Server with Socket.IO is running on port ${PORT}`);

    // Background interval loop (every 30 seconds for fast sandbox testing)
    setInterval(async () => {
      try {
        const now = new Date();
        // 1. Auto-release HELD escrows that have passed their autoReleaseAt time
        const expiredEscrows = await prisma.escrow.findMany({
          where: { status: 'HELD', autoReleaseAt: { lte: now } }
        });

        for (const escrow of expiredEscrows) {
          console.log(`[CronWorker] Auto-releasing escrow ID: ${escrow.id}`);
          await triggerSplitWebhook(escrow.id);
        }

        // 2. Auto-complete standard batch withdrawals (T+1 simulation, 1 minute threshold in sandbox)
        const cutoff = new Date(Date.now() - 60000); // 1 minute
        const pendingWithdrawals = await prisma.withdrawal.findMany({
          where: { status: 'PENDING', instant: false, createdAt: { lte: cutoff } }
        });

        if (pendingWithdrawals.length > 0) {
          const ids = pendingWithdrawals.map(w => w.id);
          await prisma.$transaction([
            prisma.withdrawal.updateMany({
              where: { id: { in: ids } },
              data: { status: 'COMPLETED' }
            }),
            prisma.transaction.updateMany({
              where: { referenceId: { in: ids }, type: 'WITHDRAWAL' },
              data: { status: 'COMPLETED' }
            })
          ]);
          console.log(`[CronWorker] Automatically settled ${ids.length} standard batch withdrawals.`);
        }
      } catch (err: any) {
        console.error('[CronWorkerError]', err.message);
      }
    }, 30000); // Check every 30 seconds
  });
}

export default app;
