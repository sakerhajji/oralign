import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { ApiErrorResponse } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// Token management utilities
const TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

// SECURITY (audit L-3): mark the mirror cookie Secure whenever the app is
// served over HTTPS, so it is never sent over a plaintext connection. It
// stays non-HttpOnly by necessity (this is a JS-set mirror the middleware
// reads); the real hardening — moving the refresh token to an HttpOnly
// cookie — is tracked separately.
const cookieSecure = (): string =>
  typeof location !== 'undefined' && location.protocol === 'https:'
    ? '; Secure'
    : '';

const setAccessTokenCookie = (accessToken: string): void => {
  if (typeof document === 'undefined') return;
  document.cookie = `accessToken=${encodeURIComponent(accessToken)}; Path=/; SameSite=Lax${cookieSecure()}`;
};

const clearAccessTokenCookie = (): void => {
  if (typeof document === 'undefined') return;
  document.cookie = `accessToken=; Path=/; Max-Age=0; SameSite=Lax${cookieSecure()}`;
};

export const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const getRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

export const setTokens = (accessToken: string, refreshToken: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  setAccessTokenCookie(accessToken);
};

export const clearTokens = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  clearAccessTokenCookie();
};

/**
 * True when the user is currently on a page that requires an
 * authenticated session — i.e. somewhere inside /dashboard. Used by
 * the response interceptor to decide whether a 401 should bounce them
 * to /login or just be reported as an error.
 *
 * Public pages (the marketing site, /created_for_you/<token>, /test,
 * /login, /signup, /verify-email, /reset-password, etc.) should keep
 * rendering even when a stale token sits in localStorage.
 */
const isOnAuthedPath = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/dashboard');
};

// Create axios instance
//
// IMPORTANT: do NOT set a default `Content-Type: application/json` here.
// Axios v1.x has a "helpful" transformRequest that detects when the
// header says application/json AND the body is FormData, and silently
// converts the FormData to a JSON string before sending. Multer on the
// backend then sees no multipart body and `@UploadedFile()` arrives
// undefined ("No file uploaded" was the symptom). Letting axios pick
// the Content-Type per request is the only safe option:
//
//   • Plain-object body  → axios auto-sets `application/json` (correct).
//   • FormData body      → axios auto-sets `multipart/form-data;
//                          boundary=...` (correct).
//   • String / stream    → no Content-Type is auto-set; callers that
//                          need one set it explicitly.
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

// Track refresh token request to prevent multiple simultaneous refresh calls
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null): void => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

/**
 * Exchange the refresh token for a fresh access token, coalescing
 * concurrent callers onto ONE network request via the same
 * `isRefreshing` + `failedQueue` lock the response interceptor uses.
 *
 * This single source of truth matters because the refresh token is
 * ROTATED on every call (the endpoint returns a new one); two parallel
 * refreshes — e.g. a REST 401 retry and a WebSocket (re)connect both
 * noticing an expired token at once — would spend the rotating token
 * twice and one would fail. Routing every refresh through here means
 * the second caller awaits the first instead of racing it.
 *
 * Resolves with the new access token, or rejects when there is no
 * refresh token / the refresh call fails (tokens are cleared in that
 * case; the caller decides whether to redirect).
 */
export function refreshAccessToken(): Promise<string> {
  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    });
  }
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    return Promise.reject(new Error('No refresh token available'));
  }
  isRefreshing = true;
  return axios
    .post(`${API_URL}/auth/refresh-token`, { refreshToken })
    .then((response) => {
      const { accessToken, refreshToken: newRefreshToken } = response.data;
      setTokens(accessToken, newRefreshToken);
      processQueue(null, accessToken);
      return accessToken as string;
    })
    .catch((error: Error) => {
      processQueue(error, null);
      clearTokens();
      throw error;
    })
    .finally(() => {
      isRefreshing = false;
    });
}

