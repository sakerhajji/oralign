"use client";

import type { Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";
import { WearGuide, type GuideLabels, type GuideStep } from "./wear-guide";

/**
 * "How to wear your aligners": the ORALIGN guide film and its ten steps.
 * The steps follow the film word for word (its captions are the source):
 * steps 4 and 5 carry the film's two follow-up cards as their notes.
 */
const wearGuideCopy: Record<
  Lang,
  { title: string; intro: string; labels: GuideLabels; steps: GuideStep[] }
> = {
  fr: {
    title:
      "Comment porter vos aligneurs ORALIGN® pour obtenir les meilleurs résultats",
    intro:
      "Dix gestes simples, de la pose au rangement, pour que vos aligneurs agissent comme prévu. Votre praticien ORALIGN® reste là pour répondre à vos questions tout au long du traitement.",
    labels: {
      film: "Film : comment porter vos aligneurs ORALIGN, en 10 gestes",
      play: "Lire le film",
      pause: "Mettre le film en pause",
      replay: "Revoir le film",
      fullscreen: "Plein écran",
      pickStep: "Choisissez une étape pour la voir dans le film.",
    },
    steps: [
      { title: "Lavez-vous les mains." },
      { title: "Rincez l’aligneur à l’eau froide." },
      { title: "Placez-le d’abord sur les dents de devant." },
      {
        title: "Appuyez doucement avec les doigts jusqu’aux molaires.",
        note: "Ne mordez pas pour le mettre en place. Une fois en place, mordez sur un chewie, devant et sur les côtés : il améliore l’ajustement, surtout les 3 premiers jours.",
      },
      {
        title: "Pour le retirer, commencez par l’arrière, côté molaires.",
        note: "S’il résiste, faites de même de l’autre côté.",
      },
      {
        title: "Portez-les 22 h par jour.",
        note: "Retirez-les uniquement pour manger et pour boire autre chose que de l’eau.",
      },
      { title: "Brossez-vous les dents avant de les remettre." },
      {
        title: "Nettoyez-les à l’eau froide avec une brosse souple.",
        note: "Jamais d’eau chaude.",
      },
      { title: "Rangez-les toujours dans leur étui ORALIGN." },
      { title: "Changez d’aligneur tous les 10 jours." },
    ],
  },
  en: {
    title: "How to wear your ORALIGN® aligners for the best results",
    intro:
      "Ten simple steps, from putting them in to putting them away, so your aligners work as planned. Your ORALIGN® practitioner is there to answer your questions throughout treatment.",
    labels: {
      film: "Film: how to wear your ORALIGN aligners, in 10 steps",
      play: "Play the film",
      pause: "Pause the film",
      replay: "Watch again",
      fullscreen: "Full screen",
      pickStep: "Choose a step to see it in the film.",
      captions: "The captions in the film are in French.",
    },
    steps: [
      { title: "Wash your hands." },
      { title: "Rinse the aligner in cold water." },
      { title: "Fit it over your front teeth first." },
      {
        title: "Press it gently into place with your fingers, back to the molars.",
        note: "Don’t bite it into place. Once it’s in, bite on a chewie, at the front and on both sides: it improves the fit, especially in the first 3 days.",
      },
      {
        title: "To remove it, start at the back, on the molars.",
        note: "If it resists, do the same on the other side.",
      },
      {
        title: "Wear them 22 hours a day.",
        note: "Take them out only to eat, or to drink anything other than water.",
      },
      { title: "Brush your teeth before putting them back in." },
      {
        title: "Clean them in cold water with a soft brush.",
        note: "Never hot water.",
      },
      { title: "Always keep them in their ORALIGN case." },
      { title: "Move to your next aligner every 10 days." },
    ],
  },
  ar: {
    title: "كيف ترتدي تقويم ORALIGN® للحصول على أفضل النتائج",
    intro:
      "عشر خطوات بسيطة، من تركيب القوالب إلى حفظها، لتعمل كما هو مخطط لها. يبقى طبيب ORALIGN® إلى جانبك للإجابة عن أسئلتك طوال فترة العلاج.",
    labels: {
      film: "فيلم: كيف ترتدي قوالب ORALIGN، في 10 خطوات",
      play: "تشغيل الفيلم",
      pause: "إيقاف الفيلم مؤقتاً",
      replay: "إعادة المشاهدة",
      fullscreen: "ملء الشاشة",
      pickStep: "اختر خطوة لمشاهدتها في الفيلم.",
      captions: "النصوص داخل الفيلم باللغة الفرنسية.",
    },
    steps: [
      { title: "اغسل يديك." },
      { title: "اشطف القالب بالماء البارد." },
      { title: "ضعه أولاً على الأسنان الأمامية." },
      {
        title: "اضغط عليه بلطف بأصابعك حتى الأضراس.",
        note: "لا تعضّ لتثبيته. بعد تثبيته، اعضض على أداة العض (chewie) من الأمام وعلى الجانبين: فهي تحسّن انطباق القالب، خاصةً في الأيام الثلاثة الأولى.",
      },
      {
        title: "لنزعه، ابدأ من الخلف، من جهة الأضراس.",
        note: "إذا قاوم، كرّر الشيء نفسه من الجهة الأخرى.",
      },
      {
        title: "ارتدِ القوالب 22 ساعة يومياً.",
        note: "انزعها فقط لتناول الطعام أو لشرب أي شيء غير الماء.",
      },
      { title: "نظّف أسنانك بالفرشاة قبل إعادتها." },
      {
        title: "نظّفها بالماء البارد وبفرشاة ناعمة.",
        note: "لا تستخدم الماء الساخن أبداً.",
      },
      { title: "احفظها دائماً في علبة ORALIGN الخاصة بها." },
      { title: "انتقل إلى القالب التالي كل 10 أيام." },
    ],
  },
};

export function WearAlignersVideoSection() {
  const { lang } = useShowcaseLang();
  const copy = wearGuideCopy[lang];

  return (
    <section
      id="wear-aligners-video"
      data-section-tone="dark"
      aria-labelledby="wear-aligners-video-title"
      className="bg-[var(--sc-black)] px-5 py-20 text-[var(--sc-white)] sm:px-8 sm:py-24 lg:px-12 lg:py-28"
    >
      <div className="mx-auto w-full max-w-[1280px]">
        {/* Same columns as the guide below: the title sits over the film,
            the introduction over the steps. */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] lg:items-end lg:gap-12">
          <h2
            id="wear-aligners-video-title"
            className="sc-serif max-w-[22ch] text-balance text-[clamp(1.9rem,3.6vw,3.2rem)] leading-[1.12]"
          >
            {copy.title}
          </h2>
          <p className="max-w-[60ch] text-pretty text-[0.95rem] leading-[1.75] text-[var(--sc-text-mid-on-dark)] sm:text-[1rem]">
            {copy.intro}
          </p>
        </div>

        <div className="mt-10 lg:mt-14">
          <WearGuide steps={copy.steps} labels={copy.labels} listId="wear-guide-steps" />
        </div>
      </div>
    </section>
  );
}
