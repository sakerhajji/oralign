"use client";

import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Eye,
  HeartHandshake,
  ShieldCheck,
  Smile,
  Sparkles,
  Wind,
} from "lucide-react";
import type { Lang } from "../_lib/i18n/dict";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { ImagePlaceholder } from "./shared/image-placeholder";
import Image from "next/image";

/**
 * Brochure-derived sections. Adult tone = emotional transformation.
 * Parent tone = protective, reassuring, future-looking.
 * Images are intentional placeholders — user will provide editorial photography
 * (ORALIGN IMAGERY STYLE 01) later. Per brief: real images only in before/after.
 */
const brochureCopy = {
  adult: {
    eyebrow: { fr: "Pour vous", en: "For you", ar: "لكم البالغين" },
    titleA: { fr: "Le sourire que", en: "The smile", ar: "الابتسامة" },
    titleB: { fr: "vous méritez.", en: "you deserve.", ar: "التي تستحقها." },
    intro: {
      fr: "ORALIGN® révèle votre sourire avec discrétion. Les aligneurs sont quasi invisibles, le parcours s'intègre à votre vie pro et perso. Vous gardez votre routine ; nous nous occupons du reste.",
      en: "ORALIGN® reveals your smile, quietly. The aligners stay practically invisible and the journey blends into your professional and personal life. You keep your routine; we take care of the rest.",
      ar: "يكشف ORALIGN® ابتسامتك بهدوء. الأجهزة خفيّة تقريباً والمسار يندمج في حياتك المهنية والشخصية. تحافظ على روتينك، ونحن نتكفّل بالباقي.",
    },
    proof: {
      fr: "Vous méritez de sourire librement — au travail, en photo, devant ceux que vous aimez.",
      en: "You deserve to smile freely — at work, in photos, in front of the people you love.",
      ar: "تستحق أن تبتسم بحرّية — في العمل، في الصور، أمام من تحبّ.",
    },
    cta: { fr: "Réserver ma consultation", en: "Book my consultation", ar: "احجز استشارتي" },
    imageLabel: { fr: "Portrait adulte ORALIGN", en: "ORALIGN adult portrait", ar: "صورة بالغ ORALIGN" },
    steps: [
      {
        icon: Eye,
        title: { fr: "Discret au quotidien", en: "Discreet, every day", ar: "خفيّ كل يوم" },
        body: {
          fr: "Aligneurs quasi invisibles. Vos collègues, vos amis, votre miroir : personne ne remarquera votre traitement.",
          en: "Practically invisible aligners. Colleagues, friends, your own mirror — no one will notice you're being treated.",
          ar: "أجهزة خفيّة تقريباً. الزملاء والأصدقاء وحتى مرآتك — لن يلاحظ أحد علاجك.",
        },
      },
      {
        icon: Smile,
        title: { fr: "Liberté retrouvée", en: "Freedom restored", ar: "حرية مستعادة" },
        body: {
          fr: "Se retire en quelques secondes pour manger, boire, embrasser. Aucune contrainte, aucune liste d'aliments interdits.",
          en: "Comes off in seconds to eat, drink, or kiss. No restrictions, no banned-food list.",
          ar: "تُزال في ثوانٍ للأكل أو الشرب أو التعبير. بدون قيود غذائية.",
        },
      },
      {
        icon: Camera,
        title: { fr: "Confiance en images", en: "Confidence in photos", ar: "ثقة في الصور" },
        body: {
          fr: "Souriez en photo, en réunion, sur un selfie. Sans réfléchir. Sans cacher vos dents derrière votre main.",
          en: "Smile in photos, in meetings, in selfies. Without thinking. Without hiding your teeth behind your hand.",
          ar: "ابتسم في الصور والاجتماعات والسيلفي. بدون تفكير. بدون إخفاء أسنانك.",
        },
      },
      {
        icon: HeartHandshake,
        title: { fr: "Accompagnement humain", en: "Human support", ar: "مرافقة إنسانية" },
        body: {
          fr: "Chaque étape encadrée par un praticien certifié ORALIGN®. Vous n'avancez jamais seul.",
          en: "Every step guided by a certified ORALIGN® practitioner. You never move forward alone.",
          ar: "كل مرحلة بإشراف طبيب معتمد من ORALIGN®. لن تتقدّم وحدك أبداً.",
        },
      },
    ],
    benefits: [
      { fr: "Alignement discret", en: "Discreet alignment", ar: "محاذاة خفية" },
      { fr: "Confort au quotidien", en: "Daily comfort", ar: "راحة يومية" },
      { fr: "Praticien certifié", en: "Certified practitioner", ar: "طبيب معتمد" },
    ],
  },
  parent: {
    eyebrow: { fr: "Pour votre enfant", en: "For your child", ar: "لطفلك" },
    titleA: { fr: "Et si son sourire devenait", en: "What if their smile became", ar: "ماذا لو أصبحت ابتسامته" },
    titleB: { fr: "sa plus grande force ?", en: "their greatest strength?", ar: "أعظم نقاط قوّته؟" },
    intro: {
      fr: "ORALIGN Prime accompagne votre enfant avec un parcours discret, conçu pour s'effacer dans son quotidien. Pas d'appareil visible. Pas de regard qui pèse. Juste un sourire qui se construit, à l'école comme à la maison.",
      en: "ORALIGN Prime walks alongside your child with a discreet journey designed to disappear into daily life. No visible braces. No heavy stares. Just a smile being built — at school, at home.",
      ar: "يرافق ORALIGN Prime طفلك بمسار خفيّ يصمَّم ليندمج في يومه. لا أقواس معدنية مرئية. لا نظرات ثقيلة. فقط ابتسامة تُبنى في المدرسة والمنزل.",
    },
    proof: {
      fr: "Plus la prise en charge est précoce, plus le parcours est simple, confortable et naturel pour votre enfant.",
      en: "The earlier the journey begins, the simpler, more comfortable and more natural it is for your child.",
      ar: "كلما بدأ المسار مبكراً، كان أبسط وأكثر راحة وأكثر طبيعية لطفلك.",
    },
    cta: { fr: "Parler à un praticien", en: "Talk to a practitioner", ar: "تحدّث مع طبيب" },
    imageLabel: { fr: "Famille ORALIGN Prime", en: "ORALIGN Prime family", ar: "عائلة ORALIGN Prime" },
    steps: [
      {
        icon: ShieldCheck,
        title: { fr: "Protéger sa confiance", en: "Protect their confidence", ar: "احمِ ثقته" },
        body: {
          fr: "Aligneurs transparents qui passent inaperçus en classe, en sport et dans la cour de récré.",
          en: "Clear aligners that go unnoticed in class, in sports and on the playground.",
          ar: "أجهزة شفافة تمرّ دون أن يلاحظها أحد في الفصل والرياضة وساحة المدرسة.",
        },
      },
      {
        icon: Sparkles,
        title: { fr: "Sans appareil métallique", en: "No metal braces", ar: "بدون أقواس معدنية" },
        body: {
          fr: "Pas de bagues, pas de fils, pas de moqueries. Juste un sourire qui se révèle, en douceur.",
          en: "No brackets, no wires, no teasing. Just a smile being gently revealed.",
          ar: "بدون حاصرات أو أسلاك أو تنمّر. مجرد ابتسامة تتكشّف بهدوء.",
        },
      },
      {
        icon: HeartHandshake,
        title: { fr: "Agir tôt, agir mieux", en: "Act early, act better", ar: "تدخّل مبكر، نتيجة أفضل" },
        body: {
          fr: "Une prise en charge précoce simplifie le traitement et accompagne la croissance — plutôt que de la corriger plus tard.",
          en: "An early start simplifies treatment and supports growth — instead of catching up later.",
          ar: "البدء المبكر يبسّط العلاج ويرافق النمو بدل تصحيحه لاحقاً.",
        },
      },
      {
        icon: Wind,
        title: { fr: "Respiration & élocution", en: "Breathing & speech", ar: "تنفّس ونطق" },
        body: {
          fr: "Un sourire bien aligné peut soutenir la respiration nasale, l'élocution et l'équilibre du visage à long terme.",
          en: "A well-aligned smile can support nasal breathing, speech and long-term facial balance.",
          ar: "ابتسامة منسجمة تدعم التنفّس الأنفي والنطق وتوازن الوجه على المدى الطويل.",
        },
      },
    ],
    benefits: [
      { fr: "Sans métal", en: "Metal-free", ar: "بدون معدن" },
      { fr: "Amovible & hygiénique", en: "Removable & hygienic", ar: "قابل للإزالة وصحي" },
      { fr: "Praticien spécialiste", en: "Specialist practitioner", ar: "طبيب اختصاصي" },
    ],
  },
} as const;

