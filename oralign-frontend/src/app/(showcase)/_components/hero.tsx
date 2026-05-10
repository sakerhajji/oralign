"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { gsap, prefersReducedMotion } from "../_lib/gsap";
import { SunBurst } from "./shared/sun-burst";
import { SunCore } from "./shared/sun-core";
import { NoiseGrain } from "./shared/noise-grain";

const ANIMATED = [
  ".sc-hero-eyebrow",
  ".sc-hero-h1",
  ".sc-hero-sub",
  ".sc-hero-ctas",
  ".sc-hero-scroll",
  ".sc-hero-core",
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
      gsap.set(".sc-hero-core", { scale: 0.92 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.to(".sc-hero-eyebrow", { opacity: 1, y: 0, duration: 0.8 }, 0.15)
        .to(".sc-hero-h1", { opacity: 1, y: 0, duration: 1 }, 0.3)
        .to(".sc-hero-core", { opacity: 1, scale: 1, duration: 1.4, ease: "expo.out" }, 0.35)
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
      className="relative bg-[var(--sc-black)] text-[var(--sc-white)] grid grid-cols-1 lg:grid-cols-2 overflow-hidden min-h-[100svh]"
    >
      <NoiseGrain opacity={0.25} />

      <div
        aria-hidden="true"
        className="absolute pointer-events-none z-[1]"
        style={{
          right: "-5%",
          top: "50%",
          transform: "translateY(-50%)",
          width: "min(80vw, 860px)",
          height: "min(80vw, 860px)",
        }}
      >
        <SunBurst variant="hero" className="w-full h-full" />
      </div>

      <div className="relative z-[5] flex flex-col justify-center px-6 lg:px-[72px] pt-28 pb-20 sm:pt-32 lg:pt-32 lg:pb-[80px]">
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
          style={{ fontSize: "clamp(2.6rem, 5vw, 5.4rem)", fontWeight: 300, lineHeight: 1.04 }}
        >
          {dict.hero.headlinePart1[lang]}
          <br />
          <em style={{ fontStyle: "italic", color: "var(--sc-sun)", fontWeight: 300 }}>
            {dict.hero.headlineEm[lang]}
          </em>{" "}
          <strong style={{ fontWeight: 500 }}>{dict.hero.headlinePart3[lang]}</strong>
        </h1>

        <p
          className="sc-hero-sub mb-12"
          style={{ fontSize: "0.86rem", lineHeight: 1.95, color: "rgba(248,246,242,0.55)", maxWidth: 460 }}
        >
          {dict.hero.sub[lang]}
        </p>

        <div className="sc-hero-ctas flex items-center gap-7 flex-wrap">
          <Link
            href="#cta"
            className="no-underline inline-block transition-all"
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              background: "var(--sc-sun)",
              color: "var(--sc-black)",
              padding: "15px 36px",
              fontWeight: 500,
            }}
          >
            {dict.hero.ctaPrimary[lang]}
          </Link>
          <Link
            href="#how-it-works"
            className="no-underline flex items-center gap-3 transition-colors hover:text-[var(--sc-sun)]"
            style={{ fontSize: "0.62rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(248,246,242,0.5)" }}
          >
            <span>{dict.hero.ctaGhost[lang]}</span>
            <span className="block w-[26px] h-px bg-current" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="hidden lg:flex relative z-[4] items-center justify-center overflow-hidden px-8">
        <div className="sc-hero-core relative">
          <div className="relative w-[340px] xl:w-[380px] aspect-[3/4] overflow-hidden border border-[#262626]">
            <Image
              src="/loginPicture.png"
              alt="Dentist with patient"
              fill
              priority
              sizes="(min-width: 1280px) 380px, (min-width: 1024px) 340px, 100vw"
              className="object-cover"
            />
          </div>
          <div
            aria-hidden="true"
            className="absolute -top-14 -right-16 xl:-right-20 scale-[0.6] xl:scale-[0.65] origin-top-right pointer-events-none"
          >
            <SunCore name="" sub="" />
          </div>
        </div>
      </div>

      <div
        className="sc-hero-scroll absolute bottom-9 left-6 lg:left-[72px] z-[6] flex items-center gap-3"
        style={{ fontSize: "0.55rem", letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(248,246,242,0.3)" }}
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
