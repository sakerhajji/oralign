import type { MetadataRoute } from 'next';
import { getPublishedPosts } from './(showcase)/blog/_lib/fetch';
import { absoluteUrl, SITE_URL } from './(showcase)/_lib/seo/meta';
import {
  MARKETING_PAGES,
  MARKETING_PAGE_KEYS,
  PAGE_LANGS,
  pathFor,
  type MarketingPageKey,
} from './(showcase)/_lib/seo/routes';
import { resolveBlogMediaUrl } from '@/lib/api/blog.service';

/**
 * /sitemap.xml
 *
 * Only PUBLIC, INDEXABLE URLs belong here. Deliberately absent:
 *  - authenticated surfaces (/dashboard, /account, /onboarding, …) —
 *    blocked in robots.ts and noindexed;
 *  - auth pages (/login, /signup, …) — crawlable but noindexed, and a
 *    sitemap must never list URLs it doesn't want indexed;
 *  - /shop — placeholder page, noindexed until it has real content;
 *  - "/" and "/en", "/ar" — they 308 to the localized homes, and a
 *    sitemap lists canonical targets, never redirects.
 *
 * Every marketing page ships in its three language versions, each entry
 * carrying the full hreflang set (Google reads sitemap alternates as
 * first-class hreflang annotations). Blog posts are appended dynamically;
 * the fetch fails SOFT so the sitemap still ships if the API is down.
 */

type Alternates = { languages: Record<string, string> };

function marketingAlternates(key: MarketingPageKey): Alternates {
  const langs = PAGE_LANGS[key];
  const fr = absoluteUrl(pathFor(key, 'fr'));
  const languages: Record<string, string> = { fr, 'fr-TN': fr };
  if (langs.includes('en')) languages.en = absoluteUrl(pathFor(key, 'en'));
  if (langs.includes('ar')) {
    languages.ar = absoluteUrl(pathFor(key, 'ar'));
    languages['ar-TN'] = absoluteUrl(pathFor(key, 'ar'));
  }
  languages['x-default'] = fr;
  return { languages };
}

/** Ranking intent per page: how hard we want each surface pushed. */
const PAGE_RANK: Record<
  MarketingPageKey,
  { priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly' }
> = {
  home: { priority: 1.0, changeFrequency: 'weekly' },
  practitioners: { priority: 0.9, changeFrequency: 'monthly' },
  cases: { priority: 0.8, changeFrequency: 'monthly' },
  finder: { priority: 0.8, changeFrequency: 'monthly' },
  guide: { priority: 0.7, changeFrequency: 'monthly' },
  community: { priority: 0.6, changeFrequency: 'weekly' },
  about: { priority: 0.5, changeFrequency: 'yearly' },
  contact: { priority: 0.5, changeFrequency: 'yearly' },
};

// Legal / compliance surfaces. Low priority but they MUST be crawlable:
// payment providers check that they resolve publicly. FR-only.
const LEGAL_PAGES = [
  '/mentions-legales',
  '/politique-confidentialite',
  '/conditions-utilisation',
  '/conditions-vente',
  '/reclamations-remboursements',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const marketingRoutes: MetadataRoute.Sitemap = MARKETING_PAGE_KEYS.flatMap((key) => {
    const rank = PAGE_RANK[key];
    const alternates = marketingAlternates(key);
    return PAGE_LANGS[key].map((lang) => ({
      url: absoluteUrl(MARKETING_PAGES[key][lang].path),
      lastModified: now,
      changeFrequency: rank.changeFrequency,
      priority: lang === 'fr' ? rank.priority : Math.max(rank.priority - 0.1, 0.1),
      alternates,
    }));
  });

  const legalRoutes: MetadataRoute.Sitemap = LEGAL_PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'yearly',
    priority: 0.3,
  }));

  const blogIndex: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/blog`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ];

  // The single public blog serves every published post (no audience
  // filter), all mounted under /blog/<slug>. Fails soft to an empty list.
  const { posts } = await getPublishedPosts({ page: 1, limit: 1000 });

  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => {
    const cover = post.cover?.lgUrl ?? post.cover?.mdUrl ?? post.cover?.url;
    const coverAbs = cover ? resolveBlogMediaUrl(cover) : null;
    return {
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.publishedAt ? new Date(post.publishedAt) : now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
      ...(coverAbs ? { images: [coverAbs] } : {}),
    };
  });

  return [...marketingRoutes, ...legalRoutes, ...blogIndex, ...blogRoutes];
}
