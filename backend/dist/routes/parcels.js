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
const wallet_1 = require("../lib/wallet");
const router = (0, express_1.Router)();
// Utility function to calculate distance in km using Haversine formula
function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
// Calculate base price + per km using configurable rates
function calculateDeliveryPrice(lat1, lon1, lat2, lon2) {
    return __awaiter(this, void 0, void 0, function* () {
        const distance = getDistanceInKm(lat1, lon1, lat2, lon2);
        // Load admin-configured pricing from DB (with sensible defaults)
        const settings = yield prisma_1.default.appSetting.findMany({
            where: { key: { in: ['rider_base_fare', 'rider_price_per_km', 'rider_platform_fee_pct'] } }
        });
        const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
        const BASE_FARE = parseFloat(settingsMap['rider_base_fare'] || '1000');
        const PER_KM_RATE = parseFloat(settingsMap['rider_price_per_km'] || '200');
        const PLATFORM_FEE_PCT = parseFloat(settingsMap['rider_platform_fee_pct'] || '10');
        const subTotal = BASE_FARE + (distance * PER_KM_RATE);
        const platformFee = subTotal * (PLATFORM_FEE_PCT / 100);
        return { price: Math.ceil(subTotal + platformFee), distanceKm: distance.toFixed(2), BASE_FARE, PER_KM_RATE, PLATFORM_FEE_PCT };
    });
}
// Get a quote for a parcel delivery
router.post('/quote', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { pickupLat, pickupLng, dropoffLat, dropoffLng } = req.body;
    if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
        return res.status(400).json({ error: 'Pickup and dropoff coordinates are required' });
    }
    const result = yield calculateDeliveryPrice(pickupLat, pickupLng, dropoffLat, dropoffLng);
    res.json({ price: result.price, distanceKm: result.distanceKm, baseFare: result.BASE_FARE, perKmRate: result.PER_KM_RATE });
}));
// Checkout / Create Parcel Delivery
router.post('/checkout', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    const { pickupAddress, dropoffAddress, pickupLat, pickupLng, dropoffLat, dropoffLng, parcelDescription, paymentProvider } = req.body;
    if (!pickupAddress || !dropoffAddress || !pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
        return res.status(400).json({ error: 'All address and coordinate fields are required' });
    }
    try {
        const result = yield calculateDeliveryPrice(pickupLat, pickupLng, dropoffLat, dropoffLng);
        const computedTotalAmount = result.price;
        const parcel = yield prisma_1.default.parcelDelivery.create({
            data: {
                userId,
                pickupAddress,
                dropoffAddress,
                pickupLat,
                pickupLng,
                dropoffLat,
                dropoffLng,
                parcelDescription,
                totalAmount: computedTotalAmount,
                paymentProvider: paymentProvider || 'NONE',
                status: 'PENDING',
            }
        });
        res.status(201).json({ message: 'Parcel delivery created successfully', parcel });
    }
    catch (error) {
        next(error);
    }
}));
// Get user's parcel deliveries
router.get('/', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const parcels = yield prisma_1.default.parcelDelivery.findMany({
            where: { userId },
            include: { rider: { select: { id: true, name: true, phone: true, vehicleType: true, licensePlate: true } }, escrows: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(parcels);
    }
    catch (error) {
        next(error);
    }
}));
// Rider: Get available parcel deliveries
router.get('/rider/available', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
    if (role !== 'RIDER') {
        return res.status(403).json({ error: 'Forbidden. Rider access required.' });
    }
    try {
        const parcels = yield prisma_1.default.parcelDelivery.findMany({
            where: {
                status: { in: ['PAID', 'SHIPPED'] },
                OR: [
                    { riderId: null },
                    { riderId: userId }
                ]
            },
            include: {
                user: { select: { id: true, name: true, phone: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(parcels);
    }
    catch (error) {
        next(error);
    }
}));
// Rider: Accept a parcel delivery
router.patch('/:id/accept-delivery', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
    if (role !== 'RIDER') {
        return res.status(403).json({ error: 'Forbidden. Rider access required.' });
    }
    const { id } = req.params;
    try {
        const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
        if (!parcel)
            return res.status(404).json({ error: 'Parcel delivery not found' });
        if (parcel.riderId && parcel.riderId !== userId) {
            return res.status(400).json({ error: 'This delivery has already been accepted by another rider.' });
        }
        const updatedParcel = yield prisma_1.default.parcelDelivery.update({
            where: { id },
            data: { riderId: userId, status: 'SHIPPED' },
            include: {
                user: { select: { id: true, name: true } },
                rider: { select: { id: true, name: true } }
            }
        });
        yield (0, notifications_1.createNotification)(prisma_1.default, updatedParcel.userId, '🚚 Rider Accepted Parcel', `Rider ${(_c = updatedParcel.rider) === null || _c === void 0 ? void 0 : _c.name} is on the way to pick up your parcel.`, 'ORDER', // Reusing ORDER type for notification navigation
        id).catch(() => { });
        res.json(updatedParcel);
    }
    catch (error) {
        next(error);
    }
}));
// Update Parcel Status
router.patch('/:id/status', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id } = req.params;
    const { status } = req.body;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
    if (!status)
        return res.status(400).json({ error: 'Status is required' });
    try {
        const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
        if (!parcel)
            return res.status(404).json({ error: 'Parcel not found' });
        if (status === 'CANCELLED') {
            if (role !== 'ADMIN' && parcel.userId !== userId) {
                return res.status(403).json({ error: 'Forbidden. You do not have permission to cancel this parcel delivery.' });
            }
        }
        else {
            if (role !== 'ADMIN' && !(role === 'RIDER' && parcel.riderId === userId)) {
                return res.status(403).json({ error: 'Forbidden. Admin or assigned Rider access required.' });
            }
        }
        const updatedParcel = yield prisma_1.default.parcelDelivery.update({
            where: { id },
            data: { status },
        });
        if (status === 'DELIVERED') {
            yield prisma_1.default.escrow.updateMany({
                where: { parcelDeliveryId: id, status: 'HELD' },
                data: { autoReleaseAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
            });
        }
        res.json({ message: `Status updated to ${status}`, parcel: updatedParcel });
    }
    catch (error) {
        next(error);
    }
}));
// Customer confirms parcel receipt (releases escrow)
router.post('/:id/confirm-receipt', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const parcel = yield prisma_1.default.parcelDelivery.findUnique({ where: { id } });
        if (!parcel)
            return res.status(404).json({ error: 'Parcel not found' });
        if (parcel.userId !== userId)
            return res.status(403).json({ error: 'Forbidden.' });
        const escrows = yield prisma_1.default.escrow.findMany({
            where: { parcelDeliveryId: id, status: 'HELD' },
        });
        if (escrows.length === 0) {
            return res.status(400).json({ error: 'No active pending payments held in escrow.' });
        }
        for (const escrow of escrows) {
            yield (0, wallet_1.triggerSplitWebhook)(escrow.id);
        }
        const updatedParcel = yield prisma_1.default.parcelDelivery.update({
            where: { id },
            data: { status: 'DELIVERED' },
        });
        res.json({ success: true, message: 'Parcel receipt confirmed and funds released.', parcel: updatedParcel });
    }
    catch (error) {
        next(error);
    }
}));
// Get real-time coordinates/tracking for a parcel
router.get('/:id/location', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const parcel = yield prisma_1.default.parcelDelivery.findUnique({
            where: { id },
            select: { id: true, userId: true, riderId: true, status: true, dropoffLat: true, dropoffLng: true, dropoffAddress: true }
        });
        if (!parcel)
            return res.status(404).json({ error: 'Parcel not found' });
        const customer = yield prisma_1.default.user.findUnique({
            where: { id: parcel.userId },
            select: { name: true }
        });
        let riderLocation = null;
        if (parcel.riderId) {
            const rider = yield prisma_1.default.user.findUnique({
                where: { id: parcel.riderId },
                select: {
                    id: true, name: true, currentLat: true, currentLng: true, latitude: true, longitude: true, vehicleType: true, licensePlate: true
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
            orderId: parcel.id, // Reusing orderId key for frontend compatibility
            status: parcel.status,
            customerLocation: {
                name: customer === null || customer === void 0 ? void 0 : customer.name,
                address: parcel.dropoffAddress,
                lat: parcel.dropoffLat,
                lng: parcel.dropoffLng,
            },
            riderLocation,
        });
    }
    catch (error) {
        next(error);
    }
}));
exports.default = router;
