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
require("./lib/env");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
// Capture unhandled errors so nodemon shows the real crash reason
process.on('uncaughtException', (err) => {
    console.error('[FATAL uncaughtException]', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL unhandledRejection]', reason);
    process.exit(1);
});
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
const parcels_1 = __importDefault(require("./routes/parcels"));
const slides_1 = __importDefault(require("./routes/slides"));
const errorHandler_1 = require("./middleware/errorHandler");
const prisma_1 = __importDefault(require("./lib/prisma"));
const wallet_2 = require("./lib/wallet");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Trust Render's (and most cloud providers') reverse proxy so that
// req.protocol, req.ip, and x-forwarded-* headers are correct.
app.set('trust proxy', 1);
app.use((0, cors_1.default)({
    origin: '*', // allow any origin (dev)
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
}));
// Webhook route must be parsed as raw body for Stripe signature verification
app.use('/api/payments/webhook', express_1.default.raw({ type: 'application/json' }));
app.use(express_1.default.json());
// Explicit APK download route — sets proper Content-Disposition so browsers
// download the file instead of rendering it as JSON / triggering a 404.
const sendApkFile = (res) => {
    const filePath = path_1.default.resolve(__dirname, '../uploads/fixmart-latest.apk');
    if (fs_1.default.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="fixmart-latest.apk"');
        return res.sendFile(filePath);
    }
    return res.status(404).json({
        error: 'Not Found',
        message: 'APK file not found on server. Please try again later.'
    });
};
app.get('/uploads/fixmart-latest.apk', (req, res) => sendApkFile(res));
app.get('/download/apk', (req, res) => sendApkFile(res));
app.get('/api/download/apk', (req, res) => sendApkFile(res));
// Explicit AAB download route
const sendAabFile = (res) => {
    const filePath = path_1.default.resolve(__dirname, '../uploads/fixmart-latest.aab');
    if (fs_1.default.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/x-authoritative-aab');
        res.setHeader('Content-Disposition', 'attachment; filename="fixmart-latest.aab"');
        return res.sendFile(filePath);
    }
    return res.status(404).json({
        error: 'Not Found',
        message: 'AAB file not found on server. Please try again later.'
    });
};
app.get('/uploads/fixmart-latest.aab', (req, res) => sendAabFile(res));
app.get('/download/aab', (req, res) => sendAabFile(res));
app.get('/api/download/aab', (req, res) => sendAabFile(res));
// Serve static uploads folder
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// ── Google SEO: Dynamic XML Sitemap ──────────────────────────────────────────
const generateSitemap = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const host = req.get('host') || 'fixmart.ng';
        const protocol = req.protocol || 'https';
        const baseUrl = `${protocol}://${host}`;
        const [products, services] = yield Promise.all([
            prisma_1.default.product.findMany({ select: { id: true, updatedAt: true } }),
            prisma_1.default.service.findMany({ select: { id: true, updatedAt: true } }),
        ]);
        const staticRoutes = [
            { loc: '/', changefreq: 'daily', priority: '1.0' },
            { loc: '/shop', changefreq: 'daily', priority: '0.9' },
            { loc: '/services', changefreq: 'daily', priority: '0.9' },
            { loc: '/login', changefreq: 'monthly', priority: '0.4' },
            { loc: '/signup', changefreq: 'monthly', priority: '0.5' },
        ];
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        // Static Pages
        staticRoutes.forEach((route) => {
            xml += `  <url>\n`;
            xml += `    <loc>${baseUrl}${route.loc}</loc>\n`;
            xml += `    <changefreq>${route.changefreq}</changefreq>\n`;
            xml += `    <priority>${route.priority}</priority>\n`;
            xml += `  </url>\n`;
        });
        // Dynamic Products
        products.forEach((p) => {
            xml += `  <url>\n`;
            xml += `    <loc>${baseUrl}/products/${p.id}</loc>\n`;
            xml += `    <lastmod>${(p.updatedAt || new Date()).toISOString()}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.8</priority>\n`;
            xml += `  </url>\n`;
        });
        // Dynamic Services
        services.forEach((s) => {
            xml += `  <url>\n`;
            xml += `    <loc>${baseUrl}/services/${s.id}</loc>\n`;
            xml += `    <lastmod>${(s.updatedAt || new Date()).toISOString()}</lastmod>\n`;
            xml += `    <changefreq>weekly</changefreq>\n`;
            xml += `    <priority>0.8</priority>\n`;
            xml += `  </url>\n`;
        });
        xml += `</urlset>`;
        res.header('Content-Type', 'application/xml');
        res.send(xml);
    }
    catch (error) {
        console.error('[GoogleSitemap] Failed to generate sitemap:', error);
        res.status(500).send('Error generating sitemap');
    }
});
app.get('/sitemap.xml', generateSitemap);
app.get('/api/sitemap.xml', generateSitemap);
// ── Google SEO: robots.txt ───────────────────────────────────────────────────
const sendRobotsTxt = (req, res) => {
    const host = req.get('host') || 'fixmart.ng';
    const protocol = req.protocol || 'https';
    const sitemapUrl = `${protocol}://${host}/sitemap.xml`;
    const robots = `# Google & Global Search Engine Crawler Rules
User-agent: Googlebot
Allow: /

User-agent: Googlebot-Image
Allow: /uploads/
Allow: /

User-agent: *
Allow: /
Disallow: /api/
Allow: /api/sitemap.xml
Allow: /api/robots.txt

Sitemap: ${sitemapUrl}
`;
    res.header('Content-Type', 'text/plain');
    res.send(robots);
};
app.get('/robots.txt', sendRobotsTxt);
app.get('/api/robots.txt', sendRobotsTxt);
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
app.use('/api/parcels', parcels_1.default);
app.use('/api/slides', slides_1.default);
// Fallback 404 handler for undefined routes / incorrect HTTP methods
app.use((req, res, next) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.originalUrl}`
    });
});
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
        // ── Resilient background cron worker ─────────────────────────────────────
        // Uses exponential back-off so a cold Supabase database doesn't spam logs.
        // Resets to the base interval (30 s) once the DB is reachable again.
        const CRON_BASE_MS = 30000; // 30 s normal interval
        const CRON_MAX_MS = 300000; // 5 min maximum back-off
        let cronDelay = CRON_BASE_MS;
        let cronTimer;
        // Prisma error codes for "can't reach DB" — treat these as transient
        const DB_UNREACHABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);
        const runCron = () => __awaiter(void 0, void 0, void 0, function* () {
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
                // 2. Auto-complete standard batch withdrawals (T+1 simulation, 1 min threshold in sandbox)
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
                // DB is healthy — reset to normal interval
                if (cronDelay !== CRON_BASE_MS) {
                    console.log('[CronWorker] Database reachable again — resuming normal 30 s interval.');
                    cronDelay = CRON_BASE_MS;
                }
            }
            catch (err) {
                const code = err === null || err === void 0 ? void 0 : err.code;
                if (code && DB_UNREACHABLE_CODES.has(code)) {
                    // Database is cold-starting or temporarily unreachable — back off
                    cronDelay = Math.min(cronDelay * 2, CRON_MAX_MS);
                    console.warn(`[CronWorker] Database unreachable (${code}) — ` +
                        `retrying in ${cronDelay / 1000}s. ` +
                        'Check DATABASE_URL is set correctly in Render Dashboard.');
                }
                else {
                    // Application-level error — log and keep normal interval
                    console.error('[CronWorkerError]', err.message);
                }
            }
            // Schedule the next tick with the current (possibly backed-off) delay
            cronTimer = setTimeout(runCron, cronDelay);
        });
        // Kick off the first run after the base delay
        cronTimer = setTimeout(runCron, cronDelay);
    });
}
exports.default = app;
