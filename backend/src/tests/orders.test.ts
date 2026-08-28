import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-dummy-key';

jest.setTimeout(90000);

describe('Orders Integration Tests', () => {
  let adminUser: any;
  let adminToken: string;
  let vendorUser: any;
  let vendorToken: string;
  let customerUser: any;
  let customerToken: string;
  let otherCustomerUser: any;
  let otherCustomerToken: string;
  let testProduct1: any;
  let testProduct2: any;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    // Clean up test records
    await prisma.orderItem.deleteMany({ where: { product: { name: { startsWith: 'TEST_ORD_PROD_' } } } });
    await prisma.product.deleteMany({ where: { name: { startsWith: 'TEST_ORD_PROD_' } } });
    await prisma.order.deleteMany({ where: { user: { email: { startsWith: 'test_order_' } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'test_order_' } } });

    // 1. Admin
    adminUser = await prisma.user.create({
      data: {
        email: `test_order_admin_${Date.now()}@domain.com`,
        name: 'Test Order Admin',
        role: 'ADMIN',
        verificationStatus: 'VERIFIED',
      },
    });
    adminToken = jwt.sign({ userId: adminUser.id, role: adminUser.role }, JWT_SECRET, { expiresIn: '1h' });

    // 2. Vendor
    vendorUser = await prisma.user.create({
      data: {
        email: `test_order_vendor_${Date.now()}@domain.com`,
        name: 'Test Order Vendor',
        role: 'VENDOR',
        verificationStatus: 'VERIFIED',
        address: '88 Commerce Way, Lagos',
        phone: '08099887766',
      },
    });
    vendorToken = jwt.sign({ userId: vendorUser.id, role: vendorUser.role }, JWT_SECRET, { expiresIn: '1h' });

    // 3. Customer 1
    customerUser = await prisma.user.create({
      data: {
        email: `test_order_cust1_${Date.now()}@domain.com`,
        name: 'Test Order Customer 1',
        role: 'CUSTOMER',
        verificationStatus: 'VERIFIED',
        address: '10 Victoria Island, Lagos',
        phone: '08011223344',
      },
    });
    customerToken = jwt.sign({ userId: customerUser.id, role: customerUser.role }, JWT_SECRET, { expiresIn: '1h' });

    // 4. Customer 2
    otherCustomerUser = await prisma.user.create({
      data: {
        email: `test_order_cust2_${Date.now()}@domain.com`,
        name: 'Test Order Customer 2',
        role: 'CUSTOMER',
        verificationStatus: 'VERIFIED',
      },
    });
    otherCustomerToken = jwt.sign({ userId: otherCustomerUser.id, role: otherCustomerUser.role }, JWT_SECRET, { expiresIn: '1h' });

    // 5. Create Test Products
    testProduct1 = await prisma.product.create({
      data: {
        name: `TEST_ORD_PROD_1_${Date.now()}`,
        description: 'Quality Cordless Drill',
        price: 25000,
        stock: 10,
        category: 'Hardware',
        vendorId: vendorUser.id,
      },
    });

    testProduct2 = await prisma.product.create({
      data: {
        name: `TEST_ORD_PROD_2_${Date.now()}`,
        description: 'Safety Helmet',
        price: 5000,
        stock: 3,
        category: 'Safety',
        vendorId: vendorUser.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { product: { name: { startsWith: 'TEST_ORD_PROD_' } } } });
    await prisma.product.deleteMany({ where: { name: { startsWith: 'TEST_ORD_PROD_' } } });
    await prisma.order.deleteMany({ where: { user: { email: { startsWith: 'test_order_' } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'test_order_' } } });
    await prisma.$disconnect();
  });

  describe('POST /api/orders/checkout', () => {
    it('should reject checkout when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .send({
          items: [{ productId: testProduct1.id, quantity: 1 }],
          deliveryAddress: 'Test Address',
        });
      expect(res.status).toBe(401);
    });

    it('should reject checkout when items array is empty', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [],
          deliveryAddress: 'Test Address',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/items are required/i);
    });

    it('should reject checkout when requested quantity exceeds available stock', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{ productId: testProduct2.id, quantity: 10 }], // stock is 3
          deliveryAddress: 'Test Address',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/insufficient stock/i);
    });

    it('should successfully create order and decrement stock atomically', async () => {
      const initialStock1 = testProduct1.stock;
      const initialStock2 = testProduct2.stock;

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            { productId: testProduct1.id, quantity: 2 },
            { productId: testProduct2.id, quantity: 1 },
          ],
          deliveryAddress: '10 Victoria Island, Lagos',
          paymentProvider: 'PAYSTACK',
        });

      expect(res.status).toBe(201);
      expect(res.body.order).toBeDefined();
      expect(res.body.order.status).toBe('PENDING');
      expect(res.body.order.totalAmount).toBe(25000 * 2 + 5000 * 1); // 55000
      expect(res.body.order.items).toHaveLength(2);

      // Verify stock was decremented in database
      const updatedP1 = await prisma.product.findUnique({ where: { id: testProduct1.id } });
      const updatedP2 = await prisma.product.findUnique({ where: { id: testProduct2.id } });
      expect(updatedP1?.stock).toBe(initialStock1 - 2);
      expect(updatedP2?.stock).toBe(initialStock2 - 1);
    });
  });

  describe('GET /api/orders and GET /api/orders/vendor', () => {
    it('should allow customer to fetch only their own orders', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      res.body.forEach((o: any) => {
        expect(o.userId).toBe(customerUser.id);
      });
    });

    it('should return empty list for customer with no orders', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${otherCustomerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should allow vendor to fetch order items for their products', async () => {
      const res = await request(app)
        .get('/api/orders/vendor')
        .set('Authorization', `Bearer ${vendorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      res.body.forEach((item: any) => {
        expect(item.product.vendorId).toBe(vendorUser.id);
      });
    });

    it('should reject non-vendor from accessing vendor orders endpoint', async () => {
      const res = await request(app)
        .get('/api/orders/vendor')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/orders/:id/status (Order Lifecycle & Cancellations)', () => {
    let orderToCancel: any;

    beforeEach(async () => {
      // Ensure product has sufficient stock for test order
      await prisma.product.update({
        where: { id: testProduct2.id },
        data: { stock: 50 },
      });

      // Create a fresh test order for cancellation
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{ productId: testProduct2.id, quantity: 1 }],
          deliveryAddress: '10 Victoria Island, Lagos',
        });
      orderToCancel = res.body.order;
    });

    it('should allow customer to cancel pending order and restore product stock', async () => {
      const stockBeforeCancel = (await prisma.product.findUnique({ where: { id: testProduct2.id } }))?.stock || 0;

      const res = await request(app)
        .patch(`/api/orders/${orderToCancel.id}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe('CANCELLED');

      // Verify stock was restored
      const stockAfterCancel = (await prisma.product.findUnique({ where: { id: testProduct2.id } }))?.stock || 0;
      expect(stockAfterCancel).toBe(stockBeforeCancel + 1);
    });

    it('should prevent non-owner customer from cancelling someone else\'s order', async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderToCancel.id}/status`)
        .set('Authorization', `Bearer ${otherCustomerToken}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(403);
    });

    it('should allow vendor to update order status to SHIPPED and DELIVERED', async () => {
      const resShipped = await request(app)
        .patch(`/api/orders/${orderToCancel.id}/status`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ status: 'SHIPPED' });
      expect(resShipped.status).toBe(200);
      expect(resShipped.body.order.status).toBe('SHIPPED');

      const resDelivered = await request(app)
        .patch(`/api/orders/${orderToCancel.id}/status`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ status: 'DELIVERED' });
      expect(resDelivered.status).toBe(200);
      expect(resDelivered.body.order.status).toBe('DELIVERED');
    });

    it('should reject invalid order status update', async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderToCancel.id}/status`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ status: 'INVALID_STATUS' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid order status/i);
    });
  });
});
