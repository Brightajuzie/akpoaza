import { Router, Response, NextFunction } from 'express';
import { authenticateToken, optionalAuthenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { resetMailer, sendTestEmail } from '../lib/notify';

const router = Router();

// Get all settings as a key-value object
// If accessed by an Admin, all settings (including credentials) are returned.
// If public, sensitive passwords/secret keys are stripped for security.
router.get('/', optionalAuthenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const settings = await prisma.appSetting.findMany();
    const settingsObj = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    const isAdmin = req.user?.role === 'ADMIN';
    if (!isAdmin) {
      delete settingsObj['smtp_pass'];
      delete settingsObj['stripe_secret_key'];
      delete settingsObj['stripe_webhook_secret'];
      delete settingsObj['paystack_secret_key'];
      delete settingsObj['flutterwave_secret_key'];
      delete settingsObj['opay_secret_key'];
    }

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

    // Invalidate cached SMTP transport so new email settings take effect immediately
    resetMailer();

    res.json({ message: 'Settings updated successfully', settings: updates });
  } catch (error) {
    next(error);
  }
});

// Send a test email (Admin only)
router.post('/test-email', authenticateToken, async (req: AuthRequest, res: Response) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  let { recipientEmail } = req.body;
  if (!recipientEmail) {
    // If not provided, try to use the current admin's email
    if (req.user?.userId) {
      const adminUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { email: true },
      });
      recipientEmail = adminUser?.email;
    }
  }

  if (!recipientEmail) {
    return res.status(400).json({ error: 'Recipient email is required for the test email.' });
  }

  try {
    const result = await sendTestEmail(recipientEmail);
    res.json(result);
  } catch (err: any) {
    console.error('[test-email] Failed to send test email:', err);
    res.status(400).json({
      error: err?.message || 'Failed to send test email. Please verify your SMTP settings and app password.',
    });
  }
});

export default router;
