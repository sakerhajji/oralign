import { Throttle } from '@nestjs/throttler';

/**
 * Rate-limit envelope for the public, read-only routes the marketing site
 * renders on the server (practitioner directory and profiles, blog, legal
 * info, community stories).
 *
 * Every server-side read of oralign.com.tn reaches the API from ONE address
 * (the Next.js server), so the default buckets (30 req / 10 s, 120 / min,
 * 1 000 / h) are shared by all visitors and crawlers at once: a cold data
 * cache after a deploy plus a Googlebot crawl of the three-language site
 * would trip them and turn public pages into 404s. These routes expose
 * nothing private and are cheap, so they get a wider envelope — still a
 * ceiling, not @SkipThrottle().
 */
export const PublicReadThrottle = () =>
  Throttle({
    short: { limit: 150, ttl: 10_000 },
    medium: { limit: 600, ttl: 60_000 },
    long: { limit: 6_000, ttl: 60 * 60_000 },
  });
