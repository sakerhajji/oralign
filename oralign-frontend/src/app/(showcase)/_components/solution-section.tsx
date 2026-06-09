"use client";

import Image from "next/image";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SunBurst } from "./shared/sun-burst";
import { Parallax } from "./shared/parallax";

export function SolutionSection() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="solution"
      data-section-tone="dark"
      aria-labelledby="solution-h2"
      className="relative bg-[var(--sc-black)] text-[var(--sc-white)] overflow-hidden"
      style={{ padding: "120px 24px" }}
    >
      <Parallax
        distance={120}
        className="absolute -right-[10%] top-1/2 -translate-y-1/2 w-[60vw] max-w-[700px] h-[60vw] max-h-[700px] pointer-events-none opacity-60"
      >
        <div aria-hidden="true" className="w-full h-full">
          <SunBurst variant="core" className="w-full h-full" />
        </div>
      </Parallax>

      <div className="relative mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="text-[var(--sc-white)] max-w-3xl">
            <div className="flex items-center gap-3" style={{ fontSize: "0.55rem", letterSpacing: "0.42em", textTransform: "uppercase", color: "var(--sc-sun)" }}>
              <span className="sc-eyebrow-line w-[18px] h-px bg-[var(--sc-sun)]" aria-hidden="true" />
              <span>{dict.solution.eyebrow[lang]}</span>
            </div>
            <h2
              id="solution-h2"
              className="sc-serif mt-3.5"
              style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 300, lineHeight: 1.08, color: "var(--sc-white)" }}
            >
              <em style={{ fontStyle: "italic", fontWeight: 300 }}>{dict.solution.h2Part1[lang]}</em>{" "}
              <strong style={{ fontWeight: 500, color: "var(--sc-sun)" }}>{dict.solution.h2Em[lang]}</strong>{" "}
              <em style={{ fontStyle: "italic", fontWeight: 300, color: "rgba(248,246,242,0.7)" }}>{dict.solution.h2Part3[lang]}</em>
            </h2>
            <div className="w-8 h-px mt-6 bg-[var(--sc-sun)] opacity-60" />
          </div>
        </Reveal>

        <div className="grid gap-10 lg:grid-cols-[5fr_7fr] mt-14 items-stretch">
          <Reveal>
            <figure className="relative min-h-[500px] overflow-hidden border border-[#303030] bg-[#202020]">
              <Image
                src="/showcase/palndetaritemt.webp"
                alt={dict.solution.imageAlt[lang]}
                fill
                sizes="(min-width: 1024px) 420px, 100vw"
                unoptimized
                className="object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{ background: "linear-gradient(to top, rgba(25,25,25,0.72), transparent 55%)" }}
              />
              <figcaption className="absolute bottom-5 left-5 right-5 text-sm leading-7 text-[rgba(242,245,239,0.78)]">
                {dict.solution.imageCaption[lang]}
              </figcaption>
            </figure>
          </Reveal>

          <Reveal delay>
            <ul className="list-none flex flex-col gap-px bg-[#1e1e1e] h-full">
              {dict.solution.cards.map((c, i) => (
                <li
                  key={c.fr}
                  className="bg-[var(--sc-black)] relative overflow-hidden border-l-2 border-transparent hover:border-[var(--sc-sun)] transition-colors group flex-1"
                  style={{ padding: "26px 28px" }}
                >
                  <span
                    aria-hidden="true"
                    className="sc-serif absolute top-3 right-5 select-none"
                    style={{ fontSize: "4.4rem", fontWeight: 300, lineHeight: 1, color: "rgba(255,255,255,0.06)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="sc-serif relative" style={{ fontSize: "1.2rem", fontWeight: 400, color: "var(--sc-white)" }}>
                    {c[lang]}
                  </h3>
                  <p className="relative mt-2" style={{ fontSize: "0.82rem", lineHeight: 1.75, color: "rgba(248,246,242,0.6)", maxWidth: 480 }}>
                    {dict.solution.cardDescs[i][lang]}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
