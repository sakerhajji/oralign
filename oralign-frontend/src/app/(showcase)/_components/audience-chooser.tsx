"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Stethoscope, UserRound } from "lucide-react";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import type { Lang } from "../_lib/i18n/dict";
import { NoiseGrain } from "./shared/noise-grain";

/**
 * Landing / audience picker. Rebuilt to share the premium dark
 * vocabulary of the patient Hero: amber accents on Midnight Ink, the
 * concentric heartbeat orbit, a film-grain noise overlay, and the
 * eyebrow ↔ serif headline ↔ description ladder. The two cards now
 * read as full CTA tiles rather than washed-out form chips.
 */

const copy: Record<
  Lang,
  {
    eyebrow: string;
    title: string;
    titleEm: string;
    subtitle: string;
    patient: string;
    patientDesc: string;
    patientCta: string;
    practitioner: string;
    practitionerDesc: string;
    practitionerCta: string;
    patientBadge: string;
    practitionerBadge: string;
  }
> = {
  fr: {
    eyebrow: "Bienvenue chez ORALIGN",
    title: "Choisissez",
    titleEm: "votre espace.",
    subtitle:
      "Découvrez les aligneurs ORALIGN ou accédez à la plateforme clinique dédiée aux praticiens.",
    patient: "Je suis un patient",
    patientDesc:
      "Découvrir les aligneurs ORALIGN, trouver un praticien certifié, suivre mon traitement.",
    patientCta: "Entrer dans l'espace patient",
    practitioner: "Je suis un praticien",
    practitionerDesc:
      "Dentiste ou orthodontiste — gérez les cas d'aligneurs, devis et paiements sur une plateforme digitale.",
    practitionerCta: "Accéder à la plateforme",
    patientBadge: "Patient · sourire & traitement",
    practitionerBadge: "Clinique · plateforme digitale",
  },
  en: {
    eyebrow: "Welcome to ORALIGN",
    title: "Choose",
    titleEm: "your space.",
    subtitle:
      "Discover ORALIGN aligners or step into the clinical platform built for dentists and orthodontists.",
    patient: "I am a patient",
    patientDesc:
      "Discover ORALIGN aligners, find a certified practitioner, and follow your treatment.",
    patientCta: "Enter the patient space",
    practitioner: "I am a practitioner",
    practitionerDesc:
      "Dentist or orthodontist — run aligner cases, quotes, and payments on a digital platform.",
    practitionerCta: "Open the clinical platform",
    patientBadge: "Patient · smile & treatment",
    practitionerBadge: "Clinic · digital platform",
  },
  ar: {
    eyebrow: "مرحبا بكم في ORALIGN",
    title: "اختر",
    titleEm: "مساحتك.",
    subtitle:
      "تعرّف على أجهزة ORALIGN الشفافة أو ادخل إلى المنصة السريرية المخصّصة للأطباء.",
    patient: "أنا مريض",
    patientDesc:
      "اكتشف أجهزة ORALIGN الشفافة، اعثر على طبيب معتمد، وتابع علاجك.",
    patientCta: "ادخل إلى مساحة المريض",
    practitioner: "أنا طبيب",
    practitionerDesc:
      "طبيب أسنان أو تقويم — أدر ملفات التقويم الشفاف والعروض والمدفوعات عبر منصة رقمية.",
    practitionerCta: "ادخل إلى المنصة السريرية",
    patientBadge: "المريض · ابتسامة وعلاج",
    practitionerBadge: "العيادة · منصة رقمية",
  },
};

