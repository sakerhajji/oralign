/**
 * Typed, validated application configuration — the ONE place that reads
 * `process.env` for application settings.
 *
 * Why this exists: config was read from `process.env` in ~48 call sites with
 * divergent fallbacks. The worst offender was FRONTEND_URL, which defaulted
 * to `http://localhost:3001` in the auth service and to
 * `https://oralign.com.tn` in the mail templates — so one code path could
 * put a localhost link in a production e-mail while another put a prod
 * link in a dev one. Centralising means: one default per setting, one
 * parse per setting, one boot-time validation with a readable error, and
 * a typed object everywhere else (`env.frontendUrl`, not a string key).
 *
 * Deliberately dependency-free (no zod on the backend) and evaluated
 * once at import time. Secrets keep going through `requiredSecret()`,
 * which has the placeholder/length policy; this module covers the rest.
 *
 * Runtime environment DISCOVERY (Puppeteer/Chromium binary probing via
 * CHROME_BIN / CHROMIUM_PATH / LOCALAPPDATA) intentionally stays where it
 * is — that is not configuration, it is the PDF service adapting to the
 * host, and it must remain lazy.
 */

type NodeEnv = 'development' | 'test' | 'production';

function str(name: string, fallback?: string): string | undefined {
  const raw = process.env[name];
  const v = raw === undefined ? undefined : raw.trim();
  return v === undefined || v === '' ? fallback : v;
}

function int(name: string, fallback: number): number {
  const raw = str(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(
      `[config] ${name} must be a non-negative integer, got "${raw}"`,
    );
  }
  return n;
}

function bool(name: string, fallback = false): boolean {
  const raw = str(name);
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

function url(name: string, fallback: string): string {
  const raw = str(name, fallback)!;
  try {
    // Validate shape only; keep the original string (no trailing-slash
    // normalisation surprises for callers that concatenate paths).
    new URL(raw);
  } catch {
    throw new Error(`[config] ${name} must be an absolute URL, got "${raw}"`);
  }
  return raw.replace(/\/+$/, '');
}

const nodeEnvRaw = str('NODE_ENV', 'development')!;
const nodeEnv: NodeEnv =
  nodeEnvRaw === 'production' || nodeEnvRaw === 'test'
    ? nodeEnvRaw
    : 'development';
const isProd = nodeEnv === 'production';

/**
 * In production the public URLs must be explicit — silently defaulting to
 * the marketing domain hides a misconfigured deploy behind "it works on
 * the primary domain". In dev the localhost defaults keep `docker compose
 * up` zero-config.
 */
function requiredInProd(name: string, devFallback: string): string {
  const v = str(name);
  if (v) return v;
  if (isProd) {
    throw new Error(`[config] ${name} is required in production`);
  }
  return devFallback;
}

export const env = Object.freeze({
  nodeEnv,
  isProd,
  isDev: nodeEnv === 'development',

  /** HTTP listen port for the Nest server. */
  httpPort: int('HTTP_PORT', 3000),

  /** Where the Next.js app lives — used for links in e-mails, CORS, CSP
   *  frame-ancestors on /uploads. ONE default, everywhere. */
  frontendUrl: url('FRONTEND_URL', requiredInProd('FRONTEND_URL', 'http://localhost:3001')),
  /** Public base URL of THIS API — used for links that must resolve from
   *  a recipient's mailbox (appointment accept/decline). Optional: the
   *  appointments service warns and skips those links when unset, which
   *  keeps the base docker-compose stack (no API_PUBLIC_URL) bootable.
   *  Falls back to the legacy APP_URL name. */
  apiPublicUrl: (() => {
    const v = str('API_PUBLIC_URL') ?? str('APP_URL');
    return v ? url('API_PUBLIC_URL', v) : undefined;
  })(),

  /** Extra CORS origins (comma-separated) on top of frontendUrl. */
  corsOrigins: (str('CORS_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** Swagger UI is on in dev, opt-in in production. */
  swaggerEnabled: bool('ENABLE_SWAGGER', !isProd),

  redis: {
    host: str('REDIS_HOST', 'localhost')!,
    port: int('REDIS_PORT', 6379),
    password: str('REDIS_PASSWORD'),
  },

  mail: {
    host: str('MAIL_HOST'),
    port: int('MAIL_PORT', 587),
    user: str('MAIL_USER'),
    password: str('MAIL_PASSWORD'),
    from: str('MAIL_FROM'),
    fromName: str('MAIL_FROM_NAME', 'Oralign')!,
    replyTo: str('MAIL_REPLY_TO'),
    logoUrl: str('MAIL_LOGO_URL'),
    /** True when the transport can be built at all. MailService logs and
     *  no-ops when false instead of crashing feature flows. */
    get configured(): boolean {
      return !!(this.host && this.user && this.password);
    },
  },

  payments: {
    /** Dev/QA knob: honour X-Mock-Outcome on the mock gateway. */
    mockControllable: bool('MOCK_PAYMENT_CONTROLLABLE', false),
    /** Explicit opt-in to let the mock gateway "succeed" in production. */
    allowMockInProduction: bool('ALLOW_MOCK_PAYMENTS', false),
  },

  /** Optional embedded Arabic font for PDFs (Puppeteer). */
  arabicFontPath: str('ORALIGN_ARABIC_FONT_PATH'),
});

export type Env = typeof env;
