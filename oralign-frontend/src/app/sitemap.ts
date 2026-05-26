import type { MetadataRoute } from 'next';

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://oralign.com.tn';

/**
 * /sitemap.xml
 *
 * Only PUBLIC marketing URLs go here. Authenticated surfaces
 * (/dashboard, /account, /onboarding, …) are intentionally omitted —
 * they're blocked in robots.ts and would just leak product paths.
 *
 * `lastModified: new Date()` flips on every build, so Google sees a
 * fresh "this URL was updated" signal on every deploy and bumps the
 * URL forward in its recrawl queue — the lever that should pull the
 * stale "Nova Studio" cached card down within a few days of the
 * next deploy.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/patient`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/practitioner`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/signup`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ];
}
