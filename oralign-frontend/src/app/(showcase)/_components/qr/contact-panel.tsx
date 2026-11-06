"use client";

import { ChevronRight, Mail, Phone, UserPlus, X } from "lucide-react";
import type { ReactNode } from "react";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { companyByline, dialablePhone, displayPhone } from "../../_lib/contact-card";
import { QR_COPY } from "./qr-copy";

/**
 * Small tracked capitals, the site's caption voice. Arabic letters join, so
 * an Arabic label is never letter-spaced (rtl: resets the tracking).
 */
const LABEL = "text-[0.64rem] uppercase tracking-[0.18em] rtl:tracking-normal";

/**
 * The official contact card, as a sheet over the QR welcome: a black card
 * like a printed one, the two ways to reach ORALIGN (a tap calls or
 * writes) and the contact file a phone saves (/qr/contact.vcf, built from
 * the same settings). Phone and e-mail are the company settings' — never
 * hardcoded; a row without a value is left out.
 */
export function ContactPanel({
  phone,
  email,
  company,
  titleId,
  onClose,
}: {
  /** Absent or null when the settings could not be read. */
  phone?: string | null;
  email?: string | null;
  /** The company behind the brand ("Aura Aligners"): it names the e-mail's domain. */
  company?: string | null;
  titleId: string;
  onClose: () => void;
}) {
  const { lang } = useShowcaseLang();
  const c = QR_COPY[lang].sheet;
  const phoneValue = phone?.trim() || null;
  const emailValue = email?.trim() || null;
  const byline = companyByline(company);

  return (
    <div className="bg-[var(--sc-black)] px-6 pt-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] text-[var(--sc-white)] sm:px-8 sm:pt-7 sm:pb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* The caption styles sit on an inner span: the site's h1-h3 rule
              (unlayered) resets the heading's letter-spacing and face. Set
              like the row labels below: DM Sans light, tracked. */}
          <h2 id={titleId} className="text-[var(--sc-text-mid-on-dark)]">
            <span className={`${LABEL} block font-[family-name:var(--font-sc-sans)] font-light`}>{c.title}</span>
          </h2>
          {/* The wordmark, spaced like the logo (inline: the site's .sc-serif
              rule resets letter-spacing over any utility), isolated left to
              right so the ® stays after the name in Arabic. */}
          <p className="sc-serif mt-3 text-[1.55rem] leading-none" style={{ letterSpacing: "0.14em" }}>
            <span dir="ltr">
              ORALIGN
              <span className="align-super text-[0.55em]" style={{ letterSpacing: 0 }}>
                ®
              </span>
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={c.close}
          className="-me-2 -mt-1 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--sc-text-mid-on-dark)] transition-colors hover:bg-[rgba(242,245,239,0.08)] hover:text-[var(--sc-white)]"
        >
          <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <span aria-hidden="true" className="mt-4 block h-px w-10 bg-[var(--sc-sun)]" />
      <p className="mt-4 text-[0.88rem] leading-[1.6] text-[var(--sc-text-mid-on-dark)]">
        {c.tagline}
        {byline && (
          <>
            <br />
            <span dir="ltr">{byline}</span>
          </>
        )}
      </p>

      {phoneValue || emailValue ? (
        <>
          <ul className="mt-6 divide-y divide-[rgba(242,245,239,0.12)] border-y border-[rgba(242,245,239,0.12)]">
            {phoneValue && (
              <li>
                <ContactRow
                  href={`tel:${dialablePhone(phoneValue)}`}
                  icon={<Phone className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />}
                  label={c.phone}
                  value={displayPhone(phoneValue)}
                  valueClassName="sc-serif text-[1.35rem] tabular-nums"
                />
              </li>
            )}
            {emailValue && (
              <li>
                <ContactRow
                  href={`mailto:${emailValue}`}
                  icon={<Mail className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />}
                  label={c.email}
                  value={emailValue}
                  // Smaller on the narrowest phones, so the address keeps
                  // to one line next to its icon and chevron.
                  valueClassName="text-[0.95rem] min-[370px]:text-[1.02rem] [overflow-wrap:anywhere]"
                />
              </li>
            )}
          </ul>
          {/* A plain link, not next/link: the route answers a file, which a
              phone opens in its contacts (iOS: straight into Contacts;
              Android: downloaded, then opened by Contacts). */}
          <a
            href="/qr/contact.vcf"
            className="mt-6 flex min-h-12 w-full items-center justify-center gap-2.5 bg-[var(--sc-sun)] px-6 text-center text-[0.68rem] font-semibold uppercase tracking-[0.15em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2)] rtl:tracking-normal"
          >
            <UserPlus className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {c.save}
          </a>
          <p className="mt-3 text-center text-[0.8rem] text-[var(--sc-text-mid-on-dark)]">{c.saveHint}</p>
        </>
      ) : (
        <p className="mt-6 text-[0.95rem] leading-[1.7] text-[var(--sc-text-mid-on-dark)]">{c.unavailable}</p>
      )}
    </div>
  );
}

/** One way to reach ORALIGN: the whole row is the link (a tap calls or writes). */
function ContactRow({
  href,
  icon,
  label,
  value,
  valueClassName,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: string;
  valueClassName: string;
}) {
  return (
    <a
      href={href}
      className="group flex min-h-[76px] items-center gap-4 py-4 text-[var(--sc-white)] no-underline"
    >
      <span className="shrink-0 text-[var(--sc-sun)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`${LABEL} block text-[var(--sc-text-mid-on-dark)]`}>{label}</span>
        {/* The line follows the page (right-aligned in Arabic); the number
            or address inside it reads left to right in every language. */}
        <span className={`mt-1.5 block ${valueClassName}`}>
          <span dir="ltr">{value}</span>
        </span>
      </span>
      <ChevronRight
        className="size-5 shrink-0 text-[rgba(242,245,239,0.4)] transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </a>
  );
}
