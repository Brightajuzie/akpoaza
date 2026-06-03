import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

jest.setTimeout(30000);

describe('Booking & Matchmaking Integration Tests', () => {
  let customerToken = '';
  let customerId = '';
  let handymanToken = '';
  let handymanId = '';
  let serviceId = '';

  const testEmailCustomer = `customer_${Date.now()}@domain.com`;
  const testEmailHandymanClose = `handyman_close_${Date.now()}@domain.com`;
  const testEmailHandymanFar = `handyman_far_${Date.now()}@domain.com`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    // Clear existing mock/test data
    await prisma.booking.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { startsWith: 'customer_' } },
          { email: { startsWith: 'handyman_close_' } },
          { email: { startsWith: 'handyman_far_' } },
        ]
      },
    });

    // Create a mock service
    const service = await prisma.service.create({
      data: {
        name: 'Plumbing Repair Test',
        description: 'Test plumbing repairs',
        category: 'Plumbing',
        basePrice: 90.00,
      },
    });
    serviceId = service.id;

    // Register Customer (New York City center - Times Square: 40.7580, -73.9855)
    const customerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: testEmailCustomer,
        password: 'password123',
        name: 'Test Customer NYC',
        role: 'CUSTOMER',
      });
    customerToken = customerRes.body.token;
    customerId = customerRes.body.user.id;

    // Set Customer's home location
    await request(app)
      .patch('/api/auth/location')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        latitude: 40.7580,
        longitude: -73.9855,
        address: 'Times Square, New York, NY',
      });

    // Register Handyman Close (Port Authority - 0.5 km away: 40.7568, -73.9906)
    const handymanCloseRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: testEmailHandymanClose,
        password: 'password123',
        name: 'Bob Close Plumber',
        role: 'HANDYMAN',
      });
    handymanToken = handymanCloseRes.body.token;
    handymanId = handymanCloseRes.body.user.id;

    await request(app)
      .patch('/api/auth/location')
      .set('Authorization', `Bearer ${handymanToken}`)
      .send({
        latitude: 40.7568,
        longitude: -73.9906,
        specialty: 'Plumbing',
      });
    // Directly set specialty and verification status via prisma since signup might not have it in req.body
    await prisma.user.update({
      where: { id: handymanId },
      data: { specialty: 'Plumbing', verificationStatus: 'VERIFIED' },
    });

    // Register Handyman Far (Central Park - 3 km away: 40.7850, -73.9682)
    const handymanFarRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: testEmailHandymanFar,
        password: 'password123',
        name: 'Dave Far Plumber',
        role: 'HANDYMAN',
      });
    const farId = handymanFarRes.body.user.id;

    await request(app)
      .patch('/api/auth/location')
      .set('Authorization', `Bearer ${handymanFarRes.body.token}`)
      .send({
        latitude: 40.7850,
        longitude: -73.9682,
        specialty: 'Plumbing',
      });
    await prisma.user.update({
      where: { id: farId },
      data: { specialty: 'Plumbing', verificationStatus: 'VERIFIED' },
    });
  }, 120000);

  afterAll(async () => {
    // Cleanup
    await prisma.booking.deleteMany({});
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { startsWith: 'customer_' } },
          { email: { startsWith: 'handyman_close_' } },
          { email: { startsWith: 'handyman_far_' } },
        ]
      },
    });
    await prisma.service.deleteMany({ where: { id: serviceId } });
    await prisma.$disconnect();
  });

  describe('Intelligent Matchmaking and Live Tracking', () => {
    let bookingId = '';

    it('should auto-assign the closest qualified handyman when booking with autoAssign = true', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId,
          scheduledAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          address: 'Times Square, New York, NY',
          latitude: 40.7580,
          longitude: -73.9855,
          autoAssign: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.handymanId).toBe(handymanId); // Assigned to Bob (Close Plumber)
      expect(res.body.status).toBe('ACCEPTED');
      bookingId = res.body.id;
    });

    it('should retrieve correct customer and provider live locations', async () => {
      const res = await request(app)
        .get(`/api/bookings/${bookingId}/location`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.customerLocation.lat).toBeCloseTo(40.7580, 4);
      expect(res.body.customerLocation.lng).toBeCloseTo(-73.9855, 4);
      
      // Handyman current location should match initial coordinates
      expect(res.body.providerLocation.lat).toBeCloseTo(40.7568, 4);
      expect(res.body.providerLocation.lng).toBeCloseTo(-73.9906, 4);
    });

    it('should update live locations when provider moves, and reflect on tracking details', async () => {
      // Handyman moves closer to Times Square (e.g. 40.7575, -73.9870)
      await request(app)
        .patch('/api/auth/location')
        .set('Authorization', `Bearer ${handymanToken}`)
        .send({
          currentLat: 40.7575,
          currentLng: -73.9870,
        });

      // Get location tracking details again
      const res = await request(app)
        .get(`/api/bookings/${bookingId}/location`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.providerLocation.lat).toBeCloseTo(40.7575, 4);
      expect(res.body.providerLocation.lng).toBeCloseTo(-73.9870, 4);
    });
  });
});
