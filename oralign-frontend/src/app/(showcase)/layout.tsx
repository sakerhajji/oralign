import type { Metadata } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import Script from "next/script";
import "./showcase.css";
import { LangProvider } from "./_lib/i18n/lang-context";
import { CustomCursor } from "./_components/shared/custom-cursor";
import { Header } from "./_components/header";
import { Footer } from "./_components/footer";
import { FloatingLang } from "./_components/floating-lang";

const serif = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-sc-serif",
  display: "swap",
});

const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500"],
  variable: "--font-sc-sans",
  display: "swap",
});

const SITE_URL = "https://oralign.example";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Dental Aligner Case Management Platform for Dentists",
  description:
    "A secure digital aligner workflow platform for dentists to submit cases, upload scans, review treatment plans, manage files, and approve designs.",
  alternates: {
    canonical: "/",
    languages: {
      "x-default": "/",
      en: "/",
      fr: "/",
      ar: "/",
    },
  },
  openGraph: {
    type: "website",
    title: "Dental Aligner Case Management Platform for Dentists",
    description:
      "A secure digital aligner workflow platform for dentists to submit cases, upload scans, review treatment plans, manage files, and approve designs.",
    url: SITE_URL,
    siteName: "Oralign",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dental Aligner Case Management Platform for Dentists",
    description:
      "A secure digital aligner workflow platform for dentists to submit cases, upload scans, review treatment plans, manage files, and approve designs.",
  },
  robots: { index: true, follow: true },
};

const ldOrg = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Oralign",
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.ico`,
  sameAs: [],
};

const ldApp = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Oralign",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description:
    "Aligner case management platform for dentists, orthodontists, clinics, and labs.",
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
      <Script id="ld-app" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(ldApp)}
      </Script>
    </div>
  );
}
