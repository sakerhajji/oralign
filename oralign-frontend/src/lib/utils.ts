import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converts a relative backend path (e.g. /uploads/avatars/x.jpg) to an
 * absolute URL by prepending the backend origin.
 * Data URIs and already-absolute URLs are returned unchanged.
 */
export function getAvatarUrl(avatarUrl: string | null | undefined): string {
  if (!avatarUrl) return '';
  if (
    avatarUrl.startsWith('http') ||
    avatarUrl.startsWith('blob:') ||
    avatarUrl.startsWith('data:')
  ) {
    return avatarUrl;
  }
  // Strip the trailing /api segment from NEXT_PUBLIC_API_URL to get the origin.
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
  const backendOrigin = apiUrl.replace(/\/api\/?$/, '');
  return `${backendOrigin}${avatarUrl}`;
}
