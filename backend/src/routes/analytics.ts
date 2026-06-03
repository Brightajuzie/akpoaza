import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

/**
 * GET /analytics/handyman
 * Authenticated, HANDYMAN role only.
 * Returns dashboard analytics for the authenticated handyman:
 *   - totalJobs: count of COMPLETED bookings
 *   - totalEarnings: sum of totalPrice for COMPLETED bookings
 *   - averageRating: average rating from reviews (null if none)
 *   - monthlyStats: last 4 months with { month, jobs, earnings }
 */
router.get('/handyman', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    if (user.role !== 'HANDYMAN') {
      return res.status(403).json({ error: 'Forbidden: handyman access only' });
    }

    const handymanId = user.userId;

    // ── Total jobs (COMPLETED bookings) ──────────────────────────────────────
    const totalJobs = await prisma.booking.count({
      where: {
        handymanId,
        status: 'COMPLETED',
      },
    });

    // ── Total earnings ───────────────────────────────────────────────────────
    const earningsResult = await prisma.booking.aggregate({
      where: {
        handymanId,
        status: 'COMPLETED',
      },
      _sum: { totalPrice: true },
    });
    const totalEarnings = earningsResult._sum.totalPrice ?? 0;

    // ── Average rating ───────────────────────────────────────────────────────
    const ratingResult = await prisma.review.aggregate({
      where: { handymanId },
      _avg: { rating: true },
    });
    const averageRating =
      ratingResult._avg.rating !== null
        ? Math.round(ratingResult._avg.rating * 100) / 100
        : null;

    // ── Monthly stats (last 4 months) ────────────────────────────────────────
    // Build date boundaries for the last 4 full calendar months (inclusive of
    // the current month so the handyman sees up-to-date numbers).
    const now = new Date();

    // Helper: short month label, e.g. "Jan"
    const monthLabel = (date: Date): string =>
      date.toLocaleString('en-US', { month: 'short' });

    // Generate the first day of each of the last 4 months (oldest → newest)
    const monthStarts: Date[] = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthStarts.push(d);
    }

    // Fetch all COMPLETED bookings in the 4-month window in one query
    const windowStart = monthStarts[0];
    const windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1); // start of next month

    const completedBookings = await prisma.booking.findMany({
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
      const end =
        index < monthStarts.length - 1
          ? monthStarts[index + 1]
          : windowEnd;

      const bookingsInMonth = completedBookings.filter(
        (b) => b.createdAt >= start && b.createdAt < end
      );

      const jobs = bookingsInMonth.length;
      const earnings = bookingsInMonth.reduce(
        (sum, b) => sum + (b.totalPrice ?? 0),
        0
      );

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
  } catch (error) {
    console.error('GET /analytics/handyman error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
