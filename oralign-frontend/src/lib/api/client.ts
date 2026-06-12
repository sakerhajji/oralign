import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { ApiErrorResponse } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// Token management utilities
const TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

const setAccessTokenCookie = (accessToken: string): void => {
  if (typeof document === 'undefined') return;
  document.cookie = `accessToken=${encodeURIComponent(accessToken)}; Path=/; SameSite=Lax`;
};

const clearAccessTokenCookie = (): void => {
  if (typeof document === 'undefined') return;
  document.cookie = 'accessToken=; Path=/; Max-Age=0; SameSite=Lax';
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

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      // Single `finally` cleanup so every exit path resets the lock.
      // Previously the `if (!refreshToken)` early-return skipped the
      // try/finally entirely and left `isRefreshing = true` forever —
      // the next 401 then queued indefinitely on `failedQueue`.
      try {
        const refreshToken = getRefreshToken();

        if (!refreshToken) {
          // No refresh token. Only redirect to /login when the user is
          // actually inside the authenticated dashboard area — otherwise
          // visiting a public page (e.g. /created_for_you/<token> as a
          // patient with stale localStorage tokens) would bounce them
          // out of a page they were entitled to see.
          processQueue(error as Error, null);
          clearTokens();
          if (typeof window !== 'undefined' && isOnAuthedPath()) {
            window.location.href = '/login';
          }
          return Promise.reject(error);
        }

        // Call refresh token endpoint
        const response = await axios.post(`${API_URL}/auth/refresh-token`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data;

        // Save new tokens
        setTokens(accessToken, newRefreshToken);

        // Update the authorization header
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }

        // Process queued requests
        processQueue(null, accessToken);

        // Retry the original request
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed. As above, only bounce to /login if we're
        // actually on an authed path — public pages should stay where
        // they are even if a stale localStorage token failed to refresh.
        processQueue(refreshError as Error, null);
        clearTokens();
        if (typeof window !== 'undefined' && isOnAuthedPath()) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // For other errors, just reject
    return Promise.reject(error);
  }
);

export default apiClient;
