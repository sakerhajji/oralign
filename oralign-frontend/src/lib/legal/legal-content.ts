/**
 * Shared legal / compliance content — the SINGLE source of truth for the
 * four documents the Tunisian payment provider requires:
 *
 *   • about   — Qui sommes-nous / About us
 *   • refunds — Réclamations et remboursements / Complaints and refunds
 *   • legal   — Mentions légales / Legal notice
 *   • terms   — Conditions de vente · Livraison / Terms of sale · Delivery
 *
 * This module is intentionally framework-agnostic (no React, no 'use
 * client'): it returns structured, localized DATA, and each surface
 * renders it in its own design system —
 *   • the public showcase pages ((showcase)/qui-sommes-nous, …) render it
 *     in the marketing theme, server-side, for the provider's review;
 *   • the dashboard help page (/dashboard/help) renders it inside shadcn
 *     tabs for logged-in doctors/admins.
 *
 * Company-specific data (raison sociale, matricule fiscal, adresse,
 * hébergeur, …) is NEVER hardcoded here — it is injected via `company`,
 * which every surface loads from the billing settings the admin manages
 * at /account/billing-settings. Only the boilerplate policy prose lives
 * here. Any missing company field renders a localized "à compléter"
 * placeholder so the admin sees exactly what to fill in.
 *
 * Arabic (showcase supports fr/en/ar) falls back to the French text for
 * the legal prose — legal notices in Tunisia are commonly published in
 * French, and this avoids shipping machine-translated legal wording. The
 * company DATA is language-agnostic, so it still shows in every language.
 */

export type LegalLang = 'fr' | 'en' | 'ar';
type Base = 'fr' | 'en';

/** ar → fr for prose; en stays en. */
function base(lang: LegalLang): Base {
  return lang === 'en' ? 'en' : 'fr';
}

export type LegalDocKey =
  | 'about'
  | 'refunds'
  | 'legal'
  | 'privacy'
  | 'termsOfUse'
  | 'terms'
  | 'contact';

/**
 * Legal documents surfaced as tabs on the dashboard help hub. `contact`
 * is a standalone coordinates page (not a policy document), so it is
 * excluded from the tab list but still generates a public route.
 */
export const LEGAL_DOC_KEYS: readonly LegalDocKey[] = [
  'about',
  'refunds',
  'legal',
  'privacy',
  'termsOfUse',
  'terms',
] as const;

/** Order of the compliance links inside the footer's "legal" column. */
export const FOOTER_LEGAL_KEYS: readonly LegalDocKey[] = [
  'refunds',
  'legal',
  'privacy',
  'termsOfUse',
  'terms',
] as const;

/**
 * Company identity injected from billing settings. Mirrors the backend
 * `/company-billing-settings/legal-info` projection (`LegalInfo`).
 */
export interface LegalCompany {
  companyName?: string | null;
  tradeName?: string | null;
  legalForm?: string | null;
  capitalSocial?: string | null;
  taxRegistrationNumber?: string | null;
  registreDeCommerce?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  hostingProvider?: string | null;
  hostingProviderUrl?: string | null;
  websiteDomain?: string | null;
  currency?: string | null;
}

/** A label/value pair (mentions-légales table, contact block). */
export interface LegalRow {
  label: string;
  /** Resolved value, or the localized placeholder when the field is empty. */
  value: string;
  /** True when the underlying company field was empty (for muted styling). */
  missing: boolean;
  /** Optional link target (mailto:, tel:, https://…). Never set when missing. */
  href?: string;
}

export interface LegalSection {
  heading?: string;
  paragraphs?: string[];
  /** Bullet list, rendered after the paragraphs. */
  list?: string[];
  /** Paragraphs rendered AFTER the list — for clauses that close on prose. */
  paragraphsAfter?: string[];
  rows?: LegalRow[];
}

export interface LegalDoc {
  key: LegalDocKey;
  /** Public showcase route slug (fixed, French — the site has no locale prefixes). */
  slug: string;
  title: string;
  navLabel: string;
  eyebrow: string;
  description: string;
  sections: LegalSection[];
}

// ─── Static meta (available without company data, for footer + SEO) ─────────

interface DocMeta {
  slug: string;
  nav: Record<Base, string>;
  title: Record<Base, string>;
  description: Record<Base, string>;
}

const BRAND = 'ORALIGN';

const DOC_META: Record<LegalDocKey, DocMeta> = {
  about: {
    slug: 'qui-sommes-nous',
    nav: { fr: 'Qui sommes-nous', en: 'About us' },
    title: { fr: 'Qui sommes-nous', en: 'About us' },
    description: {
      fr: 'Découvrez ORALIGN, boutique en ligne d’aligneurs dentaires transparents basée en Tunisie : notre mission, notre catalogue et notre service client.',
      en: 'Discover ORALIGN, an online store of clear dental aligners based in Tunisia: our mission, our catalog and our customer support.',
    },
  },
  refunds: {
    slug: 'reclamations-remboursements',
    nav: { fr: 'Réclamations et remboursements', en: 'Complaints and refunds' },
    title: {
      fr: 'Réclamations et remboursements clients',
      en: 'Customer complaints and refunds',
    },
    description: {
      fr: 'Comment déposer une réclamation, les informations à fournir, nos délais de traitement (48–72 h ouvrables) et notre politique de remboursement.',
      en: 'How to file a complaint, the information to provide, our processing times (48–72 business hours) and our refund policy.',
    },
  },
  legal: {
    slug: 'mentions-legales',
    nav: { fr: 'Mentions légales', en: 'Legal notice' },
    title: { fr: 'Mentions légales', en: 'Legal notice' },
    description: {
      fr: 'Informations légales d’ORALIGN : raison sociale, forme juridique, matricule fiscal, registre de commerce, propriété intellectuelle, données personnelles et paiement sécurisé.',
      en: 'ORALIGN legal information: company name, legal form, tax ID, trade register, intellectual property, personal data and secure payment.',
    },
  },
  privacy: {
    slug: 'politique-confidentialite',
    nav: { fr: 'Politique de confidentialité', en: 'Privacy policy' },
    title: { fr: 'Politique de confidentialité', en: 'Privacy policy' },
    description: {
      fr: 'Comment ORALIGN collecte, utilise, conserve et protège les données personnelles : finalités, partage, sécurité, paiement et droits des utilisateurs.',
      en: 'How ORALIGN collects, uses, retains and protects personal data: purposes, sharing, security, payment and user rights.',
    },
  },
  termsOfUse: {
    slug: 'conditions-utilisation',
    nav: { fr: 'Conditions générales d’utilisation', en: 'Terms of use' },
    title: { fr: 'Conditions générales d’utilisation', en: 'Terms of use' },
    description: {
      fr: 'Conditions générales d’utilisation de la plateforme ORALIGN : accès professionnel, sécurité du compte, responsabilité clinique du praticien, données patients, propriété intellectuelle, disponibilité et droit applicable.',
      en: 'Terms of use of the ORALIGN platform: professional access, account security, clinical responsibility, patient data, intellectual property, availability and governing law.',
    },
  },
  terms: {
    slug: 'conditions-vente',
    nav: { fr: 'Conditions de commande', en: 'Order terms' },
    title: {
      fr: 'Conditions de commande, de traitement, de fabrication et de livraison',
      en: 'Order, treatment, manufacturing and delivery terms',
    },
    description: {
      fr: 'Les étapes de prise en charge d’un dossier ORALIGN : dossier patient, frais d’étude, proposition et validation du plan, choix du pack, paiement, fabrication, délais et livraison.',
      en: 'The stages of handling an ORALIGN case: patient case, study fees, treatment proposal and plan validation, pack selection, payment, manufacturing, times and delivery.',
    },
  },
  contact: {
    slug: 'contact',
    nav: { fr: 'Contact', en: 'Contact' },
    title: { fr: 'Nous contacter', en: 'Contact us' },
    description: {
      fr: 'Contactez le service client ORALIGN : email, téléphone et adresse. Assistance disponible avant et après votre commande.',
      en: 'Contact ORALIGN customer support: email, phone and address. Help available before and after your order.',
    },
  },
};

/** Doc key → slug (for the route → content lookup on showcase pages). */
export const LEGAL_SLUGS = Object.fromEntries(
  (Object.keys(DOC_META) as LegalDocKey[]).map((k) => [k, DOC_META[k].slug]),
) as Record<LegalDocKey, string>;

/** Static meta for a doc (footer labels, SEO metadata) — no company needed. */
export function legalDocMeta(key: LegalDocKey, lang: LegalLang) {
  const b = base(lang);
  const m = DOC_META[key];
  return {
    slug: m.slug,
    href: `/${m.slug}`,
    navLabel: m.nav[b],
    title: `${m.title[b]} | ${BRAND}`,
    description: m.description[b],
  };
}

/** The compliance links {label, href} for the footer legal column. */
export function legalFooterLinks(lang: LegalLang): { label: string; href: string }[] {
  return FOOTER_LEGAL_KEYS.map((key) => {
    const meta = legalDocMeta(key, lang);
    return { label: meta.navLabel, href: meta.href };
  });
}

/**
 * The "Société / Company" footer column: Home + About + Contact. Home is
 * not a legal doc so it's built inline; the others come from `legalDocMeta`.
 */
export function companyFooterLinks(lang: LegalLang): { label: string; href: string }[] {
  const home = base(lang) === 'en' ? 'Home' : 'Accueil';
  return [
    { label: home, href: '/' },
    (() => {
      const m = legalDocMeta('about', lang);
      return { label: m.navLabel, href: m.href };
    })(),
    (() => {
      const m = legalDocMeta('contact', lang);
      return { label: m.navLabel, href: m.href };
    })(),
  ];
}

// ─── Localized UI strings ───────────────────────────────────────────────────

