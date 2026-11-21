import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { buildEmailHtml } from '../src/lib/notify';
import prisma from '../src/lib/prisma';

// Target contact emails list
const STATIC_TARGET_EMAILS: string[] = [
  'brightajuzie@gmail.com',
  'kachlinkstechnologiesaba@gmail.com',
  'ikaydigitalservices@gmail.com',
  'lizzyebere49@gmail.com',
  'obinnakalu801@gmail.com',
  'amaechinaikechukwu6@gmail.com',
  'chiamakaoti98@gmail.com',
  'miraclegodwin67@gmail.com',
  'izunnadarlington@gmail.com',
  'kestil75@gmail.com',
  'chimajefferson500@gmail.com',
  'admin.fixmart@gmail.com',
  'michealqueen77@gmail.com',
  'jsmicheal398@gmail.com',
  'mosesjoshua67890@gmail.com',
  'esthernjoku543@gmail.com',
  'brighteze27@gmail.com',
];

const PLAYSTORE_URL =
  'https://play.google.com/store/apps/details?id=com.akpoaza.kachlinks&pcampaignid=web_share&pli=1';
const WEB_URL = 'https://fixmart.ng';
const APK_DOWNLOAD_URL = 'https://akpoaza-3.onrender.com/download/apk';

interface Recipient {
  email: string;
  name: string;
  role: string;
  isRegisteredUser: boolean;
}

function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  // Filter out dummy/test patterns
  if (trimmed.endsWith('@test.com') || trimmed.endsWith('@example.com')) return false;
  if (trimmed.includes(' ') || !trimmed.includes('@')) return false;
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1];
  if (!domain.includes('.') || domain.length < 4) return false;
  // Specific exclusions for invalid test entries
  if (domain === 'n.com' || domain === 'b.n' || domain === 'v.n') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

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

