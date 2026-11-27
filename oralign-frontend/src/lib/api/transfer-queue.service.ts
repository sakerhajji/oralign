import apiClient from './client';
import { blobError } from './blob-download';
import type {
  TransferKind,
  TransferQueueFilter,
  TransferQueuePage,
} from '@/lib/types';

/**
 * The admin pending desk's API (CONTRACT.md §2.1-§2.4): the merged
 * transfer queue, and the review / confirm / refuse calls of either kind
 * (a pack installment is a Payment, a treatment fee lives on its order).
 * Every call is admin-only server-side.
 */

/** What names a transfer for the routes: its kind and its row ids. */
export interface TransferRef {
  kind: TransferKind;
  orderId: string;
  /** installment only. */
  paymentId: string | null;
}

export interface TransferQueueParams {
  filter: TransferQueueFilter;
  page: number;
  limit: number;
}

export interface ConfirmTransferBody {
  /** Installment only: the admin's internal note. */
  notes?: string;
  /** Required (3-500) when the transfer carries no receipt. */
  overrideNote?: string;
  /**
   * Treatment fee only: the declaration the admin reviewed
   * (treatmentFeeDeclaredAt). A receipt replaced since answers 409
   * TRANSFER_ALREADY_PROCESSED instead of being confirmed unseen.
   */
  declaredAt?: string | null;
}

/** What a refusal sends. */
export interface RejectTransferBody {
  /** The reason the doctor reads (3-500 characters). */
  rejectionReason: string;
  /** Treatment fee only: the declaration reviewed (see ConfirmTransferBody). */
  declaredAt?: string | null;
}

/** A failed receipt read: the HTTP status and errorCode survive the blob body. */
export type ProofLoadError = Error & { status?: number; errorCode?: string };

const enc = encodeURIComponent;

/**
 * The route base of a transfer. An installment without its payment id
 * cannot be addressed: a programming error, never a user one.
 */
function base(ref: TransferRef): { installment: string } | { fee: string } {
  if (ref.kind === 'installment') {
    if (!ref.paymentId) throw new Error('An installment transfer needs its payment id.');
    return { installment: ref.paymentId };
  }
  return { fee: ref.orderId };
}

/** The authenticated receipt stream (GET), for the blob fetch. */
export function transferProofPath(ref: TransferRef): string {
  const target = base(ref);
  return 'installment' in target
    ? `/payments/${enc(target.installment)}/proof`
    : `/orders/${enc(target.fee)}/treatment-fee/proof`;
}

/** Body fields left out when empty: the DTOs whitelist what they accept. */
function compact(body: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(body).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    ),
  );
}

export const transferQueueService = {
  /** One tab of the queue, with every tab's live count. */
  list: async (params: TransferQueueParams): Promise<TransferQueuePage> => {
    const res = await apiClient.get<TransferQueuePage>('/admin/payments/transfer-queue', {
      params,
    });
    return res.data;
  },

  /**
   * The admin opened the receipt: the first opening stamps the global
   * "À vérifier" (reviewOpenedAt); every opening marks the caller's own
   * notification rows read (server side, through the event).
   */
  openReview: async (ref: TransferRef): Promise<void> => {
    const target = base(ref);
    await apiClient.post(
      'installment' in target
        ? `/admin/payments/${enc(target.installment)}/review-opened`
        : `/orders/${enc(target.fee)}/treatment-fee/review-opened`,
      {},
    );
  },

  /** Confirm the money is on the statement. A repeat on a done row answers 200. */
  confirm: async (ref: TransferRef, body: ConfirmTransferBody = {}): Promise<void> => {
    const target = base(ref);
    if ('installment' in target) {
      await apiClient.post(
        `/admin/payments/${enc(target.installment)}/confirm`,
        compact({ notes: body.notes, overrideNote: body.overrideNote }),
      );
      return;
    }
    await apiClient.post(
      `/orders/${enc(target.fee)}/treatment-fee/confirm`,
      compact({ overrideNote: body.overrideNote, declaredAt: body.declaredAt }),
    );
  },

  /** Refuse with the reason the doctor will read (3-500 characters). */
  reject: async (ref: TransferRef, body: RejectTransferBody): Promise<void> => {
    const target = base(ref);
    if ('installment' in target) {
      await apiClient.post(`/admin/payments/${enc(target.installment)}/reject`, {
        rejectionReason: body.rejectionReason,
      });
      return;
    }
    await apiClient.post(
      `/orders/${enc(target.fee)}/treatment-fee/reject`,
      compact({ rejectionReason: body.rejectionReason, declaredAt: body.declaredAt }),
    );
  },

  /** The receipt bytes, behind the JWT (never a public URL). */
  proof: async (ref: TransferRef): Promise<Blob> => {
    try {
      const res = await apiClient.get<Blob>(transferProofPath(ref), {
        responseType: 'blob',
      });
      return res.data;
    } catch (error) {
      const unwrapped: ProofLoadError = await blobError(error, 'Could not load the receipt.');
      unwrapped.status = (error as { response?: { status?: number } })?.response?.status;
      throw unwrapped;
    }
  },
};
