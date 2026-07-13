"use client";

import Link from "next/link";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import {
  companyFooterLinks,
  legalFooterLinks,
} from "@/lib/legal/legal-content";

type FooterLink = { label: string; href: string };

/**
 * Showcase footer. A brand block plus three navigation columns — Société,
 * Informations légales, Espace praticien. Labels + routes for the Société and
 * legal columns come from the shared legal-content helpers so they stay in
 * sync with the real pages; the Espace praticien column gathers the blog +
 * login entry points that previously floated loose beneath the columns.
 */
export function Footer() {
  const { lang } = useShowcaseLang();

  const companyLinks: FooterLink[] = companyFooterLinks(lang);
  const legalLinks: FooterLink[] = legalFooterLinks(lang);
  const accessLinks: FooterLink[] = [
    { label: dict.nav.blogs[lang], href: "/patient/blog" },
    { label: dict.footer.access[lang], href: "/login" },
  ];

  return (
    <footer
      id="footer"
      data-section-tone="dark"
      className="border-t border-[rgba(242,245,239,0.08)] bg-[var(--sc-black)] text-[var(--sc-white)]"
      style={{ padding: "76px 24px 40px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <div className="mb-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="max-w-[300px]">
            <Link
              href="/"
              className="sc-serif inline-block text-[1.7rem] font-medium leading-none tracking-[0.22em] text-[var(--sc-white)] no-underline"
            >
              ORALIGN
            </Link>
            <span
              className="mt-4 block h-px w-10 bg-[var(--sc-sun)]"
              aria-hidden="true"
            />
            <p
              className="mt-4"
              style={{
                fontSize: "0.78rem",
                lineHeight: 1.9,
                color: "rgba(242,245,239,0.5)",
              }}
            >
              {dict.footer.desc[lang]}
            </p>
          </div>

          <FCol title={dict.footer.company[lang]} items={companyLinks} />
          <FCol title={dict.footer.legalCol[lang]} items={legalLinks} />
          <FCol title={dict.footer.access[lang]} items={accessLinks} />
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col gap-4 border-t border-[rgba(242,245,239,0.08)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <p style={{ fontSize: "0.68rem", color: "rgba(242,245,239,0.4)" }}>
              {dict.footer.rights[lang]}
            </p>
            <span
              className="hidden text-[rgba(242,245,239,0.2)] sm:inline"
              aria-hidden="true"
            >
              ·
            </span>
            <p style={{ fontSize: "0.68rem", color: "var(--sc-sun)" }}>
              {dict.footer.sub[lang]}
            </p>
          </div>

          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="group inline-flex items-center gap-2 self-start text-[rgba(242,245,239,0.45)] transition-colors hover:text-[var(--sc-sun)]"
            style={{
              fontSize: "0.6rem",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
            }}
          >
            {dict.footer.backToTop[lang]}
            <span
              className="transition-transform group-hover:-translate-y-0.5"
              aria-hidden="true"
            >
              ↑
            </span>
          </button>
        </div>
      </div>
    </footer>
  );
}

function FCol({ title, items }: { title: string; items: FooterLink[] }) {
  return (
    <div>
      <h4
        className="mb-4"
        style={{
          fontSize: "0.62rem",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "rgba(242,245,239,0.4)",
        }}
      >
        {title}
      </h4>
      <ul className="flex list-none flex-col gap-2.5">
        {items.map((it) => (
          <li key={`${it.label}-${it.href}`}>
            <Link
              href={it.href}
              className="text-[rgba(242,245,239,0.55)] no-underline transition-colors hover:text-[var(--sc-white)]"
              style={{ fontSize: "0.82rem" }}
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
