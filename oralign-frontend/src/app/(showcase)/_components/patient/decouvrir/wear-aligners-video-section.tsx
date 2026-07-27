"use client";

import { Play, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { Lang } from "../../../_lib/i18n/dict";
import { useShowcaseLang } from "../../../_lib/i18n/lang-context";

const VIDEO_URL = process.env.NEXT_PUBLIC_ORALIGN_WEAR_ALIGNERS_VIDEO_URL ?? "";
const VIDEO_THUMBNAIL_SRC = "/showcase/Portez.webp";

const wearVideoCopy: Record<
  Lang,
  {
    title: string;
    intro: string;
    tips: [string, string, string, string];
    videoTitle: string;
    videoCta: string;
    close: string;
    unavailable: string;
    thumbnailAlt: string;
  }
> = {
  fr: {
    title:
      "Comment porter vos aligneurs ORALIGN® pour obtenir les meilleurs résultats",
    intro:
      "Tout au long du traitement, votre praticien ORALIGN® reste à vos côtés pour vous accompagner, répondre à vos questions et vous guider à chaque étape. Parce qu’un beau sourire se construit avec confiance et sérénité, voici quelques conseils simples pour vous aider à obtenir les meilleurs résultats possibles avec vos aligneurs.",
    tips: [
      "Retirez vos aligneurs avant de manger ou de boire",
      "Brossez-vous les dents après les repas, avant de remettre vos aligneurs.",
      "Portez vos aligneurs pendant 20 à 22 heures par jour.",
      "Des soirées cinéma à la maison aux sorties entre amis, ce traitement par aligneurs ne perturbera pas votre vie !",
    ],
    videoTitle: "Conseils ORALIGN pour porter vos aligneurs",
    videoCta: "Lire la vidéo",
    close: "Fermer la vidéo",
    unavailable:
      "Ajoutez l’URL YouTube dans NEXT_PUBLIC_ORALIGN_WEAR_ALIGNERS_VIDEO_URL pour afficher cette vidéo.",
    thumbnailAlt:
      "Aperçu vidéo des conseils pour porter les aligneurs ORALIGN",
  },
  en: {
    title: "How to wear your ORALIGN® aligners for the best results",
    intro:
      "Throughout treatment, your ORALIGN® practitioner stays by your side to answer questions and guide each step. Because a confident smile is built with calm daily habits, here are simple tips to help you get the best possible results from your aligners.",
    tips: [
      "Remove your aligners before eating or drinking.",
      "Brush your teeth after meals before putting your aligners back in.",
      "Wear your aligners for 20 to 22 hours per day.",
      "From movie nights at home to evenings with friends, aligner treatment fits naturally into your life.",
    ],
    videoTitle: "ORALIGN tips for wearing your aligners",
    videoCta: "Play video",
    close: "Close video",
    unavailable:
      "Add the YouTube URL in NEXT_PUBLIC_ORALIGN_WEAR_ALIGNERS_VIDEO_URL to display this video.",
    thumbnailAlt: "Video preview about wearing ORALIGN aligners",
  },
  ar: {
    title: "كيف ترتدي تقويم ORALIGN® للحصول على أفضل النتائج",
    intro:
      "يبقى طبيب ORALIGN® إلى جانبك طوال فترة العلاج للإجابة عن أسئلتك وإرشادك في كل مرحلة. لأن الابتسامة الجميلة تُبنى بثقة وطمأنينة، إليك نصائح بسيطة تساعدك على الحصول على أفضل النتائج.",
    tips: [
      "انزع القوالب قبل الأكل أو الشرب.",
      "نظّف أسنانك بعد الوجبات وقبل إعادة القوالب.",
      "ارتدِ القوالب من 20 إلى 22 ساعة يومياً.",
      "من السهرات العائلية إلى الخروج مع الأصدقاء، علاج التقويم الشفاف ينسجم مع حياتك اليومية.",
    ],
    videoTitle: "نصائح ORALIGN لارتداء القوالب الشفافة",
    videoCta: "تشغيل الفيديو",
    close: "إغلاق الفيديو",
    unavailable:
      "أضف رابط يوتيوب في NEXT_PUBLIC_ORALIGN_WEAR_ALIGNERS_VIDEO_URL لعرض هذا الفيديو.",
    thumbnailAlt: "معاينة فيديو حول ارتداء تقويم ORALIGN الشفاف",
  },
};

function getYouTubeEmbedUrl(videoUrl: string) {
  const value = videoUrl.trim();

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtube-nocookie.com" && url.pathname.startsWith("/embed/")) {
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("rel", "0");
      return url.toString();
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const watchId = url.searchParams.get("v");
      const embedMatch = url.pathname.match(/^\/embed\/([^/?#]+)/);
      const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
      const videoId = watchId ?? embedMatch?.[1] ?? shortsMatch?.[1];

      if (videoId) {
        return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
      }
    }

    if (host === "youtu.be") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];

      if (videoId) {
        return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function WearAlignersVideoSection() {
  const { lang } = useShowcaseLang();
  const copy = wearVideoCopy[lang];
  const [isOpen, setIsOpen] = useState(false);
  const embedUrl = useMemo(() => getYouTubeEmbedUrl(VIDEO_URL), []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <section
      id="wear-aligners-video"
      data-section-tone="dark"
      aria-labelledby="wear-aligners-video-title"
      className="flex min-h-[calc(100svh-4rem)] items-center bg-[var(--sc-black)] px-5 py-16 text-[var(--sc-white)] sm:min-h-[calc(100svh-4.5rem)] sm:px-8 sm:py-20 lg:min-h-[calc(100svh-5rem)] lg:px-12 lg:py-24"
    >
      <div className="mx-auto w-full max-w-[1240px]">
        <div className="mx-auto max-w-[1020px] text-center">
          <h2
            id="wear-aligners-video-title"
            className="sc-serif text-balance text-[clamp(2rem,4vw,3.55rem)] leading-[1.12]"
          >
            {copy.title}
          </h2>
          <p className="mx-auto mt-6 max-w-[940px] text-pretty text-[0.9rem] leading-[1.75] text-[var(--sc-text-mid-on-dark)] sm:text-[0.98rem]">
            {copy.intro}
          </p>
        </div>

        <div className="mt-12 grid items-center gap-10 lg:mt-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
          <ul className="space-y-5">
            {copy.tips.map((tip) => (
              <li
                key={tip}
                className="flex items-start gap-4 text-[0.98rem] leading-[1.8] text-[rgba(242,245,239,0.92)] sm:text-[1.04rem]"
              >
                <span
                  aria-hidden="true"
                  className="mt-[0.72em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sc-white)]"
                />
                <span>{tip}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label={copy.videoCta}
            className="group relative mx-auto block w-full max-w-[420px] overflow-hidden border border-[rgba(255,200,47,0.72)] bg-[rgba(255,255,255,0.04)] text-left shadow-[0_26px_70px_rgba(0,0,0,0.38)] transition duration-300 hover:-translate-y-1 hover:border-[var(--sc-sun)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-sun)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--sc-black)]"
          >
            <span className="relative block aspect-square">
              <Image
                src={VIDEO_THUMBNAIL_SRC}
                alt={copy.thumbnailAlt}
                fill
                sizes="(min-width: 1024px) 420px, 88vw"
                className="object-cover object-center transition duration-500 group-hover:scale-[1.03]"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
              <span className="absolute bottom-5 left-5 inline-flex h-12 w-16 items-center justify-center rounded-xl bg-[#ff0033] text-white shadow-[0_18px_34px_rgba(255,0,51,0.32)] transition duration-300 group-hover:scale-105">
                <Play className="ml-1 h-6 w-6 fill-current" aria-hidden="true" />
              </span>
            </span>
          </button>
        </div>
      </div>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wear-aligners-modal-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 px-4 py-6 backdrop-blur-sm"
        >
          <button
            type="button"
            aria-label={copy.close}
            className="absolute inset-0 cursor-default"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative z-10 w-full max-w-5xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3
                id="wear-aligners-modal-title"
                className="sc-serif text-xl text-[var(--sc-white)] sm:text-2xl"
              >
                {copy.videoTitle}
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={copy.close}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-sun)]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-hidden border border-white/15 bg-black shadow-[0_28px_100px_rgba(0,0,0,0.55)]">
              {embedUrl ? (
                <iframe
                  title={copy.videoTitle}
                  src={embedUrl}
                  className="aspect-video w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <div className="flex aspect-video items-center justify-center px-6 text-center text-sm leading-7 text-[var(--sc-text-mid-on-dark)] sm:text-base">
                  {copy.unavailable}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
