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
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const notify_1 = require("../lib/notify");
const prisma_1 = __importDefault(require("../lib/prisma"));
const wallet_1 = require("../lib/wallet");
const location_1 = require("../lib/location");
const router = (0, express_1.Router)();
function getDistanceKm(lat1, lon1, lat2, lon2) {
    return (0, location_1.haversineDistanceKm)(lat1, lon1, lat2, lon2);
}
// Get orders for a user
router.get('/', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const orders = yield prisma_1.default.order.findMany({
            where: { userId },
            include: { items: { include: { product: true } }, escrows: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(orders);
    }
    catch (error) {
        next(error);
    }
}));
// Get sales / order items for products owned by a vendor
router.get('/vendor', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
    if (role !== 'VENDOR' && role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Vendor or Admin role required.' });
    }
    try {
        const orderItems = yield prisma_1.default.orderItem.findMany({
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
    }
    catch (error) {
        next(error);
    }
}));
// Guest Checkout for unauthenticated users
router.post('/guest-checkout', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { items, paymentProvider, guestEmail, guestName, guestPhone, deliveryAddress, latitude, longitude } = req.body;
    if (!guestEmail || !guestName) {
        return res.status(400).json({ error: 'Guest email and name are required for checkout' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items are required for checkout' });
    }
    try {
        // 1. Find or create guest user account
        let user = yield prisma_1.default.user.findUnique({ where: { email: guestEmail.trim() } });
        if (!user) {
            user = yield prisma_1.default.user.create({
                data: {
                    email: guestEmail.trim(),
                    name: guestName.trim(),
                    phone: guestPhone ? guestPhone.trim() : null,
                    address: deliveryAddress ? deliveryAddress.trim() : null,
                    role: 'CUSTOMER',
                    verificationStatus: 'VERIFIED',
                },
            });
        }
        const userId = user.id;
        // 2. Validate products and calculate total amount
        const productIds = items.map((i) => String(i.productId));
        const dbProducts = yield prisma_1.default.product.findMany({
            where: { id: { in: productIds } },
            include: { vendor: { select: { id: true, name: true, email: true, phone: true } } },
        });
        const dbProductsMap = new Map(dbProducts.map((p) => [p.id, p]));
        let computedTotalAmount = 0;
        const checkoutItems = [];
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
                price: dbProduct.price,
            });
        }
        // 3. Proximity Rider Assignment
        let assignedRiderId = null;
        let riderDistance = null;
        const cLat = latitude ? parseFloat(latitude) : null;
        const cLng = longitude ? parseFloat(longitude) : null;
        if (cLat !== null && cLng !== null) {
            const riders = yield prisma_1.default.user.findMany({
                where: {
                    role: 'RIDER',
                    verificationStatus: 'VERIFIED',
                    OR: [
                        { currentLat: { not: null }, currentLng: { not: null } },
                        { latitude: { not: null }, longitude: { not: null } },
                    ],
                },
            });
            const ridersWithDist = riders
                .map((r) => {
                const lat = r.currentLat !== null ? r.currentLat : r.latitude;
                const lng = r.currentLng !== null ? r.currentLng : r.longitude;
                return {
                    rider: r,
                    dist: getDistanceKm(cLat, cLng, lat, lng),
                };
            })
                .sort((a, b) => a.dist - b.dist);
            if (ridersWithDist.length > 0 && ridersWithDist[0].dist <= 100) {
                assignedRiderId = ridersWithDist[0].rider.id;
                riderDistance = Math.round(ridersWithDist[0].dist * 10) / 10;
            }
        }
        // 4. Create Order with stock deduction in transaction
        const order = yield prisma_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            for (const item of items) {
                yield tx.product.update({
                    where: { id: item.productId },
                    data: {
                        stock: { decrement: item.quantity },
                    },
                });
            }
            return tx.order.create({
                data: {
                    userId,
                    riderId: assignedRiderId,
                    deliveryAddress: deliveryAddress || (user === null || user === void 0 ? void 0 : user.address) || null,
                    totalAmount: computedTotalAmount,
                    paymentProvider: paymentProvider || 'NONE',
                    status: 'PENDING',
                    items: {
                        create: checkoutItems,
                    },
                },
                include: { items: true, rider: true },
            });
        }));
        // ── Multi-channel notifications for guest checkout ──────────────────
        try {
            const itemsSummary = dbProducts.map(p => {
                const req = items.find((i) => i.productId === p.id);
                return `${(req === null || req === void 0 ? void 0 : req.quantity) || 1}× ${p.name}`;
            }).join(', ');
            const isPOD = !paymentProvider || paymentProvider === 'NONE';
            const customerTitle = isPOD ? '📦 Order Placed (Pay on Delivery)' : '🛒 Order Placed Successfully';
            const customerBody = `Your order for ${itemsSummary} (₦${computedTotalAmount.toLocaleString()}) has been placed. Your product will be delivered within a few hours, and a rider will call you to confirm your location.`;
            // 1. Customer — in-app, SMS, email
            (0, notify_1.sendNotification)({
                userId,
                title: customerTitle,
                body: customerBody,
                type: 'ORDER',
                referenceId: order.id,
                email: user.email,
                phone: user.phone || undefined,
                emailSubject: '📦 Order Confirmation & Delivery Notice — FixMart',
                emailHtml: `<p style="font-size:16px;color:#374151">Hi ${user.name || 'there'},</p>
          <p>Thank you for shopping with <strong>FixMart</strong>! Your order has been placed successfully.</p>
          <div style="background:#F3F4F6;border-left:4px solid #10B981;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;font-size:15px;color:#065F46;font-weight:600">🚚 Delivery Update:</p>
            <p style="margin:4px 0 0;font-size:14px;color:#1F2937">Your product will be delivered within a few hours. A rider will call you shortly to confirm your location.</p>
          </div>
          <p><strong>Items:</strong> ${itemsSummary}</p>
          <p><strong>Total:</strong> ₦${computedTotalAmount.toLocaleString()}</p>
          <p><strong>Payment Method:</strong> ${isPOD ? 'Cash / Transfer on Delivery' : paymentProvider}</p>
          <p><strong>Delivery Address:</strong> ${order.deliveryAddress || 'Not specified'}</p>`,
            }).catch(() => { });
            // 2. Admins — new order alert
            const admins = yield prisma_1.default.user.findMany({
                where: { role: 'ADMIN' },
                select: { id: true, email: true },
            });
            for (const admin of admins) {
                (0, notify_1.sendNotification)({
                    userId: admin.id,
                    title: `📦 New Order Placed: #${order.id.slice(-6).toUpperCase()}`,
                    body: `Customer ${user.name || user.email} placed an order (${itemsSummary}) totaling ₦${computedTotalAmount.toLocaleString()}. Delivery required within a few hours.`,
                    type: 'ORDER',
                    referenceId: order.id,
                    email: admin.email,
                    emailSubject: `📦 [Admin Alert] New Order #${order.id.slice(-6).toUpperCase()} Placed`,
                    emailHtml: `<p>A new order has been placed on FixMart.</p>
            <p><strong>Order ID:</strong> ${order.id}</p>
            <p><strong>Customer:</strong> ${user.name} (${user.email})</p>
            <p><strong>Items:</strong> ${itemsSummary}</p>
            <p><strong>Total:</strong> ₦${computedTotalAmount.toLocaleString()}</p>
            <p><strong>Payment:</strong> ${isPOD ? 'Pay on Delivery' : paymentProvider}</p>
            <p><strong>Delivery Address:</strong> ${order.deliveryAddress || 'Not provided'}</p>
            <p>A rider should be dispatched to deliver within a few hours.</p>`,
                }).catch(() => { });
            }
            // 3. Assigned Rider notification
            if (assignedRiderId) {
                (0, notify_1.sendNotification)({
                    userId: assignedRiderId,
                    title: '🛵 New Delivery Dispatch Assigned',
                    body: `You have been assigned to deliver order #${order.id.slice(-6).toUpperCase()} to ${user.name}. Please call customer to confirm location.`,
                    type: 'ORDER',
                    referenceId: order.id,
                    emailSubject: '🛵 Delivery Dispatch Assigned — FixMart',
                    emailHtml: `<p>You have a new delivery assignment.</p>
            <p><strong>Customer:</strong> ${user.name} (${user.phone || 'Phone on file'})</p>
            <p><strong>Destination:</strong> ${order.deliveryAddress || 'See in app'}</p>
            <p>Please call the customer to confirm their location and deliver within a few hours.</p>`,
                }).catch(() => { });
            }
            // 4. Vendor notifications — alert each merchant whose items were bought
            const vendorItemsMap = new Map();
            for (const p of dbProducts) {
                if (p.vendorId) {
                    const req = items.find((i) => String(i.productId) === String(p.id));
                    const qty = (req === null || req === void 0 ? void 0 : req.quantity) || 1;
                    const subtotal = p.price * qty;
                    if (!vendorItemsMap.has(p.vendorId)) {
                        vendorItemsMap.set(p.vendorId, { vendor: p.vendor, items: [], subtotal: 0 });
                    }
                    const entry = vendorItemsMap.get(p.vendorId);
                    entry.items.push({ name: p.name, quantity: qty, price: p.price });
                    entry.subtotal += subtotal;
                }
            }
            for (const [vId, vData] of vendorItemsMap) {
                const vSummary = vData.items.map(i => `${i.quantity}× ${i.name}`).join(', ');
                (0, notify_1.sendNotification)({
                    userId: vId,
                    title: `🛍️ New Order Received: #${order.id.slice(-6).toUpperCase()}`,
                    body: `New sale: ${vSummary}. Subtotal: ₦${vData.subtotal.toLocaleString()}. Please prepare items for dispatch.`,
                    type: 'ORDER',
                    referenceId: order.id,
                    email: (_a = vData.vendor) === null || _a === void 0 ? void 0 : _a.email,
                    phone: ((_b = vData.vendor) === null || _b === void 0 ? void 0 : _b.phone) || undefined,
                    emailSubject: `🛍️ New Order #${order.id.slice(-6).toUpperCase()} for Your Products — FixMart`,
                    emailHtml: `<p style="font-size:16px;color:#374151">Hi ${((_c = vData.vendor) === null || _c === void 0 ? void 0 : _c.name) || 'Vendor'},</p>
            <p>Great news! A customer has placed an order for item(s) from your store on <strong>FixMart</strong>.</p>
            <div style="background:#F0FDF4;border-left:4px solid #10B981;padding:12px 16px;margin:16px 0;border-radius:4px;">
              <p style="margin:0;font-size:15px;color:#065F46;font-weight:700">📦 Order #${order.id.slice(-6).toUpperCase()}:</p>
              <p style="margin:4px 0 0;font-size:14px;color:#1F2937"><strong>Your Items:</strong> ${vSummary}</p>
              <p style="margin:4px 0 0;font-size:14px;color:#1F2937"><strong>Your Subtotal:</strong> ₦${vData.subtotal.toLocaleString()}</p>
              <p style="margin:4px 0 0;font-size:14px;color:#1F2937"><strong>Delivery Destination:</strong> ${order.deliveryAddress || 'Address on file'}</p>
            </div>
            <p>Please package the items and have them ready for rider pickup and dispatch.</p>`,
                }).catch((e) => console.error('[guest-checkout] Vendor notification error:', e));
            }
        }
        catch (e) {
            console.error('[guest-checkout] Notification error:', e);
        }
        res.status(201).json({
            message: 'Guest order created successfully',
            order,
            riderDistance,
            isGuest: true,
            guestEmail: user.email,
        });
    }
    catch (error) {
        next(error);
    }
}));
// Create an order (Checkout with Stock Verification and Backend Price Calculation)
router.post('/checkout', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const { items, paymentProvider, deliveryAddress, latitude, longitude } = req.body;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items are required for checkout' });
    }
    try {
        // 1. Gather all product IDs to query
        const productIds = items.map((i) => String(i.productId));
        const dbProducts = yield prisma_1.default.product.findMany({
            where: { id: { in: productIds } },
            include: { vendor: { select: { id: true, name: true, email: true, phone: true } } },
        });
        const dbProductsMap = new Map(dbProducts.map(p => [p.id, p]));
        // 2. Validate stock and calculate true total amount based on DB prices
        let computedTotalAmount = 0;
        const checkoutItems = [];
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
        // 2.5 Proximity Rider Assignment
        let assignedRiderId = null;
        let riderDistance = null;
        const cLat = latitude ? parseFloat(latitude) : null;
        const cLng = longitude ? parseFloat(longitude) : null;
        if (cLat !== null && cLng !== null) {
            const riders = yield prisma_1.default.user.findMany({
                where: {
                    role: 'RIDER',
                    verificationStatus: 'VERIFIED',
                    OR: [
                        { currentLat: { not: null }, currentLng: { not: null } },
                        { latitude: { not: null }, longitude: { not: null } },
                    ],
                },
            });
            const ridersWithDist = riders
                .map((r) => {
                const lat = r.currentLat !== null ? r.currentLat : r.latitude;
                const lng = r.currentLng !== null ? r.currentLng : r.longitude;
                return {
                    rider: r,
                    dist: getDistanceKm(cLat, cLng, lat, lng),
                };
            })
                .sort((a, b) => a.dist - b.dist);
            if (ridersWithDist.length > 0 && ridersWithDist[0].dist <= 100) {
                assignedRiderId = ridersWithDist[0].rider.id;
                riderDistance = Math.round(ridersWithDist[0].dist * 10) / 10;
            }
        }
        // 3. Process stock deduction and order creation in a transaction
        const order = yield prisma_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // Decrement stock for each product
            for (const item of items) {
                yield tx.product.update({
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
                    riderId: assignedRiderId,
                    deliveryAddress: deliveryAddress || null,
                    totalAmount: computedTotalAmount,
                    paymentProvider: paymentProvider || 'NONE',
                    status: 'PENDING',
                    items: {
                        create: checkoutItems,
                    },
                },
                include: { items: true, rider: true },
            });
        }));
        // ── Multi-channel notifications ──────────────────────────────────────
        try {
            const customer = yield prisma_1.default.user.findUnique({
                where: { id: userId },
                select: { name: true, email: true, phone: true },
            });
            const itemsSummary = dbProducts.map(p => {
                const req = items.find((i) => i.productId === p.id);
                return `${(req === null || req === void 0 ? void 0 : req.quantity) || 1}× ${p.name}`;
            }).join(', ');
            const isPOD = !paymentProvider || paymentProvider === 'NONE';
            const customerTitle = isPOD ? '📦 Order Placed (Pay on Delivery)' : '🛒 Order Placed Successfully';
            const customerBody = `Your order for ${itemsSummary} (₦${computedTotalAmount.toLocaleString()}) has been placed. Your product will be delivered within a few hours, and a rider will call you to confirm your location.`;
            // 1. Customer — order confirmation and delivery notice
            (0, notify_1.sendNotification)({
                userId,
                title: customerTitle,
                body: customerBody,
                type: 'ORDER',
                referenceId: order.id,
                emailSubject: '📦 Order Confirmation & Delivery Notice — FixMart',
                emailHtml: `<p style="font-size:16px;color:#374151">Hi ${(customer === null || customer === void 0 ? void 0 : customer.name) || 'there'},</p>
          <p>Thank you for shopping with <strong>FixMart</strong>! Your order has been placed successfully.</p>
          <div style="background:#F3F4F6;border-left:4px solid #10B981;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;font-size:15px;color:#065F46;font-weight:600">🚚 Delivery Update:</p>
            <p style="margin:4px 0 0;font-size:14px;color:#1F2937">Your product will be delivered within a few hours. A rider will call you shortly to confirm your location.</p>
          </div>
          <p><strong>Items:</strong> ${itemsSummary}</p>
          <p><strong>Total:</strong> ₦${computedTotalAmount.toLocaleString()}</p>
          <p><strong>Payment Method:</strong> ${isPOD ? 'Cash / Transfer on Delivery' : paymentProvider}</p>
          <p><strong>Delivery Address:</strong> ${order.deliveryAddress || 'Not specified'}</p>`,
            }).catch(() => { });
            // 2. Admins — new order alert
            const admins = yield prisma_1.default.user.findMany({
                where: { role: 'ADMIN' },
                select: { id: true, email: true },
            });
            for (const admin of admins) {
                (0, notify_1.sendNotification)({
                    userId: admin.id,
                    title: `📦 New Order Placed: #${order.id.slice(-6).toUpperCase()}`,
                    body: `Order #${order.id.slice(-6).toUpperCase()} placed by ${(customer === null || customer === void 0 ? void 0 : customer.name) || (customer === null || customer === void 0 ? void 0 : customer.email) || 'Customer'} (${itemsSummary}) totaling ₦${computedTotalAmount.toLocaleString()}. Delivery required within a few hours.`,
                    type: 'ORDER',
                    referenceId: order.id,
                    email: admin.email,
                    emailSubject: `📦 [Admin Alert] New Order #${order.id.slice(-6).toUpperCase()} Placed`,
                    emailHtml: `<p>A new order has been placed on FixMart.</p>
            <p><strong>Order ID:</strong> ${order.id}</p>
            <p><strong>Customer:</strong> ${(customer === null || customer === void 0 ? void 0 : customer.name) || 'Customer'} (${(customer === null || customer === void 0 ? void 0 : customer.email) || 'N/A'})</p>
            <p><strong>Items:</strong> ${itemsSummary}</p>
            <p><strong>Total:</strong> ₦${computedTotalAmount.toLocaleString()}</p>
            <p><strong>Payment:</strong> ${isPOD ? 'Pay on Delivery' : paymentProvider}</p>
            <p><strong>Delivery Address:</strong> ${order.deliveryAddress || 'Not provided'}</p>
            <p>A rider should be dispatched to deliver within a few hours.</p>`,
                }).catch(() => { });
            }
            // 3. Assigned Rider notification
            if (assignedRiderId) {
                (0, notify_1.sendNotification)({
                    userId: assignedRiderId,
                    title: '🛵 New Delivery Dispatch Assigned',
                    body: `You have been assigned to deliver order #${order.id.slice(-6).toUpperCase()} to ${(customer === null || customer === void 0 ? void 0 : customer.name) || 'Customer'}. Please call customer to confirm location.`,
                    type: 'ORDER',
                    referenceId: order.id,
                    emailSubject: '🛵 Delivery Dispatch Assigned — FixMart',
                    emailHtml: `<p>You have a new delivery assignment.</p>
            <p><strong>Customer:</strong> ${(customer === null || customer === void 0 ? void 0 : customer.name) || 'Customer'} (${(customer === null || customer === void 0 ? void 0 : customer.phone) || 'Phone on file'})</p>
            <p><strong>Destination:</strong> ${order.deliveryAddress || 'See in app'}</p>
            <p>Please call the customer to confirm their location and deliver within a few hours.</p>`,
                }).catch(() => { });
            }
            // 4. Each vendor — new order alert with specific items and subtotal
            const vendorItemsMap = new Map();
            for (const p of dbProducts) {
                if (p.vendorId) {
                    const req = items.find((i) => String(i.productId) === String(p.id));
                    const qty = (req === null || req === void 0 ? void 0 : req.quantity) || 1;
                    const subtotal = p.price * qty;
                    if (!vendorItemsMap.has(p.vendorId)) {
                        vendorItemsMap.set(p.vendorId, { vendor: p.vendor, items: [], subtotal: 0 });
                    }
                    const entry = vendorItemsMap.get(p.vendorId);
                    entry.items.push({ name: p.name, quantity: qty, price: p.price });
                    entry.subtotal += subtotal;
                }
            }
            for (const [vId, vData] of vendorItemsMap) {
                const vSummary = vData.items.map(i => `${i.quantity}× ${i.name}`).join(', ');
                (0, notify_1.sendNotification)({
                    userId: vId,
                    title: `🛍️ New Order Received: #${order.id.slice(-6).toUpperCase()}`,
                    body: `New sale: ${vSummary}. Subtotal: ₦${vData.subtotal.toLocaleString()}. Please prepare items for dispatch.`,
                    type: 'ORDER',
                    referenceId: order.id,
                    email: (_b = vData.vendor) === null || _b === void 0 ? void 0 : _b.email,
                    phone: ((_c = vData.vendor) === null || _c === void 0 ? void 0 : _c.phone) || undefined,
                    emailSubject: `🛍️ New Order #${order.id.slice(-6).toUpperCase()} for Your Products — FixMart`,
                    emailHtml: `<p style="font-size:16px;color:#374151">Hi ${((_d = vData.vendor) === null || _d === void 0 ? void 0 : _d.name) || 'Vendor'},</p>
            <p>Great news! A customer has placed an order for item(s) from your store on <strong>FixMart</strong>.</p>
            <div style="background:#F0FDF4;border-left:4px solid #10B981;padding:12px 16px;margin:16px 0;border-radius:4px;">
              <p style="margin:0;font-size:15px;color:#065F46;font-weight:700">📦 Order #${order.id.slice(-6).toUpperCase()}:</p>
              <p style="margin:4px 0 0;font-size:14px;color:#1F2937"><strong>Customer:</strong> ${(customer === null || customer === void 0 ? void 0 : customer.name) || 'Customer'}</p>
              <p style="margin:4px 0 0;font-size:14px;color:#1F2937"><strong>Your Items:</strong> ${vSummary}</p>
              <p style="margin:4px 0 0;font-size:14px;color:#1F2937"><strong>Your Subtotal:</strong> ₦${vData.subtotal.toLocaleString()}</p>
              <p style="margin:4px 0 0;font-size:14px;color:#1F2937"><strong>Delivery Destination:</strong> ${order.deliveryAddress || 'Address on file'}</p>
            </div>
            <p>Please package the items and keep them ready for rider pickup and delivery.</p>`,
                }).catch((e) => console.error('[checkout] Vendor notification error:', e));
            }
        }
        catch (e) {
            console.error('[orders] Failed to dispatch notifications:', e);
        }
        res.status(201).json({ message: 'Order created successfully', order, riderDistance });
    }
    catch (error) {
        next(error);
    }
}));
// Update Order Status (Cancel or Ship/Deliver)
router.patch('/:id/status', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id } = req.params;
    const { status } = req.body;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
    if (!status)
        return res.status(400).json({ error: 'Status is required' });
    const validStatuses = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid order status' });
    }
    try {
        const order = yield prisma_1.default.order.findUnique({
            where: { id },
            include: { items: true },
        });
        if (!order)
            return res.status(404).json({ error: 'Order not found' });
        // Permissions check
        if (status === 'CANCELLED') {
            // Customers can cancel their own orders if they are pending, admins can cancel anything
            if (role !== 'ADMIN' && order.userId !== userId) {
                return res.status(403).json({ error: 'Forbidden. You do not have permission to cancel this order.' });
            }
            if (order.status === 'CANCELLED') {
                return res.status(400).json({ error: 'Order is already cancelled' });
            }
        }
        else {
            // Shipping and delivering requires Vendor, Admin, or the assigned Rider
            if (role !== 'ADMIN' && role !== 'VENDOR' && !(role === 'RIDER' && order.riderId === userId)) {
                return res.status(403).json({ error: 'Forbidden. Vendor, Admin, or assigned Rider access required.' });
            }
        }
        // Execute state update (with inventory release on cancellation)
        let updatedOrder;
        if (status === 'CANCELLED') {
            const updates = order.items.map((item) => prisma_1.default.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
            }));
            updates.push(prisma_1.default.order.update({
                where: { id },
                data: { status },
            }));
            const results = yield prisma_1.default.$transaction(updates);
            updatedOrder = results[results.length - 1];
        }
        else {
            updatedOrder = yield prisma_1.default.order.update({
                where: { id },
                data: { status },
            });
        }
        if (status === 'DELIVERED') {
            yield prisma_1.default.escrow.updateMany({
                where: { orderId: id, status: 'HELD' },
                data: { autoReleaseAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
            });
        }
        // ── Multi-channel notification to customer on status change ─────────
        const statusMessages = {
            PAID: { title: '💳 Payment Confirmed', body: `Your payment for order #${id.slice(-8).toUpperCase()} has been confirmed. We are preparing your items.` },
            SHIPPED: { title: '🚚 Order Shipped', body: `Great news! Your order #${id.slice(-8).toUpperCase()} is on its way. Track it in the app.` },
            DELIVERED: { title: '✅ Order Delivered', body: `Your order #${id.slice(-8).toUpperCase()} has been delivered. Please confirm receipt in the app to release payment.` },
            CANCELLED: { title: '❌ Order Cancelled', body: `Your order #${id.slice(-8).toUpperCase()} has been cancelled. If this was unexpected, please contact support.` },
        };
        const msgData = statusMessages[status];
        if (msgData) {
            (0, notify_1.sendNotification)({
                userId: order.userId,
                title: msgData.title,
                body: msgData.body,
                type: 'ORDER',
                referenceId: id,
                emailSubject: msgData.title,
            }).catch(() => { });
        }
        res.json({ message: `Order status updated to ${status}`, order: updatedOrder });
    }
    catch (error) {
        next(error);
    }
}));
// Customer confirms item received (releases escrow)
router.post('/:id/confirm-receipt', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const order = yield prisma_1.default.order.findUnique({
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
        const escrows = yield prisma_1.default.escrow.findMany({
            where: { orderId: id, status: 'HELD' },
        });
        if (escrows.length === 0) {
            return res.status(400).json({ error: 'No active pending payments held in escrow for this order.' });
        }
        // Trigger the split webhook for each escrow
        for (const escrow of escrows) {
            yield (0, wallet_1.triggerSplitWebhook)(escrow.id);
        }
        // Force update status of order to DELIVERED if not already
        const updatedOrder = yield prisma_1.default.order.update({
            where: { id },
            data: { status: 'DELIVERED' },
        });
        res.json({ success: true, message: 'Order receipt confirmed and funds released.', order: updatedOrder });
    }
    catch (error) {
        next(error);
    }
}));
// Admin: Get all orders across all users
router.get('/admin/all', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    try {
        const orders = yield prisma_1.default.order.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { id: true, name: true, email: true, phone: true, address: true } },
                items: { include: { product: true } },
                rider: { select: { id: true, name: true, phone: true, vehicleType: true, licensePlate: true } }
            },
        });
        res.json(orders);
    }
    catch (error) {
        next(error);
    }
}));
// Admin: List all verified riders (for assignment picker)
router.get('/riders', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    try {
        const riders = yield prisma_1.default.user.findMany({
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
    }
    catch (error) {
        next(error);
    }
}));
// Admin: Assign a rider to a paid/shipped order
router.patch('/:id/assign-rider', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const { id } = req.params;
    const { riderId } = req.body;
    try {
        const order = yield prisma_1.default.order.findUnique({ where: { id } });
        if (!order)
            return res.status(404).json({ error: 'Order not found' });
        if (riderId) {
            const rider = yield prisma_1.default.user.findFirst({
                where: { id: riderId, role: 'RIDER', verificationStatus: 'VERIFIED' }
            });
            if (!rider) {
                return res.status(400).json({ error: 'Selected rider is not verified or does not exist.' });
            }
        }
        const updatedOrder = yield prisma_1.default.order.update({
            where: { id },
            data: { riderId: riderId || null },
            include: {
                user: { select: { id: true, name: true } },
                rider: { select: { id: true, name: true } }
            }
        });
        if (riderId) {
            // Notify customer that a rider has been assigned
            (0, notify_1.sendNotification)({
                userId: updatedOrder.userId,
                title: '🚚 Rider Assigned to Your Order',
                body: `Rider ${(_b = updatedOrder.rider) === null || _b === void 0 ? void 0 : _b.name} has been assigned to deliver your order #${id.slice(-8).toUpperCase()}. Track them live in the app.`,
                type: 'ORDER',
                referenceId: id,
                emailSubject: '🚚 Your Rider Has Been Assigned — FixMart',
                emailHtml: `<p>A rider has been assigned to your order!</p>
          <p><strong>Rider:</strong> ${(_c = updatedOrder.rider) === null || _c === void 0 ? void 0 : _c.name}</p>
          <p><strong>Order:</strong> #${id.slice(-8).toUpperCase()}</p>
          <p>Open the app to track your rider's location in real time.</p>`,
            }).catch(() => { });
            // Notify rider of the new delivery job
            (0, notify_1.sendNotification)({
                userId: riderId,
                title: '📦 New Delivery Job',
                body: `You have been assigned to deliver order #${id.slice(-8).toUpperCase()} to ${updatedOrder.user.name}. Please check the app for full details.`,
                type: 'ORDER',
                referenceId: id,
                emailSubject: '📦 New Delivery Assigned — FixMart',
            }).catch(() => { });
        }
        res.json(updatedOrder);
    }
    catch (error) {
        next(error);
    }
}));
// Rider: Get available deliveries (paid/shipped without rider or assigned to me)
router.get('/rider/available', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
    if (role !== 'RIDER') {
        return res.status(403).json({ error: 'Forbidden. Rider access required.' });
    }
    try {
        const orders = yield prisma_1.default.order.findMany({
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
    }
    catch (error) {
        next(error);
    }
}));
// Rider: Accept a delivery self-assign
router.patch('/:id/accept-delivery', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
    if (role !== 'RIDER') {
        return res.status(403).json({ error: 'Forbidden. Rider access required.' });
    }
    const { id } = req.params;
    try {
        const order = yield prisma_1.default.order.findUnique({ where: { id } });
        if (!order)
            return res.status(404).json({ error: 'Order not found' });
        if (order.riderId && order.riderId !== userId) {
            return res.status(400).json({ error: 'This delivery has already been accepted by another rider.' });
        }
        const updatedOrder = yield prisma_1.default.order.update({
            where: { id },
            data: { riderId: userId },
            include: {
                user: { select: { id: true, name: true } },
                rider: { select: { id: true, name: true } }
            }
        });
        (0, notify_1.sendNotification)({
            userId: updatedOrder.userId,
            title: '🚚 Rider On the Way',
            body: `Rider ${(_c = updatedOrder.rider) === null || _c === void 0 ? void 0 : _c.name} accepted your delivery and is on the way with order #${id.slice(-8).toUpperCase()}.`,
            type: 'ORDER',
            referenceId: id,
            emailSubject: '🚚 Rider is On the Way — FixMart',
        }).catch(() => { });
        res.json(updatedOrder);
    }
    catch (error) {
        next(error);
    }
}));
// Get real-time coordinates/tracking for an order (called by customer or rider)
router.get('/:id/location', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const order = yield prisma_1.default.order.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                riderId: true,
                status: true,
            }
        });
        if (!order)
            return res.status(404).json({ error: 'Order not found' });
        const customer = yield prisma_1.default.user.findUnique({
            where: { id: order.userId },
            select: { name: true, address: true, latitude: true, longitude: true }
        });
        let riderLocation = null;
        if (order.riderId) {
            const rider = yield prisma_1.default.user.findUnique({
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
                name: customer === null || customer === void 0 ? void 0 : customer.name,
                address: customer === null || customer === void 0 ? void 0 : customer.address,
                lat: customer === null || customer === void 0 ? void 0 : customer.latitude,
                lng: customer === null || customer === void 0 ? void 0 : customer.longitude,
            },
            riderLocation,
        });
    }
    catch (error) {
        next(error);
    }
}));
// Rider: Earnings summary + trip history
router.get('/rider/earnings', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
    if (role !== 'RIDER')
        return res.status(403).json({ error: 'Rider access required.' });
    try {
        // Wallet balance
        const wallet = yield prisma_1.default.wallet.findUnique({
            where: { userId },
            select: { balance: true, pendingBalance: true }
        });
        // Escrows earned from orders
        const orderEscrows = yield prisma_1.default.escrow.findMany({
            where: { providerId: userId, order: { isNot: null } },
            select: { providerAmount: true, status: true, releasedAt: true, createdAt: true,
                order: { select: { id: true, status: true, deliveryAddress: true, totalAmount: true, createdAt: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        // Escrows earned from parcels
        const parcelEscrows = yield prisma_1.default.escrow.findMany({
            where: { providerId: userId, parcelDelivery: { isNot: null } },
            select: { providerAmount: true, status: true, releasedAt: true, createdAt: true,
                parcelDelivery: { select: { id: true, status: true, pickupAddress: true, dropoffAddress: true, totalAmount: true, createdAt: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        const totalReleased = [...orderEscrows, ...parcelEscrows]
            .filter(e => e.status === 'RELEASED')
            .reduce((sum, e) => sum + e.providerAmount, 0);
        const totalPending = [...orderEscrows, ...parcelEscrows]
            .filter(e => e.status === 'HELD')
            .reduce((sum, e) => sum + e.providerAmount, 0);
        const completedTrips = [...orderEscrows, ...parcelEscrows].filter(e => e.status === 'RELEASED').length;
        const activeTrips = [...orderEscrows, ...parcelEscrows].filter(e => e.status === 'HELD').length;
        res.json({
            wallet: { balance: (_c = wallet === null || wallet === void 0 ? void 0 : wallet.balance) !== null && _c !== void 0 ? _c : 0, pendingBalance: (_d = wallet === null || wallet === void 0 ? void 0 : wallet.pendingBalance) !== null && _d !== void 0 ? _d : 0 },
            earnings: { totalReleased, totalPending, completedTrips, activeTrips },
            orderTrips: orderEscrows,
            parcelTrips: parcelEscrows,
        });
    }
    catch (error) {
        next(error);
    }
}));
exports.default = router;
