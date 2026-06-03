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
// Get all settings as a key-value object
router.get('/', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settings = yield prisma_1.default.appSetting.findMany();
        const settingsObj = settings.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});
        res.json(settingsObj);
    }
    catch (error) {
        next(error);
    }
}));
// Update settings (Admin only)
router.put('/', auth_1.authenticateToken, (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }
    const updates = req.body; // Expecting { key: value, key2: value2 }
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        return res.status(400).json({ error: 'Invalid settings payload. Expected a key-value object.' });
    }
    try {
        const prismaTxCalls = Object.entries(updates).map(([key, value]) => {
            return prisma_1.default.appSetting.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) },
            });
        });
        yield prisma_1.default.$transaction(prismaTxCalls);
        res.json({ message: 'Settings updated successfully', settings: updates });
    }
    catch (error) {
        next(error);
    }
}));
exports.default = router;
