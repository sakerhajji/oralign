import type { MetadataRoute } from 'next';
import { getPublishedPosts } from './(showcase)/practitioner/blog/_lib/fetch';

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
 *
 * Published blog posts are appended dynamically: we fetch the public
 * `/blog/published` endpoint at request/build time and fail SOFT —
 * if the API is unreachable, the sitemap still ships every static
 * marketing route.
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
      url: `${SITE_URL}/practitioner/blog`,
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

  // Pull as many published posts as one page allows; the helper already
  // returns an empty list on any failure, so this never throws.
  const { posts } = await getPublishedPosts({ page: 1, limit: 1000 });
  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/practitioner/blog/${post.slug}`,
    lastModified: post.publishedAt ? new Date(post.publishedAt) : now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...blogRoutes];
}
