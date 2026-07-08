"use client";

import Link from "next/link";
import {
  buildLegalDoc,
  type LegalCompany,
  type LegalDocKey,
  type LegalRow,
} from "@/lib/legal/legal-content";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { dict } from "../../_lib/i18n/dict";
import { Reveal } from "../shared/reveal";

/**
 * Renders one legal / compliance document (about, refunds, legal, terms)
 * in the showcase design system. Company data arrives from the server
 * (RSC fetch of `/company-billing-settings/legal-info`) so the merchant's
 * real legal identity is server-rendered; the prose re-localizes live via
 * `useShowcaseLang()` when the visitor flips FR / EN / AR.
 */
export function LegalDocView({
  docKey,
  company,
}: {
  docKey: LegalDocKey;
  company: LegalCompany;
}) {
  const { lang } = useShowcaseLang();
  const doc = buildLegalDoc(docKey, lang, company);

  return (
    <section className="bg-[var(--sc-white)] px-5 py-20 text-[var(--sc-black)] sm:px-8 sm:py-24 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-[860px]">
        <Reveal>
          {/* Eyebrow */}
          <div className="mb-6 flex items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[var(--sc-sun-deep)]">
            <span className="h-px w-8 bg-[var(--sc-sun-deep)]" aria-hidden="true" />
            <span>{doc.eyebrow}</span>
          </div>

          <h1 className="sc-serif text-[clamp(2.1rem,4.6vw,3.5rem)] font-normal leading-[1.05] tracking-[-0.02em]">
            {doc.title}
          </h1>

          <p className="mt-5 max-w-[640px] text-[0.98rem] leading-8 text-[var(--sc-text-mid)]">
            {doc.description}
          </p>
        </Reveal>

        <div className="mt-12 space-y-10">
          {doc.sections.map((section, i) => (
            <Reveal key={i} delay={i > 0}>
              <div>
                {section.heading && (
                  <h2 className="sc-serif mb-4 text-[1.35rem] font-medium leading-snug tracking-[-0.01em] text-[var(--sc-black)]">
                    {section.heading}
                  </h2>
                )}

                {section.paragraphs?.map((p, j) => (
                  <p
                    key={j}
                    className="mb-4 text-[0.97rem] leading-8 text-[var(--sc-text-mid)] last:mb-0"
                  >
                    {p}
                  </p>
                ))}

                {section.rows && section.rows.length > 0 && (
                  <dl className="mt-4 divide-y divide-[rgba(25,25,25,0.08)] overflow-hidden rounded-xl border border-[rgba(25,25,25,0.1)] bg-[rgba(25,25,25,0.015)]">
                    {section.rows.map((r, k) => (
                      <LegalRowLine key={k} row={r} />
                    ))}
                  </dl>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        {/* Back-home CTA — matches the scaffold pages' affordance. */}
        <Reveal delay>
          <div className="mt-14 border-t border-[rgba(25,25,25,0.1)] pt-8">
            <Link
              href="/"
              className="sc-serif inline-flex min-h-11 items-center justify-center gap-2 bg-[var(--sc-black)] px-6 py-3 text-[0.64rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-white)] no-underline transition-colors hover:bg-[rgba(25,25,25,0.85)]"
            >
              {dict.pages.backHome[lang]}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** One label/value line of a legal data table. */
function LegalRowLine({ row }: { row: LegalRow }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-4 py-3.5 sm:grid-cols-[minmax(160px,0.4fr)_1fr] sm:gap-4 sm:px-5">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--sc-text-mid)]">
        {row.label}
      </dt>
      <dd
        className={
          row.missing
            ? "text-[0.92rem] italic text-[rgba(25,25,25,0.4)]"
            : "text-[0.95rem] font-medium text-[var(--sc-black)]"
        }
      >
        {row.href && !row.missing ? (
          <a
            href={row.href}
            className="text-[var(--sc-sun-deep)] underline decoration-[var(--sc-sun)] underline-offset-2 hover:text-[var(--sc-black)]"
            {...(row.href.startsWith("http")
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {row.value}
          </a>
        ) : (
          row.value
        )}
      </dd>
    </div>
  );
}
