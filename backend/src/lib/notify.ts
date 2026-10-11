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
import https from 'https';
import path from 'path';
import fs from 'fs';
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
  type: 'ORDER' | 'BOOKING' | 'PARCEL' | 'PAYMENT' | 'KYC' | 'CALL' | 'GENERAL' | 'ADMIN_MESSAGE';
  /** Entity id the notification is about (orderId, bookingId, etc.) */
  referenceId?: string;
  /** Override email address (default: user.email from DB) */
  email?: string;
  /** Override phone number for SMS (default: user.phone from DB) */
  phone?: string;
  /** Override push notification token (default: user.pushToken from DB) */
  pushToken?: string;
  /** Email subject line (default: title) */
  emailSubject?: string;
  /** Rich HTML email body (default: plain text body) */
  emailHtml?: string;
  /** Custom SMS text body (defaults to `[FixMart] ${title}\n${body}`) */
  smsText?: string;
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
      const keys = [
        'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from',
        'twilio_account_sid', 'twilio_auth_token', 'twilio_from_number',
      ];
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
  let pass = s['smtp_pass'] || process.env.SMTP_PASS || undefined;
  if (pass) {
    pass = pass.trim();
    // Google App Passwords are 16 characters often copied with spaces (e.g. "abcd efgh ijkl mnop")
    if (pass.includes(' ') && (host === 'smtp.gmail.com' || pass.replace(/\s+/g, '').length === 16)) {
      pass = pass.replace(/\s+/g, '');
    }
  }

  const from = s['smtp_from'] || process.env.SMTP_FROM || (user ? `FixMart <${user}>` : 'FixMart <noreply@fixmart.app>');

  return { host, port, secure, user, pass, from };
}

/**
 * Resolves the disk path to the FixMart logo file if present.
 */
function getLogoDiskPath(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../uploads/fixmart-logo.png'),
    path.resolve(__dirname, '../uploads/fixmart-logo.png'),
    path.resolve(process.cwd(), 'uploads/fixmart-logo.png'),
    path.resolve(process.cwd(), 'backend/uploads/fixmart-logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Returns the publicly accessible fallback URL for the FixMart logo.
 */
function getEmailLogoUrl(): string {
  const s = _cachedSettings || {};
  const customLogo = s['logo_url'];
  if (customLogo && !customLogo.includes('localhost')) {
    return customLogo;
  }
  return 'https://akpoaza-3.onrender.com/uploads/fixmart-logo.png';
}

/**
 * Prepares Nodemailer attachments including the FixMart inline logo if present on disk.
 */
function getEmailAttachments(): nodemailer.SendMailOptions['attachments'] {
  const logoDiskPath = getLogoDiskPath();
  if (logoDiskPath) {
    return [
      {
        filename: 'fixmart-logo.png',
        path: logoDiskPath,
        cid: 'fixmartlogo',
      },
    ];
  }
  return [];
}

async function getMailer(): Promise<{ mailer: nodemailer.Transporter | null; from: string }> {
  // Skip email entirely during automated tests to prevent hangs on bad SMTP credentials
  if (process.env.NODE_ENV === 'test') return { mailer: null, from: '' };

  const config = await getSmtpConfig();
  if (!config.host || !config.user || !config.pass) {
    if (config.host || config.user) {
      // Partially configured — warn so the developer knows why email is skipped
      console.warn('[notify] Email skipped — SMTP config incomplete. host=%s user=%s pass=%s',
        config.host ? '✓' : '✗', config.user ? '✓' : '✗', config.pass ? '✓' : '✗');
    }
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

  const attachments = getEmailAttachments();

  await transporter.sendMail({
    from: config.from,
    to: recipientEmail,
    subject: title,
    text: textBody,
    html: buildEmailHtml(title, '', htmlBody),
    attachments,
  });

  return {
    success: true,
    message: `Test email dispatched successfully to ${recipientEmail}!`,
  };
}

export function normalizePhoneNumber(phone: string, defaultCountryCode = '234'): string {
  if (!phone) return '';
  const clean = phone.trim().replace(/[^\d+]/g, '');
  if (clean.startsWith('+')) return clean;
  if (clean.startsWith('0')) {
    return `+${defaultCountryCode}${clean.substring(1)}`;
  }
  if (clean.length === 10) {
    return `+${defaultCountryCode}${clean}`;
  }
  return `+${clean}`;
}

async function getTwilioClient(): Promise<{ client: twilio.Twilio | null; fromNumber: string | null }> {
  const s = _cachedSettings || {};
  const sid = s['twilio_account_sid'] || process.env.TWILIO_ACCOUNT_SID;
  const token = s['twilio_auth_token'] || process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = s['twilio_from_number'] || process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !fromNumber) return { client: null, fromNumber: null };
  return { client: twilio(sid, token), fromNumber };
}

/**
 * sendTestSms — sends a verification test SMS using the configured Twilio credentials.
 * Returns { success: true, message: string } or throws with error details.
 */
export async function sendTestSms(recipientPhone: string): Promise<{ success: boolean; message: string }> {
  const { client, fromNumber } = await getTwilioClient();
  if (!client || !fromNumber) {
    throw new Error('Twilio credentials incomplete. Please configure Account SID, Auth Token, and Sender Phone Number.');
  }

  const toPhone = normalizePhoneNumber(recipientPhone);
  if (!toPhone) {
    throw new Error('Please provide a valid recipient phone number.');
  }

  const msg = await client.messages.create({
    body: `[FixMart] Test SMS: Twilio integration verified and active! Time: ${new Date().toLocaleTimeString()}`,
    from: fromNumber,
    to: toPhone,
  });

  return {
    success: true,
    message: `Test SMS dispatched successfully to ${toPhone}! (SID: ${msg.sid})`,
  };
}

// ─── Expo Push Notification ───────────────────────────────────────────────────

/**
 * sendExpoPush — sends a push notification to a device via Expo's push service.
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 * Fire-and-forget; failures are logged but never thrown.
 */
function sendExpoPush(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): void {
  // Only valid Expo push tokens (ExponentPushToken[...]) or FCM/APNs tokens
  if (!pushToken || (!pushToken.startsWith('ExponentPushToken') && !pushToken.startsWith('ExpoPushToken'))) return;

  const message = JSON.stringify({
    to: pushToken,
    sound: 'default',
    title,
    body,
    data: data || {},
    priority: 'high',
    channelId: 'default',
  });

  const options: https.RequestOptions = {
    hostname: 'exp.host',
    path: '/--/api/v2/push/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Length': Buffer.byteLength(message),
    },
  };

  const req = https.request(options, (res) => {
    let raw = '';
    res.on('data', (chunk) => { raw += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(raw);
        const result = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data;
        if (result?.status === 'error') {
          console.warn('[notify] Expo push error:', result.message, result.details);
        }
      } catch {
        // ignore parse errors
      }
    });
  });
  req.on('error', (e) => console.error('[notify] Expo push request error:', e.message));
  req.write(message);
  req.end();
}

