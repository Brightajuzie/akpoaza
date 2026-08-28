import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-dummy-key';

jest.setTimeout(90000);

describe('Parcel Delivery Integration Tests', () => {
  let customerUser: any;
  let customerToken: string;
  let riderUser: any;
  let riderToken: string;
  let otherRiderUser: any;
  let otherRiderToken: string;
  let adminUser: any;
  let adminToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    // Cleanup
    await prisma.parcelDelivery.deleteMany({ where: { user: { email: { startsWith: 'test_parcel_' } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'test_parcel_' } } });

    // Customer
    customerUser = await prisma.user.create({
      data: {
        email: `test_parcel_cust_${Date.now()}@domain.com`,
        name: 'Test Parcel Customer',
        role: 'CUSTOMER',
        verificationStatus: 'VERIFIED',
        address: '15 Marina, Lagos Island',
        phone: '08022223333',
      },
    });
    customerToken = jwt.sign({ userId: customerUser.id, role: customerUser.role }, JWT_SECRET, { expiresIn: '1h' });

    // Rider 1
    riderUser = await prisma.user.create({
      data: {
        email: `test_parcel_rider1_${Date.now()}@domain.com`,
        name: 'Test Rider 1',
        role: 'RIDER',
        verificationStatus: 'VERIFIED',
        phone: '08044445555',
        vehicleType: 'Motorcycle',
        licensePlate: 'ABC-123-XY',
        currentLat: 6.4540,
        currentLng: 3.3940,
      },
    });
    riderToken = jwt.sign({ userId: riderUser.id, role: riderUser.role }, JWT_SECRET, { expiresIn: '1h' });

    // Rider 2
    otherRiderUser = await prisma.user.create({
      data: {
        email: `test_parcel_rider2_${Date.now()}@domain.com`,
        name: 'Test Rider 2',
        role: 'RIDER',
        verificationStatus: 'VERIFIED',
        phone: '08077778888',
        vehicleType: 'Bicycle',
      },
    });
    otherRiderToken = jwt.sign({ userId: otherRiderUser.id, role: otherRiderUser.role }, JWT_SECRET, { expiresIn: '1h' });

    // Admin
    adminUser = await prisma.user.create({
      data: {
        email: `test_parcel_admin_${Date.now()}@domain.com`,
        name: 'Test Parcel Admin',
        role: 'ADMIN',
        verificationStatus: 'VERIFIED',
      },
    });
    adminToken = jwt.sign({ userId: adminUser.id, role: adminUser.role }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    await prisma.parcelDelivery.deleteMany({ where: { user: { email: { startsWith: 'test_parcel_' } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'test_parcel_' } } });
    await prisma.$disconnect();
  });

  describe('POST /api/parcels/quote', () => {
    it('should calculate price quote given pickup and dropoff coordinates', async () => {
      const res = await request(app)
        .post('/api/parcels/quote')
        .send({
          pickupLat: 6.4540,
          pickupLng: 3.3940,
          dropoffLat: 6.5244,
          dropoffLng: 3.3792,
        });

      expect(res.status).toBe(200);
      expect(res.body.price).toBeDefined();
      expect(res.body.price).toBeGreaterThan(0);
      expect(res.body.distanceKm).toBeDefined();
    });

    it('should reject quote with invalid or missing coordinates', async () => {
      const res = await request(app)
        .post('/api/parcels/quote')
        .send({
          pickupLat: 'invalid',
          pickupLng: 3.3940,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid pickup and dropoff coordinates/i);
    });
  });

  describe('POST /api/parcels/checkout', () => {
    it('should create parcel delivery with proximity rider matching', async () => {
      const res = await request(app)
        .post('/api/parcels/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          pickupAddress: '15 Marina, Lagos Island',
          dropoffAddress: '42 Allen Avenue, Ikeja, Lagos',
          pickupLat: 6.4540,
          pickupLng: 3.3940,
          dropoffLat: 6.6018,
          dropoffLng: 3.3515,
          parcelDescription: 'Urgent architectural blueprints (A1 tube)',
          paymentProvider: 'PAYSTACK',
        });

      expect(res.status).toBe(201);
      expect(res.body.parcel).toBeDefined();
      expect(res.body.parcel.userId).toBe(customerUser.id);
      expect(res.body.parcel.status).toBe('PENDING');
      expect(res.body.parcel.totalAmount).toBeGreaterThan(0);
    });

    it('should reject checkout if missing required address fields', async () => {
      const res = await request(app)
        .post('/api/parcels/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          pickupAddress: '',
          dropoffAddress: 'Ikeja',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Rider Operations & Parcel Lifecycle', () => {
    let createdParcel: any;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/parcels/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          pickupAddress: '10 Victoria Island, Lagos',
          dropoffAddress: '5 Lekki Phase 1, Lagos',
          pickupLat: 6.4281,
          pickupLng: 3.4219,
          dropoffLat: 6.4474,
          dropoffLng: 3.4723,
          parcelDescription: 'Box of electronics',
        });
      createdParcel = res.body.parcel;

      // Mark status as PAID so it becomes available for riders
      await prisma.parcelDelivery.update({
        where: { id: createdParcel.id },
        data: { status: 'PAID' },
      });
    });

    it('should allow verified rider to view available parcel deliveries', async () => {
      const res = await request(app)
        .get('/api/parcels/rider/available')
        .set('Authorization', `Bearer ${riderToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((p: any) => p.id === createdParcel.id);
      expect(found).toBeDefined();
    });

    it('should prevent non-riders from querying rider available deliveries', async () => {
      const res = await request(app)
        .get('/api/parcels/rider/available')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow rider to accept a parcel delivery job', async () => {
      const res = await request(app)
        .patch(`/api/parcels/${createdParcel.id}/accept-delivery`)
        .set('Authorization', `Bearer ${riderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.riderId).toBe(riderUser.id);
      expect(res.body.status).toBe('SHIPPED');
    });

    it('should allow assigned rider to update parcel status to DELIVERED', async () => {
      // First accept
      await request(app)
        .patch(`/api/parcels/${createdParcel.id}/accept-delivery`)
        .set('Authorization', `Bearer ${riderToken}`);

      // Then deliver
      const res = await request(app)
        .patch(`/api/parcels/${createdParcel.id}/status`)
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ status: 'DELIVERED' });

      expect(res.status).toBe(200);
      expect(res.body.parcel.status).toBe('DELIVERED');
    });

    it('should allow customer to cancel pending/paid parcel delivery', async () => {
      const res = await request(app)
        .patch(`/api/parcels/${createdParcel.id}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(200);
      expect(res.body.parcel.status).toBe('CANCELLED');
    });
  });
});
