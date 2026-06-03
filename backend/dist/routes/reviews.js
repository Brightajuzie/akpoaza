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
// Create a review
router.post('/', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { productId, serviceId, handymanId, rating, comment } = req.body;
    const authorId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!authorId)
        return res.status(401).json({ error: 'Unauthorized' });
    if (!productId && !serviceId && !handymanId) {
        return res.status(400).json({ error: 'Must provide productId, serviceId, or handymanId' });
    }
    const numRating = parseInt(rating, 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
    }
    try {
        // 1. Verify product purchase if reviewing a product
        if (productId) {
            const orderCount = yield prisma_1.default.order.count({
                where: {
                    userId: authorId,
                    status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] },
                    items: {
                        some: {
                            productId,
                        },
                    },
                },
            });
            if (orderCount === 0) {
                return res.status(403).json({
                    error: 'Forbidden. You can only review products you have purchased.',
                });
            }
        }
        // 2. Verify completed service booking if reviewing a service
        if (serviceId) {
            const bookingCount = yield prisma_1.default.booking.count({
                where: {
                    customerId: authorId,
                    serviceId,
                    status: 'COMPLETED',
                },
            });
            if (bookingCount === 0) {
                return res.status(403).json({
                    error: 'Forbidden. You can only review services you have booked and completed.',
                });
            }
        }
        // 3. Verify completed handyman booking if reviewing a handyman
        if (handymanId) {
            const bookingCount = yield prisma_1.default.booking.count({
                where: {
                    customerId: authorId,
                    handymanId,
                    status: 'COMPLETED',
                },
            });
            if (bookingCount === 0) {
                return res.status(403).json({
                    error: 'Forbidden. You can only review handymen you have booked and completed jobs with.',
                });
            }
        }
        const review = yield prisma_1.default.review.create({
            data: {
                authorId,
                productId,
                serviceId,
                handymanId,
                rating: numRating,
                comment,
            },
        });
        res.status(201).json(review);
    }
    catch (error) {
        next(error);
    }
}));
// Get reviews for a product
router.get('/product/:productId', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { productId } = req.params;
    try {
        const reviews = yield prisma_1.default.review.findMany({
            where: { productId },
            include: { author: { select: { name: true, profileImage: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(reviews);
    }
    catch (error) {
        next(error);
    }
}));
// Get reviews for a handyman
router.get('/handyman/:handymanId', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { handymanId } = req.params;
    try {
        const reviews = yield prisma_1.default.review.findMany({
            where: { handymanId },
            include: { author: { select: { name: true, profileImage: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(reviews);
    }
    catch (error) {
        next(error);
    }
}));
// Get reviews for a service
router.get('/service/:serviceId', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { serviceId } = req.params;
    try {
        const reviews = yield prisma_1.default.review.findMany({
            where: { serviceId },
            include: { author: { select: { name: true, profileImage: true } } },
            orderBy: { createdAt: 'desc' }
        });
        const avg = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;
        res.json({ reviews, averageRating: avg, count: reviews.length });
    }
    catch (error) {
        next(error);
    }
}));
exports.default = router;
