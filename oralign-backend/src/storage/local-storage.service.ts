import { Injectable } from '@nestjs/common';
import { StorageService } from './storage.interface';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { PROCESSABLE_IMAGE_MIMES } from '../media/media.constants';

/**
 * Avatars are rendered at 28-40px all over the app but phones upload
 * 3-5 MB photos. They're small enough (≤5 MB cap) to downscale
 * SYNCHRONOUSLY at upload — one ~100 ms sharp call replaces megabytes
 * on every subsequent page view, and no variant bookkeeping is needed
 * because the stored file IS the optimized one.
 */
const AVATAR_MAX_DIM = 512;
const AVATAR_WEBP_QUALITY = 82;

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads');

  constructor() {
    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    folder = 'avatars',
    options?: {
      /**
       * Downscale + recompress to WebP before writing (avatars). Off
       * by default — company logos keep their originals because they
       * get embedded in generated PDFs at print resolution.
       */
      optimizeImage?: boolean;
    },
  ): Promise<string> {
    const folderPath = path.join(this.uploadDir, folder);

    // Ensure folder exists
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    if (options?.optimizeImage && PROCESSABLE_IMAGE_MIMES.has(file.mimetype)) {
      try {
        const optimized = await sharp(file.buffer, { failOn: 'none' })
          .rotate() // bake EXIF orientation (and drop EXIF/GPS metadata)
          .resize({
            width: AVATAR_MAX_DIM,
            height: AVATAR_MAX_DIM,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: AVATAR_WEBP_QUALITY })
          .toBuffer();
        const filename = `${uuidv4()}.webp`;
        await fs.promises.writeFile(path.join(folderPath, filename), optimized);
        return `/uploads/${folder}/${filename}`;
      } catch {
        // Undecodable image (e.g. HEIC) — fall through and store the
        // original byte-for-byte, exactly like before.
      }
    }

    // Generate unique filename
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    const filePath = path.join(folderPath, filename);

    // Write file
    await fs.promises.writeFile(filePath, file.buffer);

    // Return the public URL
    return `/uploads/${folder}/${filename}`;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    if (!fileUrl || !fileUrl.startsWith('/uploads/')) {
      return;
    }

    const filePath = path.join(process.cwd(), fileUrl);

    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  }
}
