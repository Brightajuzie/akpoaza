import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

// Create a review
router.post('/', authenticateToken, async (req: AuthRequest, res, next) => {
  const { productId, serviceId, handymanId, rating, comment } = req.body;
  const authorId = req.user?.userId;

  if (!authorId) return res.status(401).json({ error: 'Unauthorized' });

  if (!productId && !serviceId && !handymanId) {
    return res.status(400).json({ error: 'Must provide productId, serviceId, or handymanId' });
  }

  const numRating = parseInt(rating, 10);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
  }

  try {
    // 1. Verify product purchase if reviewing a product
    if (productId) {
      const orderCount = await prisma.order.count({
        where: {
          userId: authorId,
          status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] },
          items: {
            some: {
              productId,
            },
          },
        },
      });

      if (orderCount === 0) {
        return res.status(403).json({
          error: 'Forbidden. You can only review products you have purchased.',
        });
      }
    }

    // 2. Verify completed service booking if reviewing a service
    if (serviceId) {
      const bookingCount = await prisma.booking.count({
        where: {
          customerId: authorId,
          serviceId,
          status: 'COMPLETED',
        },
      });

      if (bookingCount === 0) {
        return res.status(403).json({
          error: 'Forbidden. You can only review services you have booked and completed.',
        });
      }
    }

    // 3. Verify completed handyman booking if reviewing a handyman
    if (handymanId) {
      const bookingCount = await prisma.booking.count({
        where: {
          customerId: authorId,
          handymanId,
          status: 'COMPLETED',
        },
      });

      if (bookingCount === 0) {
        return res.status(403).json({
          error: 'Forbidden. You can only review handymen you have booked and completed jobs with.',
        });
      }
    }

    const review = await prisma.review.create({
      data: {
        authorId,
        productId,
        serviceId,
        handymanId,
        rating: numRating,
        comment,
      },
    });
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
});

// Get reviews for a product
router.get('/product/:productId', async (req, res, next) => {
  const { productId } = req.params;
  try {
    const reviews = await prisma.review.findMany({
      where: { productId },
      include: { author: { select: { name: true, profileImage: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reviews);
  } catch (error) {
    next(error);
  }
});

// Get reviews for a handyman
router.get('/handyman/:handymanId', async (req, res, next) => {
  const { handymanId } = req.params;
  try {
    const reviews = await prisma.review.findMany({
      where: { handymanId },
      include: { author: { select: { name: true, profileImage: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(reviews);
  } catch (error) {
    next(error);
  }
});

// Get reviews for a service
router.get('/service/:serviceId', async (req, res, next) => {
  const { serviceId } = req.params;
  try {
    const reviews = await prisma.review.findMany({
      where: { serviceId },
      include: { author: { select: { name: true, profileImage: true } } },
      orderBy: { createdAt: 'desc' }
    });
    const avg = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;
    res.json({ reviews, averageRating: avg, count: reviews.length });
  } catch (error) {
    next(error);
  }
});

export default router;
