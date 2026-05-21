import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converts a backend media path to an absolute URL.
 *
 * The API stores uploaded files as relative paths, but older rows or manual
 * edits may have slightly different shapes (`uploads/...`, `/api/uploads/...`,
 * `avatars/...`). Normalize those variants so avatars keep rendering after
 * refreshes, Docker rebuilds, and profile updates.
 */
export function getAvatarUrl(avatarUrl: string | null | undefined): string {
  const rawUrl = avatarUrl?.trim();
  if (!rawUrl) return '';

  if (
    /^https?:\/\//i.test(rawUrl) ||
    rawUrl.startsWith('blob:') ||
    rawUrl.startsWith('data:')
  ) {
    return rawUrl;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
  const backendOrigin = apiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
  const normalizedPath = rawUrl
    .replace(/^\/+/, '')
    .replace(/^api\/uploads\//i, 'uploads/')
    .replace(/^avatars\//i, 'uploads/avatars/');

  return `${backendOrigin}/${normalizedPath}`;
}
