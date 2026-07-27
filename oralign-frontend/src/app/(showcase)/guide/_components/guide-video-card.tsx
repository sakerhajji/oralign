"use client";

import { Play, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type GuideVideoCardProps = {
  label: string;
  placeholder: string;
  duration: string;
  title: string;
  closeLabel: string;
  youtubeUrl?: string;
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

export function GuideVideoCard({
  label,
  placeholder,
  duration,
  title,
  closeLabel,
  youtubeUrl = "",
}: GuideVideoCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const embedUrl = useMemo(() => getYouTubeEmbedUrl(youtubeUrl), [youtubeUrl]);

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
    <>
      <div className="relative aspect-video overflow-hidden bg-[var(--sc-black)] shadow-[0_18px_50px_rgba(25,25,25,0.12)]">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(135deg,rgba(254,202,22,0.18),transparent_38%),radial-gradient(circle_at_75%_30%,rgba(242,245,239,0.12),transparent_28%)]"
        />

        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group relative z-10 flex h-full w-full flex-col items-center justify-center gap-4 text-center transition hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sc-sun)]"
        >
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--sc-sun)] text-[var(--sc-black)] shadow-[0_18px_40px_rgba(254,202,22,0.24)] transition group-hover:scale-105">
            <Play className="ml-1 h-7 w-7 fill-current" aria-hidden="true" />
          </span>
          <span className="sc-subhead text-[0.58rem] text-[var(--sc-text-mid-on-dark)]">
            {label}
          </span>
        </button>

        <span className="absolute bottom-3 right-3 z-10 bg-black/50 px-2 py-1 text-[0.58rem] text-[rgba(242,245,239,0.55)]">
          {duration}
        </span>
      </div>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-video-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 px-4 py-6 backdrop-blur-sm"
        >
          <button
            type="button"
            aria-label={closeLabel}
            className="absolute inset-0 cursor-default"
            onClick={() => setIsOpen(false)}
          />

          <div className="relative z-10 w-full max-w-5xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2
                id="guide-video-title"
                className="sc-serif text-xl leading-tight text-[var(--sc-white)] sm:text-2xl"
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={closeLabel}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sc-sun)]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-hidden border border-white/15 bg-black shadow-[0_28px_100px_rgba(0,0,0,0.55)]">
              {embedUrl ? (
                <iframe
                  title={title}
                  src={embedUrl}
                  className="aspect-video w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <div className="flex aspect-video items-center justify-center px-6 text-center text-sm leading-7 text-[var(--sc-text-mid-on-dark)] sm:text-base">
                  {placeholder}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
