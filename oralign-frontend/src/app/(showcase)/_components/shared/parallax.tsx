"use client";

import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { gsap, prefersReducedMotion } from "../../_lib/gsap";

type Props = {
  children: ReactNode;
  className?: string;
  /** Total Y travel in pixels across the full enter/exit window. */
  distance?: number;
  /** Smooths scrub; higher = more lag (in seconds). */
  scrub?: number | true;
};

/**
 * Subtle scroll-scrubbed Y translation. Keeps sun-bursts and other large
 * decorative SVGs feeling alive without scroll-jacking. The translation runs
 * from `+distance/2` at enter to `-distance/2` at exit, centered around the
 * element being mid-viewport.
 */
export function Parallax({ children, className = "", distance = 80, scrub = 0.4 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y: distance / 2 },
        {
          y: -distance / 2,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub,
          },
        },
      );
    }, el);

    return () => ctx.revert();
  }, [distance, scrub]);

  return (
    <div ref={ref as Ref<HTMLDivElement>} className={className}>
      {children}
    </div>
  );
}
