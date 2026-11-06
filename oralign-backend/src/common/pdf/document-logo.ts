import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
/** The official ORALIGN logo, shipped with the app (the order sheet wears it too). */
const OFFICIAL_LOGO_PATH = path.join(process.cwd(), 'assets', 'app-logo.svg');
/** The billing settings refuse a bigger upload (company-billing-settings.controller). */
const MAX_LOGO_BYTES = 4 * 1024 * 1024;
/** SVG uploads are refused by the settings: an uploaded logo is a raster image. */
const RASTER_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export interface DocumentLogo {
  /** A data: URL, so the PDF renderer never fetches anything. */
  dataUrl: string;
  /** Where it came from: the billing settings upload, or the shipped logo. */
  source: 'settings' | 'official';
}

/**
 * The logo a generated document wears: the one uploaded in the billing
 * settings (Paramètres de facturation → Logo) when it can be read, else
 * the official ORALIGN logo, so a document is always branded even before
 * an admin uploads one.
 */
export function documentLogo(
  uploadedPath: string | null | undefined,
): DocumentLogo | null {
  const uploaded = uploadedImageDataUrl(uploadedPath);
  if (uploaded) return { dataUrl: uploaded, source: 'settings' };
  const official = officialLogoDataUrl();
  return official ? { dataUrl: official, source: 'official' } : null;
}

/**
 * An uploaded raster image (a path relative to uploads/, as the billing
 * settings store it) as a data URL; null when missing, unreadable, too
 * large, not a PNG/JPEG/WebP, or outside uploads/.
 */
export function uploadedImageDataUrl(
  relPath: string | null | undefined,
): string | null {
  if (!relPath || path.isAbsolute(relPath)) return null;
  const root = path.resolve(UPLOAD_ROOT);
  const abs = path.resolve(root, relPath);
  const relative = path.relative(root, abs);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  const mime = RASTER_MIME[path.extname(abs).toLowerCase()];
  if (!mime) return null;
  try {
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > MAX_LOGO_BYTES) return null;
    return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
  } catch {
    return null;
  }
}

let officialLogoCache: string | null | undefined;

/** The shipped ORALIGN logo as a data URL, read once. */
export function officialLogoDataUrl(): string | null {
  if (officialLogoCache !== undefined) return officialLogoCache;
  try {
    const svg = fs.readFileSync(OFFICIAL_LOGO_PATH);
    officialLogoCache = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  } catch {
    officialLogoCache = null;
  }
  return officialLogoCache;
}
