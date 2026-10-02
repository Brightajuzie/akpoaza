import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

/** Validate imageUrls payload: must be array, length 1–3, all non-empty strings. */
function validateImageUrls(imageUrls: unknown): string | null {
  if (!Array.isArray(imageUrls)) return 'imageUrls must be an array.';
  const urls = (imageUrls as unknown[]).filter(
    (u): u is string => typeof u === 'string' && u.trim().length > 0,
  );
  if (urls.length < 1) return 'At least 1 product image is required.';
  if (urls.length > 3) return 'Maximum 3 product images are allowed.';
  return null; // valid
}

/** Filter, trim and cap imageUrls at 3. */
function normaliseImageUrls(raw: unknown[]): string[] {
  return (raw as unknown[])
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    .map((u) => (u as string).trim())
    .slice(0, 3);
}

const IMAGE_INCLUDE = {
  images: { orderBy: { position: 'asc' as const } },
};

// ── GET / ────────────────────────────────────────────────────────────────────

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
        address: { contains: String(location), mode: 'insensitive' },
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
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      include: {
        ...IMAGE_INCLUDE,
        vendor: { select: { id: true, name: true, email: true, address: true } },
      },
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ── GET /vendor/all ──────────────────────────────────────────────────────────

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
      include: IMAGE_INCLUDE,
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendor products' });
  }
});

// ── GET /:id ─────────────────────────────────────────────────────────────────

// Get a single product by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        ...IMAGE_INCLUDE,
        vendor: { select: { id: true, name: true, email: true } },
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// ── POST / ───────────────────────────────────────────────────────────────────

// Create a new product (Admin or Vendor)
// Body: { name, description, price, stock, category, imageUrls: string[] (1–3) }
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (role !== 'ADMIN' && role !== 'VENDOR') {
    return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
  }

  const { name, description, price, stock, category, imageUrls, size, weight } = req.body;

  const imgError = validateImageUrls(imageUrls);
  if (imgError) return res.status(400).json({ error: imgError });
  const urls = normaliseImageUrls(imageUrls as unknown[]);

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
        imageUrl: urls[0], // primary / cover mirrors images[0]
        category,
        size: size || null,
        weight: weight || null,
        vendorId: role === 'VENDOR' ? userId : null,
        images: {
          create: urls.map((url, idx) => ({ url, position: idx })),
        },
      },
      include: IMAGE_INCLUDE,
    });
    res.status(201).json(newProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// ── PUT /:id ─────────────────────────────────────────────────────────────────

// Update an existing product (Owner vendor or Admin only)
// Body: { name?, description?, price?, stock?, category?, imageUrls?: string[] (1–3) }
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (role !== 'ADMIN' && role !== 'VENDOR') {
    return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
  }

  const { name, description, price, stock, category, imageUrls, size, weight } = req.body;

  let urls: string[] | undefined;
  if (imageUrls !== undefined) {
    const imgError = validateImageUrls(imageUrls);
    if (imgError) return res.status(400).json({ error: imgError });
    urls = normaliseImageUrls(imageUrls as unknown[]);
  }

  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (role === 'VENDOR') {
      if (product.vendorId !== userId) {
        return res.status(403).json({ error: 'Forbidden. You do not own this product.' });
      }
      const vendorUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!vendorUser || vendorUser.verificationStatus !== 'VERIFIED') {
        return res.status(403).json({ error: 'Vendors must complete registration and be verified before modifying products.' });
      }
    }

    const updateData: any = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(price !== undefined && { price: parseFloat(price) }),
      ...(stock !== undefined && { stock: parseInt(stock, 10) }),
      ...(category !== undefined && { category }),
      ...(size !== undefined && { size: size || null }),
      ...(weight !== undefined && { weight: weight || null }),
    };

    if (urls) {
      updateData.imageUrl = urls[0];
      updateData.images = {
        deleteMany: {},
        create: urls.map((url, idx) => ({ url, position: idx })),
      };
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: updateData,
      include: IMAGE_INCLUDE,
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// ── POST /delete-all ─────────────────────────────────────────────────────────

// Delete all products (Admin or Vendor for own products)
router.post('/delete-all', authenticateToken, async (req: AuthRequest, res) => {
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (role !== 'ADMIN' && role !== 'VENDOR') {
    return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
  }

  try {
    let whereClause: any = {};
    if (role === 'VENDOR') {
      whereClause.vendorId = userId;
    }

    const allProducts = await prisma.product.findMany({ where: whereClause, select: { id: true } });
    const count = allProducts.length;
    const targetIds = allProducts.map(p => p.id);

    if (targetIds.length > 0) {
      await prisma.$transaction([
        prisma.review.deleteMany({ where: { productId: { in: targetIds } } }),
        prisma.orderItem.deleteMany({ where: { productId: { in: targetIds } } }),
        // ProductImage rows cascade-deleted by DB
        prisma.product.deleteMany({ where: { id: { in: targetIds } } }),
      ]);
    }

    res.json({ success: true, count, message: `All ${count} product(s) deleted successfully.` });
  } catch (error: any) {
    console.error('POST /products/delete-all error:', error);
    res.status(500).json({ error: error?.message || 'Failed to delete all products' });
  }
});

// ── POST /bulk-delete ─────────────────────────────────────────────────────────

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
        prisma.productImage.deleteMany({ where: { productId: { in: matchedIds } } }),
        prisma.product.deleteMany({ where: { id: { in: matchedIds } } }),
      ]);
    }

    res.json({ success: true, count: matchedIds.length, message: `${matchedIds.length} product(s) deleted successfully.` });
  } catch (error: any) {
    console.error('POST /products/bulk-delete error:', error);
    res.status(500).json({ error: error?.message || 'Failed to bulk delete products' });
  }
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────

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

    if (role === 'VENDOR' && product.vendorId !== userId) {
      return res.status(403).json({ error: 'Forbidden. You do not own this product.' });
    }

    await prisma.$transaction([
      prisma.review.deleteMany({ where: { productId: id } }),
      prisma.orderItem.deleteMany({ where: { productId: id } }),
      prisma.productImage.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ]);
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error: any) {
    console.error('DELETE /products/:id error:', error);
    res.status(500).json({ error: error?.message || 'Failed to delete product' });
  }
});

