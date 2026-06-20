import { Router } from 'express';
import multer from 'multer';
import Jimp from 'jimp';
import path from 'path';
import fs from 'fs';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname  = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only images (jpg, jpeg, png, gif, webp) are allowed!'));
  },
});

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

    // Step 2: Apply chosen AI Visual Filter
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

    // Step 3: Output format — PNG preserves transparency, JPEG does not
    const outputMime = removeBg ? Jimp.MIME_PNG : Jimp.MIME_JPEG;
    const outputExt  = removeBg ? 'png' : 'jpg';
    const SIZE_LIMIT = 50 * 1024;
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
    } while (finalBuffer.length > SIZE_LIMIT && currentQuality > 10 && iterations < 10);

    const filename = `img_${Date.now()}_${Math.floor(Math.random() * 10000)}.${outputExt}`;
    const destPath = path.join(uploadsDir, filename);
    await fs.promises.writeFile(destPath, finalBuffer);

    const host     = req.get('host') || 'localhost:5000';
    const imageUrl = `http://${host}/uploads/${filename}`;

    res.status(201).json({
      success: true,
      imageUrl,
      filename,
      removedBg: removeBg,
      sizeBytes: finalBuffer.length,
      sizeKB: `${(finalBuffer.length / 1024).toFixed(2)} KB`,
    });
  } catch (error) {
    console.error('[UploadService] Processing failed:', error);
    res.status(500).json({ error: 'Image processing or compression failed.' });
  }
});

export default router;
