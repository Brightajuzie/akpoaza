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
const multer_1 = __importDefault(require("multer"));
const jimp_1 = __importDefault(require("jimp"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Ensure uploads folder exists
const uploadsDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path_1.default.extname(file.originalname).toLowerCase());
        if (mimetype && extname)
            return cb(null, true);
        cb(new Error('Only images (jpg, jpeg, png, gif, webp) are allowed!'));
    },
});
/**
 * Remove near-white background pixels by scanning every pixel.
 * Pixels where R, G, B are all above `threshold` become fully transparent.
 */
function removeBackground(image, threshold = 220) {
    image.scan(0, 0, image.getWidth(), image.getHeight(), function (x, y, idx) {
        const r = this.bitmap.data[idx + 0];
        const g = this.bitmap.data[idx + 1];
        const b = this.bitmap.data[idx + 2];
        if (r > threshold && g > threshold && b > threshold) {
            this.bitmap.data[idx + 3] = 0; // make transparent
        }
    });
    return image;
}
router.post('/', auth_1.authenticateToken, upload.single('image'), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' });
    }
    const filter = (req.body.filter || 'none').toLowerCase();
    const removeBg = req.body.removeBg === 'true' || req.body.removeBg === true;
    try {
        let image = yield jimp_1.default.read(req.file.buffer);
        // Step 1: Background removal (before filters for clean edges)
        if (removeBg) {
            console.log('[UploadService] Removing background...');
            image = removeBackground(image, 220);
        }
        // Step 2: Apply chosen AI Visual Filter
        console.log(`[UploadService] Applying filter: ${filter}`);
        switch (filter) {
            case 'auto':
                image.normalize().contrast(0.08).brightness(0.02);
                break;
            case 'cyberpunk':
                image.color([
                    { apply: 'blue', params: [25] },
                    { apply: 'red', params: [10] },
                    { apply: 'green', params: [-10] },
                ]).contrast(0.12);
                break;
            case 'vintage':
                image.greyscale().contrast(0.20);
                break;
            case 'golden':
                image.color([
                    { apply: 'red', params: [20] },
                    { apply: 'green', params: [8] },
                    { apply: 'blue', params: [-15] },
                ]).contrast(0.05);
                break;
            case 'vivid':
                image.color([{ apply: 'saturate', params: [35] }]).contrast(0.10);
                break;
            default:
                break;
        }
        // Step 3: Output format — PNG preserves transparency, JPEG does not
        const outputMime = removeBg ? jimp_1.default.MIME_PNG : jimp_1.default.MIME_JPEG;
        const outputExt = removeBg ? 'png' : 'jpg';
        const SIZE_LIMIT = 50 * 1024;
        let currentWidth = 800;
        let currentQuality = 80;
        let finalBuffer;
        let iterations = 0;
        if (image.getWidth() > currentWidth) {
            image.resize(currentWidth, jimp_1.default.AUTO);
        }
        do {
            iterations++;
            finalBuffer = yield image.quality(currentQuality).getBufferAsync(outputMime);
            console.log(`[UploadCompressor] Iteration ${iterations}: ${(finalBuffer.length / 1024).toFixed(1)}KB, w=${image.getWidth()}, q=${currentQuality}`);
            if (finalBuffer.length > SIZE_LIMIT) {
                currentQuality -= 15;
                currentWidth = Math.max(250, Math.round(currentWidth * 0.8));
                image.resize(currentWidth, jimp_1.default.AUTO);
            }
        } while (finalBuffer.length > SIZE_LIMIT && currentQuality > 10 && iterations < 10);
        const filename = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}.${outputExt}`;
        const destPath = path_1.default.join(uploadsDir, filename);
        yield fs_1.default.promises.writeFile(destPath, finalBuffer);
        const host = req.get('host') || 'localhost:5000';
        const imageUrl = `http://${host}/uploads/${filename}`;
        res.status(201).json({
            success: true,
            imageUrl,
            filename,
            removedBg: removeBg,
            sizeBytes: finalBuffer.length,
            sizeKB: `${(finalBuffer.length / 1024).toFixed(2)} KB`,
        });
    }
    catch (error) {
        console.error('[UploadService] Processing failed:', error);
        res.status(500).json({ error: 'Image processing or compression failed.' });
    }
}));
exports.default = router;
