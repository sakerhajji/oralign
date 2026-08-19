import type { MetadataRoute } from 'next';
import { getPublishedPosts } from './(showcase)/blog/_lib/fetch';

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://oralign.com.tn';

/**
 * /sitemap.xml
 *
 * Only PUBLIC marketing URLs go here. Authenticated surfaces
 * (/dashboard, /account, /onboarding, …) are intentionally omitted —
 * they're blocked in robots.ts and would just leak product paths.
 *
 * The public site is the patient website served at "/decouvrir". Published blog
 * posts (both patient- and practitioner-authored — the blog is unified)
 * are appended dynamically under the single /blog path. The fetch
 * fails SOFT: if the API is unreachable the sitemap still ships every
 * static marketing route.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Every PUBLIC page, in rough order of how much we want it ranked.
  // Keep this in step with app/(showcase)/**: a page missing here is a
  // page the crawlers have no formal reason to fetch. "/" is deliberately
  // absent — it 308s to /decouvrir, and a sitemap lists canonical targets,
  // never redirects.
  const publicPages: [path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly" | "yearly"][] = [
    ["/decouvrir", 1.0, "weekly"],   // canonical patient homepage
    ["/cas", 0.8, "monthly"],        // treated cases
    ["/trouver-un-praticien", 0.8, "monthly"],
    ["/blog", 0.7, "daily"],
    ["/guide", 0.7, "monthly"],
    ["/shop", 0.7, "weekly"],
    ["/communaute", 0.6, "weekly"],
    ["/qui-sommes-nous", 0.5, "yearly"],
    ["/contact", 0.5, "yearly"],
    ["/signup", 0.5, "yearly"],
    ["/login", 0.4, "yearly"],
    // Legal / compliance surfaces. Low priority but they MUST be
    // crawlable: payment providers check that they resolve publicly.
    ["/mentions-legales", 0.3, "yearly"],
    ["/politique-confidentialite", 0.3, "yearly"],
    ["/conditions-utilisation", 0.3, "yearly"],
    ["/conditions-vente", 0.3, "yearly"],
    ["/reclamations-remboursements", 0.3, "yearly"],
  ];

  const staticRoutes: MetadataRoute.Sitemap = publicPages.map(
    ([path, priority, changeFrequency]) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
    }),
  );

  // The single public blog serves every published post (no audience filter),
  // all mounted under /blog/<slug>. Fails soft to an empty list.
  const { posts } = await getPublishedPosts({ page: 1, limit: 1000 });

  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.publishedAt ? new Date(post.publishedAt) : now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...blogRoutes];
}
