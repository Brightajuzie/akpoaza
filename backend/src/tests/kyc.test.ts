import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-dummy-key';

jest.setTimeout(90000);

describe('KYC & Verification Integration Tests', () => {
  let adminUser: any;
  let adminToken: string;
  let vendorUser: any;
  let vendorToken: string;
  let handymanUser: any;
  let handymanToken: string;
  let riderUser: any;
  let riderToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    // Clean up
    await prisma.user.deleteMany({ where: { email: { startsWith: 'test_kyc_' } } });

    // Admin
    adminUser = await prisma.user.create({
      data: {
        email: `test_kyc_admin_${Date.now()}@domain.com`,
        name: 'Test KYC Admin',
        role: 'ADMIN',
        verificationStatus: 'VERIFIED',
      },
    });
    adminToken = jwt.sign({ userId: adminUser.id, role: adminUser.role }, JWT_SECRET, { expiresIn: '1h' });

    // Vendor (Unverified initially)
    vendorUser = await prisma.user.create({
      data: {
        email: `test_kyc_vendor_${Date.now()}@domain.com`,
        name: 'Test KYC Vendor',
        role: 'VENDOR',
        verificationStatus: 'UNVERIFIED',
      },
    });
    vendorToken = jwt.sign({ userId: vendorUser.id, role: vendorUser.role }, JWT_SECRET, { expiresIn: '1h' });

    // Handyman (Unverified initially)
    handymanUser = await prisma.user.create({
      data: {
        email: `test_kyc_handyman_${Date.now()}@domain.com`,
        name: 'Test KYC Handyman',
        role: 'HANDYMAN',
        verificationStatus: 'UNVERIFIED',
      },
    });
    handymanToken = jwt.sign({ userId: handymanUser.id, role: handymanUser.role }, JWT_SECRET, { expiresIn: '1h' });

    // Rider (Unverified initially)
    riderUser = await prisma.user.create({
      data: {
        email: `test_kyc_rider_${Date.now()}@domain.com`,
        name: 'Test KYC Rider',
        role: 'RIDER',
        verificationStatus: 'UNVERIFIED',
      },
    });
    riderToken = jwt.sign({ userId: riderUser.id, role: riderUser.role }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'test_kyc_' } } });
    await prisma.$disconnect();
  });

  describe('GET /api/kyc/status', () => {
    it('should return the current user\'s verification status', async () => {
      const res = await request(app)
        .get('/api/kyc/status')
        .set('Authorization', `Bearer ${vendorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.verificationStatus).toBe('UNVERIFIED');
      expect(res.body.role).toBe('VENDOR');
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/kyc/status');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/kyc/bvn', () => {
    it('should reject BVN validation if consent is missing', async () => {
      const res = await request(app)
        .post('/api/kyc/bvn')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ bvn: '22221111000', consent: false });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/consent is mandatory/i);
    });

    it('should reject invalid length BVN', async () => {
      const res = await request(app)
        .post('/api/kyc/bvn')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ bvn: '123', consent: true });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/exactly 11 digits/i);
    });

    it('should successfully validate 11-digit BVN in sandbox mock mode', async () => {
      const res = await request(app)
        .post('/api/kyc/bvn')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ bvn: '22223333444', consent: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data?.bvn).toBe('22223333444');
    });
  });

  describe('POST /api/kyc/submit', () => {
    it('should update and verify vendor when complete registration details are supplied', async () => {
      const res = await request(app)
        .post('/api/kyc/submit')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          bvn: '22223333444',
          phone: '08099887766',
          opayPhone: '08099887766',
          address: 'Block B, Alaba Int Market, Lagos',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.verificationStatus).toBe('VERIFIED');
    });

    it('should set handyman to PENDING_REVIEW when registration is submitted', async () => {
      const res = await request(app)
        .post('/api/kyc/submit')
        .set('Authorization', `Bearer ${handymanToken}`)
        .send({
          bvn: '22225555666',
          phone: '08011223344',
          address: 'Surulere, Lagos',
          specialty: 'Plumbing & Pipefitting',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.verificationStatus).toBe('PENDING_REVIEW');
    });
  });

  describe('Admin KYC Review & Decision (/api/kyc/admin/reviews & PATCH /api/kyc/:userId/review)', () => {
    it('should list users pending or submitted for review', async () => {
      const res = await request(app)
        .get('/api/kyc/admin/reviews')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.reviews)).toBe(true);
    });

    it('should allow admin to approve handyman registration', async () => {
      const res = await request(app)
        .patch(`/api/kyc/${handymanUser.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'VERIFIED' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.verificationStatus).toBe('VERIFIED');
    });

    it('should allow admin to reject verification with a reason', async () => {
      const res = await request(app)
        .patch(`/api/kyc/${riderUser.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'REJECTED', reason: 'Missing vehicle documents' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.verificationStatus).toBe('REJECTED');
    });
  });
});