// ─── Email HTML template ───────────────────────────────────────────────────────

function buildEmailHtml(title: string, body: string, customHtml?: string): string {
  const content = customHtml || `<p style="font-size:16px;color:#334155;line-height:1.6;margin:0 0 16px;">${body.replace(/\n/g, '<br>')}</p>`;
  const logoFallbackUrl = getEmailLogoUrl();
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#1E293B;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#F1F5F9;padding:36px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background-color:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.06),0 8px 10px -6px rgba(0,0,0,0.04);border:1px solid #E2E8F0;">
          <!-- Brand Header with FixMart Logo Badge -->
          <tr>
            <td style="background:linear-gradient(135deg, #0A2540 0%, #007AFF 100%);padding:36px 28px 30px;text-align:center;">
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td style="background:#ffffff;border-radius:14px;padding:12px 26px;box-shadow:0 6px 18px rgba(0,0,0,0.20);">
                    <img src="cid:fixmartlogo" onerror="this.onerror=null;this.src='${logoFallbackUrl}';" alt="FixMart" width="150" style="display:block;max-height:50px;width:auto;max-width:180px;object-fit:contain;border:0;outline:none;margin:0 auto;" />
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#E0F2FE;font-weight:700;">Smart Services • E-Commerce • Swift Delivery</p>
            </td>
          </tr>
          <!-- Main Content Area -->
          <tr>
            <td style="padding:36px 36px 28px;">
              <h2 style="margin:0 0 18px;font-size:22px;color:#0F172A;font-weight:800;letter-spacing:-0.4px;line-height:1.35;">${title}</h2>
              ${content}
            </td>
          </tr>
          <!-- Mobile App Download Banner -->
          <tr>
            <td style="padding:0 36px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:20px 22px;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#0F172A;">📲 FixMart Mobile App</p>
                    <p style="margin:0 0 14px;font-size:13px;color:#64748B;line-height:1.45;">Experience faster bookings, real-time artisan tracking, and order delivery right from your smartphone.</p>
                    <table cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="padding-right:10px;">
                          <a href="https://akpoaza-3.onrender.com/download/apk" target="_blank" style="display:inline-block;background:#007AFF;color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;padding:9px 18px;border-radius:6px;">Direct APK Download</a>
                        </td>
                        <td>
                          <a href="https://play.google.com/store/apps" target="_blank" style="display:inline-block;background:#1E293B;color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;padding:9px 18px;border-radius:6px;">Google Play Store</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Security Notice -->
          <tr>
            <td style="padding:0 36px 24px;">
              <div style="background:#FFFBEB;border-left:4px solid #F59E0B;padding:12px 14px;border-radius:6px;">
                <p style="margin:0;font-size:12px;color:#92400E;line-height:1.45;">
                  <strong>🔒 Security Tip:</strong> FixMart will never contact you asking for your password, PIN, or BVN. Always keep your credentials safe.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#F8FAFC;padding:24px 36px;text-align:center;border-top:1px solid #E2E8F0;">
              <p style="margin:0 0 8px;font-size:13px;color:#64748B;">
                Need help? Contact support at <a href="mailto:admin.fixmart@gmail.com" style="color:#007AFF;text-decoration:none;font-weight:600;">admin.fixmart@gmail.com</a>
              </p>
              <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.5;">
                © ${currentYear} FixMart Technologies. All rights reserved.<br>
                You are receiving this email because you hold an active account on FixMart.
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

  // 1. Always fetch user to get email/phone/pushToken (unless caller supplied them)
  let userEmail = payload.email;
  let userPhone = payload.phone;
  let userPushToken = payload.pushToken;

  if (!userEmail || !userPhone || !userPushToken) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true, pushToken: true },
    }).catch(() => null);
    if (!userEmail && user?.email) userEmail = user.email;
    if (!userPhone && user?.phone) userPhone = user.phone;
    if (!userPushToken && user?.pushToken) userPushToken = user.pushToken;
  }

  // 2. In-app notification (always)
  const notification = await prisma.notification.create({
    data: { userId, title, body, type, referenceId: referenceId ?? null },
  }).catch((e) => {
    console.error('[notify] in-app create failed:', e);
    return null;
  });

  // 3. Expo Push Notification (fire-and-forget — skipped in test mode)
  if (!isTest && userPushToken) {
    sendExpoPush(userPushToken, title, body, {
      type,
      referenceId: referenceId ?? undefined,
      notificationId: notification?.id,
    });
  }

  // 4. Email (fire-and-forget — skipped in test mode)
  if (!isTest && userEmail) {
    getMailer().then(({ mailer, from }) => {
      if (mailer) {
        const attachments = getEmailAttachments();
        mailer.sendMail({
          from,
          to: userEmail,
          subject: emailSubject || title,
          text: body,
          html: buildEmailHtml(title, body, emailHtml),
          attachments,
        }).catch((e) => console.error('[notify] email send failed:', e));
      }
    }).catch((e) => console.error('[notify] getMailer error:', e));
  }

  // 5. SMS (fire-and-forget — skipped in test mode)
  if (!isTest && userPhone) {
    getTwilioClient().then(({ client, fromNumber }) => {
      if (client && fromNumber) {
        const toPhone = normalizePhoneNumber(userPhone!);
        const smsBody = payload.smsText || `[FixMart] ${title}\n${body}`;
        client.messages.create({
          body: smsBody.substring(0, 160),
          from: fromNumber,
          to: toPhone,
        }).catch((e) => console.error('[notify] SMS send failed to', toPhone, e?.message));
      }
    }).catch((e) => console.error('[notify] getTwilioClient error:', e));
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
 * sendWelcomeNotification — sends an in-app, email, SMS, and push welcome notice to newly registered users.
 */
export async function sendWelcomeNotification(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  specialty?: string | null;
  verificationStatus?: string | null;
  pushToken?: string | null;
}) {
  const roleLabels: Record<string, string> = {
    CUSTOMER: 'Customer',
    HANDYMAN: 'Service Professional (Handyman)',
    VENDOR: 'Vendor & Merchant',
    RIDER: 'Delivery Rider',
    ADMIN: 'System Administrator',
    AGENT: 'Regional Agent',
  };
  const roleTitle = roleLabels[user.role] || user.role;

  let body = '';
  let customHtml = '';
  let smsText = `[FixMart] Welcome, ${user.name}! Your account is active. Explore verified handymen, quality products & fast delivery.`;

  if (user.role === 'CUSTOMER') {
    body = `Welcome to FixMart, ${user.name}! Your account is active and ready. Explore verified handymen, genuine tools & hardware, and track your orders in real-time.`;
    smsText = `[FixMart] Welcome, ${user.name}! Your account is active and ready. Explore verified services & products on FixMart.`;
    customHtml = `
      <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
        Hello <strong>${user.name}</strong>,
      </p>
      <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
        Welcome to <strong>FixMart</strong>! We’re thrilled to have you join Africa's trusted on-demand home repair, artisan service, and hardware marketplace.
      </p>
      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 12px;font-size:16px;color:#1D4ED8;font-weight:700;">🚀 What You Can Do With FixMart:</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#1E293B;line-height:1.6;">
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🔧</td>
            <td style="padding:4px 0 6px 0;"><strong>Hire Verified Artisans:</strong> Plumbers, electricians, carpenters, AC technicians, painters & more at upfront, transparent rates.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🛒</td>
            <td style="padding:4px 0 6px 0;"><strong>Shop Genuine Products:</strong> Order building supplies, repair parts, and tools straight from vetted merchants.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🛡️</td>
            <td style="padding:4px 0 6px 0;"><strong>Safe Escrow Protection:</strong> Your payments remain safely locked in escrow until your service is fulfilled to your satisfaction.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">📍</td>
            <td style="padding:4px 0 6px 0;"><strong>Real-Time Tracking:</strong> Follow your dispatched artisan or delivery rider directly in the mobile app.</td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin:28px 0 16px;">
        <a href="https://akpoaza-3.onrender.com" target="_blank" style="display:inline-block;background:#007AFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 14px rgba(0,122,255,0.35);">🚀 Start Exploring FixMart</a>
      </div>
    `;
  } else if (user.role === 'HANDYMAN') {
    const isVerified = user.verificationStatus === 'VERIFIED';
    body = `Welcome to FixMart, ${user.name}! Your Service Provider profile (${user.specialty || 'General'}) is set up. ${isVerified ? 'Your account is active and ready for jobs.' : 'Our team will review your verification details shortly to activate you for jobs.'}`;
    smsText = `[FixMart] Welcome, ${user.name}! Your Service Provider profile is set up. We'll alert you when clients request jobs in your area.`;
    customHtml = `
      <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
        Hello <strong>${user.name}</strong>,
      </p>
      <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
        Welcome to the <strong>FixMart Professional Network</strong>! We connect skilled artisans and technicians with high-value jobs in their local neighborhoods.
      </p>
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 12px;font-size:16px;color:#15803D;font-weight:700;">🛠️ Service Professional Profile</p>
        <p style="margin:0 0 8px;font-size:14px;color:#1E293B;"><strong>Specialty Trade:</strong> ${user.specialty || 'General Service Specialist'}</p>
        <p style="margin:0 0 12px;font-size:14px;color:#1E293B;"><strong>Verification Status:</strong> ${isVerified ? '<span style="color:#15803D;font-weight:700;">✅ Active & Verified</span>' : '<span style="color:#D97706;font-weight:700;">⏳ In Review by Regional Agent</span>'}</p>
        <hr style="border:0;border-top:1px solid #DCFCE7;margin:12px 0;">
        <p style="margin:0 0 8px;font-size:14px;color:#15803D;font-weight:700;">💼 How to get jobs & maximize earnings:</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#1E293B;line-height:1.6;">
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🔔</td>
            <td style="padding:4px 0 6px 0;">Keep notifications active to accept instant job bookings within your state and radius.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">📸</td>
            <td style="padding:4px 0 6px 0;">Upload clear job photos and ID verification to earn the verified pro trust badge.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">💰</td>
            <td style="padding:4px 0 6px 0;">Job payments are automatically deposited into your FixMart wallet upon job completion.</td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin:28px 0 16px;">
        <a href="https://akpoaza-3.onrender.com" target="_blank" style="display:inline-block;background:#10B981;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 14px rgba(16,185,129,0.35);">🛠️ Open Pro Dashboard</a>
      </div>
    `;
  } else if (user.role === 'VENDOR') {
    const isVerified = user.verificationStatus === 'VERIFIED';
    body = `Welcome to FixMart Marketplace, ${user.name}! Your merchant account has been created. ${isVerified ? 'You can now list and sell products on FixMart.' : 'Please complete your KYC verification to begin listing products.'}`;
    smsText = `[FixMart] Welcome to FixMart, ${user.name}! Your merchant account is created. Log in to start listing products.`;
    customHtml = `
      <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
        Hello <strong>${user.name}</strong>,
      </p>
      <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
        Welcome to <strong>FixMart Marketplace</strong>! Reach thousands of contractors, homeowners, and artisans looking for tools, spare parts, and building materials.
      </p>
      <div style="background:#FAF5FF;border:1px solid #E9D5FF;border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 12px;font-size:16px;color:#7E22CE;font-weight:700;">🏪 Merchant Partner Details</p>
        <p style="margin:0 0 8px;font-size:14px;color:#1E293B;"><strong>Storefront:</strong> ${user.name}</p>
        <p style="margin:0 0 12px;font-size:14px;color:#1E293B;"><strong>Status:</strong> ${isVerified ? '<span style="color:#15803D;font-weight:700;">✅ Active Merchant</span>' : '<span style="color:#D97706;font-weight:700;">⏳ Verification Pending</span>'}</p>
        <hr style="border:0;border-top:1px solid #F3E8FF;margin:12px 0;">
        <p style="margin:0 0 8px;font-size:14px;color:#7E22CE;font-weight:700;">📦 Merchant Advantages:</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#1E293B;line-height:1.6;">
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">📈</td>
            <td style="padding:4px 0 6px 0;">Publish unlimited products with instant catalog visibility to nearby buyers.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🛵</td>
            <td style="padding:4px 0 6px 0;">FixMart logistics partners automatically handle delivery pickup from your store.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">💳</td>
            <td style="padding:4px 0 6px 0;">Direct wallet disbursements and financial reporting on all completed sales.</td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin:28px 0 16px;">
        <a href="https://akpoaza-3.onrender.com" target="_blank" style="display:inline-block;background:#8B5CF6;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 14px rgba(139,92,246,0.35);">🏪 Manage Products & Orders</a>
      </div>
    `;
  } else if (user.role === 'RIDER') {
    body = `Welcome to FixMart, ${user.name}! Your delivery partner account has been created. Our dispatch team will review your details to activate you for order deliveries.`;
    smsText = `[FixMart] Welcome, ${user.name}! Your Delivery Partner registration is received. Our dispatch team will review and activate your account.`;
    customHtml = `
      <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
        Hello <strong>${user.name}</strong>,
      </p>
      <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
        Welcome to the <strong>FixMart Dispatch & Logistics Network</strong>!
      </p>
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 12px;font-size:16px;color:#B45309;font-weight:700;">🛵 Delivery Rider Account</p>
        <p style="margin:0 0 8px;font-size:14px;color:#1E293B;"><strong>Logistics Partner:</strong> ${user.name}</p>
        <p style="margin:0 0 12px;font-size:14px;color:#1E293B;"><strong>Account Status:</strong> <span style="color:#D97706;font-weight:700;">⏳ Verification Under Review</span></p>
        <hr style="border:0;border-top:1px solid #FEF3C7;margin:12px 0;">
        <p style="margin:0 0 8px;font-size:14px;color:#B45309;font-weight:700;">📦 Next Steps:</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#1E293B;line-height:1.6;">
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">📄</td>
            <td style="padding:4px 0 6px 0;">Our dispatch supervisor will review your rider credentials and vehicle details.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🟢</td>
            <td style="padding:4px 0 6px 0;">Once approved, switch your status to <strong>Online</strong> in the app to begin receiving delivery requests.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">💵</td>
            <td style="padding:4px 0 6px 0;">Earn money per delivery with real-time balance tracking and instant wallet withdrawals.</td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin:28px 0 16px;">
        <a href="https://akpoaza-3.onrender.com" target="_blank" style="display:inline-block;background:#F59E0B;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 14px rgba(245,158,11,0.35);">🛵 View Rider Portal</a>
      </div>
    `;
  } else if (user.role === 'AGENT') {
    body = `Welcome to FixMart, ${user.name}! Your Regional Agent account has been created. Our admin team will review and activate your account shortly.`;
    smsText = `[FixMart] Welcome, ${user.name}! Your Regional Agent registration is received. Our admin team will review and activate your portal.`;
    customHtml = `
      <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
        Hello <strong>${user.name}</strong>,
      </p>
      <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
        Welcome to FixMart as an appointed <strong>Regional Operations Agent</strong>!
      </p>
      <div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 12px;font-size:16px;color:#0369A1;font-weight:700;">🏘️ Regional Agent Console</p>
        <p style="margin:0 0 8px;font-size:14px;color:#1E293B;"><strong>Agent:</strong> ${user.name}</p>
        <p style="margin:0 0 12px;font-size:14px;color:#1E293B;"><strong>Portal Status:</strong> <span style="color:#0369A1;font-weight:700;">⏳ Pending System Admin Activation</span></p>
        <hr style="border:0;border-top:1px solid #E0F2FE;margin:12px 0;">
        <p style="margin:0 0 8px;font-size:14px;color:#0369A1;font-weight:700;">🌐 Regional Duties & Privileges:</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#1E293B;line-height:1.6;">
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">👥</td>
            <td style="padding:4px 0 6px 0;">Onboard, verify, and assign local handymen and dispatch riders in your state.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">📊</td>
            <td style="padding:4px 0 6px 0;">Monitor regional booking requests and order fulfillments in real time.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🛡️</td>
            <td style="padding:4px 0 6px 0;">Resolve service queries and uphold FixMart quality and trust standards.</td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin:28px 0 16px;">
        <a href="https://akpoaza-3.onrender.com" target="_blank" style="display:inline-block;background:#0284C7;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 14px rgba(2,132,199,0.35);">🏘️ Launch Agent Portal</a>
      </div>
    `;
  } else {
    body = `Welcome to FixMart, ${user.name}! Your ${roleTitle} account has been created successfully.`;
    customHtml = `
      <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
        Hello <strong>${user.name}</strong>,
      </p>
      <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
        Your <strong>${roleTitle}</strong> account on FixMart is ready and active!
      </p>
      <div style="text-align:center;margin:28px 0 16px;">
        <a href="https://akpoaza-3.onrender.com" target="_blank" style="display:inline-block;background:#007AFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;">Launch FixMart</a>
      </div>
    `;
  }

  return sendNotification({
    userId: user.id,
    title: `🎉 Welcome to FixMart, ${user.name}!`,
    body,
    type: 'GENERAL',
    email: user.email,
    phone: user.phone || undefined,
    pushToken: user.pushToken || undefined,
    emailSubject: `🎉 Welcome to FixMart — Your ${roleTitle} Account is Ready!`,
    emailHtml: customHtml,
    smsText,
  }).catch((err) => console.error('[notify] sendWelcomeNotification failed:', err));
}

