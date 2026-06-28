import { Router } from 'express';
import multer from 'multer';
import Jimp from 'jimp';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// ── Cloudinary configuration ────────────────────────────────────────────────
// Falls back to local-disk mode when CLOUDINARY_CLOUD_NAME is not set,
// so local development continues to work without Cloudinary credentials.
const CLOUDINARY_ENABLED =
  !!(process.env.CLOUDINARY_CLOUD_NAME &&
     process.env.CLOUDINARY_API_KEY &&
     process.env.CLOUDINARY_API_SECRET);

if (CLOUDINARY_ENABLED) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key:    process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
    secure:     true,
  });
  console.log('[Upload] Cloudinary storage: enabled');
} else {
  console.warn('[Upload] CLOUDINARY_* env vars not set — falling back to local disk (dev only)');
}

// ── Multer — keep file in memory for processing ─────────────────────────────
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype  = filetypes.test(file.mimetype);
    const extname   = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only images (jpg, jpeg, png, gif, webp) are allowed!'));
  },
});

// ── Local-disk fallback (dev only) ──────────────────────────────────────────
import fs from 'fs';

const uploadsDir = path.join(__dirname, '../../uploads');
if (!CLOUDINARY_ENABLED && !fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Remove near-white background pixels by scanning every pixel.
 * Pixels where R, G, B are all above `threshold` become fully transparent.
 */
function removeBackground(image: Jimp, threshold = 220): Jimp {
  image.scan(0, 0, image.getWidth(), image.getHeight(), function (this: any, x: number, y: number, idx: number) {
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
function uploadToCloudinary(
  buffer: Buffer,
  options: { folder?: string; public_id?: string; resource_type?: 'image' }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:        options.folder        ?? 'fixmart/uploads',
        public_id:     options.public_id,
        resource_type: options.resource_type ?? 'image',
        // Cloudinary will auto-detect format from the buffer
        overwrite:     false,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload returned no result'));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// ── POST /api/upload ─────────────────────────────────────────────────────────
router.post('/', authenticateToken, upload.single('image') as any, async (req: AuthRequest, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  const filter   = (req.body.filter || 'none').toLowerCase();
  const removeBg = req.body.removeBg === 'true' || req.body.removeBg === true;

  try {
    let image = await Jimp.read(req.file.buffer);

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
          { apply: 'blue' as any,  params: [25]  },
          { apply: 'red' as any,   params: [10]  },
          { apply: 'green' as any, params: [-10] },
        ]).contrast(0.12);
        break;
      case 'vintage':
        image.greyscale().contrast(0.20);
        break;
      case 'golden':
        image.color([
          { apply: 'red' as any,   params: [20]  },
          { apply: 'green' as any, params: [8]   },
          { apply: 'blue' as any,  params: [-15] },
        ]).contrast(0.05);
        break;
      case 'vivid':
        image.color([{ apply: 'saturate' as any, params: [35] }]).contrast(0.10);
        break;
      default:
        break;
    }

    // Step 3: Compress and determine output format
    // PNG preserves transparency (needed after bg removal); JPEG for everything else
    const outputMime = removeBg ? Jimp.MIME_PNG : Jimp.MIME_JPEG;
    const SIZE_LIMIT = 50 * 1024;   // 50 KB
    let currentWidth   = 800;
    let currentQuality = 80;
    let finalBuffer: Buffer;
    let iterations = 0;

    if (image.getWidth() > currentWidth) {
      image.resize(currentWidth, Jimp.AUTO);
    }

    do {
      iterations++;
      finalBuffer = await image.quality(currentQuality).getBufferAsync(outputMime);
      console.log(`[UploadCompressor] Iteration ${iterations}: ${(finalBuffer.length / 1024).toFixed(1)}KB, w=${image.getWidth()}, q=${currentQuality}`);
      if (finalBuffer.length > SIZE_LIMIT) {
        currentQuality -= 15;
        currentWidth    = Math.max(250, Math.round(currentWidth * 0.8));
        image.resize(currentWidth, Jimp.AUTO);
      }
    } while (finalBuffer!.length > SIZE_LIMIT && currentQuality > 10 && iterations < 10);

    let imageUrl: string;
    const publicId = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    if (CLOUDINARY_ENABLED) {
      // ── Cloudinary path ─────────────────────────────────────────────────
      console.log('[UploadService] Uploading to Cloudinary...');
      imageUrl = await uploadToCloudinary(finalBuffer!, { public_id: publicId });
      console.log(`[UploadService] Cloudinary URL: ${imageUrl}`);
    } else {
      // ── Local-disk fallback (dev only) ───────────────────────────────────
      const outputExt = removeBg ? 'png' : 'jpg';
      const filename  = `${publicId}.${outputExt}`;
      const destPath  = path.join(uploadsDir, filename);
      await fs.promises.writeFile(destPath, finalBuffer!);

      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const host     = req.get('host') || 'localhost:5000';
      imageUrl       = `${protocol}://${host}/uploads/${filename}`;
    }

    res.status(201).json({
      success:   true,
      imageUrl,
      removedBg: removeBg,
      sizeBytes: finalBuffer!.length,
      sizeKB:    `${(finalBuffer!.length / 1024).toFixed(2)} KB`,
      storage:   CLOUDINARY_ENABLED ? 'cloudinary' : 'local',
    });
  } catch (error) {
    console.error('[UploadService] Processing failed:', error);
    res.status(500).json({ error: 'Image processing or upload failed.' });
  }
});

export default router;
