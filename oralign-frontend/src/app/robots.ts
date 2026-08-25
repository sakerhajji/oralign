import type { MetadataRoute } from 'next';
import { SITE_URL } from './(showcase)/_lib/seo/meta';

/**
 * /robots.txt
 *
 * One wildcard rule for every crawler (Google, Bing, Yandex, DuckDuckGo,
 * …): the public marketing site is fully crawlable, the authenticated
 * product surfaces are not. Two deliberate subtleties:
 *
 *  - /login, /signup and the other auth pages are NOT disallowed even
 *    though we don't want them indexed: their meta robots noindex only
 *    works if crawlers are allowed to fetch the page and read it.
 *    Disallowing them here would freeze whatever Google already has.
 *  - The disallowed prefixes are the surfaces that leak product paths
 *    or are plain private (dashboard, account, onboarding, the tokened
 *    patient viewer, the API).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/account/',
          '/onboarding/',
          '/created_for_you/',
          '/qr',
          '/_next/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
