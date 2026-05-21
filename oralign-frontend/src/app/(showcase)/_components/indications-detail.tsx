"use client";

import Image from "next/image";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { featuredCases } from "../_lib/case-gallery";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

export function IndicationsDetail() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="indications"
      data-section-tone="dark"
      aria-labelledby="indications-h2"
      className="bg-[var(--sc-black)] text-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="max-w-3xl mx-auto text-center">
            <SectionHeading eyebrow={dict.indicationsDetail.eyebrow[lang]} tone="dark" align="center" id="indications-h2">
              {dict.indicationsDetail.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.indicationsDetail.h2Em[lang]}</em>
            </SectionHeading>
            <p
              className="mt-6 mx-auto"
              style={{ fontSize: "0.92rem", lineHeight: 1.85, color: "var(--sc-text-mid-on-dark)", maxWidth: 560 }}
            >
              {dict.indicationsDetail.intro[lang]}
            </p>
          </div>
        </Reveal>

        <Reveal delay>
          {/*
            Switched the layout from `flex flex-wrap` over a grey `<ul>`
            background (which painted 1px separators through `gap-px` and
            left the unfilled cells of the last row as visible dark grey
            slabs) to a proper CSS grid. Empty trailing cells are now
            truly empty — no background shows because the `<ul>` itself
            no longer has one. Cards also bleed edge-to-edge by removing
            the `p-2` padding on the image and switching to `object-cover`,
            which is what the user asked for: every image fills its
            frame at identical dimensions.
          */}
          <ul className="mx-auto mt-12 grid max-w-[1200px] list-none grid-cols-1 gap-5 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
            {featuredCases.map((item, i) => (
              <li
                key={item.id}
                className="group relative overflow-hidden rounded-lg bg-[#111] ring-1 ring-white/5 transition-colors hover:ring-white/10"
              >
                {/* Image frame — fixed aspect ratio so every card is
                    exactly the same height regardless of source-image
                    dimensions. `object-cover` fills the frame instead of
                    leaving white padding around portrait shots. */}
                <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
                  <Image
                    src={item.before}
                    alt={`${item.title[lang]} — ${item.concern[lang]}`}
                    fill
                    sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div style={{ padding: "22px 24px 24px" }}>
                  <span
                    className="block"
                    style={{
                      fontSize: "0.5rem",
                      letterSpacing: "0.4em",
                      textTransform: "uppercase",
                      color: "var(--sc-sun)",
                      marginBottom: 8,
                      fontWeight: 500,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")} ·{" "}
                    {lang === "fr" ? "Indication" : lang === "en" ? "Indication" : "استطباب"}
                  </span>
                  <h3
                    className="sc-serif"
                    style={{ fontSize: "1.15rem", fontWeight: 400, color: "var(--sc-white)", marginBottom: 8 }}
                  >
                    {item.shortTitle[lang]}
                  </h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--sc-text-mid-on-dark)", lineHeight: 1.65 }}>
                    {item.concern[lang]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay>
          <p
            className="mt-14 mx-auto text-center"
            style={{
              fontSize: "0.78rem",
              color: "var(--sc-sun)",
              maxWidth: 720,
              lineHeight: 1.75,
              fontWeight: 400,
              letterSpacing: "0.02em",
            }}
          >
            {dict.indicationsDetail.disclaimer[lang]}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
