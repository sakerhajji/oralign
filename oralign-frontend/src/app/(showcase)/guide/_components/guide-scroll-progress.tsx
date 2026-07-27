"use client";

import { useEffect, useState } from "react";
import type { GuideCopy } from "./guide-copy";

type GuideScrollProgressProps = {
  progress: GuideCopy["progress"];
};

export function GuideScrollProgress({ progress }: GuideScrollProgressProps) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const maxScroll =
          document.documentElement.scrollHeight - window.innerHeight;
        const nextValue = maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0;
        setValue(Math.min(Math.max(nextValue, 0), 100));
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <section
      aria-label={progress.label}
      className="bg-[var(--sc-white)] px-5 pb-8 text-center text-[var(--sc-black)] sm:px-8 lg:px-12"
    >
      <div className="mx-auto max-w-[620px]">
        <p className="text-[0.64rem] uppercase tracking-[0.28em] text-[var(--sc-text-mid)]">
          {progress.label}
        </p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--sc-grey)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--sc-sun),var(--sc-sun-2))] transition-[width] duration-200"
            style={{ width: `${value}%` }}
          />
        </div>
        <p className="mt-3 text-[0.78rem] text-[var(--sc-text-mid)]">
          {progress.helper}
        </p>
      </div>
    </section>
  );
}
