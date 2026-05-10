"use client";

import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SunBurst } from "./shared/sun-burst";
import { Parallax } from "./shared/parallax";

export function Manifesto() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="manifesto"
      data-section-tone="light"
      aria-labelledby="manifesto-h2"
      className="relative text-center overflow-hidden"
      style={{ background: "var(--sc-sun)", color: "var(--sc-black)", padding: "100px 24px" }}
    >
      <Parallax distance={140} className="absolute inset-0 pointer-events-none opacity-[0.08]">
        <div aria-hidden="true" className="w-full h-full">
          <SunBurst variant="hero" className="w-full h-full" />
        </div>
      </Parallax>

      <Reveal>
        <p
          id="manifesto-h2"
          className="sc-serif mx-auto relative z-[1]"
          style={{
            fontSize: "clamp(1.7rem, 4vw, 3.6rem)",
            fontWeight: 300,
            lineHeight: 1.18,
            maxWidth: 900,
            color: "var(--sc-black)",
          }}
        >
          {dict.manifesto.quotePart1[lang]}{" "}
          <em style={{ fontStyle: "italic", fontWeight: 400 }}>{dict.manifesto.quoteEm[lang]}</em>
        </p>
        <p className="mt-7 relative z-[1]" style={{ fontSize: "0.65rem", letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(10,10,10,0.5)" }}>
          {dict.manifesto.sig[lang]}
        </p>
      </Reveal>
    </section>
  );
}
