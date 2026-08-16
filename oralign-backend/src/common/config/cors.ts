import { env } from './env';

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
 * to all three hosts; real domains pass through untouched.
 */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

function expandLoopback(origin: string): string[] {
  try {
    const u = new URL(origin);
    if (!LOOPBACK_HOSTS.includes(u.hostname)) return [origin];
    const port = u.port ? `:${u.port}` : '';
    return LOOPBACK_HOSTS.map((host) => `${u.protocol}//${host}${port}`);
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
      expandLoopback,
    ),
  ),
);

if (allowedOrigins.length === 0 && env.isProd) {
  throw new Error(
    '[security] CORS_ORIGINS or FRONTEND_URL must be set in production',
  );
}

/**
 * Socket.IO `cors` option sharing the same allowlist. Server-to-server
 * clients send no Origin and are allowed (same rule as HTTP).
 */
export const socketCors = {
  origin: (
    origin: string | undefined,
    cb: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} is not allowed`));
  },
  credentials: true,
};
