"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Eye,
  Factory,
  HandCoins,
  PackageCheck,
  ScanLine,
  Timer,
  Workflow,
} from "lucide-react";
import type { Lang } from "../_lib/i18n/dict";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";

const copy = {
  eyebrow: {
    fr: "Pour les praticiens",
    en: "For practitioners",
    ar: "للأطباء",
  },
  titleA: {
    fr: "Un partenaire premium",
    en: "A premium clear aligner partner",
    ar: "شريك راقٍ",
  },
  titleB: {
    fr: "d'aligneurs invisibles pour votre cabinet.",
    en: "for your practice.",
    ar: "لأجهزة التقويم الشفافة في عيادتك.",
  },
  intro: {
    fr: "ORALIGN® met à votre disposition un tableau de bord en ligne pour soumettre un cas en quelques minutes : données patient, empreintes intra-orales (STL) et photographies cliniques. Nous nous chargeons du plan de traitement, de la fabrication et de la livraison à votre cabinet — vous gardez la relation patient.",
    en: "ORALIGN® gives you an online dashboard to submit a case in minutes: patient data, intraoral scans (STL) and clinical photos. We handle treatment planning, manufacturing and delivery back to your practice — you keep the patient relationship.",
    ar: "يضع ORALIGN® بين يديك لوحة إدارة عبر الإنترنت لإرسال الحالة في دقائق: بيانات المريض، الطبعات الرقمية (STL) والصور السريرية. نتكفّل بالتخطيط والتصنيع والتسليم — وأنت تحتفظ بعلاقة المريض.",
  },
  workflowEyebrow: {
    fr: "Comment ça marche",
    en: "How the workflow works",
    ar: "كيف يسير المسار",
  },
  benefitsEyebrow: {
    fr: "Pourquoi nous rejoindre",
    en: "Why partner with us",
    ar: "لماذا الشراكة معنا",
  },
  primary: {
    fr: "Accéder au tableau de bord",
    en: "Access the dashboard",
    ar: "ادخل إلى لوحة الإدارة",
  },
  secondary: {
    fr: "Devenir cabinet partenaire",
    en: "Become a partner practice",
    ar: "كن عيادة شريكة",
  },
  legal: {
    fr: "Aura Aligners, SARL · Les Jardins de Carthage, Tunis",
    en: "Aura Aligners, SARL · Les Jardins de Carthage, Tunis",
    ar: "Aura Aligners, SARL · Les Jardins de Carthage, Tunis",
  },
} satisfies Record<string, Record<Lang, string>>;

type Lang3 = Record<Lang, string>;
type Step = { icon: typeof Workflow; title: Lang3; body: Lang3 };
type Benefit = Step;

const workflow: Step[] = [
  {
    icon: ScanLine,
    title: {
      fr: "01 · Soumettre",
      en: "01 · Submit",
      ar: "01 · إرسال",
    },
    body: {
      fr: "Vous envoyez les données patient, les empreintes 3D (STL) et les photographies cliniques via le tableau de bord ORALIGN®.",
      en: "You upload patient records, intraoral 3D scans (STL) and clinical photos through the ORALIGN® dashboard.",
      ar: "ترفع بيانات المريض والطبعات الرقمية (STL) والصور السريرية عبر لوحة ORALIGN®.",
    },
  },
  {
    icon: Workflow,
    title: {
      fr: "02 · Planifier",
      en: "02 · Plan",
      ar: "02 · تخطيط",
    },
    body: {
      fr: "Notre équipe construit un plan de traitement numérique, étape par étape, que vous validez avant fabrication.",
      en: "Our team builds a digital, stage-by-stage treatment plan that you validate before manufacturing.",
      ar: "يبني فريقنا خطة علاج رقمية مرحلة بمرحلة، تعتمدها قبل التصنيع.",
    },
  },
  {
    icon: Factory,
    title: {
      fr: "03 · Fabriquer",
      en: "03 · Manufacture",
      ar: "03 · تصنيع",
    },
    body: {
      fr: "Production locale en Tunisie selon les standards européens — conçue en Allemagne, fabriquée chez nous.",
      en: "Local production in Tunisia to European standards — designed in Germany, made here.",
      ar: "تصنيع محلي في تونس وفق المعايير الأوروبية — مصمَّم في ألمانيا.",
    },
  },
  {
    icon: PackageCheck,
    title: {
      fr: "04 · Livrer",
      en: "04 · Deliver",
      ar: "04 · تسليم",
    },
    body: {
      fr: "Aligneurs livrés à votre cabinet, prêts à être remis au patient. Vous gardez la relation, le suivi et le rendez-vous.",
      en: "Aligners delivered to your practice, ready to hand to the patient. You keep the relationship, the follow-up and the chair.",
      ar: "تُسلَّم الأجهزة إلى عيادتك، جاهزة لتقديمها للمريض. تحتفظ بالعلاقة والمتابعة والمواعيد.",
    },
  },
];

