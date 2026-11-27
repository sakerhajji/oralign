import { BatchStatus, BatchUnlockSource } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  PLANNED_TOTALS_ORDER_SELECT,
  plannedTotalsInputOf,
  resolvePlannedTotals,
  treatedArches,
} from '../../production/kernel';
import { trimmedBatchSpan } from '../../production/production-state';
import { treatmentFeeSubjectKey } from '../notification-subject';

/**
 * The copy and the small reads behind the bank-transfer notifications
 * (spec §2): kept out of the listener so each rule is unit-tested on its
 * own. In-app only (DECISIONS §2: no new payment e-mails); technicians are
 * never notified.
 */

export interface StepRange {
  fromStep: number;
  toStep: number;
  /** A treated arch has no approved total yet: the range is not final. */
  provisional?: boolean;
}

/**
 * « Motif : <reason> » appended to a refusal (FR / EN); empty when there
 * is no reason. The reason is the admin's words, trimmed, 3-500 chars.
 */
export function motifSuffix(reason: string | null | undefined): {
  en: string;
  fr: string;
} {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text) return { en: '', fr: '' };
  return { en: ` Reason: ${text}`, fr: ` Motif : ${text}` };
}

/**
 * " Steps 5–7 unlocked." / " Étapes 5–7 débloquées." (one step: "Step 5"),
 * marked « (provisoire) » / "(provisional)" when the range is not final.
 */
export function releasedStepsSentence(range: StepRange | null): {
  en: string;
  fr: string;
} {
  if (!range) return { en: '', fr: '' };
  const en = range.provisional ? ' (provisional)' : '';
  const fr = range.provisional ? ' (provisoire)' : '';
  if (range.fromStep === range.toStep) {
    return {
      en: ` Step ${range.fromStep} unlocked${en}.`,
      fr: ` Étape ${range.fromStep} débloquée${fr}.`,
    };
  }
  return {
    en: ` Steps ${range.fromStep}–${range.toStep} unlocked${en}.`,
    fr: ` Étapes ${range.fromStep}–${range.toStep} débloquées${fr}.`,
  };
}

/**
 * The step range a confirmed installment transfer released, read after the
 * settlement committed: the installment's batch, when THIS settlement
 * unlocked it (unlockSource payment), trimmed to the approved plan exactly
 * as the technician's card shows it (trimmedBatchSpan, DECISIONS §3: a
 * batch is cut from the pack's maximum, the plan usually stops below it).
 * `provisional` when a treated arch has no approved total yet (the range
 * is then not trimmed). Null when the installment has no batch, when an
 * admin had already released it by hand, when the batch lies wholly
 * beyond the approved plan (no aligner of it exists), and on an
 * unlimited-step pack, whose batches are payment placeholders and not
 * aligner ranges.
 */
export async function stepsReleasedByPayment(
  db: Pick<PrismaService, 'payment'>,
  paymentId: string,
): Promise<StepRange | null> {
  const row = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      quotation: { select: { isUnlimitedSteps: true } },
      order: { select: PLANNED_TOTALS_ORDER_SELECT },
      installment: {
        select: {
          stepBatch: {
            select: {
              fromStep: true,
              toStep: true,
              status: true,
              unlockSource: true,
            },
          },
        },
      },
    },
  });
  const batch = row?.installment?.stepBatch;
  if (!row || !batch || row.quotation?.isUnlimitedSteps) return null;
  if (
    batch.status === BatchStatus.locked ||
    batch.unlockSource !== BatchUnlockSource.payment
  ) {
    return null;
  }
  const input = plannedTotalsInputOf(row.order);
  const planned = resolvePlannedTotals(input);
  const treated = treatedArches(input);
  const span = trimmedBatchSpan(batch, treated, planned);
  if (!span) return null;
  const provisional = treated.some((arch) => planned[arch]?.provisional);
  return {
    fromStep: span.from,
    toStep: span.to,
    ...(provisional ? { provisional: true } : {}),
  };
}

/** The admin pending desk (frontend app/dashboard/payments/pending). */
export const PENDING_DESK_PATH = '/dashboard/payments/pending';

/**
 * Where an admin's transfer notification leads: the pending desk, opening
 * that transfer's review (?review=<subjectKey>, URL-encoded: the key holds
 * ':'). Without a subject (legacy emitter), the desk itself.
 */
export function pendingDeskLink(subjectKey: string | null): string {
  return subjectKey
    ? `${PENDING_DESK_PATH}?review=${encodeURIComponent(subjectKey)}`
    : PENDING_DESK_PATH;
}

/**
 * The subject of a treatment-fee event, or null when the emitter sent no
 * declaration instant (a legacy emitter; the caller then falls back to
 * every open fee subject of the order).
 */
export function treatmentFeeEventSubject(payload: {
  orderId: string;
  declaredAt?: string | null;
}): string | null {
  if (!payload.declaredAt) return null;
  try {
    return treatmentFeeSubjectKey(payload.orderId, payload.declaredAt);
  } catch {
    return null;
  }
}
