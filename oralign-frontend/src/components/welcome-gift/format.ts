import { formatPrice } from '@/lib/utils/currency';
import type { WelcomeGiftStatus } from '@/lib/api/welcome-gift.service';

/**
 * Gift amounts read better without empty millimes: "300 TND" instead of
 * "300,000 TND", while a real fraction keeps the 3 TND digits
 * ("12,500 TND"). The currency always comes from the record or the
 * billing settings — never invented here.
 */
export function formatGiftAmount(amount: number, currency: string): string {
  return formatPrice(amount, currency, {
    fractionDigits: Number.isInteger(amount) ? 0 : 3,
  });
}

/** The waived lines a gift surface lists (CBCT line only when > 0). */
export interface WelcomeGiftLines {
  treatmentFee: number;
  cbctFee: number;
  currency: string;
}

/**
 * Preview of what the gift will waive on a draft, from the live status.
 * The treatment fee always; the CBCT supplement only when the case
 * requests CBCT — the draft's own snapshot wins (that is the amount the
 * backend waives), else the live supplement when it is offered.
 */
export function giftLinesFromStatus(
  status: WelcomeGiftStatus,
  draft: { cbctRequested: boolean; cbctFeeAmount?: number | null },
): WelcomeGiftLines {
  const snapshot = Number(draft.cbctFeeAmount ?? 0);
  const cbctFee = !draft.cbctRequested
    ? 0
    : snapshot > 0
      ? snapshot
      : status.cbctOffered
        ? status.cbctFee
        : 0;
  return {
    treatmentFee: status.treatmentFee,
    cbctFee,
    currency: status.currency,
  };
}

/**
 * Split a translated sentence around one interpolated value so the value
 * can be rendered as its own element (the dictionary holds no markup).
 */
const SLOT = '\u0000';
export function splitAroundSlot(
  translate: (vars: Record<string, string>) => string,
  name: string,
): [string, string] {
  const [before = '', after = ''] = translate({ [name]: SLOT }).split(SLOT);
  return [before, after];
}
