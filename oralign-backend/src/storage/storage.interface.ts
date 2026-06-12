export interface StorageService {
  uploadFile(
    file: Express.Multer.File,
    folder?: string,
    options?: {
      /** Downscale + recompress images at write time (avatars). */
      optimizeImage?: boolean;
    },
  ): Promise<string>;
  deleteFile(fileUrl: string): Promise<void>;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';
