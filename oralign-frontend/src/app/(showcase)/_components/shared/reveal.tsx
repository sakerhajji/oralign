"use client";

import { useLayoutEffect, useRef, type ElementType, type ReactNode, type Ref } from "react";
import { gsap, prefersReducedMotion, ScrollTrigger } from "../../_lib/gsap";

type Props = {
  children: ReactNode;
  /** Apply a small extra delay so paired Reveals stagger naturally. */
  delay?: boolean;
  className?: string;
  as?: ElementType;
};

/**
 * Wraps children in a single element that fades+slides in when scrolled into
 * view. Built on GSAP's ScrollTrigger so easings, timing, and trigger points
 * can be tuned in one place. Each instance scopes itself with gsap.context()
 * so it cleans up its own ScrollTrigger on unmount.
 */
export function Reveal({ children, delay, className = "", as: Tag = "div" }: Props) {
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      gsap.set(el, { opacity: 1, y: 0, clearProps: "transform" });
      return;
    }

    const fallback = window.setTimeout(() => {
      gsap.set(el, { opacity: 1, y: 0, clearProps: "transform" });
    }, 1200);

    const ctx = gsap.context(() => {
      gsap.set(el, { opacity: 1, y: 24 });
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.95,
        ease: "power3.out",
        delay: delay ? 0.15 : 0,
        clearProps: "transform",
        onComplete: () => window.clearTimeout(fallback),
        scrollTrigger: {
          trigger: el,
          start: "top 86%",
          toggleActions: "play none none none",
          once: true,
          onEnter: () => window.clearTimeout(fallback),
        },
      });
    }, el);

    const refresh = window.requestAnimationFrame(() => ScrollTrigger.refresh());

    return () => {
      window.clearTimeout(fallback);
      window.cancelAnimationFrame(refresh);
      ctx.revert();
    };
  }, [delay]);

  // The sc-rv / sc-rv-2 class is kept as a stable hook for reveal styling.
  // Content remains visible by default; JS progressively enhances it.
  const cls = [delay ? "sc-rv-2" : "sc-rv", className].filter(Boolean).join(" ");

  return (
    <Tag ref={ref as Ref<HTMLElement>} className={cls}>
      {children}
    </Tag>
  );
}
