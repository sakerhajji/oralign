"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { dict } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import { mediaUrl, type PublicPractitioner } from "../../_lib/finder";
import { practitionerPath } from "../../_lib/practitioner-url";
import { formatDistanceLabel } from "./distance";

interface ListProps {
  practitioners: PublicPractitioner[];
  loading: boolean;
  error: boolean;
  selectedId: string | null;
  onSelect: (p: PublicPractitioner) => void;
  onRetry: () => void;
}

export function PractitionerList({
  practitioners,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
}: ListProps) {
  const { lang } = useShowcaseLang();
  const f = dict.finder;

  if (loading) {
    return (
      <div className="divide-y divide-[rgba(25,25,25,0.08)] border-y border-[rgba(25,25,25,0.08)]" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3.5 py-3.5">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[rgba(25,25,25,0.06)]" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/2 animate-pulse bg-[rgba(25,25,25,0.06)]" />
              <div className="h-3 w-2/3 animate-pulse bg-[rgba(25,25,25,0.05)]" />
            </div>
          </div>
        ))}
        <p className="sr-only">{f.loading[lang]}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-[rgba(25,25,25,0.12)] bg-[rgba(25,25,25,0.02)] p-6 text-center">
        <p className="text-[0.92rem] text-[var(--sc-text-mid)]">{f.loadError[lang]}</p>
        <button
          type="button"
          onClick={onRetry}
          className="sc-serif mt-4 inline-flex min-h-11 items-center justify-center border border-[var(--sc-black)] px-5 py-2 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-black)] transition-colors hover:bg-[var(--sc-black)] hover:text-[var(--sc-white)]"
        >
          {f.retry[lang]}
        </button>
      </div>
    );
  }

  if (practitioners.length === 0) {
    return (
      <div className="border border-dashed border-[rgba(25,25,25,0.2)] bg-[rgba(25,25,25,0.015)] p-8 text-center">
        <p className="text-[0.95rem] text-[var(--sc-text-mid)]">{f.empty[lang]}</p>
      </div>
    );
  }

  return (
    // Divided rows, not boxed cards: on a phone they read as one list to
    // scan, and the current one shows as a filled row with an amber edge.
    <ul className="divide-y divide-[rgba(25,25,25,0.08)] border-y border-[rgba(25,25,25,0.08)]">
      {practitioners.map((p) => (
        <li key={p.id}>
          <PractitionerRow
            practitioner={p}
            active={p.id === selectedId}
            onSelect={() => onSelect(p)}
          />
        </li>
      ))}
    </ul>
  );
}

/** Round avatar, or the practitioner's initials on amber when there is none. */
export function Avatar({
  practitioner: p,
  className,
}: {
  practitioner: PublicPractitioner;
  className: string;
}) {
  const [imgOk, setImgOk] = useState(true);
  const avatar = mediaUrl(p.avatarUrl);
  const initials = p.practitionerName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--sc-sun)] font-bold text-[var(--sc-black)] ${className}`}
    >
      {avatar && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImgOk(false)}
        />
      ) : (
        initials || "•"
      )}
    </span>
  );
}

function PractitionerRow({
  practitioner: p,
  active,
  onSelect,
}: {
  practitioner: PublicPractitioner;
  active: boolean;
  onSelect: () => void;
}) {
  const { lang } = useShowcaseLang();
  const distance = formatDistanceLabel(p.distanceKm, lang);
  const place = [p.clinicName, p.city].filter(Boolean).join(" · ");

  return (
    // A real link to the practice's own page: crawlers follow it and a
    // ctrl/middle click opens it in a tab, while a plain click keeps the
    // in-place sheet the finder has always had.
    <Link
      href={practitionerPath(p, lang)}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onSelect();
      }}
      aria-current={active ? "true" : undefined}
      className={[
        "group relative -mx-5 flex items-center gap-3.5 px-5 py-3.5 no-underline transition-colors sm:mx-0 sm:px-3",
        active ? "bg-[var(--sc-sun-3)]" : "hover:bg-[rgba(25,25,25,0.025)]",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sc-sun)]",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-2 start-0 w-0.5 ${active ? "bg-[var(--sc-sun)]" : "bg-transparent"}`}
      />
      <Avatar practitioner={p} className="h-11 w-11 text-[0.8rem]" />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="sc-serif truncate text-[1.02rem] font-medium text-[var(--sc-black)]">
            {p.practitionerName}
          </span>
          {distance && (
            <span className="shrink-0 whitespace-nowrap text-[0.78rem] font-medium tabular-nums text-[var(--sc-sun-deep)]">
              {distance}
            </span>
          )}
        </span>
        {place && (
          <span className="mt-0.5 block truncate text-[0.86rem] text-[var(--sc-text-mid)]">{place}</span>
        )}
      </span>

      <ChevronRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-[rgba(25,25,25,0.35)] transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
      />
    </Link>
  );
}
