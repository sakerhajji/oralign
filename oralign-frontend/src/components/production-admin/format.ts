import type { Lang } from '@/lib/i18n/dict';
import {
  PRODUCTION_EVENT_TYPES,
  type ActTotals,
  type ProductionArch,
  type ProductionEventType,
  type ProductionEventWithOrder,
  type ProductionSummary,
} from '@/lib/types/production';
import { businessDayOf } from '@/lib/utils/business-day';
import { daysBetween } from './pilotage-state';

/**
 * Pure helpers of the production desk: numbers, days in words, steps, and
 * the shapes the views draw from the API rows (declarations grouped, the
 * recap's day-by-day rows with the empty days filled in).
 */

type Translate = (path: string, vars?: Record<string, string | number>) => string;

const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB' };

const numberFormats = new Map<Lang, Intl.NumberFormat>();

/** A count with the language's separators ("1 234"). */
export function formatCount(value: number, lang: Lang): string {
  let format = numberFormats.get(lang);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 0 });
    numberFormats.set(lang, format);
  }
  return format.format(value);
}

/**
 * Which form of a `<key>One` / `<key>Other` pair a count takes: French
 * keeps the singular for 0 and 1 (« 0 saisie »), English for 1 only.
 */
export function pluralSuffix(count: number, lang: Lang): 'One' | 'Other' {
  const one = lang === 'fr' ? count <= 1 : count === 1;
  return one ? 'One' : 'Other';
}

/** 'YYYY-MM-DD' → "Mercredi 25 novembre 2026" / "Wednesday 25 November 2026". */
export function longDay(day: string, lang: Lang): string {
  const text = new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 'YYYY-MM' → "Septembre 2026" / "September 2026". */
export function monthLabel(month: string, lang: Lang): string {
  const text = new Intl.DateTimeFormat(LOCALE[lang], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Étape 4" / "Étapes 3 à 5". */
export function stepsText(from: number, to: number, t: Translate): string {
  return from === to
    ? t('productionAdmin.steps.one', { n: from })
    : t('productionAdmin.steps.range', { from, to });
}

/** Merged ranges of an anomaly: "Étapes 3–5, 8". */
export function stepListText(steps: { from: number; to: number }[], t: Translate): string {
  if (steps.length === 1) return stepsText(steps[0].from, steps[0].to, t);
  const list = steps
    .map((range) => (range.from === range.to ? `${range.from}` : `${range.from}–${range.to}`))
    .join(', ');
  return t('productionAdmin.steps.many', { list });
}

/**
 * The last page to go back to when the page on screen is past the end of
 * the list (rows gone since, a page number from an old link), else null.
 * Only the server's answer for this very page counts, not the previous
 * page kept on screen while it loads.
 */
export function pastEndPage(
  page: { data: readonly unknown[]; total: number; totalPages: number } | undefined,
  placeholder: boolean,
  requested: number,
): number | null {
  if (!page || placeholder) return null;
  const pastEnd = page.data.length === 0 && page.total > 0 && requested > page.totalPages;
  return pastEnd ? page.totalPages : null;
}

export function emptyActTotals(): ActTotals {
  return {
    model_printed: { entries: 0, quantity: 0 },
    aligner_thermoformed: { entries: 0, quantity: 0 },
    aligner_cut: { entries: 0, quantity: 0 },
    aligner_delivered: { entries: 0, quantity: 0 },
  };
}

export const ACTS: readonly ProductionEventType[] = PRODUCTION_EVENT_TYPES;

// ─── Declarations ───────────────────────────────────────────────────

/** One declaration as shown: its rows (one per arch) side by side. */
export interface DeclarationGroup {
  key: string;
  /** The first row (upper first): the shared fields. */
  head: ProductionEventWithOrder;
  rows: ProductionEventWithOrder[];
  arches: ProductionArch[];
  /** Σ quantity of the rows (what the totals count). */
  quantity: number;
}

/**
 * Rows of one declaration share `declarationId` and sit next to each
 * other in every list the API sorts (performedAt, createdAt, arch, id):
 * a both-arch entry reads once. Rows cancelled apart (another moment, its
 * own reason) stay apart.
 */
export function groupDeclarations(rows: ProductionEventWithOrder[]): DeclarationGroup[] {
  const groups: DeclarationGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.head.declarationId === row.declarationId &&
      last.head.cancelledAt === row.cancelledAt &&
      last.head.stepFrom === row.stepFrom &&
      last.head.stepTo === row.stepTo
    ) {
      last.rows.push(row);
      last.arches.push(row.arch);
      last.quantity += row.quantity;
      continue;
    }
    groups.push({
      key: row.id,
      head: row,
      rows: [row],
      arches: [row.arch],
      quantity: row.quantity,
    });
  }
  return groups;
}

// ─── Recap, day by day ──────────────────────────────────────────────

export interface RecapDay {
  day: string;
  acts: ActTotals;
  /** Rows of that day (by performedAt) cancelled since. */
  cancelled: number;
}

/**
 * Every day of the period up to today, the days without entries
 * included at 0 (a gap is information: nobody worked, or nobody entered).
 * Days after today are left out: they cannot hold anything yet.
 */
export function recapDays(summary: ProductionSummary, today: string): RecapDay[] {
  const last = summary.to < today ? summary.to : today;
  if (summary.from > last) return [];
  const counted = new Map(summary.byDay.map((entry) => [entry.day, entry.acts]));
  const cancelled = new Map<string, number>();
  for (const row of summary.cancelled) {
    const day = businessDayOf(new Date(row.performedAt));
    cancelled.set(day, (cancelled.get(day) ?? 0) + 1);
  }
  return daysBetween(summary.from, last).map((day) => ({
    day,
    acts: counted.get(day) ?? emptyActTotals(),
    cancelled: cancelled.get(day) ?? 0,
  }));
}

/** Σ quantity of all four acts (an empty day, an empty case). */
export function totalQuantity(acts: ActTotals): number {
  return ACTS.reduce((sum, act) => sum + acts[act].quantity, 0);
}
