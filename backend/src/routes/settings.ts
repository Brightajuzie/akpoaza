import { Router, Response, NextFunction } from 'express';
import { authenticateToken, optionalAuthenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { resetMailer, sendTestEmail, sendTestSms } from '../lib/notify';

const router = Router();

import fs from 'fs';
import path from 'path';

// Helper to safely sync environment variables to .env on disk (if file exists)
function syncToEnvFile(envUpdates: Record<string, string>) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    let content = fs.readFileSync(envPath, 'utf8');

    for (const [key, value] of Object.entries(envUpdates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const formatted = `${key}="${value}"`;
      if (regex.test(content)) {
        content = content.replace(regex, formatted);
      } else {
        content += `\n${formatted}`;
      }
    }

    fs.writeFileSync(envPath, content, 'utf8');
    console.log('[settings] Successfully synced updated keys to .env:', Object.keys(envUpdates));
  } catch (err: any) {
    console.warn('[settings] Could not write to .env file:', err?.message || err);
  }
}

// Get all settings as a key-value object
// If accessed by an Admin, all settings (including credentials) are returned with env fallbacks.
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
      delete settingsObj['twilio_auth_token'];
    } else {
      // For Admin, populate any missing settings from environment variables
      if (!settingsObj['smtp_pass'] && process.env.SMTP_PASS) {
        settingsObj['smtp_pass'] = process.env.SMTP_PASS;
      }
      if (!settingsObj['smtp_user'] && process.env.SMTP_USER) {
        settingsObj['smtp_user'] = process.env.SMTP_USER;
      }
      if (!settingsObj['smtp_host'] && process.env.SMTP_HOST) {
        settingsObj['smtp_host'] = process.env.SMTP_HOST;
      }
      if (!settingsObj['smtp_port'] && process.env.SMTP_PORT) {
        settingsObj['smtp_port'] = process.env.SMTP_PORT;
      }
      if (!settingsObj['smtp_secure'] && process.env.SMTP_SECURE) {
        settingsObj['smtp_secure'] = process.env.SMTP_SECURE;
      }
      if (!settingsObj['smtp_from'] && process.env.SMTP_FROM) {
        settingsObj['smtp_from'] = process.env.SMTP_FROM;
      }
      if (!settingsObj['twilio_account_sid'] && process.env.TWILIO_ACCOUNT_SID) {
        settingsObj['twilio_account_sid'] = process.env.TWILIO_ACCOUNT_SID;
      }
      if (!settingsObj['twilio_auth_token'] && process.env.TWILIO_AUTH_TOKEN) {
        settingsObj['twilio_auth_token'] = process.env.TWILIO_AUTH_TOKEN;
      }
      if (!settingsObj['twilio_from_number'] && process.env.TWILIO_FROM_NUMBER) {
        settingsObj['twilio_from_number'] = process.env.TWILIO_FROM_NUMBER;
      }
      settingsObj['smtp_pass_configured'] = (settingsObj['smtp_pass'] || process.env.SMTP_PASS) ? 'true' : 'false';
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

  const updates = { ...req.body }; // Expecting { key: value, key2: value2 }
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Invalid settings payload. Expected a key-value object.' });
  }

  try {
    const envUpdates: Record<string, string> = {};

    // ── Email / SMTP Password Handling ─────────────────────────────────────
    if (typeof updates.smtp_pass === 'string') {
      let cleanPass = updates.smtp_pass.trim();
      // Google App Passwords are 16 characters often formatted with spaces (e.g. "abcd efgh ijkl mnop")
      if (cleanPass.includes(' ') && (cleanPass.replace(/\s+/g, '').length === 16 || updates.smtp_host === 'smtp.gmail.com')) {
        cleanPass = cleanPass.replace(/\s+/g, '');
      }

      if (cleanPass === '') {
        // If empty string sent and not explicit clear request, preserve existing DB or env password!
        if (updates.clear_smtp_pass !== true && updates.clear_smtp_pass !== 'true') {
          delete updates.smtp_pass;
        } else {
          updates.smtp_pass = '';
          process.env.SMTP_PASS = '';
          envUpdates['SMTP_PASS'] = '';
        }
      } else {
        updates.smtp_pass = cleanPass;
        process.env.SMTP_PASS = cleanPass;
        envUpdates['SMTP_PASS'] = cleanPass;
      }
    }

    if (updates.smtp_user !== undefined) {
      const cleanUser = String(updates.smtp_user).trim();
      updates.smtp_user = cleanUser;
      process.env.SMTP_USER = cleanUser;
      envUpdates['SMTP_USER'] = cleanUser;
    }
    if (updates.smtp_host !== undefined) {
      const cleanHost = String(updates.smtp_host).trim();
      updates.smtp_host = cleanHost;
      process.env.SMTP_HOST = cleanHost;
      envUpdates['SMTP_HOST'] = cleanHost;
    }
    if (updates.smtp_port !== undefined) {
      const cleanPort = String(updates.smtp_port).trim();
      updates.smtp_port = cleanPort;
      process.env.SMTP_PORT = cleanPort;
      envUpdates['SMTP_PORT'] = cleanPort;
    }
    if (updates.smtp_secure !== undefined) {
      const cleanSecure = String(updates.smtp_secure).trim();
      updates.smtp_secure = cleanSecure;
      process.env.SMTP_SECURE = cleanSecure;
      envUpdates['SMTP_SECURE'] = cleanSecure;
    }
    if (updates.smtp_from !== undefined) {
      const cleanFrom = String(updates.smtp_from).trim();
      updates.smtp_from = cleanFrom;
      process.env.SMTP_FROM = cleanFrom;
      envUpdates['SMTP_FROM'] = cleanFrom;
    }

    // ── Twilio Sync ────────────────────────────────────────────────────────
    if (updates.twilio_account_sid !== undefined) {
      const clean = String(updates.twilio_account_sid).trim();
      updates.twilio_account_sid = clean;
      process.env.TWILIO_ACCOUNT_SID = clean;
      envUpdates['TWILIO_ACCOUNT_SID'] = clean;
    }
    if (updates.twilio_auth_token !== undefined) {
      const clean = String(updates.twilio_auth_token).trim();
      if (clean === '') {
        // If empty string sent and not explicit clear request, preserve existing DB or env token!
        if (updates.clear_twilio_auth_token !== true && updates.clear_twilio_auth_token !== 'true') {
          delete updates.twilio_auth_token;
        } else {
          updates.twilio_auth_token = '';
          process.env.TWILIO_AUTH_TOKEN = '';
          envUpdates['TWILIO_AUTH_TOKEN'] = '';
        }
      } else {
        updates.twilio_auth_token = clean;
        process.env.TWILIO_AUTH_TOKEN = clean;
        envUpdates['TWILIO_AUTH_TOKEN'] = clean;
      }
    }
    if (updates.twilio_from_number !== undefined) {
      const clean = String(updates.twilio_from_number).trim();
      updates.twilio_from_number = clean;
      process.env.TWILIO_FROM_NUMBER = clean;
      envUpdates['TWILIO_FROM_NUMBER'] = clean;
    }

    // Remove any special flags from the DB upsert
    delete updates.clear_smtp_pass;
    delete updates.clear_twilio_auth_token;

    // Persist to .env file on disk if available
    if (Object.keys(envUpdates).length > 0) {
      syncToEnvFile(envUpdates);
    }

    // Upsert into database
    const prismaTxCalls = Object.entries(updates).map(([key, value]) => {
      return prisma.appSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    });

    await prisma.$transaction(prismaTxCalls);

    // Invalidate cached SMTP & Twilio transport so new settings take effect immediately
    resetMailer();

    res.json({
      message: 'Settings updated successfully',
      settings: updates,
      smtp_pass_synced: updates.smtp_pass !== undefined,
      twilio_synced: updates.twilio_account_sid !== undefined || updates.twilio_auth_token !== undefined,
    });
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

// Send a test SMS via Twilio (Admin only)
router.post('/test-sms', authenticateToken, async (req: AuthRequest, res: Response) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  let { recipientPhone } = req.body;
  if (!recipientPhone) {
    // If not provided, try to use the current admin's phone
    if (req.user?.userId) {
      const adminUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { phone: true },
      });
      recipientPhone = adminUser?.phone;
    }
  }

  if (!recipientPhone) {
    return res.status(400).json({ error: 'Recipient phone number is required for the test SMS.' });
  }

  try {
    const result = await sendTestSms(recipientPhone);
    res.json(result);
  } catch (err: any) {
    console.error('[test-sms] Failed to send test SMS:', err);
    res.status(400).json({
      error: err?.message || 'Failed to send test SMS. Please verify your Twilio credentials and recipient phone number.',
    });
  }
});

export default router;
