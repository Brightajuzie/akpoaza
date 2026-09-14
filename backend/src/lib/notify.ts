/**
 * notify.ts — Unified multi-channel notification dispatcher
 *
 * Channels
 *  1. In-app  — Prisma Notification row (always attempted)
 *  2. Email   — Nodemailer / SMTP (skipped if SMTP_HOST is absent)
 *  3. SMS     — Twilio (skipped if TWILIO_ACCOUNT_SID is absent)
 *
 * All external channels are fire-and-forget: failures are logged but
 * never thrown so they never block the API response.
 */

import nodemailer from 'nodemailer';
import twilio from 'twilio';
import prisma from './prisma';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotifyPayload {
  /** DB user id to notify */
  userId: string;
  /** Short title shown in app notification bell */
  title: string;
  /** Longer body text */
  body: string;
  /** Notification category for deep-link routing on the client */
  type: 'ORDER' | 'BOOKING' | 'PARCEL' | 'PAYMENT' | 'KYC' | 'CALL' | 'GENERAL';
  /** Entity id the notification is about (orderId, bookingId, etc.) */
  referenceId?: string;
  /** Override email address (default: user.email from DB) */
  email?: string;
  /** Override phone number for SMS (default: user.phone from DB) */
  phone?: string;
  /** Email subject line (default: title) */
  emailSubject?: string;
  /** Rich HTML email body (default: plain text body) */
  emailHtml?: string;
}

// ─── Lazy singletons & Dynamic SMTP Config ──────────────────────────────────

let _mailer: nodemailer.Transporter | null = null;
let _cachedSettings: Record<string, string> | null = null;
let _lastSettingsFetch = 0;

export function resetMailer(): void {
  _mailer = null;
  _cachedSettings = null;
  _lastSettingsFetch = 0;
}

