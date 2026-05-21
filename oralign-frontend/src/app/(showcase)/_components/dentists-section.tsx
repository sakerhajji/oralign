"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  HeartHandshake,
  ScanLine,
  ShieldCheck,
  Smile,
  UsersRound,
} from "lucide-react";
import { showcaseCases } from "../_lib/case-gallery";
import { dict, type Lang } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";

const content = {
  patient: {
    title: {
      fr: "Je veux aligner mon sourire",
      en: "I want to align my smile",
      ar: "أريد تنسيق ابتسامتي",
    },
    body: {
      fr: "Un parcours discret, confortable et expliqué simplement, avec un praticien ORALIGN® à chaque étape.",
      en: "A discreet, comfortable journey explained clearly, with an ORALIGN® practitioner at every step.",
      ar: "مسار شفاف ومريح وواضح، مع طبيب ORALIGN® في كل مرحلة.",
    },
    cta: { fr: "Réserver une consultation", en: "Book a consultation", ar: "احجز استشارة" },
    imageAlt: {
      fr: "Résultat de traitement par aligneurs transparents",
      en: "Clear aligner treatment result",
      ar: "نتيجة علاج بأجهزة شفافة",
    },
    href: "#cta",
    features: [
      { icon: Smile, text: { fr: "Aligneurs quasi invisibles", en: "Practically invisible aligners", ar: "أجهزة شبه غير مرئية" } },
      { icon: HeartHandshake, text: { fr: "Confort au quotidien", en: "Daily comfort", ar: "راحة يومية" } },
      { icon: ShieldCheck, text: { fr: "Suivi par praticien certifié", en: "Certified practitioner follow-up", ar: "متابعة لدى طبيب معتمد" } },
    ],
  },
  practitioner: {
    title: {
      fr: "Je suis praticien",
      en: "I am a practitioner",
      ar: "أنا طبيب",
    },
    body: {
      fr: "Un système clinique complet pour proposer des aligneurs précis, conçus en Allemagne et fabriqués en Tunisie.",
      en: "A complete clinical system for precise aligners, designed in Germany and manufactured in Tunisia.",
      ar: "نظام سريري كامل لتقديم أجهزة دقيقة، مصممة في ألمانيا ومصنوعة في تونس.",
    },
    cta: { fr: "Accéder à l'espace pro", en: "Go to professional space", ar: "ادخل إلى فضاء الأطباء" },
    imageAlt: {
      fr: "Planification orthodontique ORALIGN",
      en: "ORALIGN orthodontic planning",
      ar: "تخطيط ORALIGN التقويمي",
    },
    href: "/login",
    features: [
      { icon: ScanLine, text: { fr: "Planification numérique 3D", en: "3D digital planning", ar: "تخطيط رقمي ثلاثي الأبعاد" } },
      { icon: UsersRound, text: { fr: "Flux clair patient-cabinet-labo", en: "Clear patient-clinic-lab workflow", ar: "مسار واضح بين المريض والعيادة والمخبر" } },
      { icon: BadgeCheck, text: { fr: "Réseau de praticiens certifiés", en: "Certified practitioner network", ar: "شبكة أطباء معتمدين" } },
    ],
  },
} as const;

export function DentistsSection() {
  const { lang } = useShowcaseLang();
  const patientCase = showcaseCases[0];
  const practitionerCase = showcaseCases[1];

  return (
    <section
      id="dentists"
      data-section-tone="dark"
      aria-labelledby="dentists-h2"
      className="bg-[var(--sc-black)] text-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="max-w-3xl">
            <div
              className="flex items-center gap-3"
              style={{ fontSize: "0.55rem", letterSpacing: "0.42em", textTransform: "uppercase", color: "var(--sc-sun)" }}
            >
              <span className="sc-eyebrow-line h-px w-[18px] bg-[var(--sc-sun)]" aria-hidden="true" />
              <span>{dict.dentists.eyebrow[lang]}</span>
            </div>
            <h2
              id="dentists-h2"
              className="sc-serif mt-3.5"
              style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 300, lineHeight: 1.08, color: "var(--sc-white)" }}
            >
              {dict.dentists.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.dentists.h2Em[lang]}</em>
            </h2>
          </div>
        </Reveal>

        <Reveal delay>
          <div className="mt-14 grid gap-px bg-[#303030] lg:grid-cols-2">
            <AudienceCard
              lang={lang}
              data={content.patient}
              image={patientCase.after}
              highlight="ORALIGN"
            />
            <AudienceCard
              lang={lang}
              data={content.practitioner}
              image={practitionerCase.after}
              highlight={dict.brand.madeWhere[lang]}
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function AudienceCard({
  lang,
  data,
  image,
  highlight,
}: {
  lang: Lang;
  data: typeof content.patient | typeof content.practitioner;
  image: string;
  highlight: string;
}) {
  return (
    <article className="grid bg-[var(--sc-black)] lg:grid-cols-[0.95fr_1.05fr]">
      <div className="relative min-h-[280px] overflow-hidden bg-[#111]">
        <Image
          src={image}
          alt={data.imageAlt[lang]}
          fill
          sizes="(min-width: 1024px) 340px, 100vw"
          className="object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(25,25,25,0.7), rgba(25,25,25,0.02))" }}
        />
        <div
          className="absolute bottom-4 left-4 right-4"
          style={{
            color: "var(--sc-white)",
            fontSize: "0.52rem",
            fontWeight: 500,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
          }}
        >
          {highlight}
        </div>
      </div>

      <div className="flex flex-col" style={{ padding: "34px 30px" }}>
        <h3 className="sc-serif text-[1.55rem] font-normal leading-tight text-[var(--sc-white)]">
          {data.title[lang]}
        </h3>
        <p className="mt-4 text-sm leading-7 text-[var(--sc-text-mid-on-dark)]">
          {data.body[lang]}
        </p>

        <ul className="mt-7 grid gap-4">
          {data.features.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={index} className="flex items-start gap-3 text-sm leading-6 text-[var(--sc-text-mid-on-dark)]">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(254,202,22,0.12)] text-[var(--sc-sun)]">
                  <Icon size={16} />
                </span>
                <span>{item.text[lang]}</span>
              </li>
            );
          })}
        </ul>

        <Link
          href={data.href}
          className="mt-8 inline-flex w-fit items-center gap-3 no-underline transition-colors hover:text-[var(--sc-sun)]"
          style={{
            color: "var(--sc-white)",
            fontSize: "0.58rem",
            fontWeight: 500,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
          }}
        >
          <span>{data.cta[lang]}</span>
          <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}
