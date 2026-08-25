/**
 * Copy + brand tokens for every error surface (404, 500, 403, 401,
 * global crash) — and the source the static nginx pages are generated
 * from, so a visitor sees the same words whether Next answered or not.
 *
 * Deliberately dependency-free: error screens must render when the app's
 * providers, stylesheets or the root layout itself have failed.
 */

export type ErrorLang = 'fr' | 'en' | 'ar';

export const ERROR_LANGS: readonly ErrorLang[] = ['fr', 'en', 'ar'] as const;

/**
 * Where an error screen reads the visitor's language from. The two
 * language stores are deliberately separate and NOT interchangeable:
 * the public site is trilingual and defaults to French, the app is
 * bilingual and defaults to English. Reading the wrong one puts a
 * French — or worse, Arabic RTL — panel inside an English dashboard
 * that ships no Arabic at all.
 */
export type LangSource = 'showcase' | 'app';

export const LANG_SOURCES: Record<
  LangSource,
  { storageKey: string; fallback: ErrorLang; allowed: readonly ErrorLang[] }
> = {
  showcase: {
    storageKey: 'oralign.showcase.lang',
    fallback: 'fr',
    allowed: ['fr', 'en', 'ar'],
  },
  app: {
    storageKey: 'oralign.dashboard.lang',
    fallback: 'en',
    allowed: ['fr', 'en'],
  },
};

/** Homepage per language — the localized trees own their own URLs. */
export const HOME_HREF: Record<ErrorLang, string> = {
  fr: '/decouvrir',
  en: '/en/discover',
  ar: '/ar/discover',
};

/** Brand tokens, inlined rather than imported: showcase.css lives under
 *  [data-theme="showcase"] and globals.css may not have loaded at all. */
export const ERROR_THEME = {
  black: '#191919',
  white: '#f2f5ef',
  sun: '#feca16',
  sunDeep: '#c99a0b',
  onDarkMuted: 'rgba(242, 245, 239, 0.62)',
  onDarkFaint: 'rgba(242, 245, 239, 0.34)',
  hairline: 'rgba(242, 245, 239, 0.14)',
  display: '"Century Gothic", Jost, system-ui, sans-serif',
  body: '"DM Sans", system-ui, -apple-system, sans-serif',
} as const;

export type ErrorKind =
  | 'notFound'
  | 'serverError'
  | 'criticalError'
  | 'forbidden'
  | 'unauthorized'
  | 'offline';

type Localized = Record<ErrorLang, string>;

export type ErrorCopy = {
  /** Big numeral in the display font. */
  code: string;
  eyebrow: Localized;
  title: Localized;
  body: Localized;
};

