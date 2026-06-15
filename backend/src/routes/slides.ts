import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

// GET all slides sorted by order
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slides = await prisma.promoSlide.findMany({
      orderBy: { order: 'asc' }
    });
    res.json(slides);
  } catch (error) {
    next(error);
  }
});

// POST create a slide (Admin only)
router.post('/', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  const { imageUrl, caption, order } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required' });
  }

  try {
    const slide = await prisma.promoSlide.create({
      data: {
        imageUrl,
        caption: caption || null,
        order: order !== undefined ? Number(order) : 0
      }
    });
    res.status(201).json(slide);
  } catch (error) {
    next(error);
  }
});

// PUT update a slide (Admin only)
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  const { id } = req.params;
  const { imageUrl, caption, order } = req.body;

  try {
    const slide = await prisma.promoSlide.findUnique({ where: { id } });
    if (!slide) {
      return res.status(404).json({ error: 'Slide not found' });
    }

    const updated = await prisma.promoSlide.update({
      where: { id },
      data: {
        imageUrl: imageUrl !== undefined ? imageUrl : slide.imageUrl,
        caption: caption !== undefined ? caption : slide.caption,
        order: order !== undefined ? Number(order) : slide.order
      }
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// DELETE a slide (Admin only)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  const { id } = req.params;

  try {
    const slide = await prisma.promoSlide.findUnique({ where: { id } });
    if (!slide) {
      return res.status(404).json({ error: 'Slide not found' });
    }

    await prisma.promoSlide.delete({ where: { id } });
    res.json({ message: 'Slide deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
