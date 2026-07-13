"use client";

import { dict } from "../../_lib/i18n/dict";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import type { PublicPractitioner } from "../../_lib/finder";
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
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[104px] animate-pulse border border-[rgba(25,25,25,0.08)] bg-[rgba(25,25,25,0.03)]"
          />
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
          className="sc-serif mt-4 inline-flex min-h-10 items-center justify-center border border-[var(--sc-black)] px-5 py-2 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--sc-black)] transition-colors hover:bg-[var(--sc-black)] hover:text-[var(--sc-white)]"
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
    <ul className="space-y-3">
      {practitioners.map((p) => (
        <li key={p.id}>
          <PractitionerCard
            practitioner={p}
            active={p.id === selectedId}
            onSelect={() => onSelect(p)}
          />
        </li>
      ))}
    </ul>
  );
}

function PractitionerCard({
  practitioner: p,
  active,
  onSelect,
}: {
  practitioner: PublicPractitioner;
  active: boolean;
  onSelect: () => void;
}) {
  const { lang } = useShowcaseLang();
  const f = dict.finder;
  const distance = formatDistanceLabel(p.distanceKm, lang);
  const initials = p.practitionerName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={[
        "group flex w-full items-start gap-4 border p-4 text-left transition-colors",
        active
          ? "border-[var(--sc-black)] bg-[var(--sc-sun-3)]"
          : "border-[rgba(25,25,25,0.1)] bg-[var(--sc-white)] hover:border-[var(--sc-black)] hover:bg-[rgba(25,25,25,0.02)]",
      ].join(" ")}
    >
      {/* Avatar / initials */}
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--sc-sun)] text-[0.85rem] font-bold text-[var(--sc-black)]">
        {p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials || "•"
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="sc-serif truncate text-[1.05rem] font-medium text-[var(--sc-black)]">
            {p.practitionerName}
          </span>
          {distance && (
            <span className="shrink-0 whitespace-nowrap text-[0.75rem] font-medium text-[var(--sc-sun-deep)]">
              {distance}
            </span>
          )}
        </span>

        <span className="mt-0.5 block truncate text-[0.88rem] text-[var(--sc-text-mid)]">
          {p.clinicName}
        </span>

        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] text-[var(--sc-text-mid)]">
          {p.specialty && (
            <span className="border border-[rgba(25,25,25,0.14)] px-2 py-0.5 text-[0.72rem] uppercase tracking-[0.08em] text-[var(--sc-black)]">
              {p.specialty}
            </span>
          )}
          {p.city && <span>{p.city}</span>}
        </span>

        <span className="mt-2 inline-block text-[0.72rem] font-bold uppercase tracking-[0.14em] text-[var(--sc-black)] underline decoration-[var(--sc-sun)] decoration-2 underline-offset-4 group-hover:decoration-[var(--sc-black)]">
          {f.viewDetails[lang]}
        </span>
      </span>
    </button>
  );
}
