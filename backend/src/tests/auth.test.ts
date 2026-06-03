import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const testEmail = `test_${Date.now()}@domain.com`;

jest.setTimeout(30000);

describe('Handyman E-Commerce Backend Integration Tests', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    // Clear out any previous test users if they exist
    await prisma.user.deleteMany({ where: { email: { startsWith: 'test_' } } });
  });

  afterAll(async () => {
    // Clean up test users
    await prisma.user.deleteMany({ where: { email: { startsWith: 'test_' } } });
    await prisma.$disconnect();
  });

  describe('GET /health', () => {
    it('should return 200 and running message', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        message: 'Backend is running smoothly.',
      });
    });
  });

  describe('Auth Endpoints', () => {
    let token = '';

    it('should register a new customer user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: 'password123',
          name: 'Test Customer',
          role: 'CUSTOMER',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.role).toBe('CUSTOMER');
    });

    it('should register a new handyman user successfully with specialty, address, and coordinates', async () => {
      const testHandymanEmail = `test_handyman_${Date.now()}@domain.com`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testHandymanEmail,
          password: 'password123',
          name: 'Test Handyman Plumber',
          role: 'HANDYMAN',
          specialty: 'Plumbing',
          address: '456 Broadway, New York, NY',
          latitude: 40.7128,
          longitude: -74.0060,
          identityNumber: '12345678901',
          kycReferenceId: 'REF_TEST_HANDYMAN_123',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(testHandymanEmail);
      expect(res.body.user.role).toBe('HANDYMAN');
      expect(res.body.user.specialty).toBe('Plumbing');
      expect(res.body.user.address).toBe('456 Broadway, New York, NY');
      expect(res.body.user.latitude).toBe(40.7128);
      expect(res.body.user.longitude).toBe(-74.0060);
      expect(res.body.user.verificationStatus).toBe('PENDING_REVIEW');
      expect(res.body.user.requiresKYC).toBe(false);
    });

    it('should register a new vendor user successfully with address and coordinates', async () => {
      const testVendorEmail = `test_vendor_${Date.now()}@domain.com`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testVendorEmail,
          password: 'password123',
          name: 'Test Vendor Store',
          role: 'VENDOR',
          address: '789 Broadway, New York, NY',
          latitude: 40.7200,
          longitude: -74.0100,
          identityNumber: '98765432109',
          kycReferenceId: 'REF_TEST_VENDOR_123',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(testVendorEmail);
      expect(res.body.user.role).toBe('VENDOR');
      expect(res.body.user.address).toBe('789 Broadway, New York, NY');
      expect(res.body.user.latitude).toBe(40.7200);
      expect(res.body.user.longitude).toBe(-74.0100);
      expect(res.body.user.verificationStatus).toBe('PENDING_REVIEW');
      expect(res.body.user.requiresKYC).toBe(false);
    });

    it('should fail registration if email already exists', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: 'password123',
          name: 'Another Customer',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('User already exists');
    });

    it('should login the user and return a JWT token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      token = res.body.token;
    });

    it('should fail login with invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'wrongpassword',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should fetch user details using token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(testEmail);
      expect(res.body.name).toBe('Test Customer');
    });

    it('should deny profile access if no token is provided', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Access denied. No token provided.');
    });
  });
});