async function getSmtpConfig(): Promise<{
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}> {
  const now = Date.now();
  if (!_cachedSettings || now - _lastSettingsFetch > 30000) {
    try {
      const keys = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'];
      const dbSettings = await prisma.appSetting.findMany({
        where: { key: { in: keys } },
      });
      _cachedSettings = dbSettings.reduce((acc, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {} as Record<string, string>);
      _lastSettingsFetch = now;
    } catch (e) {
      console.warn('[notify] Could not query AppSetting for SMTP:', e);
      _cachedSettings = {};
    }
  }

  const s = _cachedSettings || {};
  const host = s['smtp_host'] || process.env.SMTP_HOST || undefined;
  const port = parseInt(s['smtp_port'] || process.env.SMTP_PORT || '465', 10);
  const secure = s['smtp_secure'] !== undefined ? s['smtp_secure'] === 'true' : (process.env.SMTP_SECURE === 'true' || port === 465);
  const user = s['smtp_user'] || process.env.SMTP_USER || undefined;
  const pass = s['smtp_pass'] || process.env.SMTP_PASS || undefined;
  const from = s['smtp_from'] || process.env.SMTP_FROM || (user ? `FixMart <${user}>` : 'FixMart <noreply@fixmart.app>');

  return { host, port, secure, user, pass, from };
}

async function getMailer(): Promise<{ mailer: nodemailer.Transporter | null; from: string }> {
  // Skip email entirely during automated tests to prevent hangs on bad SMTP credentials
  if (process.env.NODE_ENV === 'test') return { mailer: null, from: '' };

  const config = await getSmtpConfig();
  if (!config.host || !config.user || !config.pass) {
    return { mailer: null, from: config.from };
  }

  if (_mailer) return { mailer: _mailer, from: config.from };

  _mailer = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    // Fail fast (10 s) rather than hanging on bad credentials
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  return { mailer: _mailer, from: config.from };
}

/**
 * sendTestEmail — sends a verification email using the configured SMTP settings.
 * Returns { success: true, message: string } or throws with error details.
 */
export async function sendTestEmail(recipientEmail: string): Promise<{ success: boolean; message: string }> {
  const config = await getSmtpConfig();
  if (!config.host || !config.user || !config.pass) {
    throw new Error('SMTP credentials are incomplete. Please configure Host, User Email, and Password/App Password.');
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  // Verify connection first
  await transporter.verify();

  const title = '🎉 FixMart SMTP Email Test — Connection Verified!';
  const textBody = `Hello,\n\nThis is a test notification confirming that your FixMart SMTP Email setup is working properly!\n\nConfigured Sender: ${config.from}\nTimestamp: ${new Date().toLocaleString()}\n\nBest regards,\nFixMart Team`;
  const htmlBody = `
    <p style="font-size:16px;color:#374151;line-height:1.6">
      Hello,<br><br>
      This test notification confirms that your FixMart SMTP email server is active and properly connected!
    </p>
    <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:16px;margin:20px 0">
      <p style="margin:0 0 6px 0;font-size:14px;color:#166534"><strong>✅ Sender:</strong> ${config.from}</p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#166534"><strong>🌐 Host:</strong> ${config.host}:${config.port} (${config.secure ? 'SSL' : 'TLS'})</p>
      <p style="margin:0;font-size:14px;color:#166534"><strong>🕒 Sent At:</strong> ${new Date().toLocaleString()}</p>
    </div>
    <p style="font-size:14px;color:#6B7280;line-height:1.5">
      Customer bookings, order receipts, payment confirmations, and KYC notices will be dispatched through this email channel.
    </p>
  `;

  await transporter.sendMail({
    from: config.from,
    to: recipientEmail,
    subject: title,
    text: textBody,
    html: buildEmailHtml(title, '', htmlBody),
  });

  return {
    success: true,
    message: `Test email dispatched successfully to ${recipientEmail}!`,
  };
}

function getTwilio(): twilio.Twilio | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

// ─── Email HTML template ──────────────────────────────────────────────────────

function buildEmailHtml(title: string, body: string, customHtml?: string): string {
  const content = customHtml || `<p style="font-size:16px;color:#374151;line-height:1.6">${body.replace(/\n/g, '<br>')}</p>`;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:40px 0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#5856D6 0%,#007AFF 100%);padding:32px 40px;text-align:center">
              <p style="margin:0;font-size:28px">🛠️</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px">FixMart</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px">
              <h2 style="margin:0 0 16px;font-size:20px;color:#111827;font-weight:700">${title}</h2>
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#F9FAFB;padding:20px 40px;text-align:center;border-top:1px solid #E5E7EB">
              <p style="margin:0;font-size:12px;color:#9CA3AF">
                © ${new Date().getFullYear()} FixMart. You are receiving this because you have an account with us.<br>
                Do not reply to this email — it is sent from an unmonitored address.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * sendNotification — fires in-app + email + SMS for a single user.
 * Returns the created in-app Notification record.
 */
export async function sendNotification(payload: NotifyPayload) {
  // In test mode skip all external channels — only create the in-app notification
  const isTest = process.env.NODE_ENV === 'test';
  const {
    userId, title, body, type, referenceId,
    emailSubject, emailHtml,
  } = payload;

  // 1. Always fetch user to get email/phone (unless caller supplied them)
  let userEmail = payload.email;
  let userPhone = payload.phone;

  if (!userEmail || !userPhone) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    }).catch(() => null);
    if (!userEmail && user?.email) userEmail = user.email;
    if (!userPhone && user?.phone) userPhone = user.phone;
  }

  // 2. In-app notification (always)
  const notification = await prisma.notification.create({
    data: { userId, title, body, type, referenceId: referenceId ?? null },
  }).catch((e) => {
    console.error('[notify] in-app create failed:', e);
    return null;
  });

  // 3. Email (fire-and-forget — skipped in test mode)
  if (!isTest && userEmail) {
    getMailer().then(({ mailer, from }) => {
      if (mailer) {
        mailer.sendMail({
          from,
          to: userEmail,
          subject: emailSubject || title,
          text: body,
          html: buildEmailHtml(title, body, emailHtml),
        }).catch((e) => console.error('[notify] email send failed:', e));
      }
    }).catch((e) => console.error('[notify] getMailer error:', e));
  }

  // 4. SMS (fire-and-forget — skipped in test mode)
  const twilioClient = getTwilio();
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!isTest && twilioClient && fromNumber && userPhone) {
    const smsBody = `[FixMart] ${title}\n${body}`;
    twilioClient.messages.create({
      body: smsBody.substring(0, 160), // Standard SMS limit
      from: fromNumber,
      to: userPhone,
    }).catch((e) => console.error('[notify] SMS send failed:', e));
  }

  return notification;
}

/**
 * notifyMany — convenience wrapper to notify multiple users at once.
 * All dispatches run concurrently.
 */
export async function notifyMany(payloads: NotifyPayload[]) {
  return Promise.allSettled(payloads.map(sendNotification));
}

/**
 * sendWelcomeNotification — sends an in-app & email welcome notice to newly registered users.
 */
