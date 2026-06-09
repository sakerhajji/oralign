"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  Camera,
  EyeOff,
  Feather,
  MapPin,
  Play,
  UserRoundCheck,
} from "lucide-react";
import type { Lang } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { ShowcaseSection } from "../showcase-section";

const heroCopy: Record<
  Lang,
  {
    eyebrow: string;
    intro: string;
    origin: string;
    practitioner: string;
    practitionerHint: string;
    video: string;
    videoHint: string;
    scroll: string;
    imageAlt: string;
  }
> = {
  fr: {
    eyebrow: "Made to Shine.",
    intro:
      "Bienvenue dans l’univers ORALIGN — la marque d’aligneurs invisibles premium qui transforme chaque sourire en une expression de confiance et de lumière.",
    origin: "Conçus en Allemagne. Fabriqués en Tunisie.",
    practitioner: "Trouver un praticien",
    practitionerHint: "près de chez moi",
    video: "Découvrir ORALIGN",
    videoHint: "en vidéo",
    scroll: "Explorer ORALIGN",
    imageAlt: "Trois amies souriant ensemble au soleil",
  },
  en: {
    eyebrow: "Made to Shine.",
    intro:
      "Welcome to the ORALIGN universe — the premium clear aligner brand that turns every smile into an expression of confidence and light.",
    origin: "Designed in Germany. Manufactured in Tunisia.",
    practitioner: "Find a practitioner",
    practitionerHint: "near me",
    video: "Discover ORALIGN",
    videoHint: "on video",
    scroll: "Explore ORALIGN",
    imageAlt: "Three friends smiling together in the sunlight",
  },
  ar: {
    eyebrow: "Made to Shine.",
    intro:
      "مرحباً بكم في عالم ORALIGN — العلامة المتميزة للتقويم الشفاف التي تحوّل كل ابتسامة إلى تعبير عن الثقة والإشراق.",
    origin: "تصميم ألماني. صناعة تونسية.",
    practitioner: "ابحث عن طبيب",
    practitionerHint: "بالقرب مني",
    video: "اكتشف ORALIGN",
    videoHint: "بالفيديو",
    scroll: "اكتشف ORALIGN",
    imageAlt: "ثلاث صديقات يبتسمن معاً تحت ضوء الشمس",
  },
};

const freedomCopy: Record<
  Lang,
  {
    title: string;
    paragraphs: [string, string];
    benefits: [string, string, string, string];
    imageAlt: string;
  }
> = {
  fr: {
    title: "Libérez votre sourire dès aujourd’hui",
    paragraphs: [
      "Chez ORALIGN®, nous concevons des traitements pensés pour s’intégrer naturellement à votre quotidien, sans jamais le perturber.",
      "Grâce à nos aligneurs transparents et confortables, vos dents se déplacent progressivement en douceur, tout en offrant des résultats visibles au fil du traitement.",
    ],
    benefits: [
      "Liberté retrouvée",
      "Confiance en images",
      "Discret au quotidien",
      "Accompagnement humain",
    ],
    imageAlt: "Patiente ORALIGN souriant dans une voiture au bord de la mer",
  },
  en: {
    title: "Set your smile free today",
    paragraphs: [
      "At ORALIGN®, we design treatments that fit naturally into your daily life without disrupting it.",
      "With our clear, comfortable aligners, your teeth move gently and progressively while delivering visible results throughout treatment.",
    ],
    benefits: [
      "Freedom restored",
      "Visible confidence",
      "Discreet every day",
      "Human support",
    ],
    imageAlt: "ORALIGN patient smiling in a car by the sea",
  },
  ar: {
    title: "حرّر ابتسامتك ابتداءً من اليوم",
    paragraphs: [
      "في ORALIGN® نصمّم علاجات تنسجم بشكل طبيعي مع حياتك اليومية من دون أن تعيقها.",
      "بفضل تقويمنا الشفاف والمريح، تتحرك أسنانك تدريجياً وبسلاسة مع نتائج واضحة طوال فترة العلاج.",
    ],
    benefits: [
      "حرية مستعادة",
      "ثقة تظهر في الصور",
      "شفاف في حياتك اليومية",
      "مرافقة إنسانية",
    ],
    imageAlt: "مريضة ORALIGN تبتسم داخل سيارة قرب البحر",
  },
};

