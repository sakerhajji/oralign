import type { Lang } from "../i18n/dict";

/**
 * SEO route registry for the public marketing site.
 *
 * One entry per marketing page, in three languages. French pages live at
 * the historical root paths (/decouvrir, /cas, …); English and Arabic
 * live under /en/<slug> and /ar/<slug> so every language has a real,
 * crawlable URL — hreflang only means something when each language IS a
 * distinct URL. Legal pages and the blog are intentionally absent: legal
 * stays FR-canonical (payment providers point at those URLs), and the
 * blog resolves its bilingual content client-side on a single URL.
 *
 * Titles are FULL strings (brand suffix included) — no reliance on
 * Next's title templates, which differ between the (showcase) tree and
 * the /[lang] tree. Keywords stay short and natural per page: the
 * keyword → page mapping is documented in docs/seo-keyword-map.md.
 */

export type MarketingPageKey =
  | "home"
  | "cases"
  | "finder"
  | "guide"
  | "community"
  | "practitioners"
  | "about"
  | "contact";

export type PageSeo = {
  /** Absolute path on the site, e.g. "/decouvrir" or "/en/discover". */
  path: string;
  /** Full <title>, brand included. */
  title: string;
  description: string;
  keywords: string[];
  /** Short name used in breadcrumbs / nav-level JSON-LD. */
  breadcrumb: string;
};

/** Languages served from a /<lang>/ subtree (French owns the root paths). */
export const LOCALIZED_LANGS = ["en", "ar"] as const;
export type LocalizedLang = (typeof LOCALIZED_LANGS)[number];

export function isLocalizedLang(v: string): v is LocalizedLang {
  return (LOCALIZED_LANGS as readonly string[]).includes(v);
}

/** Shared EN/AR slug per page (Arabic uses Latin slugs; content is Arabic). */
export const PAGE_SLUGS: Record<MarketingPageKey, string> = {
  home: "discover",
  cases: "clinical-cases",
  finder: "find-a-practitioner",
  guide: "guide",
  community: "community",
  practitioners: "for-dentists",
  about: "about-us",
  contact: "contact",
};

export const SLUG_TO_KEY: Record<string, MarketingPageKey> = Object.fromEntries(
  (Object.entries(PAGE_SLUGS) as [MarketingPageKey, string][]).map(([k, s]) => [s, k]),
) as Record<string, MarketingPageKey>;

/**
 * Languages each page actually EXISTS in. about/contact render the legal
 * prose, which has no Arabic translation yet (`base(ar) → fr` in
 * legal-content.ts) — publishing /ar/about-us would serve a French body
 * under Arabic metadata, the worst of both worlds. Add 'ar' back here
 * the day the legal prose is translated; hreflang, sitemap, static
 * params and the language switch all follow this table.
 */
export const PAGE_LANGS: Record<MarketingPageKey, readonly Lang[]> = {
  home: ["fr", "en", "ar"],
  cases: ["fr", "en", "ar"],
  finder: ["fr", "en", "ar"],
  guide: ["fr", "en", "ar"],
  community: ["fr", "en", "ar"],
  practitioners: ["fr", "en", "ar"],
  about: ["fr", "en"],
  contact: ["fr", "en"],
};

export function hasLang(key: MarketingPageKey, lang: Lang): boolean {
  return PAGE_LANGS[key].includes(lang);
}