/**
 * sendFirstWeekOfMonthNotification — Dispatched at the start of every month.
 */
export async function sendFirstWeekOfMonthNotification(user: {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  pushToken?: string | null;
  role?: string;
}) {
  const title = '🗓️ New Month, Fresh Starts with FixMart!';
  const body = `Happy New Month, ${user.name}! Kickstart your month with proactive home maintenance, genuine hardware tools, and verified artisans on FixMart.`;
  const smsText = `[FixMart] Happy New Month, ${user.name}! Start fresh: book top-rated home repairs or shop genuine tools on FixMart: https://akpoaza-3.onrender.com`;
  
  const customHtml = `
    <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
      Hello <strong>${user.name}</strong>,
    </p>
    <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
      Welcome to the <strong>first week of the month</strong>! It’s the perfect time to organize, repair, and upgrade your home, office, and business workspace.
    </p>
    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 12px;font-size:16px;color:#15803D;font-weight:700;">🌟 Your Monthly Maintenance Checklist:</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#1E293B;line-height:1.6;">
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🔧</td>
          <td style="padding:4px 0 6px 0;"><strong>Schedule Routine Checkups:</strong> Inspect air conditioning, plumbing lines, generator circuits, and carpentry before small leaks become costly emergencies.</td>
        </tr>
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🛒</td>
          <td style="padding:4px 0 6px 0;"><strong>Restock Genuine Hardware & Supplies:</strong> Order quality replacement fittings, electrical supplies, paints, and tools directly from verified merchants.</td>
        </tr>
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🛡️</td>
          <td style="padding:4px 0 6px 0;"><strong>Protected by FixMart Escrow:</strong> Your payment remains securely locked until you test and confirm the completed service.</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="https://akpoaza-3.onrender.com" target="_blank" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 14px rgba(5,150,105,0.35);">🗓️ Plan Your Month with FixMart</a>
    </div>
  `;

  return sendNotification({
    userId: user.id,
    title,
    body,
    type: 'GENERAL',
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    pushToken: user.pushToken ?? undefined,
    emailSubject: `🗓️ FixMart Monthly Spotlight: Fresh Starts & Home Maintenance for ${user.name}`,
    emailHtml: customHtml,
    smsText,
  });
}