const benefits: Benefit[] = [
  {
    icon: BadgeCheck,
    title: {
      fr: "Qualité premium",
      en: "Premium quality",
      ar: "جودة راقية",
    },
    body: {
      fr: "Résine thermoformée, ingénierie allemande, contrôle qualité interne sur chaque arcade.",
      en: "Thermoformed resin, German engineering, internal quality control on every arch.",
      ar: "راتنج حراري، هندسة ألمانية، مراقبة جودة داخلية لكل قوس.",
    },
  },
  {
    icon: Workflow,
    title: {
      fr: "Gestion complète du cas",
      en: "Full case management",
      ar: "إدارة كاملة للحالة",
    },
    body: {
      fr: "Planification, fabrication, logistique — vous restez concentré sur le patient et la pratique.",
      en: "Planning, manufacturing, logistics — you stay focused on the patient and your practice.",
      ar: "التخطيط والتصنيع واللوجستيك — تبقى تركيزك على المريض وعملك.",
    },
  },
  {
    icon: Timer,
    title: {
      fr: "Délais maîtrisés",
      en: "Fast turnaround",
      ar: "آجال سريعة",
    },
    body: {
      fr: "Fabrication locale = délais courts et prévisibles, sans dépendre d'un envoi à l'étranger.",
      en: "Local production = short, predictable lead times — no overseas shipping bottleneck.",
      ar: "إنتاج محلي = آجال قصيرة ومضمونة، دون الاعتماد على الشحن الدولي.",
    },
  },
  {
    icon: HandCoins,
    title: {
      fr: "Vous gardez la relation",
      en: "You keep the relationship",
      ar: "تحتفظ بالعلاقة",
    },
    body: {
      fr: "Aucun contact direct entre ORALIGN® et le patient. Le cabinet reste l'interlocuteur unique.",
      en: "No direct contact between ORALIGN® and the patient. The practice stays the single point of contact.",
      ar: "لا تواصل مباشر بين ORALIGN® والمريض. العيادة هي نقطة الاتصال الوحيدة.",
    },
  },
  {
    icon: Eye,
    title: {
      fr: "Suivi transparent",
      en: "Transparent tracking",
      ar: "متابعة شفافة",
    },
    body: {
      fr: "Statut de chaque cas en temps réel sur le tableau de bord : planification, validation, production, expédition.",
      en: "Live status for every case on the dashboard: planning, validation, production, shipping.",
      ar: "حالة كل ملف مباشرة على لوحة الإدارة: تخطيط واعتماد وتصنيع وشحن.",
    },
  },
];

