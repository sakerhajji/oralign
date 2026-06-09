"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Check, Infinity as InfinityIcon, Wallet } from "lucide-react";
import { ArchType } from "@/lib/types";
import { usePublicPacks } from "@/lib/hooks";
import { useShowcaseLang } from "../../_lib/i18n/lang-context";
import type { Lang } from "../../_lib/i18n/dict";
import { practitionerCopy } from "./copy";
import { Reveal } from "../shared/reveal";
import { SectionIntro } from "./section-intro";

// Card-renderer view of a public pack: limits, refinements, per-arch prices
// and the featured flag. Normalised from the backend `Pack` row below.
interface PackOffering {
  name: string;
  tagline: { fr: string; en: string; ar: string };
  /** `null` ⇒ unlimited. */
  maxStepsPerArch: number | null;
  /** `null` ⇒ unlimited. */
  includedCorrections: number | null;
  /** `null` when the pack is two-arches-only (PRO / PRO+). */
  singleArchPrice: number | null;
  twoArchesPrice: number;
  currency: string;
  /** Visually accents this pack as the recommended choice. */
  featured?: boolean;
}

// Per-pack marketing taglines, keyed by the pack name returned by the public
// backend endpoint. When a pack name isn't in this map, the renderer falls
// back to the backend `description`.
const PACK_TAGLINES: Record<string, { fr: string; en: string; ar: string }> = {
  LITE: {
    fr: "Cas courts, retouches esthétiques.",
    en: "Short cases, aesthetic touch-ups.",
    ar: "حالات قصيرة ولمسات جمالية.",
  },
  ESSENTIAL: {
    fr: "Cas légers et corrections du quotidien.",
    en: "Light cases and everyday corrections.",
    ar: "حالات خفيفة وتصحيحات يومية.",
  },
  SMART: {
    fr: "Cas modérés, le choix le plus polyvalent.",
    en: "Moderate cases — the most versatile choice.",
    ar: "حالات متوسطة، الخيار الأكثر تنوّعًا.",
  },
  PRO: {
    fr: "Cas complexes — deux arcades en standard.",
    en: "Complex cases — two arches as standard.",
    ar: "حالات معقّدة — فكّان قياسي.",
  },
  "PRO+": {
    fr: "Sans limite — cas exceptionnels, refinements illimités.",
    en: "No limit — exceptional cases, unlimited refinements.",
    ar: "بلا حدود — حالات استثنائية وتعديلات غير محدودة.",
  },
};

// Featured pack — a marketing call, not a clinical one. Visually accents the
// matching card; harmless when the catalogue no longer carries this name.
const FEATURED_PACK_NAME = "SMART";

