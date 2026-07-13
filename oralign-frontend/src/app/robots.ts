import type { MetadataRoute } from 'next';

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://oralign.com.tn';

/**
 * /robots.txt
 *
 * Tells crawlers (Google, Bing, etc.) which paths are fair game and
 * where to find the sitemap. Without this, Google has no formal hook
 * for re-crawling — which is why stale title/description text from a
 * previous deploy (e.g. the "Nova Studio" template card) can linger
 * for weeks in search results.
 *
 * Allow: public marketing surfaces (showcase, login/signup, forgot-
 * password). Disallow: every authenticated area (dashboard, account,
 * onboarding, verify/reset flows, public-link viewer, API). Those
 * shouldn't show up in search and would just leak product surface.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/trouver-un-praticien',
          '/login',
          '/signup',
          '/forgot-password',
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/account/',
          '/onboarding/',
          '/verify-email',
          '/reset-password',
          '/created_for_you/',
          '/qr',
          '/test',
          '/_next/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