export const MARKETING_PAGES: Record<MarketingPageKey, Record<Lang, PageSeo>> = {
  home: {
    fr: {
      path: "/decouvrir",
      title: "Aligneurs dentaires invisibles en Tunisie | ORALIGN®",
      description:
        "Aligneurs transparents ORALIGN® : orthodontie invisible supervisée par un praticien certifié en Tunisie, pour adultes, ados et enfants. Trouvez un praticien.",
      keywords: [
        "aligneur dentaire",
        "aligneurs transparents",
        "gouttière dentaire",
        "orthodontie invisible",
        "appareil dentaire invisible",
        "aligneur dentaire Tunisie",
        "prix aligneurs Tunisie",
        "alternative Invisalign Tunisie",
        "ORALIGN",
      ],
      breadcrumb: "Découvrir",
    },
    en: {
      path: "/en/discover",
      title: "Clear Aligners in Tunisia — Invisible Braces | ORALIGN®",
      description:
        "ORALIGN® clear aligners: dentist-supervised invisible orthodontics made in Tunisia, for adults, teens and kids. Find a certified practitioner near you.",
      keywords: [
        "clear aligners",
        "dental aligners",
        "transparent aligners",
        "invisible braces",
        "invisible orthodontics",
        "teeth aligners",
        "clear aligner treatment",
        "clear aligners Tunisia",
      ],
      breadcrumb: "Discover",
    },
    ar: {
      path: "/ar/discover",
      title: "تقويم الأسنان الشفاف في تونس | ORALIGN®",
      description:
        "مصففات أسنان شفافة من ORALIGN®: تقويم غير مرئي بإشراف طبيب أسنان معتمد في تونس. علاج تقويم الأسنان للكبار والمراهقين والأطفال — ابحث عن طبيب قريب منك.",
      keywords: [
        "تقويم شفاف",
        "تقويم الأسنان الشفاف",
        "تقويم غير مرئي",
        "مصففات الأسنان",
        "مصففات شفافة",
        "تقويم الأسنان بدون أسلاك",
        "تقويم الأسنان في تونس",
        "سعر تقويم الأسنان الشفاف",
      ],
      breadcrumb: "اكتشف",
    },
  },
  cases: {
    fr: {
      path: "/cas",
      title: "Cas cliniques : avant / après aligneurs dentaires | ORALIGN®",
      description:
        "Résultats avant / après de traitements par aligneurs transparents ORALIGN : encombrement, supraclusion, béance. Pourquoi agir tôt simplifie le traitement orthodontique.",
      keywords: [
        "traitement par aligneurs",
        "avant après aligneurs",
        "cas cliniques orthodontie",
        "encombrement dentaire",
        "supraclusion",
        "béance dentaire",
        "traitement orthodontique",
      ],
      breadcrumb: "Cas cliniques",
    },
    en: {
      path: "/en/clinical-cases",
      title: "Clinical Cases: Clear Aligner Before & After | ORALIGN®",
      description:
        "Before and after results of ORALIGN clear aligner treatment: crowding, overbite, open bite. Why early orthodontic care makes treatment simpler.",
      keywords: [
        "clear aligner before and after",
        "clear aligner treatment",
        "orthodontic clinical cases",
        "teeth crowding treatment",
        "overbite aligners",
        "invisible orthodontics results",
      ],
      breadcrumb: "Clinical cases",
    },
    ar: {
      path: "/ar/clinical-cases",
      title: "حالات سريرية: قبل وبعد التقويم الشفاف | ORALIGN®",
      description:
        "نتائج قبل وبعد علاج تقويم الأسنان بمصففات ORALIGN الشفافة: تزاحم الأسنان، العضة العميقة، العضة المفتوحة. لماذا يجعل العلاج المبكر تقويم الأسنان أبسط.",
      keywords: [
        "علاج تقويم الأسنان",
        "قبل وبعد التقويم الشفاف",
        "حالات تقويم الأسنان",
        "تزاحم الأسنان",
        "أفضل تقويم أسنان شفاف",
      ],
      breadcrumb: "حالات سريرية",
    },
  },
  finder: {
    fr: {
      path: "/trouver-un-praticien",
      title: "Trouver un dentiste ou orthodontiste en Tunisie | ORALIGN®",
      description:
        "Dentistes et orthodontistes partenaires ORALIGN en Tunisie : trouvez un cabinet dentaire certifié près de chez vous et demandez un rendez-vous.",
      keywords: [
        "dentiste Tunisie",
        "orthodontiste Tunisie",
        "cabinet dentaire",
        "clinique dentaire",
        "praticien aligneurs",
        "orthodontiste aligneurs Tunis",
      ],
      breadcrumb: "Trouver un praticien",
    },
    en: {
      path: "/en/find-a-practitioner",
      title: "Find a Dentist or Orthodontist in Tunisia | ORALIGN®",
      description:
        "ORALIGN partner dentists and orthodontists across Tunisia: find a certified dental clinic near you and request an appointment for clear aligner treatment.",
      keywords: [
        "dentist Tunisia",
        "orthodontist Tunisia",
        "dental clinic Tunisia",
        "clear aligner dentist",
        "find an orthodontist",
      ],
      breadcrumb: "Find a practitioner",
    },
    ar: {
      path: "/ar/find-a-practitioner",
      title: "ابحث عن طبيب أسنان أو أخصائي تقويم في تونس | ORALIGN®",
      description:
        "أطباء أسنان وأخصائيو تقويم شركاء ORALIGN في تونس: ابحث عن عيادة أسنان معتمدة قريبة منك واطلب موعداً لعلاج التقويم الشفاف.",
      keywords: [
        "طبيب أسنان",
        "طبيب تقويم الأسنان",
        "أخصائي تقويم الأسنان",
        "عيادة أسنان",
        "مركز أسنان",
      ],
      breadcrumb: "ابحث عن طبيب",
    },
  },
  guide: {
    fr: {
      path: "/guide",
      title: "Guide des aligneurs : port, nettoyage, entretien | ORALIGN®",
      description:
        "Comment porter vos gouttières dentaires, les nettoyer et les entretenir au quotidien : le guide pratique du traitement par aligneurs transparents ORALIGN.",
      keywords: [
        "guide aligneurs",
        "porter gouttière dentaire",
        "nettoyer aligneurs",
        "entretien gouttière orthodontique",
        "conseils aligneurs invisibles",
      ],
      breadcrumb: "Guide",
    },
    en: {
      path: "/en/guide",
      title: "Clear Aligner Guide: Wearing, Cleaning, Care | ORALIGN®",
      description:
        "How to wear your teeth aligners, clean them and care for them every day: the practical guide to ORALIGN clear aligner treatment.",
      keywords: [
        "clear aligner guide",
        "how to wear aligners",
        "clean clear aligners",
        "aligner care tips",
      ],
      breadcrumb: "Guide",
    },
    ar: {
      path: "/ar/guide",
      title: "دليل استخدام مصففات الأسنان الشفافة | ORALIGN®",
      description:
        "كيفية ارتداء قالب الأسنان الشفاف وتنظيفه والعناية به يومياً: الدليل العملي لعلاج تقويم الأسنان بمصففات ORALIGN.",
      keywords: [
        "دليل التقويم الشفاف",
        "قالب الأسنان الشفاف",
        "تنظيف مصففات الأسنان",
        "العناية بالتقويم الشفاف",
      ],
      breadcrumb: "الدليل",
    },
  },
  community: {
    fr: {
      path: "/communaute",
      title: "Témoignages de patients — la communauté | ORALIGN®",
      description:
        "Témoignages de patients traités par aligneurs transparents ORALIGN en Tunisie : leur expérience de l'orthodontie invisible, et comment partager la vôtre.",
      keywords: [
        "témoignages aligneurs",
        "avis aligneurs Tunisie",
        "expérience orthodontie invisible",
        "communauté ORALIGN",
      ],
      breadcrumb: "Communauté",
    },
    en: {
      path: "/en/community",
      title: "Patient Stories — the Community | ORALIGN®",
      description:
        "Stories from patients treated with ORALIGN clear aligners in Tunisia: their invisible-orthodontics experience, and how to share yours.",
      keywords: [
        "clear aligner reviews",
        "aligner patient stories",
        "invisible braces experience",
      ],
      breadcrumb: "Community",
    },
    ar: {
      path: "/ar/community",
      title: "تجارب المرضى — مجتمع ORALIGN®",
      description:
        "تجارب مرضى عولجوا بمصففات ORALIGN الشفافة في تونس: قصصهم مع التقويم غير المرئي، وكيف تشارك تجربتك.",
      keywords: [
        "تجارب التقويم الشفاف",
        "آراء مصففات الأسنان",
        "تجربة تقويم الأسنان",
      ],
      breadcrumb: "المجتمع",
    },
  },
  practitioners: {
    fr: {
      path: "/praticiens",
      title: "Aligneurs pour dentistes et orthodontistes | ORALIGN®",
      description:
        "Fabricant tunisien d'aligneurs dentaires pour praticiens : orthodontie digitale, planification 3D, laboratoire local et plateforme de suivi. Devenez partenaire ORALIGN.",
      keywords: [
        "aligneurs pour dentistes",
        "fournisseur aligneurs dentaires",
        "fabricant aligneurs dentaires",
        "laboratoire orthodontique",
        "laboratoire dentaire",
        "orthodontie digitale",
        "scanner intra-oral",
        "planification orthodontique",
        "devenir dentiste partenaire",
        "solution pour dentistes",
      ],
      breadcrumb: "Praticiens",
    },
    en: {
      path: "/en/for-dentists",
      title: "Clear Aligners for Dentists & Orthodontists | ORALIGN®",
      description:
        "Tunisian clear aligner manufacturer and orthodontic lab for dental professionals: digital planning, local production, online platform. Join the ORALIGN partner program.",
      keywords: [
        "clear aligners for dentists",
        "clear aligner supplier Tunisia",
        "aligner manufacturer",
        "dental aligner supplier",
        "orthodontic laboratory",
        "digital orthodontics",
        "orthodontic treatment planning",
        "clear aligner system for dentists",
        "dentist partner program",
      ],
      breadcrumb: "For dentists",
    },
    ar: {
      path: "/ar/for-dentists",
      title: "مصففات الأسنان للأطباء — برنامج الشراكة | ORALIGN®",
      description:
        "مصنع ومخبر تونسي لمصففات الأسنان الشفافة لفائدة أطباء الأسنان وأخصائيي التقويم: تخطيط رقمي ثلاثي الأبعاد وتصنيع محلي ومنصة متابعة. انضم إلى شركاء ORALIGN.",
      keywords: [
        "مصففات الأسنان للأطباء",
        "حلول لأطباء الأسنان",
        "مورد مصففات الأسنان",
        "مصنع مصففات الأسنان",
        "مخبر تقويم الأسنان",
        "تقويم الأسنان الرقمي",
        "شريك طبيب أسنان",
      ],
      breadcrumb: "للأطباء",
    },
  },
  about: {
    fr: {
      path: "/qui-sommes-nous",
      title: "Qui sommes-nous — fabricant d'aligneurs en Tunisie | ORALIGN®",
      description:
        "ORALIGN by Aura Aligners : première société tunisienne de conception et fabrication d'aligneurs dentaires transparents. Mission, laboratoire et équipe.",
      keywords: [
        "ORALIGN",
        "Aura Aligners",
        "fabricant aligneurs Tunisie",
        "société aligneurs dentaires",
      ],
      breadcrumb: "Qui sommes-nous",
    },
    en: {
      path: "/en/about-us",
      title: "About Us — Clear Aligner Manufacturer in Tunisia | ORALIGN®",
      description:
        "ORALIGN by Aura Aligners: the first Tunisian company designing and manufacturing transparent dental aligners. Our mission, our laboratory and our team.",
      keywords: [
        "ORALIGN",
        "Aura Aligners",
        "aligner manufacturer Tunisia",
        "clear aligner company",
      ],
      breadcrumb: "About us",
    },
    ar: {
      path: "/ar/about-us",
      title: "من نحن — شركة تقويم شفاف في تونس | ORALIGN®",
      description:
        "ORALIGN by Aura Aligners: أول شركة تونسية لتصميم وتصنيع مصففات الأسنان الشفافة. مهمتنا ومخبرنا وفريقنا.",
      keywords: [
        "ORALIGN",
        "شركة تقويم شفاف تونس",
        "مصنع مصففات الأسنان",
      ],
      breadcrumb: "من نحن",
    },
  },
  contact: {
    fr: {
      path: "/contact",
      title: "Nous contacter | ORALIGN®",
      description:
        "Contactez ORALIGN : email, téléphone et adresse à Tunis. Assistance patients et praticiens, avant et pendant votre traitement par aligneurs.",
      keywords: ["contact ORALIGN", "aligneurs Tunisie contact"],
      breadcrumb: "Contact",
    },
    en: {
      path: "/en/contact",
      title: "Contact Us | ORALIGN®",
      description:
        "Contact ORALIGN: email, phone and address in Tunis. Support for patients and dental professionals, before and during aligner treatment.",
      keywords: ["contact ORALIGN", "clear aligners Tunisia contact"],
      breadcrumb: "Contact",
    },
    ar: {
      path: "/ar/contact",
      title: "اتصل بنا | ORALIGN®",
      description:
        "تواصل مع ORALIGN: البريد الإلكتروني والهاتف والعنوان في تونس. دعم للمرضى وأطباء الأسنان قبل العلاج وأثناءه.",
      keywords: ["اتصل بنا ORALIGN", "تقويم شفاف تونس"],
      breadcrumb: "اتصل بنا",
    },
  },
};

export const MARKETING_PAGE_KEYS = Object.keys(MARKETING_PAGES) as MarketingPageKey[];

export function pathFor(key: MarketingPageKey, lang: Lang): string {
  return MARKETING_PAGES[key][lang].path;
}

/** Flat path → pageKey index across the AVAILABLE languages only. */
const PATH_TO_KEY: Record<string, MarketingPageKey> = Object.fromEntries(
  MARKETING_PAGE_KEYS.flatMap((key) =>
    PAGE_LANGS[key].map((lang) => [MARKETING_PAGES[key][lang].path, key]),
  ),
);

/**
 * The same page in another language, or null when the current path has no
 * localized sibling in that language (blog, legal, private surfaces —
 * and about/contact for Arabic). "/" counts as home so the switch works
 * before the 308 to /decouvrir has been followed.
 */
export function localizedPathFor(pathname: string, lang: Lang): string | null {
  const clean = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const key = clean === "/" ? "home" : PATH_TO_KEY[clean];
  if (!key || !hasLang(key, lang)) return null;
  return MARKETING_PAGES[key][lang].path;
}
