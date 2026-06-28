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
const cloudinary_1 = require("cloudinary");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// ── Cloudinary configuration ────────────────────────────────────────────────
// Falls back to local-disk mode when CLOUDINARY_CLOUD_NAME is not set,
// so local development continues to work without Cloudinary credentials.
const CLOUDINARY_ENABLED = !!(process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET);
if (CLOUDINARY_ENABLED) {
    cloudinary_1.v2.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
    });
    console.log('[Upload] Cloudinary storage: enabled');
}
else {
    console.warn('[Upload] CLOUDINARY_* env vars not set — falling back to local disk (dev only)');
}
// ── Multer — keep file in memory for processing ─────────────────────────────
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
// ── Local-disk fallback (dev only) ──────────────────────────────────────────
const fs_1 = __importDefault(require("fs"));
const uploadsDir = path_1.default.join(__dirname, '../../uploads');
if (!CLOUDINARY_ENABLED && !fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
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
/**
 * Upload a buffer to Cloudinary using an upload_stream.
 * Returns the secure URL of the uploaded image.
 */
function uploadToCloudinary(buffer, options) {
    return new Promise((resolve, reject) => {
        var _a, _b;
        const stream = cloudinary_1.v2.uploader.upload_stream({
            folder: (_a = options.folder) !== null && _a !== void 0 ? _a : 'fixmart/uploads',
            public_id: options.public_id,
            resource_type: (_b = options.resource_type) !== null && _b !== void 0 ? _b : 'image',
            // Cloudinary will auto-detect format from the buffer
            overwrite: false,
        }, (error, result) => {
            if (error || !result)
                return reject(error !== null && error !== void 0 ? error : new Error('Cloudinary upload returned no result'));
            resolve(result.secure_url);
        });
        stream.end(buffer);
    });
}
// ── POST /api/upload ─────────────────────────────────────────────────────────
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
        // Step 2: Apply chosen visual filter
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
        // Step 3: Compress and determine output format
        // PNG preserves transparency (needed after bg removal); JPEG for everything else
        const outputMime = removeBg ? jimp_1.default.MIME_PNG : jimp_1.default.MIME_JPEG;
        const SIZE_LIMIT = 50 * 1024; // 50 KB
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
        let imageUrl;
        const publicId = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        if (CLOUDINARY_ENABLED) {
            // ── Cloudinary path ─────────────────────────────────────────────────
            console.log('[UploadService] Uploading to Cloudinary...');
            imageUrl = yield uploadToCloudinary(finalBuffer, { public_id: publicId });
            console.log(`[UploadService] Cloudinary URL: ${imageUrl}`);
        }
        else {
            // ── Local-disk fallback (dev only) ───────────────────────────────────
            const outputExt = removeBg ? 'png' : 'jpg';
            const filename = `${publicId}.${outputExt}`;
            const destPath = path_1.default.join(uploadsDir, filename);
            yield fs_1.default.promises.writeFile(destPath, finalBuffer);
            const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
            const host = req.get('host') || 'localhost:5000';
            imageUrl = `${protocol}://${host}/uploads/${filename}`;
        }
        res.status(201).json({
            success: true,
            imageUrl,
            removedBg: removeBg,
            sizeBytes: finalBuffer.length,
            sizeKB: `${(finalBuffer.length / 1024).toFixed(2)} KB`,
            storage: CLOUDINARY_ENABLED ? 'cloudinary' : 'local',
        });
    }
    catch (error) {
        console.error('[UploadService] Processing failed:', error);
        res.status(500).json({ error: 'Image processing or upload failed.' });
    }
}));
exports.default = router;
