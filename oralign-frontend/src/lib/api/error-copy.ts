/**
 * User-facing copy for API failures, by language.
 *
 * Kept out of the i18n dictionary on purpose: the error classifier runs in
 * plain modules (axios interceptors, mutation hooks) that have no `t()` in
 * scope, and pulling the whole dashboard dictionary into `lib/api` would
 * drag it into every bundle that touches the API client.
 *
 * Each message says what the person can DO. None of them mentions
 * containers, backends or servers "not running": in production the API is
 * virtually always up — what fails is the phone's connection, a proxy
 * timeout, or a 30-second deploy window — and telling a doctor to "check
 * that the backend is running" sends them chasing the wrong thing.
 */

export type ApiErrorKind =
  | 'offline'
  | 'timeout'
  | 'network'
  | 'upstream'
  | 'throttled'
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'payload_too_large'
  | 'server'
  | 'unknown';

export type ErrorLang = 'fr' | 'en';

const COPY: Record<ApiErrorKind, Record<ErrorLang, string>> = {
  offline: {
    fr: 'Vous êtes hors ligne. Vérifiez votre connexion internet, puis réessayez.',
    en: 'You are offline. Check your internet connection and try again.',
  },
  timeout: {
    fr: 'Le serveur met trop de temps à répondre. Vérifiez votre connexion, puis réessayez.',
    en: 'The server is taking too long to respond. Check your connection and try again.',
  },
  network: {
    fr: 'Impossible de joindre le serveur. Vérifiez votre connexion internet ; si le problème persiste, réessayez dans quelques instants.',
    en: 'The server could not be reached. Check your internet connection; if the problem persists, try again in a moment.',
  },
  upstream: {
    fr: 'Le serveur redémarre ou est momentanément indisponible. Réessayez dans quelques secondes.',
    en: 'The server is restarting or briefly unavailable. Try again in a few seconds.',
  },
  throttled: {
    fr: 'Trop de tentatives en peu de temps. Patientez quelques minutes avant de réessayer.',
    en: 'Too many attempts in a short time. Wait a few minutes before trying again.',
  },
  auth: {
    fr: 'Votre session a expiré. Reconnectez-vous pour continuer.',
    en: 'Your session has expired. Sign in again to continue.',
  },
  forbidden: {
    fr: 'Vous n’avez pas les droits nécessaires pour cette action.',
    en: 'You do not have permission to perform this action.',
  },
  not_found: {
    fr: 'L’élément demandé est introuvable. Il a peut-être été supprimé.',
    en: 'The requested item could not be found. It may have been deleted.',
  },
  conflict: {
    fr: 'Cette action entre en conflit avec des données existantes.',
    en: 'This action conflicts with existing data.',
  },
  validation: {
    fr: 'Certaines informations sont invalides. Vérifiez le formulaire.',
    en: 'Some of the information is invalid. Check the form.',
  },
  payload_too_large: {
    fr: 'Le fichier dépasse la taille maximale autorisée.',
    en: 'The file exceeds the maximum allowed size.',
  },
  server: {
    fr: 'Une erreur est survenue côté serveur. Réessayez ; si le problème persiste, contactez le support.',
    en: 'Something went wrong on the server. Try again; if the problem persists, contact support.',
  },
  unknown: {
    fr: 'Une erreur inattendue est survenue. Réessayez.',
    en: 'An unexpected error occurred. Please try again.',
  },
};

export function apiErrorCopy(kind: ApiErrorKind, lang: ErrorLang): string {
  return COPY[kind][lang];
}

/**
 * The language the dashboard is showing right now, without importing the
 * dictionary: the stored choice (the key belongs to lib/i18n/use-lang.ts,
 * the same one the API client's request interceptor reads), else the
 * language use-lang mirrored onto <html>, else French — the language of
 * the clinics using the app.
 */
export function currentErrorLang(): ErrorLang {
  if (typeof window === 'undefined') return 'fr';
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem('oralign.dashboard.lang');
  } catch {
    /* private mode — fall through to the document language */
  }
  if (stored === 'en' || stored === 'fr') return stored;
  const shown = document.documentElement.lang.toLowerCase();
  return shown.startsWith('en') ? 'en' : 'fr';
}
