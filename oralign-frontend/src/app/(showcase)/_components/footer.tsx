"use client";

import Link from "next/link";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";

export function Footer() {
  const { lang } = useShowcaseLang();
  return (
    <footer
      id="footer"
      data-section-tone="dark"
      className="bg-[var(--sc-black)] text-[var(--sc-white)] border-t border-[#1a1a1a]"
      style={{ padding: "60px 24px 36px" }}
    >
      <div className="mx-auto max-w-[1400px] lg:px-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] mb-11">
          <div>
            <span className="sc-serif text-[1.6rem] font-medium tracking-[0.2em] text-[var(--sc-white)] leading-none">
              ORALIGN
            </span>
            <p className="mt-3.5 max-w-[240px]" style={{ fontSize: "0.76rem", lineHeight: 1.85, color: "rgba(248,246,242,0.4)" }}>
              {dict.footer.desc[lang]}
            </p>
          </div>
          <FCol title={dict.footer.product[lang]} items={dict.footer.productLinks.map((i) => i[lang])} />
          <FCol title={dict.footer.company[lang]} items={dict.footer.companyLinks.map((i) => i[lang])} />
          <FCol title={dict.footer.legal[lang]} items={dict.footer.legalLinks.map((i) => i[lang])} />
        </div>
        <div className="border-t border-[#1a1a1a] pt-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <p style={{ fontSize: "0.6rem", color: "rgba(248,246,242,0.22)" }}>{dict.footer.rights[lang]}</p>
          <p style={{ fontSize: "0.6rem", color: "var(--sc-sun)" }}>{dict.footer.sub[lang]}</p>
        </div>
        <div className="mt-6 flex items-center gap-6">
          <Link
            href="/practitioner/blog"
            className="text-[rgba(248,246,242,0.4)] hover:text-[var(--sc-sun)] no-underline"
            style={{ fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase" }}
          >
            {dict.nav.blogs[lang]} →
          </Link>
          <Link
            href="/login"
            className="text-[rgba(248,246,242,0.4)] hover:text-[var(--sc-sun)] no-underline"
            style={{ fontSize: "0.6rem", letterSpacing: "0.28em", textTransform: "uppercase" }}
          >
            {dict.nav.login[lang]} →
          </Link>
        </div>
      </div>
    </footer>
  );
}

function FCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-4" style={{ fontSize: "0.52rem", letterSpacing: "0.35em", textTransform: "uppercase", color: "rgba(248,246,242,0.3)" }}>
        {title}
      </h4>
      <ul className="list-none flex flex-col gap-2">
        {items.map((it) => (
          <li key={it}>
            <a
              href="#"
              className="no-underline text-[rgba(248,246,242,0.45)] hover:text-[var(--sc-sun)] transition-colors"
              style={{ fontSize: "0.76rem" }}
            >
              {it}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
