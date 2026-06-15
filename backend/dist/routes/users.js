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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const auth_1 = require("../middleware/auth");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
/**
 * GET /users
 * Authenticated, ADMIN role only.
 * Returns all users (excluding passwordHash) with a count of bookings
 * where they are the customer, plus a top-level total count.
 *
 * Each user object includes:
 *   id, email, name, role, phone, address, latitude, longitude,
 *   specialty, createdAt, bookingCount
 */
router.get('/', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden: admin access only' });
        }
        const users = yield prisma_1.default.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                phone: true,
                opayPhone: true,
                verificationStatus: true,
                address: true,
                currentLat: true,
                currentLng: true,
                specialty: true,
                createdAt: true,
                // Count bookings where this user is the customer
                _count: {
                    select: {
                        bookings: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        // Shape the response to rename/flatten fields for clarity
        const formatted = users.map((u) => {
            var _a, _b, _c, _d, _e, _f;
            return ({
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role,
                phone: (_a = u.phone) !== null && _a !== void 0 ? _a : null,
                opayPhone: (_b = u.opayPhone) !== null && _b !== void 0 ? _b : null,
                verificationStatus: u.verificationStatus,
                address: (_c = u.address) !== null && _c !== void 0 ? _c : null,
                latitude: (_d = u.currentLat) !== null && _d !== void 0 ? _d : null,
                longitude: (_e = u.currentLng) !== null && _e !== void 0 ? _e : null,
                specialty: (_f = u.specialty) !== null && _f !== void 0 ? _f : null,
                createdAt: u.createdAt,
                bookingCount: u._count.bookings,
            });
        });
        res.json({
            total: formatted.length,
            users: formatted,
        });
    }
    catch (error) {
        console.error('GET /users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
}));
/**
 * PATCH /users/location
 * Handyman pushes their current GPS coordinates.
 * Updates currentLat / currentLng on the User record.
 * Called every ~5s by the handyman's app when they have an active booking.
 */
router.patch('/location', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    if (role !== 'HANDYMAN' && role !== 'RIDER') {
        return res.status(403).json({ error: 'Only handymen and riders can update live location.' });
    }
    const { latitude, longitude } = req.body;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ error: 'latitude and longitude must be numbers.' });
    }
    // Basic sanity check on coordinate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'Coordinates out of valid range.' });
    }
    try {
        yield prisma_1.default.user.update({
            where: { id: userId },
            data: { currentLat: latitude, currentLng: longitude },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('PATCH /users/location error:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }
}));
/**
 * POST /users
 * ADMIN only.
 * Creates a new user with hashed password.
 */
router.post('/', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const admin = req.user;
        if (admin.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden: admin access only' });
        }
        const { email, password, name, role, phone, opayPhone, specialty, address, latitude, longitude, verificationStatus, } = req.body;
        if (!email || !password || !name || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const existingUser = yield prisma_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        const salt = yield bcrypt_1.default.genSalt(10);
        const passwordHash = yield bcrypt_1.default.hash(password, salt);
        const newUser = yield prisma_1.default.user.create({
            data: {
                email,
                passwordHash,
                name,
                role: role,
                phone: phone || null,
                opayPhone: opayPhone || phone || null,
                specialty: role === 'HANDYMAN' ? specialty : null,
                address: address || null,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                verificationStatus: verificationStatus || 'UNVERIFIED',
            },
        });
        const { passwordHash: _ } = newUser, userResponse = __rest(newUser, ["passwordHash"]);
        res.status(201).json(userResponse);
    }
    catch (error) {
        console.error('POST /users error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
}));
/**
 * PUT /users/:id
 * ADMIN only.
 * Updates user profile details, including optional password hashing.
 */
router.put('/:id', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const admin = req.user;
        if (admin.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden: admin access only' });
        }
        const { id } = req.params;
        const { email, password, name, role, phone, opayPhone, specialty, address, latitude, longitude, verificationStatus, } = req.body;
        const existingUser = yield prisma_1.default.user.findUnique({ where: { id } });
        if (!existingUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Check if new email conflicts with another user
        if (email && email !== existingUser.email) {
            const emailConflict = yield prisma_1.default.user.findUnique({ where: { email } });
            if (emailConflict) {
                return res.status(400).json({ error: 'Email already in use by another user' });
            }
        }
        let passwordHash = undefined;
        if (password) {
            const salt = yield bcrypt_1.default.genSalt(10);
            passwordHash = yield bcrypt_1.default.hash(password, salt);
        }
        const updatedUser = yield prisma_1.default.user.update({
            where: { id },
            data: {
                email: email || undefined,
                passwordHash,
                name: name || undefined,
                role: role ? role : undefined,
                phone: phone !== undefined ? phone : undefined,
                opayPhone: opayPhone !== undefined ? opayPhone : undefined,
                specialty: specialty !== undefined ? specialty : undefined,
                address: address !== undefined ? address : undefined,
                latitude: latitude !== undefined && latitude !== null ? parseFloat(latitude) : undefined,
                longitude: longitude !== undefined && longitude !== null ? parseFloat(longitude) : undefined,
                verificationStatus: verificationStatus || undefined,
            },
        });
        const { passwordHash: _ } = updatedUser, userResponse = __rest(updatedUser, ["passwordHash"]);
        res.json(userResponse);
    }
    catch (error) {
        console.error('PUT /users/:id error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
}));
/**
 * DELETE /users/:id
 * ADMIN only.
 * Performs a cascading transaction delete of all user-dependent entities to avoid database conflicts.
 */
router.delete('/:id', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const admin = req.user;
        if (admin.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden: admin access only' });
        }
        const { id } = req.params;
        const targetUser = yield prisma_1.default.user.findUnique({ where: { id } });
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Deleting related records safely in transaction order
        yield prisma_1.default.$transaction([
            prisma_1.default.review.deleteMany({ where: { OR: [{ authorId: id }, { handymanId: id }] } }),
            prisma_1.default.product.deleteMany({ where: { vendorId: id } }),
            prisma_1.default.orderItem.deleteMany({ where: { order: { userId: id } } }),
            prisma_1.default.order.deleteMany({ where: { userId: id } }),
            prisma_1.default.escrow.deleteMany({ where: { OR: [{ providerId: id }, { booking: { customerId: id } }] } }),
            prisma_1.default.booking.deleteMany({ where: { customerId: id } }),
            prisma_1.default.booking.updateMany({ where: { handymanId: id }, data: { handymanId: null } }),
            prisma_1.default.user.delete({ where: { id } }),
        ]);
        res.json({ success: true, message: 'User and all related records deleted successfully.' });
    }
    catch (error) {
        console.error('DELETE /users/:id error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
}));
exports.default = router;
