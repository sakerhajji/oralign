import { dict, type Lang } from "../i18n/dict";
import { MARKETING_PAGES, pathFor, type MarketingPageKey } from "./routes";
import { SITE_NAME, SITE_URL, absoluteUrl } from "./meta";

/**
 * Server-rendered JSON-LD. The previous implementation used next/script
 * with strategy="afterInteractive", which injects the block client-side
 * AFTER hydration — crawlers reading the HTML source (and any bot that
 * doesn't execute JS) never saw it. A plain inline <script> in an RSC
 * ships the markup in the initial HTML, which is the whole point.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // "<" escaped so user-influenced strings can never close the tag.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

const ORG_ID = `${SITE_URL}/#organization`;

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalOrganization",
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: "ORALIGN",
    url: SITE_URL,
    // Raster logo — Google's guidelines ask for a crawlable raster image.
    logo: `${SITE_URL}/icon-512.png`,
    image: `${SITE_URL}/icon-512.png`,
    description:
      "Aligneurs orthodontiques invisibles ORALIGN® — conçus en Allemagne, fabriqués en Tunisie. Clear aligners designed in Germany, manufactured in Tunisia.",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Les Jardins de Carthage",
      addressLocality: "Tunis",
      addressCountry: "TN",
    },
    areaServed: { "@type": "Country", name: "Tunisia" },
    knowsLanguage: ["fr", "en", "ar"],
    sameAs: [],
  };
}

export function webSiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "ORALIGN",
    url: SITE_URL,
    inLanguage: ["fr", "en", "ar"],
    publisher: { "@id": ORG_ID },
  };
}

const PROCEDURE_COPY: Record<
  Lang,
  { name: string; preparation: string; followup: string; howPerformed: string }
> = {
  fr: {
    name: "Traitement par aligneurs invisibles ORALIGN®",
    preparation:
      "Consultation et empreinte 3D (scanner intra-oral) chez un praticien certifié ORALIGN®.",
    followup:
      "Suivi régulier par votre praticien. Port d'une contention à la fin du traitement.",
    howPerformed:
      "Port d'aligneurs transparents thermoformés, changés régulièrement selon le plan de traitement orthodontique validé par le praticien.",
  },
  en: {
    name: "ORALIGN® clear aligner treatment",
    preparation:
      "Consultation and 3D impression (intraoral scanner) with an ORALIGN®-certified practitioner.",
    followup:
      "Regular follow-up with your practitioner. A retainer is worn at the end of treatment.",
    howPerformed:
      "Thermoformed transparent aligners worn and changed on a schedule following the orthodontic treatment plan approved by the practitioner.",
  },
  ar: {
    name: "علاج تقويم الأسنان بمصففات ORALIGN® الشفافة",
    preparation:
      "استشارة وطبعة ثلاثية الأبعاد (ماسح ضوئي للأسنان) لدى طبيب معتمد من ORALIGN®.",
    followup: "متابعة منتظمة مع طبيبك، مع مثبّت أسنان في نهاية العلاج.",
    howPerformed:
      "ارتداء مصففات شفافة مصنوعة بالتشكيل الحراري، تُستبدل بانتظام وفق خطة العلاج التي يعتمدها الطبيب.",
  },
};

export function procedureLd(lang: Lang) {
  const c = PROCEDURE_COPY[lang];
  return {
    "@context": "https://schema.org",
    "@type": "MedicalProcedure",
    name: c.name,
    // No `procedureType`: schema.org expects a MedicalProcedureType
    // enumeration there and none of its members fits orthodontics —
    // an invalid value is worse for validators than an absent one.
    bodyLocation: "Teeth",
    preparation: c.preparation,
    followup: c.followup,
    howPerformed: c.howPerformed,
  };
}

/**
 * FAQPage markup derived from the FAQ the visitor actually SEES — the
 * patient items of the guide page's FaqSection (dict.faq.items). Google
 * requires the marked-up Q/A to be visible on the page, so this block
 * belongs on the guide pages (where FaqSection is mounted), never on
 * pages without visible FAQ content. Practitioner-tab items are omitted:
 * Radix only mounts the active tab, so they're absent from the HTML.
 */
export function faqLd(lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: dict.faq.items.map((item) => ({
      "@type": "Question",
      name: item.q[lang],
      acceptedAnswer: { "@type": "Answer", text: item.a[lang] },
    })),
  };
}

const HOME_CRUMB: Record<Lang, string> = {
  fr: "Accueil",
  en: "Home",
  ar: "الرئيسية",
};

export function breadcrumbLd(key: MarketingPageKey, lang: Lang) {
  const items = [
    { name: HOME_CRUMB[lang], path: pathFor("home", lang) },
    ...(key === "home"
      ? []
      : [{ name: MARKETING_PAGES[key][lang].breadcrumb, path: pathFor(key, lang) }]),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

const DENTIST_SERVICE_COPY: Record<Lang, { name: string; description: string }> = {
  fr: {
    name: "Fabrication d'aligneurs dentaires pour praticiens",
    description:
      "Laboratoire orthodontique tunisien pour dentistes et orthodontistes : planification 3D du traitement, fabrication d'aligneurs transparents sur prescription et plateforme de suivi des commandes.",
  },
  en: {
    name: "Clear aligner manufacturing for dental professionals",
    description:
      "Tunisian orthodontic laboratory for dentists and orthodontists: 3D treatment planning, prescription clear aligner manufacturing and an online order-tracking platform.",
  },
  ar: {
    name: "تصنيع مصففات الأسنان لأطباء الأسنان",
    description:
      "مخبر تقويم أسنان تونسي لأطباء وأخصائيي تقويم الأسنان: تخطيط علاج ثلاثي الأبعاد، تصنيع مصففات شفافة بوصفة طبية ومنصة لمتابعة الطلبات.",
  },
};

/** Service schema for the B2B practitioners landing page. */
export function dentistServiceLd(lang: Lang) {
  const c = DENTIST_SERVICE_COPY[lang];
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: c.name,
    description: c.description,
    serviceType: "Orthodontic laboratory services",
    provider: { "@id": ORG_ID },
    areaServed: { "@type": "Country", name: "Tunisia" },
    audience: { "@type": "Audience", audienceType: "Dentists and orthodontists" },
    url: absoluteUrl(pathFor("practitioners", lang)),
  };
}
