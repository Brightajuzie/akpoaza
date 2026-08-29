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
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
// Get all handyman services, with optional search filtering
router.get('/', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { search } = req.query;
    try {
        let whereClause = {};
        if (search) {
            const searchStr = String(search);
            whereClause.OR = [
                { name: { contains: searchStr, mode: 'insensitive' } },
                { description: { contains: searchStr, mode: 'insensitive' } },
                { category: { contains: searchStr, mode: 'insensitive' } },
            ];
        }
        const services = yield prisma_1.default.service.findMany({
            where: whereClause,
            orderBy: [
                { featured: 'desc' },
                { name: 'asc' },
            ],
        });
        res.json(services);
    }
    catch (error) {
        next(error);
    }
}));
// Get a single service by ID
router.get('/:id', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const service = yield prisma_1.default.service.findUnique({ where: { id } });
        if (!service)
            return res.status(404).json({ error: 'Service not found' });
        res.json(service);
    }
    catch (error) {
        next(error);
    }
}));
// Create a new handyman service (Admin only)
router.post('/', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const { name, description, category, basePrice } = req.body;
    if (!name || !description || !category || basePrice === undefined) {
        return res.status(400).json({ error: 'Missing required fields (name, description, category, basePrice)' });
    }
    try {
        const newService = yield prisma_1.default.service.create({
            data: {
                name,
                description,
                category,
                basePrice: parseFloat(basePrice),
            },
        });
        res.status(201).json(newService);
    }
    catch (error) {
        next(error);
    }
}));
// Update a handyman service (Admin only)
router.put('/:id', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const { id } = req.params;
    const { name, description, category, basePrice } = req.body;
    try {
        const service = yield prisma_1.default.service.findUnique({ where: { id } });
        if (!service)
            return res.status(404).json({ error: 'Service not found' });
        const updatedService = yield prisma_1.default.service.update({
            where: { id },
            data: {
                name,
                description,
                category,
                basePrice: basePrice !== undefined ? parseFloat(basePrice) : undefined,
            },
        });
        res.json(updatedService);
    }
    catch (error) {
        next(error);
    }
}));
// Delete all services (Admin only)
router.post('/delete-all', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    try {
        const allServices = yield prisma_1.default.service.findMany({ select: { id: true } });
        const count = allServices.length;
        const bookings = yield prisma_1.default.booking.findMany({ select: { id: true } });
        const bookingIds = bookings.map((b) => b.id);
        const txs = [
            prisma_1.default.review.deleteMany({ where: { serviceId: { not: null } } }),
        ];
        if (bookingIds.length > 0) {
            txs.push(prisma_1.default.escrow.deleteMany({ where: { bookingId: { in: bookingIds } } }));
        }
        txs.push(prisma_1.default.booking.deleteMany({}));
        txs.push(prisma_1.default.service.deleteMany({}));
        yield prisma_1.default.$transaction(txs);
        res.json({ success: true, count, message: `All ${count} service(s) deleted successfully.` });
    }
    catch (error) {
        next(error);
    }
}));
// Bulk delete services (Admin only)
router.post('/bulk-delete', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids array is required' });
    }
    try {
        const bookings = yield prisma_1.default.booking.findMany({
            where: { serviceId: { in: ids } },
            select: { id: true },
        });
        const bookingIds = bookings.map((b) => b.id);
        const txs = [
            prisma_1.default.review.deleteMany({ where: { serviceId: { in: ids } } }),
        ];
        if (bookingIds.length > 0) {
            txs.push(prisma_1.default.escrow.deleteMany({ where: { bookingId: { in: bookingIds } } }));
        }
        txs.push(prisma_1.default.booking.deleteMany({ where: { serviceId: { in: ids } } }));
        txs.push(prisma_1.default.service.deleteMany({ where: { id: { in: ids } } }));
        yield prisma_1.default.$transaction(txs);
        res.json({ success: true, count: ids.length, message: `${ids.length} service(s) deleted successfully.` });
    }
    catch (error) {
        next(error);
    }
}));
// Delete a handyman service (Admin only)
router.delete('/:id', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const { id } = req.params;
    try {
        const service = yield prisma_1.default.service.findUnique({ where: { id } });
        if (!service)
            return res.status(404).json({ error: 'Service not found' });
        const bookings = yield prisma_1.default.booking.findMany({
            where: { serviceId: id },
            select: { id: true },
        });
        const bookingIds = bookings.map((b) => b.id);
        const txs = [
            prisma_1.default.review.deleteMany({ where: { serviceId: id } }),
        ];
        if (bookingIds.length > 0) {
            txs.push(prisma_1.default.escrow.deleteMany({ where: { bookingId: { in: bookingIds } } }));
        }
        txs.push(prisma_1.default.booking.deleteMany({ where: { serviceId: id } }));
        txs.push(prisma_1.default.service.delete({ where: { id } }));
        yield prisma_1.default.$transaction(txs);
        res.json({ message: 'Service deleted successfully' });
    }
    catch (error) {
        next(error);
    }
}));
// Toggle service boost (featured) status (Admin only)
router.patch('/:id/boost', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const { id } = req.params;
    try {
        const service = yield prisma_1.default.service.findUnique({ where: { id } });
        if (!service)
            return res.status(404).json({ error: 'Service not found' });
        const updatedService = yield prisma_1.default.service.update({
            where: { id },
            data: {
                featured: !service.featured,
            },
        });
        res.json(updatedService);
    }
    catch (error) {
        next(error);
    }
}));
// Get verified Handymen and Riders specialists to display on Services screen
router.get('/public/specialists', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const specialists = yield prisma_1.default.user.findMany({
            where: {
                role: { in: ['HANDYMAN', 'RIDER'] },
                verificationStatus: 'VERIFIED',
            },
            select: {
                id: true,
                name: true,
                role: true,
                specialty: true,
                vehicleType: true,
                licensePlate: true,
                passportPhoto: true,
                actionPhoto: true,
                address: true,
                phone: true,
                _count: {
                    select: {
                        jobs: { where: { status: 'COMPLETED' } },
                        deliveries: { where: { status: 'DELIVERED' } },
                    },
                },
            },
            take: 20,
        });
        const formatted = specialists.map((s) => {
            var _a, _b;
            return ({
                id: s.id,
                name: s.name,
                role: s.role,
                specialty: s.specialty || (s.role === 'HANDYMAN' ? 'General Maintenance' : 'Express Delivery'),
                vehicleType: s.vehicleType || (s.role === 'RIDER' ? 'Motorcycle' : null),
                licensePlate: s.licensePlate,
                passportPhoto: s.passportPhoto,
                actionPhoto: s.actionPhoto,
                address: s.address,
                phone: s.phone,
                rating: 4.9,
                completedJobs: (((_a = s._count) === null || _a === void 0 ? void 0 : _a.jobs) || 0) + (((_b = s._count) === null || _b === void 0 ? void 0 : _b.deliveries) || 0),
            });
        });
        res.json(formatted);
    }
    catch (error) {
        next(error);
    }
}));
exports.default = router;