const STR = {
  eyebrow: { fr: 'Informations', en: 'Information' },
  placeholder: { fr: 'À compléter', en: 'To be completed' },
  contact: { fr: 'Contact', en: 'Contact' },
  complaintsContact: {
    fr: 'Contact réclamations',
    en: 'Complaints contact',
  },
  hostingTitle: { fr: 'Hébergement du site', en: 'Website hosting' },
  identityTitle: { fr: 'Identité de l’entreprise', en: 'Company identity' },
  ipTitle: { fr: 'Propriété intellectuelle', en: 'Intellectual property' },
  dataTitle: {
    fr: 'Données personnelles et données de santé',
    en: 'Personal data and health data',
  },
  paymentTitle: { fr: 'Paiement sécurisé', en: 'Secure payment' },
  responsibilityTitle: { fr: 'Responsabilité', en: 'Liability' },
  labels: {
    tradeName: { fr: 'Nom commercial et plateforme', en: 'Trade name and platform' },
    companyName: { fr: 'Dénomination sociale', en: 'Company name' },
    legalForm: { fr: 'Forme juridique', en: 'Legal form' },
    capital: { fr: 'Capital social', en: 'Share capital' },
    taxId: { fr: 'Matricule fiscal', en: 'Tax identification number' },
    rc: { fr: 'Identifiant unique (RNE)', en: 'Unique identifier (RNE)' },
    address: { fr: 'Adresse du siège social', en: 'Registered office address' },
    phone: { fr: 'Téléphone', en: 'Phone' },
    email: { fr: 'Email', en: 'Email' },
    host: { fr: 'Hébergeur', en: 'Hosting provider' },
    hostUrl: { fr: 'Site de l’hébergeur', en: 'Hosting provider website' },
  },
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function composeAddress(c: LegalCompany): string | null {
  const parts = [c.address, c.city, c.country].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  return parts.length ? parts.join(', ') : null;
}

function storeName(c: LegalCompany): string {
  return (c.tradeName || c.companyName || BRAND).trim();
}

function domain(c: LegalCompany): string {
  return (c.websiteDomain || 'oralign.com.tn').trim();
}

function row(
  label: string,
  value: string | null | undefined,
  lang: LegalLang,
  href?: (v: string) => string,
): LegalRow {
  const clean = value && value.trim() ? value.trim() : null;
  if (!clean) {
    return { label, value: STR.placeholder[base(lang)], missing: true };
  }
  return { label, value: clean, missing: false, href: href?.(clean) };
}

// ─── Document builders ──────────────────────────────────────────────────────

function buildAbout(lang: LegalLang, c: LegalCompany): LegalSection[] {
  const b = base(lang);
  const fr: LegalSection[] = [
    {
      heading: 'Découvrez ORALIGN',
      paragraphs: [
        'ORALIGN est une société tunisienne spécialisée dans la conception et la fabrication sur mesure d’aligneurs dentaires transparents et de solutions orthodontiques.',
        'Nous accompagnons les professionnels de santé dans la gestion de leurs traitements, depuis l’étude du dossier patient et la planification du traitement jusqu’à la fabrication et à la livraison des aligneurs.',
        'Notre objectif est de proposer des dispositifs de qualité, adaptés à chaque patient, ainsi qu’une plateforme simple et sécurisée permettant aux praticiens de transmettre leurs dossiers, suivre leurs commandes et échanger directement avec notre équipe d’assistance via le chat intégré à l’application.',
      ],
    },
    {
      heading: STR.contact[b],
      paragraphs: ['Pour toute demande, vous pouvez nous contacter :'],
      rows: [
        row(STR.labels.email[b], c.email, lang, (v) => `mailto:${v}`),
        row(STR.labels.phone[b], c.phone, lang, (v) => `tel:${v.replace(/\s+/g, '')}`),
      ],
    },
  ];
  const en: LegalSection[] = [
    {
      heading: 'About ORALIGN',
      paragraphs: [
        'ORALIGN is a Tunisian company specialized in the custom design and manufacturing of clear dental aligners and orthodontic solutions.',
        'We support healthcare professionals in managing their treatments — from reviewing the patient case and planning the treatment through to manufacturing and delivering the aligners.',
        'Our goal is to provide quality devices tailored to each patient, along with a simple and secure platform that lets practitioners submit their cases, track their orders, and talk directly with our support team through the chat built into the application.',
      ],
    },
    {
      heading: STR.contact[b],
      paragraphs: ['For any request, you can contact us:'],
      rows: [
        row(STR.labels.email[b], c.email, lang, (v) => `mailto:${v}`),
        row(STR.labels.phone[b], c.phone, lang, (v) => `tel:${v.replace(/\s+/g, '')}`),
      ],
    },
  ];
  return b === 'en' ? en : fr;
}

function buildRefunds(lang: LegalLang, c: LegalCompany): LegalSection[] {
  const b = base(lang);
  const contactRows = [
    row(STR.labels.email[b], c.email, lang, (v) => `mailto:${v}`),
    row(STR.labels.phone[b], c.phone, lang, (v) => `tel:${v.replace(/\s+/g, '')}`),
    row(STR.labels.address[b], composeAddress(c), lang),
  ];
  const fr: LegalSection[] = [
    {
      paragraphs: [
        'Vous rencontrez un souci avec un dossier patient, une commande, un paiement, un plan de traitement, la fabrication de vos aligneurs ou leur livraison ? Notre équipe support est là pour vous aider — adressez-nous simplement votre réclamation.',
        'Pour que nous puissions la traiter au plus vite, merci d’y joindre',
      ],
      list: [
        'le nom du praticien ou du client',
        'le numéro de commande ou du dossier patient',
        'la date de la commande',
        'une description précise du problème rencontré',
        'les photos, fichiers ou documents justificatifs utiles',
      ],
    },
    {
      paragraphs: [
        'Dès réception d’une réclamation complète, notre équipe s’engage à l’examiner sous un délai indicatif de 48 à 72 heures ouvrables.',
        'Nos aligneurs sont des dispositifs médicaux personnalisés, fabriqués sur mesure à partir des fichiers et informations que vous validez. Une fois la conception ou la fabrication lancée, une commande ne peut donc plus être annulée ni remboursée, sauf en cas d’erreur ou de non-conformité de notre fait.',
        'Après vérification, et selon la situation, nous vous proposerons la solution la plus adaptée : une correction, une nouvelle fabrication, un avoir ou un remboursement.',
        'Un remboursement reste également possible en cas de double paiement, d’annulation avant le début du traitement du dossier, ou si nous ne sommes pas en mesure de prendre votre commande en charge.',
        'Les délais de remboursement dépendent ensuite du moyen de paiement utilisé et des délais propres à votre établissement bancaire.',
        'Enfin, les professionnels de santé peuvent à tout moment joindre directement notre équipe via le chat intégré à l’application, pour toute question concernant leurs dossiers, leurs traitements ou leurs commandes.',
      ],
    },
    { heading: STR.complaintsContact[b], rows: contactRows },
  ];
  const en: LegalSection[] = [
    {
      paragraphs: [
        'Run into an issue with a patient case, an order, a payment, a treatment plan, the manufacturing of your aligners or their delivery? Our support team is here to help — just send us your complaint.',
        'So we can handle it as quickly as possible, please include',
      ],
      list: [
        'the practitioner’s or customer’s name',
        'the order number or patient case number',
        'the order date',
        'a precise description of the issue',
        'any helpful photos, files or supporting documents',
      ],
    },
    {
      paragraphs: [
        'As soon as we receive a complete complaint, our team commits to reviewing it within an indicative 48 to 72 business hours.',
        'Our aligners are personalized medical devices, custom-made from the files and information you validate. Once design or manufacturing has started, an order can therefore no longer be cancelled or refunded, except in the event of an error or non-conformity on our side.',
        'After verification, and depending on the situation, we will offer you the most suitable solution: a correction, a new production, a credit note or a refund.',
        'A refund also remains possible in the event of a double payment, a cancellation before the case has started processing, or if we are unable to take on your order.',
        'Refund times then depend on the payment method used and your bank’s own processing times.',
        'Finally, healthcare professionals can reach our team directly at any time through the chat built into the application, for any question about their cases, treatments or orders.',
      ],
    },
    { heading: STR.complaintsContact[b], rows: contactRows },
  ];
  return b === 'en' ? en : fr;
}

function buildLegal(lang: LegalLang, c: LegalCompany): LegalSection[] {
  const b = base(lang);
  // All dynamic company data comes from the injected `company` (loaded from
  // billing settings / the /legal-info projection) — never hardcoded here.
  const dom = domain(c); // websiteDomain
  const store = storeName(c); // nom commercial / plateforme (ORALIGN)
  const legalName = (c.companyName || store).trim(); // dénomination sociale
  const identityRows = [
    row(STR.labels.companyName[b], c.companyName, lang),
    row(STR.labels.tradeName[b], c.tradeName || c.companyName, lang),
    row(STR.labels.legalForm[b], c.legalForm, lang),
    row(STR.labels.capital[b], c.capitalSocial, lang),
    row(STR.labels.taxId[b], c.taxRegistrationNumber, lang),
    row(STR.labels.rc[b], c.registreDeCommerce, lang),
    row(STR.labels.address[b], composeAddress(c), lang),
    row(STR.labels.phone[b], c.phone, lang, (v) => `tel:${v.replace(/\s+/g, '')}`),
    row(STR.labels.email[b], c.email, lang, (v) => `mailto:${v}`),
  ];
  const fr: LegalSection[] = [
    {
      paragraphs: [
        `La plateforme ${store} est éditée par la société ${legalName}, société tunisienne spécialisée dans la conception et la fabrication d’aligneurs dentaires transparents et de dispositifs orthodontiques personnalisés.`,
      ],
    },
    { heading: STR.identityTitle[b], rows: identityRows },
    {
      paragraphs: [
        `Le site ${dom} ainsi que l’application ${store} sont édités et exploités par la société ${legalName}, immatriculée en Tunisie.`,
      ],
    },
    {
      heading: STR.ipTitle[b],
      paragraphs: [
        `L’ensemble des contenus présents sur le site et l’application ${store}, notamment les textes, images, photographies, logos, marques, éléments graphiques, interfaces, documents et contenus techniques, est protégé par la législation applicable en matière de propriété intellectuelle.`,
        `Toute reproduction, représentation, modification, diffusion ou utilisation, totale ou partielle, sans l’autorisation écrite préalable d’${legalName} est interdite.`,
      ],
    },
    {
      heading: STR.dataTitle[b],
      paragraphs: [
        `Dans le cadre de l’utilisation de la plateforme, ${store} peut collecter et traiter les informations nécessaires à la création et au suivi des dossiers patients, à la conception des plans de traitement, à la fabrication des aligneurs, à la gestion des commandes, à la facturation, au paiement, à la livraison et à l’assistance des professionnels de santé.`,
        'Ces informations peuvent notamment comprendre des données d’identification, des coordonnées, des photographies, des empreintes numériques, des scans, des radiographies, des fichiers médicaux ou orthodontiques et toute autre information nécessaire au traitement du dossier patient.',
        `Les données collectées sont traitées de manière confidentielle et sécurisée. Elles sont accessibles uniquement aux personnes autorisées et ne sont ni vendues ni utilisées à des fins étrangères aux services proposés par ${store}.`,
        'Les utilisateurs disposent, conformément à la législation applicable, d’un droit d’accès, de rectification, de mise à jour et, lorsque cela est légalement possible, d’opposition ou de suppression de leurs données personnelles.',
        'Toute demande relative aux données personnelles peut nous être adressée par e-mail, à l’adresse de contact indiquée ci-dessus.',
        'Des informations complémentaires sont disponibles dans notre Politique de confidentialité.',
      ],
    },
    {
      heading: STR.paymentTitle[b],
      paragraphs: [
        'Les paiements en ligne effectués sur la plateforme sont traités par l’intermédiaire d’une solution de paiement sécurisée.',
        `${store} ne conserve pas les données bancaires complètes du client lorsque celles-ci sont directement saisies et traitées par le prestataire de paiement sécurisé.`,
      ],
    },
    {
      heading: STR.responsibilityTitle[b],
      paragraphs: [
        `${store} met en œuvre les moyens nécessaires afin d’assurer l’exactitude et la disponibilité des informations publiées sur sa plateforme. Toutefois, la société ne peut garantir l’absence totale d’erreurs, d’interruptions temporaires ou de dysfonctionnements indépendants de sa volonté.`,
      ],
    },
  ];
  const en: LegalSection[] = [
    {
      paragraphs: [
        `The ${store} platform is published by ${legalName}, a Tunisian company specialized in the design and manufacturing of clear dental aligners and personalized orthodontic devices.`,
      ],
    },
    { heading: STR.identityTitle[b], rows: identityRows },
    {
      paragraphs: [
        `The ${dom} website and the ${store} application are published and operated by ${legalName}, a company registered in Tunisia.`,
      ],
    },
    {
      heading: STR.ipTitle[b],
      paragraphs: [
        `All content on the ${store} website and application, including text, images, photographs, logos, trademarks, graphic elements, interfaces, documents and technical content, is protected under the applicable intellectual property law.`,
        `Any reproduction, representation, modification, distribution or use, in whole or in part, without the prior written authorization of ${legalName}, is prohibited.`,
      ],
    },
    {
      heading: STR.dataTitle[b],
      paragraphs: [
        `As part of using the platform, ${store} may collect and process the information required to create and follow up patient cases, design treatment plans, manufacture aligners, manage orders, and handle invoicing, payment, delivery and support for healthcare professionals.`,
        'This information may include identification data, contact details, photographs, digital impressions, scans, radiographs, medical or orthodontic files, and any other information required to process the patient case.',
        `The data collected is processed confidentially and securely. It is accessible only to authorized persons and is neither sold nor used for purposes unrelated to the services offered by ${store}.`,
        'In accordance with applicable law, users have a right to access, correct and update their personal data and, where legally possible, to object to or delete it.',
        'Any request regarding personal data can be sent to us by email, at the contact address shown above.',
        'Further information is available in our Privacy Policy.',
      ],
    },
    {
      heading: STR.paymentTitle[b],
      paragraphs: [
        'Online payments made on the platform are processed through a secure payment solution.',
        `${store} does not retain the customer’s full banking details when these are entered and processed directly by the secure payment provider.`,
      ],
    },
    {
      heading: STR.responsibilityTitle[b],
      paragraphs: [
        `${store} takes the necessary measures to ensure the accuracy and availability of the information published on its platform. However, the company cannot guarantee the complete absence of errors, temporary interruptions or malfunctions beyond its control.`,
      ],
    },
  ];
  return b === 'en' ? en : fr;
}

function buildTerms(lang: LegalLang): LegalSection[] {
  const b = base(lang);
  // Brand references use the existing BRAND constant — the copy addresses the
  // ORALIGN platform (not the legal company name), which is fixed.
  const brand = BRAND;
  const fr: LegalSection[] = [
    {
      paragraphs: [
        `Les présentes conditions décrivent les différentes étapes de prise en charge d’un dossier patient sur la plateforme ${brand}, depuis la transmission des données cliniques jusqu’à la fabrication et à la livraison des gouttières.`,
      ],
    },
    {
      heading: '1. Création du dossier patient',
      paragraphs: [
        `Le praticien crée un dossier patient sur la plateforme ${brand} et transmet les informations nécessaires à l’étude du traitement.`,
        'Ces informations peuvent notamment comprendre les données d’identification du patient, les photographies cliniques, les empreintes numériques, les fichiers STL, les radiographies ainsi que les fichiers CBCT ou DICOM lorsqu’ils sont nécessaires.',
        'Avant de soumettre le dossier, le praticien doit vérifier que toutes les informations, images et pièces jointes sont complètes, correctes et associées au bon patient.',
      ],
    },
    {
      heading: '2. Paiement des frais d’étude',
      paragraphs: [
        'Après la transmission du dossier, le praticien procède au paiement des frais d’étude ou de traitement indiqués sur la plateforme.',
        'Les prix sont affichés dans la même devise que celle utilisée pour le paiement et incluent les taxes applicables, sauf indication contraire.',
        `Le paiement des frais d’étude permet à l’équipe ${brand} de commencer l’analyse du dossier et l’élaboration de la proposition de traitement.`,
        'Ces frais peuvent être distincts du prix du pack d’aligneurs choisi ultérieurement.',
      ],
    },
    {
      heading: '3. Étude et proposition de traitement',
      paragraphs: [
        `Après réception d’un dossier complet et confirmation du paiement, ${brand} procède à l’étude du cas et prépare une proposition de traitement.`,
        'La proposition est ensuite transmise au praticien par l’intermédiaire de la plateforme afin qu’il puisse l’examiner.',
        'Le praticien peut',
      ],
      list: [
        'approuver la proposition de traitement',
        'demander une ou plusieurs modifications',
        'transmettre des observations ou des instructions complémentaires',
      ],
      paragraphsAfter: [
        `Lorsque des modifications sont demandées, ${brand} révise la proposition et la soumet de nouveau au praticien pour validation.`,
      ],
    },
    {
      heading: '4. Validation du plan de traitement',
      paragraphs: [
        'La validation du plan de traitement relève de la responsabilité du praticien.',
        'Cette validation confirme que le praticien a examiné la proposition, vérifié les objectifs du traitement et approuvé les mouvements dentaires prévus.',
        'Aucune fabrication d’aligneurs n’est lancée avant la validation du plan de traitement par le praticien.',
      ],
    },
    {
      heading: '5. Proposition et choix du pack',
      paragraphs: [
        `Après validation du plan de traitement, ${brand} met à la disposition du praticien les packs ou offres correspondant au cas du patient.`,
        'Chaque offre peut préciser notamment',
      ],
      list: [
        'le prix du traitement',
        'le nombre estimé d’aligneurs',
        'les services inclus',
        'les éventuelles étapes ou tranches de paiement',
        'les conditions particulières applicables au pack',
      ],
      paragraphsAfter: [
        'Le praticien sélectionne le pack souhaité et confirme son approbation sur la plateforme.',
      ],
    },
    {
      heading: '6. Confirmation de la commande',
      paragraphs: ['La commande devient définitive après'],
      list: [
        'la réception d’un dossier complet',
        'le paiement des frais d’étude',
        'la validation du plan de traitement',
        'le choix et l’approbation du pack',
        'la confirmation du paiement exigé avant le lancement de la fabrication',
      ],
      paragraphsAfter: [
        'Une confirmation est ensuite transmise au praticien par e-mail, par notification dans l’application ou par tout autre moyen de contact renseigné sur son compte.',
      ],
    },
    {
      heading: '7. Paiement en une fois ou par tranches',
      paragraphs: [
        'Selon le pack sélectionné, le paiement peut être effectué en une seule fois ou en plusieurs tranches.',
        'Lorsqu’un paiement par tranches est proposé, chaque tranche peut correspondre à une étape du traitement et à un nombre déterminé de gouttières.',
        'Avant chaque paiement, la plateforme précise notamment',
      ],
      list: [
        'le montant de la tranche',
        'le numéro ou l’étape de la tranche',
        'le nombre de gouttières concernées',
        'les éventuelles conditions applicables à cette étape',
      ],
      paragraphsAfter: [
        'La fabrication de la série concernée débute uniquement après la confirmation du paiement de la tranche correspondante.',
        'Le non-paiement d’une tranche peut entraîner la suspension de la fabrication et de la livraison des séries suivantes.',
      ],
    },
    {
      heading: '8. Fabrication des gouttières',
      paragraphs: [
        `Après validation du plan, approbation du pack et confirmation du paiement applicable, ${brand} lance la fabrication des gouttières concernées.`,
        'En cas de paiement par tranches, seules les gouttières correspondant à la tranche payée sont mises en fabrication, sauf indication contraire dans l’offre sélectionnée.',
        'Toute demande de modification formulée après le lancement de la fabrication peut entraîner des frais supplémentaires, un nouveau délai ou l’impossibilité de modifier les dispositifs déjà fabriqués.',
      ],
    },
    {
      heading: '9. Délais de traitement et de fabrication',
      paragraphs: [
        `Les délais communiqués par ${brand} sont calculés à partir de la réception de l’ensemble des éléments nécessaires à chaque étape.`,
        'Ils peuvent notamment dépendre',
      ],
      list: [
        'de la qualité et de la complétude du dossier patient',
        'du délai de réponse du praticien',
        'du nombre de modifications demandées',
        'de la validation du plan de traitement',
        'du choix du pack',
        'de la confirmation du paiement',
        'du volume et de la complexité de la fabrication',
      ],
      paragraphsAfter: [
        'Tout retard lié à un dossier incomplet, à des fichiers inexploités, à une validation tardive ou à un paiement non confirmé peut entraîner un report du délai initial.',
      ],
    },
    {
      heading: '10. Livraison',
      paragraphs: [
        'Les gouttières fabriquées sont livrées à l’adresse renseignée et confirmée par le praticien sur la plateforme.',
        'En cas de paiement par tranches, les livraisons peuvent être effectuées progressivement, selon le nombre de gouttières prévu pour chaque tranche.',
        'Les délais et frais de livraison peuvent varier selon la zone de livraison, le transporteur, le volume du colis et les contraintes liées au transport.',
        'Le praticien doit vérifier l’exactitude de l’adresse, du numéro de téléphone et des informations du destinataire avant chaque expédition.',
      ],
    },
    {
      heading: '11. Réception de la commande',
      paragraphs: ['À la réception, le praticien doit vérifier'],
      list: [
        'l’état du colis',
        'le nom ou la référence du patient',
        'le numéro de la série ou de la tranche',
        'le nombre de gouttières reçues',
        'la conformité apparente des dispositifs',
      ],
      paragraphsAfter: [
        `Toute erreur, détérioration ou non-conformité doit être signalée à ${brand} dans les meilleurs délais, accompagnée des photographies et justificatifs nécessaires.`,
        'Une gouttière présentant une anomalie ou ne correspondant pas au dossier patient concerné ne doit pas être remise au patient.',
      ],
    },
    {
      heading: '12. Indisponibilité ou impossibilité de fabrication',
      paragraphs: [
        `Lorsqu’${brand} ne peut pas poursuivre l’étude, la fabrication ou la livraison d’une commande, le praticien est informé dans les meilleurs délais.`,
        `Selon la situation et l’état d’avancement du dossier, ${brand} pourra proposer`,
      ],
      list: [
        'la correction ou le remplacement des fichiers transmis',
        'une modification de la proposition de traitement',
        'une nouvelle fabrication',
        'un avoir',
        'un remboursement des sommes concernées',
      ],
    },
    {
      heading: `13. Retards indépendants d’${brand}`,
      paragraphs: [
        `${brand} ne peut être tenue responsable des retards causés par des circonstances raisonnablement indépendantes de sa volonté, notamment`,
      ],
      list: [
        'un retard du transporteur',
        'une adresse incorrecte ou incomplète',
        'l’absence du destinataire',
        'une interruption technique majeure',
        'une indisponibilité exceptionnelle des matières premières',
        'un cas de force majeure',
      ],
      paragraphsAfter: [
        `Dans une telle situation, ${brand} informe le praticien et prend les mesures raisonnables afin de limiter les conséquences sur la commande.`,
      ],
    },
    {
      heading: '14. Assistance',
      paragraphs: [
        `Le praticien peut suivre l’avancement de ses dossiers, traitements, paiements, fabrications et livraisons depuis son compte ${brand}.`,
        'Il peut également contacter l’équipe support directement via le chat intégré à l’application pour toute question relative à un dossier patient, un plan de traitement, un pack, une tranche de paiement, une fabrication ou une livraison.',
      ],
    },
  ];
  const en: LegalSection[] = [
    {
      paragraphs: [
        `These terms describe the different stages in handling a patient case on the ${brand} platform, from the submission of clinical data through to the manufacturing and delivery of the aligners.`,
      ],
    },
    {
      heading: '1. Creating the patient case',
      paragraphs: [
        `The practitioner creates a patient case on the ${brand} platform and submits the information required to study the treatment.`,
        'This information may notably include the patient’s identification data, clinical photographs, digital impressions, STL files, radiographs, and CBCT or DICOM files where required.',
        'Before submitting the case, the practitioner must check that all information, images and attachments are complete, correct and associated with the right patient.',
      ],
    },
    {
      heading: '2. Payment of study fees',
      paragraphs: [
        'After submitting the case, the practitioner pays the study or treatment fees shown on the platform.',
        'Prices are displayed in the same currency as the one used for payment and include applicable taxes, unless otherwise stated.',
        `Payment of the study fees allows the ${brand} team to begin analyzing the case and preparing the treatment proposal.`,
        'These fees may be separate from the price of the aligner pack chosen later.',
      ],
    },
    {
      heading: '3. Study and treatment proposal',
      paragraphs: [
        `After receiving a complete case and confirming payment, ${brand} studies the case and prepares a treatment proposal.`,
        'The proposal is then sent to the practitioner through the platform so that it can be reviewed.',
        'The practitioner can',
      ],
      list: [
        'approve the treatment proposal',
        'request one or more changes',
        'send additional comments or instructions',
      ],
      paragraphsAfter: [
        `When changes are requested, ${brand} revises the proposal and submits it again to the practitioner for validation.`,
      ],
    },
    {
      heading: '4. Treatment plan validation',
      paragraphs: [
        'Validating the treatment plan is the practitioner’s responsibility.',
        'This validation confirms that the practitioner has reviewed the proposal, checked the treatment objectives and approved the planned tooth movements.',
        'No aligner manufacturing is started before the practitioner validates the treatment plan.',
      ],
    },
    {
      heading: '5. Pack proposal and selection',
      paragraphs: [
        `After the treatment plan is validated, ${brand} makes available to the practitioner the packs or offers matching the patient’s case.`,
        'Each offer may specify, in particular',
      ],
      list: [
        'the treatment price',
        'the estimated number of aligners',
        'the services included',
        'any payment stages or installments',
        'the specific conditions applicable to the pack',
      ],
      paragraphsAfter: [
        'The practitioner selects the desired pack and confirms their approval on the platform.',
      ],
    },
    {
      heading: '6. Order confirmation',
      paragraphs: ['The order becomes final after'],
      list: [
        'receipt of a complete case',
        'payment of the study fees',
        'validation of the treatment plan',
        'selection and approval of the pack',
        'confirmation of the payment required before manufacturing starts',
      ],
      paragraphsAfter: [
        'A confirmation is then sent to the practitioner by email, by in-app notification or by any other contact method provided on their account.',
      ],
    },
    {
      heading: '7. One-time or installment payment',
      paragraphs: [
        'Depending on the selected pack, payment can be made as a one-time payment or in several installments.',
        'When installment payment is offered, each installment may correspond to a treatment stage and to a defined number of aligners.',
        'Before each payment, the platform specifies, in particular',
      ],
      list: [
        'the installment amount',
        'the installment number or stage',
        'the number of aligners concerned',
        'any conditions applicable to that stage',
      ],
      paragraphsAfter: [
        'Manufacturing of the series concerned begins only after the corresponding installment payment is confirmed.',
        'Failure to pay an installment may lead to the suspension of the manufacturing and delivery of the following series.',
      ],
    },
    {
      heading: '8. Manufacturing the aligners',
      paragraphs: [
        `After the plan is validated, the pack is approved and the applicable payment is confirmed, ${brand} starts manufacturing the aligners concerned.`,
        'In the case of installment payment, only the aligners corresponding to the paid installment are put into production, unless otherwise stated in the selected offer.',
        'Any change requested after manufacturing has started may result in additional fees, a new lead time, or the impossibility of modifying devices already manufactured.',
      ],
    },
    {
      heading: '9. Treatment and manufacturing times',
      paragraphs: [
        `The times communicated by ${brand} are calculated from the receipt of all the elements required at each stage.`,
        'They may notably depend on',
      ],
      list: [
        'the quality and completeness of the patient case',
        'the practitioner’s response time',
        'the number of changes requested',
        'the validation of the treatment plan',
        'the choice of pack',
        'the confirmation of payment',
        'the volume and complexity of the manufacturing',
      ],
      paragraphsAfter: [
        'Any delay linked to an incomplete case, unused files, late validation or unconfirmed payment may push back the initial time frame.',
      ],
    },
    {
      heading: '10. Delivery',
      paragraphs: [
        'The manufactured aligners are delivered to the address entered and confirmed by the practitioner on the platform.',
        'In the case of installment payment, deliveries may be made progressively, according to the number of aligners planned for each installment.',
        'Delivery times and costs may vary depending on the delivery area, the carrier, the parcel volume and transport-related constraints.',
        'The practitioner must check the accuracy of the address, phone number and recipient information before each shipment.',
      ],
    },
    {
      heading: '11. Receiving the order',
      paragraphs: ['On receipt, the practitioner must check'],
      list: [
        'the condition of the parcel',
        'the patient’s name or reference',
        'the series or installment number',
        'the number of aligners received',
        'the apparent conformity of the devices',
      ],
      paragraphsAfter: [
        `Any error, damage or non-conformity must be reported to ${brand} as soon as possible, together with the necessary photographs and supporting documents.`,
        'An aligner showing an anomaly or not matching the patient case concerned must not be given to the patient.',
      ],
    },
    {
      heading: '12. Unavailability or inability to manufacture',
      paragraphs: [
        `When ${brand} cannot continue the study, manufacturing or delivery of an order, the practitioner is informed as soon as possible.`,
        `Depending on the situation and how far the case has progressed, ${brand} may offer`,
      ],
      list: [
        'the correction or replacement of the submitted files',
        'a change to the treatment proposal',
        'a new production',
        'a credit note',
        'a refund of the amounts concerned',
      ],
    },
    {
      heading: `13. Delays beyond ${brand}’s control`,
      paragraphs: [
        `${brand} cannot be held responsible for delays caused by circumstances reasonably beyond its control, in particular`,
      ],
      list: [
        'a carrier delay',
        'an incorrect or incomplete address',
        'the recipient’s absence',
        'a major technical interruption',
        'an exceptional unavailability of raw materials',
        'an event of force majeure',
      ],
      paragraphsAfter: [
        `In such a situation, ${brand} informs the practitioner and takes reasonable measures to limit the consequences on the order.`,
      ],
    },
    {
      heading: '14. Support',
      paragraphs: [
        `The practitioner can track the progress of their cases, treatments, payments, manufacturing and deliveries from their ${brand} account.`,
        'They can also contact the support team directly through the chat built into the application for any question about a patient case, a treatment plan, a pack, a payment installment, manufacturing or delivery.',
      ],
    },
  ];
  return b === 'en' ? en : fr;
}

function buildPrivacy(lang: LegalLang, c: LegalCompany): LegalSection[] {
  const b = base(lang);
  // Platform via BRAND ('ORALIGN'); operating company (dénomination sociale)
  // from the injected company data.
  const brand = BRAND;
  const legalName = (c.companyName || brand).trim();
  const fr: LegalSection[] = [
    {
      paragraphs: [
        `La présente Politique de confidentialité explique comment ${legalName}, exploitant la plateforme ${brand}, collecte, utilise, conserve et protège les données personnelles des professionnels de santé, des utilisateurs de la plateforme et des patients concernés par les dossiers orthodontiques transmis.`,
        `${brand} accorde une importance particulière à la confidentialité et à la protection des données personnelles, notamment des données cliniques et des données relatives à la santé.`,
      ],
    },
    {
      heading: 'Données collectées',
      paragraphs: [
        `Dans le cadre de l’utilisation de la plateforme, ${brand} peut collecter les catégories de données suivantes`,
      ],
      list: [
        'les informations d’identification et de contact du praticien',
        'les informations professionnelles et les données du compte utilisateur',
        'les informations relatives aux devis, commandes, paiements et factures',
        'les données nécessaires à la gestion des dossiers patients',
        'les photographies cliniques',
        'les empreintes numériques et fichiers STL',
        'les radiographies et fichiers CBCT ou DICOM',
        'les observations, prescriptions et instructions du praticien',
        'les plans et propositions de traitement',
        'les échanges effectués avec l’équipe support',
        'les données techniques de connexion et d’utilisation de la plateforme',
      ],
    },
    {
      heading: 'Origine des données des patients',
      paragraphs: [
        `Les données relatives aux patients sont principalement collectées et transmises à ${brand} par le professionnel de santé chargé de leur traitement.`,
        'Avant de transmettre un dossier patient, le praticien doit s’assurer qu’il dispose des autorisations et consentements nécessaires et qu’il a informé le patient de l’utilisation de ses données dans le cadre de l’étude, de la planification et de la fabrication du traitement orthodontique.',
      ],
    },
    {
      heading: 'Finalités du traitement',
      paragraphs: [
        `Les données collectées sont utilisées uniquement pour les besoins liés aux services ${brand}, notamment pour`,
      ],
      list: [
        'créer et gérer les comptes utilisateurs',
        'vérifier les informations professionnelles des praticiens',
        'créer, analyser et suivre les dossiers patients',
        'préparer et modifier les propositions de traitement',
        'permettre au praticien de valider le plan de traitement',
        'proposer les packs adaptés au dossier patient',
        'traiter les paiements, y compris les paiements par tranches',
        'concevoir et fabriquer les gouttières',
        'organiser et suivre les livraisons',
        'fournir une assistance via le chat intégré à l’application',
        'gérer les réclamations et les demandes de remboursement',
        'assurer la sécurité et le bon fonctionnement de la plateforme',
        'respecter les obligations légales, administratives, comptables et réglementaires applicables',
      ],
      paragraphsAfter: [
        'Les données relatives à la santé ne sont pas utilisées à des fins publicitaires.',
      ],
    },
    {
      heading: 'Partage des données',
      paragraphs: [
        `${brand} ne vend pas les données personnelles, cliniques ou médicales à des tiers.`,
        `Les données peuvent être communiquées uniquement aux personnes autorisées au sein d’${brand} ainsi qu’aux prestataires nécessaires au fonctionnement du service, notamment pour`,
      ],
      list: [
        'l’hébergement et le stockage sécurisé des données',
        'la maintenance de la plateforme',
        'le traitement des paiements',
        'l’envoi des notifications et des e-mails',
        'la livraison des commandes',
        'la sauvegarde et la sécurité des systèmes',
      ],
      paragraphsAfter: [
        'Ces prestataires peuvent accéder uniquement aux informations nécessaires à l’exécution de leurs missions et sont tenus de respecter des obligations de confidentialité et de sécurité.',
        'Les données peuvent également être communiquées aux autorités compétentes lorsque cette transmission est exigée par la loi.',
      ],
    },
    {
      heading: 'Paiement sécurisé',
      paragraphs: [
        'Les paiements en ligne sont traités par l’intermédiaire d’une solution de paiement sécurisée.',
        `Lorsque les données bancaires sont directement saisies sur l’interface du prestataire de paiement, ${brand} ne reçoit pas et ne conserve pas les informations bancaires complètes de l’utilisateur.`,
        `${brand} peut toutefois conserver les informations nécessaires au suivi de la transaction, notamment le montant, la date, le statut du paiement et la référence de la transaction.`,
      ],
    },
    {
      heading: 'Conservation des données',
      paragraphs: [
        'Les données sont conservées pendant la durée nécessaire à la réalisation des finalités pour lesquelles elles ont été collectées.',
        'Certaines informations peuvent être conservées plus longtemps lorsqu’une durée particulière est exigée pour la facturation, la traçabilité des dispositifs, la gestion des réclamations, le respect des obligations légales ou la défense des droits des parties.',
        'À l’expiration de la durée applicable, les données sont supprimées, anonymisées ou archivées de manière sécurisée.',
      ],
    },
    {
      heading: 'Sécurité et confidentialité',
      paragraphs: [
        `${brand} met en œuvre des mesures techniques et organisationnelles adaptées afin de protéger les données contre`,
      ],
      list: [
        'les accès non autorisés',
        'la perte ou la destruction accidentelle',
        'la modification non autorisée',
        'la divulgation ou l’utilisation abusive',
        'les incidents affectant la disponibilité ou la confidentialité des fichiers',
      ],
      paragraphsAfter: [
        'L’accès aux dossiers patients est limité aux utilisateurs et aux membres de l’équipe autorisés qui en ont besoin pour exécuter leurs missions.',
        'L’utilisateur est responsable de la confidentialité de ses identifiants et doit signaler immédiatement toute utilisation non autorisée de son compte.',
      ],
    },
    {
      heading: 'Droits des utilisateurs et des patients',
      paragraphs: [
        'Conformément à la législation applicable, toute personne concernée peut demander',
      ],
      list: [
        'l’accès aux données personnelles la concernant',
        'la correction ou la mise à jour de données inexactes',
        'la suppression des données lorsque celle-ci est légalement possible',
        'l’opposition à certains traitements pour des motifs légitimes',
        'le retrait de son consentement lorsque le traitement repose sur celui-ci',
      ],
      paragraphsAfter: [
        'Les demandes relatives à un dossier patient peuvent être traitées en coordination avec le professionnel de santé ayant créé ou transmis le dossier.',
        `Toute demande peut être adressée à ${brand} en utilisant l’adresse e-mail de contact affichée sur la plateforme.`,
      ],
    },
    {
      heading: 'Modification de la politique',
      paragraphs: [
        `${brand} peut mettre à jour la présente Politique de confidentialité afin de tenir compte de l’évolution de la plateforme, de ses services, de ses procédures ou de la réglementation applicable.`,
        'La date de la dernière mise à jour est affichée sur la page.',
        'Dernière mise à jour le 13 juillet 2026.',
      ],
    },
  ];
  const en: LegalSection[] = [
    {
      paragraphs: [
        `This Privacy Policy explains how ${legalName}, operating the ${brand} platform, collects, uses, retains and protects the personal data of healthcare professionals, platform users and the patients involved in the orthodontic cases submitted.`,
        `${brand} places particular importance on the confidentiality and protection of personal data, in particular clinical data and health-related data.`,
      ],
    },
    {
      heading: 'Data we collect',
      paragraphs: [
        `As part of using the platform, ${brand} may collect the following categories of data`,
      ],
      list: [
        'the practitioner’s identification and contact details',
        'professional information and user account data',
        'information related to quotations, orders, payments and invoices',
        'the data required to manage patient cases',
        'clinical photographs',
        'digital impressions and STL files',
        'radiographs and CBCT or DICOM files',
        'the practitioner’s observations, prescriptions and instructions',
        'treatment plans and proposals',
        'exchanges with the support team',
        'technical data on connection to and use of the platform',
      ],
    },
    {
      heading: 'Origin of patient data',
      paragraphs: [
        `Patient data is mainly collected and transmitted to ${brand} by the healthcare professional responsible for their treatment.`,
        'Before transmitting a patient case, the practitioner must ensure that they have the necessary authorizations and consents and that they have informed the patient about the use of their data for the study, planning and manufacturing of the orthodontic treatment.',
      ],
    },
    {
      heading: 'Purposes of processing',
      paragraphs: [
        `The data collected is used solely for purposes related to ${brand}’s services, in particular to`,
      ],
      list: [
        'create and manage user accounts',
        'verify practitioners’ professional information',
        'create, analyze and track patient cases',
        'prepare and modify treatment proposals',
        'allow the practitioner to validate the treatment plan',
        'offer the packs suited to the patient case',
        'process payments, including installment payments',
        'design and manufacture the aligners',
        'organize and track deliveries',
        'provide support through the chat built into the application',
        'handle complaints and refund requests',
        'ensure the security and proper operation of the platform',
        'comply with applicable legal, administrative, accounting and regulatory obligations',
      ],
      paragraphsAfter: [
        'Health-related data is not used for advertising purposes.',
      ],
    },
    {
      heading: 'Data sharing',
      paragraphs: [
        `${brand} does not sell personal, clinical or medical data to third parties.`,
        `Data may be shared only with authorized persons within ${brand} and with the providers necessary for the operation of the service, in particular for`,
      ],
      list: [
        'hosting and secure storage of data',
        'maintenance of the platform',
        'payment processing',
        'sending notifications and emails',
        'delivery of orders',
        'system backup and security',
      ],
      paragraphsAfter: [
        'These providers can access only the information necessary to perform their tasks and are bound by confidentiality and security obligations.',
        'Data may also be disclosed to the competent authorities where such disclosure is required by law.',
      ],
    },
    {
      heading: 'Secure payment',
      paragraphs: [
        'Online payments are processed through a secure payment solution.',
        `When banking details are entered directly on the payment provider’s interface, ${brand} does not receive or retain the user’s full banking information.`,
        `${brand} may, however, retain the information required to track the transaction, in particular the amount, date, payment status and transaction reference.`,
      ],
    },
    {
      heading: 'Data retention',
      paragraphs: [
        'Data is retained for as long as necessary to fulfill the purposes for which it was collected.',
        'Some information may be retained longer when a specific period is required for invoicing, device traceability, complaint handling, compliance with legal obligations or the defense of the parties’ rights.',
        'Once the applicable period expires, the data is deleted, anonymized or securely archived.',
      ],
    },
    {
      heading: 'Security and confidentiality',
      paragraphs: [
        `${brand} implements appropriate technical and organizational measures to protect data against`,
      ],
      list: [
        'unauthorized access',
        'accidental loss or destruction',
        'unauthorized modification',
        'disclosure or misuse',
        'incidents affecting the availability or confidentiality of the files',
      ],
      paragraphsAfter: [
        'Access to patient cases is limited to authorized users and team members who need it to perform their tasks.',
        'The user is responsible for the confidentiality of their credentials and must immediately report any unauthorized use of their account.',
      ],
    },
    {
      heading: 'Rights of users and patients',
      paragraphs: [
        'In accordance with applicable law, any data subject may request',
      ],
      list: [
        'access to the personal data concerning them',
        'the correction or updating of inaccurate data',
        'the deletion of data where this is legally possible',
        'objection to certain processing on legitimate grounds',
        'the withdrawal of their consent where the processing is based on it',
      ],
      paragraphsAfter: [
        'Requests relating to a patient case may be handled in coordination with the healthcare professional who created or transmitted the case.',
        `Any request can be sent to ${brand} using the contact email address shown on the platform.`,
      ],
    },
    {
      heading: 'Changes to this policy',
      paragraphs: [
        `${brand} may update this Privacy Policy to take into account changes in the platform, its services, its procedures or the applicable regulations.`,
        'The date of the last update is shown on the page.',
        'Last updated on 13 July 2026.',
      ],
    },
  ];
  return b === 'en' ? en : fr;
}

function buildTermsOfUse(lang: LegalLang, c: LegalCompany): LegalSection[] {
  const b = base(lang);
  // Platform references use the fixed BRAND ('ORALIGN'); the operating company
  // (dénomination sociale) comes from the injected company data.
  const brand = BRAND;
  const legalName = (c.companyName || brand).trim();
  const fr: LegalSection[] = [
    {
      paragraphs: [
        `Les présentes Conditions générales d’utilisation, ci-après les « CGU », régissent l’accès et l’utilisation du site, de l’application et des services numériques ${brand}, exploités par la société ${legalName}.`,
        `La plateforme ${brand} est un outil professionnel destiné principalement aux chirurgiens-dentistes, orthodontistes et autres professionnels de santé dentaire autorisés. Elle permet notamment de créer et gérer des dossiers patients, transmettre des données cliniques, demander une étude orthodontique, consulter et valider une proposition de traitement, choisir un pack, effectuer des paiements, suivre la fabrication des gouttières et échanger avec l’équipe support.`,
        'L’utilisation de la plateforme implique l’acceptation pleine et entière des présentes CGU, de la Politique de confidentialité et, lorsqu’une commande est effectuée, des Conditions de commande, de traitement, de fabrication et de livraison.',
      ],
    },
    {
      heading: '1. Accès professionnel à la plateforme',
      paragraphs: [
        `L’accès aux fonctionnalités professionnelles d’${brand} est réservé aux professionnels de santé dentaire légalement habilités à exercer leur activité.`,
        'Lors de la création de son compte, l’utilisateur s’engage à fournir des informations exactes, complètes et à jour concernant son identité, ses coordonnées et son activité professionnelle.',
        `${brand} peut demander tout document ou renseignement nécessaire afin de vérifier l’identité, la qualité professionnelle ou l’autorisation d’exercice de l’utilisateur.`,
        `${brand} se réserve le droit de refuser, suspendre ou supprimer l’accès à un compte lorsque`,
      ],
      list: [
        'les informations fournies sont inexactes ou incomplètes',
        'la qualité professionnelle de l’utilisateur ne peut pas être vérifiée',
        'le compte est utilisé par une personne non autorisée',
        'l’utilisateur ne respecte pas les présentes CGU',
        'une utilisation frauduleuse, abusive ou dangereuse de la plateforme est constatée',
      ],
    },
    {
      heading: '2. Création et sécurité du compte',
      paragraphs: [
        'Chaque compte est personnel et ne peut être utilisé que par son titulaire ou par les membres de son équipe expressément autorisés, sous sa responsabilité.',
        'L’utilisateur est responsable',
      ],
      list: [
        'de la confidentialité de ses identifiants et mots de passe',
        'des accès accordés aux membres de son cabinet ou de son équipe',
        'des actions réalisées depuis son compte',
        'de la mise à jour de ses informations professionnelles',
        'de la déconnexion de son compte lorsqu’il utilise un appareil partagé',
      ],
      paragraphsAfter: [
        'Les identifiants ne doivent pas être communiqués à une personne non autorisée.',
        `En cas de perte, de vol, d’utilisation non autorisée ou de suspicion de compromission de son compte, l’utilisateur doit immédiatement modifier son mot de passe et prévenir l’équipe support ${brand}.`,
      ],
    },
    {
      heading: '3. Fonctionnement général du service',
      paragraphs: ['La plateforme permet notamment au praticien de'],
      list: [
        'créer et administrer ses dossiers patients',
        'téléverser des photographies et des fichiers cliniques',
        'transmettre des empreintes numériques et des fichiers STL',
        'transmettre, lorsque cela est nécessaire, des radiographies ou des fichiers CBCT/DICOM',
        'payer les frais d’étude du dossier',
        'consulter une proposition de traitement',
        'demander des modifications',
        'approuver le plan de traitement',
        'consulter et choisir les packs proposés',
        'approuver une offre',
        'effectuer un paiement en une seule fois ou par tranches',
        'suivre les étapes de fabrication et de livraison',
        'échanger avec l’équipe support via le chat intégré à l’application',
      ],
      paragraphsAfter: [
        'Les modalités commerciales, les paiements, les étapes de fabrication et les livraisons sont détaillés dans les Conditions de commande, de traitement, de fabrication et de livraison.',
      ],
    },
    {
      heading: '4. Utilisation conforme de la plateforme',
      paragraphs: [
        'L’utilisateur s’engage à utiliser la plateforme exclusivement dans le cadre de son activité professionnelle et conformément à sa destination.',
        'Il s’engage notamment à',
      ],
      list: [
        'fournir des informations exactes, complètes et actualisées',
        'vérifier les dossiers, photographies, fichiers et informations avant leur soumission',
        'associer chaque document au bon patient',
        'ne téléverser que les données nécessaires au traitement du dossier',
        'utiliser des fichiers conformes aux formats et exigences techniques indiqués',
        'respecter les droits des patients et la confidentialité de leurs informations',
        'vérifier les propositions de traitement avant leur validation',
        `ne pas utiliser la plateforme à des fins illégales, frauduleuses ou étrangères aux services d’${brand}`,
      ],
    },
    {
      paragraphs: ['Il est notamment interdit'],
      list: [
        'de tenter d’accéder au compte ou aux dossiers d’un autre utilisateur',
        'de contourner les mécanismes de sécurité ou les contrôles d’accès',
        'd’introduire des virus, logiciels malveillants ou fichiers dangereux',
        'de perturber ou surcharger volontairement la plateforme',
        'de copier, extraire ou exploiter massivement les données de la plateforme',
        'd’utiliser des outils automatisés non autorisés',
        'de modifier, décompiler ou tenter de reconstituer le fonctionnement technique de la plateforme',
        'de publier ou transmettre un contenu illicite, trompeur, offensant ou portant atteinte aux droits d’un tiers',
      ],
    },
    {
      heading: '5. Données et consentement du patient',
      paragraphs: [
        `Avant de créer un dossier patient ou de transmettre des informations cliniques à ${brand}, le praticien doit s’assurer qu’il dispose d’une base légale appropriée ainsi que des autorisations et consentements nécessaires.`,
        'Le praticien est notamment responsable',
      ],
      list: [
        'de l’information du patient sur la transmission et le traitement de ses données',
        'de l’obtention du consentement du patient lorsque celui-ci est requis',
        'de l’autorisation du représentant légal lorsque le patient est mineur ou placé sous protection juridique',
        'de la licéité de la collecte des photographies, radiographies, scans et autres données cliniques',
        'de l’exactitude et de la pertinence des informations transmises',
        'du respect du secret professionnel et de la confidentialité médicale',
      ],
      paragraphsAfter: [
        `L’utilisateur ne doit pas transmettre à ${brand} des informations sans rapport avec le traitement orthodontique ou dont la collecte n’est pas nécessaire.`,
        'Les conditions de collecte, d’utilisation, de conservation et de protection des données sont détaillées dans la Politique de confidentialité.',
      ],
    },
    {
      heading: '6. Responsabilité clinique du praticien',
      paragraphs: [
        `${brand} fournit une plateforme de gestion, une assistance technique, des services d’étude, de planification et de fabrication de dispositifs orthodontiques personnalisés.`,
        `La plateforme et l’équipe ${brand} ne remplacent pas le jugement, le diagnostic ou la surveillance clinique du professionnel de santé.`,
        'Le praticien reste seul responsable',
      ],
      list: [
        'de l’examen clinique du patient',
        'du diagnostic',
        'de l’indication du traitement par aligneurs',
        'de la vérification des éventuelles contre-indications',
        'des examens médicaux et radiologiques nécessaires',
        'de la prescription du traitement',
        'des objectifs thérapeutiques',
        'de la validation du plan de traitement',
        'de la fréquence de changement des gouttières',
        'du suivi clinique du patient',
        'de la gestion des complications, urgences ou effets indésirables',
        'de la décision de poursuivre, modifier, interrompre ou compléter le traitement',
      ],
      paragraphsAfter: [
        'Toute proposition de traitement mise à disposition sur la plateforme doit être examinée et validée par le praticien avant le lancement de la fabrication.',
        'La validation électronique du plan signifie que le praticien l’a examiné et qu’il autorise la fabrication des gouttières conformément aux éléments approuvés.',
      ],
    },
    {
      heading: '7. Modifications du plan de traitement',
      paragraphs: [
        'Avant de valider une proposition, le praticien peut transmettre ses observations et demander les modifications disponibles selon le service ou le pack concerné.',
        'Il doit vérifier attentivement',
      ],
      list: [
        'l’identité et la référence du patient',
        'les données cliniques utilisées',
        'les mouvements dentaires proposés',
        'les objectifs du traitement',
        'le nombre estimé de gouttières',
        'les éventuelles réductions interproximales, taquets ou instructions cliniques',
        'toute autre information affichée dans la proposition',
      ],
      paragraphsAfter: [
        'Toute modification demandée après la validation du plan ou le lancement de la fabrication peut entraîner un délai supplémentaire, des frais additionnels ou l’impossibilité de modifier les gouttières déjà fabriquées.',
      ],
    },
    {
      heading: '8. Chat et service support',
      paragraphs: [
        'Les professionnels de santé peuvent contacter l’équipe support via le chat intégré à l’application.',
        'Le support peut notamment accompagner l’utilisateur pour',
      ],
      list: [
        'l’utilisation de la plateforme',
        'la transmission des fichiers',
        'le suivi d’un dossier',
        'la compréhension des différentes étapes',
        'les demandes de modification',
        'le choix ou le suivi d’un pack',
        'les paiements et les tranches',
        'la fabrication et la livraison',
      ],
      paragraphsAfter: [
        'Les échanges avec le support ne remplacent pas le diagnostic, la décision clinique ou le suivi médical assuré par le praticien.',
        'L’utilisateur doit éviter de transmettre dans le chat des données qui ne sont pas nécessaires au traitement de sa demande.',
      ],
    },
    {
      heading: '9. Paiements et commandes',
      paragraphs: [
        'La création d’un compte ou la consultation de la plateforme ne constitue pas automatiquement une commande.',
        'Selon le fonctionnement du service, le praticien peut être amené à effectuer successivement',
      ],
      list: [
        'le paiement des frais d’étude',
        'la validation de la proposition de traitement',
        'le choix et l’approbation d’un pack',
        'le paiement intégral du pack ou le paiement d’une tranche',
        'la confirmation du lancement de la fabrication',
      ],
      paragraphsAfter: [
        'Lorsqu’un paiement par tranches est proposé, chaque tranche peut correspondre à une étape du traitement et à un nombre déterminé de gouttières.',
        'La fabrication de la série concernée peut être conditionnée par la confirmation du paiement correspondant.',
        'Les règles applicables aux prix, commandes, annulations, remboursements, paiements, fabrications et livraisons sont définies dans les Conditions de commande, de traitement, de fabrication et de livraison.',
      ],
    },
    {
      heading: '10. Contenus et fichiers transmis par l’utilisateur',
      paragraphs: [
        'L’utilisateur conserve les droits dont il dispose sur les données, documents, images et fichiers qu’il transmet sur la plateforme.',
        'Il garantit qu’il est autorisé à utiliser et à transmettre ces éléments dans le cadre du service demandé.',
        `L’utilisateur autorise ${brand}, pour la durée nécessaire à l’exécution du service, à accéder, utiliser, adapter techniquement, reproduire et traiter les éléments transmis uniquement afin de`,
      ],
      list: [
        'étudier le dossier',
        'préparer la proposition de traitement',
        'fabriquer les dispositifs',
        'assurer le contrôle qualité',
        'gérer la commande et la livraison',
        'fournir l’assistance demandée',
        'respecter les obligations légales et réglementaires applicables',
      ],
      paragraphsAfter: [
        `Cette autorisation ne permet pas à ${brand} de vendre les données personnelles ou cliniques à des tiers.`,
      ],
    },
    {
      heading: `11. Propriété intellectuelle d’${brand}`,
      paragraphs: [
        'La plateforme ainsi que l’ensemble de ses éléments sont protégés par la législation applicable en matière de propriété intellectuelle.',
        'Cela comprend notamment',
      ],
      list: [
        `le nom et le logo ${brand}`,
        'les textes et contenus graphiques',
        'les interfaces et parcours utilisateurs',
        'les logiciels, fonctionnalités et bases de données',
        'les modèles, documents et supports techniques',
        'les procédés, méthodes et savoir-faire de conception et de fabrication',
      ],
      paragraphsAfter: [
        'L’utilisateur bénéficie uniquement d’un droit personnel, limité, non exclusif et non transférable d’utiliser la plateforme dans le cadre de son activité professionnelle.',
        `Sauf autorisation écrite préalable d’${legalName}, toute reproduction, modification, diffusion, commercialisation, extraction, rétro-ingénierie ou exploitation de tout ou partie de la plateforme est interdite.`,
      ],
    },
    {
      heading: '12. Disponibilité et maintenance',
      paragraphs: [
        `${brand} met en œuvre des moyens raisonnables afin d’assurer le fonctionnement et la disponibilité de la plateforme.`,
        'L’accès peut toutefois être temporairement interrompu notamment en cas de',
      ],
      list: [
        'maintenance programmée ou urgente',
        'mise à jour technique',
        'incident de sécurité',
        'défaillance d’un prestataire',
        'interruption du réseau internet',
        `problème technique indépendant de la volonté d’${brand}`,
        'événement de force majeure',
      ],
      paragraphsAfter: [
        `Lorsque cela est raisonnablement possible, ${brand} informe les utilisateurs des interruptions importantes ou planifiées.`,
        `${brand} ne garantit pas que la plateforme sera disponible sans interruption ni qu’elle sera totalement exempte d’erreurs techniques.`,
      ],
    },
    {
      heading: '13. Compatibilité et équipements',
      paragraphs: [
        'L’utilisateur est responsable de ses équipements, de sa connexion internet, de son navigateur et des logiciels nécessaires à l’utilisation de la plateforme.',
        'Il doit utiliser un appareil et un environnement informatique suffisamment sécurisés et maintenir ses systèmes, navigateurs et protections à jour.',
        `${brand} ne peut être tenue responsable d’un dysfonctionnement provenant d’un équipement incompatible, d’une connexion insuffisante, d’un logiciel tiers ou d’un appareil compromis appartenant à l’utilisateur.`,
      ],
    },
    {
      heading: '14. Traçabilité et preuve électronique',
      paragraphs: [
        'Les actions effectuées sur la plateforme peuvent faire l’objet d’un enregistrement technique permettant d’assurer la sécurité, le suivi et la traçabilité des opérations.',
        'Peuvent notamment être enregistrées',
      ],
      list: [
        'les connexions au compte',
        'les transmissions de fichiers',
        'les demandes de modification',
        'les validations de plans',
        'les approbations de packs',
        'les confirmations de commandes',
        'les paiements et références de transaction',
        'les échanges avec le support',
        'les étapes de fabrication et de livraison',
      ],
      paragraphsAfter: [
        `Dans les limites autorisées par la législation applicable, les enregistrements électroniques conservés par ${brand} peuvent servir à établir l’existence et le contenu des opérations réalisées depuis le compte de l’utilisateur.`,
      ],
    },
    {
      heading: '15. Limitation de responsabilité',
      paragraphs: [
        `${brand} est responsable de l’exécution de ses propres obligations dans les limites prévues par la législation applicable.`,
        'Sa responsabilité ne peut être engagée lorsque le dommage résulte notamment',
      ],
      list: [
        'd’informations incorrectes ou incomplètes fournies par l’utilisateur',
        'de fichiers associés au mauvais patient',
        'de la validation d’un plan sans vérification suffisante',
        'd’une mauvaise utilisation des gouttières',
        'du non-respect des instructions cliniques',
        'd’un suivi insuffisant du patient',
        'du partage des identifiants du compte',
        'd’un accès non autorisé causé par une négligence de l’utilisateur',
        'd’un dysfonctionnement extérieur à la plateforme',
        'd’un cas de force majeure',
      ],
      paragraphsAfter: [
        'Aucune disposition des présentes CGU ne limite une responsabilité qui ne pourrait légalement être exclue ou limitée.',
      ],
    },
    {
      heading: '16. Suspension et fermeture du compte',
      paragraphs: [
        `L’utilisateur peut demander la fermeture de son compte en contactant ${brand}, sous réserve du traitement des dossiers, commandes, paiements ou obligations en cours.`,
        `${brand} peut suspendre temporairement ou fermer un compte en cas de`,
      ],
      list: [
        'violation des présentes CGU',
        'utilisation frauduleuse ou abusive',
        'risque pour la sécurité de la plateforme',
        'atteinte à la confidentialité des données patients',
        'fourniture de faux documents ou de fausses informations',
        'factures ou paiements durablement impayés',
        'perte de la qualité professionnelle nécessaire à l’utilisation du service',
      ],
      paragraphsAfter: [
        'Lorsque la situation le permet, l’utilisateur est informé du motif de la suspension ou de la fermeture.',
        'La fermeture du compte n’entraîne pas la suppression immédiate des informations devant être conservées pour respecter une obligation légale, assurer la traçabilité des dispositifs, gérer un litige ou protéger les droits des parties.',
      ],
    },
    {
      heading: '17. Modification des présentes conditions',
      paragraphs: [
        `${brand} peut modifier les présentes CGU afin de tenir compte de l’évolution de ses services, de la plateforme, de ses procédures ou de la réglementation applicable.`,
        'La version applicable est celle publiée sur la plateforme à la date de son utilisation.',
        'En cas de modification importante, les utilisateurs peuvent être informés par e-mail, notification ou message affiché dans l’application.',
        'La poursuite de l’utilisation de la plateforme après l’entrée en vigueur des nouvelles conditions vaut acceptation de celles-ci, lorsque cette modalité d’acceptation est légalement valable.',
      ],
    },
    {
      heading: '18. Droit applicable et règlement des différends',
      paragraphs: [
        'Les présentes CGU sont régies et interprétées conformément au droit tunisien.',
        `En cas de difficulté ou de différend, les parties s’efforcent de rechercher une solution amiable en contactant préalablement le service support ${brand}.`,
        'À défaut de règlement amiable, le différend est soumis aux juridictions tunisiennes territorialement compétentes, sous réserve des règles impératives applicables.',
      ],
    },
    {
      heading: '19. Contact',
      paragraphs: [
        `Pour toute question concernant l’utilisation de la plateforme ou les présentes CGU, l’utilisateur peut contacter ${brand} par e-mail, par téléphone ou directement via le chat intégré à l’application.`,
        `Les coordonnées actualisées d’${legalName} sont disponibles sur la page « Mentions légales ».`,
      ],
    },
  ];
  const en: LegalSection[] = [
    {
      paragraphs: [
        `These Terms of Use, hereinafter the “Terms”, govern access to and use of the ${brand} website, application and digital services, operated by ${legalName}.`,
        `The ${brand} platform is a professional tool intended primarily for dentists, orthodontists and other authorized dental healthcare professionals. It allows, in particular, creating and managing patient cases, submitting clinical data, requesting an orthodontic study, reviewing and validating a treatment proposal, choosing a pack, making payments, tracking the manufacturing of the aligners and communicating with the support team.`,
        'Using the platform implies full and complete acceptance of these Terms, of the Privacy Policy and, when an order is placed, of the Order, treatment, manufacturing and delivery terms.',
      ],
    },
    {
      heading: '1. Professional access to the platform',
      paragraphs: [
        `Access to ${brand}’s professional features is reserved for dental healthcare professionals legally authorized to practice.`,
        'When creating their account, the user undertakes to provide accurate, complete and up-to-date information about their identity, contact details and professional activity.',
        `${brand} may request any document or information needed to verify the user’s identity, professional status or authorization to practice.`,
        `${brand} reserves the right to refuse, suspend or remove access to an account when`,
      ],
      list: [
        'the information provided is inaccurate or incomplete',
        'the user’s professional status cannot be verified',
        'the account is used by an unauthorized person',
        'the user does not comply with these Terms',
        'fraudulent, abusive or dangerous use of the platform is observed',
      ],
    },
    {
      heading: '2. Account creation and security',
      paragraphs: [
        'Each account is personal and may only be used by its holder or by the members of their team who are expressly authorized, under the holder’s responsibility.',
        'The user is responsible for',
      ],
      list: [
        'the confidentiality of their credentials and passwords',
        'the access granted to the members of their practice or team',
        'the actions carried out from their account',
        'keeping their professional information up to date',
        'logging out of their account when using a shared device',
      ],
      paragraphsAfter: [
        'Credentials must not be shared with an unauthorized person.',
        `In the event of loss, theft, unauthorized use or suspected compromise of their account, the user must immediately change their password and notify the ${brand} support team.`,
      ],
    },
    {
      heading: '3. General operation of the service',
      paragraphs: ['The platform allows the practitioner, in particular, to'],
      list: [
        'create and manage their patient cases',
        'upload photographs and clinical files',
        'submit digital impressions and STL files',
        'submit, where necessary, radiographs or CBCT/DICOM files',
        'pay the case study fees',
        'review a treatment proposal',
        'request changes',
        'approve the treatment plan',
        'view and choose the packs offered',
        'approve an offer',
        'make a one-time payment or pay in several installments',
        'track the manufacturing and delivery stages',
        'communicate with the support team through the chat built into the application',
      ],
      paragraphsAfter: [
        'The commercial terms, payments, manufacturing stages and deliveries are detailed in the Order, treatment, manufacturing and delivery terms.',
      ],
    },
    {
      heading: '4. Compliant use of the platform',
      paragraphs: [
        'The user undertakes to use the platform exclusively within the scope of their professional activity and in accordance with its intended purpose.',
        'In particular, the user undertakes to',
      ],
      list: [
        'provide accurate, complete and up-to-date information',
        'check the cases, photographs, files and information before submitting them',
        'associate each document with the right patient',
        'upload only the data required to process the case',
        'use files that comply with the indicated formats and technical requirements',
        'respect patients’ rights and the confidentiality of their information',
        'review treatment proposals before validating them',
        `not use the platform for illegal, fraudulent purposes or purposes unrelated to ${brand}’s services`,
      ],
    },
    {
      paragraphs: ['The following are prohibited in particular'],
      list: [
        'attempting to access another user’s account or cases',
        'circumventing security mechanisms or access controls',
        'introducing viruses, malware or dangerous files',
        'deliberately disrupting or overloading the platform',
        'copying, extracting or exploiting the platform’s data on a large scale',
        'using unauthorized automated tools',
        'modifying, decompiling or attempting to reconstruct the technical operation of the platform',
        'publishing or transmitting unlawful, misleading, offensive content or content that infringes the rights of a third party',
      ],
    },
    {
      heading: '5. Patient data and consent',
      paragraphs: [
        `Before creating a patient case or transmitting clinical information to ${brand}, the practitioner must ensure that they have an appropriate legal basis as well as the necessary authorizations and consents.`,
        'In particular, the practitioner is responsible for',
      ],
      list: [
        'informing the patient about the transmission and processing of their data',
        'obtaining the patient’s consent where required',
        'obtaining the legal representative’s authorization when the patient is a minor or under legal protection',
        'the lawfulness of collecting the photographs, radiographs, scans and other clinical data',
        'the accuracy and relevance of the information transmitted',
        'compliance with professional secrecy and medical confidentiality',
      ],
      paragraphsAfter: [
        `The user must not transmit to ${brand} information unrelated to the orthodontic treatment or whose collection is not necessary.`,
        'The conditions for collecting, using, retaining and protecting data are detailed in the Privacy Policy.',
      ],
    },
    {
      heading: '6. Clinical responsibility of the practitioner',
      paragraphs: [
        `${brand} provides a management platform, technical support, and study, planning and manufacturing services for personalized orthodontic devices.`,
        `The platform and the ${brand} team do not replace the healthcare professional’s judgment, diagnosis or clinical supervision.`,
        'The practitioner remains solely responsible for',
      ],
      list: [
        'the clinical examination of the patient',
        'the diagnosis',
        'the indication for aligner treatment',
        'checking for any contraindications',
        'the necessary medical and radiological examinations',
        'prescribing the treatment',
        'the therapeutic objectives',
        'validating the treatment plan',
        'the frequency of aligner changes',
        'the clinical follow-up of the patient',
        'managing complications, emergencies or adverse effects',
        'the decision to continue, modify, interrupt or complete the treatment',
      ],
      paragraphsAfter: [
        'Any treatment proposal made available on the platform must be reviewed and validated by the practitioner before manufacturing starts.',
        'Electronic validation of the plan means that the practitioner has reviewed it and authorizes the manufacturing of the aligners in accordance with the approved elements.',
      ],
    },
    {
      heading: '7. Changes to the treatment plan',
      paragraphs: [
        'Before validating a proposal, the practitioner can submit their comments and request the changes available depending on the service or pack concerned.',
        'They must carefully check',
      ],
      list: [
        'the patient’s identity and reference',
        'the clinical data used',
        'the proposed tooth movements',
        'the treatment objectives',
        'the estimated number of aligners',
        'any interproximal reduction, attachments or clinical instructions',
        'any other information shown in the proposal',
      ],
      paragraphsAfter: [
        'Any change requested after the plan is validated or manufacturing has started may result in an additional lead time, additional fees, or the impossibility of modifying aligners already manufactured.',
      ],
    },
    {
      heading: '8. Chat and support service',
      paragraphs: [
        'Healthcare professionals can contact the support team through the chat built into the application.',
        'The support can notably assist the user with',
      ],
      list: [
        'using the platform',
        'transmitting files',
        'following up a case',
        'understanding the different stages',
        'change requests',
        'choosing or following up a pack',
        'payments and installments',
        'manufacturing and delivery',
      ],
      paragraphsAfter: [
        'Exchanges with support do not replace the diagnosis, clinical decision or medical follow-up provided by the practitioner.',
        'The user should avoid transmitting in the chat any data that is not necessary to handle their request.',
      ],
    },
    {
      heading: '9. Payments and orders',
      paragraphs: [
        'Creating an account or browsing the platform does not automatically constitute an order.',
        'Depending on how the service operates, the practitioner may be required to carry out, successively',
      ],
      list: [
        'payment of the study fees',
        'validation of the treatment proposal',
        'selection and approval of a pack',
        'full payment of the pack or payment of an installment',
        'confirmation that manufacturing may start',
      ],
      paragraphsAfter: [
        'When installment payment is offered, each installment may correspond to a treatment stage and to a defined number of aligners.',
        'The manufacturing of the series concerned may be conditional on confirmation of the corresponding payment.',
        'The rules applicable to prices, orders, cancellations, refunds, payments, manufacturing and deliveries are defined in the Order, treatment, manufacturing and delivery terms.',
      ],
    },
    {
      heading: '10. Content and files transmitted by the user',
      paragraphs: [
        'The user retains the rights they hold in the data, documents, images and files they transmit on the platform.',
        'They warrant that they are authorized to use and transmit these elements within the scope of the requested service.',
        `The user authorizes ${brand}, for the time required to perform the service, to access, use, technically adapt, reproduce and process the transmitted elements solely in order to`,
      ],
      list: [
        'study the case',
        'prepare the treatment proposal',
        'manufacture the devices',
        'carry out quality control',
        'manage the order and delivery',
        'provide the requested support',
        'comply with applicable legal and regulatory obligations',
      ],
      paragraphsAfter: [
        `This authorization does not allow ${brand} to sell personal or clinical data to third parties.`,
      ],
    },
    {
      heading: `11. ${brand}’s intellectual property`,
      paragraphs: [
        'The platform and all of its elements are protected by the applicable intellectual property law.',
        'This includes, in particular',
      ],
      list: [
        `the ${brand} name and logo`,
        'the texts and graphic content',
        'the interfaces and user journeys',
        'the software, features and databases',
        'the models, documents and technical materials',
        'the design and manufacturing processes, methods and know-how',
      ],
      paragraphsAfter: [
        'The user is granted only a personal, limited, non-exclusive and non-transferable right to use the platform within the scope of their professional activity.',
        `Except with the prior written authorization of ${legalName}, any reproduction, modification, distribution, marketing, extraction, reverse engineering or exploitation of all or part of the platform is prohibited.`,
      ],
    },
    {
      heading: '12. Availability and maintenance',
      paragraphs: [
        `${brand} takes reasonable measures to ensure the operation and availability of the platform.`,
        'Access may nevertheless be temporarily interrupted, in particular in the event of',
      ],
      list: [
        'scheduled or urgent maintenance',
        'a technical update',
        'a security incident',
        'the failure of a provider',
        'an interruption of the internet network',
        `a technical problem beyond ${brand}’s control`,
        'an event of force majeure',
      ],
      paragraphsAfter: [
        `Where reasonably possible, ${brand} informs users of significant or planned interruptions.`,
        `${brand} does not guarantee that the platform will be available without interruption or that it will be entirely free of technical errors.`,
      ],
    },
    {
      heading: '13. Compatibility and equipment',
      paragraphs: [
        'The user is responsible for their equipment, internet connection, browser and the software required to use the platform.',
        'They must use a sufficiently secure device and computing environment and keep their systems, browsers and protections up to date.',
        `${brand} cannot be held responsible for a malfunction arising from incompatible equipment, an insufficient connection, third-party software or a compromised device belonging to the user.`,
      ],
    },
    {
      heading: '14. Traceability and electronic evidence',
      paragraphs: [
        'Actions carried out on the platform may be subject to technical logging that helps ensure the security, monitoring and traceability of operations.',
        'The following may notably be recorded',
      ],
      list: [
        'account logins',
        'file transmissions',
        'change requests',
        'plan validations',
        'pack approvals',
        'order confirmations',
        'payments and transaction references',
        'exchanges with support',
        'manufacturing and delivery stages',
      ],
      paragraphsAfter: [
        `Within the limits allowed by applicable law, the electronic records kept by ${brand} may be used to establish the existence and content of operations carried out from the user’s account.`,
      ],
    },
    {
      heading: '15. Limitation of liability',
      paragraphs: [
        `${brand} is responsible for performing its own obligations within the limits provided by applicable law.`,
        'It cannot be held liable where the damage results, in particular, from',
      ],
      list: [
        'incorrect or incomplete information provided by the user',
        'files associated with the wrong patient',
        'validating a plan without sufficient verification',
        'improper use of the aligners',
        'failure to comply with clinical instructions',
        'insufficient follow-up of the patient',
        'sharing the account credentials',
        'unauthorized access caused by the user’s negligence',
        'a malfunction external to the platform',
        'an event of force majeure',
      ],
      paragraphsAfter: [
        'Nothing in these Terms limits any liability that cannot legally be excluded or limited.',
      ],
    },
    {
      heading: '16. Suspension and closure of the account',
      paragraphs: [
        `The user can request the closure of their account by contacting ${brand}, subject to the handling of any ongoing cases, orders, payments or obligations.`,
        `${brand} may temporarily suspend or close an account in the event of`,
      ],
      list: [
        'a breach of these Terms',
        'fraudulent or abusive use',
        'a risk to the security of the platform',
        'a breach of the confidentiality of patient data',
        'the provision of false documents or false information',
        'invoices or payments left unpaid over time',
        'loss of the professional status required to use the service',
      ],
      paragraphsAfter: [
        'Where the situation allows, the user is informed of the reason for the suspension or closure.',
        'Closing the account does not entail the immediate deletion of information that must be retained to comply with a legal obligation, ensure the traceability of the devices, handle a dispute or protect the parties’ rights.',
      ],
    },
    {
      heading: '17. Changes to these terms',
      paragraphs: [
        `${brand} may amend these Terms to take into account changes in its services, the platform, its procedures or the applicable regulations.`,
        'The applicable version is the one published on the platform on the date it is used.',
        'In the event of a significant change, users may be informed by email, notification or a message shown in the application.',
        'Continuing to use the platform after the new terms take effect constitutes acceptance of them, where this method of acceptance is legally valid.',
      ],
    },
    {
      heading: '18. Governing law and dispute resolution',
      paragraphs: [
        'These Terms are governed by and interpreted in accordance with Tunisian law.',
        `In the event of a difficulty or dispute, the parties will endeavor to reach an amicable solution by first contacting the ${brand} support service.`,
        'Failing an amicable settlement, the dispute is submitted to the territorially competent Tunisian courts, subject to the applicable mandatory rules.',
      ],
    },
    {
      heading: '19. Contact',
      paragraphs: [
        `For any question about the use of the platform or these Terms, the user can contact ${brand} by email, by phone or directly through the chat built into the application.`,
        `${legalName}’s up-to-date contact details are available on the “Legal notice” page.`,
      ],
    },
  ];
  return b === 'en' ? en : fr;
}

function buildContact(lang: LegalLang, c: LegalCompany): LegalSection[] {
  const b = base(lang);
  const contactRows = [
    row(STR.labels.email[b], c.email, lang, (v) => `mailto:${v}`),
    row(STR.labels.phone[b], c.phone, lang, (v) => `tel:${v.replace(/\s+/g, '')}`),
    row(STR.labels.address[b], composeAddress(c), lang),
  ];
  const fr: LegalSection[] = [
    {
      paragraphs: [
        'Notre service client est à votre disposition avant et après votre commande, pour toute question relative à un compte, une commande, un paiement ou une livraison.',
      ],
      rows: contactRows,
    },
    {
      paragraphs: [
        'Les praticiens connectés peuvent également nous joindre via la messagerie d’assistance intégrée à leur tableau de bord.',
      ],
    },
  ];
  const en: LegalSection[] = [
    {
      paragraphs: [
        'Our customer support team is available before and after your order, for any question about an account, order, payment, or delivery.',
      ],
      rows: contactRows,
    },
    {
      paragraphs: [
        'Logged-in practitioners can also reach us through the support messaging built into their dashboard.',
      ],
    },
  ];
  return b === 'en' ? en : fr;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build one fully-localized legal document, injecting the merchant's
 * company data. Pass a company loaded from billing settings; pass `{}`
 * and every dynamic value renders as a "à compléter" placeholder.
 */
export function buildLegalDoc(
  key: LegalDocKey,
  lang: LegalLang,
  company: LegalCompany,
): LegalDoc {
  const meta = legalDocMeta(key, lang);
  const b = base(lang);
  const sections =
    key === 'about'
      ? buildAbout(lang, company)
      : key === 'refunds'
        ? buildRefunds(lang, company)
        : key === 'legal'
          ? buildLegal(lang, company)
          : key === 'privacy'
            ? buildPrivacy(lang, company)
            : key === 'termsOfUse'
              ? buildTermsOfUse(lang, company)
              : key === 'contact'
                ? buildContact(lang, company)
                : buildTerms(lang);

  return {
    key,
    slug: meta.slug,
    title: DOC_META[key].title[b],
    navLabel: meta.navLabel,
    eyebrow: STR.eyebrow[b],
    description: meta.description,
    sections,
  };
}

/** All four documents at once (dashboard help tabs). */
export function buildAllLegalDocs(
  lang: LegalLang,
  company: LegalCompany,
): LegalDoc[] {
  return LEGAL_DOC_KEYS.map((key) => buildLegalDoc(key, lang, company));
}
