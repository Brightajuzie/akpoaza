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
 * GET /analytics/handyman
 * Authenticated, HANDYMAN role only.
 * Returns dashboard analytics for the authenticated handyman:
 *   - totalJobs: count of COMPLETED bookings
 *   - totalEarnings: sum of totalPrice for COMPLETED bookings
 *   - averageRating: average rating from reviews (null if none)
 *   - monthlyStats: last 4 months with { month, jobs, earnings }
 */
router.get('/handyman', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const user = req.user;
        if (user.role !== 'HANDYMAN') {
            return res.status(403).json({ error: 'Forbidden: handyman access only' });
        }
        const handymanId = user.userId;
        // ── Total jobs (COMPLETED bookings) ──────────────────────────────────────
        const totalJobs = yield prisma_1.default.booking.count({
            where: {
                handymanId,
                status: 'COMPLETED',
            },
        });
        // ── Total earnings ───────────────────────────────────────────────────────
        const earningsResult = yield prisma_1.default.booking.aggregate({
            where: {
                handymanId,
                status: 'COMPLETED',
            },
            _sum: { totalPrice: true },
        });
        const totalEarnings = (_a = earningsResult._sum.totalPrice) !== null && _a !== void 0 ? _a : 0;
        // ── Average rating ───────────────────────────────────────────────────────
        const ratingResult = yield prisma_1.default.review.aggregate({
            where: { handymanId },
            _avg: { rating: true },
        });
        const averageRating = ratingResult._avg.rating !== null
            ? Math.round(ratingResult._avg.rating * 100) / 100
            : null;
        // ── Monthly stats (last 4 months) ────────────────────────────────────────
        // Build date boundaries for the last 4 full calendar months (inclusive of
        // the current month so the handyman sees up-to-date numbers).
        const now = new Date();
        // Helper: short month label, e.g. "Jan"
        const monthLabel = (date) => date.toLocaleString('en-US', { month: 'short' });
        // Generate the first day of each of the last 4 months (oldest → newest)
        const monthStarts = [];
        for (let i = 3; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthStarts.push(d);
        }
        // Fetch all COMPLETED bookings in the 4-month window in one query
        const windowStart = monthStarts[0];
        const windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1); // start of next month
        const completedBookings = yield prisma_1.default.booking.findMany({
            where: {
                handymanId,
                status: 'COMPLETED',
                createdAt: {
                    gte: windowStart,
                    lt: windowEnd,
                },
            },
            select: {
                totalPrice: true,
                createdAt: true,
            },
        });
        // Group bookings by calendar month
        const monthlyStats = monthStarts.map((start, index) => {
            const end = index < monthStarts.length - 1
                ? monthStarts[index + 1]
                : windowEnd;
            const bookingsInMonth = completedBookings.filter((b) => b.createdAt >= start && b.createdAt < end);
            const jobs = bookingsInMonth.length;
            const earnings = bookingsInMonth.reduce((sum, b) => { var _a; return sum + ((_a = b.totalPrice) !== null && _a !== void 0 ? _a : 0); }, 0);
            return {
                month: monthLabel(start),
                jobs,
                earnings: Math.round(earnings * 100) / 100,
            };
        });
        res.json({
            totalJobs,
            totalEarnings: Math.round(totalEarnings * 100) / 100,
            averageRating,
            monthlyStats,
        });
    }
    catch (error) {
        console.error('GET /analytics/handyman error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
}));
exports.default = router;
