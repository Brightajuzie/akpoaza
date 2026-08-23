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
// GET all slides sorted by order
router.get('/', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const slides = yield prisma_1.default.promoSlide.findMany({
            orderBy: { order: 'asc' }
        });
        res.json(slides);
    }
    catch (error) {
        next(error);
    }
}));
// POST create a slide (Admin only)
router.post('/', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const { imageUrl, caption, order } = req.body;
    if (!imageUrl) {
        return res.status(400).json({ error: 'imageUrl is required' });
    }
    try {
        const slide = yield prisma_1.default.promoSlide.create({
            data: {
                imageUrl,
                caption: caption || null,
                order: order !== undefined ? Number(order) : 0
            }
        });
        res.status(201).json(slide);
    }
    catch (error) {
        next(error);
    }
}));
// PUT update a slide (Admin only)
router.put('/:id', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const { id } = req.params;
    const { imageUrl, caption, order } = req.body;
    try {
        const slide = yield prisma_1.default.promoSlide.findUnique({ where: { id } });
        if (!slide) {
            return res.status(404).json({ error: 'Slide not found' });
        }
        const updated = yield prisma_1.default.promoSlide.update({
            where: { id },
            data: {
                imageUrl: imageUrl !== undefined ? imageUrl : slide.imageUrl,
                caption: caption !== undefined ? caption : slide.caption,
                order: order !== undefined ? Number(order) : slide.order
            }
        });
        res.json(updated);
    }
    catch (error) {
        next(error);
    }
}));
// POST bulk delete slides (Admin only)
router.post('/bulk-delete', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids array is required' });
    }
    try {
        const result = yield prisma_1.default.promoSlide.deleteMany({ where: { id: { in: ids } } });
        res.json({ success: true, count: result.count, message: `${result.count} slide(s) deleted successfully.` });
    }
    catch (error) {
        next(error);
    }
}));
// DELETE a slide (Admin only)
router.delete('/:id', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const { id } = req.params;
    try {
        const slide = yield prisma_1.default.promoSlide.findUnique({ where: { id } });
        if (!slide) {
            return res.status(404).json({ error: 'Slide not found' });
        }
        yield prisma_1.default.promoSlide.delete({ where: { id } });
        res.json({ message: 'Slide deleted successfully' });
    }
    catch (error) {
        next(error);
    }
}));
exports.default = router;