function buildMondayAdvertEmailHtml(recipient: Recipient): { subject: string; html: string; text: string } {
  const firstName = recipient.name ? recipient.name.split(' ')[0] : 'there';
  const role = (recipient.role || '').toUpperCase();

  let roleSpecificSection = '';
  if (role === 'VENDOR') {
    roleSpecificSection = `
      <div style="background:#EEF2FF;border-left:4px solid #4F46E5;border-radius:10px;padding:16px 18px;margin-bottom:20px;">
        <h4 style="margin:0 0 8px;font-size:15px;color:#3730A3;font-weight:800;">
          🏪 Vendor Monday Action Checklist:
        </h4>
        <ul style="margin:0;padding-left:20px;font-size:13.5px;color:#312E81;line-height:1.7;">
          <li><strong>Upload Fresh Products & Services:</strong> Showcase your inventory with clear photos to catch active Monday buyers.</li>
          <li><strong>Zero Listing Fees:</strong> Keep 100% of your listed profit with no upfront commissions.</li>
          <li><strong>Instant Bank Cashout:</strong> Withdraw sales revenue directly to any Nigerian bank account anytime.</li>
        </ul>
      </div>
    `;
  } else if (role === 'HANDYMAN') {
    roleSpecificSection = `
      <div style="background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:10px;padding:16px 18px;margin-bottom:20px;">
        <h4 style="margin:0 0 8px;font-size:15px;color:#92400E;font-weight:800;">
          🛠️ Artisan & Handyman Monday Action Checklist:
        </h4>
        <ul style="margin:0;padding-left:20px;font-size:13.5px;color:#78350F;line-height:1.7;">
          <li><strong>Update Your Availability:</strong> Switch your status to available so clients in your area can book you immediately.</li>
          <li><strong>Prompt Responses:</strong> Respond quickly to client requests for electricians, plumbers, AC technicians, mechanics, and carpenters.</li>
          <li><strong>Guaranteed Escrow Payout:</strong> Work with confidence knowing your payment is securely held and released upon job completion.</li>
        </ul>
      </div>
    `;
  } else if (role === 'RIDER') {
    roleSpecificSection = `
      <div style="background:#F3E8FF;border-left:4px solid #9333EA;border-radius:10px;padding:16px 18px;margin-bottom:20px;">
        <h4 style="margin:0 0 8px;font-size:15px;color:#6B21A8;font-weight:800;">
          🛵 Delivery Rider Monday Kickoff:
        </h4>
        <ul style="margin:0;padding-left:20px;font-size:13.5px;color:#581C87;line-height:1.7;">
          <li><strong>Go Online Early:</strong> Pick up morning parcel dispatches and e-commerce deliveries across the city.</li>
          <li><strong>Instant Delivery Payouts:</strong> Withdraw your dispatch fees straight to your bank account after every delivery.</li>
        </ul>
      </div>
    `;
  } else {
    // Customer or General Contact
    roleSpecificSection = `
      <div style="background:#ECFDF5;border-left:4px solid #10B981;border-radius:10px;padding:16px 18px;margin-bottom:20px;">
        <h4 style="margin:0 0 8px;font-size:15px;color:#065F46;font-weight:800;">
          🛍️ Discover What's New on FixMart This Week:
        </h4>
        <ul style="margin:0;padding-left:20px;font-size:13.5px;color:#047857;line-height:1.7;">
          <li><strong>Shop Quality Hardware & Products:</strong> Browse verified electronics, building materials, tools, and lifestyle essentials.</li>
          <li><strong>Book Vetted Artisans on Demand:</strong> Hire certified electricians, plumbers, carpenters, mechanics, and technicians with transparent pricing.</li>
          <li><strong>100% Escrow Protection:</strong> Your payment remains protected in escrow until you inspect and approve the job or goods.</li>
        </ul>
      </div>
    `;
  }

  const customContent = `
    <!-- Greeting & Monday Motivation -->
    <div style="text-align:center;padding:10px 0 20px;">
      <span style="background:#EEF2FF;color:#4F46E5;font-weight:700;font-size:12px;padding:6px 16px;border-radius:24px;text-transform:uppercase;letter-spacing:1px;display:inline-block;">
        🌅 Happy Monday & New Week Motivation
      </span>
      <h1 style="font-size:24px;font-weight:900;color:#0F172A;margin:16px 0 10px;line-height:1.35;">
        Start Your Week Strong with FixMart Solutions, ${firstName}! 🚀
      </h1>
      <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 auto;max-width:520px;">
        Welcome to a new week of opportunities, productivity, and growth. Whether you are shopping for quality items, hiring vetted professionals, or growing your business — FixMart is here to power your success.
      </p>
    </div>

    <!-- Role-Specific Action Card -->
    ${roleSpecificSection}

    <!-- Prominent Play Store Download Card -->
    <div style="background:linear-gradient(135deg, #0A2540 0%, #007AFF 100%);border-radius:16px;padding:26px 22px;color:#ffffff;text-align:center;margin:10px 0 26px;box-shadow:0 8px 20px rgba(0,122,255,0.22);">
      <h3 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#ffffff;">
        📲 FixMart Solutions is Live on Google Play!
      </h3>
      <p style="margin:0 0 20px;font-size:14px;color:#E0F2FE;line-height:1.5;max-width:460px;margin-left:auto;margin-right:auto;">
        Download the official mobile app today for seamless shopping, verified on-demand artisan bookings, express parcel delivery, and instant bank withdrawals.
      </p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
        <tr>
          <td style="padding:4px 8px;">
            <a href="${PLAYSTORE_URL}" target="_blank" style="background:#ffffff;color:#007AFF;font-weight:800;font-size:14px;text-decoration:none;padding:13px 26px;border-radius:10px;display:inline-block;box-shadow:0 4px 10px rgba(0,0,0,0.15);">
              ▶ Download on Google Play
            </a>
          </td>
          <td style="padding:4px 8px;">
            <a href="${WEB_URL}" target="_blank" style="background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.4);color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block;">
              🌐 Visit FixMart Web
            </a>
          </td>
        </tr>
      </table>
    </div>

    <!-- Advert: Marketplace Core Pillars -->
    <div style="margin:22px 0;">
      <h3 style="font-size:17px;font-weight:800;color:#0F172A;margin:0 0 16px;text-align:left;">
        🌟 Why Thousands Trust FixMart Solutions:
      </h3>

      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #10B981;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
        <h4 style="margin:0 0 4px;font-size:14.5px;color:#065F46;font-weight:800;">
          🛍️ 1. Safe Shopping with 100% Escrow Protection
        </h4>
        <p style="margin:0;font-size:13px;color:#334155;line-height:1.55;">
          Order products with total peace of mind. Your funds stay protected in our escrow vault until you confirm delivery and inspect your purchase.
        </p>
      </div>

      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #F59E0B;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
        <h4 style="margin:0 0 4px;font-size:14.5px;color:#92400E;font-weight:800;">
          🛠️ 2. Certified Artisans & Handymen On Demand
        </h4>
        <p style="margin:0;font-size:13px;color:#334155;line-height:1.55;">
          Need a quick fix? Book vetted electricians, plumbers, carpenters, painters, and AC technicians in minutes. Fair pricing with escrow guarantee!
        </p>
      </div>

      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #007AFF;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
        <h4 style="margin:0 0 4px;font-size:14.5px;color:#1E40AF;font-weight:800;">
          🏪 3. Vendors: Sell with Zero Upfront Listing Fees
        </h4>
        <p style="margin:0;font-size:13px;color:#334155;line-height:1.55;">
          List your products or services, reach thousands of buyers across the city, and withdraw your earnings directly to your bank in seconds.
        </p>
      </div>

      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #8B5CF6;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
        <h4 style="margin:0 0 4px;font-size:14.5px;color:#6D28D9;font-weight:800;">
          🛵 4. Express Parcel Deliveries
        </h4>
        <p style="margin:0;font-size:13px;color:#334155;line-height:1.55;">
          Send goods, parcels, or tools across town with vetted dispatch riders and transparent live tracking.
        </p>
      </div>
    </div>

    <!-- Community Invitation & Referral Card -->
    <div style="background:#FEF3C7;border-radius:14px;padding:20px;margin:24px 0;border:1px dashed #D97706;">
      <div style="text-align:center;margin-bottom:10px;">
        <span style="font-size:26px;">🤝</span>
        <h3 style="margin:6px 0 6px;font-size:17px;color:#92400E;font-weight:800;">
          Invite Friends, Recommend Artisans & Grow Our Community!
        </h3>
      </div>
      <p style="margin:0 0 12px;font-size:13.5px;color:#78350F;line-height:1.6;text-align:center;">
        Do you know skilled handymen (electricians, plumbers, carpenters, mechanics), merchants with goods to sell, or reliable dispatch riders?
      </p>
      <div style="background:#FFFBEB;border-radius:8px;padding:12px 14px;margin-bottom:12px;color:#78350F;font-size:13px;line-height:1.6;">
        • <strong>Invite Your Friends & Clients:</strong> Share FixMart with them so they enjoy safe shopping & verified repairs.<br>
        • <strong>Recommend Local Artisans:</strong> Help skilled tradesmen get booked by introducing them to FixMart.<br>
        • <strong>Refer Vendors & Riders:</strong> Help store owners boost daily sales and riders earn steady dispatch income!
      </div>
      <p style="margin:0;font-size:12.5px;color:#92400E;text-align:center;font-weight:600;">
        Share this download link with them today: <a href="${PLAYSTORE_URL}" style="color:#D97706;text-decoration:underline;">FixMart on Google Play</a>
      </p>
    </div>

    <!-- Call to Action Buttons -->
    <div style="text-align:center;padding:18px 0 10px;">
      <a href="${PLAYSTORE_URL}" target="_blank" style="background:#007AFF;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;padding:14px 34px;border-radius:10px;display:inline-block;box-shadow:0 6px 16px rgba(0,122,255,0.30);">
        Open FixMart on Google Play →
      </a>
      <p style="margin:14px 0 0;font-size:13px;color:#64748B;">
        Prefer direct APK? <a href="${APK_DOWNLOAD_URL}" style="color:#007AFF;font-weight:600;text-decoration:none;">Download Direct APK</a> &nbsp;|&nbsp; Web: <a href="${WEB_URL}" style="color:#007AFF;font-weight:600;text-decoration:none;">fixmart.ng</a>
      </p>
    </div>
  `;

  const subject = `🌅 Happy Monday from FixMart Solutions — Boost Your Sales, Book Services & Invite Others!`;

  const html = buildEmailHtml(
    `🌅 Happy Monday from FixMart Solutions!`,
    `Start your week strong with FixMart. Discover verified shopping, book top artisans, enjoy zero listing fees, and invite your network to join!`,
    customContent
  );

  const text = `
FixMart Solutions — Monday Motivation, Smart Marketplace & Service App
Hi ${firstName}!

Start your week strong with FixMart Solutions!
FixMart is now officially available on Google Play Store:
${PLAYSTORE_URL}

Here is what you can do on FixMart today:
1. BUY & HIRE SAFELY: 100% Escrow Protection on every product and artisan booking (electricians, plumbers, carpenters, mechanics).
2. SELL WITH ZERO FEES: List your products or services, reach thousands of buyers, and withdraw your earnings directly to your bank account anytime.
3. ON-DEMAND ARTISANS: Turn your skills into steady daily income.
4. EXPRESS PARCEL DISPATCH: Fast package deliveries across town.

INVITE YOUR NETWORK:
Do you know skilled artisans, store owners, or dispatch riders? Recommend FixMart to them today and invite your friends and clients to experience seamless shopping and reliable repairs!

Download FixMart on Google Play:
${PLAYSTORE_URL}

Direct APK Download:
${APK_DOWNLOAD_URL}

Visit Web Platform:
${WEB_URL}

Wishing you a productive, blessed, and profitable week!
The FixMart Solutions Team
admin.fixmart@gmail.com
  `.trim();

  return { subject, html, text };
}

