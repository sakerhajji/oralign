'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useT } from '@/lib/i18n/lang-context';

/**
 * The right-hand panel of /login and /signup: the ORALIGN black case
 * opening above the yellow one, instead of a still.
 *
 * Source: oralign_boite_noire.mp4 (1440x1440, 6 s, HEVC 10-bit — which
 * Chrome and Firefox often cannot play). Re-encoded as a seamless loop:
 * the clip, then the same clip reversed (the lid closes again), 12 s, no
 * audio. AV1 first (0.5 MB), H.264 as the fallback (1.4 MB); the poster is
 * the first frame. Files carry a content hash (public/ is served immutable
 * for a year): a re-encode gets new names.
 *
 * The panel only exists from 1024 px, so the film is only played there —
 * `preload="none"` keeps phones from downloading it. No autoplay under
 * reduced motion or Save-Data (the poster stays, the button plays it), and
 * a visible pause control, since it loops for longer than 5 s (WCAG 2.2.2).
 */
const FILM = {
  poster: '/auth/oralign-black-case-poster.d7737d87.webp',
  av1: '/auth/oralign-black-case.av1.cbf5c92e.mp4',
  h264: '/auth/oralign-black-case.h264.b727487f.mp4',
};

const DESKTOP = '(min-width: 1024px)';

export function AuthFilmPanel() {
  const { t } = useT();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;
    if (reduce || saveData) return;
    const desktop = window.matchMedia(DESKTOP);
    const start = () => {
      if (desktop.matches && video.paused) video.play().catch(() => {});
    };
    start();
    desktop.addEventListener('change', start);
    return () => desktop.removeEventListener('change', start);
  }, []);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  return (
    <div className="relative hidden overflow-hidden bg-[#191919] lg:block">
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        poster={FILM.poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={t('authPages.common.filmAlt')}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        <source src={FILM.av1} type='video/mp4; codecs="av01.0.08M.10"' />
        <source src={FILM.h264} type='video/mp4; codecs="avc1.640032"' />
      </video>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t('authPages.common.pauseFilm') : t('authPages.common.playFilm')}
        className="absolute bottom-6 end-6 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(25,25,25,0.6)] text-white transition-colors hover:bg-[rgba(25,25,25,0.8)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#feca16]"
      >
        {playing ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4 fill-current" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
