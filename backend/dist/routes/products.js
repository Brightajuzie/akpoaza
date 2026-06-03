"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
// Get all products (General Merchandise), with optional vendor, location, or search filtering
router.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { vendorId, location, search } = req.query;
    try {
        let whereClause = {};
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
        const products = yield prisma_1.default.product.findMany({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
}));
// Get products owned by the logged-in vendor
router.get('/vendor/all', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
    if (role !== 'VENDOR' && role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Vendor or Admin access required.' });
    }
    try {
        const products = yield prisma_1.default.product.findMany({
            where: role === 'ADMIN' ? {} : { vendorId: userId },
        });
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch vendor products' });
    }
}));
// Get a single product by ID
router.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const product = yield prisma_1.default.product.findUnique({
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
        if (!product)
            return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch product' });
    }
}));
// Create a new product (Admin or Vendor)
router.post('/', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
    if (role !== 'ADMIN' && role !== 'VENDOR') {
        return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
    }
    const { name, description, price, stock, imageUrl, category } = req.body;
    try {
        const newProduct = yield prisma_1.default.product.create({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create product' });
    }
}));
// Update an existing product (Owner vendor or Admin only)
router.put('/:id', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id } = req.params;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
    if (role !== 'ADMIN' && role !== 'VENDOR') {
        return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
    }
    const { name, description, price, stock, imageUrl, category } = req.body;
    try {
        const product = yield prisma_1.default.product.findUnique({ where: { id } });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        // Check ownership
        if (role === 'VENDOR' && product.vendorId !== userId) {
            return res.status(403).json({ error: 'Forbidden. You do not own this product.' });
        }
        const updatedProduct = yield prisma_1.default.product.update({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update product' });
    }
}));
// Delete a product (Owner vendor or Admin only)
router.delete('/:id', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id } = req.params;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
    if (role !== 'ADMIN' && role !== 'VENDOR') {
        return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
    }
    try {
        const product = yield prisma_1.default.product.findUnique({ where: { id } });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        // Check ownership
        if (role === 'VENDOR' && product.vendorId !== userId) {
            return res.status(403).json({ error: 'Forbidden. You do not own this product.' });
        }
        yield prisma_1.default.product.delete({ where: { id } });
        res.json({ message: 'Product deleted successfully' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
}));
// Toggle product boost (featured) status (Vendor owner or Admin only)
router.patch('/:id/boost', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id } = req.params;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
    if (role !== 'ADMIN' && role !== 'VENDOR') {
        return res.status(403).json({ error: 'Forbidden. Admin or Vendor access required.' });
    }
    try {
        const product = yield prisma_1.default.product.findUnique({ where: { id } });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        // Check ownership
        if (role === 'VENDOR' && product.vendorId !== userId) {
            return res.status(403).json({ error: 'Forbidden. You do not own this product.' });
        }
        const updatedProduct = yield prisma_1.default.product.update({
            where: { id },
            data: {
                featured: !product.featured,
            },
        });
        res.json(updatedProduct);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to toggle product boost status' });
    }
}));
exports.default = router;
