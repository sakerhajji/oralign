"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";

export function PricingSection() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="pricing"
      data-section-tone="dark"
      aria-labelledby="pricing-h2"
      className="bg-[var(--sc-black)] text-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto">
            <div className="flex items-center gap-3 justify-center" style={{ fontSize: "0.55rem", letterSpacing: "0.42em", textTransform: "uppercase", color: "var(--sc-sun)" }}>
              <span className="sc-eyebrow-line w-[18px] h-px bg-[var(--sc-sun)]" aria-hidden="true" />
              <span>{dict.pricing.eyebrow[lang]}</span>
              <span className="sc-eyebrow-line w-[18px] h-px bg-[var(--sc-sun)]" aria-hidden="true" />
            </div>
            <h2 id="pricing-h2" className="sc-serif mt-3.5" style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 300, lineHeight: 1.08, color: "var(--sc-white)" }}>
              {dict.pricing.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.pricing.h2Em[lang]}</em>
            </h2>
          </div>
        </Reveal>

        <Reveal delay>
          <ul className="list-none mt-14 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {dict.pricing.tiers.map((tier, i) => {
              const highlighted = "highlighted" in tier && tier.highlighted;
              return (
                <li
                  key={i}
                  className={`relative bg-[#0d0d0d] flex flex-col`}
                  style={{
                    padding: "36px 30px",
                    border: highlighted ? "1px solid var(--sc-sun)" : "1px solid #1e1e1e",
                    boxShadow: highlighted ? "0 0 50px rgba(245,200,66,0.15)" : "none",
                  }}
                >
                  <h3 className="sc-serif" style={{ fontSize: "1.6rem", fontWeight: 300, color: highlighted ? "var(--sc-sun)" : "var(--sc-white)" }}>
                    {tier.name[lang]}
                  </h3>
                  <p className="mt-3" style={{ fontSize: "0.85rem", color: "rgba(248,246,242,0.55)", lineHeight: 1.7 }}>
                    {tier.desc[lang]}
                  </p>
                  <ul className="list-none mt-6 flex flex-col gap-3 flex-1">
                    {tier.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-3" style={{ fontSize: "0.85rem", color: "rgba(248,246,242,0.75)" }}>
                        <Check size={14} className="mt-0.5 flex-shrink-0 text-[var(--sc-sun)]" />
                        <span>{f[lang]}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="#cta"
                    className="mt-8 no-underline inline-flex items-center justify-between transition-colors"
                    style={{
                      fontSize: "0.62rem",
                      letterSpacing: "0.3em",
                      textTransform: "uppercase",
                      background: highlighted ? "var(--sc-sun)" : "transparent",
                      color: highlighted ? "var(--sc-black)" : "var(--sc-white)",
                      border: highlighted ? "none" : "1px solid rgba(248,246,242,0.2)",
                      padding: "14px 22px",
                      fontWeight: 500,
                    }}
                  >
                    <span>{dict.pricing.requestPricing[lang]}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
