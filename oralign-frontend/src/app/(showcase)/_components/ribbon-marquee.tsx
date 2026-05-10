"use client";

import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";

export function RibbonMarquee() {
  const { lang } = useShowcaseLang();
  const items = dict.ribbon.items.map((i) => i[lang]);
  const doubled = [...items, ...items, ...items];
  return (
    <div
      data-section-tone="dark"
      className="bg-[var(--sc-black)] overflow-hidden border-y border-[#1e1e1e]"
      style={{ padding: "14px 0" }}
      aria-hidden="true"
    >
      <div className="sc-marquee-track">
        {doubled.map((it, i) => (
          <div
            key={`${it}-${i}`}
            className="flex items-center gap-3.5 whitespace-nowrap"
            style={{ fontSize: "0.55rem", letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(248,246,242,0.28)" }}
          >
            <span className="w-1 h-1 rounded-full bg-[var(--sc-sun)]" />
            {it}
          </div>
        ))}
      </div>
    </div>
  );
}