/**
 * sendWeekendNotification — Weekend prompt for household repairs & quick deliveries.
 */
export async function sendWeekendNotification(user: {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  pushToken?: string | null;
  role?: string;
}) {
  const title = '⚡ FixMart Weekend Alert: Relax While We Fix It!';
  const body = `Happy Weekend, ${user.name}! Don't let pending home repairs spoil your break. Our verified artisans and delivery riders are on standby to handle every fix.`;
  const smsText = `[FixMart] Happy Weekend, ${user.name}! Relax while our verified artisans handle pending repairs. Book services or tools today: https://akpoaza-3.onrender.com`;

  const customHtml = `
    <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
      Hello <strong>${user.name}</strong>,
    </p>
    <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
      The weekend is here! Your downtime is precious — let FixMart take care of your household fixes while you rest.
    </p>
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 12px;font-size:16px;color:#B45309;font-weight:700;">☕ Weekend Service Highlights:</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#1E293B;line-height:1.6;">
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🚰</td>
          <td style="padding:4px 0 6px 0;"><strong>On-Demand Artisans:</strong> Plumbers, electricians, painters, and appliance technicians ready for weekend call-outs.</td>
        </tr>
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🛵</td>
          <td style="padding:4px 0 6px 0;"><strong>Fast Weekend Parcel Delivery:</strong> Send items, groceries, and documents across town with real-time GPS tracking.</td>
        </tr>
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🏷️</td>
          <td style="padding:4px 0 6px 0;"><strong>Exclusive Weekend Deals:</strong> Special offers on home improvement products and electrical supplies.</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="https://akpoaza-3.onrender.com" target="_blank" style="display:inline-block;background:#D97706;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 14px rgba(217,119,6,0.35);">⚡ Book a Weekend Pro</a>
    </div>
  `;

  return sendNotification({
    userId: user.id,
    title,
    body,
    type: 'GENERAL',
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    pushToken: user.pushToken ?? undefined,
    emailSubject: `⚡ FixMart Weekend Spotlight: Relax & Let Us Handle the Repairs!`,
    emailHtml: customHtml,
    smsText,
  });
}