export const ERROR_COPY: Record<ErrorKind, ErrorCopy> = {
  notFound: {
    code: '404',
    eyebrow: {
      fr: 'Page introuvable',
      en: 'Page not found',
      ar: 'الصفحة غير موجودة',
    },
    title: {
      fr: 'Cette page n’existe pas.',
      en: 'This page doesn’t exist.',
      ar: 'هذه الصفحة غير موجودة.',
    },
    body: {
      fr: 'Le lien est peut-être erroné, ou la page a été déplacée. Revenez à l’accueil pour retrouver votre chemin.',
      en: 'The link may be wrong, or the page has moved. Head back to the homepage to find your way.',
      ar: 'قد يكون الرابط خاطئاً أو تم نقل الصفحة. عد إلى الصفحة الرئيسية لتجد طريقك.',
    },
  },
  serverError: {
    code: '500',
    eyebrow: {
      fr: 'Erreur serveur',
      en: 'Server error',
      ar: 'خطأ في الخادم',
    },
    title: {
      fr: 'Quelque chose s’est mal passé.',
      en: 'Something went wrong.',
      ar: 'حدث خطأ ما.',
    },
    body: {
      fr: 'Un incident est survenu de notre côté. Réessayez dans un instant — si le problème persiste, contactez-nous.',
      en: 'Something failed on our side. Try again in a moment — if it keeps happening, get in touch.',
      ar: 'حدث خلل من جانبنا. أعد المحاولة بعد قليل — وإذا استمرت المشكلة، تواصل معنا.',
    },
  },
  criticalError: {
    code: '500',
    eyebrow: {
      fr: 'Erreur critique',
      en: 'Critical error',
      ar: 'خطأ حرج',
    },
    title: {
      fr: 'L’application n’a pas pu démarrer.',
      en: 'The application failed to start.',
      ar: 'تعذّر تشغيل التطبيق.',
    },
    body: {
      fr: 'Rechargez la page. Si l’écran reste bloqué, contactez-nous en indiquant la référence ci-dessous.',
      en: 'Reload the page. If the screen stays stuck, contact us with the reference below.',
      ar: 'أعد تحميل الصفحة. إذا بقيت الشاشة عالقة، تواصل معنا مع ذكر المرجع أدناه.',
    },
  },
  forbidden: {
    code: '403',
    eyebrow: {
      fr: 'Accès refusé',
      en: 'Access denied',
      ar: 'الوصول مرفوض',
    },
    title: {
      fr: 'Vous n’avez pas accès à cette page.',
      en: 'You don’t have access to this page.',
      ar: 'ليس لديك حق الوصول إلى هذه الصفحة.',
    },
    body: {
      fr: 'Votre compte ne dispose pas des droits nécessaires. Si vous pensez qu’il s’agit d’une erreur, contactez l’équipe ORALIGN.',
      en: 'Your account doesn’t carry the required permissions. If you believe this is a mistake, contact the ORALIGN team.',
      ar: 'لا يملك حسابك الصلاحيات المطلوبة. إذا كنت تعتقد أن هذا خطأ، تواصل مع فريق ORALIGN.',
    },
  },
  unauthorized: {
    code: '401',
    eyebrow: {
      fr: 'Session expirée',
      en: 'Session expired',
      ar: 'انتهت الجلسة',
    },
    title: {
      fr: 'Connectez-vous pour continuer.',
      en: 'Sign in to continue.',
      ar: 'سجّل الدخول للمتابعة.',
    },
    body: {
      fr: 'Votre session n’est plus valide. Reconnectez-vous à votre espace praticien pour reprendre où vous en étiez.',
      en: 'Your session is no longer valid. Sign back in to your practitioner workspace to pick up where you left off.',
      ar: 'لم تعد جلستك صالحة. سجّل الدخول مجدداً إلى فضاء الطبيب لمواصلة عملك.',
    },
  },
  offline: {
    code: '503',
    eyebrow: {
      fr: 'Maintenance en cours',
      en: 'Under maintenance',
      ar: 'صيانة جارية',
    },
    title: {
      fr: 'Le site revient dans un instant.',
      en: 'The site will be back shortly.',
      ar: 'سيعود الموقع بعد قليل.',
    },
    body: {
      fr: 'Nous effectuons une mise à jour. Merci de réessayer dans quelques minutes — vos données ne sont pas affectées.',
      en: 'We’re running an update. Please try again in a few minutes — your data is unaffected.',
      ar: 'نقوم بتحديث الموقع. يُرجى المحاولة بعد بضع دقائق — بياناتك لم تتأثر.',
    },
  },
};

/** Shared button / link labels. */
export const ERROR_ACTIONS = {
  home: {
    fr: 'Retour à l’accueil',
    en: 'Back to homepage',
    ar: 'العودة إلى الرئيسية',
  } satisfies Localized,
  retry: {
    fr: 'Réessayer',
    en: 'Try again',
    ar: 'إعادة المحاولة',
  } satisfies Localized,
  reload: {
    fr: 'Recharger la page',
    en: 'Reload the page',
    ar: 'إعادة تحميل الصفحة',
  } satisfies Localized,
  contact: {
    fr: 'Nous contacter',
    en: 'Contact us',
    ar: 'اتصل بنا',
  } satisfies Localized,
  login: {
    fr: 'Se connecter',
    en: 'Sign in',
    ar: 'تسجيل الدخول',
  } satisfies Localized,
  dashboard: {
    fr: 'Retour au tableau de bord',
    en: 'Back to dashboard',
    ar: 'العودة إلى لوحة التحكم',
  } satisfies Localized,
  reference: {
    fr: 'Référence',
    en: 'Reference',
    ar: 'المرجع',
  } satisfies Localized,
};

export function isErrorLang(value: unknown): value is ErrorLang {
  return typeof value === 'string' && (ERROR_LANGS as readonly string[]).includes(value);
}

/**
 * Language for an error screen, given the URL path and the store that
 * fits the surface. The /en and /ar trees own their language (exact
 * segment match, so `/entreprise` is not mistaken for English);
 * everywhere else the stored choice applies, constrained to the
 * languages that surface actually ships.
 */
export function errorLangFor(
  pathname: string,
  stored: string | null,
  source: LangSource = 'showcase',
): ErrorLang {
  const { fallback, allowed } = LANG_SOURCES[source];
  if (allowed.includes('en') && (pathname.startsWith('/en/') || pathname === '/en')) return 'en';
  if (allowed.includes('ar') && (pathname.startsWith('/ar/') || pathname === '/ar')) return 'ar';
  return isErrorLang(stored) && allowed.includes(stored) ? stored : fallback;
}
