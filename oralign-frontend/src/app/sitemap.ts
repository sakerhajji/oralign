import type { MetadataRoute } from 'next';
import { getPublishedPosts } from './(showcase)/patient/blog/_lib/fetch';

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://oralign.com.tn';

/**
 * /sitemap.xml
 *
 * Only PUBLIC marketing URLs go here. Authenticated surfaces
 * (/dashboard, /account, /onboarding, …) are intentionally omitted —
 * they're blocked in robots.ts and would just leak product paths.
 *
 * The public site is the patient website served at "/". Published blog
 * posts (both patient- and practitioner-authored — the blog is unified)
 * are appended dynamically under the single /patient/blog path. The fetch
 * fails SOFT: if the API is unreachable the sitemap still ships every
 * static marketing route.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/trouver-un-praticien`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/patient/blog`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
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

  // The single public blog serves every published post (no audience filter),
  // all mounted under /patient/blog/<slug>. Fails soft to an empty list.
  const { posts } = await getPublishedPosts({ page: 1, limit: 1000 });

  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/patient/blog/${post.slug}`,
    lastModified: post.publishedAt ? new Date(post.publishedAt) : now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...blogRoutes];
}
