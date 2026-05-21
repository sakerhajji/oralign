"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { ImagePlaceholder } from "./shared/image-placeholder";

export function PrimeSection() {
  const { lang } = useShowcaseLang();
  const pathname = usePathname();
  const ctaHref = pathname === "/" ? "#cta" : "/#cta";

  return (
    <section
      id="prime"
      data-section-tone="dark"
      aria-labelledby="prime-h2"
      className="bg-[var(--sc-black)] text-[var(--sc-white)] relative overflow-hidden"
      style={{ padding: "120px 24px" }}
    >
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          top: "10%",
          right: "-10%",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,200,66,0.12), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-[1400px] lg:px-12 grid gap-16 lg:grid-cols-2 items-center">
        <Reveal>
          <div className="relative w-full mx-auto" style={{ maxWidth: 520 }}>
            <ImagePlaceholder
              src="/showcase/boyalinger.png"
              label={`${dict.prime.eyebrow["en"]} — lifestyle teen portrait`}
              aspect="tall"
              tone="dark"
              className="border-0"
            />
            <div
              className="sc-serif absolute"
              style={{
                bottom: 16,
                left: 16,
                background: "var(--sc-sun)",
                color: "var(--sc-black)",
                padding: "8px 16px",
                fontSize: "0.6rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              ORALIGN Prime
            </div>
          </div>
        </Reveal>

        <Reveal delay>
          <div className="max-w-[520px]">
            <div
              className="flex items-center gap-3"
              style={{
                fontSize: "0.55rem",
                letterSpacing: "0.42em",
                textTransform: "uppercase",
                color: "var(--sc-sun)",
                marginBottom: 14,
              }}
            >
              <span className="sc-eyebrow-line w-[18px] h-px bg-[var(--sc-sun)]" aria-hidden="true" />
              <span>{dict.prime.eyebrow[lang]}</span>
            </div>
            <h2
              id="prime-h2"
              className="sc-serif"
              style={{ fontSize: "clamp(1.9rem, 3.4vw, 3.2rem)", fontWeight: 300, lineHeight: 1.1 }}
            >
              {dict.prime.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.prime.h2Em[lang]}</em>
            </h2>
            <div className="w-8 h-px mt-6 bg-[var(--sc-sun)] opacity-70" />
            <p
              className="mt-8"
              style={{ fontSize: "0.92rem", lineHeight: 1.95, color: "var(--sc-text-mid-on-dark)" }}
            >
              {dict.prime.intro[lang]}
            </p>
            <ul className="list-none mt-8 space-y-3">
              {dict.prime.benefits.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-4"
                  style={{ fontSize: "0.86rem", color: "var(--sc-text-mid-on-dark)", lineHeight: 1.7 }}
                >
                  <span
                    aria-hidden="true"
                    className="shrink-0"
                    style={{
                      color: "var(--sc-sun)",
                      fontSize: "0.7rem",
                      letterSpacing: "0.2em",
                      fontWeight: 500,
                      marginTop: 2,
                      width: 24,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{b[lang]}</span>
                </li>
              ))}
            </ul>
            <div className="mt-10">
              <Link
                href={ctaHref}
                className="inline-block no-underline transition-all"
                style={{
                  fontSize: "0.62rem",
                  letterSpacing: "0.3em",
                  textTransform: "uppercase",
                  background: "var(--sc-sun)",
                  color: "var(--sc-black)",
                  padding: "15px 32px",
                  fontWeight: 500,
                }}
              >
                {dict.prime.cta[lang]}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