/**
 * sendIncompleteRegistrationNotification — Nudge for users missing phone, address, or KYC.
 */
export async function sendIncompleteRegistrationNotification(user: {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  pushToken?: string | null;
  role?: string;
  missingFields?: string[];
}) {
  const missingText = user.missingFields?.length ? user.missingFields.join(', ') : 'Profile & KYC details';
  const title = '⚠️ Action Required: Complete Your FixMart Profile';
  const body = `Hello ${user.name}, your FixMart profile is incomplete (missing: ${missingText}). Finish your profile now to enable verified bookings, escrow protection, and instant order delivery.`;
  const smsText = `[FixMart] Hello ${user.name}, your profile is incomplete. Finish your setup to unlock full bookings, verified trust badges & payouts: https://akpoaza-3.onrender.com`;

  const customHtml = `
    <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
      Hello <strong>${user.name}</strong>,
    </p>
    <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
      We noticed your FixMart account is missing key details. Completing your profile takes less than 2 minutes and unlocks full platform capabilities.
    </p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 12px;font-size:16px;color:#B91C1C;font-weight:700;">⚠️ Profile Items Awaiting Completion:</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#1E293B;line-height:1.6;">
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">📱</td>
          <td style="padding:4px 0 6px 0;"><strong>Active Phone Number:</strong> Essential for SMS order receipts, dispatch rider calls, and security notifications.</td>
        </tr>
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">📍</td>
          <td style="padding:4px 0 6px 0;"><strong>Default Address & State:</strong> Powers fast checkout and assigns nearby service professionals instantly.</td>
        </tr>
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">🆔</td>
          <td style="padding:4px 0 6px 0;"><strong>KYC Verification:</strong> Unlocks vendor listing privileges, artisan job eligibility, and wallet withdrawals.</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="https://akpoaza-3.onrender.com/profile" target="_blank" style="display:inline-block;background:#DC2626;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 14px rgba(220,38,38,0.35);">⚠️ Complete Profile Now</a>
    </div>
  `;

  return sendNotification({
    userId: user.id,
    title,
    body,
    type: 'KYC',
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    pushToken: user.pushToken ?? undefined,
    emailSubject: `⚠️ Urgent: Complete Your FixMart Account Setup, ${user.name}`,
    emailHtml: customHtml,
    smsText,
  });
}

