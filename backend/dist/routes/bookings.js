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
// Get bookings for the logged-in user
router.get('/', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const whereClause = role === 'HANDYMAN'
            ? { handymanId: userId }
            : { customerId: userId };
        const bookings = yield prisma_1.default.booking.findMany({
            where: whereClause,
            include: { service: true, handyman: true },
        });
        res.json(bookings);
    }
    catch (error) {
        next(error);
    }
}));
// Admin: Get ALL bookings across all users
// NOTE: Declared before /:id routes so Express never risks shadowing this static path.
router.get('/admin/all', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    try {
        const bookings = yield prisma_1.default.booking.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                service: true,
                customer: { select: { id: true, name: true, email: true, phone: true } },
                handyman: { select: { id: true, name: true, email: true, phone: true, specialty: true } },
            },
        });
        res.json(bookings);
    }
    catch (error) {
        next(error);
    }
}));
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
// Get single booking by ID
router.get('/:id', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const booking = yield prisma_1.default.booking.findUnique({
            where: { id },
            include: { service: true, handyman: true, customer: true },
        });
        if (!booking)
            return res.status(404).json({ error: 'Booking not found' });
        res.json(booking);
    }
    catch (error) {
        next(error);
    }
}));
// Create a new booking
router.post('/', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const customerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const { serviceId, scheduledAt, address, latitude, longitude, autoAssign } = req.body;
    if (!customerId)
        return res.status(401).json({ error: 'Unauthorized' });
    if (!serviceId || !scheduledAt || !address) {
        return res.status(400).json({ error: 'Missing serviceId, scheduledAt, or address' });
    }
    try {
        // Look up service in DB to retrieve verified price
        const service = yield prisma_1.default.service.findUnique({ where: { id: serviceId } });
        if (!service) {
            return res.status(404).json({ error: 'Service not found' });
        }
        let handymanId = null;
        let status = 'PENDING';
        let matchDistance = null;
        const customerLat = latitude ? parseFloat(latitude) : null;
        const customerLng = longitude ? parseFloat(longitude) : null;
        const MAX_RADIUS_KM = 50; // primary search radius
        const FALLBACK_RADIUS_KM = 100; // wider fallback radius
        if (autoAssign && customerLat !== null && customerLng !== null) {
            // Find handymen already on an ACCEPTED job (busy)
            const busyHandymanRecords = yield prisma_1.default.booking.findMany({
                where: { status: 'ACCEPTED' },
                select: { handymanId: true },
            });
            const busyIds = new Set(busyHandymanRecords.map((b) => b.handymanId).filter(Boolean));
            // Fetch all VERIFIED handymen with a registered location
            const allHandymen = yield prisma_1.default.user.findMany({
                where: {
                    role: 'HANDYMAN',
                    verificationStatus: 'VERIFIED',
                    latitude: { not: null },
                    longitude: { not: null },
                },
            });
            // Exclude busy handymen and compute distances
            const availableWithDist = allHandymen
                .filter((hm) => !busyIds.has(hm.id))
                .map((hm) => ({
                hm,
                dist: getDistanceKm(customerLat, customerLng, hm.latitude, hm.longitude),
            }))
                .sort((a, b) => a.dist - b.dist);
            // 1st pass — matching specialty within primary radius
            let best = availableWithDist.find((x) => x.hm.specialty === service.category && x.dist <= MAX_RADIUS_KM);
            // 2nd pass — any specialty within primary radius
            if (!best) {
                best = availableWithDist.find((x) => x.dist <= MAX_RADIUS_KM);
            }
            // 3rd pass — matching specialty within fallback radius
            if (!best) {
                best = availableWithDist.find((x) => x.hm.specialty === service.category && x.dist <= FALLBACK_RADIUS_KM);
            }
            // 4th pass — any verified available handyman within fallback radius
            if (!best) {
                best = availableWithDist.find((x) => x.dist <= FALLBACK_RADIUS_KM);
            }
            if (best) {
                handymanId = best.hm.id;
                matchDistance = Math.round(best.dist * 10) / 10;
                status = 'ACCEPTED';
            }
        }
        const newBooking = yield prisma_1.default.booking.create({
            data: {
                customerId,
                serviceId,
                handymanId,
                scheduledAt: new Date(scheduledAt),
                address,
                latitude: customerLat,
                longitude: customerLng,
                totalPrice: service.basePrice,
                status,
            },
            include: { handyman: true, service: true }
        });
        // Notify customer about booking confirmation
        yield (0, notifications_1.createNotification)(prisma_1.default, customerId, '📅 Booking Confirmed', `Your booking for "${service.name}" has been placed. Status: ${status}.`, 'BOOKING', newBooking.id).catch(() => { });
        // Notify assigned handyman if auto-assigned
        if (handymanId && status === 'ACCEPTED') {
            const distText = matchDistance !== null ? ` You are ${matchDistance} km away.` : '';
            const livePinText = (customerLat !== null && customerLng !== null)
                ? ` (Pinned coords: ${customerLat.toFixed(5)}, ${customerLng.toFixed(5)})`
                : '';
            yield (0, notifications_1.createNotification)(prisma_1.default, handymanId, '💼 New Job Assigned', `Job: ${service.name}. Address: ${address}${livePinText}.${distText} Live tracking is active — customer can see your location.`, 'JOB', newBooking.id).catch(() => { });
        }
        res.status(201).json(Object.assign(Object.assign({}, newBooking), { matchDistance }));
    }
    catch (error) {
        next(error);
    }
}));
// Get real-time coordinates/tracking for a booking
router.get('/:id/location', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const booking = yield prisma_1.default.booking.findUnique({
            where: { id },
            select: {
                id: true,
                customerId: true,
                handymanId: true,
                status: true,
                latitude: true,
                longitude: true,
            }
        });
        if (!booking)
            return res.status(404).json({ error: 'Booking not found' });
        let providerLocation = null;
        if (booking.handymanId) {
            const provider = yield prisma_1.default.user.findUnique({
                where: { id: booking.handymanId },
                select: {
                    id: true,
                    name: true,
                    currentLat: true,
                    currentLng: true,
                    latitude: true,
                    longitude: true,
                }
            });
            if (provider) {
                providerLocation = {
                    id: provider.id,
                    name: provider.name,
                    lat: provider.currentLat !== null ? provider.currentLat : provider.latitude,
                    lng: provider.currentLng !== null ? provider.currentLng : provider.longitude,
                };
            }
        }
        res.json({
            bookingId: booking.id,
            status: booking.status,
            customerLocation: {
                lat: booking.latitude,
                lng: booking.longitude,
            },
            providerLocation,
        });
    }
    catch (error) {
        next(error);
    }
}));
// Update booking status (for Handymen or Admins)
router.patch('/:id/status', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { id } = req.params;
    const { status } = req.body;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
    if (role !== 'HANDYMAN' && role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Only Handymen or Admins can update booking status.' });
    }
    const allowedStatuses = ['PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED'];
    if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
    }
    try {
        const booking = yield prisma_1.default.booking.findUnique({ where: { id } });
        if (!booking)
            return res.status(404).json({ error: 'Booking not found' });
        let updateData = { status };
        if (role === 'HANDYMAN') {
            if (status === 'ACCEPTED') {
                // Handyman accepting booking: check if already assigned
                if (booking.handymanId && booking.handymanId !== userId) {
                    return res.status(403).json({ error: 'This booking is already accepted by another handyman.' });
                }
                // Self-assign
                updateData.handymanId = userId;
            }
            else {
                // Completing or cancelling booking: check if they are the assigned handyman
                if (booking.handymanId !== userId) {
                    return res.status(403).json({ error: 'You are not assigned to this booking.' });
                }
            }
        }
        const updatedBooking = yield prisma_1.default.booking.update({
            where: { id },
            data: updateData,
            include: { service: true, customer: true },
        });
        // Auto-create notifications based on status change
        if (status === 'ACCEPTED' && updatedBooking.customerId) {
            yield (0, notifications_1.createNotification)(prisma_1.default, updatedBooking.customerId, '✅ Booking Accepted', `A handyman has accepted your booking${updatedBooking.service ? ` for "${updatedBooking.service.name}"` : ''}.`, 'BOOKING', id).catch(() => { });
            // Notify the handyman themselves as confirmation
            if (updatedBooking.handymanId) {
                const hmPinText = (updatedBooking.latitude !== null && updatedBooking.longitude !== null)
                    ? ` (Pinned coords: ${updatedBooking.latitude.toFixed(5)}, ${updatedBooking.longitude.toFixed(5)})`
                    : '';
                yield (0, notifications_1.createNotification)(prisma_1.default, updatedBooking.handymanId, '💼 Job Confirmed', `You have accepted the job for "${((_c = updatedBooking.service) === null || _c === void 0 ? void 0 : _c.name) || 'Service'}". Address: ${updatedBooking.address}${hmPinText}.`, 'JOB', id).catch(() => { });
            }
        }
        else if (status === 'COMPLETED' && updatedBooking.customerId) {
            yield prisma_1.default.escrow.updateMany({
                where: { bookingId: id, status: 'HELD' },
                data: { autoReleaseAt: new Date(Date.now() + 48 * 60 * 60 * 1000) },
            });
            yield (0, notifications_1.createNotification)(prisma_1.default, updatedBooking.customerId, '🎉 Job Completed', `Your booking${updatedBooking.service ? ` for "${updatedBooking.service.name}"` : ''} has been marked complete. Please confirm to release funds!`, 'BOOKING', id).catch(() => { });
        }
        else if (status === 'CANCELLED' && updatedBooking.customerId) {
            yield (0, notifications_1.createNotification)(prisma_1.default, updatedBooking.customerId, '❌ Booking Cancelled', `Your booking${updatedBooking.service ? ` for "${updatedBooking.service.name}"` : ''} has been cancelled.`, 'BOOKING', id).catch(() => { });
        }
        res.json(updatedBooking);
    }
    catch (error) {
        next(error);
    }
}));
// (Admin: Get ALL bookings is now declared near the top of this file, before dynamic /:id routes.)
// Customer confirms job completed (releases escrow)
router.post('/:id/confirm-completion', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    const customerId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!customerId)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const booking = yield prisma_1.default.booking.findUnique({
            where: { id },
        });
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        if (booking.customerId !== customerId) {
            return res.status(403).json({ error: 'Forbidden. You are not the customer for this booking.' });
        }
        const escrow = yield prisma_1.default.escrow.findFirst({
            where: { bookingId: id, status: 'HELD' },
        });
        if (!escrow) {
            return res.status(400).json({ error: 'No active pending payment held in escrow for this booking.' });
        }
        // Trigger the split webhook
        const { triggerSplitWebhook } = require('../lib/wallet');
        yield triggerSplitWebhook(escrow.id);
        // Force update status of booking to COMPLETED if not already
        const updatedBooking = yield prisma_1.default.booking.update({
            where: { id },
            data: { status: 'COMPLETED' },
            include: { service: true, handyman: true },
        });
        res.json({ success: true, message: 'Booking completion confirmed and funds released.', booking: updatedBooking });
    }
    catch (error) {
        next(error);
    }
}));
exports.default = router;
