import { Logger } from '@nestjs/common';
import { env } from './env';
import { ForbiddenException } from '../exceptions/app.exception';

/**
 * The browser-origin allowlist, computed ONCE and shared by the HTTP layer
 * (main.ts `enableCors`) and every Socket.IO gateway. Before this the
 * gateways declared `cors: { origin: true }` — i.e. reflect any Origin —
 * while HTTP had a strict allowlist that fails closed in production. Two
 * CORS policies for one API is exactly the kind of drift that turns into
 * a security finding; now there is one.
 *
 * Production: FRONTEND_URL (+ CORS_ORIGINS) only.
 * Dev: also the usual loopback dev ports.
 *
 * Loopback equivalence: `localhost`, `127.0.0.1` and `[::1]` are the same
 * machine but CORS matches the Origin STRING, so allowing only
 * http://localhost:3001 used to reject http://127.0.0.1:3001 and every
 * API call died with an opaque network error. A loopback origin expands
 * to all three hosts.
 *
 * www equivalence, same reasoning: the frontend answers on both
 * oralign.com.tn and www.oralign.com.tn, but FRONTEND_URL names only one.
 * A doctor who typed the `www.` form had EVERY request refused — the
 * browser reported a network error and the app blamed the backend. A
 * public origin now admits its www / bare twin. nginx redirects www to
 * the bare host as well; this is the belt to that suspender.
 */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function expandOriginEquivalents(origin: string): string[] {
  try {
    const u = new URL(origin);
    const port = u.port ? `:${u.port}` : '';
    if (LOOPBACK_HOSTS.includes(u.hostname)) {
      return LOOPBACK_HOSTS.map((host) => `${u.protocol}//${host}${port}`);
    }
    const bare = u.hostname.replace(/^www\./i, '');
    return [bare, `www.${bare}`].map((host) => `${u.protocol}//${host}${port}`);
  } catch {
    return [origin];
  }
}

const devOrigins = env.isProd
  ? []
  : ['http://localhost:3001', 'http://localhost:3000', 'http://localhost:5173'];

export const allowedOrigins: readonly string[] = Array.from(
  new Set(
    [env.frontendUrl, ...env.corsOrigins, ...devOrigins].flatMap(
      expandOriginEquivalents,
    ),
  ),
);

if (allowedOrigins.length === 0 && env.isProd) {
  throw new Error(
    '[security] CORS_ORIGINS or FRONTEND_URL must be set in production',
  );
}

const logger = new Logger('CORS');
const reported = new Set<string>();

/**
 * Origin check shared by HTTP and Socket.IO. Server-to-server callers
 * (curl, uptime probes, the container healthcheck) send no Origin and are
 * allowed; a browser origin must match the allowlist exactly.
 *
 * A refusal is a 403, not the 500 the raw `Error` used to become: it is a
 * policy decision, not a crash, and it must not fill the error log with a
 * stack trace per request. The origin itself is logged once — it is the
 * one fact an operator needs to notice a stray domain, and it is not
 * personal data.
 */
export function checkOrigin(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
  if (!reported.has(origin)) {
    reported.add(origin);
    logger.warn(`Origin refused by CORS allowlist: ${origin}`);
  }
  cb(new ForbiddenException(`Origin ${origin} is not allowed.`));
}

/** Socket.IO `cors` option sharing the same allowlist. */
export const socketCors = {
  origin: checkOrigin,
  credentials: true,
};
