"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { gsap, prefersReducedMotion } from "../_lib/gsap";
import { SunBurst } from "./shared/sun-burst";
import { NoiseGrain } from "./shared/noise-grain";

const ANIMATED = [
  ".sc-hero-eyebrow",
  ".sc-hero-h1",
  ".sc-hero-sub",
  ".sc-hero-ctas",
  ".sc-hero-scroll",
];

export function Hero() {
  const { lang } = useShowcaseLang();
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      gsap.set(ANIMATED, { opacity: 1, y: 0, scale: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.set(ANIMATED, { opacity: 0 });
      gsap.set([".sc-hero-eyebrow", ".sc-hero-h1", ".sc-hero-sub", ".sc-hero-ctas", ".sc-hero-scroll"], { y: 24 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(".sc-hero-eyebrow", { opacity: 1, y: 0, duration: 0.8 }, 0.15)
        .to(".sc-hero-h1", { opacity: 1, y: 0, duration: 1 }, 0.3)
        .to(".sc-hero-sub", { opacity: 1, y: 0, duration: 0.85 }, 0.55)
        .to(".sc-hero-ctas", { opacity: 1, y: 0, duration: 0.85 }, 0.7)
        .to(".sc-hero-scroll", { opacity: 1, y: 0, duration: 1, ease: "power2.out" }, 1.2);
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef as React.Ref<HTMLElement>}
      id="hero"
      data-section-tone="dark"
      aria-labelledby="hero-h1"
      className="relative overflow-hidden bg-[var(--sc-black)] text-[var(--sc-white)] min-h-[82svh]"
    >
      {/* Hero photography placeholder — real lifestyle image to be added later.
          Keeps an atmospheric amber wash + vortex pattern in the meantime. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[0]"
        style={{
          background:
            "radial-gradient(ellipse at 78% 35%, rgba(254,202,22,0.18), transparent 55%), radial-gradient(circle at 20% 75%, rgba(254,202,22,0.06), transparent 60%), var(--sc-black)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 z-[2] h-32"
        style={{
          background:
            "linear-gradient(to bottom, transparent, var(--sc-black))",
        }}
      />
      <NoiseGrain opacity={0.18} />

      <div
        aria-hidden="true"
        className="absolute pointer-events-none z-[2] opacity-70"
        style={{
          right: "-12%",
          top: "8%",
          width: "min(74vw, 760px)",
          height: "min(74vw, 760px)",
        }}
      >
        <SunBurst variant="hero" className="w-full h-full" />
      </div>

      <div className="relative z-[5] mx-auto flex min-h-[82svh] max-w-[1400px] flex-col justify-center px-6 py-20 sm:px-8 lg:px-12 lg:py-24">
        <div
          className="sc-hero-eyebrow flex items-center gap-3 mb-9"
          style={{
            color: "var(--sc-sun)",
            fontSize: "0.55rem",
            letterSpacing: "0.45em",
            textTransform: "uppercase",
          }}
        >
          <span className="sc-eyebrow-line w-[26px] h-px bg-[var(--sc-sun)]" aria-hidden="true" />
          <span>{dict.hero.eyebrow[lang]}</span>
        </div>

        <h1
          id="hero-h1"
          className="sc-hero-h1 sc-serif text-[var(--sc-white)] mb-7"
          style={{ fontSize: "clamp(2.6rem, 5vw, 5.4rem)", fontWeight: 200, lineHeight: 1.04 }}
        >
          {dict.hero.headlinePart1[lang]}
          <br />
          <em style={{ fontStyle: "italic", color: "var(--sc-sun)", fontWeight: 300 }}>
            {dict.hero.headlineEm[lang]}
          </em>
          {dict.hero.headlinePart3[lang] && (
            <>
              {" "}
              <strong style={{ fontWeight: 400 }}>{dict.hero.headlinePart3[lang]}</strong>
            </>
          )}
        </h1>

        <p className="sc-hero-sub mb-10 max-w-[540px]" style={{ fontSize: "0.96rem", lineHeight: 1.9, color: "rgba(242,245,239,0.72)" }}>
          {dict.hero.sub[lang]}
        </p>

        {/* ONE primary CTA + ONE subtle ghost link per brand brief */}
        <div className="sc-hero-ctas flex items-center gap-8 flex-wrap">
          <Link
            href="#cta"
            className="sc-serif no-underline inline-block transition-colors hover:bg-[var(--sc-sun-2)]"
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              background: "var(--sc-sun)",
              color: "var(--sc-black)",
              padding: "17px 36px",
              fontWeight: 700,
            }}
          >
            {dict.hero.ctaPrimary[lang]}
          </Link>
          <Link
            href="#dashboard-preview"
            className="no-underline flex items-center gap-3 transition-colors hover:text-[var(--sc-sun)]"
            style={{ fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(242,245,239,0.66)" }}
          >
            <span>{dict.hero.ctaGhost[lang]}</span>
            <span className="block w-[26px] h-px bg-current" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div
        className="sc-hero-scroll absolute bottom-7 left-6 z-[6] flex items-center gap-3 lg:left-[calc((100vw-min(1400px,100vw))/2+48px)]"
        style={{ fontSize: "0.55rem", letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(242,245,239,0.42)" }}
      >
        <div className="relative w-9 h-px overflow-hidden bg-[rgba(248,246,242,0.2)]">
          <span
            aria-hidden="true"
            className="absolute top-0 left-[-100%] w-full h-full bg-[var(--sc-sun)]"
            style={{ animation: "sc-sbar 2.8s ease-in-out infinite" }}
          />
        </div>
        <span>{dict.hero.scroll[lang]}</span>
      </div>
    </section>
  );
}
