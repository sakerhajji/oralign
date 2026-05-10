export interface StorageService {
  uploadFile(file: Express.Multer.File, folder?: string): Promise<string>;
  deleteFile(fileUrl: string): Promise<void>;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';
