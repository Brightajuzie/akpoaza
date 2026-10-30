import dotenv from 'dotenv';
dotenv.config();

import { broadcastMondayEngagementMessages } from '../src/lib/broadcast';
import prisma from '../src/lib/prisma';

async function main() {
  console.log('========================================================');
  console.log(' FixMart — Monday Morning Multi-Channel Broadcast Runner');
  console.log(` Timestamp: ${new Date().toISOString()}`);
  console.log('========================================================');

  try {
    const summary = await broadcastMondayEngagementMessages();

    console.log('\n--- Broadcast Execution Summary ---');
    console.log(`Total recipients processed: ${summary.totalUsers}`);
    console.log('Breakdown by Role:', summary.byRole);
    console.log('Dispatches triggered:');
    console.log(` - In-App Notifications: ${summary.dispatched.inApp}`);
    console.log(` - Emails (SMTP):         ${summary.dispatched.email}`);
    console.log(` - SMS (Twilio):          ${summary.dispatched.sms}`);
    console.log(` - WhatsApp:              ${summary.dispatched.whatsApp}`);

    if (summary.errors.length > 0) {
      console.warn(`\nCompleted with ${summary.errors.length} notice(s):`);
      summary.errors.slice(0, 5).forEach((e) => console.warn(` - ${e}`));
    } else {
      console.log('\n✅ All messages dispatched without errors.');
    }
  } catch (err: any) {
    console.error('\n❌ Fatal broadcast error:', err?.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('========================================================');
    process.exit(0);
  }
}

main();
