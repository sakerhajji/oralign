import type { Metadata } from "next";
import { Jost, DM_Sans } from "next/font/google";
import Script from "next/script";
import "./showcase.css";
import { LangProvider } from "./_lib/i18n/lang-context";
import { CustomCursor } from "./_components/shared/custom-cursor";
import { Header } from "./_components/header";
import { Footer } from "./_components/footer";
import { FloatingLang } from "./_components/floating-lang";

// Jost = closest free Google equivalent to Century Gothic (geometric grotesque,
// near-circular O, similar x-height). Brand guidelines spec Century Gothic for
// display; we cascade to Jost when Century Gothic isn't installed locally.
// Two weights only per guidelines: 400 Regular + 700 Bold.
const serif = Jost({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-sc-serif",
  display: "swap",
});

// DM Sans for all body text. Three weights max per guidelines: 300 / 400 / 500.
const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-sc-sans",
  display: "swap",
});

const SITE_URL = "https://oralign.com.tn";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ORALIGN® — Aligneurs invisibles en Tunisie · Made to Shine",
  description:
    "ORALIGN® — aligneurs invisibles conçus en Allemagne et fabriqués en Tunisie. Traitement orthodontique discret, confortable et supervisé par un praticien certifié. Adultes, enfants et adolescents avec ORALIGN Prime.",
  keywords: [
    "aligneurs invisibles",
    "aligneurs Tunisie",
    "ORALIGN",
    "orthodontie invisible",
    "alternative Invisalign",
    "aligneurs transparents",
    "encombrement dentaire",
    "supraclusion",
    "béance dentaire",
    "classe 2 dentaire",
    "aligneurs enfant",
    "ORALIGN Prime",
    "aligneurs dentaires Tunisie",
    "orthodontiste aligneurs Tunis",
    "sourire aligné",
  ],
  alternates: {
    canonical: "/",
    languages: {
      "x-default": "/",
      "fr-TN": "/",
      fr: "/",
      en: "/",
      "ar-TN": "/",
      ar: "/",
    },
  },
  openGraph: {
    type: "website",
    title: "ORALIGN® — Aligneurs invisibles · Made to Shine",
    description:
      "Un sourire aligné aujourd'hui, une confiance durable demain. Aligneurs transparents, conçus en Allemagne, fabriqués en Tunisie et validés par votre praticien.",
    url: SITE_URL,
    siteName: "ORALIGN by Aura Aligners",
    locale: "fr_TN",
  },
  twitter: {
    card: "summary_large_image",
    title: "ORALIGN® — Aligneurs invisibles · Made to Shine",
    description:
      "Aligneurs transparents doctor-supervised pour adultes, enfants et adolescents.",
  },
  robots: { index: true, follow: true },
};

const ldOrg = {
  "@context": "https://schema.org",
  "@type": "MedicalOrganization",
  name: "ORALIGN by Aura Aligners",
  alternateName: "ORALIGN",
  url: SITE_URL,
  logo: `${SITE_URL}/ORALIGN%20BLACK.png`,
  description:
    "Aligneurs orthodontiques invisibles ORALIGN® — conçus en Allemagne, fabriqués en Tunisie.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Les Jardins de Carthage",
    addressLocality: "Tunis",
    addressCountry: "TN",
  },
  sameAs: [],
};

const ldProcedure = {
  "@context": "https://schema.org",
  "@type": "MedicalProcedure",
  name: "Traitement par aligneurs invisibles ORALIGN®",
  procedureType: "Orthodontic treatment",
  bodyLocation: "Teeth",
  preparation:
    "Consultation et empreinte 3D chez un praticien certifié ORALIGN®.",
  followup:
    "Suivi régulier par votre praticien. Port d'un retainer à la fin du traitement.",
  howPerformed:
    "Port d'aligneurs transparents thermoformés, changés régulièrement selon le plan de traitement validé par le praticien.",
};

const ldFaq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Les aligneurs ORALIGN sont-ils visibles ?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Les aligneurs ORALIGN sont transparents et conçus pour être discrets au quotidien. Le traitement reste supervisé par un praticien certifié.",
      },
    },
    {
      "@type": "Question",
      name: "ORALIGN convient-il aux enfants et adolescents ?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ORALIGN Prime accompagne les enfants et adolescents lorsque l'indication est confirmée par le praticien.",
      },
    },
    {
      "@type": "Question",
      name: "Où sont fabriqués les aligneurs ORALIGN ?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Les aligneurs ORALIGN sont conçus en Allemagne et fabriqués en Tunisie par Aura Aligners.",
      },
    },
  ],
};

export default function ShowcaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="showcase" className={`${serif.variable} ${sans.variable}`}>
      <a
        href="#main"
        className="absolute -top-40 left-2 focus:top-2 z-[10000] bg-[var(--sc-black)] text-[var(--sc-white)] px-4 py-2"
        style={{ fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase" }}
      >
        Skip to content
      </a>
      <LangProvider>
        <CustomCursor />
        <Header />
        <FloatingLang />
        <main id="main">{children}</main>
        <Footer />
      </LangProvider>
      <Script id="ld-org" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(ldOrg)}
      </Script>
      <Script id="ld-procedure" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(ldProcedure)}
      </Script>
      <Script id="ld-faq" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(ldFaq)}
      </Script>
    </div>
  );
}
