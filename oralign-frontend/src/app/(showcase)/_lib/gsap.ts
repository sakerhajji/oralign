"use client";

/**
 * Centralized GSAP setup for the showcase.
 *
 * - Registers ScrollTrigger once, only in the browser.
 * - Exposes a single `prefersReducedMotion()` helper so animation modules can
 *   short-circuit instead of duplicating the media-query check.
 *
 * Usage inside a client component:
 *
 *   import { gsap, prefersReducedMotion } from "../../_lib/gsap";
 *
 *   useEffect(() => {
 *     if (prefersReducedMotion()) return;
 *     const ctx = gsap.context(() => { ... }, ref);
 *     return () => ctx.revert();
 *   }, []);
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
  // Refresh ScrollTrigger after webfonts load so triggers measure against
  // final layout (Playfair / DM Sans swap can shift heights).
  if (document.fonts) {
    document.fonts.ready.then(() => ScrollTrigger.refresh()).catch(() => {});
  }
}

export { gsap, ScrollTrigger };

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
