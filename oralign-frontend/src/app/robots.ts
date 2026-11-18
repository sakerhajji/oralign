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
const ACCOUNT_PATHS = [
  '/api/',
  '/dashboard/',
  '/account/',
  '/onboarding/',
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

/**
 * Apps that build the preview of a link someone shared. They may read a
 * patient link (they only know the ones they are given): it stays noindex,
 * and its HTML holds the common card, never the patient's data, which the
 * page loads in the browser.
 */
const LINK_PREVIEW_BOTS = [
  'facebookexternalhit',
  'Facebot',
  'WhatsApp',
  'TelegramBot',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'Discordbot',
];
const PATIENT_VIEWER_PATH = '/created_for_you/';

export default function robots(): MetadataRoute.Robots {
  const privatePaths = [...ACCOUNT_PATHS, PATIENT_VIEWER_PATH];
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: privatePaths },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: privatePaths },
      {
        userAgent: LINK_PREVIEW_BOTS,
        allow: ['/', PATIENT_VIEWER_PATH],
        disallow: ACCOUNT_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