const benefitIcons = [Feather, Camera, EyeOff, UserRoundCheck] as const;

const everydayCopy: Record<
  Lang,
  {
    title: string;
    description: string;
    imageAlt: string;
  }
> = {
  fr: {
    title: "Profitez pleinement de votre quotidien",
    description:
      "Chez ORALIGN®, nous pensons qu’un traitement par aligneurs transparents doit s’intégrer naturellement à votre mode de vie, sans le compliquer.",
    imageAlt:
      "Patiente ORALIGN souriant dans un village méditerranéen au bord de la mer",
  },
  en: {
    title: "Enjoy every part of your day",
    description:
      "At ORALIGN®, we believe clear aligner treatment should fit naturally into your lifestyle without making it more complicated.",
    imageAlt:
      "ORALIGN patient smiling in a Mediterranean village by the sea",
  },
  ar: {
    title: "استمتع بكل لحظة من يومك",
    description:
      "في ORALIGN® نؤمن بأن العلاج بالتقويم الشفاف يجب أن ينسجم بصورة طبيعية مع أسلوب حياتك من دون أن يزيده تعقيداً.",
    imageAlt:
      "مريضة ORALIGN تبتسم في قرية متوسطية مطلة على البحر",
  },
};

const guideCopy: Record<
  Lang,
  {
    benefits: [string, string, string];
    statement: string;
    cta: string;
    imageAlt: string;
  }
> = {
  fr: {
    benefits: [
      "Pratiquez vos sports et profitez de vos activités préférées.",
      "Brossez-vous les dents et utilisez du fil dentaire comme d’habitude, sans fils ni bagues.",
      "Savourez les plats et les boissons que vous aimez.",
    ],
    statement:
      "D’une transparence exceptionnelle, les aligneurs ORALIGN sont conçus pour se faire oublier. Ils sont si discrets que votre entourage ne remarquera même pas votre traitement.",
    cta: "Guide d’utilisation",
    imageAlt:
      "Patient ORALIGN souriant à une terrasse de café avec ses aligneurs transparents",
  },
  en: {
    benefits: [
      "Play sports and keep enjoying all your favourite activities.",
      "Brush and floss normally, without wires or brackets getting in the way.",
      "Enjoy the meals and drinks you love.",
    ],
    statement:
      "Exceptionally clear, ORALIGN aligners are designed to fade into your daily life. They are so discreet that the people around you may never notice your treatment.",
    cta: "User guide",
    imageAlt:
      "ORALIGN patient smiling at a café terrace with his clear aligners",
  },
  ar: {
    benefits: [
      "مارس الرياضة واستمتع بأنشطتك المفضلة بكل حرية.",
      "نظّف أسنانك واستعمل الخيط كالمعتاد من دون أسلاك أو حاصرات.",
      "استمتع بالأطباق والمشروبات التي تحبها.",
    ],
    statement:
      "صُمّم تقويم ORALIGN الشفاف بدرجة استثنائية ليصبح جزءاً غير ملحوظ من يومك، حتى إن من حولك قد لا ينتبهون إلى علاجك.",
    cta: "دليل الاستخدام",
    imageAlt:
      "مريض ORALIGN يبتسم في مقهى مع تقويمه الشفاف",
  },
};

const precisionCopy: Record<
  Lang,
  {
    title: string;
    intro: string;
    benefits: [
      { title: string; description: string },
      { title: string; description: string },
      { title: string; description: string },
      { title: string; description: string },
    ];
    imageAlt: string;
  }
