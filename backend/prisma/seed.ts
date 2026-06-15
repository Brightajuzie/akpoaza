import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // 1. Create Users
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password123', salt);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      email: 'admin@test.com',
      name: 'Admin User',
      passwordHash,
      role: 'ADMIN',
    },
  });

  const handyman = await prisma.user.upsert({
    where: { email: 'handyman@test.com' },
    update: {},
    create: {
      email: 'handyman@test.com',
      name: 'Bob The Builder',
      passwordHash,
      role: 'HANDYMAN',
      specialty: 'Plumbing',
      latitude: 40.7200,
      longitude: -74.0100,
      currentLat: 40.7200,
      currentLng: -74.0100,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@test.com' },
    update: {},
    create: {
      email: 'customer@test.com',
      name: 'Alice Customer',
      passwordHash,
      role: 'CUSTOMER',
      address: '123 Main St, New York, NY',
      latitude: 40.7128,
      longitude: -74.0060,
    },
  });

  // Additional Handyman (Charlie Sparky - Electrician)
  const handyman2 = await prisma.user.upsert({
    where: { email: 'charlie@test.com' },
    update: {},
    create: {
      email: 'charlie@test.com',
      name: 'Charlie Sparky',
      passwordHash,
      role: 'HANDYMAN',
      specialty: 'Electrical',
      latitude: 40.7300,
      longitude: -73.9900,
      currentLat: 40.7300,
      currentLng: -73.9900,
    },
  });

  // Additional Handyman (Dave Fixer - Plumber, further away than Bob)
  const handyman3 = await prisma.user.upsert({
    where: { email: 'dave@test.com' },
    update: {},
    create: {
      email: 'dave@test.com',
      name: 'Dave Fixer',
      passwordHash,
      role: 'HANDYMAN',
      specialty: 'Plumbing',
      latitude: 40.7800,
      longitude: -73.9600,
      currentLat: 40.7800,
      currentLng: -73.9600,
    },
  });

  // Vendor (Victor Shop)
  const vendor = await prisma.user.upsert({
    where: { email: 'vendor@test.com' },
    update: {},
    create: {
      email: 'vendor@test.com',
      name: 'Victor Shop',
      passwordHash,
      role: 'VENDOR',
      address: '456 Market St, New York, NY',
      latitude: 40.7150,
      longitude: -74.0030,
    },
  });

  console.log('Users created:', { 
    admin: admin.id, 
    handymanBob: handyman.id, 
    handymanCharlie: handyman2.id,
    handymanDave: handyman3.id,
    customer: customer.id,
    vendor: vendor.id 
  });

  // 2. Create Products
  const productsData = [
    { name: 'Professional Power Drill', description: 'High-torque 20V cordless drill with 2 batteries.', price: 120.00, stock: 50, category: 'Tools' },
    { name: 'Premium Tool Set (100pc)', description: 'Complete set of wrenches, sockets, and screwdrivers.', price: 85.50, stock: 30, category: 'Tools' },
    { name: 'Heavy Duty Work Gloves', description: 'Leather reinforced gloves for tough jobs.', price: 15.99, stock: 100, category: 'Apparel' },
    { name: 'LED Work Light', description: 'Rechargeable 2000 lumen work light.', price: 45.00, stock: 40, category: 'Electronics' },
    { name: 'Caulking Gun', description: 'Durable steel caulking gun for smooth application.', price: 12.50, stock: 80, category: 'Supplies' },
  ];

  for (const p of productsData) {
    await prisma.product.create({ data: p });
  }
  console.log('Products created.');

  // 3. Create Services
  const servicesData = [
    { name: 'Plumbing Repair', description: 'Fixing leaks, unclogging drains, and repairing pipes.', basePrice: 80.00, category: 'Plumbing' },
    { name: 'Electrical Inspection', description: 'Checking wiring, outlets, and panel safety.', basePrice: 100.00, category: 'Electrical' },
    { name: 'Furniture Assembly', description: 'Assembling flat-pack furniture quickly and safely.', basePrice: 50.00, category: 'General' },
  ];

  for (const s of servicesData) {
    await prisma.service.create({ data: s });
  }
  console.log('Services created.');

  // 4. Create Mock Bookings
  const plumbingService = await prisma.service.findFirst({ where: { name: 'Plumbing Repair' } });
  if (plumbingService) {
    await prisma.booking.create({
      data: {
        customerId: customer.id,
        handymanId: handyman.id,
        serviceId: plumbingService.id,
        status: 'ACCEPTED',
        scheduledAt: new Date(new Date().getTime() + 24 * 60 * 60 * 1000), // Tomorrow
        address: customer.address || '123 Main St',
        totalPrice: plumbingService.basePrice,
      }
    });
    console.log('Mock booking created.');
  }

  // 5. Seed App Settings
  console.log('Seeding AppSettings...');
  const settingsData = [
    { key: 'payment_gateway_active', value: 'STRIPE' },
    { key: 'logo_url', value: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=200&auto=format&fit=crop' },
    { key: 'hero_title', value: 'Find the Best Services & E-Commerce on FixMart' },
    { key: 'hero_subtitle', value: 'Professional services and premium equipment at your fingertips.' },
    { key: 'footer_text', value: '© 2026 FixMart. All rights reserved.' },
    // Rider delivery pricing defaults
    { key: 'rider_base_fare',        value: '1000' },
    { key: 'rider_price_per_km',     value: '200'  },
    { key: 'rider_platform_fee_pct', value: '10'   },
  ];

  for (const s of settingsData) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }
  console.log('AppSettings seeded.');

  // 6. Seed Wallets
  console.log('Seeding Wallets...');
  await prisma.user.upsert({
    where: { email: 'platform@test.com' },
    update: {},
    create: {
      id: 'PLATFORM',
      email: 'platform@test.com',
      name: 'Platform Commission Account',
      role: 'ADMIN',
    },
  });

  const allUsers = await prisma.user.findMany();
  for (const u of allUsers) {
    await prisma.wallet.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id,
        balance: u.id === 'PLATFORM' ? 0.0 : 5000.0,
        pendingBalance: 0.0,
      },
    });
  }
  console.log('Wallets seeded.');

  // 7. Seed Promo Slides
  console.log('Seeding Promo Slides...');
  const slidesData = [
    {
      imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=800&auto=format&fit=crop',
      caption: 'Professional Services: Book Top-Rated Techs Today!',
      order: 1
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=800&auto=format&fit=crop',
      caption: 'Big Hardware Sale: Up to 30% Off Professional Tools!',
      order: 2
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1585776245991-cf89dd7fc73a?q=80&w=800&auto=format&fit=crop',
      caption: 'Fastest Deliveries: Get Your Parcels Shipped in Minutes!',
      order: 3
    }
  ];

  for (const s of slidesData) {
    await prisma.promoSlide.create({ data: s });
  }
  console.log('Promo Slides seeded.');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
