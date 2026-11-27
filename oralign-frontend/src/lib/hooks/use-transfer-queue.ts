'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { inertBlob } from '@/lib/api/blob-download';
import { extractApiError } from '@/lib/api/error';
import { notificationsService } from '@/lib/api/notifications.service';
import {
  transferQueueService,
  type ConfirmTransferBody,
  type ProofLoadError,
  type RejectTransferBody,
  type TransferQueueParams,
  type TransferRef,
} from '@/lib/api/transfer-queue.service';
import { toast } from '@/lib/toast';
import { useT } from '@/lib/i18n/lang-context';
import type { TransferQueuePage } from '@/lib/types';
import { invalidatePaymentViews, transferQueueKeys } from './payment-keys';
import { orderKeys } from './use-orders';
import { quotationKeys } from './use-quotations';

/**
 * The admin pending desk's data: the merged transfer queue, the receipt
 * stream and the review / confirm / refuse writes of both kinds.
 *
 * Refresh policy (one for the whole desk): a 30 s poll and a refetch on
 * focus, plus the dashboard socket's invalidation (another admin acted)
 * and an invalidation after each of my own writes.
 */
const QUEUE_POLL_MS = 30_000;

export function useTransferQueue(
  params: TransferQueueParams,
  enabled = true,
): UseQueryResult<TransferQueuePage, Error> {
  return useQuery({
    queryKey: transferQueueKeys.list({ ...params }),
    queryFn: () => transferQueueService.list(params),
    enabled,
    staleTime: 10_000,
    refetchInterval: QUEUE_POLL_MS,
    refetchOnWindowFocus: true,
    // A tab or page change keeps the rows on screen (dimmed) until the
    // next set arrives, instead of flashing the skeleton.
    placeholderData: keepPreviousData,
  });
}

/** What a transfer write refreshes: the money views, the order, its quote. */
function invalidateTransfer(queryClient: QueryClient, ref: TransferRef): void {
  invalidatePaymentViews(queryClient);
  void queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: orderKeys.detail(ref.orderId) });
  if (ref.kind === 'installment') {
    void queryClient.invalidateQueries({ queryKey: quotationKeys.all });
  }
}

/**
 * The admin opened a receipt: the review stamp (global "À vérifier") and
 * MY subject rows read ("Consulté"), sent together. The second call makes
 * my badge drop at once instead of waiting for the server's event (the
 * server marks the same rows from the review stamp, so a caller that does
 * not know the subject, e.g. the order page, sends the stamp alone). Both
 * are idempotent and best effort: opening a receipt never fails loudly.
 */
export function useOpenTransferReview(): UseMutationResult<
  void,
  Error,
  { ref: TransferRef; subjectKey?: string | null }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ref, subjectKey }) => {
      await Promise.allSettled([
        transferQueueService.openReview(ref),
        ...(subjectKey ? [notificationsService.markSubjectRead(subjectKey)] : []),
      ]);
    },
    onSettled: (_data, _error, { ref }) => {
      invalidatePaymentViews(queryClient);
      // The order's own fee state reads « À vérifier » from now on.
      void queryClient.invalidateQueries({ queryKey: orderKeys.detail(ref.orderId) });
    },
  });
}

/**
 * Mark MY rows of a subject read without opening anything: a notification
 * link to a transfer that left the queue (processed, withdrawn, replaced)
 * must not keep the bell and the badge counting it.
 */
export function useMarkTransferSubjectRead(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (subjectKey) => {
      await notificationsService.markSubjectRead(subjectKey);
    },
    onSettled: () => invalidatePaymentViews(queryClient),
  });
}

export interface TransferDecisionVars {
  ref: TransferRef;
}

/**
 * Confirm the transfer. Errors are not toasted here: the review dialog
 * shows them in place (« déjà traité » refreshes the queue).
 */
export function useConfirmTransfer(): UseMutationResult<
  void,
  Error,
  TransferDecisionVars & { body?: ConfirmTransferBody }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ ref, body }) => transferQueueService.confirm(ref, body),
    onSuccess: (_data, { ref }) => {
      invalidateTransfer(queryClient, ref);
      toast.success(t('pendingDesk.toast.confirmed'));
    },
    onError: (error, { ref }) => {
      // A 409: someone got there first (another admin, the doctor), so
      // the list on screen is stale: refetch it.
      if (extractApiError(error).status === 409) invalidateTransfer(queryClient, ref);
    },
  });
}

/** Refuse the transfer with the reason the doctor will read. */
export function useRejectTransfer(): UseMutationResult<
  void,
  Error,
  TransferDecisionVars & { body: RejectTransferBody }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ ref, body }) => transferQueueService.reject(ref, body),
    onSuccess: (_data, { ref }) => {
      invalidateTransfer(queryClient, ref);
      toast.success(t('pendingDesk.toast.rejected'));
    },
    onError: (error, { ref }) => {
      if (extractApiError(error).status === 409) invalidateTransfer(queryClient, ref);
    },
  });
}

/** A fetched receipt: the bytes and their object URL on this page. */
export interface TransferProofFile {
  blob: Blob;
  url: string;
}

/**
 * Object URLs of the receipts fetched in this tab, one per subject, the
 * oldest revoked past the cap (a receipt can be several MB). A subject
 * fetched again (refetch) revokes its previous URL. Never revoked on
 * unmount: the query cache may hand the same file to the next viewer.
 */
const MAX_PROOF_URLS = 12;
const proofUrls = new Map<string, string>();

function rememberProofUrl(subjectKey: string, url: string): void {
  const previous = proofUrls.get(subjectKey);
  if (previous && previous !== url) URL.revokeObjectURL(previous);
  proofUrls.delete(subjectKey);
  proofUrls.set(subjectKey, url);
  while (proofUrls.size > MAX_PROOF_URLS) {
    const [oldestKey, oldestUrl] = proofUrls.entries().next().value as [string, string];
    URL.revokeObjectURL(oldestUrl);
    proofUrls.delete(oldestKey);
  }
}

/**
 * A transfer's receipt, fetched behind the JWT (receipts are private:
 * <img src> or <iframe src> on the API would send no token). Keyed by the
 * declaration's subject, so a re-uploaded fee receipt is fetched afresh.
 * The blob keeps its type only when it can be shown inertly (raster
 * images, PDF); anything else becomes a download.
 */
export function useTransferProof(
  ref: TransferRef | null,
  subjectKey: string | null,
  enabled: boolean,
): UseQueryResult<TransferProofFile, ProofLoadError> {
  return useQuery<TransferProofFile, ProofLoadError>({
    queryKey: transferQueueKeys.proof(subjectKey ?? 'none'),
    queryFn: async () => {
      if (!ref || !subjectKey) throw new Error('No receipt to load.');
      const blob = inertBlob(await transferQueueService.proof(ref), 'viewer');
      const url = URL.createObjectURL(blob);
      rememberProofUrl(subjectKey, url);
      return { blob, url };
    },
    enabled: enabled && ref !== null && subjectKey !== null,
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    // A 404 (no receipt, or not readable) will not change on a retry.
    retry: (count, error) => error.status !== 404 && count < 1,
    refetchOnWindowFocus: false,
  });
}
