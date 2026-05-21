"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { gsap, prefersReducedMotion } from "../_lib/gsap";
import { NoiseGrain } from "./shared/noise-grain";

const ANIMATED = [
  ".sc-hero-eyebrow",
  ".sc-hero-h1",
  ".sc-hero-sub",
  ".sc-hero-ctas",
  ".sc-hero-scroll",
  ".sc-hero-orbit",
];

export function Hero() {
  const { lang } = useShowcaseLang();
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set(ANIMATED, {
          opacity: 1,
          y: 0,
          scale: 1,
          clearProps: "transform",
        });

        gsap.set(".sc-hero-orbit-pulse", {
          scale: 1,
          clearProps: "transform",
        });

        return;
      }

      gsap.set(
        [
          ".sc-hero-eyebrow",
          ".sc-hero-h1",
          ".sc-hero-sub",
          ".sc-hero-ctas",
          ".sc-hero-scroll",
        ],
        {
          opacity: 0,
          y: 28,
        }
      );

      gsap.set(".sc-hero-orbit", {
        opacity: 0,
        scale: 0.94,
      });

      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
      });

      tl.to(
        ".sc-hero-orbit",
        {
          opacity: 1,
          scale: 1,
          duration: 1.25,
        },
        0
      )
        .to(
          ".sc-hero-eyebrow",
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
          },
          0.12
        )
        .to(
          ".sc-hero-h1",
          {
            opacity: 1,
            y: 0,
            duration: 1,
          },
          0.28
        )
        .to(
          ".sc-hero-sub",
          {
            opacity: 1,
            y: 0,
            duration: 0.85,
          },
          0.52
        )
        .to(
          ".sc-hero-ctas",
          {
            opacity: 1,
            y: 0,
            duration: 0.85,
          },
          0.7
        )
        .to(
          ".sc-hero-scroll",
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: "power2.out",
          },
          1.08
        );

      gsap.to(".sc-hero-orbit-pulse", {
        scale: 1.045,
        duration: 1.15,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        transformOrigin: "50% 50%",
      });

      gsap.to(".sc-hero-orbit-core", {
        scale: 1.28,
        opacity: 0.72,
        duration: 1.15,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        transformOrigin: "50% 50%",
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="hero"
      data-section-tone="dark"
      aria-labelledby="hero-h1"
      className="
        relative isolate min-h-[88svh] max-w-full overflow-hidden
        bg-[var(--sc-black)] text-[var(--sc-white)]
      "
    >
      {/* Base premium black background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(254,202,22,0.1), transparent 38%), radial-gradient(circle at 18% 78%, rgba(254,202,22,0.055), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.035), transparent 38%), var(--sc-black)",
        }}
      />

      {/* Soft vignette */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(90deg, rgba(5,5,5,0.88) 0%, rgba(5,5,5,0.56) 46%, rgba(5,5,5,0.82) 100%)",
        }}
      />

      {/* Big centered heartbeat circle pattern */}
      <div
        aria-hidden="true"
        className="
          sc-hero-orbit pointer-events-none absolute z-[2]
          left-1/2 top-1/2
          h-[560px] w-[560px]
          -translate-x-1/2 -translate-y-1/2
          opacity-55
          sm:h-[720px] sm:w-[720px] sm:opacity-60
          lg:h-[920px] lg:w-[920px] lg:opacity-65
          xl:h-[1040px] xl:w-[1040px]
        "
      >
        <div className="sc-hero-orbit-pulse absolute inset-0">
          <div className="absolute inset-0 rounded-full border border-[rgba(254,202,22,0.08)]" />
          <div className="absolute inset-[10%] rounded-full border border-[rgba(254,202,22,0.1)]" />
          <div className="absolute inset-[20%] rounded-full border border-[rgba(254,202,22,0.12)]" />
          <div className="absolute inset-[31%] rounded-full border border-[rgba(254,202,22,0.15)]" />
          <div className="absolute inset-[42%] rounded-full border border-[rgba(254,202,22,0.2)]" />
          <div className="absolute inset-[49%] rounded-full border border-[rgba(254,202,22,0.28)]" />

          <div
            className="
              sc-hero-orbit-core absolute left-1/2 top-1/2
              h-3 w-3 -translate-x-1/2 -translate-y-1/2
              rounded-full
            "
            style={{
              background: "var(--sc-sun)",
              boxShadow:
                "0 0 22px rgba(254,202,22,0.72), 0 0 70px rgba(254,202,22,0.28)",
            }}
          />
        </div>
      </div>

      <NoiseGrain opacity={0.16} />

      {/* Bottom fade */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 z-[4] h-48"
        style={{
          background:
            "linear-gradient(to bottom, transparent, rgba(5,5,5,0.82), var(--sc-black))",
        }}
      />

      <div
        className="
          relative z-[5] mx-auto flex min-h-[88svh] max-w-[1400px]
          flex-col justify-center px-5 py-24
          sm:px-8 sm:py-28
          lg:px-12 lg:py-32
        "
      >
        <div className="max-w-[900px]">
          <div
            className="
              sc-hero-eyebrow mb-6 flex max-w-full items-center gap-3
              text-[0.58rem] uppercase tracking-[0.42em]
              sm:mb-8
            "
            style={{ color: "var(--sc-sun)" }}
          >
            <span
              className="h-px w-8 shrink-0 bg-[var(--sc-sun)]"
              aria-hidden="true"
            />
            <span className="leading-none">{dict.hero.eyebrow[lang]}</span>
          </div>

          <h1
            id="hero-h1"
            className="
              sc-hero-h1 sc-serif mb-7 max-w-[980px]
              text-balance text-[clamp(2.65rem,10.5vw,6.85rem)]
              font-normal leading-[0.96] tracking-[-0.045em]
              text-[var(--sc-white)]
            "
          >
            <span>{dict.hero.headlinePart1[lang]}</span>
            <br />
            <em
              className="font-light italic"
              style={{ color: "var(--sc-sun)" }}
            >
              {dict.hero.headlineEm[lang]}
            </em>

            {dict.hero.headlinePart3[lang] && (
              <>
                {" "}
                <strong className="font-normal">
                  {dict.hero.headlinePart3[lang]}
                </strong>
              </>
            )}
          </h1>

          <p
            className="
              sc-hero-sub mb-10 max-w-[620px] text-pretty
              text-[0.98rem] leading-[1.9]
              sm:text-[1.05rem]
            "
            style={{ color: "rgba(242,245,239,0.76)" }}
          >
            {dict.hero.sub[lang]}
          </p>

          <div
            className="
              sc-hero-ctas flex max-w-full flex-col items-stretch gap-4
              sm:flex-row sm:items-center sm:gap-7
            "
          >
            <Link
              href="#cta"
              className="
                sc-serif group inline-flex min-h-14 w-full max-w-[360px]
                items-center justify-center overflow-hidden px-7 py-4
                text-center text-[0.72rem] font-bold uppercase
                tracking-[0.17em] no-underline transition-all duration-300
                hover:-translate-y-0.5 hover:shadow-[0_22px_70px_rgba(254,202,22,0.18)]
                focus:outline-none focus-visible:ring-2
                focus-visible:ring-[var(--sc-sun)]
                focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sc-black)]
                sm:w-auto
              "
              style={{
                background: "var(--sc-sun)",
                color: "var(--sc-black)",
              }}
            >
              <span className="relative z-10">{dict.hero.ctaPrimary[lang]}</span>
            </Link>

            <Link
              href="#dashboard-preview"
              className="
                group inline-flex max-w-full items-center gap-3
                text-[0.64rem] uppercase tracking-[0.2em]
                no-underline transition-colors duration-300
                hover:text-[var(--sc-sun)]
                focus:outline-none focus-visible:text-[var(--sc-sun)]
              "
              style={{ color: "rgba(242,245,239,0.68)" }}
            >
              <span>{dict.hero.ctaGhost[lang]}</span>
              <span
                className="
                  h-px w-7 bg-current transition-transform duration-300
                  group-hover:translate-x-1
                "
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </div>

      <div
        className="
          sc-hero-scroll absolute bottom-7 left-5 z-[6]
          hidden items-center gap-3
          text-[0.55rem] uppercase tracking-[0.38em]
          sm:flex
          lg:left-[calc((100vw-min(1400px,100vw))/2+48px)]
        "
        style={{ color: "rgba(242,245,239,0.42)" }}
      >
        <div className="relative h-px w-10 overflow-hidden bg-[rgba(248,246,242,0.2)]">
          <span
            aria-hidden="true"
            className="absolute left-[-100%] top-0 h-full w-full bg-[var(--sc-sun)]"
            style={{ animation: "sc-sbar 2.8s ease-in-out infinite" }}
          />
        </div>
        <span>{dict.hero.scroll[lang]}</span>
      </div>
    </section>
  );
}