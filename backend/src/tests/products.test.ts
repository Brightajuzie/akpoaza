import request from 'supertest';
import app from '../index';
import prisma from '../lib/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-dummy-key';

jest.setTimeout(60000);

describe('Product Deletion Integration Tests', () => {
  let adminUser: any;
  let adminToken: string;
  let vendor1User: any;
  let vendor1Token: string;
  let vendor2User: any;
  let vendor2Token: string;
  let customerUser: any;
  let customerToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    // Clean up any test users and test products
    await prisma.review.deleteMany({ where: { product: { name: { startsWith: 'TEST_PROD_' } } } });
    await prisma.orderItem.deleteMany({ where: { product: { name: { startsWith: 'TEST_PROD_' } } } });
    await prisma.product.deleteMany({ where: { name: { startsWith: 'TEST_PROD_' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'test_prod_user_' } } });

    // Create test admin
    adminUser = await prisma.user.create({
      data: {
        email: `test_prod_user_admin_${Date.now()}@example.com`,
        name: 'Test Admin',
        role: 'ADMIN',
        verificationStatus: 'VERIFIED',
      },
    });
    adminToken = jwt.sign({ userId: adminUser.id, role: adminUser.role }, JWT_SECRET, { expiresIn: '1h' });

    // Create test vendor 1 (verified)
    vendor1User = await prisma.user.create({
      data: {
        email: `test_prod_user_v1_${Date.now()}@example.com`,
        name: 'Test Vendor One',
        role: 'VENDOR',
        verificationStatus: 'VERIFIED',
        address: '123 Market Road, Lagos',
        phone: '08011112222',
      },
    });
    vendor1Token = jwt.sign({ userId: vendor1User.id, role: vendor1User.role }, JWT_SECRET, { expiresIn: '1h' });

    // Create test vendor 2 (verified)
    vendor2User = await prisma.user.create({
      data: {
        email: `test_prod_user_v2_${Date.now()}@example.com`,
        name: 'Test Vendor Two',
        role: 'VENDOR',
        verificationStatus: 'VERIFIED',
        address: '456 Commercial Ave, Lagos',
        phone: '08033334444',
      },
    });
    vendor2Token = jwt.sign({ userId: vendor2User.id, role: vendor2User.role }, JWT_SECRET, { expiresIn: '1h' });

    // Create test customer
    customerUser = await prisma.user.create({
      data: {
        email: `test_prod_user_cust_${Date.now()}@example.com`,
        name: 'Test Customer',
        role: 'CUSTOMER',
        verificationStatus: 'VERIFIED',
      },
    });
    customerToken = jwt.sign({ userId: customerUser.id, role: customerUser.role }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    // Clean up
    await prisma.review.deleteMany({ where: { product: { name: { startsWith: 'TEST_PROD_' } } } });
    await prisma.orderItem.deleteMany({ where: { product: { name: { startsWith: 'TEST_PROD_' } } } });
    await prisma.product.deleteMany({ where: { name: { startsWith: 'TEST_PROD_' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'test_prod_user_' } } });
    await prisma.$disconnect();
  });

  describe('Single Product Delete (DELETE /api/products/:id)', () => {
    it('should allow vendor to delete their own product and cascade delete reviews/orderItems', async () => {
      // 1. Create product by vendor 1
      const prod = await prisma.product.create({
        data: {
          name: `TEST_PROD_SINGLE_${Date.now()}`,
          description: 'Test single delete product description',
          price: 5000,
          stock: 10,
          category: 'Tools',
          vendorId: vendor1User.id,
        },
      });

      // 2. Attach a review to product
      await prisma.review.create({
        data: {
          authorId: customerUser.id,
          productId: prod.id,
          rating: 5,
          comment: 'Great test product',
        },
      });

      // 3. Vendor 1 deletes own product
      const deleteRes = await request(app)
        .delete(`/api/products/${prod.id}`)
        .set('Authorization', `Bearer ${vendor1Token}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // 4. Verify product and reviews no longer exist
      const checkProd = await prisma.product.findUnique({ where: { id: prod.id } });
      expect(checkProd).toBeNull();

      const checkReview = await prisma.review.findFirst({ where: { productId: prod.id } });
      expect(checkReview).toBeNull();
    });

    it('should allow Admin to delete any product', async () => {
      const prod = await prisma.product.create({
        data: {
          name: `TEST_PROD_ADMIN_DEL_${Date.now()}`,
          description: 'Admin delete test',
          price: 7500,
          stock: 5,
          category: 'Electronics',
          vendorId: vendor1User.id,
        },
      });

      const deleteRes = await request(app)
        .delete(`/api/products/${prod.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      const checkProd = await prisma.product.findUnique({ where: { id: prod.id } });
      expect(checkProd).toBeNull();
    });

    it('should prevent Vendor 2 from deleting Vendor 1 product', async () => {
      const prod = await prisma.product.create({
        data: {
          name: `TEST_PROD_FORBIDDEN_${Date.now()}`,
          description: 'Forbidden delete test',
          price: 3000,
          stock: 3,
          category: 'Hardware',
          vendorId: vendor1User.id,
        },
      });

      const deleteRes = await request(app)
        .delete(`/api/products/${prod.id}`)
        .set('Authorization', `Bearer ${vendor2Token}`);

      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.error).toContain('Forbidden');

      // Verify product is NOT deleted
      const checkProd = await prisma.product.findUnique({ where: { id: prod.id } });
      expect(checkProd).not.toBeNull();
    });

    it('should prevent Customers from deleting products', async () => {
      const prod = await prisma.product.create({
        data: {
          name: `TEST_PROD_CUST_DEL_${Date.now()}`,
          description: 'Customer forbidden delete',
          price: 2000,
          stock: 2,
          category: 'General',
          vendorId: vendor1User.id,
        },
      });

      const deleteRes = await request(app)
        .delete(`/api/products/${prod.id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(deleteRes.status).toBe(403);
    });
  });

  describe('Bulk Product Delete (POST /api/products/bulk-delete)', () => {
    it('should delete multiple selected products in a batch', async () => {
      const prod1 = await prisma.product.create({
        data: {
          name: `TEST_PROD_BULK_1_${Date.now()}`,
          description: 'Bulk 1',
          price: 1000,
          stock: 1,
          category: 'Tools',
          vendorId: vendor1User.id,
        },
      });
      const prod2 = await prisma.product.create({
        data: {
          name: `TEST_PROD_BULK_2_${Date.now()}`,
          description: 'Bulk 2',
          price: 2000,
          stock: 2,
          category: 'Tools',
          vendorId: vendor1User.id,
        },
      });

      const res = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${vendor1Token}`)
        .send({ ids: [prod1.id, prod2.id] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);

      const check1 = await prisma.product.findUnique({ where: { id: prod1.id } });
      const check2 = await prisma.product.findUnique({ where: { id: prod2.id } });
      expect(check1).toBeNull();
      expect(check2).toBeNull();
    });
  });

  describe('Delete All Products (POST /api/products/delete-all)', () => {
    it('should allow vendor to delete all their own products', async () => {
      await prisma.product.create({
        data: {
          name: `TEST_PROD_WIPE_1_${Date.now()}`,
          description: 'Wipe 1',
          price: 1500,
          stock: 4,
          category: 'Tools',
          vendorId: vendor1User.id,
        },
      });
      await prisma.product.create({
        data: {
          name: `TEST_PROD_WIPE_2_${Date.now()}`,
          description: 'Wipe 2',
          price: 2500,
          stock: 5,
          category: 'Tools',
          vendorId: vendor1User.id,
        },
      });

      const res = await request(app)
        .post('/api/products/delete-all')
        .set('Authorization', `Bearer ${vendor1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const remaining = await prisma.product.findMany({ where: { vendorId: vendor1User.id } });
      expect(remaining.length).toBe(0);
    });
  });
});
