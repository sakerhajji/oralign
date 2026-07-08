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
      fr: 'Conditions d’utilisation de la plateforme ORALIGN : objet du service, accès professionnel, responsabilité clinique, propriété intellectuelle et droit applicable.',
      en: 'Terms of use of the ORALIGN platform: service scope, professional access, clinical responsibility, intellectual property and governing law.',
    },
  },
  terms: {
    slug: 'conditions-vente',
    nav: { fr: 'Conditions de commande', en: 'Order terms' },
    title: {
      fr: 'Conditions de commande et de livraison',
      en: 'Order and delivery terms',
    },
    description: {
      fr: 'Conditions de commande ORALIGN : devise, passage de commande, confirmation, disponibilité des produits et délais de livraison.',
      en: 'ORALIGN order terms: currency, placing an order, confirmation, product availability and delivery times.',
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
  dataTitle: { fr: 'Données personnelles', en: 'Personal data' },
  paymentTitle: { fr: 'Paiement sécurisé', en: 'Secure payment' },
  labels: {
    tradeName: { fr: 'Nom commercial', en: 'Trade name' },
    companyName: { fr: 'Raison sociale', en: 'Company name' },
    legalForm: { fr: 'Forme juridique', en: 'Legal form' },
    taxId: { fr: 'Matricule fiscal', en: 'Tax identification number' },
    rc: { fr: 'Registre de commerce', en: 'Trade register' },
    address: { fr: 'Adresse du siège', en: 'Registered office address' },
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
  const name = storeName(c);
  const fr: LegalSection[] = [
    {
      paragraphs: [
        `${name} est une boutique en ligne basée en Tunisie, spécialisée dans les aligneurs dentaires transparents et les solutions orthodontiques.`,
        'Notre objectif est de proposer à nos clients des produits de qualité, avec une expérience d’achat simple, sécurisée et transparente. Nous mettons à disposition un catalogue clair, des prix affichés dans la devise du compte commerçant, ainsi qu’un service client disponible pour répondre aux questions avant et après la commande.',
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
      paragraphs: [
        `${name} is an online store based in Tunisia, specialized in clear dental aligners and orthodontic solutions.`,
        'Our goal is to provide customers with quality products and a simple, secure, and transparent shopping experience. We provide a clear product catalog, prices displayed in the merchant account currency, and customer support available before and after each order.',
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
        'Le client peut déposer une réclamation concernant une commande, un paiement, une livraison ou un produit reçu en nous contactant par email ou par téléphone.',
        'Toute réclamation doit contenir les informations suivantes : nom et prénom du client, numéro de commande, date de commande, montant payé, description du problème et, si nécessaire, photos ou documents justificatifs.',
        'Notre service client s’engage à traiter les réclamations dans un délai de 48 à 72 heures ouvrables à partir de la réception de la demande complète.',
        'En cas d’erreur de paiement, de commande annulée ou de produit non disponible, le client peut bénéficier d’un remboursement selon le mode de paiement utilisé lors de la commande. Le remboursement est effectué après vérification de la demande et validation par notre service client.',
        'Les délais de remboursement peuvent varier selon la banque du client et le moyen de paiement utilisé.',
      ],
    },
    { heading: STR.complaintsContact[b], rows: contactRows },
  ];
  const en: LegalSection[] = [
    {
      paragraphs: [
        'The customer may submit a complaint regarding an order, payment, delivery, or received product by contacting us by email or by phone.',
        'Any complaint must include the following information: customer first and last name, order number, order date, amount paid, description of the issue, and, if necessary, photos or supporting documents.',
        'Our customer service team undertakes to process complaints within 48 to 72 business hours from the receipt of the complete request.',
        'In the event of a payment error, order cancellation, or product unavailability, the customer may receive a refund according to the payment method used when placing the order. The refund is processed after verification of the request and validation by our customer service team.',
        'Refund processing times may vary depending on the customer’s bank and the payment method used.',
      ],
    },
    { heading: STR.complaintsContact[b], rows: contactRows },
  ];
  return b === 'en' ? en : fr;
}

function buildLegal(lang: LegalLang, c: LegalCompany): LegalSection[] {
  const b = base(lang);
  const dom = domain(c);
  const legalName = (c.companyName || storeName(c)).trim();
  const identityRows = [
    row(STR.labels.tradeName[b], c.tradeName || c.companyName, lang),
    row(STR.labels.companyName[b], c.companyName, lang),
    row(STR.labels.legalForm[b], c.legalForm, lang),
    row(STR.labels.taxId[b], c.taxRegistrationNumber, lang),
    row(STR.labels.rc[b], c.registreDeCommerce, lang),
    row(STR.labels.address[b], composeAddress(c), lang),
    row(STR.labels.phone[b], c.phone, lang, (v) => `tel:${v.replace(/\s+/g, '')}`),
    row(STR.labels.email[b], c.email, lang, (v) => `mailto:${v}`),
  ];
  const fr: LegalSection[] = [
    { heading: STR.identityTitle[b], rows: identityRows },
    {
      paragraphs: [
        `Le site web ${dom} est édité par ${legalName}, société immatriculée en Tunisie.`,
      ],
    },
    {
      heading: STR.ipTitle[b],
      paragraphs: [
        'Tous les contenus présents sur ce site, notamment les textes, images, logos, éléments graphiques et catalogues produits, sont protégés. Toute reproduction ou utilisation sans autorisation préalable est interdite.',
      ],
    },
    {
      heading: STR.dataTitle[b],
      paragraphs: [
        'Les informations collectées lors d’une commande ou d’une prise de contact sont utilisées uniquement pour le traitement des commandes, la livraison, la facturation et le service client. Elles ne sont pas vendues à des tiers.',
      ],
    },
    {
      heading: STR.paymentTitle[b],
      paragraphs: [
        'Les paiements en ligne sont traités via une solution de paiement sécurisée. Les informations bancaires du client ne sont pas stockées par notre site.',
      ],
    },
  ];
  const en: LegalSection[] = [
    { heading: STR.identityTitle[b], rows: identityRows },
    {
      paragraphs: [
        `The website ${dom} is published by ${legalName}, a company registered in Tunisia.`,
      ],
    },
    {
      heading: STR.ipTitle[b],
      paragraphs: [
        'All content available on this website, including text, images, logos, graphic elements, and product catalogs, is protected. Any reproduction or use without prior authorization is prohibited.',
      ],
    },
    {
      heading: STR.dataTitle[b],
      paragraphs: [
        'The information collected during an order or contact request is used only for order processing, delivery, invoicing, and customer support. It is not sold to third parties.',
      ],
    },
    {
      heading: STR.paymentTitle[b],
      paragraphs: [
        'Online payments are processed through a secure payment solution. The customer’s banking information is not stored by our website.',
      ],
    },
  ];
  return b === 'en' ? en : fr;
}

function buildTerms(lang: LegalLang): LegalSection[] {
  const b = base(lang);
  const fr: LegalSection[] = [
    {
      paragraphs: [
        'Les prix affichés sur le site sont exprimés dans la même devise que celle du compte commerçant, toutes taxes comprises sauf indication contraire.',
        'Le client peut passer commande directement sur le site en sélectionnant les produits souhaités, en validant son panier puis en choisissant le mode de paiement proposé.',
        'La commande est confirmée après validation du paiement ou confirmation du mode de paiement choisi. Le client reçoit une confirmation de commande par email ou par tout autre moyen de contact fourni lors de la commande.',
        'En cas d’indisponibilité d’un produit après validation de la commande, le client sera informé dans les meilleurs délais. Il pourra choisir un remplacement, un avoir ou un remboursement.',
        'Les délais de livraison sont indiqués au moment de la commande ou communiqués par notre service client. Ces délais peuvent varier selon la zone de livraison et la disponibilité des produits.',
      ],
    },
  ];
  const en: LegalSection[] = [
    {
      paragraphs: [
        'The prices displayed on the website are expressed in the same currency as the merchant account, including taxes unless otherwise stated.',
        'The customer may place an order directly on the website by selecting the desired products, validating the cart, and choosing the available payment method.',
        'The order is confirmed after payment validation or confirmation of the selected payment method. The customer receives an order confirmation by email or through any other contact method provided when placing the order.',
        'If a product becomes unavailable after the order has been confirmed, the customer will be informed as soon as possible. The customer may choose a replacement, a credit note, or a refund.',
        'Delivery times are indicated during the order process or communicated by our customer service team. These times may vary depending on the delivery area and product availability.',
      ],
    },
  ];
  return b === 'en' ? en : fr;
}

function buildPrivacy(lang: LegalLang, c: LegalCompany): LegalSection[] {
  const b = base(lang);
  const name = storeName(c);
  const contactRow = [row(STR.labels.email[b], c.email, lang, (v) => `mailto:${v}`)];
  const fr: LegalSection[] = [
    {
      paragraphs: [
        `La présente politique de confidentialité décrit comment ${name} collecte, utilise, conserve et protège les données personnelles des utilisateurs de la plateforme. Nous accordons une importance particulière à la protection de vos données.`,
      ],
    },
    {
      heading: 'Données collectées',
      paragraphs: [
        'Nous collectons les données nécessaires au fonctionnement du service : informations d’identification et de contact du praticien, données de compte, informations relatives aux commandes et aux dossiers cliniques téléversés (photos, fichiers STL, CBCT/DICOM), ainsi que des données techniques de connexion.',
      ],
    },
    {
      heading: 'Finalités du traitement',
      paragraphs: [
        'Les données sont utilisées uniquement pour la création et la gestion des comptes, le traitement des commandes et des devis, la facturation, le service client et le respect de nos obligations légales.',
      ],
    },
    {
      heading: 'Partage des données',
      paragraphs: [
        'Vos données ne sont pas vendues à des tiers. Elles peuvent être communiquées uniquement aux prestataires strictement nécessaires à l’exécution du service (paiement, hébergement), dans la limite de leurs missions.',
      ],
    },
    {
      heading: 'Paiement sécurisé',
      paragraphs: [
        'Les paiements en ligne sont traités par une solution de paiement sécurisée. Les informations bancaires ne sont pas stockées sur notre plateforme.',
      ],
    },
    {
      heading: 'Conservation et sécurité',
      paragraphs: [
        'Les données sont conservées pendant la durée nécessaire aux finalités décrites ci-dessus et aux obligations légales applicables. Nous mettons en œuvre des mesures techniques et organisationnelles pour protéger vos données contre tout accès non autorisé.',
      ],
    },
    {
      heading: 'Vos droits',
      paragraphs: [
        'Vous disposez d’un droit d’accès, de rectification et de suppression de vos données personnelles. Pour exercer ces droits, contactez-nous par email.',
      ],
      rows: contactRow,
    },
  ];
  const en: LegalSection[] = [
    {
      paragraphs: [
        `This privacy policy describes how ${name} collects, uses, retains, and protects the personal data of platform users. We place particular importance on protecting your data.`,
      ],
    },
    {
      heading: 'Data we collect',
      paragraphs: [
        'We collect the data required to operate the service: the practitioner’s identification and contact details, account data, information related to orders and uploaded clinical files (photos, STL files, CBCT/DICOM), and technical connection data.',
      ],
    },
    {
      heading: 'Purposes of processing',
      paragraphs: [
        'Data is used only to create and manage accounts, process orders and quotations, handle invoicing, provide customer support, and comply with our legal obligations.',
      ],
    },
    {
      heading: 'Data sharing',
      paragraphs: [
        'Your data is not sold to third parties. It may be shared only with the providers strictly necessary to deliver the service (payment, hosting), within the limits of their tasks.',
      ],
    },
    {
      heading: 'Secure payment',
      paragraphs: [
        'Online payments are processed through a secure payment solution. Banking details are not stored on our platform.',
      ],
    },
    {
      heading: 'Retention and security',
      paragraphs: [
        'Data is retained for as long as necessary for the purposes described above and for applicable legal obligations. We implement technical and organizational measures to protect your data against unauthorized access.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'You have the right to access, correct, and delete your personal data. To exercise these rights, contact us by email.',
      ],
      rows: contactRow,
    },
  ];
  return b === 'en' ? en : fr;
}

function buildTermsOfUse(lang: LegalLang, c: LegalCompany): LegalSection[] {
  const b = base(lang);
  const name = storeName(c);
  const fr: LegalSection[] = [
    {
      heading: 'Objet',
      paragraphs: [
        `Les présentes conditions générales d’utilisation régissent l’accès et l’utilisation de la plateforme ${name}, un outil professionnel destiné aux chirurgiens-dentistes et orthodontistes pour la commande d’aligneurs dentaires transparents et le suivi des dossiers cliniques. En utilisant la plateforme, l’utilisateur accepte les présentes conditions.`,
      ],
    },
    {
      heading: 'Accès et compte',
      paragraphs: [
        'L’accès est réservé aux professionnels de santé habilités. L’utilisateur est responsable de la confidentialité de ses identifiants et de toute activité réalisée depuis son compte.',
      ],
    },
    {
      heading: 'Utilisation acceptable',
      paragraphs: [
        'L’utilisateur s’engage à utiliser la plateforme conformément à sa destination, à ne fournir que des informations exactes et à ne pas porter atteinte au bon fonctionnement du service.',
      ],
    },
    {
      heading: 'Responsabilité clinique',
      paragraphs: [
        'La plateforme est un outil de commande et de gestion. Le diagnostic, l’indication et le plan de traitement relèvent de la seule responsabilité du praticien, qui conserve la maîtrise des décisions cliniques.',
      ],
    },
    {
      heading: 'Propriété intellectuelle',
      paragraphs: [
        'L’ensemble des éléments de la plateforme (textes, logos, interfaces, contenus) est protégé. Toute reproduction ou utilisation sans autorisation préalable est interdite.',
      ],
    },
    {
      heading: 'Disponibilité et responsabilité',
      paragraphs: [
        'Nous nous efforçons d’assurer la disponibilité de la plateforme, sans garantie d’absence d’interruption. Notre responsabilité ne saurait être engagée pour un usage non conforme du service.',
      ],
    },
    {
      heading: 'Modification et droit applicable',
      paragraphs: [
        'Les présentes conditions peuvent être mises à jour à tout moment. Elles sont régies par le droit tunisien.',
      ],
    },
  ];
  const en: LegalSection[] = [
    {
      heading: 'Scope',
      paragraphs: [
        `These terms of use govern access to and use of the ${name} platform, a professional tool for dentists and orthodontists to order clear dental aligners and follow up clinical cases. By using the platform, the user accepts these terms.`,
      ],
    },
    {
      heading: 'Access and account',
      paragraphs: [
        'Access is reserved for authorized healthcare professionals. The user is responsible for keeping their credentials confidential and for any activity carried out from their account.',
      ],
    },
    {
      heading: 'Acceptable use',
      paragraphs: [
        'The user undertakes to use the platform for its intended purpose, to provide only accurate information, and not to disrupt the proper operation of the service.',
      ],
    },
    {
      heading: 'Clinical responsibility',
      paragraphs: [
        'The platform is an ordering and management tool. Diagnosis, indication, and the treatment plan are the sole responsibility of the practitioner, who retains control over clinical decisions.',
      ],
    },
    {
      heading: 'Intellectual property',
      paragraphs: [
        'All platform elements (text, logos, interfaces, content) are protected. Any reproduction or use without prior authorization is prohibited.',
      ],
    },
    {
      heading: 'Availability and liability',
      paragraphs: [
        'We strive to keep the platform available, without guaranteeing uninterrupted access. We cannot be held liable for any non-compliant use of the service.',
      ],
    },
    {
      heading: 'Changes and governing law',
      paragraphs: [
        'These terms may be updated at any time. They are governed by Tunisian law.',
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
