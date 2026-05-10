"use client";

import { Shield } from "lucide-react";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";

export function SecuritySection() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="security"
      data-section-tone="dark"
      aria-labelledby="security-h2"
      className="bg-[var(--sc-black)] text-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <div className="max-w-2xl">
            <div className="flex items-center gap-3" style={{ fontSize: "0.55rem", letterSpacing: "0.42em", textTransform: "uppercase", color: "var(--sc-sun)" }}>
              <span className="sc-eyebrow-line w-[18px] h-px bg-[var(--sc-sun)]" aria-hidden="true" />
              <span>{dict.security.eyebrow[lang]}</span>
            </div>
            <h2 id="security-h2" className="sc-serif mt-3.5" style={{ fontSize: "clamp(2rem, 3.5vw, 3.6rem)", fontWeight: 300, lineHeight: 1.08, color: "var(--sc-white)" }}>
              {dict.security.h2Part1[lang]}{" "}
              <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.security.h2Em[lang]}</em>
            </h2>
          </div>
        </Reveal>
        <Reveal delay>
          <ul className="list-none mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#1e1e1e]">
            {dict.security.items.map((it, i) => (
              <li
                key={i}
                className="bg-[var(--sc-black)] flex items-start gap-3"
                style={{ padding: "26px 22px" }}
              >
                <Shield size={16} className="text-[var(--sc-sun)] flex-shrink-0 mt-1" />
                <span style={{ fontSize: "0.85rem", color: "rgba(248,246,242,0.7)", lineHeight: 1.6 }}>{it[lang]}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