export function AdultBrochureSection() {
  const { lang } = useShowcaseLang();

  return (
    <BrochureSection
      id="adults"
      lang={lang}
      copy={brochureCopy.adult}
      imageTone="light"
    />
  );
}

export function ParentBrochureSection() {
  const { lang } = useShowcaseLang();

  return (
    <BrochureSection
      id="parents"
      lang={lang}
      copy={brochureCopy.parent}
      imageTone="dark"
      dark
    />
  );
}

function BrochureSection({
  id,
  lang,
  copy,
  imageTone,
  dark,
}: {
  id: string;
  lang: Lang;
  copy: typeof brochureCopy.adult | typeof brochureCopy.parent;
  imageTone: "light" | "dark";
  dark?: boolean;
}) {
  const bg = dark ? "bg-[var(--sc-black)] text-[var(--sc-white)]" : "bg-[var(--sc-white)] text-[var(--sc-black)]";
  const bodyColor = dark ? "var(--sc-text-mid-on-dark)" : "var(--sc-text-mid)";
  const cardBg = dark ? "bg-[var(--sc-black)]" : "bg-[var(--sc-white)]";
  const gridLine = dark ? "#303030" : "var(--sc-grey)";

  return (
    <section
      id={id}
      data-section-tone={dark ? "dark" : "light"}
      aria-labelledby={`${id}-h2`}
      className={bg}
      style={{ padding: "110px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
            <div>
              <div
                className="flex items-center gap-3"
                style={{ fontSize: "0.55rem", letterSpacing: "0.42em", textTransform: "uppercase", color: "var(--sc-sun)" }}
              >
                <span className="sc-eyebrow-line h-px w-[18px] bg-[var(--sc-sun)]" aria-hidden="true" />
                <span>{copy.eyebrow[lang]}</span>
              </div>
              <h2
                id={`${id}-h2`}
                className="sc-serif mt-3.5"
                style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 400, lineHeight: 1.1 }}
              >
                {copy.titleA[lang]}{" "}
                <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{copy.titleB[lang]}</em>
              </h2>
            </div>
            <div>
              <p className="max-w-2xl text-sm leading-8" style={{ color: bodyColor }}>
                {copy.intro[lang]}
              </p>
              <p
                className="mt-5 border-l-2 border-[var(--sc-sun)] pl-5 text-[0.95rem] leading-7"
                style={{ color: dark ? "var(--sc-white)" : "var(--sc-black)", fontWeight: 400 }}
              >
                {copy.proof[lang]}
              </p>
            </div>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-[420px_1fr] xl:grid-cols-[480px_1fr]">
          <Reveal>
            <figure className={`overflow-hidden border ${dark ? "border-[#303030]" : "border-[var(--sc-grey)]"}`}>
              <ImagePlaceholder
              src="/showcase/adulteAlinger.png"
                label={copy.imageLabel[lang]}
                aspect="portrait"
                tone={imageTone}
                className="border-0"
              />
              <figcaption
                className={`flex flex-wrap gap-2 p-4 ${dark ? "bg-[#101010]" : "bg-[var(--sc-white)]"}`}
              >
                {copy.benefits.map((benefit) => (
                  <span
                    key={benefit.fr}
                    className="border px-3 py-1.5 text-[0.56rem] font-medium uppercase tracking-[0.24em]"
                    style={{
                      borderColor: dark ? "rgba(242,245,239,0.18)" : "var(--sc-grey)",
                      color: dark ? "var(--sc-text-mid-on-dark)" : "var(--sc-text-mid)",
                    }}
                  >
                    {benefit[lang]}
                  </span>
                ))}
              </figcaption>
            </figure>
          </Reveal>

          <Reveal delay>
            <div className="grid gap-px sm:grid-cols-2" style={{ background: gridLine }}>
              {copy.steps.map((step) => {
                const Icon = step.icon;
                return (
                  <article
                    key={step.title.fr}
                    className={`${cardBg} p-6 sm:p-8`}
                  >
                    <div
                      className="flex h-11 w-11 items-center justify-center"
                      style={{
                        background: dark ? "rgba(254,202,22,0.14)" : "var(--sc-black)",
                        color: "var(--sc-sun)",
                      }}
                    >
                      <Icon size={20} strokeWidth={1.45} />
                    </div>
                    <h3 className="sc-serif mt-6 text-[1.05rem] font-medium leading-tight">
                      {step.title[lang]}
                    </h3>
                    <p className="mt-3 text-sm leading-7" style={{ color: bodyColor }}>
                      {step.body[lang]}
                    </p>
                  </article>
                );
              })}
            </div>
          </Reveal>
        </div>

        <Reveal delay>
          <div className="mt-9">
            <Link
              href="#cta"
              className="sc-serif inline-flex items-center justify-center gap-3 bg-[var(--sc-sun)] px-6 py-4 text-center text-[0.66rem] font-bold uppercase tracking-[0.22em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)]"
            >
              <span>{copy.cta[lang]}</span>
              <ArrowRight size={15} />
            </Link>
            <span className="mt-4 block text-xs leading-6" style={{ color: bodyColor }}>
              {dict.brand.madeWhere[lang]}
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
