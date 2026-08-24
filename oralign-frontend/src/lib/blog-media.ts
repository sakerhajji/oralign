/**
 * Resolve an API-stored blog media path to a URL usable by browser and server
 * rendering alike. Keep this dependency-free so metadata routes such as the
 * sitemap can use it without importing the Axios blog client.
 */
export function resolveBlogMediaUrl(
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
  const apiOrigin = apiUrl.replace(/\/api\/?$/, '');
  return `${apiOrigin}${path.startsWith('/') ? '' : '/'}${path}`;
}
