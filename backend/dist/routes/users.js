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
            var _a, _b, _c, _d, _e;
            return ({
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role,
                phone: (_a = u.phone) !== null && _a !== void 0 ? _a : null,
                address: (_b = u.address) !== null && _b !== void 0 ? _b : null,
                latitude: (_c = u.currentLat) !== null && _c !== void 0 ? _c : null,
                longitude: (_d = u.currentLng) !== null && _d !== void 0 ? _d : null,
                specialty: (_e = u.specialty) !== null && _e !== void 0 ? _e : null,
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
    if (role !== 'HANDYMAN') {
        return res.status(403).json({ error: 'Only handymen can update live location.' });
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
exports.default = router;
