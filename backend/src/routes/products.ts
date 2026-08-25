import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

// Get all products (General Merchandise), with optional vendor, location, or search filtering
router.get('/', async (req, res) => {
  const { vendorId, location, search } = req.query;
  try {
    let whereClause: any = {};
    if (vendorId) {
      whereClause.vendorId = String(vendorId);
    }
    if (location) {
      whereClause.vendor = {
        address: {
          contains: String(location),
          mode: 'insensitive',
        },
      };
    }
    if (search) {
      const searchStr = String(search);
      whereClause.OR = [
        { name: { contains: searchStr, mode: 'insensitive' } },
        { description: { contains: searchStr, mode: 'insensitive' } },
        { category: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: [
        { featured: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            address: true,
          },
        },
      },
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get products owned by the logged-in vendor
router.get('/vendor/all', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  const role = req.user?.role;

  if (role !== 'VENDOR' && role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Vendor or Admin access required.' });
  }

  try {
    const products = await prisma.product.findMany({
      where: role === 'ADMIN' ? {} : { vendorId: userId },
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendor products' });
  }
});

// Get a single product by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create a new product (Admin or Vendor)
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (role !== 'ADMIN' && role !== 'VENDOR') {
    return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
  }

  const { name, description, price, stock, imageUrl, category } = req.body;
  try {
    if (role === 'VENDOR') {
      const vendorUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!vendorUser || vendorUser.verificationStatus !== 'VERIFIED') {
        return res.status(403).json({ error: 'Vendors must complete registration and be verified before creating products.' });
      }
    }

    const newProduct = await prisma.product.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        stock: parseInt(stock, 10) || 0,
        imageUrl,
        category,
        vendorId: role === 'VENDOR' ? userId : null, // If Admin, vendorId can be null/system
      },
    });
    res.status(201).json(newProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update an existing product (Owner vendor or Admin only)
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (role !== 'ADMIN' && role !== 'VENDOR') {
    return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
  }

  const { name, description, price, stock, imageUrl, category } = req.body;

  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check ownership
    if (role === 'VENDOR') {
      if (product.vendorId !== userId) {
        return res.status(403).json({ error: 'Forbidden. You do not own this product.' });
      }
      const vendorUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!vendorUser || vendorUser.verificationStatus !== 'VERIFIED') {
        return res.status(403).json({ error: 'Vendors must complete registration and be verified before modifying products.' });
      }
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        name,
        description,
        price: price !== undefined ? parseFloat(price) : undefined,
        stock: stock !== undefined ? parseInt(stock, 10) : undefined,
        imageUrl,
        category,
      },
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete all products (Admin only)
router.post('/delete-all', authenticateToken, async (req: AuthRequest, res) => {
  const role = req.user?.role;
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }

  try {
    const allProducts = await prisma.product.findMany({ select: { id: true } });
    const count = allProducts.length;

    await prisma.$transaction([
      prisma.review.deleteMany({ where: { productId: { not: null } } }),
      prisma.orderItem.deleteMany({}),
      prisma.product.deleteMany({}),
    ]);

    res.json({ success: true, count, message: `All ${count} product(s) deleted successfully.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete all products' });
  }
});

// Bulk delete products (Admin or Vendor for own products)
router.post('/bulk-delete', authenticateToken, async (req: AuthRequest, res) => {
  const role = req.user?.role;
  const userId = req.user?.userId;
  const { ids } = req.body;

  if (role !== 'ADMIN' && role !== 'VENDOR') {
    return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  try {
    let whereClause: any = { id: { in: ids } };
    if (role === 'VENDOR') {
      whereClause.vendorId = userId;
    }

    const matchedProducts = await prisma.product.findMany({
      where: whereClause,
      select: { id: true },
    });
    const matchedIds = matchedProducts.map((p) => p.id);

    if (matchedIds.length > 0) {
      await prisma.$transaction([
        prisma.review.deleteMany({ where: { productId: { in: matchedIds } } }),
        prisma.orderItem.deleteMany({ where: { productId: { in: matchedIds } } }),
        prisma.product.deleteMany({ where: { id: { in: matchedIds } } }),
      ]);
    }

    res.json({ success: true, count: matchedIds.length, message: `${matchedIds.length} product(s) deleted successfully.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to bulk delete products' });
  }
});

// Delete a product (Owner vendor or Admin only)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (role !== 'ADMIN' && role !== 'VENDOR') {
    return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
  }

  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check ownership
    if (role === 'VENDOR' && product.vendorId !== userId) {
      return res.status(403).json({ error: 'Forbidden. You do not own this product.' });
    }

    await prisma.$transaction([
      prisma.review.deleteMany({ where: { productId: id } }),
      prisma.orderItem.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ]);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Toggle product boost (featured) status (Vendor owner or Admin only)
router.patch('/:id/boost', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (role !== 'ADMIN' && role !== 'VENDOR') {
    return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
  }

  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check ownership
    if (role === 'VENDOR' && product.vendorId !== userId) {
      return res.status(403).json({ error: 'Forbidden. You do not own this product.' });
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        featured: !product.featured,
      },
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to toggle product boost status' });
  }
});

export default router;
