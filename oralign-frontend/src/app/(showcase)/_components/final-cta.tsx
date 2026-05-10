"use client";

import Link from "next/link";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";

export function FinalCta() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="cta"
      data-section-tone="light"
      aria-labelledby="cta-h2"
      className="relative bg-[var(--sc-white)] text-center overflow-hidden"
      style={{ padding: "120px 24px" }}
    >
      <div
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,200,66,0.12) 0%, transparent 70%)",
        }}
      />
      <Reveal>
        <h2
          id="cta-h2"
          className="sc-serif mx-auto relative z-[1]"
          style={{ fontSize: "clamp(2rem, 4vw, 4.2rem)", fontWeight: 300, lineHeight: 1.1, maxWidth: 980 }}
        >
          {dict.finalCta.h2Part1[lang]}{" "}
          <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.finalCta.h2Em[lang]}</em>
        </h2>
        <p className="mx-auto relative z-[1] mt-6" style={{ fontSize: "0.95rem", color: "var(--sc-text-mid)", lineHeight: 1.8, maxWidth: 520 }}>
          {dict.finalCta.sub[lang]}
        </p>
        <div className="mt-10 relative z-[1] flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="mailto:contact@oralign.example"
            className="no-underline inline-block transition-all"
            style={{
              fontSize: "0.64rem",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              background: "var(--sc-black)",
              color: "var(--sc-white)",
              padding: "16px 44px",
              fontWeight: 400,
            }}
          >
            {dict.finalCta.primary[lang]}
          </Link>
          <Link
            href="/login"
            className="no-underline inline-block transition-colors"
            style={{
              fontSize: "0.64rem",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "var(--sc-text-mid)",
              padding: "15px 34px",
              border: "1px solid rgba(10,10,10,0.2)",
            }}
          >
            {dict.finalCta.secondary[lang]}
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
