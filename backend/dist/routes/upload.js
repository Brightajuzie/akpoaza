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
// Multer memory storage configuration (we process in-memory buffers directly)
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // max 10MB input file
    },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path_1.default.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only images (jpg, jpeg, png, gif, webp) are allowed!'));
    },
});
router.post('/', auth_1.authenticateToken, upload.single('image'), (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' });
    }
    const filter = (req.body.filter || 'none').toLowerCase();
    try {
        // 1. Load image into Jimp
        let image = yield jimp_1.default.read(req.file.buffer);
        // 2. Apply chosen AI Visual Filter
        console.log(`[UploadService] Applying filter: ${filter}`);
        switch (filter) {
            case 'auto': // AI Auto-Enhance
                image.normalize();
                image.contrast(0.08);
                image.brightness(0.02);
                break;
            case 'cyberpunk': // Cyberpunk Neon (Cool Blue & Pink hues)
                image.color([
                    { apply: 'blue', params: [25] },
                    { apply: 'red', params: [10] },
                    { apply: 'green', params: [-10] }
                ]);
                image.contrast(0.12);
                break;
            case 'vintage': // Vintage Noir (Black & White high contrast)
                image.greyscale();
                image.contrast(0.20);
                break;
            case 'golden': // Golden Hour (Warm amber tones)
                image.color([
                    { apply: 'red', params: [20] },
                    { apply: 'green', params: [8] },
                    { apply: 'blue', params: [-15] }
                ]);
                image.contrast(0.05);
                break;
            case 'vivid': // Vivid HDR (High saturation, strong colors)
                image.color([
                    { apply: 'saturate', params: [35] }
                ]);
                image.contrast(0.10);
                break;
            default:
                // 'none' or unknown filter: keep original colors
                break;
        }
        // 3. Compression Loop - Resize and compress recursively until size < 50KB
        const SIZE_LIMIT = 50 * 1024; // 50KB
        let currentWidth = 800; // Start width
        let currentQuality = 80; // Start quality percentage
        let finalBuffer;
        let iterations = 0;
        // Set starting dimensions if the image is wider than 800px
        if (image.getWidth() > currentWidth) {
            image.resize(currentWidth, jimp_1.default.AUTO);
        }
        do {
            iterations++;
            // Apply current quality settings
            finalBuffer = yield image.quality(currentQuality).getBufferAsync(jimp_1.default.MIME_JPEG);
            console.log(`[UploadCompressor] Iteration ${iterations}: size=${(finalBuffer.length / 1024).toFixed(2)}KB, width=${image.getWidth()}px, quality=${currentQuality}`);
            // If buffer is still too large, shrink dimensions and quality
            if (finalBuffer.length > SIZE_LIMIT) {
                currentQuality -= 15;
                currentWidth = Math.round(currentWidth * 0.8);
                if (currentWidth < 250)
                    currentWidth = 250; // clamp minimum width
                image.resize(currentWidth, jimp_1.default.AUTO);
            }
        } while (finalBuffer.length > SIZE_LIMIT && currentQuality > 10 && iterations < 10);
        // 4. Save the finalized buffer to disk
        const filename = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}.jpg`;
        const destPath = path_1.default.join(uploadsDir, filename);
        yield fs_1.default.promises.writeFile(destPath, finalBuffer);
        console.log(`[UploadService] Successfully processed and saved ${filename} (${(finalBuffer.length / 1024).toFixed(2)}KB)`);
        // 5. Construct URL
        const host = req.get('host') || 'localhost:5000';
        const imageUrl = `http://${host}/uploads/${filename}`;
        res.status(201).json({
            success: true,
            imageUrl,
            filename,
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