/** Read the `exp` (seconds since epoch) from a JWT without verifying it. */
function getTokenExp(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Return a usable access token, refreshing it first if it is missing,
 * expired, or within 30 s of expiry. Used by the WebSocket clients,
 * whose handshake auth is the ONE place a stale token isn't caught by
 * the axios 401 interceptor — a rejected socket handshake never hits
 * that interceptor, so without this the socket would reconnect forever
 * with a dead token and real-time would silently stop after ~15 min.
 * Returns null when no valid token can be obtained (logged out).
 */
export async function ensureValidAccessToken(): Promise<string | null> {
  const token = getAccessToken();
  if (token) {
    const exp = getTokenExp(token);
    // No exp claim → assume valid; otherwise require ≥30 s of life left.
    if (exp === null || Date.now() < exp * 1000 - 30_000) {
      return token;
    }
  }
  try {
    return await refreshAccessToken();
  } catch {
    return null;
  }
}

// Request interceptor - Add auth token + content language to requests
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Advertise the dashboard's current language so the backend can
    // localise per-request content (errors, generated documents)
    // without a profile lookup. Reads the same localStorage key the
    // i18n store owns; guarded for SSR + private-mode storage.
    if (config.headers && typeof window !== 'undefined') {
      try {
        const lang = window.localStorage.getItem('oralign.dashboard.lang');
        if (lang === 'fr' || lang === 'en') {
          config.headers['Accept-Language'] = lang;
        }
      } catch {
        /* storage unavailable — skip the header */
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * URLs the refresh-on-401 dance must NEVER touch.
 *
 * These endpoints either issue tokens themselves or are part of the
 * password-recovery flow — running them through the refresh path is
 * both wrong and dangerous:
 *
 *   • `/auth/sign-in` returns 401 for wrong-password / locked-account.
 *     The previous behaviour was: 401 → enter refresh flow → set the
 *     module-level `isRefreshing = true` → early-return when there's
 *     no refresh token but FORGET to reset `isRefreshing`. The next
 *     login attempt then queued forever on the never-drained
 *     `failedQueue`, leaving the button stuck on "Logging in…" until
 *     a page reload re-initialised the module. That's the 2-strike
 *     login-hang the user reported.
 *
 *   • `/auth/refresh-token` returning 401 should NOT recurse into
 *     itself — we always call it via the plain `axios` instance
 *     anyway, but this guards `apiClient` users that route through it.
 *
 *   • Sign-up, forgot-password, reset-password are pre-auth and
 *     wouldn't make sense to retry with a refreshed token.
 */
const PRE_AUTH_PATHS = [
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/refresh-token',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/resend-verification',
];

function isPreAuthRequest(config: InternalAxiosRequestConfig | undefined): boolean {
  if (!config?.url) return false;
  return PRE_AUTH_PATHS.some((p) => config.url!.includes(p));
}

// Response interceptor - Handle token refresh
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Hard skip for pre-auth endpoints. A 401 from /auth/sign-in is
    // "wrong password", not "your token expired" — refreshing makes
    // no sense and used to leak `isRefreshing = true`, which deadlocked
    // every subsequent request on the failedQueue.
    if (isPreAuthRequest(originalRequest)) {
      return Promise.reject(error);
    }

    // If error is 401 and we haven't retried yet, refresh once and retry.
    // The shared refreshAccessToken() owns the in-flight lock + queue, so
    // concurrent 401s (and the WebSocket auth path) coalesce onto a single
    // refresh and never double-spend the rotating refresh token.
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const accessToken = await refreshAccessToken();
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed (or no refresh token — tokens already cleared in
        // refreshAccessToken). Only bounce to /login when actually inside
        // the authenticated dashboard area, so a public page with a stale
        // localStorage token isn't kicked out.
        if (typeof window !== 'undefined' && isOnAuthedPath()) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    // For other errors, just reject
    return Promise.reject(error);
  }
);

export default apiClient;
