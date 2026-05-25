'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SliderMediaDeviceTarget,
  SliderMediaType,
  type SliderMedia,
} from '@/lib/types';
import {
  useActiveSliderMedia,
  useDashboardSocket,
} from '@/lib/hooks';
import { resolveSliderMediaUrl } from '@/lib/api/slider-media.service';

const AUTOPLAY_MS = 6_000;

/**
 * Doctor-dashboard hero carousel.
 *
 * - Reads the active slide list keyed on the viewport (desktop vs
 *   mobile) so admins can ship different media counts per surface.
 * - Auto-rotates every AUTOPLAY_MS, pauses on hover and when the user
 *   manually navigates. Videos disable autoplay and let the <video>
 *   element drive its own length.
 * - Subscribes to the dashboard WebSocket so admin edits show up
 *   without a page reload (the `slider:changed` event invalidates
 *   the React-Query cache).
 *
 * Renders nothing when there are no active slides — the dashboard
 * just collapses to the packs section.
 */
export function DashboardSlider() {
  const isMobile = useIsMobileViewport();
  const device = isMobile
    ? SliderMediaDeviceTarget.MOBILE
    : SliderMediaDeviceTarget.DESKTOP;

  useDashboardSocket();
  const { data, isLoading } = useActiveSliderMedia(device);

  const slides = useMemo(
    () => (data ?? []).filter((s) => urlFor(s, device) !== null),
    [data, device],
  );

  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const timer = useRef<number | null>(null);
  const currentSlide = slides[index] ?? null;
  const isVideo = currentSlide?.mediaType === SliderMediaType.VIDEO;

  // Reset to first slide when the slide list itself changes (e.g.
  // admin reorder lands in real-time).
  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  // Autoplay timer. Videos manage themselves, so we don't tick them.
  useEffect(() => {
    if (slides.length <= 1) return;
    if (hovered || isVideo) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [index, slides.length, hovered, isVideo]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + slides.length) % slides.length);
  }, [slides.length]);
  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % slides.length);
  }, [slides.length]);

  if (isLoading) {
    return <Skeleton className="aspect-[16/6] w-full rounded-2xl" />;
  }
  if (slides.length === 0) {
    return null;
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative overflow-hidden rounded-2xl border bg-muted/30 shadow-sm"
    >
      {/* Slide tracks — only the active one is rendered to keep the
          DOM light. CSS fade between slides via opacity transition. */}
      <div className="relative aspect-[16/6] w-full min-h-[200px] sm:min-h-[260px]">
        {slides.map((s, i) => {
          const url = urlFor(s, device);
          if (!url) return null;
          const inner = (
            <>
              {s.mediaType === SliderMediaType.VIDEO ? (
                <video
                  src={url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="absolute inset-0 size-full object-cover"
                  poster={resolveSliderMediaUrl(s.desktopUrl) ?? undefined}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={s.title}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  className="absolute inset-0 size-full object-cover"
                />
              )}
              {/* Soft caption strip — only when there's a title or a
                  link target. Pointer-events let the link below click
                  through the whole slide. */}
              {(s.title || s.linkUrl) && (
                <div className="absolute inset-x-0 bottom-0 flex items-end bg-gradient-to-t from-black/55 via-black/15 to-transparent p-4 sm:p-6">
                  <div className="flex flex-1 items-center justify-between gap-3">
                    <p className="line-clamp-2 max-w-[80%] text-sm font-medium text-white sm:text-base">
                      {s.title}
                    </p>
                    {s.linkUrl ? (
                      <Button
                        asChild
                        size="sm"
                        variant="secondary"
                        className="hidden sm:inline-flex"
                      >
                        <a href={s.linkUrl} target="_blank" rel="noreferrer">
                          Learn more
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          );

          return (
            <div
              key={s.id}
              className={cn(
                'absolute inset-0 transition-opacity duration-500',
                i === index ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
              aria-hidden={i !== index}
            >
              {s.linkUrl ? (
                <a
                  href={s.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block size-full"
                >
                  {inner}
                </a>
              ) : (
                inner
              )}
            </div>
          );
        })}

        {/* Prev/next chevrons — only when there's more than one slide */}
        {slides.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous slide"
              className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-background/80 text-foreground shadow hover:bg-background"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next slide"
              className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-background/80 text-foreground shadow hover:bg-background"
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </>
        ) : null}

        {/* Dots */}
        {slides.length > 1 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/60',
                )}
              />
            ))}
          </div>
        ) : null}

        {/* Subtle video marker */}
        {isVideo ? (
          <div className="absolute right-3 top-3 rounded-full bg-black/50 p-1.5 text-white">
            <PlayIcon className="size-3" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Pull the right URL for the rendering device, with a graceful fallback. */
function urlFor(s: SliderMedia, device: SliderMediaDeviceTarget): string | null {
  const primary = device === SliderMediaDeviceTarget.MOBILE ? s.mobileUrl : s.desktopUrl;
  const fallback = device === SliderMediaDeviceTarget.MOBILE ? s.desktopUrl : s.mobileUrl;
  return resolveSliderMediaUrl(primary ?? fallback);
}

/**
 * Tiny viewport hook — matches the same breakpoint the sidebar uses
 * (`md` in Tailwind = 768 px). Updates on resize so a desktop user
 * resizing into mobile rail seamlessly switches slide lists.
 */
function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < 768,
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}