/** Public pack catalogue, pulled live from `usePublicPacks()`. */
export function PacksSection() {
  const { lang } = useShowcaseLang();
  const copy = practitionerCopy[lang].packs;
  // Live catalogue — pulled from the public `/api/packs/public`
  // endpoint via React-Query so an admin deactivating a pack on
  // `/dashboard/packs` removes it from the showcase on the next
  // poll (60 s staleTime + refetchOnWindowFocus). Falls back to a
  // skeleton on first paint, and renders nothing when the catalogue
  // is empty rather than showing an empty grid.
  const { data: packs, isLoading, isError } = usePublicPacks();

  // Normalise the backend row into the shape the card renderer
  // expects. The tagline lookup falls back to the per-row
  // `description` (admin-controlled in the DB) when the i18n map
  // doesn't carry an entry for that pack name.
  const offerings = useMemo<PackOffering[]>(() => {
    if (!packs) return [];
    return packs.map((p) => {
      const tagline = PACK_TAGLINES[p.name] ?? {
        fr: p.description ?? "",
        en: p.description ?? "",
        ar: p.description ?? "",
      };
      const activePrices = (p.prices ?? []).filter((pr) => pr.isActive);
      const single = activePrices.find((pr) => pr.archType === ArchType.ONE_ARCH);
      const two = activePrices.find((pr) => pr.archType === ArchType.TWO_ARCHES);
      return {
        name: p.name,
        tagline,
        maxStepsPerArch: p.isUnlimitedSteps ? null : p.maxStepsPerArch ?? null,
        includedCorrections: p.isUnlimitedCorrections
          ? null
          : p.includedCorrections ?? null,
        singleArchPrice: single ? Number(single.price) : null,
        twoArchesPrice: two ? Number(two.price) : 0,
        currency: two?.currency ?? single?.currency ?? "TND",
        featured: p.name === FEATURED_PACK_NAME,
      } satisfies PackOffering;
    });
  }, [packs]);

  return (
    <section
      id="packs"
      data-section-tone="light"
      aria-labelledby="packs-title"
      className="bg-[var(--sc-white)] px-4 py-20 text-[var(--sc-black)] sm:px-6 sm:py-24 lg:px-12"
    >
      <div className="mx-auto max-w-[1340px]">
        <Reveal>
          <SectionIntro
            eyebrow={copy.eyebrow}
            title={copy.title}
            subtitle={copy.subtitle}
            id="packs-title"
          />
        </Reveal>

        {isLoading ? (
          // Light skeleton — same flex shape as the resting state so
          // the page doesn't jump when the data arrives. Centered
          // because the resting grid is centered too.
          <div className="mt-12 flex flex-wrap items-stretch justify-center gap-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-[360px] w-full max-w-[280px] flex-1 basis-[240px] animate-pulse border border-[rgba(25,25,25,0.08)] bg-[rgba(25,25,25,0.03)] sm:max-w-[280px]"
              />
            ))}
          </div>
        ) : isError || offerings.length === 0 ? (
          // Soft empty state — keeps the section in flow without an
          // angry error toast. The footer banner below still nudges
          // toward the CTA, which is the desired conversion path.
          <p className="mt-12 text-center text-sm text-[var(--sc-text-mid)]">
            {copy.labels.footer}
          </p>
        ) : (
          // Flex + wrap + justify-center keeps the catalogue centered
          // no matter how many active packs the admin is publishing:
          //   • 5 packs → single row on xl, 3 + 2 centered below on md
          //   • 4 packs → centered row (no orphan card flush-left)
          //   • 1 pack  → single centered card, not a sad left-aligned
          //               tile in column 1 of an empty grid
          // The `basis-[240px]` floor + `max-w-[280px]` cap keeps every
          // card the same width regardless of position in the row.
          <div className="mt-12 flex flex-wrap items-stretch justify-center gap-5">
            {offerings.map((pack, index) => (
              <div
                key={pack.name}
                className="flex w-full max-w-[280px] flex-1 basis-[240px] sm:max-w-[280px]"
              >
                <PackCard
                  pack={pack}
                  copy={copy}
                  lang={lang}
                  index={index}
                />
              </div>
            ))}
          </div>
        )}

        {/* Footer banner — surfaces the installment-payment benefit at
            the section level so visitors don't miss it when scanning
            cards quickly. Mirrors the `final CTA` band on the patient
            page in tone but keeps the section light. */}
        <Reveal delay>
          <div className="mt-10 flex flex-col items-start gap-4 border border-[rgba(25,25,25,0.12)] bg-[var(--sc-sun-3)] p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-7">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center border border-[rgba(201,154,11,0.32)] bg-[var(--sc-sun)] text-[var(--sc-black)]">
              <Wallet aria-hidden="true" size={22} strokeWidth={1.6} />
            </span>
            <p className="text-[0.95rem] leading-7 text-[var(--sc-black)]">
              {copy.labels.footer}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PackCard({
  pack,
  copy,
  lang,
  index,
}: {
  pack: PackOffering;
  copy: (typeof practitionerCopy)[Lang]["packs"];
  lang: Lang;
  index: number;
}) {
  const featured = !!pack.featured;
  const twoArchesOnly = pack.singleArchPrice == null;

  return (
    <Reveal delay={index > 0}>
      <article
        className={[
          "relative flex h-full flex-col border p-6 transition sm:p-7",
          featured
            ? "border-[rgba(201,154,11,0.42)] bg-[var(--sc-sun-3)] shadow-[0_24px_70px_-50px_rgba(254,202,22,0.65)] hover:-translate-y-1 hover:shadow-[0_28px_84px_-46px_rgba(254,202,22,0.75)]"
            : "border-[rgba(25,25,25,0.12)] bg-white/55 hover:-translate-y-1 hover:bg-white hover:shadow-[0_20px_60px_-48px_rgba(25,25,25,0.65)]",
        ].join(" ")}
      >
        {/* Featured ribbon. */}
        {featured ? (
          <span
            className="absolute -top-3 inline-flex items-center bg-[var(--sc-black)] px-3 py-1 text-[0.6rem] font-bold uppercase tracking-[0.18em] text-[var(--sc-sun)]"
            style={{ left: "50%", transform: "translateX(-50%)" }}
          >
            {copy.labels.featured}
          </span>
        ) : null}

        {/* Header: pack name only. The audience-gate chip ("ortho-only")
            is gone — every pack ships to every practitioner now. */}
        <header className="flex items-start justify-between gap-3">
          <h3 className="sc-serif text-2xl tracking-tight sm:text-3xl">
            {pack.name}
          </h3>
        </header>

        <p className="mt-3 min-h-[3rem] text-[0.92rem] leading-6 text-[var(--sc-text-mid)]">
          {pack.tagline[lang]}
        </p>

        {/* Arch eligibility — replaces the price block. Surfaces the
            "single or two arches" / "two arches only" rule that used to
            live in the price column on the admin table, but without
            exposing the numbers. */}
        <p className="mt-1 text-[0.7rem] uppercase tracking-[0.18em] text-[var(--sc-text-mid)]">
          {twoArchesOnly
            ? copy.labels.twoArchesOnly
            : copy.labels.oneOrTwoArches}
        </p>

        {/* Inclusions — same data the admin packs table shows: limits +
            refinements + (new) installment-payment benefit. Three
            uniform check rows, no monetary numbers. */}
        <ul className="mt-5 grid gap-2 border-y border-[rgba(25,25,25,0.10)] py-5 text-[0.9rem] leading-6 text-[var(--sc-black)]">
          <li className="flex items-center gap-2">
            {pack.maxStepsPerArch == null ? (
              <InfinityIcon
                aria-hidden="true"
                size={15}
                strokeWidth={1.9}
                className="shrink-0 text-[var(--sc-sun-deep)]"
              />
            ) : (
              <Check
                aria-hidden="true"
                size={15}
                strokeWidth={2.2}
                className="shrink-0 text-[var(--sc-sun-deep)]"
              />
            )}
            <span>{copy.labels.stepsLine(pack.maxStepsPerArch)}</span>
          </li>
          <li className="flex items-center gap-2">
            {pack.includedCorrections == null ? (
              <InfinityIcon
                aria-hidden="true"
                size={15}
                strokeWidth={1.9}
                className="shrink-0 text-[var(--sc-sun-deep)]"
              />
            ) : (
              <Check
                aria-hidden="true"
                size={15}
                strokeWidth={2.2}
                className="shrink-0 text-[var(--sc-sun-deep)]"
              />
            )}
            <span>{copy.labels.correctionsLine(pack.includedCorrections)}</span>
          </li>
          {/* Installment-payment benefit on every pack. Reads as a
              standard inclusion so it doesn't look like an upsell. */}
          <li className="flex items-center gap-2">
            <Wallet
              aria-hidden="true"
              size={15}
              strokeWidth={1.9}
              className="shrink-0 text-[var(--sc-sun-deep)]"
            />
            <span>{copy.labels.installmentsLine}</span>
          </li>
        </ul>

        {/* CTA pushed to the bottom — `flex-1` spacer keeps every card
            the same height regardless of tagline length. */}
        <div className="mt-auto pt-6">
          <Link
            href={{ pathname: "/signup", query: { pack: pack.name } }}
            className={[
              "inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 py-3",
              "text-center text-[0.66rem] font-bold uppercase tracking-[0.16em] no-underline transition-all duration-300",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              "focus-visible:ring-offset-[var(--sc-white)]",
              featured
                ? "bg-[var(--sc-black)] text-[var(--sc-sun)] hover:bg-[rgba(25,25,25,0.86)] focus-visible:ring-[var(--sc-sun)]"
                : "border border-[rgba(25,25,25,0.20)] bg-transparent text-[var(--sc-black)] hover:border-[var(--sc-black)] hover:bg-[rgba(25,25,25,0.04)] focus-visible:ring-[var(--sc-sun)]",
            ].join(" ")}
          >
            <span>{copy.labels.cta}</span>
            <ArrowRight aria-hidden="true" size={13} strokeWidth={1.9} />
          </Link>
        </div>
      </article>
    </Reveal>
  );
}
