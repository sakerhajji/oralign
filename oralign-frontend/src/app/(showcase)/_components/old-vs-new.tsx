"use client";

import { Check, X } from "lucide-react";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { Reveal } from "./shared/reveal";
import { SectionHeading } from "./shared/section-heading";

export function OldVsNew() {
  const { lang } = useShowcaseLang();
  return (
    <section
      id="old-vs-new"
      data-section-tone="light"
      aria-labelledby="ovn-h2"
      className="bg-[var(--sc-white)]"
      style={{ padding: "120px 24px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <Reveal>
          <SectionHeading eyebrow={dict.oldVsNew.eyebrow[lang]} tone="light" id="ovn-h2">
            {dict.oldVsNew.h2Part1[lang]}{" "}
            <em style={{ fontStyle: "italic", color: "var(--sc-sun)" }}>{dict.oldVsNew.h2Em[lang]}</em>
          </SectionHeading>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--sc-grey)] mt-12">
          <Reveal delay>
            <div className="bg-[var(--sc-white)]" style={{ padding: "44px 32px" }}>
              <h3 style={{ fontSize: "0.65rem", letterSpacing: "0.4em", textTransform: "uppercase", color: "var(--sc-text-mid)", marginBottom: 22 }}>
                {dict.oldVsNew.oldTitle[lang]}
              </h3>
              <ul className="list-none flex flex-col gap-3">
                {dict.oldVsNew.oldItems.map((it, i) => (
                  <li key={i} className="flex items-start gap-3" style={{ fontSize: "0.85rem", color: "var(--sc-text-mid)", textDecoration: "line-through" }}>
                    <X size={14} className="mt-0.5 flex-shrink-0 text-[var(--sc-text-mid)]" />
                    <span>{it[lang]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay>
            <div className="bg-[var(--sc-white)]" style={{ padding: "44px 32px" }}>
              <h3 style={{ fontSize: "0.65rem", letterSpacing: "0.4em", textTransform: "uppercase", color: "var(--sc-sun)", marginBottom: 22 }}>
                {dict.oldVsNew.newTitle[lang]}
              </h3>
              <ul className="list-none flex flex-col gap-3">
                {dict.oldVsNew.newItems.map((it, i) => (
                  <li key={i} className="flex items-start gap-3" style={{ fontSize: "0.85rem", color: "var(--sc-black)" }}>
                    <Check size={16} className="mt-0.5 flex-shrink-0 text-[var(--sc-sun)]" />
                    <span>{it[lang]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
