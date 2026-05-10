"use client";

import { useEffect, useRef } from "react";

/** Surfaces that always demand the dark cursor variant, regardless of which
 *  section is in view behind them. The mobile sheet is included so the cursor
 *  stays visible inside the menu overlay too. Add `data-cursor="light"` on any
 *  element that should force the dark cursor. */
const LIGHT_SURFACE_SELECTOR =
  'header[role="banner"], [data-slot="sheet-content"], [data-cursor="light"]';

const INTERACTIVE_SELECTOR =
  "a, button, [role='button'], input, label, textarea, select";

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia?.("(min-width: 1024px) and (pointer: fine)").matches) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let onDarkSection = false;
    let onLightSurface = false;

    const applyTone = () => {
      const invert = onDarkSection && !onLightSurface;
      dot.classList.toggle("sc-inv", invert);
      ring.classList.toggle("sc-inv", invert);
    };

    let rx = window.innerWidth / 2;
    let ry = window.innerHeight / 2;
    let x = rx;
    let y = ry;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;

      const target = e.target as Element | null;
      const inLight = !!target?.closest(LIGHT_SURFACE_SELECTOR);
      if (inLight !== onLightSurface) {
        onLightSurface = inLight;
        applyTone();
      }
    };

    const tick = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      ring.style.left = `${rx}px`;
      ring.style.top = `${ry}px`;
      raf = requestAnimationFrame(tick);
    };

    const onHoverIn = () => {
      ring.style.width = "44px";
      ring.style.height = "44px";
    };
    const onHoverOut = () => {
      ring.style.width = "32px";
      ring.style.height = "32px";
    };
    const interactives = document.querySelectorAll(INTERACTIVE_SELECTOR);
    interactives.forEach((el) => {
      el.addEventListener("mouseenter", onHoverIn);
      el.addEventListener("mouseleave", onHoverOut);
    });

    // Dark-section detection — recompute by geometry whenever an entry crosses
    // the viewport's mid-band, so the result is independent of which section
    // the observer fired on.
    const tones = document.querySelectorAll<HTMLElement>('[data-section-tone="dark"]');
    const recomputeDark = () => {
      const midY = window.innerHeight * 0.5;
      let active = false;
      tones.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < midY && r.bottom > midY) {
          active = true;
        }
      });
      if (active !== onDarkSection) {
        onDarkSection = active;
        applyTone();
      }
    };
    const toneObs = new IntersectionObserver(recomputeDark, {
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    tones.forEach((t) => toneObs.observe(t));
    window.addEventListener("scroll", recomputeDark, { passive: true });
    recomputeDark();

    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", recomputeDark);
      cancelAnimationFrame(raf);
      toneObs.disconnect();
      interactives.forEach((el) => {
        el.removeEventListener("mouseenter", onHoverIn);
        el.removeEventListener("mouseleave", onHoverOut);
      });
    };
  }, []);

  return (
    <>
      <div ref={dotRef} className="sc-cursor-dot" aria-hidden="true" />
      <div ref={ringRef} className="sc-cursor-ring" aria-hidden="true" />
    </>
  );
}