export async function sendWelcomeNotification(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  specialty?: string | null;
  verificationStatus?: string | null;
}) {
  const roleLabels: Record<string, string> = {
    CUSTOMER: 'Customer',
    HANDYMAN: 'Service Professional (Handyman)',
    VENDOR: 'Vendor & Merchant',
    RIDER: 'Delivery Rider',
    ADMIN: 'System Administrator',
  };
  const roleTitle = roleLabels[user.role] || user.role;

  let body = '';
  let customHtml = '';

  if (user.role === 'CUSTOMER') {
    body = `Welcome to FixMart, ${user.name}! Your account is active and ready. Explore verified handymen, genuine tools & hardware, and track your orders in real-time.`;
    customHtml = `
      <p style="font-size:16px;color:#374151">Hi ${user.name},</p>
      <p>Welcome to <strong>FixMart</strong> — your one-stop platform for verified home repair services, professional artisans, quality tools, and fast deliveries!</p>
      <div style="background:#EFF6FF;border-left:4px solid #3B82F6;padding:14px 16px;margin:18px 0;border-radius:6px;">
        <p style="margin:0;font-size:15px;color:#1E40AF;font-weight:700">🎉 Your Account is Ready!</p>
        <p style="margin:6px 0 0;font-size:14px;color:#1F2937">You can now book trusted artisans (plumbers, electricians, carpenters), order hardware and building materials, and track orders right to your doorstep.</p>
      </div>
      <p>If you have questions or need assistance, our support team is always glad to help.</p>
    `;
  } else if (user.role === 'HANDYMAN') {
    const isVerified = user.verificationStatus === 'VERIFIED';
    body = `Welcome to FixMart, ${user.name}! Your Service Provider profile (${user.specialty || 'General'}) is set up. ${isVerified ? 'Your account is active and ready for jobs.' : 'Our team will review your verification details shortly to activate you for jobs.'}`;
    customHtml = `
      <p style="font-size:16px;color:#374151">Hi ${user.name},</p>
      <p>Welcome to <strong>FixMart</strong> as a registered <strong>Service Professional</strong>!</p>
      <div style="background:#F0FDF4;border-left:4px solid #10B981;padding:14px 16px;margin:18px 0;border-radius:6px;">
        <p style="margin:0;font-size:15px;color:#065F46;font-weight:700">🛠️ Partner Onboarding</p>
        <p style="margin:6px 0 0;font-size:14px;color:#1F2937"><strong>Specialty:</strong> ${user.specialty || 'General Artisan'}</p>
        <p style="margin:4px 0 0;font-size:14px;color:#1F2937"><strong>Verification Status:</strong> ${isVerified ? '✅ Active & Verified' : '⏳ Pending Admin Review'}</p>
      </div>
      <p>Once your profile is active, you will receive real-time notifications whenever clients in your area request services matching your expertise.</p>
    `;
  } else if (user.role === 'VENDOR') {
    const isVerified = user.verificationStatus === 'VERIFIED';
    body = `Welcome to FixMart Marketplace, ${user.name}! Your merchant account has been created. ${isVerified ? 'You can now list and sell products on FixMart.' : 'Please complete your KYC verification to begin listing products.'}`;
    customHtml = `
      <p style="font-size:16px;color:#374151">Hi ${user.name},</p>
      <p>Welcome to <strong>FixMart Marketplace</strong> as a registered <strong>Vendor / Merchant</strong>!</p>
      <div style="background:#FDF4FF;border-left:4px solid #A855F7;padding:14px 16px;margin:18px 0;border-radius:6px;">
        <p style="margin:0;font-size:15px;color:#7E22CE;font-weight:700">🏪 Expand Your Sales on FixMart</p>
        <p style="margin:6px 0 0;font-size:14px;color:#1F2937">Sell your tools, hardware, and building supplies directly to thousands of active buyers and technicians across the region.</p>
        <p style="margin:4px 0 0;font-size:14px;color:#1F2937"><strong>Status:</strong> ${isVerified ? '✅ Active Merchant' : '⏳ Pending Verification'}</p>
      </div>
      <p>Log in to your FixMart Dashboard to upload your products and receive orders.</p>
    `;
  } else if (user.role === 'RIDER') {
    body = `Welcome to FixMart, ${user.name}! Your delivery partner account has been created. Our dispatch team will review your details to activate you for order deliveries.`;
    customHtml = `
      <p style="font-size:16px;color:#374151">Hi ${user.name},</p>
      <p>Thank you for signing up as a <strong>Delivery Partner</strong> on <strong>FixMart</strong>!</p>
      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;padding:14px 16px;margin:18px 0;border-radius:6px;">
        <p style="margin:0;font-size:15px;color:#92400E;font-weight:700">🛵 Fast Logistics Network</p>
        <p style="margin:6px 0 0;font-size:14px;color:#1F2937">Our logistics team will verify your vehicle and identification. Once approved, you can turn your status to Online and start fulfilling package dispatches.</p>
      </div>
    `;
  } else {
    body = `Welcome to FixMart, ${user.name}! Your ${roleTitle} account has been created successfully.`;
    customHtml = `<p>Welcome to FixMart, ${user.name}! Your account is now active.</p>`;
  }

  return sendNotification({
    userId: user.id,
    title: `🎉 Welcome to FixMart, ${user.name}!`,
    body,
    type: 'GENERAL',
    email: user.email,
    phone: user.phone || undefined,
    emailSubject: `🎉 Welcome to FixMart — Your ${roleTitle} Account is Ready!`,
    emailHtml: customHtml,
  }).catch((err) => console.error('[notify] sendWelcomeNotification failed:', err));
}