/**
 * sendNonUploadNotification — Sent to Vendors or Artisans who have zero active listings.
 */
export async function sendNonUploadNotification(user: {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  pushToken?: string | null;
  role?: string;
}) {
  const isVendor = user.role === 'VENDOR';
  const itemType = isVendor ? 'products' : 'services';
  const title = `📦 Start Earning: Upload Your ${isVendor ? 'Products' : 'Services'} on FixMart!`;
  const body = `Hello ${user.name}, your FixMart storefront has 0 ${itemType} listed. Add your first listing today to start receiving customer orders and job requests.`;
  const smsText = `[FixMart] Attention ${user.name}: You have 0 ${itemType} listed! Add items today to start receiving orders: https://akpoaza-3.onrender.com`;

  const customHtml = `
    <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
      Hello <strong>${user.name}</strong>,
    </p>
    <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
      Thousands of homeowners, contractors, and shoppers browse FixMart daily. Right now, your catalog has <strong>no active ${itemType}</strong>!
    </p>
    <div style="background:#FAF5FF;border:1px solid #E9D5FF;border-radius:12px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 12px;font-size:16px;color:#7E22CE;font-weight:700;">🚀 How to Launch Your First Listing in 3 Minutes:</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#1E293B;line-height:1.6;">
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">1️⃣</td>
          <td style="padding:4px 0 6px 0;"><strong>Snap Clear Photos:</strong> Show your products or past service workmanship from multiple clean angles.</td>
        </tr>
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">2️⃣</td>
          <td style="padding:4px 0 6px 0;"><strong>Set Competitive Pricing:</strong> Enter transparent pricing in NGN. Customers appreciate clear upfront costs.</td>
        </tr>
        <tr>
          <td style="vertical-align:top;padding:4px 8px 6px 0;width:24px;">3️⃣</td>
          <td style="padding:4px 0 6px 0;"><strong>Sit Back & Fulfill:</strong> FixMart riders manage delivery pickup, and escrow funds land straight into your wallet upon delivery!</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="https://akpoaza-3.onrender.com" target="_blank" style="display:inline-block;background:#7C3AED;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 14px rgba(124,58,237,0.35);">📦 Upload ${isVendor ? 'Products' : 'Services'} Now</a>
    </div>
  `;

  return sendNotification({
    userId: user.id,
    title,
    body,
    type: 'GENERAL',
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    pushToken: user.pushToken ?? undefined,
    emailSubject: `📦 Boost Your Sales: Add Your ${isVendor ? 'Products' : 'Services'} to FixMart, ${user.name}!`,
    emailHtml: customHtml,
    smsText,
  });
}

