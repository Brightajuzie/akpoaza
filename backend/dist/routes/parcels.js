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
const http_1 = __importDefault(require("http"));
const router = (0, express_1.Router)();
// Haversine straight-line distance (fallback)
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// Get real road distance from OSRM (Open Source Routing Machine)
// Returns distance in km and duration in minutes, or null on failure
function getRoadDistance(lat1, lon1, lat2, lon2) {
    return new Promise((resolve) => {
        const url = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false&annotations=false`;
        const req = http_1.default.get(url, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
                        const route = json.routes[0];
                        resolve({
                            distanceKm: route.distance / 1000, // metres → km
                            durationMins: Math.ceil(route.duration / 60), // seconds → minutes
                            routeType: 'road',
                        });
                    }
                    else {
                        resolve(null);
                    }
                }
                catch (_a) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}
// Calculate base price + per km using configurable rates
// Uses real road routing (OSRM) with Haversine × 1.3 as fallback
function calculateDeliveryPrice(lat1, lon1, lat2, lon2) {
    return __awaiter(this, void 0, void 0, function* () {
        // Load admin-configured pricing from DB (with sensible defaults)
        const settings = yield prisma_1.default.appSetting.findMany({
            where: { key: { in: ['rider_base_fare', 'rider_price_per_km', 'rider_platform_fee_pct'] } }
        });
        const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
        const BASE_FARE = parseFloat(settingsMap['rider_base_fare'] || '1000');
        const PER_KM_RATE = parseFloat(settingsMap['rider_price_per_km'] || '200');
        const PLATFORM_FEE_PCT = parseFloat(settingsMap['rider_platform_fee_pct'] || '10');
        // Try real road distance first
        let distanceKm;
        let durationMins;
        let routeType;
        const roadResult = yield getRoadDistance(lat1, lon1, lat2, lon2);
        if (roadResult) {
            distanceKm = roadResult.distanceKm;
            durationMins = roadResult.durationMins;
            routeType = 'road';
        }
        else {
            // Fallback: apply a 1.3 winding factor to straight-line distance
            const straight = haversineDistanceKm(lat1, lon1, lat2, lon2);
            distanceKm = straight * 1.3;
            routeType = 'straight-line';
        }
        const subTotal = BASE_FARE + (distanceKm * PER_KM_RATE);
        const platformFee = subTotal * (PLATFORM_FEE_PCT / 100);
        return {
            price: Math.ceil(subTotal + platformFee),
            distanceKm: distanceKm.toFixed(2),
            durationMins,
            routeType,
            BASE_FARE,
            PER_KM_RATE,
            PLATFORM_FEE_PCT,
        };
    });
}
// Get a quote for a parcel delivery
router.post('/quote', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { pickupLat, pickupLng, dropoffLat, dropoffLng } = req.body;
    if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
        return res.status(400).json({ error: 'Pickup and dropoff coordinates are required' });
    }
    const result = yield calculateDeliveryPrice(pickupLat, pickupLng, dropoffLat, dropoffLng);
    res.json({
        price: result.price,
        distanceKm: result.distanceKm,
        durationMins: (_a = result.durationMins) !== null && _a !== void 0 ? _a : null,
        routeType: result.routeType,
        baseFare: result.BASE_FARE,
        perKmRate: result.PER_KM_RATE,
    });
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
        // ── Customer confirmation (in-app + email + SMS) ────────────────────
        (0, notify_1.sendNotification)({
            userId,
            title: '🚚 Delivery Booked!',
            body: `Your parcel delivery from ${pickupAddress} to ${dropoffAddress} is booked (${result.distanceKm} km). Total: ₦${computedTotalAmount.toLocaleString()}. A rider will be assigned shortly.`,
            type: 'PARCEL',
            referenceId: parcel.id,
            emailSubject: '✅ Parcel Delivery Confirmed — FixMart',
            emailHtml: `<p>Hi there,</p>
        <p>Your parcel delivery has been booked successfully!</p>
        <p><strong>Pickup:</strong> ${pickupAddress}</p>
        <p><strong>Drop-off:</strong> ${dropoffAddress}</p>
        <p><strong>Distance:</strong> ${result.distanceKm} km${result.durationMins ? ` (∼${result.durationMins} min ride)` : ''}</p>
        <p><strong>Total Amount:</strong> ₦${computedTotalAmount.toLocaleString()}</p>
        <p>A verified rider will accept your delivery shortly. Track it live in the app!</p>`,
        }).catch(() => { });
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
    var _a, _b, _c, _d;
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
        // ── Notify customer + rider (in-app + email + SMS) ────────────────
        (0, notify_1.sendNotification)({
            userId: updatedParcel.userId,
            title: '🚚 Rider Accepted Your Delivery',
            body: `Rider ${(_c = updatedParcel.rider) === null || _c === void 0 ? void 0 : _c.name} has accepted your parcel delivery and is heading to pick it up. Track them live in the app.`,
            type: 'PARCEL',
            referenceId: id,
            emailSubject: '🚚 Your Rider is On the Way — FixMart',
            emailHtml: `<p>Great news!</p>
        <p>Rider <strong>${(_d = updatedParcel.rider) === null || _d === void 0 ? void 0 : _d.name}</strong> has accepted your delivery and is on their way to pick up your parcel.</p>
        <p>Open the app to track your rider's live location.</p>`,
        }).catch(() => { });
        if (userId) {
            (0, notify_1.sendNotification)({
                userId,
                title: '📦 Delivery Job Accepted',
                body: `You accepted a parcel delivery. Head to: ${updatedParcel.pickupAddress}. Drop-off at: ${updatedParcel.dropoffAddress}.`,
                type: 'PARCEL',
                referenceId: id,
            }).catch(() => { });
        }
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
        // ── Notify customer of status change ─────────────────────────────
        const parcelMsgs = {
            SHIPPED: { title: '📦 Parcel Picked Up', body: `Your parcel (ID: ${id.slice(-8).toUpperCase()}) has been picked up by the rider and is in transit.` },
            DELIVERED: { title: '✅ Parcel Delivered', body: `Your parcel (ID: ${id.slice(-8).toUpperCase()}) has been delivered! Please confirm receipt in the app to release payment.` },
            CANCELLED: { title: '❌ Delivery Cancelled', body: `Your parcel delivery (ID: ${id.slice(-8).toUpperCase()}) has been cancelled. Contact support if this is unexpected.` },
        };
        const pm = parcelMsgs[status];
        if (pm) {
            (0, notify_1.sendNotification)({
                userId: parcel.userId,
                title: pm.title,
                body: pm.body,
                type: 'PARCEL',
                referenceId: id,
                emailSubject: pm.title,
            }).catch(() => { });
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
