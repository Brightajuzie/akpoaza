import './lib/env';
import express from 'express';
import cors from 'cors';
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
import slidesRoutes from './routes/slides';
import { errorHandler } from './middleware/errorHandler';
import prisma from './lib/prisma';
import { triggerSplitWebhook } from './lib/wallet';

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Render's (and most cloud providers') reverse proxy so that
// req.protocol, req.ip, and x-forwarded-* headers are correct.
app.set('trust proxy', 1);

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

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Welcome to the FixMart Backend API!',
    health: `${req.protocol}://${req.get('host')}/health`
  });
});

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
app.use('/api/slides', slidesRoutes);

// Fallback 404 handler for undefined routes / incorrect HTTP methods
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

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

    // ── Resilient background cron worker ─────────────────────────────────────
    // Uses exponential back-off so a cold Supabase database doesn't spam logs.
    // Resets to the base interval (30 s) once the DB is reachable again.
    const CRON_BASE_MS  = 30_000;   // 30 s normal interval
    const CRON_MAX_MS   = 300_000;  // 5 min maximum back-off
    let   cronDelay     = CRON_BASE_MS;
    let   cronTimer: ReturnType<typeof setTimeout>;

    // Prisma error codes for "can't reach DB" — treat these as transient
    const DB_UNREACHABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

    const runCron = async () => {
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

        // 2. Auto-complete standard batch withdrawals (T+1 simulation, 1 min threshold in sandbox)
        const cutoff = new Date(Date.now() - 60_000); // 1 minute
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

        // DB is healthy — reset to normal interval
        if (cronDelay !== CRON_BASE_MS) {
          console.log('[CronWorker] Database reachable again — resuming normal 30 s interval.');
          cronDelay = CRON_BASE_MS;
        }
      } catch (err: any) {
        const code: string | undefined = err?.code;
        if (code && DB_UNREACHABLE_CODES.has(code)) {
          // Database is cold-starting or temporarily unreachable — back off
          cronDelay = Math.min(cronDelay * 2, CRON_MAX_MS);
          console.warn(
            `[CronWorker] Database unreachable (${code}) — ` +
            `retrying in ${cronDelay / 1000}s. ` +
            'Check DATABASE_URL is set correctly in Render Dashboard.'
          );
        } else {
          // Application-level error — log and keep normal interval
          console.error('[CronWorkerError]', err.message);
        }
      }

      // Schedule the next tick with the current (possibly backed-off) delay
      cronTimer = setTimeout(runCron, cronDelay);
    };

    // Kick off the first run after the base delay
    cronTimer = setTimeout(runCron, cronDelay);
  });
}

export default app;