> = {
  fr: {
    title: "Votre sourire, aligné avec précision.",
    intro:
      "Un système de traitement complet, pensé dans les moindres détails pour allier confort, discrétion et efficacité clinique.",
    benefits: [
      {
        title: "Aligneurs invisibles sur mesure",
        description:
          "Chaque aligneur est fabriqué spécifiquement pour votre anatomie dentaire unique.",
      },
      {
        title: "Protocole progressif",
        description:
          "Étape par étape, chaque aligneur numéroté guide votre transformation en douceur.",
      },
      {
        title: "Double origine, double exigence",
        description:
          "Conçus en Allemagne. Fabriqués en Tunisie. Le meilleur des deux mondes.",
      },
      {
        title: "Suivi personnalisé",
        description:
          "Un praticien certifié ORALIGN vous accompagne à chaque phase du traitement.",
      },
    ],
    imageAlt:
      "Aligneur transparent ORALIGN éclairé par la lumière naturelle",
  },
  en: {
    title: "Your smile, aligned with precision.",
    intro:
      "A complete treatment system, considered down to the smallest detail to combine comfort, discretion and clinical effectiveness.",
    benefits: [
      {
        title: "Custom clear aligners",
        description:
          "Every aligner is made specifically for your unique dental anatomy.",
      },
      {
        title: "Progressive protocol",
        description:
          "Step by step, each numbered aligner guides your transformation gently.",
      },
      {
        title: "Two origins, one high standard",
        description:
          "Designed in Germany. Manufactured in Tunisia. The best of both worlds.",
      },
      {
        title: "Personalised follow-up",
        description:
          "An ORALIGN-certified practitioner supports you throughout treatment.",
      },
    ],
    imageAlt: "Clear ORALIGN aligner illuminated by natural light",
  },
  ar: {
    title: "ابتسامتك، مصفوفة بدقّة.",
    intro:
      "منظومة علاج متكاملة صُممت بأدق التفاصيل لتجمع بين الراحة والشفافية والفعالية السريرية.",
    benefits: [
      {
        title: "تقويم شفاف مصمم خصيصاً لك",
        description:
          "يُصنع كل قالب بما يتناسب بدقة مع تشريح أسنانك الفريد.",
      },
      {
        title: "بروتوكول تدريجي",
        description:
          "تقودك القوالب المرقمة خطوة بخطوة نحو النتيجة المطلوبة بسلاسة.",
      },
      {
        title: "خبرة مزدوجة ومعايير عالية",
        description:
          "تصميم ألماني وصناعة تونسية تجمع أفضل ما في العالمين.",
      },
      {
        title: "متابعة شخصية",
        description:
          "يرافقك طبيب معتمد من ORALIGN خلال كل مرحلة من مراحل العلاج.",
      },
    ],
    imageAlt: "تقويم ORALIGN شفاف مضاء بضوء طبيعي",
  },
};

const durationCopy: Record<
  Lang,
  {
    title: string;
    paragraphs: [string, string, string];
    imageAlt: string;
  }
> = {
  fr: {
    title: "Quelle est la durée du traitement ORALIGN® ?",
    paragraphs: [
      "Les aligneurs transparents ORALIGN® peuvent corriger différents types de désalignements dentaires, des situations simples aux cas plus complexes.",
      "Le traitement dure en moyenne 12 à 18 mois, selon votre situation clinique et le plan défini par votre praticien certifié ORALIGN®.",
      "Les premiers changements sont souvent visibles dès les premiers mois et continuent de s’affiner tout au long du traitement.",
    ],
    imageAlt:
      "Aligneur transparent ORALIGN tenu face à une lumière dorée",
  },
  en: {
    title: "How long does ORALIGN® treatment take?",
    paragraphs: [
      "ORALIGN® clear aligners can address different types of dental misalignment, from straightforward situations to more complex cases.",
      "Treatment lasts 12 to 18 months on average, depending on your clinical situation and the plan defined by your ORALIGN®-certified practitioner.",
      "Early changes are often visible within the first few months and continue to refine throughout treatment.",
    ],
    imageAlt: "Clear ORALIGN aligner held against warm golden light",
  },
  ar: {
    title: "ما مدة العلاج بتقويم ORALIGN®؟",
    paragraphs: [
      "يمكن لتقويم ORALIGN® الشفاف معالجة أنواع مختلفة من عدم انتظام الأسنان، من الحالات البسيطة إلى الحالات الأكثر تعقيداً.",
      "تتراوح مدة العلاج في المتوسط بين 12 و18 شهراً حسب حالتك السريرية والخطة التي يحددها طبيبك المعتمد من ORALIGN®.",
      "غالباً ما تبدأ التغييرات بالظهور خلال الأشهر الأولى وتستمر النتيجة في التحسن طوال فترة العلاج.",
    ],
    imageAlt: "تقويم ORALIGN شفاف أمام ضوء ذهبي دافئ",
  },
};

