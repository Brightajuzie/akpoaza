import prisma from './prisma';
import { sendNotification } from './notify';

export interface BroadcastResult {
  totalUsers: number;
  byRole: Record<string, number>;
  dispatched: {
    inApp: number;
    email: number;
    sms: number;
    whatsApp: number;
  };
  errors: string[];
}

/**
 * Builds custom motivational Monday broadcast messages tailored for each user role:
 * - Vendors: Encouraged to post products & services and recommend fellow vendors, riders, artisans.
 * - Customers: Encouraged to buy, book artisans, invite friends, and recommend artisans/riders/vendors.
 * - Handymen (Artisans): Encouraged to accept bookings, update portfolio, and recommend peers.
 * - Riders: Encouraged to go online for parcel deliveries and invite fellow riders.
 */
export function getMondayEngagementMessage(user: { name: string; role: string }) {
  const firstName = user.name ? user.name.split(' ')[0] : 'there';
  const role = (user.role || '').toUpperCase();

  const playStoreLink = 'https://play.google.com/store/apps/details?id=com.akpoaza.kachlinks&pcampaignid=web_share&pli=1';

  if (role === 'VENDOR') {
    return {
      title: '🚀 Boost Your Sales & Invite Customers This Week on FixMart!',
      body: `Happy Monday, ${firstName}! Start your week strong by posting fresh products and services on FixMart. Invite your customers & clients to buy directly from your FixMart store, and recommend FixMart to fellow vendors and skilled artisans!`,
      emailSubject: '🚀 Happy Monday! Boost Your Sales — Post Products, Invite Clients & Expand on FixMart',
      emailHtml: `
        <div style="text-align:center;padding:12px 0 20px;">
          <span style="background:#EEF2FF;color:#4F46E5;font-weight:700;font-size:12px;padding:6px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Vendor Growth Spotlight</span>
          <h2 style="font-size:24px;font-weight:900;color:#0F172A;margin:14px 0 8px;">Let's Make This Your Biggest Sales Week Yet, ${firstName}! 📈</h2>
          <p style="font-size:15px;color:#64748B;line-height:1.6;margin:0 auto;max-width:480px;">Thousands of buyers are browsing FixMart daily. Make sure your inventory and service catalog are updated to win more orders.</p>
        </div>

        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 12px;font-size:16px;color:#1E293B;">💡 Quick Actions for High Sales:</h3>
          <ul style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">
            <li><strong>Post New Products & Services:</strong> Clear photos and competitive prices convert 3x faster.</li>
            <li><strong>Invite Your Customers & Clients:</strong> Share your store link so customers can buy with safe escrow protection.</li>
            <li><strong>Fast Bank Payouts:</strong> Withdraw your wallet funds instantly to all Nigerian banks anytime.</li>
          </ul>
        </div>

        <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:14px;border-radius:8px;margin:20px 0;">
          <h4 style="margin:0 0 4px;font-size:14px;color:#92400E;font-weight:700;">🤝 Bring More Customers, Vendors & Artisans On Board</h4>
          <p style="margin:0;font-size:13px;color:#78350F;line-height:1.5;">
            Know other trusted merchants, dispatch riders, or skilled artisans? Recommend FixMart to them today and invite your customers to download the app on Google Play!
          </p>
        </div>

        <div style="text-align:center;margin:28px 0 10px;">
          <a href="${playStoreLink}" style="background:#007AFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;display:inline-block;box-shadow:0 4px 12px rgba(0,122,255,0.25);">
            Download on Google Play & Post Now →
          </a>
        </div>
      `,
      smsText: `[FixMart] Happy Monday, ${firstName}! Post your products & services today. Invite more customers & clients to buy from your store, and recommend FixMart to fellow vendors & artisans! Download: ${playStoreLink}`,
      whatsAppText: `*🚀 Happy Monday, ${firstName}!* \n\nBoost your sales this week on *FixMart*!\n\n✨ *Post New Products & Services:* Upload your catalog to reach ready shoppers.\n👥 *Invite Customers & Clients:* Share your store link to receive direct orders.\n🤝 *Recommend Peers:* Invite fellow vendors, dispatch riders, and skilled artisans to join.\n📲 *Download on Google Play:* ${playStoreLink}\n\n👉 *Open FixMart:* https://fixmart.ng\n_Wishing you a prosperous and profitable week ahead!_`,
    };
  }

  if (role === 'CUSTOMER') {
    return {
      title: '🛍️ New Week, Fresh Deals on FixMart!',
      body: `Good morning, ${firstName}! Start your week with verified shopping and on-demand artisan services on FixMart. Shop quality products, invite friends, family & clients to buy, and recommend trusted artisans (plumbers, electricians, carpenters, mechanics) and vendors to join FixMart today!`,
      emailSubject: '🛍️ Fresh Monday Deals on FixMart — Shop, Invite Clients & Recommend Artisans!',
      emailHtml: `
        <div style="text-align:center;padding:12px 0 20px;">
          <span style="background:#ECFDF5;color:#059669;font-weight:700;font-size:12px;padding:6px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Monday Fresh Start</span>
          <h2 style="font-size:24px;font-weight:900;color:#0F172A;margin:14px 0 8px;">Explore What's In Store This Week, ${firstName}! 🌟</h2>
          <p style="font-size:15px;color:#64748B;line-height:1.6;margin:0 auto;max-width:480px;">From daily essentials to emergency handyman repairs, FixMart has you covered with 100% escrow payment protection.</p>
        </div>

        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 12px;font-size:16px;color:#1E293B;">🛒 Why Shop & Book on FixMart:</h3>
          <ul style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">
            <li><strong>Verified Products:</strong> Genuine items from trusted vendors delivered right to your doorstep.</li>
            <li><strong>Skilled Artisans on Demand:</strong> Book vetted electricians, plumbers, carpenters, and technicians with transparent pricing.</li>
            <li><strong>Safe Escrow Payments:</strong> Your money stays protected until you confirm delivery or job completion.</li>
          </ul>
        </div>

        <div style="background:#F0FDF4;border-left:4px solid #10B981;padding:14px;border-radius:8px;margin:20px 0;">
          <h4 style="margin:0 0 4px;font-size:14px;color:#065F46;font-weight:700;">🎁 Invite Friends & Recommend Artisans & Vendors</h4>
          <p style="margin:0;font-size:13px;color:#047857;line-height:1.5;">
            Share the love! Invite your friends, clients, and colleagues to shop on FixMart, and recommend your favorite neighborhood artisans (plumbers, electricians, mechanics) and local vendors to register on FixMart!
          </p>
        </div>

        <div style="text-align:center;margin:28px 0 10px;">
          <a href="${playStoreLink}" style="background:#10B981;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;display:inline-block;box-shadow:0 4px 12px rgba(16,185,129,0.25);">
            Download on Google Play & Shop Now →
          </a>
        </div>
      `,
      smsText: `[FixMart] Good morning, ${firstName}! Shop verified products & book trusted artisans on FixMart today. Invite friends & clients to buy, and recommend local artisans, riders & stores to join: ${playStoreLink}`,
      whatsAppText: `*🛍️ Good Morning, ${firstName}!* \n\nStart your week with seamless shopping and reliable services on *FixMart*!\n\n🛒 *Shop Quality Products:* Verified goods with 100% escrow buyer protection.\n🔧 *Book Top Artisans:* Electricians, plumbers, carpenters, painters, and mechanics on demand.\n👥 *Invite & Recommend:* Invite your friends & clients to buy, and recommend the best artisans, riders, and vendors you know to FixMart!\n📲 *Download on Google Play:* ${playStoreLink}\n\n👉 *Shop Now:* https://fixmart.ng\n_Wishing you a productive and blessed week!_`,
    };
  }

  if (role === 'HANDYMAN') {
    return {
      title: '🔧 Great Jobs Await You on FixMart!',
      body: `Happy Monday, ${firstName}! Clients are actively searching for verified artisans this week. Keep your service profile updated, accept bookings promptly, invite your clients to book you via FixMart, and recommend FixMart to fellow artisans and vendors!`,
      emailSubject: '🔧 Monday Motivation — Top Jobs Awaiting You on FixMart!',
      emailHtml: `
        <div style="text-align:center;padding:12px 0 20px;">
          <span style="background:#FEF3C7;color:#B45309;font-weight:700;font-size:12px;padding:6px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Artisan & Handyman Spotlight</span>
          <h2 style="font-size:24px;font-weight:900;color:#0F172A;margin:14px 0 8px;">Ready for a Busy, Profitable Week, ${firstName}? 🛠️</h2>
          <p style="font-size:15px;color:#64748B;line-height:1.6;margin:0 auto;max-width:480px;">Homeowners and businesses are booking verified artisans on FixMart today. Keep your phone notifications on so you never miss a client request.</p>
        </div>

        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 12px;font-size:16px;color:#1E293B;">⭐ Pro Tips for More Bookings:</h3>
          <ul style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">
            <li><strong>Quick Response:</strong> Accept client booking requests within 10 minutes to secure the job.</li>
            <li><strong>Invite Your Existing Clients:</strong> Get clients to book you through FixMart for guaranteed payments via escrow.</li>
            <li><strong>Instant Payouts:</strong> Withdraw your earnings directly to any Nigerian bank immediately upon job completion.</li>
          </ul>
        </div>

        <div style="background:#EFF6FF;border-left:4px solid #3B82F6;padding:14px;border-radius:8px;margin:20px 0;">
          <h4 style="margin:0 0 4px;font-size:14px;color:#1E40AF;font-weight:700;">🤝 Bring Your Clients & Fellow Artisans on Board</h4>
          <p style="margin:0;font-size:13px;color:#1D4ED8;line-height:1.5;">
            Know skilled plumbers, electricians, AC technicians, or carpenters? Recommend FixMart to them and invite clients to download the FixMart app!
          </p>
        </div>

        <div style="text-align:center;margin:28px 0 10px;">
          <a href="${playStoreLink}" style="background:#F59E0B;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;display:inline-block;box-shadow:0 4px 12px rgba(245,158,11,0.25);">
            Download on Google Play & Check Requests →
          </a>
        </div>
      `,
      smsText: `[FixMart] Happy Monday, ${firstName}! Great jobs are waiting for verified artisans. Update your profile, invite your clients to book on FixMart & recommend fellow artisans & vendors: ${playStoreLink}`,
      whatsAppText: `*🔧 Happy Monday, ${firstName}!* \n\nGreat job requests are active on *FixMart* this week!\n\n🛠️ *Stay Ready:* Keep your profile active and respond promptly to client bookings.\n👥 *Invite Clients:* Get your clients to book you via FixMart for 100% guaranteed payment.\n🤝 *Recommend Peers:* Invite skilled plumbers, electricians, carpenters, and technicians to register on FixMart.\n📲 *Download on Google Play:* ${playStoreLink}\n\n👉 *Open FixMart:* https://fixmart.ng\n_Have a successful and high-earning week!_`,
    };
  }

  if (role === 'RIDER') {
    return {
      title: '🛵 High Delivery Demand This Week!',
      body: `Happy Monday, ${firstName}! Parcel delivery requests are booming across town. Stay online to pick up deliveries, earn competitive delivery fares with instant bank payouts, and recommend other reliable riders and vendors to FixMart!`,
      emailSubject: '🛵 Monday Kickoff — High Delivery Demand on FixMart!',
      emailHtml: `
        <div style="text-align:center;padding:12px 0 20px;">
          <span style="background:#F3E8FF;color:#7E22CE;font-weight:700;font-size:12px;padding:6px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Rider Logistics Alert</span>
          <h2 style="font-size:24px;font-weight:900;color:#0F172A;margin:14px 0 8px;">Turn On Your Availability, ${firstName}! 📦</h2>
          <p style="font-size:15px;color:#64748B;line-height:1.6;margin:0 auto;max-width:480px;">E-commerce packages and express parcel requests are rolling in. Deliver with FixMart to earn instant, transparent payouts.</p>
        </div>

        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin:20px 0;">
          <h3 style="margin:0 0 12px;font-size:16px;color:#1E293B;">🛵 Maximize Your Rider Earnings:</h3>
          <ul style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">
            <li><strong>Stay Online:</strong> Switch your rider status to online during peak morning and evening hours.</li>
            <li><strong>Instant Payout:</strong> Every delivery fee is paid directly to your wallet for instant bank withdrawal.</li>
            <li><strong>Recommend Riders:</strong> Invite reliable dispatch riders and courier friends to join the FixMart fleet!</li>
          </ul>
        </div>

        <div style="text-align:center;margin:28px 0 10px;">
          <a href="https://fixmart.ng/rider" style="background:#8B5CF6;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;display:inline-block;box-shadow:0 4px 12px rgba(139,92,246,0.25);">
            Go Online Now →
          </a>
        </div>
      `,
      smsText: `[FixMart] Happy Monday, ${firstName}! Parcel delivery demand is high today. Go online to earn fast delivery fees with instant payouts, and recommend other reliable riders to FixMart: https://fixmart.ng`,
      whatsAppText: `*🛵 Ready to Ride, ${firstName}?* \n\nHigh demand for parcel deliveries on *FixMart* today!\n\n📦 *Stay Online:* Pick up dispatch orders in your area and earn top delivery fees.\n⚡ *Instant Cashout:* Withdraw directly to your bank account anytime.\n🤝 *Refer Riders:* Recommend other courier and dispatch riders to join FixMart.\n\n👉 *Open Rider App:* https://fixmart.ng/rider\n_Ride safe and have a lucrative week!_`,
    };
  }

  // Fallback for AGENT, ADMIN, and General users
  return {
    title: '🌟 Happy Monday from FixMart!',
    body: `Good morning, ${firstName}! Let's make this week a success. Shop quality goods, book skilled artisans, and help us grow by recommending FixMart to vendors, riders, and artisans in your network!`,
    emailSubject: '🌟 Happy Monday from FixMart — Let\'s Build & Grow Together!',
    emailHtml: `
      <div style="text-align:center;padding:12px 0 20px;">
        <h2 style="font-size:24px;font-weight:900;color:#0F172A;margin:14px 0 8px;">Let's Build & Grow Together This Week, ${firstName}! 🌟</h2>
        <p style="font-size:15px;color:#64748B;line-height:1.6;margin:0 auto;max-width:480px;">FixMart connects buyers, vendors, artisans, and riders across Nigeria into one trusted marketplace.</p>
      </div>
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin:20px 0;">
        <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">
          Recommend FixMart to vendors with products to sell, skilled handymen looking for clients, and dispatch riders ready to earn. Every referral strengthens our community!
        </p>
      </div>
      <div style="text-align:center;margin:28px 0 10px;">
        <a href="https://fixmart.ng" style="background:#007AFF;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;display:inline-block;">
          Visit FixMart →
        </a>
      </div>
    `,
    smsText: `[FixMart] Happy Monday, ${firstName}! Shop, book services & grow with us. Recommend FixMart to vendors, riders & artisans you know: https://fixmart.ng`,
    whatsAppText: `*🌟 Happy Monday, ${firstName}!* \n\nLet's make this week remarkable! Explore verified shopping, book top artisans, and recommend FixMart to vendors, riders & handymen in your network.\n\n👉 https://fixmart.ng`,
  };
}