export function AudienceChooser() {
  const { lang } = useShowcaseLang();
  const t = copy[lang];

  return (
    <section
      id="audience"
      data-section-tone="dark"
      aria-labelledby="audience-title"
      className="
        relative isolate min-h-[88svh] max-w-full overflow-hidden
        bg-[var(--sc-black)] text-[var(--sc-white)]
      "
    >
      {/* Base premium black background. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(254,202,22,0.08), transparent 36%), radial-gradient(circle at 18% 78%, rgba(254,202,22,0.05), transparent 32%), linear-gradient(135deg, rgba(255,255,255,0.03), transparent 38%), var(--sc-black)",
        }}
      />

      {/* Soft side-vignette. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(90deg, rgba(5,5,5,0.84) 0%, rgba(5,5,5,0.48) 46%, rgba(5,5,5,0.80) 100%)",
        }}
      />

      {/* Large centered amber heartbeat orbit covering the background. */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute left-1/2 top-1/2 z-[2]
          h-[760px] w-[760px]
          opacity-32
          sm:h-[980px] sm:w-[980px] sm:opacity-36
          lg:h-[1280px] lg:w-[1280px] lg:opacity-40
          xl:h-[1480px] xl:w-[1480px]
        "
        style={{
          transform: "translate3d(-50%, -50%, 0)",
        }}
      >
        <div className="sc-hero-orbit-pulse relative h-full w-full">
          <div className="absolute inset-0 rounded-full border border-[rgba(254,202,22,0.045)]" />
          <div className="absolute inset-[10%] rounded-full border border-[rgba(254,202,22,0.06)]" />
          <div className="absolute inset-[20%] rounded-full border border-[rgba(254,202,22,0.075)]" />
          <div className="absolute inset-[31%] rounded-full border border-[rgba(254,202,22,0.095)]" />
          <div className="absolute inset-[42%] rounded-full border border-[rgba(254,202,22,0.13)]" />
          <div className="absolute inset-[51%] rounded-full border border-[rgba(254,202,22,0.18)]" />

          <div
            className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full"
            style={{
              transform: "translate3d(-50%, -50%, 0)",
              background: "var(--sc-sun)",
              boxShadow:
                "0 0 20px rgba(254,202,22,0.58), 0 0 62px rgba(254,202,22,0.22)",
            }}
          />
        </div>
      </div>

      <NoiseGrain opacity={0.14} />

      {/* Bottom fade so the section sits cleanly over whatever follows. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 z-[4] h-32"
        style={{
          background:
            "linear-gradient(to bottom, transparent, rgba(5,5,5,0.72), var(--sc-black))",
        }}
      />

      <div
        className="
          relative z-[5] mx-auto flex min-h-[88svh] max-w-[1280px]
          flex-col justify-center px-5 py-20
          sm:px-8 sm:py-24
          lg:px-12 lg:py-28
        "
      >
        {/* Header strap — eyebrow + serif title + sub. Mirrors Hero. */}
        <div className="max-w-[860px]">
          <div
            className="
              sc-hero-eyebrow mb-6 flex max-w-full items-center gap-3
              text-[0.58rem] uppercase tracking-[0.42em]
              sm:mb-8
            "
            style={{ color: "var(--sc-sun)" }}
          >
            <span
              className="h-px w-8 shrink-0 bg-[var(--sc-sun)]"
              aria-hidden="true"
            />
            <span className="leading-none">{t.eyebrow}</span>
          </div>

          <h1
            id="audience-title"
            className="
              sc-hero-h1 sc-serif mb-6 max-w-[920px]
              text-balance text-[clamp(2.4rem,8vw,5.4rem)]
              font-normal leading-[0.98] tracking-[-0.04em]
              text-[var(--sc-white)]
            "
          >
            <span>{t.title}</span>{" "}
            <em
              className="font-light italic"
              style={{ color: "var(--sc-sun)" }}
            >
              {t.titleEm}
            </em>
          </h1>

          <p
            className="
              sc-hero-sub mb-12 max-w-[640px] text-pretty
              text-[0.98rem] leading-[1.9]
              sm:text-[1.05rem]
            "
            style={{ color: "rgba(242,245,239,0.76)" }}
          >
            {t.subtitle}
          </p>
        </div>

        {/* Audience cards — same dark grammar, same border-only tile language. */}
        <div className="grid gap-5 md:grid-cols-2 md:gap-7">
          <AudienceCard
            href="/patient"
            icon={<UserRound aria-hidden="true" size={28} strokeWidth={1.4} />}
            badge={t.patientBadge}
            title={t.patient}
            description={t.patientDesc}
            cta={t.patientCta}
            tone="patient"
          />
          <AudienceCard
            href="/practitioner"
            icon={<Stethoscope aria-hidden="true" size={28} strokeWidth={1.4} />}
            badge={t.practitionerBadge}
            title={t.practitioner}
            description={t.practitionerDesc}
            cta={t.practitionerCta}
            tone="practitioner"
          />
        </div>
      </div>
    </section>
  );
}

/**
 * One audience tile. `tone='patient'` paints the amber-forward primary
 * card and `tone='practitioner'` keeps the recessive ghost-tile look.
 */
function AudienceCard({
  href,
  icon,
  badge,
  title,
  description,
  cta,
  tone,
}: {
  href: string;
  icon: ReactNode;
  badge: string;
  title: string;
  description: string;
  cta: string;
  tone: "patient" | "practitioner";
}) {
  const isPrimary = tone === "patient";

  return (
    <Link
      href={href}
      className={[
        "group relative flex min-h-[300px] min-w-0 w-full flex-col overflow-hidden",
        "border p-7 text-start no-underline",
        "transition-all duration-300",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-sun)]",
        "hover:-translate-y-1 hover:border-[rgba(254,202,22,0.55)]",
        "hover:shadow-[0_30px_80px_-50px_rgba(254,202,22,0.45)]",
        isPrimary
          ? "border-[rgba(254,202,22,0.22)] bg-[rgba(254,202,22,0.04)]"
          : "border-[rgba(242,245,239,0.14)] bg-[rgba(255,255,255,0.025)]",
        "sm:p-9",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className={[
            "inline-flex h-12 w-12 items-center justify-center border",
            isPrimary
              ? "border-[rgba(254,202,22,0.40)] bg-[rgba(254,202,22,0.10)] text-[var(--sc-sun)]"
              : "border-[rgba(242,245,239,0.22)] bg-[rgba(255,255,255,0.04)] text-[var(--sc-white)]",
          ].join(" ")}
        >
          {icon}
        </span>

        <span
          className={[
            "inline-flex h-10 w-10 items-center justify-center border",
            "transition-all duration-300",
            isPrimary
              ? "border-[rgba(254,202,22,0.40)] text-[var(--sc-sun)] group-hover:bg-[var(--sc-sun)] group-hover:text-[var(--sc-black)]"
              : "border-[rgba(242,245,239,0.22)] text-[var(--sc-white)] group-hover:bg-[var(--sc-white)] group-hover:text-[var(--sc-black)]",
            "group-hover:translate-x-1 rtl:group-hover:-translate-x-1",
          ].join(" ")}
        >
          <ArrowRight aria-hidden="true" size={18} strokeWidth={1.6} />
        </span>
      </div>

      <p
        className="mt-10 text-[0.66rem] uppercase tracking-[0.22em]"
        style={{ color: "rgba(242,245,239,0.55)" }}
      >
        {badge}
      </p>

      <h2
        className={[
          "sc-serif mt-3 break-words text-balance",
          "text-[clamp(1.6rem,3.4vw,2.4rem)] leading-[1.05]",
          "text-[var(--sc-white)]",
        ].join(" ")}
      >
        {title}
      </h2>

      <p
        className="mt-4 max-w-[34rem] break-words text-[0.96rem] leading-[1.7]"
        style={{ color: "rgba(242,245,239,0.72)" }}
      >
        {description}
      </p>

      <div className="mt-auto pt-8">
        <span
          className={[
            "inline-flex items-center gap-3 text-[0.66rem] uppercase tracking-[0.2em]",
            "transition-colors duration-300",
            isPrimary
              ? "text-[var(--sc-sun)]"
              : "text-[var(--sc-white)] group-hover:text-[var(--sc-sun)]",
          ].join(" ")}
        >
          <span>{cta}</span>
          <span
            aria-hidden="true"
            className="h-px w-8 bg-current transition-transform duration-300 group-hover:translate-x-1"
          />
        </span>
      </div>
    </Link>
  );
}