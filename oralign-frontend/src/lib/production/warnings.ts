import { PRODUCTION_WARNINGS, type ProductionWarningCode } from '@/lib/types/production';

/**
 * The union of a declaration's rows' warnings, in the contract's order.
 * Each arch row carries its own (the server checks every arch apart), so a
 * screen that shows a declaration once must merge them: the technician
 * history and the admin journal read the same list from here.
 */
export function warningsOf(
  rows: readonly { warnings: readonly ProductionWarningCode[] }[],
): ProductionWarningCode[] {
  const seen = new Set(rows.flatMap((row) => row.warnings));
  return PRODUCTION_WARNINGS.filter((code) => seen.has(code));
}
