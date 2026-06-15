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
const notifications_1 = require("./notifications");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
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
// Create an order (Checkout with Stock Verification and Backend Price Calculation)
router.post('/checkout', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const { items, paymentProvider } = req.body;
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
                    totalAmount: computedTotalAmount,
                    paymentProvider: paymentProvider || 'NONE',
                    status: 'PENDING',
                    items: {
                        create: checkoutItems,
                    },
                },
                include: { items: true },
            });
        }));
        // Notify vendors of the new order items
        try {
            const vendorIds = new Set(dbProducts.map(p => p.vendorId).filter(Boolean));
            for (const vendorId of vendorIds) {
                const vendorItems = dbProducts.filter(p => p.vendorId === vendorId);
                const itemsDesc = vendorItems.map(p => {
                    const itemReq = items.find((i) => i.productId === p.id);
                    return `${(itemReq === null || itemReq === void 0 ? void 0 : itemReq.quantity) || 1}x ${p.name}`;
                }).join(', ');
                yield (0, notifications_1.createNotification)(prisma_1.default, vendorId, '📦 New Order Received', `You received a new order for: ${itemsDesc}. Total order value: $${computedTotalAmount.toFixed(2)}`, 'ORDER', order.id).catch(() => { });
            }
        }
        catch (e) {
            console.error('Failed to notify vendors of new order', e);
        }
        res.status(201).json({ message: 'Order created successfully', order });
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
        const updatedOrder = yield prisma_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            if (status === 'CANCELLED') {
                // Restore stock levels
                for (const item of order.items) {
                    yield tx.product.update({
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
        }));
        if (status === 'DELIVERED') {
            yield prisma_1.default.escrow.updateMany({
                where: { orderId: id, status: 'HELD' },
                data: { autoReleaseAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
            });
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
        const { triggerSplitWebhook } = require('../lib/wallet');
        for (const escrow of escrows) {
            yield triggerSplitWebhook(escrow.id);
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
    var _a, _b;
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
            yield (0, notifications_1.createNotification)(prisma_1.default, updatedOrder.userId, '🚚 Rider Assigned', `Rider ${(_b = updatedOrder.rider) === null || _b === void 0 ? void 0 : _b.name} has been assigned to deliver your order #${id.substring(0, 8)}.`, 'ORDER', id).catch(() => { });
            yield (0, notifications_1.createNotification)(prisma_1.default, riderId, '📦 New Delivery Assigned', `You have been assigned to deliver order #${id.substring(0, 8)} to ${updatedOrder.user.name}.`, 'ORDER', id).catch(() => { });
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
        yield (0, notifications_1.createNotification)(prisma_1.default, updatedOrder.userId, '🚚 Rider Accepted Delivery', `Rider ${(_c = updatedOrder.rider) === null || _c === void 0 ? void 0 : _c.name} is delivering your order #${id.substring(0, 8)}.`, 'ORDER', id).catch(() => { });
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
exports.default = router;
