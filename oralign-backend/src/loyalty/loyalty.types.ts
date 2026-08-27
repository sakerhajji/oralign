/**
 * Calendar-quarter arithmetic for the loyalty program. UTC on purpose:
 * quarter boundaries must be identical wherever the server runs, and
 * every timestamp the program reads (Quotation.doctorApprovedAt) is
 * stored in UTC.
 */

export interface QuarterRef {
  year: number;
  /** 1..4 */
  quarter: number;
}

export interface QuarterPeriod extends QuarterRef {
  /** Inclusive start (00:00:00.000 UTC of the first day). */
  start: Date;
  /** Exclusive end (00:00:00.000 UTC of the first day of the next quarter). */
  end: Date;
}

export function quarterOf(date: Date): QuarterRef {
  return {
    year: date.getUTCFullYear(),
    quarter: Math.floor(date.getUTCMonth() / 3) + 1,
  };
}

export function previousQuarter(ref: QuarterRef): QuarterRef {
  return ref.quarter === 1
    ? { year: ref.year - 1, quarter: 4 }
    : { year: ref.year, quarter: ref.quarter - 1 };
}

export function nextQuarter(ref: QuarterRef): QuarterRef {
  return ref.quarter === 4
    ? { year: ref.year + 1, quarter: 1 }
    : { year: ref.year, quarter: ref.quarter + 1 };
}

export function quarterPeriod(ref: QuarterRef): QuarterPeriod {
  const startMonth = (ref.quarter - 1) * 3;
  const start = new Date(Date.UTC(ref.year, startMonth, 1));
  const next = nextQuarter(ref);
  const end = new Date(Date.UTC(next.year, (next.quarter - 1) * 3, 1));
  return { ...ref, start, end };
}

/** "2026-T3" — stable label used by the API and the UI. */
export function quarterLabel(ref: QuarterRef): string {
  return `${ref.year}-T${ref.quarter}`;
}