async function main() {
  console.log('========================================================');
  console.log(' FixMart Solutions — Multi-Contact Monday Broadcast Runner');
  console.log(' (Monday Reminders, Product Adverts & Community Invites)');
  console.log(` Timestamp: ${new Date().toISOString()}`);
  console.log('========================================================\n');

  // 1. Fetch SMTP settings directly once
  console.log('🔑 Loading SMTP configuration from AppSettings / environment...');
  const keys = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from'];
  let appSettings: Record<string, string> = {};
  try {
    const dbSettings = await prisma.appSetting.findMany({
      where: { key: { in: keys } },
    });
    appSettings = dbSettings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);
  } catch (err) {
    console.warn('Could not read AppSetting, falling back to process.env');
  }

  const host = appSettings['smtp_host'] || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(appSettings['smtp_port'] || process.env.SMTP_PORT || '465', 10);
  const secure = appSettings['smtp_secure'] !== undefined ? appSettings['smtp_secure'] === 'true' : true;
  const user = appSettings['smtp_user'] || process.env.SMTP_USER || 'brightajuzie@gmail.com';
  let pass = appSettings['smtp_pass'] || process.env.SMTP_PASS || '';
  if (pass && pass.includes(' ') && (host === 'smtp.gmail.com' || pass.replace(/\s+/g, '').length === 16)) {
    pass = pass.replace(/\s+/g, '');
  }
  const from = appSettings['smtp_from'] || process.env.SMTP_FROM || `Fixmart <${user}>`;

  console.log(`SMTP Host: ${host}:${port} (SSL: ${secure})`);
  console.log(`Sender: ${from}`);

  if (!pass) {
    console.error('❌ Fatal: SMTP password is not configured.');
    process.exit(1);
  }

  // 2. Fetch DB users
  console.log('🔍 Fetching registered users from database...');
  const dbUsers = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });
  console.log(`Found ${dbUsers.length} total user records in DB.`);

  // Disconnect prisma immediately so no DB connections linger during dispatch
  await prisma.$disconnect();

  // 3. Map and deduplicate recipients
  const recipientsMap = new Map<string, Recipient>();

  // Add DB users first
  for (const u of dbUsers) {
    if (!u.email) continue;
    const cleanEmail = u.email.trim().toLowerCase();
    if (isValidEmail(cleanEmail)) {
      recipientsMap.set(cleanEmail, {
        email: cleanEmail,
        name: u.name || 'FixMart User',
        role: u.role || 'CUSTOMER',
        isRegisteredUser: true,
      });
    }
  }

  // Add target contact emails
  for (const rawEmail of STATIC_TARGET_EMAILS) {
    const cleanEmail = rawEmail.trim().toLowerCase();
    if (isValidEmail(cleanEmail)) {
      if (!recipientsMap.has(cleanEmail)) {
        // Derive friendly display name from email
        const userPart = cleanEmail.split('@')[0];
        const formattedName = userPart
          .replace(/[._\d]+/g, ' ')
          .trim()
          .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Valued Partner';

        recipientsMap.set(cleanEmail, {
          email: cleanEmail,
          name: formattedName,
          role: 'CUSTOMER',
          isRegisteredUser: false,
        });
      }
    }
  }

  const allRecipients = Array.from(recipientsMap.values());
  console.log(`\n✅ Total unique valid recipients resolved: ${allRecipients.length}`);
  console.log('Recipient List:');
  allRecipients.forEach((r, idx) => {
    console.log(` ${idx + 1}. ${r.name} <${r.email}> [Role: ${r.role}, Registered: ${r.isRegisteredUser ? 'YES' : 'NO'}]`);
  });

  // 4. Create and verify pooled nodemailer transporter
  console.log('\n🔧 Initializing and verifying SMTP connection pool...');
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    rateLimit: 5,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  await transporter.verify();
  console.log('✅ SMTP connection pool verified and ready!');

  // Prepare logo attachment
  const logoPath = getLogoDiskPath();
  const attachments = logoPath
    ? [
        {
          filename: 'fixmart-logo.png',
          path: logoPath,
          cid: 'fixmartlogo',
        },
      ]
    : [];

  console.log('\n========================================================');
  console.log(' 🚀 Beginning Email Dispatch...');
  console.log('========================================================\n');

  const results: { email: string; name: string; success: boolean; error?: string }[] = [];

  for (let i = 0; i < allRecipients.length; i++) {
    const recipient = allRecipients[i];
    const { subject, html, text } = buildMondayAdvertEmailHtml(recipient);

    process.stdout.write(`[${i + 1}/${allRecipients.length}] Sending to ${recipient.name} <${recipient.email}>... `);

    let sent = false;
    let lastError = '';

    // Up to 2 attempts per email
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const info = await transporter.sendMail({
          from,
          to: recipient.email,
          subject,
          text,
          html,
          attachments,
        });
        console.log(`✅ SENT (ID: ${info.messageId || 'OK'})`);
        results.push({ email: recipient.email, name: recipient.name, success: true });
        sent = true;
        break;
      } catch (err: any) {
        lastError = err?.message || String(err);
        if (attempt === 1) {
          process.stdout.write(`(retry)... `);
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    if (!sent) {
      console.log(`❌ FAILED: ${lastError}`);
      results.push({ email: recipient.email, name: recipient.name, success: false, error: lastError });
    }

    // Polite delay between sends (600ms) to respect Gmail rate limits
    if (i < allRecipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  transporter.close();

  console.log('\n========================================================');
  console.log(' 🏁 Dispatch Execution Summary:');
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(` ✅ Successfully dispatched: ${succeeded}`);
  console.log(` ❌ Failed dispatches:       ${failed}`);
  console.log('========================================================');

  if (failed > 0) {
    console.log('\nFailed Contacts:');
    results
      .filter((r) => !r.success)
      .forEach((r) => console.log(` - ${r.name} <${r.email}>: ${r.error}`));
  }

  process.exit(failed > 0 && succeeded === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
