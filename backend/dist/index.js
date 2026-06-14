"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
// Load environment variables before importing routes
dotenv_1.default.config();
const products_1 = __importDefault(require("./routes/products"));
const services_1 = __importDefault(require("./routes/services"));
const bookings_1 = __importDefault(require("./routes/bookings"));
const orders_1 = __importDefault(require("./routes/orders"));
const payments_1 = __importDefault(require("./routes/payments"));
const auth_1 = __importDefault(require("./routes/auth"));
const reviews_1 = __importDefault(require("./routes/reviews"));
const settings_1 = __importDefault(require("./routes/settings"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const users_1 = __importDefault(require("./routes/users"));
const kyc_1 = __importDefault(require("./routes/kyc"));
const upload_1 = __importDefault(require("./routes/upload"));
const wallet_1 = __importDefault(require("./routes/wallet"));
const errorHandler_1 = require("./middleware/errorHandler");
const prisma_1 = __importDefault(require("./lib/prisma"));
const wallet_2 = require("./lib/wallet");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)({
    origin: '*', // allow any origin (dev)
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
}));
// Webhook route must be parsed as raw body for Stripe signature verification
app.use('/api/payments/webhook', express_1.default.raw({ type: 'application/json' }));
app.use(express_1.default.json());
// Serve static uploads folder
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Basic health check route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Backend is running smoothly.' });
});
// Auth Routes
app.use('/api/auth', auth_1.default);
// Feature Routes
app.use('/api/products', products_1.default);
app.use('/api/services', services_1.default);
app.use('/api/bookings', bookings_1.default);
app.use('/api/orders', orders_1.default);
app.use('/api/payments', payments_1.default);
app.use('/api/upload', upload_1.default);
app.use('/api/reviews', reviews_1.default);
app.use('/api/settings', settings_1.default);
app.use('/api/notifications', notifications_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/users', users_1.default);
app.use('/api/kyc', kyc_1.default);
app.use('/api/wallet', wallet_1.default);
// Centralized Error Handler
app.use(errorHandler_1.errorHandler);
if (process.env.NODE_ENV !== 'test') {
    const server = http_1.default.createServer(app);
    const io = new socket_io_1.Server(server, {
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
        socket.on('disconnect', () => {
            console.log('Socket disconnected:', socket.id);
        });
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n[ERROR] Port ${PORT} is already in use.`);
            console.error(`[FIX]   Run: npx kill-port ${PORT}   (or change PORT in your .env)\n`);
            process.exit(1);
        }
        else {
            throw err;
        }
    });
    // Graceful shutdown — nodemon sends SIGTERM on file-change restarts.
    // Closing the server here ensures the port is released before the new
    // process tries to bind, preventing the EADDRINUSE crash loop.
    const shutdown = (signal) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        console.log(`\n[${signal}] Graceful shutdown — closing server...`);
        (_a = server.closeAllConnections) === null || _a === void 0 ? void 0 : _a.call(server);
        server.close(() => __awaiter(void 0, void 0, void 0, function* () {
            yield prisma_1.default.$disconnect();
            console.log('[Shutdown] Server closed. Port released.');
            process.exit(0);
        }));
        // Force-exit after 3 s if connections hang
        setTimeout(() => process.exit(0), 3000).unref();
    });
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    server.listen(PORT, () => {
        console.log(`Server with Socket.IO is running on port ${PORT}`);
        // Background interval loop (every 30 seconds for fast sandbox testing)
        setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const now = new Date();
                // 1. Auto-release HELD escrows that have passed their autoReleaseAt time
                const expiredEscrows = yield prisma_1.default.escrow.findMany({
                    where: { status: 'HELD', autoReleaseAt: { lte: now } }
                });
                for (const escrow of expiredEscrows) {
                    console.log(`[CronWorker] Auto-releasing escrow ID: ${escrow.id}`);
                    yield (0, wallet_2.triggerSplitWebhook)(escrow.id);
                }
                // 2. Auto-complete standard batch withdrawals (T+1 simulation, 1 minute threshold in sandbox)
                const cutoff = new Date(Date.now() - 60000); // 1 minute
                const pendingWithdrawals = yield prisma_1.default.withdrawal.findMany({
                    where: { status: 'PENDING', instant: false, createdAt: { lte: cutoff } }
                });
                if (pendingWithdrawals.length > 0) {
                    const ids = pendingWithdrawals.map(w => w.id);
                    yield prisma_1.default.$transaction([
                        prisma_1.default.withdrawal.updateMany({
                            where: { id: { in: ids } },
                            data: { status: 'COMPLETED' }
                        }),
                        prisma_1.default.transaction.updateMany({
                            where: { referenceId: { in: ids }, type: 'WITHDRAWAL' },
                            data: { status: 'COMPLETED' }
                        })
                    ]);
                    console.log(`[CronWorker] Automatically settled ${ids.length} standard batch withdrawals.`);
                }
            }
            catch (err) {
                console.error('[CronWorkerError]', err.message);
            }
        }), 30000); // Check every 30 seconds
    });
}
exports.default = app;
