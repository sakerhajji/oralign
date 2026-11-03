"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type Ref,
} from "react";
import { armReveal } from "./reveal-observer";

type Props = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  /**
   * Start later. `true` is the 120 ms the paired-column call sites rely
   * on; a number is milliseconds, to choreograph a block after its
   * neighbour.
   */
  delay?: boolean | number;
  /**
   * "rise" (default): the block itself rises into place.
   * "group": the block stays put and only the hooks inside it move
   * (.sc-stagger, .sc-word, .sc-media, .sc-line, .sc-rise, .sc-fade —
   * see showcase.css), for a section that choreographs its own parts.
   */
  variant?: "rise" | "group";
};

/**
 * Marks a block for the scroll-in motion defined in showcase.css.
 *
 * The content is in the server HTML as is. After hydration this sets
 * data-reveal — "pending" while the block is below the fold, "visible"
 * once it scrolls in — and the CSS does the moving; a block already on
 * screen is marked "shown", a state no rule matches, so it stays as it
 * is. Under reduced motion nothing is ever hidden. No animation library:
 * the GSAP setup this replaced was the biggest Total Blocking Time cost
 * of the page.
 */
export function Reveal({
  children,
  delay,
  className = "",
  as: Tag = "div",
  variant = "rise",
}: Props) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      el.dataset.reveal = "shown";
      return;
    }
    return armReveal(el, () => {
      el.dataset.reveal = "visible";
    });
  }, []);

  const cls = [variant === "rise" ? "sc-rv" : "", className].filter(Boolean).join(" ");
  const later = delay === true ? 120 : delay;

  return (
    <Tag
      ref={ref as Ref<HTMLElement>}
      className={cls}
      style={typeof later === "number" ? revealDelay(later) : undefined}
    >
      {children}
    </Tag>
  );
}

/** Inline style that starts a hook (or everything under it) `ms` later. */
export function revealDelay(ms: number): CSSProperties {
  return { "--sc-delay": `${ms}ms` } as CSSProperties;
}
