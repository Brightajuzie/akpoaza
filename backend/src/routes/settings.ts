import { Router, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

// Get all settings as a key-value object
router.get('/', async (req, res, next) => {
  try {
    const settings = await prisma.appSetting.findMany();
    const settingsObj = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    res.json(settingsObj);
  } catch (error) {
    next(error);
  }
});

// Update settings (Admin only)
router.put('/', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  const updates = req.body; // Expecting { key: value, key2: value2 }
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Invalid settings payload. Expected a key-value object.' });
  }

  try {
    const prismaTxCalls = Object.entries(updates).map(([key, value]) => {
      return prisma.appSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    });

    await prisma.$transaction(prismaTxCalls);

    res.json({ message: 'Settings updated successfully', settings: updates });
  } catch (error) {
    next(error);
  }
});

export default router;
