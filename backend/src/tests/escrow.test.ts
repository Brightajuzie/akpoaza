import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

jest.setTimeout(120000);

describe('Escrow and Wallet Settlement Integration Tests', () => {
  let customerToken = '';
  let customerId = '';
  let handymanToken = '';
  let handymanId = '';
  let vendorToken = '';
  let vendorId = '';
  let serviceId = '';
  let productId = '';

  const testEmailCustomer = `escrow_cust_${Date.now()}@domain.com`;
  const testEmailHandyman = `escrow_handy_${Date.now()}@domain.com`;
  const testEmailVendor = `escrow_vendor_${Date.now()}@domain.com`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    // Clear existing test data using targeted where clauses to avoid full locks
    await prisma.withdrawal.deleteMany({
      where: { wallet: { user: { email: { startsWith: 'escrow_' } } } }
    });
    await prisma.transaction.deleteMany({
      where: { wallet: { user: { email: { startsWith: 'escrow_' } } } }
    });
    await prisma.escrow.deleteMany({
      where: {
        OR: [
          { provider: { email: { startsWith: 'escrow_' } } },
          { booking: { customer: { email: { startsWith: 'escrow_' } } } }
        ]
      }
    });
    await prisma.booking.deleteMany({
      where: {
        OR: [
          { customer: { email: { startsWith: 'escrow_' } } },
          { handyman: { email: { startsWith: 'escrow_' } } }
        ]
      }
    });
    await prisma.orderItem.deleteMany({
      where: { order: { user: { email: { startsWith: 'escrow_' } } } }
    });
    await prisma.order.deleteMany({
      where: { user: { email: { startsWith: 'escrow_' } } }
    });
    await prisma.wallet.deleteMany({
      where: { user: { email: { startsWith: 'escrow_' } } }
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { startsWith: 'escrow_cust_' } },
          { email: { startsWith: 'escrow_handy_' } },
          { email: { startsWith: 'escrow_vendor_' } },
        ]
      },
    });

    // Create a mock service
    const service = await prisma.service.create({
      data: {
        name: 'Escrow Repair Test',
        description: 'Test plumbing repairs',
        category: 'Plumbing',
        basePrice: 1000.00, // ₦1000 base price
      },
    });
    serviceId = service.id;

    // Create a mock product
    const product = await prisma.product.create({
      data: {
        name: 'Escrow Test Drill',
        description: 'Test drill',
        price: 2000.00, // ₦2000 price
        stock: 10,
        category: 'Tools',
      },
    });
    productId = product.id;

    // Register Customer
    const customerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: testEmailCustomer,
        password: 'password123',
        name: 'Escrow Customer',
        role: 'CUSTOMER',
      });
    customerToken = customerRes.body.token;
    customerId = customerRes.body.user.id;

    // Register Handyman
    const handymanRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: testEmailHandyman,
        password: 'password123',
        name: 'Escrow Handyman',
        role: 'HANDYMAN',
      });
    handymanToken = handymanRes.body.token;
    handymanId = handymanRes.body.user.id;

    // Set Handyman Home & Specialty
    await request(app)
      .patch('/api/auth/location')
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({
        latitude: 40.7580,
        longitude: -73.9855,
        address: 'Times Square, NYC',
      });
    await prisma.user.update({
      where: { id: handymanId },
      data: { specialty: 'Plumbing', verificationStatus: 'VERIFIED' }, // verified for withdrawals
    });

    // Register Vendor
    const vendorRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: testEmailVendor,
        password: 'password123',
        name: 'Escrow Vendor',
        role: 'VENDOR',
      });
    vendorToken = vendorRes.body.token;
    vendorId = vendorRes.body.user.id;

    await prisma.user.update({
      where: { id: vendorId },
      data: { verificationStatus: 'VERIFIED' }, // verified for withdrawals
    });

    // Link test product to this vendor
    await prisma.product.update({
      where: { id: productId },
      data: { vendorId },
    });

    // Setup wallets
    await prisma.wallet.create({ data: { userId: customerId, balance: 10000.0, pendingBalance: 0.0 } }); // Customer starts with 10k
    await prisma.wallet.create({ data: { userId: handymanId, balance: 0.0, pendingBalance: 0.0 } });
    await prisma.wallet.create({ data: { userId: vendorId, balance: 0.0, pendingBalance: 0.0 } });

    // Platform user and wallet
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
    await prisma.wallet.upsert({
      where: { userId: 'PLATFORM' },
      update: {},
      create: { userId: 'PLATFORM', balance: 0.0, pendingBalance: 0.0 },
    });

    // Seeding App Settings
    await prisma.appSetting.upsert({
      where: { key: 'commission_rate' },
      update: { value: '0.15' }, // 15% platform commission
      create: { key: 'commission_rate', value: '0.15' },
    });
  }, 120000);

  afterAll(async () => {
    // Cleanup
    await prisma.withdrawal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.escrow.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.wallet.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { startsWith: 'escrow_cust_' } },
          { email: { startsWith: 'escrow_handy_' } },
          { email: { startsWith: 'escrow_vendor_' } },
        ]
      },
    });
    await prisma.service.deleteMany({ where: { id: serviceId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  });

  describe('Booking Escrow & Release Workflow', () => {
    let bookingId = '';
    let escrowId = '';

    it('should create a booking and mark it paid, generating an escrow record', async () => {
      // 1. Create booking
      const bookRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId,
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          address: 'Times Square, NYC',
          latitude: 40.7580,
          longitude: -73.9855,
          autoAssign: true, // Auto assign closes handyman (Bob Close)
        });

      expect(bookRes.status).toBe(201);
      bookingId = bookRes.body.id;
      expect(bookRes.body.handymanId).toBe(handymanId);

      // Simulate payment verification via OPay callback
      const payRes = await request(app)
        .get(`/api/payments/opay/verify/PAY_${bookingId}_${Date.now()}`);

      expect(payRes.status).toBe(200);

      // Check booking status changed to ACCEPTED
      const updatedBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
      expect(updatedBooking?.status).toBe('ACCEPTED');

      // Check escrow record exists
      const escrow = await prisma.escrow.findFirst({
        where: { bookingId },
      });
      expect(escrow).toBeDefined();
      expect(escrow?.amount).toBe(1000.00);
      expect(escrow?.commissionAmount).toBe(150.00); // 15% of 1000
      expect(escrow?.providerAmount).toBe(850.00); // 85% of 1000
      expect(escrow?.status).toBe('HELD');
      escrowId = escrow!.id;

      // Check handyman pending balance was incremented
      const handymanWallet = await prisma.wallet.findUnique({ where: { userId: handymanId } });
      expect(handymanWallet?.pendingBalance).toBe(850.00);
      expect(handymanWallet?.balance).toBe(0.0);
    });

    it('should set autoReleaseAt to 48 hours in the future when handyman marks job completed', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${bookingId}/status`)
        .set('Authorization', `Bearer ${handymanToken}`)
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(200);

      // Check autoReleaseAt was set on the escrow record
      const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } });
      expect(escrow?.autoReleaseAt).not.toBeNull();
      
      const diffMs = escrow!.autoReleaseAt!.getTime() - Date.now();
      const diffHours = diffMs / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(48, 1);
    });

    it('should split and release funds instantly when customer confirms completion', async () => {
      const confirmRes = await request(app)
        .post(`/api/bookings/${bookingId}/confirm-completion`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(confirmRes.status).toBe(200);

      // Check escrow is RELEASED
      const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } });
      expect(escrow?.status).toBe('RELEASED');

      // Check wallet balances updated
      const handymanWallet = await prisma.wallet.findUnique({ where: { userId: handymanId } });
      expect(handymanWallet?.pendingBalance).toBe(0.0);
      expect(handymanWallet?.balance).toBe(850.00); // Cleared balance

      const platformWallet = await prisma.wallet.findUnique({ where: { userId: 'PLATFORM' } });
      expect(platformWallet?.balance).toBe(150.00); // Platform gets commission
    });
  });

  describe('Withdrawals and Settlement Speeds', () => {
    it('should reject withdrawals if handyman KYC is not verified', async () => {
      // Temporarily mark handyman unverified
      await prisma.user.update({ where: { id: handymanId }, data: { verificationStatus: 'UNVERIFIED' } });

      const res = await request(app)
        .post('/api/wallet/withdraw')
        .set('Authorization', `Bearer ${handymanToken}`)
        .send({
          amount: 500.00,
          instant: false,
          accountNumber: '1234567890',
          bankName: 'Test Bank',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('KYC');

      // Reset to verified
      await prisma.user.update({ where: { id: handymanId }, data: { verificationStatus: 'VERIFIED' } });
    });

    it('should process instant withdrawals immediately and deduct ₦100 fee', async () => {
      const res = await request(app)
        .post('/api/wallet/withdraw')
        .set('Authorization', `Bearer ${handymanToken}`)
        .send({
          amount: 500.00,
          instant: true,
          accountNumber: '1234567890',
          bankName: 'Test Bank',
        });

      expect(res.status).toBe(200);
      expect(res.body.withdrawal.status).toBe('COMPLETED');
      expect(res.body.withdrawal.fee).toBe(100.0);
      expect(res.body.withdrawal.netAmount).toBe(400.0); // 500 - 100

      // Handyman balance: 850 - 500 = 350
      const handymanWallet = await prisma.wallet.findUnique({ where: { userId: handymanId } });
      expect(handymanWallet?.balance).toBe(350.00);
    });

    it('should queue standard withdrawals as PENDING with ₦0 fee', async () => {
      const res = await request(app)
        .post('/api/wallet/withdraw')
        .set('Authorization', `Bearer ${handymanToken}`)
        .send({
          amount: 300.00,
          instant: false,
          accountNumber: '1234567890',
          bankName: 'Test Bank',
        });

      expect(res.status).toBe(200);
      expect(res.body.withdrawal.status).toBe('PENDING');
      expect(res.body.withdrawal.fee).toBe(0.0);
      expect(res.body.withdrawal.netAmount).toBe(300.0);

      // Handyman balance: 350 - 300 = 50
      const handymanWallet = await prisma.wallet.findUnique({ where: { userId: handymanId } });
      expect(handymanWallet?.balance).toBe(50.00);
    });
  });

  describe('Booking Split Payment 50/50 Workflow', () => {
    let splitBookingId = '';
    let firstEscrowId = '';

    it('should confirm a booking upon 50% deposit payment and create first escrow record', async () => {
      // 1. Create booking
      const bookRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId,
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          address: 'Times Square, NYC',
          latitude: 40.7580,
          longitude: -73.9855,
          autoAssign: true,
        });

      expect(bookRes.status).toBe(201);
      splitBookingId = bookRes.body.id;

      // Initialize split checkout
      const checkoutRes = await request(app)
        .post('/api/payments/checkout')
        .send({
          checkoutType: 'booking',
          id: splitBookingId,
          provider: 'OPAY',
          isSplit: true,
        });

      expect(checkoutRes.status).toBe(200);
      expect(checkoutRes.body.authorizationUrl).toContain('amount=500.00'); // 50% of 1000 basePrice

      // Verify payment of 500
      const payRes = await request(app)
        .get(`/api/payments/opay/verify/PAY_${splitBookingId}_${Date.now()}`);

      expect(payRes.status).toBe(200);

      // Verify booking is ACCEPTED (confirmed by 50% deposit)
      const updatedBooking = await prisma.booking.findUnique({ where: { id: splitBookingId } });
      expect(updatedBooking?.status).toBe('ACCEPTED');
      expect(updatedBooking?.isSplitPayment).toBe(true);
      expect(updatedBooking?.amountPaid).toBe(500.00);

      // Verify first escrow is created for 500
      const escrow = await prisma.escrow.findFirst({
        where: { bookingId: splitBookingId },
      });
      expect(escrow).toBeDefined();
      expect(escrow?.amount).toBe(500.00);
      expect(escrow?.commissionAmount).toBe(75.00); // 15% of 500
      expect(escrow?.providerAmount).toBe(425.00); // 85% of 500
      expect(escrow?.status).toBe('HELD');
      firstEscrowId = escrow!.id;
    });

    it('should reject direct confirm-completion if the remaining 50% is not paid', async () => {
      // Handyman completes job
      const completeRes = await request(app)
        .patch(`/api/bookings/${splitBookingId}/status`)
        .set('Authorization', `Bearer ${handymanToken}`)
        .send({ status: 'COMPLETED' });

      expect(completeRes.status).toBe(200);

      // Customer tries to directly confirm completion without paying
      const confirmRes = await request(app)
        .post(`/api/bookings/${splitBookingId}/confirm-completion`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(confirmRes.status).toBe(400);
      expect(confirmRes.body.error).toContain('Remaining split payment');
    });

    it('should complete final settlement and release both escrows upon paying the remaining 50%', async () => {
      // Initiate second checkout
      const checkoutRes = await request(app)
        .post('/api/payments/checkout')
        .send({
          checkoutType: 'booking',
          id: splitBookingId,
          provider: 'OPAY',
        });

      expect(checkoutRes.status).toBe(200);
      expect(checkoutRes.body.authorizationUrl).toContain('amount=500.00'); // remaining 500

      // Verify second payment
      const payRes = await request(app)
        .get(`/api/payments/opay/verify/PAY_${splitBookingId}_${Date.now()}`);

      expect(payRes.status).toBe(200);

      // Booking status should be COMPLETED and fully paid
      const finalBooking = await prisma.booking.findUnique({ where: { id: splitBookingId } });
      expect(finalBooking?.status).toBe('COMPLETED');
      expect(finalBooking?.amountPaid).toBe(1000.00);

      // Both escrows should be RELEASED
      const escrows = await prisma.escrow.findMany({
        where: { bookingId: splitBookingId },
      });
      expect(escrows.length).toBe(2);
      expect(escrows.every(e => e.status === 'RELEASED')).toBe(true);

      // Handyman cleared balance should receive total provider share (425.00 * 2 = 850.00)
      // Since they previously had 50.00, it should be 50.00 + 850.00 = 900.00
      const handymanWallet = await prisma.wallet.findUnique({ where: { userId: handymanId } });
      expect(handymanWallet?.balance).toBe(900.00);
    });
  });
});