/**
 * Dispatches customized Monday engagement messages to all registered users
 * across In-App, Email, SMS, and WhatsApp channels.
 */
export async function broadcastMondayEngagementMessages(): Promise<BroadcastResult> {
  console.log('[Broadcast] Starting Monday morning engagement dispatch across all channels...');

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      pushToken: true,
    },
  });

  const result: BroadcastResult = {
    totalUsers: users.length,
    byRole: {},
    dispatched: {
      inApp: 0,
      email: 0,
      sms: 0,
      whatsApp: 0,
    },
    errors: [],
  };

  const batchSize = 5;
  for (let i = 0; i < users.length; i += batchSize) {
    const chunk = users.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (user) => {
        const role = (user.role || 'CUSTOMER').toUpperCase();
        result.byRole[role] = (result.byRole[role] || 0) + 1;

        try {
          const msg = getMondayEngagementMessage({ name: user.name, role });

          await sendNotification({
            userId: user.id,
            title: msg.title,
            body: msg.body,
            type: 'ADMIN_MESSAGE',
            email: user.email,
            phone: user.phone || undefined,
            pushToken: user.pushToken || undefined,
            emailSubject: msg.emailSubject,
            emailHtml: msg.emailHtml,
            smsText: msg.smsText,
            whatsAppText: msg.whatsAppText,
            sendWhatsApp: true,
            awaitDelivery: true,
          });

          result.dispatched.inApp++;
          if (user.email) result.dispatched.email++;
          if (user.phone) {
            result.dispatched.sms++;
            result.dispatched.whatsApp++;
          }
        } catch (err: any) {
          console.error(`[Broadcast] Error dispatching to user ${user.id}:`, err?.message || err);
          result.errors.push(`User ${user.id} (${user.email}): ${err?.message || err}`);
        }
      })
    );

    if (i + batchSize < users.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  console.log('[Broadcast] Monday engagement broadcast completed successfully:', result);
  return result;
}
