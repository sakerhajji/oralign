"use client";

import { useEffect, useRef, type ElementType, type ReactNode, type Ref } from "react";

type Props = {
  children: ReactNode;
  /** Apply a small extra delay so paired Reveals stagger naturally. */
  delay?: boolean;
  className?: string;
  as?: ElementType;
};

/**
 * Tiny reveal primitive. Content is visible in SSR by default; after hydration
 * we progressively enhance with IntersectionObserver + CSS transitions. This
 * avoids pulling GSAP/ScrollTrigger into the initial marketing-page bundle,
 * which was a major contributor to Total Blocking Time in Lighthouse.
 */
export function Reveal({ children, delay, className = "", as: Tag = "div" }: Props) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.reveal = "visible";
      return;
    }

    el.dataset.reveal = "pending";

    const reveal = () => {
      el.dataset.reveal = "visible";
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        reveal();
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    let cancelObserverSchedule: () => void;
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(() => observer.observe(el), {
        timeout: 900,
      });
      cancelObserverSchedule = () => window.cancelIdleCallback?.(idleId);
    } else {
      const timeoutId = globalThis.setTimeout(() => observer.observe(el), 120);
      cancelObserverSchedule = () => globalThis.clearTimeout(timeoutId);
    }

    const fallback = window.setTimeout(reveal, 1600);

    return () => {
      window.clearTimeout(fallback);
      cancelObserverSchedule();
      observer.disconnect();
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