const wearCopy: Record<
  Lang,
  {
    title: string;
    intro: string;
    tips: [string, string, string, string];
    cta: string;
    imageAlt: string;
  }
> = {
  fr: {
    title:
      "Comment porter vos aligneurs ORALIGN® pour obtenir les meilleurs résultats",
    intro:
      "Tout au long du traitement, votre praticien ORALIGN® reste à vos côtés pour vous accompagner, répondre à vos questions et vous guider à chaque étape. Voici les réflexes essentiels à adopter au quotidien.",
    tips: [
      "Retirez vos aligneurs avant de manger ou de boire, sauf pour l’eau.",
      "Brossez-vous les dents après les repas avant de remettre vos aligneurs.",
      "Portez vos aligneurs 20 à 22 heures par jour, selon les recommandations de votre praticien.",
      "Continuez à profiter de vos sorties et de votre vie sociale : le traitement reste discret au quotidien.",
    ],
    cta: "Consulter le guide complet",
    imageAlt:
      "Patiente mettant en place ses aligneurs transparents ORALIGN devant un miroir",
  },
  en: {
    title: "How to wear your ORALIGN® aligners for the best results",
    intro:
      "Throughout treatment, your ORALIGN® practitioner remains by your side to answer questions and guide every stage. These simple habits help keep your treatment on track.",
    tips: [
      "Remove your aligners before eating or drinking anything except water.",
      "Brush your teeth after meals before putting your aligners back in.",
      "Wear your aligners for 20 to 22 hours each day, following your practitioner’s advice.",
      "Keep enjoying evenings out and time with friends: treatment remains discreet in daily life.",
    ],
    cta: "Read the complete guide",
    imageAlt:
      "Patient placing her clear ORALIGN aligners in front of a mirror",
  },
  ar: {
    title: "كيف ترتدي تقويم ORALIGN® للحصول على أفضل النتائج",
    intro:
      "يبقى طبيب ORALIGN® إلى جانبك طوال فترة العلاج للإجابة عن أسئلتك وإرشادك في كل مرحلة. تساعدك هذه العادات البسيطة على الالتزام بالخطة.",
    tips: [
      "انزع القوالب قبل الأكل أو شرب أي شيء باستثناء الماء.",
      "نظّف أسنانك بعد الوجبات وقبل إعادة القوالب.",
      "ارتدِ القوالب من 20 إلى 22 ساعة يومياً وفق إرشادات طبيبك.",
      "واصل الاستمتاع بوقتك مع العائلة والأصدقاء، فالعلاج يبقى شفافاً في حياتك اليومية.",
    ],
    cta: "اطّلع على الدليل الكامل",
    imageAlt: "مريضة تضع تقويم ORALIGN الشفاف أمام المرآة",
  },
};

/**
 * Editorial introduction for the patient discovery page.
 *
 * Desktop follows the supplied 50/50 black-and-photo composition. Mobile
 * becomes a natural stacked story: concise brand message first, then the
 * uncropped lifestyle image. Both layouts keep the main CTAs visible without
 * forcing horizontal overflow or hiding them behind the sticky header.
 */