/**
 * sendUserGuideNotification — Comprehensive User Guide with actionable prompts.
 */
export async function sendUserGuideNotification(user: {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  pushToken?: string | null;
  role?: string;
}) {
  const title = '📘 FixMart Complete User Guide & Essential Tips';
  const body = `Master FixMart in minutes, ${user.name}! Read our complete guide to hiring verified artisans, shopping genuine hardware, and protecting payments with escrow.`;
  const smsText = `[FixMart Guide] Welcome! Discover how to hire verified artisans, buy genuine tools & protect payments with escrow: https://akpoaza-3.onrender.com`;

  const customHtml = `
    <p style="font-size:16px;color:#1E293B;line-height:1.6;margin:0 0 16px;">
      Hello <strong>${user.name}</strong>,
    </p>
    <p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 20px;">
      Welcome to your comprehensive <strong>FixMart Platform Guide</strong>! Here is everything you need to know to get the most value out of FixMart:
    </p>

    <!-- Guide Section 1: Customers -->
    <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:20px;margin:16px 0;">
      <p style="margin:0 0 10px;font-size:16px;color:#1D4ED8;font-weight:700;">1. 🛒 Ordering Products & Tracking Deliveries</p>
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">
        • Browse building materials, replacement parts, and power tools.<br>
        • Choose between 1-time full payment or 50% split payment.<br>
        • Follow your delivery rider in real time via live GPS mapping.<br>
        • Verify the physical condition before confirming receipt.
      </p>
    </div>

    <!-- Guide Section 2: Artisans & Services -->
    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:12px;padding:20px;margin:16px 0;">
      <p style="margin:0 0 10px;font-size:16px;color:#15803D;font-weight:700;">2. 🔧 Hiring Verified Artisans & Handymen</p>
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">
        • Search for electricians, plumbers, AC technicians, carpenters, or painters.<br>
        • Check their verified KYC badge, customer reviews, and completed job ratings.<br>
        • Set your scheduled date and time; communicate directly via in-app call/chat.
      </p>
    </div>

    <!-- Guide Section 3: Escrow Protection -->
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:20px;margin:16px 0;">
      <p style="margin:0 0 10px;font-size:16px;color:#B45309;font-weight:700;">3. 🛡️ How Escrow Safeguards Your Money</p>
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">
        • When you pay, funds enter a <strong>secure escrow vault</strong> — NOT directly to the provider.<br>
        • The artisan or vendor works knowing payment is guaranteed.<br>
        • You only release funds when the work is thoroughly inspected and approved.
      </p>
    </div>

    <!-- Guide Section 4: Express Parcel -->
    <div style="background:#FDF2F8;border:1px solid #FBCFE8;border-radius:12px;padding:20px;margin:16px 0;">
      <p style="margin:0 0 10px;font-size:16px;color:#BE185D;font-weight:700;">4. 🛵 Express Parcel Dispatch & Logistics</p>
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">
        • Need to send items or tools across town? Book a dispatch rider in 3 clicks.<br>
        • Automated transparent pricing based on distance and parcel size.<br>
        • Real-time delivery confirmation and receipt generation.
      </p>
    </div>

    <div style="text-align:center;margin:28px 0 16px;">
      <a href="https://akpoaza-3.onrender.com" target="_blank" style="display:inline-block;background:#007AFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;box-shadow:0 4px 14px rgba(0,122,255,0.35);">🚀 Launch FixMart Mobile App</a>
    </div>
  `;

  return sendNotification({
    userId: user.id,
    title,
    body,
    type: 'GENERAL',
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    pushToken: user.pushToken ?? undefined,
    emailSubject: `📘 FixMart Complete User Guide: Tips, Escrow & Navigation for ${user.name}`,
    emailHtml: customHtml,
    smsText,
  });
}