// ── POST /bulk-csv ──────────────────────────────────────────────────────────

// Bulk upload products from CSV array (Admin or Vendor)
router.post('/bulk-csv', authenticateToken, async (req: AuthRequest, res) => {
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (role !== 'ADMIN' && role !== 'VENDOR') {
    return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
  }

  const { products } = req.body;
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'No products provided. A non-empty "products" array is required.' });
  }

  try {
    const created: any[] = [];
    const errors: any[] = [];

    // Pre-cache vendors if Admin provided vendorEmail in CSV rows
    const vendorEmailMap = new Map<string, string>();
    if (role === 'ADMIN') {
      const vendorEmails = products
        .map((p) => p.vendorEmail || p.vendor_email)
        .filter(Boolean)
        .map((e: string) => String(e).trim().toLowerCase());

      if (vendorEmails.length > 0) {
        const foundVendors = await prisma.user.findMany({
          where: { email: { in: vendorEmails } },
          select: { id: true, email: true },
        });
        for (const v of foundVendors) {
          vendorEmailMap.set(v.email.toLowerCase(), v.id);
        }
      }
    }

    for (let i = 0; i < products.length; i++) {
      const row = products[i];
      const name = String(row.name || '').trim();
      const rawPrice = row.price !== undefined ? row.price : row.Price;
      const price = parseFloat(rawPrice);

      if (!name) {
        errors.push({ row: i + 1, error: 'Product name is required' });
        continue;
      }
      if (isNaN(price) || price < 0) {
        errors.push({ row: i + 1, name, error: 'Valid positive price is required' });
        continue;
      }

      const description = String(row.description || row.Description || name).trim();
      const category = String(row.category || row.Category || 'General').trim();
      const stock = parseInt(row.stock || row.Stock || '10', 10);
      const size = row.size ? String(row.size).trim() : null;
      const weight = row.weight ? String(row.weight).trim() : null;

      // Determine vendorId
      let targetVendorId: string | null = null;
      if (role === 'VENDOR') {
        targetVendorId = userId || null;
      } else if (role === 'ADMIN') {
        const vEmail = (row.vendorEmail || row.vendor_email || '').trim().toLowerCase();
        if (vEmail && vendorEmailMap.has(vEmail)) {
          targetVendorId = vendorEmailMap.get(vEmail)!;
        } else if (row.vendorId || row.vendor_id) {
          targetVendorId = String(row.vendorId || row.vendor_id).trim();
        } else {
          targetVendorId = userId || null; // default to admin
        }
      }

      // Handle images (support comma-separated or single imageUrl)
      const rawImg = row.imageUrl || row.image_url || row.image || row.images;
      let imgList: string[] = [];
      if (typeof rawImg === 'string' && rawImg.trim()) {
        imgList = rawImg.split(',').map((u) => u.trim()).filter(Boolean);
      } else if (Array.isArray(rawImg)) {
        imgList = rawImg.map((u) => String(u).trim()).filter(Boolean);
      }

      try {
        const newProduct = await prisma.product.create({
          data: {
            name,
            description,
            price,
            stock: isNaN(stock) ? 0 : Math.max(0, stock),
            category,
            size,
            weight,
            vendorId: targetVendorId,
            imageUrl: imgList[0] || null,
            ...(imgList.length > 0 && {
              images: {
                create: imgList.map((url, pos) => ({ url, position: pos })),
              },
            }),
          },
          include: IMAGE_INCLUDE,
        });
        created.push(newProduct);
      } catch (err: any) {
        errors.push({ row: i + 1, name, error: err.message || 'Database error creating product' });
      }
    }

    res.json({
      success: true,
      count: created.length,
      message: `Successfully imported ${created.length} product(s).${errors.length > 0 ? ` (${errors.length} skipped)` : ''}`,
      created,
      errors,
    });
  } catch (error: any) {
    console.error('POST /products/bulk-csv error:', error);
    res.status(500).json({ error: error?.message || 'Failed to import products from CSV' });
  }
});

// ── PATCH /:id/boost ─────────────────────────────────────────────────────────

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

    if (role === 'VENDOR' && product.vendorId !== userId) {
      return res.status(403).json({ error: 'Forbidden. You do not own this product.' });
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: { featured: !product.featured },
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to toggle product boost status' });
  }
});

export default router;