export function OralignSection() {
  const { lang } = useShowcaseLang();
  const copy = heroCopy[lang];
  const freedom = freedomCopy[lang];
  const everyday = everydayCopy[lang];
  const guide = guideCopy[lang];
  const precision = precisionCopy[lang];
  const duration = durationCopy[lang];
  const wear = wearCopy[lang];

  return (
    <>
      <section
        id="oralign"
        data-section-tone="dark"
        aria-labelledby="oralign-title"
        className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-[var(--sc-black)] text-[var(--sc-white)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
      >
        <div className="grid min-h-[calc(100svh-4rem)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[50%_50%]">
          <div className="relative z-10 flex min-h-[620px] flex-col justify-center px-5 py-16 sm:min-h-[660px] sm:px-10 sm:py-20 lg:min-h-0 lg:px-[clamp(3rem,6vw,6.5rem)] lg:py-16 xl:px-[clamp(4rem,7vw,8rem)]">
            <div
              aria-hidden="true"
              className="absolute inset-y-0 right-0 hidden w-px bg-[rgba(242,245,239,0.12)] lg:block"
            />

            <div className="max-w-[570px]">
              <div className="mb-12 sm:mb-16 lg:mb-[clamp(4rem,9vh,7rem)]">
                <h1
                  id="oralign-title"
                  className="sc-serif text-[clamp(2.65rem,6vw,4.8rem)] leading-none text-[var(--sc-sun)]"
                >
                  ORALIGN
                </h1>
                <p className="mt-2 text-[0.72rem] font-medium tracking-[0.08em] text-[var(--sc-white)] sm:text-[0.78rem]">
                  {copy.eyebrow}
                </p>
              </div>

              <p className="max-w-[540px] text-pretty text-[clamp(1.05rem,1.55vw,1.28rem)] leading-[1.75] text-[rgba(242,245,239,0.92)]">
                {copy.intro}
              </p>
              <p className="mt-3 text-[0.9rem] tracking-[0.015em] text-[var(--sc-text-mid-on-dark)] sm:text-[0.96rem]">
                {copy.origin}
              </p>

              <div className="mt-10 grid max-w-[550px] gap-3 sm:mt-12 sm:grid-cols-2">
                <Link
                  href="#praticiens"
                  className="group inline-flex min-h-14 items-center justify-between gap-4 bg-[var(--sc-white)] px-5 py-3 text-[var(--sc-black)] no-underline transition-colors hover:bg-white"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="text-[0.72rem] font-medium leading-tight">
                      <span className="block">{copy.practitioner}</span>
                      <span className="block text-[0.66rem] text-[var(--sc-text-mid)]">
                        {copy.practitionerHint}
                      </span>
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-px w-5 shrink-0 bg-current transition-transform group-hover:translate-x-1"
                  />
                </Link>

                <Link
                  href="#parcours"
                  className="group inline-flex min-h-14 items-center justify-between gap-4 bg-[var(--sc-sun)] px-5 py-3 text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Play className="h-4 w-4 shrink-0 fill-current" aria-hidden="true" />
                    <span className="text-[0.72rem] font-medium leading-tight">
                      <span className="block">{copy.video}</span>
                      <span className="block text-[0.66rem] text-[rgba(25,25,25,0.62)]">
                        {copy.videoHint}
                      </span>
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-px w-5 shrink-0 bg-current transition-transform group-hover:translate-x-1"
                  />
                </Link>
              </div>
            </div>

            <Link
              href="#smile-freedom"
              className="mt-12 inline-flex w-fit items-center gap-3 text-[0.58rem] uppercase tracking-[0.28em] text-[rgba(242,245,239,0.48)] no-underline transition-colors hover:text-[var(--sc-sun)] lg:absolute lg:bottom-8 lg:left-[clamp(3rem,6vw,6.5rem)] xl:left-[clamp(4rem,7vw,8rem)]"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.scroll}
            </Link>
          </div>

          <div className="relative min-h-[58svh] overflow-hidden sm:min-h-[680px] lg:min-h-0">
            <Image
              src="/showcase/Friends.jpeg"
              alt={copy.imageAlt}
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover object-[50%_52%] lg:object-[50%_50%]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[rgba(25,25,25,0.18)] to-transparent lg:hidden"
            />
          </div>
        </div>
      </section>

      <section
        id="smile-freedom"
        data-section-tone="light"
        aria-labelledby="smile-freedom-title"
        className="min-h-[calc(100svh-4rem)] overflow-hidden bg-[var(--sc-white)] text-[var(--sc-black)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
      >
        <div className="grid min-h-[calc(100svh-4rem)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)] lg:grid-cols-2">
          <div className="relative min-h-[70svh] overflow-hidden sm:min-h-[760px] lg:min-h-0">
            <Image
              src="/showcase/womenBornToshine.jpeg"
              alt={freedom.imageAlt}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover object-center"
            />
          </div>

          <div className="flex items-center px-5 py-16 sm:px-10 sm:py-20 lg:px-[clamp(3rem,5.5vw,6.5rem)] lg:py-20">
            <div className="mx-auto w-full max-w-[680px] lg:mx-0">
              <h2
                id="smile-freedom-title"
                className="sc-serif max-w-[620px] text-balance text-[clamp(2rem,4vw,3.6rem)] leading-[1.14] text-[var(--sc-black)]"
              >
                {freedom.title}
              </h2>

              <div className="mt-7 max-w-[650px] space-y-5 text-[0.98rem] leading-[1.75] text-[var(--sc-text-mid)] sm:text-[1.03rem]">
                {freedom.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:mt-12">
                {freedom.benefits.map((benefit, index) => {
                  const Icon = benefitIcons[index];
                  return (
                    <div
                      key={benefit}
                      className="flex min-h-[72px] items-center gap-4 border border-[rgba(25,25,25,0.2)] bg-transparent px-4 py-3 transition-colors hover:border-[var(--sc-sun-deep)] hover:bg-[var(--sc-sun-3)]"
                    >
                      <Icon
                        aria-hidden="true"
                        strokeWidth={1.25}
                        className="h-7 w-7 shrink-0 text-[var(--sc-black)]"
                      />
                      <span className="text-[0.78rem] font-medium leading-snug text-[var(--sc-black)] sm:text-[0.82rem]">
                        {benefit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="daily-life"
        data-section-tone="light"
        aria-labelledby="daily-life-title"
        className="flex min-h-[calc(100svh-4rem)] flex-col bg-[var(--sc-white)] text-[var(--sc-black)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
      >
        <div className="px-5 py-12 text-center sm:px-8 sm:py-16 lg:px-12 lg:py-14">
          <div className="mx-auto max-w-[920px]">
            <h2
              id="daily-life-title"
              className="sc-serif text-balance text-[clamp(1.9rem,4vw,3.5rem)] leading-[1.12]"
            >
              {everyday.title}
            </h2>
            <p className="mx-auto mt-4 max-w-[760px] text-pretty text-[0.98rem] leading-[1.7] text-[var(--sc-text-mid)] sm:text-[1.05rem]">
              {everyday.description}
            </p>
          </div>
        </div>

        <div className="relative min-h-[520px] w-full flex-1 overflow-hidden sm:min-h-[600px] lg:min-h-0">
          <Image
            src="/showcase/image123456.jpeg"
            alt={everyday.imageAlt}
            fill
            sizes="100vw"
            className="object-cover object-[58%_center] sm:object-center"
          />
        </div>
      </section>

      <section
        id="guide-preview"
        data-section-tone="light"
        aria-label={guide.cta}
        className="flex min-h-[calc(100svh-4rem)] items-center bg-[var(--sc-white)] px-5 py-16 text-[var(--sc-black)] sm:min-h-[calc(100svh-4.5rem)] sm:px-8 sm:py-20 lg:min-h-[calc(100svh-5rem)] lg:px-12 lg:py-24"
      >
        <div className="mx-auto grid w-full max-w-[1240px] items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 xl:gap-20">
          <div className="relative mx-auto w-full max-w-[560px]">
            <span
              aria-hidden="true"
              className="absolute -left-1 -top-2 z-10 h-2 w-24 bg-[var(--sc-sun)] sm:w-32"
            />
            <div className="relative aspect-[4/5] overflow-hidden">
              <Image
                src="/showcase/image123.jpeg"
                alt={guide.imageAlt}
                fill
                sizes="(min-width: 1024px) 44vw, 100vw"
                className="object-cover object-center"
              />
            </div>
            <span
              aria-hidden="true"
              className="absolute -bottom-2 right-0 z-10 h-2 w-36 bg-[var(--sc-sun)] sm:w-48"
            />
          </div>

          <div className="mx-auto w-full max-w-[650px] lg:mx-0">
            <ul className="space-y-7 sm:space-y-8">
              {guide.benefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-4 text-[0.98rem] leading-[1.65] text-[var(--sc-black)] sm:text-[1.03rem]"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[0.72em] h-1.5 w-1.5 shrink-0 bg-[var(--sc-black)]"
                  />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>

            <p className="mx-auto mt-12 max-w-[590px] text-center text-[1rem] font-medium leading-[1.55] text-[var(--sc-black)] sm:mt-14 sm:text-[1.08rem]">
              {guide.statement}
            </p>

            <div className="mt-8 flex justify-center">
              <Link
                href="/patient/guide"
                className="inline-flex min-h-13 items-center justify-center bg-[var(--sc-sun)] px-8 py-3.5 text-center text-[0.72rem] font-medium text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)] focus-visible:outline-[var(--sc-black)]"
              >
                {guide.cta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        id="precision"
        data-section-tone="dark"
        aria-label={precision.title}
        className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-[var(--sc-black)] text-[var(--sc-white)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
      >
        {/* Desktop: one cinematic product canvas with content floating around
            the aligner. Mobile: the image owns a separate band so the smaller
            viewport never turns the clinical copy into unreadable overlays. */}
        <div className="relative hidden min-h-[calc(100svh-5rem)] lg:block">
          <Image
            src="/showcase/image.jpeg"
            alt={precision.imageAlt}
            fill
            sizes="100vw"
            className="object-cover object-[60%_42%]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,10,10,0.94)_0%,rgba(10,10,10,0.54)_32%,rgba(10,10,10,0.18)_53%,rgba(10,10,10,0.62)_74%,rgba(10,10,10,0.94)_100%)]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,10,0.74)_0%,transparent_30%,transparent_67%,rgba(10,10,10,0.72)_100%)]"
          />

          <div className="relative z-10 mx-auto min-h-[calc(100svh-5rem)] max-w-[1440px] px-12 py-12 xl:px-16">
            <div className="grid grid-cols-[1fr_1.25fr_1fr] gap-10">
              <h2
                className="sc-serif max-w-[430px] text-[clamp(2.2rem,3.5vw,4rem)] leading-[1.08]"
              >
                {precision.title}
              </h2>
              <div />
              <p className="max-w-[430px] pt-2 text-[0.9rem] leading-[1.8] text-[rgba(242,245,239,0.7)]">
                {precision.intro}
              </p>
            </div>

            <div className="mt-20 grid grid-cols-[1fr_1.25fr_1fr] gap-10">
              <div className="space-y-16">
                {precision.benefits.slice(0, 2).map((benefit) => (
                  <PrecisionBenefit key={benefit.title} {...benefit} />
                ))}
              </div>
              <div aria-hidden="true" />
              <div className="space-y-16">
                {precision.benefits.slice(2).map((benefit) => (
                  <PrecisionBenefit key={benefit.title} {...benefit} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:hidden">
          <div className="px-5 py-14 sm:px-10 sm:py-16">
            <h2
              className="sc-serif max-w-[620px] text-balance text-[clamp(2rem,8vw,3.6rem)] leading-[1.08]"
            >
              {precision.title}
            </h2>
            <p className="mt-5 max-w-[620px] text-[0.96rem] leading-[1.75] text-[var(--sc-text-mid-on-dark)]">
              {precision.intro}
            </p>
          </div>

          <div className="relative aspect-[4/5] overflow-hidden sm:aspect-[16/10]">
            <Image
              src="/showcase/image.jpeg"
              alt={precision.imageAlt}
              fill
              sizes="100vw"
              className="object-cover object-[64%_center]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,10,0.2),transparent_45%,rgba(10,10,10,0.35))]"
            />
          </div>

          <div className="grid gap-px bg-[rgba(242,245,239,0.16)] sm:grid-cols-2">
            {precision.benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="bg-[var(--sc-black)] px-5 py-7 sm:px-8"
              >
                <PrecisionBenefit {...benefit} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="treatment-duration"
        data-section-tone="light"
        aria-labelledby="treatment-duration-title"
        className="min-h-[calc(100svh-4rem)] overflow-hidden bg-[var(--sc-white)] text-[var(--sc-black)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)]"
      >
        <div className="grid min-h-[calc(100svh-4rem)] sm:min-h-[calc(100svh-4.5rem)] lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex items-center px-5 py-16 sm:px-10 sm:py-20 lg:px-[clamp(3rem,5vw,6rem)] lg:py-20">
            <div className="mx-auto w-full max-w-[690px] lg:mx-0">
              <h2
                id="treatment-duration-title"
                className="sc-serif max-w-[650px] text-balance text-[clamp(2rem,4vw,3.55rem)] leading-[1.15]"
              >
                {duration.title}
              </h2>

              <div className="mt-9 max-w-[650px] space-y-7 text-[1rem] leading-[1.78] text-[var(--sc-text-mid)] sm:mt-11 sm:text-[1.06rem]">
                {duration.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
          </div>

          <div className="relative min-h-[72svh] overflow-hidden sm:min-h-[760px] lg:min-h-0">
            <Image
              src="/showcase/image.jpeg"
              alt={duration.imageAlt}
              fill
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="object-cover object-[62%_center]"
            />
          </div>
        </div>
      </section>

      <section
        id="wear-aligners"
        data-section-tone="dark"
        aria-labelledby="wear-aligners-title"
        className="flex min-h-[calc(100svh-4rem)] items-center bg-[var(--sc-black)] px-5 py-16 text-[var(--sc-white)] sm:min-h-[calc(100svh-4.5rem)] sm:px-8 sm:py-20 lg:min-h-[calc(100svh-5rem)] lg:px-12 lg:py-24"
      >
        <div className="mx-auto w-full max-w-[1240px]">
          <div className="mx-auto max-w-[1020px] text-center">
            <h2
              id="wear-aligners-title"
              className="sc-serif text-balance text-[clamp(2rem,4vw,3.55rem)] leading-[1.12]"
            >
              {wear.title}
            </h2>
            <p className="mx-auto mt-6 max-w-[900px] text-pretty text-[0.95rem] leading-[1.75] text-[var(--sc-text-mid-on-dark)] sm:text-[1rem]">
              {wear.intro}
            </p>
          </div>

          <div className="mt-12 grid items-center gap-10 lg:mt-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
            <div>
              <ul className="space-y-5">
                {wear.tips.map((tip) => (
                  <li
                    key={tip}
                    className="flex items-start gap-4 text-[0.98rem] leading-[1.75] text-[rgba(242,245,239,0.9)] sm:text-[1.04rem]"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-[0.7em] h-2 w-2 shrink-0 bg-[var(--sc-sun)]"
                    />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/patient/guide"
                className="mt-9 inline-flex min-h-13 items-center justify-center border border-[var(--sc-sun)] px-7 py-3 text-[0.7rem] font-medium text-[var(--sc-sun)] no-underline transition-colors hover:bg-[var(--sc-sun)] hover:text-[var(--sc-black)]"
              >
                {wear.cta}
              </Link>
            </div>

            <div className="relative mx-auto w-full max-w-[520px]">
              <span
                aria-hidden="true"
                className="absolute -right-2 -top-2 z-10 h-20 w-2 bg-[var(--sc-sun)] sm:h-28"
              />
              <div className="relative aspect-square overflow-hidden">
                <Image
                  src="/showcase/Portez.webp"
                  alt={wear.imageAlt}
                  fill
                  sizes="(min-width: 1024px) 42vw, 100vw"
                  className="object-cover object-center"
                />
              </div>
              <span
                aria-hidden="true"
                className="absolute -bottom-2 -left-2 z-10 h-2 w-24 bg-[var(--sc-sun)] sm:w-36"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function PrecisionBenefit({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-[380px]">
      <h3 className="flex items-start gap-3 text-[1.05rem] leading-snug text-[var(--sc-white)]">
        <span
          aria-hidden="true"
          className="mt-[0.5em] h-2 w-2 shrink-0 bg-[var(--sc-sun)]"
        />
        <span>{title}</span>
      </h3>
      <p className="mt-3 ps-5 text-[0.82rem] leading-[1.75] text-[rgba(242,245,239,0.72)]">
        {description}
      </p>
    </div>
  );
}

export function OralignPrimeSection() {
  return (
    <ShowcaseSection
      id="oralign-prime"
      titleKey="oralignPrime"
      tone="tinted"
      flip
      fullScreen
    />
  );
}

export function ParcoursSection() {
  return <ShowcaseSection id="parcours" titleKey="howItWorks" fullScreen />;
}

export function PraticiensSection() {
  return (
    <ShowcaseSection
      id="praticiens"
      titleKey="findPractitioner"
      tone="tinted"
      flip
      fullScreen
    />
  );
}
