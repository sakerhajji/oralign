import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Total Y travel in pixels across the full enter/exit window. */
  distance?: number;
  /** Smooths scrub; higher = more lag (in seconds). */
  scrub?: number | true;
};

/**
 * Lightweight decorative wrapper. The previous version used GSAP
 * ScrollTrigger for a small scrubbed movement, which cost too much main-thread
 * work on the marketing landing page. Keep the API so call sites stay clean.
 */
export function Parallax({ children, className = "" }: Props) {
  return <div className={className}>{children}</div>;
}
