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

// ─── Lazy singletons ──────────────────────────────────────────────────────────

let _mailer: nodemailer.Transporter | null = null;

function getMailer(): nodemailer.Transporter | null {
  if (_mailer) return _mailer;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  _mailer = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _mailer;
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
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px">Akpoaza</h1>
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
                © ${new Date().getFullYear()} Akpoaza. You are receiving this because you have an account with us.<br>
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

  // 3. Email (fire-and-forget)
  const mailer = getMailer();
  if (mailer && userEmail) {
    mailer.sendMail({
      from: `"Akpoaza" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: userEmail,
      subject: emailSubject || title,
      text: body,
      html: buildEmailHtml(title, body, emailHtml),
    }).catch((e) => console.error('[notify] email send failed:', e));
  }

  // 4. SMS (fire-and-forget)
  const twilioClient = getTwilio();
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (twilioClient && fromNumber && userPhone) {
    const smsBody = `[Akpoaza] ${title}\n${body}`;
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
