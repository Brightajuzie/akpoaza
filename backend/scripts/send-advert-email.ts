import dotenv from 'dotenv';
dotenv.config();

import { sendEmailDirect, buildEmailHtml } from '../src/lib/notify';
import prisma from '../src/lib/prisma';

// The 17 target email addresses specified by the user
const TARGET_EMAILS: string[] = [
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

function getAdvertEmailHtml(): string {
  const customContent = `
    <!-- Hero Introduction -->
    <div style="text-align:center;padding:10px 0 24px;">
      <span style="background:#EEF2FF;color:#4F46E5;font-weight:700;font-size:12px;padding:6px 16px;border-radius:24px;text-transform:uppercase;letter-spacing:1px;display:inline-block;">
        🚀 All-In-One Marketplace & Service App
      </span>
      <h1 style="font-size:24px;font-weight:900;color:#0F172A;margin:16px 0 10px;line-height:1.35;">
        Transform How You Buy, Sell, and Earn with FixMart Solutions!
      </h1>
      <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 auto;max-width:520px;">
        Whether you are a customer looking for great deals, an artisan ready for profitable bookings, or a merchant wanting more sales — FixMart is built to power your growth.
      </p>
    </div>

    <!-- Prominent Play Store Download Card -->
    <div style="background:linear-gradient(135deg, #0A2540 0%, #007AFF 100%);border-radius:16px;padding:26px 22px;color:#ffffff;text-align:center;margin:10px 0 26px;box-shadow:0 8px 20px rgba(0,122,255,0.22);">
      <h3 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#ffffff;">
        📲 FixMart Solutions is Now on Google Play!
      </h3>
      <p style="margin:0 0 20px;font-size:14px;color:#E0F2FE;line-height:1.5;max-width:460px;margin-left:auto;margin-right:auto;">
        Download the official app today for instant bookings, live order tracking, zero listing fees, and instant bank withdrawals.
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

    <!-- Value Propositions Matrix -->
    <div style="margin:20px 0;">
      <h3 style="font-size:17px;font-weight:800;color:#0F172A;margin:0 0 16px;text-align:left;">
        🌟 How You Win with FixMart:
      </h3>

      <!-- 1. For Customers -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #10B981;border-radius:10px;padding:16px 18px;margin-bottom:14px;">
        <h4 style="margin:0 0 6px;font-size:15px;color:#065F46;font-weight:800;">
          🛍️ 1. Shop & Hire with 100% Escrow Protection
        </h4>
        <p style="margin:0;font-size:13.5px;color:#334155;line-height:1.6;">
          Browse verified gadgets, household items, fashion, and groceries. Need a repair? Book vetted electricians, plumbers, carpenters, AC technicians, and mechanics on-demand. Your payment is held in escrow until you are 100% satisfied!
        </p>
      </div>

      <!-- 2. For Vendors -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #007AFF;border-radius:10px;padding:16px 18px;margin-bottom:14px;">
        <h4 style="margin:0 0 6px;font-size:15px;color:#1E40AF;font-weight:800;">
          🏪 2. Register as a Vendor — Start Making Daily Profits
        </h4>
        <p style="margin:0;font-size:13.5px;color:#334155;line-height:1.6;">
          Set up your digital store in minutes with <strong>zero upfront listing fees</strong>. Reach thousands of eager buyers in your city and withdraw your earnings straight to any Nigerian bank within seconds.
        </p>
      </div>

      <!-- 3. For Artisans & Handymen -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #F59E0B;border-radius:10px;padding:16px 18px;margin-bottom:14px;">
        <h4 style="margin:0 0 6px;font-size:15px;color:#92400E;font-weight:800;">
          🛠️ 3. Register as an Artisan — Turn Your Skills Into Steady Income
        </h4>
        <p style="margin:0;font-size:13.5px;color:#334155;line-height:1.6;">
          Are you a plumber, electrician, mechanic, carpenter, painter, or tech specialist? Join FixMart’s certified artisan network. Receive client booking alerts directly on your phone and get paid reliably on every job.
        </p>
      </div>

      <!-- 4. For Dispatch Riders -->
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-left:4px solid #8B5CF6;border-radius:10px;padding:16px 18px;margin-bottom:14px;">
        <h4 style="margin:0 0 6px;font-size:15px;color:#6D28D9;font-weight:800;">
          🛵 4. Earn with Swift Deliveries
        </h4>
        <p style="margin:0;font-size:13.5px;color:#334155;line-height:1.6;">
          Have a bike or vehicle? Register as a FixMart Rider to pick up parcels, e-commerce packages, and food orders with high delivery payouts and flexible hours.
        </p>
      </div>
    </div>

    <!-- Referral & Community Call -->
    <div style="background:#FEF3C7;border-radius:12px;padding:18px 20px;margin:24px 0;border:1px dashed #D97706;">
      <h4 style="margin:0 0 6px;font-size:14px;color:#92400E;font-weight:800;">
        🤝 Recommend FixMart & Invite Your Community!
      </h4>
      <p style="margin:0;font-size:13px;color:#78350F;line-height:1.55;">
        Invite your friends, family, and colleagues to experience seamless shopping and reliable artisan services. If you know skilled tradesmen, merchants, or dispatch riders, introduce them to FixMart today!
      </p>
    </div>

    <!-- Final Call to Action -->
    <div style="text-align:center;padding:18px 0 10px;">
      <a href="${PLAYSTORE_URL}" target="_blank" style="background:#007AFF;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;padding:14px 34px;border-radius:10px;display:inline-block;box-shadow:0 6px 16px rgba(0,122,255,0.30);">
        Get Started on Google Play Now →
      </a>
      <p style="margin:12px 0 0;font-size:13px;color:#64748B;">
        Prefer direct download? <a href="${APK_DOWNLOAD_URL}" style="color:#007AFF;font-weight:600;text-decoration:none;">Download APK Directly</a> or access via <a href="${WEB_URL}" style="color:#007AFF;font-weight:600;text-decoration:none;">fixmart.ng</a>
      </p>
    </div>
  `;

  return buildEmailHtml(
    '🚀 Unlock Big Opportunities: Buy, Sell & Earn with FixMart Solutions!',
    'Join FixMart Solutions on Google Play Store. Shop verified products, book trusted artisans, or register as an artisan/vendor to make daily profits.',
    customContent
  );
}

async function main() {
  console.log('========================================================');
  console.log(' FixMart Solutions — Advert & Invitation Email Dispatcher');
  console.log(` Target List Size: ${TARGET_EMAILS.length} recipients`);
  console.log(` Timestamp: ${new Date().toISOString()}`);
  console.log('========================================================\n');

  const subject =
    '🚀 Unlock Big Opportunities: Buy, Sell & Earn with FixMart Solutions (Now on Google Play!)';
  const htmlBody = getAdvertEmailHtml();
  const textBody = `
FixMart Solutions — Buy, Sell, and Earn on Nigeria's Premier Smart Marketplace!

Hi there!

We are excited to invite you to FixMart Solutions, now officially available on Google Play Store:
${PLAYSTORE_URL}

Here is what you can do on FixMart today:
1. BUY & HIRE WITH CONFIDENCE: Shop verified products with 100% Escrow Buyer Protection. Book verified artisans (electricians, plumbers, carpenters, mechanics) on demand.
2. SELL AS A VENDOR: List your products and services with ZERO upfront fees, reach thousands of buyers daily, and withdraw earnings instantly to any Nigerian bank.
3. REGISTER AS AN ARTISAN / HANDYMAN: Showcase your craftsmanship, receive client requests directly on your phone, and earn guaranteed payouts.
4. EARN AS A RIDER: Pick up parcel delivery orders in your area with fast payouts.

Download the app on Google Play:
${PLAYSTORE_URL}

Or visit our web platform:
${WEB_URL}

Best regards,
The FixMart Solutions Team
admin.fixmart@gmail.com
  `.trim();

  const results: { email: string; success: boolean; error?: string }[] = [];

  for (let i = 0; i < TARGET_EMAILS.length; i++) {
    const email = TARGET_EMAILS[i].trim().toLowerCase();
    process.stdout.write(`[${i + 1}/${TARGET_EMAILS.length}] Sending advert to ${email}... `);

    try {
      const res = await sendEmailDirect({
        to: email,
        subject,
        text: textBody,
        html: htmlBody,
      });

      if (res.success) {
        console.log(`✅ SENT (ID: ${res.messageId || 'OK'})`);
        results.push({ email, success: true });
      } else {
        console.log(`❌ FAILED: ${res.error}`);
        results.push({ email, success: false, error: res.error });
      }
    } catch (err: any) {
      console.log(`❌ ERROR: ${err?.message || err}`);
      results.push({ email, success: false, error: err?.message || String(err) });
    }

    // Polite delay between sends (400ms) to respect Gmail rate limits
    if (i < TARGET_EMAILS.length - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  console.log('\n========================================================');
  console.log(' Dispatch Complete Summary:');
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(` ✅ Successfully dispatched: ${succeeded}`);
  console.log(` ❌ Failed dispatches:       ${failed}`);
  console.log('========================================================');

  if (failed > 0) {
    console.log('\nFailed Recipients:');
    results
      .filter((r) => !r.success)
      .forEach((r) => console.log(` - ${r.email}: ${r.error}`));
  }

  await prisma.$disconnect();
  process.exit(failed > 0 && succeeded === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
