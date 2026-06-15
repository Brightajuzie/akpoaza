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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