export function PractitionerCallSection() {
  const { lang } = useShowcaseLang();

  return (
    <section
      id="practitioner-call"
      data-section-tone="dark"
      aria-labelledby="practitioner-call-h2"
      className="relative overflow-hidden bg-[var(--sc-black)] text-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      {/* Subtle amber atmosphere — distinct from patient sections */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 80% 10%, rgba(254,202,22,0.10), transparent 55%)",
        }}
      />

      <div className="relative mx-auto max-w-[1400px] lg:px-12">
        {/* Headline + intro */}
        <Reveal>
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-end">
            <div>
              <div
                className="flex items-center gap-3"
                style={{
                  fontSize: "0.55rem",
                  letterSpacing: "0.42em",
                  textTransform: "uppercase",
                  color: "var(--sc-sun)",
                }}
              >
                <span className="sc-eyebrow-line h-px w-[18px] bg-[var(--sc-sun)]" aria-hidden="true" />
                <span>{copy.eyebrow[lang]}</span>
              </div>
              <h2
                id="practitioner-call-h2"
                className="sc-serif mt-3.5"
                style={{
                  fontSize: "clamp(2rem, 3.4vw, 3.4rem)",
                  fontWeight: 400,
                  lineHeight: 1.1,
                  color: "var(--sc-white)",
                }}
              >
                {copy.titleA[lang]}{" "}
                <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>
                  {copy.titleB[lang]}
                </em>
              </h2>
            </div>
            <p
              className="max-w-2xl text-sm leading-8 lg:justify-self-end"
              style={{ color: "var(--sc-text-mid-on-dark)" }}
            >
              {copy.intro[lang]}
            </p>
          </div>
        </Reveal>

        {/* 4-step workflow */}
        <Reveal delay>
          <div className="mt-14">
            <div
              className="mb-7 flex items-center gap-3"
              style={{
                fontSize: "0.52rem",
                letterSpacing: "0.42em",
                textTransform: "uppercase",
                color: "var(--sc-sun)",
              }}
            >
              <span className="h-px w-[18px] bg-[var(--sc-sun)]" aria-hidden="true" />
              <span>{copy.workflowEyebrow[lang]}</span>
            </div>

            <ol
              className="relative grid gap-px bg-[#262626] sm:grid-cols-2 lg:grid-cols-4"
              aria-label={copy.workflowEyebrow[lang]}
            >
              {workflow.map((step, i) => {
                const Icon = step.icon;
                return (
                  <li
                    key={step.title.fr}
                    className="relative bg-[#0f0f0f] p-7 sm:p-8"
                  >
                    {/* Step connector — desktop only */}
                    {i < workflow.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute right-[-12px] top-1/2 hidden h-px w-6 -translate-y-1/2 bg-[var(--sc-sun)] opacity-50 lg:block"
                      />
                    )}
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full"
                      style={{
                        background: "rgba(254,202,22,0.15)",
                        color: "var(--sc-sun)",
                      }}
                    >
                      <Icon size={20} strokeWidth={1.5} />
                    </div>
                    <h3
                      className="sc-serif mt-6 text-[1rem] font-medium leading-tight"
                      style={{ color: "var(--sc-white)" }}
                    >
                      {step.title[lang]}
                    </h3>
                    <p
                      className="mt-3 text-sm leading-7"
                      style={{ color: "var(--sc-text-mid-on-dark)" }}
                    >
                      {step.body[lang]}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </Reveal>

        {/* Why partner */}
        <Reveal delay>
          <div className="mt-16">
            <div
              className="mb-7 flex items-center gap-3"
              style={{
                fontSize: "0.52rem",
                letterSpacing: "0.42em",
                textTransform: "uppercase",
                color: "var(--sc-sun)",
              }}
            >
              <span className="h-px w-[18px] bg-[var(--sc-sun)]" aria-hidden="true" />
              <span>{copy.benefitsEyebrow[lang]}</span>
            </div>

            <div className="grid gap-px bg-[#262626] sm:grid-cols-2 lg:grid-cols-3">
              {benefits.map((item) => {
                const Icon = item.icon;
                return (
                  <article
                    key={item.title.fr}
                    className="bg-[#0f0f0f] p-6 sm:p-8"
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center"
                      style={{ background: "var(--sc-sun)", color: "var(--sc-black)" }}
                    >
                      <Icon size={18} strokeWidth={1.7} />
                    </div>
                    <h4
                      className="sc-serif mt-5 text-[0.98rem] font-medium leading-tight"
                      style={{ color: "var(--sc-white)" }}
                    >
                      {item.title[lang]}
                    </h4>
                    <p
                      className="mt-3 text-sm leading-7"
                      style={{ color: "var(--sc-text-mid-on-dark)" }}
                    >
                      {item.body[lang]}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </Reveal>

        {/* CTAs */}
        <Reveal delay>
          <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href="/login"
              className="sc-serif inline-flex items-center justify-center gap-3 bg-[var(--sc-sun)] px-6 py-4 text-[0.66rem] font-bold uppercase tracking-[0.22em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)]"
            >
              <span>{copy.primary[lang]}</span>
              <ArrowRight size={15} />
            </Link>
            <Link
              href="#cta"
              className="inline-flex items-center justify-center gap-3 border border-[rgba(242,245,239,0.25)] px-6 py-4 text-[0.62rem] font-medium uppercase tracking-[0.22em] text-[var(--sc-white)] no-underline transition-colors hover:border-[var(--sc-sun)] hover:text-[var(--sc-sun)]"
            >
              <span>{copy.secondary[lang]}</span>
            </Link>
            <span
              className="text-xs leading-6 sm:ms-auto"
              style={{ color: "var(--sc-text-mid-on-dark)" }}
            >
              {dict.brand.madeWhere[lang]} · {copy.legal[lang]}
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
