import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const adminEmails = ['admin1@test.com', 'admin@test.com'];
  const password = 'password123';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  for (const email of adminEmails) {
    const existingAdmin = await prisma.user.findUnique({ where: { email } });

    if (existingAdmin) {
      await prisma.user.update({
        where: { email },
        data: { role: 'ADMIN', verificationStatus: 'VERIFIED' },
      });
      console.log(`Updated existing user ${email} to ADMIN role.`);
    } else {
      await prisma.user.create({
        data: {
          email,
          name: email === 'admin1@test.com' ? 'Super Admin' : 'System Admin',
          passwordHash,
          role: 'ADMIN',
          verificationStatus: 'VERIFIED',
          provider: 'LOCAL'
        },
      });
      console.log(`Created new admin user: ${email}`);
    }
  }

  // Seed default promo slides if none exist
  const slideCount = await prisma.promoSlide.count();
  if (slideCount === 0) {
    const defaultSlides = [
      {
        imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
        caption: '🔥 Mega Tool Sale: Up to 40% off on power tools, drills & more!',
        order: 1,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1200&q=80',
        caption: '⚡ Book a Handyman: Verified professionals at your doorstep.',
        order: 2,
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80',
        caption: '🎁 Refer & Earn: Invite friends & earn wallet credits!',
        order: 3,
      },
    ];

    for (const slide of defaultSlides) {
      await prisma.promoSlide.create({ data: slide });
    }
    console.log('Seeded default promo slides.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
