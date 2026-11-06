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
 *    patient viewer, the payment return pages, the API).
 *  - /_next/ is NOT disallowed: it holds every stylesheet, script chunk
 *    and optimised image (/_next/image). Blocking it made Google render
 *    the pages without CSS, JS or photos — mobile-friendliness and image
 *    indexing were judged on a broken page.
 *
 * AI search crawlers get the same rule, spelled out so the policy is a
 * decision and not a default: the site wants to be read and cited by
 * answer engines (ChatGPT search, Perplexity, Claude, Copilot). The
 * training-only agents (GPTBot, Google-Extended, ClaudeBot) are allowed
 * as well — nothing here is private, and being known to the models is
 * part of being found.
 */
const PRIVATE_PATHS = [
  '/api/',
  '/dashboard/',
  '/account/',
  '/onboarding/',
  '/created_for_you/',
  '/payment/',
];

const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Bingbot',
  'Applebot',
  'Applebot-Extended',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
