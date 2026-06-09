"use client";

import { CheckCircle2, XCircle, type LucideIcon } from "lucide-react";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { practitionerCopy } from "./copy";
import { Reveal } from "../shared/reveal";
import { SectionIntro } from "./section-intro";

/** Before / after ORALIGN — two contrasting cards. */
export function ContrastSection() {
  const { lang } = useShowcaseLang();
  const copy = practitionerCopy[lang].contrast;
  return (
    <section
      id="contrast"
      data-section-tone="light"
      aria-labelledby="contrast-title"
      className="bg-[var(--sc-white)] px-4 py-20 text-[var(--sc-black)] sm:px-6 sm:py-24 lg:px-12"
    >
      <div className="mx-auto max-w-[1240px]">
        <Reveal>
          <SectionIntro
            eyebrow={copy.eyebrow}
            title={copy.title}
            id="contrast-title"
          />
        </Reveal>
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <ContrastCard
            icon={XCircle}
            title={copy.beforeTitle}
            items={copy.before}
            tone="negative"
          />
          <ContrastCard
            icon={CheckCircle2}
            title={copy.withTitle}
            items={copy.with}
            tone="positive"
          />
        </div>
      </div>
    </section>
  );
}

function ContrastCard({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  items: string[];
  tone: "negative" | "positive";
}) {
  const positive = tone === "positive";
  return (
    <Reveal delay={positive}>
      <article
        className={[
          "h-full border p-7 sm:p-9",
          positive
            ? "border-[rgba(201,154,11,0.32)] bg-[var(--sc-sun-3)]"
            : "border-[rgba(25,25,25,0.12)] bg-white/55",
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <span
            className={[
              "inline-flex h-12 w-12 items-center justify-center border",
              positive
                ? "bg-[var(--sc-sun)] text-[var(--sc-black)]"
                : "bg-[rgba(25,25,25,0.06)] text-[var(--sc-text-mid)]",
            ].join(" ")}
          >
            <Icon aria-hidden="true" size={21} strokeWidth={1.7} />
          </span>
          <h3 className="sc-serif text-2xl">{title}</h3>
        </div>
        <ul className="mt-7 grid gap-4">
          {items.map((item) => (
            <li
              key={item}
              className="flex gap-3 text-[0.96rem] leading-7 text-[var(--sc-text-mid)]"
            >
              <span
                aria-hidden="true"
                className={[
                  "mt-2 h-2 w-2 shrink-0",
                  positive ? "bg-[var(--sc-sun)]" : "bg-[var(--sc-mid-grey)]",
                ].join(" ")}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </article>
    </Reveal>
  );
}
