"use strict";
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
exports.sendNotification = sendNotification;
exports.notifyMany = notifyMany;
const nodemailer_1 = __importDefault(require("nodemailer"));
const twilio_1 = __importDefault(require("twilio"));
const prisma_1 = __importDefault(require("./prisma"));
// ─── Lazy singletons ──────────────────────────────────────────────────────────
let _mailer = null;
function getMailer() {
    // Skip email entirely during automated tests to prevent hangs on bad SMTP credentials
    if (process.env.NODE_ENV === 'test')
        return null;
    if (_mailer)
        return _mailer;
    const host = process.env.SMTP_HOST;
    if (!host)
        return null;
    _mailer = nodemailer_1.default.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        // Fail fast (10 s) rather than hanging on bad credentials
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
    });
    return _mailer;
}
function getTwilio() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token)
        return null;
    return (0, twilio_1.default)(sid, token);
}
// ─── Email HTML template ──────────────────────────────────────────────────────
function buildEmailHtml(title, body, customHtml) {
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
function sendNotification(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        // In test mode skip all external channels — only create the in-app notification
        const isTest = process.env.NODE_ENV === 'test';
        const { userId, title, body, type, referenceId, emailSubject, emailHtml, } = payload;
        // 1. Always fetch user to get email/phone (unless caller supplied them)
        let userEmail = payload.email;
        let userPhone = payload.phone;
        if (!userEmail || !userPhone) {
            const user = yield prisma_1.default.user.findUnique({
                where: { id: userId },
                select: { email: true, phone: true },
            }).catch(() => null);
            if (!userEmail && (user === null || user === void 0 ? void 0 : user.email))
                userEmail = user.email;
            if (!userPhone && (user === null || user === void 0 ? void 0 : user.phone))
                userPhone = user.phone;
        }
        // 2. In-app notification (always)
        const notification = yield prisma_1.default.notification.create({
            data: { userId, title, body, type, referenceId: referenceId !== null && referenceId !== void 0 ? referenceId : null },
        }).catch((e) => {
            console.error('[notify] in-app create failed:', e);
            return null;
        });
        // 3. Email (fire-and-forget — skipped in test mode)
        const mailer = getMailer();
        if (!isTest && mailer && userEmail) {
            mailer.sendMail({
                from: `"FixMart" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: userEmail,
                subject: emailSubject || title,
                text: body,
                html: buildEmailHtml(title, body, emailHtml),
            }).catch((e) => console.error('[notify] email send failed:', e));
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
    });
}
/**
 * notifyMany — convenience wrapper to notify multiple users at once.
 * All dispatches run concurrently.
 */
function notifyMany(payloads) {
    return __awaiter(this, void 0, void 0, function* () {
        return Promise.allSettled(payloads.map(sendNotification));
    });
}
