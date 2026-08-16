'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { extractApiErrorMessage, toastMutationError, ordersService } from '@/lib/api';
import { useT } from '@/lib/i18n/lang-context';
import {
  CreateOrderDto,
  DentalOrder,
  MessageResponse,
  OrderFile,
  OrderFileCategory,
  OrderFilterParams,
  OrderStatus,
  PaginatedResponse,
  ToothInstruction,
  ToothInstructionType,
  UpdateOrderDto,
} from '@/lib/types';

const ORDER_LIST_STALE_TIME = 15_000;
const ORDER_DETAIL_STALE_TIME = 10_000;

function patchOrderInLists(
  queryClient: ReturnType<typeof useQueryClient>,
  order: DentalOrder,
) {
  queryClient.setQueriesData<PaginatedResponse<DentalOrder>>(
    { queryKey: orderKeys.lists() },
    (cached) => {
      if (!cached) return cached;
      const nextData = cached.data.map((item) =>
        item.id === order.id ? { ...item, ...order } : item,
      );
      return { ...cached, data: nextData };
    },
  );
}

function removeOrderFromLists(
  queryClient: ReturnType<typeof useQueryClient>,
  orderId: string,
) {
  queryClient.setQueriesData<PaginatedResponse<DentalOrder>>(
    { queryKey: orderKeys.lists() },
    (cached) => {
      if (!cached) return cached;
      const nextData = cached.data.filter((item) => item.id !== orderId);
      const removed = cached.data.length - nextData.length;
      return {
        ...cached,
        data: nextData,
        total: Math.max(0, cached.total - removed),
      };
    },
  );
}

function syncOrderCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  order: DentalOrder,
) {
  queryClient.setQueryData(orderKeys.detail(order.id), order);
  patchOrderInLists(queryClient, order);
}

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (params?: OrderFilterParams) => [...orderKeys.lists(), params] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
  files: (id: string) => [...orderKeys.detail(id), 'files'] as const,
  /** Rendered treatment-fee invoice PDF for an order, per language. */
  treatmentFeeInvoicePdf: (id: string, lang: string) =>
    [...orderKeys.detail(id), 'treatment-fee-invoice-pdf', lang] as const,
};

export function useOrders(
  params?: OrderFilterParams,
): UseQueryResult<PaginatedResponse<DentalOrder>, Error> {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => ordersService.getOrders(params),
    staleTime: ORDER_LIST_STALE_TIME,
    placeholderData: (previousData) => previousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });
}

/**
 * Hover/focus-triggered prefetch for the order-detail page. Pulled
 * from the list page so the moment the user moves the mouse over a
 * row, React Query starts the GET /orders/:id request in the
 * background — by the time the click navigates, the cache is warm
 * and the detail page paints instantly.
 *
 * Returns a callback that the row can bind to `onMouseEnter` /
 * `onFocus`. Re-binding is cheap (queryClient is stable) so a
 * `useCallback` wrap isn't necessary in callers.
 */
export function useOrderPrefetch(): (id: string) => void {
  const queryClient = useQueryClient();
  return (id: string) => {
    if (!id) return;
    queryClient.prefetchQuery({
      queryKey: orderKeys.detail(id),
      queryFn: () => ordersService.getOrderById(id),
      // Match the live query's staleness so the prefetched result is
      // accepted as fresh by useOrder() when the detail page mounts.
      staleTime: ORDER_DETAIL_STALE_TIME,
    });
  };
}

export function useOrder(id?: string): UseQueryResult<DentalOrder, Error> {
  return useQuery({
    queryKey: orderKeys.detail(id ?? ''),
    queryFn: () => ordersService.getOrderById(id ?? ''),
    enabled: !!id,
    staleTime: ORDER_DETAIL_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });
}

export function useCreateOrder(): UseMutationResult<
  DentalOrder,
  Error,
  CreateOrderDto
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ordersService.createOrder,
    onSuccess: (order) => {
      syncOrderCaches(queryClient, order);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      toast.success(t('toasts.orders.draftSaved'));
    },
    onError: (error) => toastMutationError(error),
  });
}

export function useUpdateOrder(): UseMutationResult<
  DentalOrder,
  Error,
  { id: string; data: UpdateOrderDto }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, data }) => ordersService.updateOrder(id, data),
    onSuccess: (order, variables) => {
      syncOrderCaches(queryClient, order);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(variables.id) });
      toast.success(t('toasts.orders.updated'));
    },
    onError: (error) => toastMutationError(error),
  });
}

export function useSubmitOrder(): UseMutationResult<
  DentalOrder,
  Error,
  { id: string; termsAccepted: boolean }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, termsAccepted }) =>
      ordersService.submitOrder(id, termsAccepted),
    onSuccess: (order, { id }) => {
      syncOrderCaches(queryClient, order);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      toast.success(t('toasts.orders.submitted'));
    },
    onError: (error) => toastMutationError(error),
  });
}

/**
 * Pay the treatment fee on an order. Routes by method:
 *   • card / cash         → instant success (admin only for cash)
 *   • bank_transfer       → records intent; doctor must still upload
 *     a receipt with `useUploadTreatmentFeeProof` and an admin must
 *     confirm with `useConfirmTreatmentFeePayment`.
 */
export function usePayTreatmentFee(): UseMutationResult<
  DentalOrder,
  Error,
  { id: string; method: 'card' | 'cash' | 'bank_transfer'; amount: number }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, method, amount }) =>
      ordersService.payTreatmentFee(id, method, amount),
    onSuccess: (order, { id, method }) => {
      syncOrderCaches(queryClient, order);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      if (method === 'bank_transfer') {
        toast.success(t('toasts.orders.bankTransferRecorded'));
      } else {
        toast.success(t('toasts.orders.treatmentFeePaid'));
      }
    },
    onError: (error) => toastMutationError(error),
  });
}

/** Upload the bank-transfer receipt for the treatment fee. */
export function useUploadTreatmentFeeProof(): UseMutationResult<
  DentalOrder,
  Error,
  { id: string; proof: File; amount: number }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, proof, amount }) =>
      ordersService.uploadTreatmentFeeProof(id, proof, amount),
    onSuccess: (order, { id }) => {
      syncOrderCaches(queryClient, order);
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      toast.success(t('toasts.orders.receiptUploaded'));
    },
    onError: (error) => toastMutationError(error),
  });
}

/** Admin confirms a pending bank-transfer treatment-fee payment. */
export function useConfirmTreatmentFeePayment(): UseMutationResult<
  DentalOrder,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => ordersService.confirmTreatmentFeePayment(id),
    onSuccess: (order, id) => {
      syncOrderCaches(queryClient, order);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      // Bust both treatment-fee list caches so the confirmed row
      // hops from the pending queue into the history table.
      queryClient.invalidateQueries({ queryKey: ['treatment-fees'] });
      toast.success(t('toasts.orders.bankTransferConfirmed'));
    },
    onError: (error) => toastMutationError(error),
  });
}

/**
 * Admin queue of treatment-fee bank-transfer payments awaiting
 * confirmation. 30-second poll because admin queues feel sluggish
 * without near-real-time updates; the data is small.
 */
export function usePendingTreatmentFees(
  params: { page?: number; limit?: number } = {},
) {
  return useQuery({
    queryKey: ['treatment-fees', 'pending', params],
    queryFn: () => ordersService.listPendingTreatmentFees(params),
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 30,
  });
}

/** Admin: paginated treatment-fee payment history. */
export function useTreatmentFeesHistory(
  params: { page?: number; limit?: number } = {},
) {
  return useQuery({
    queryKey: ['treatment-fees', 'history', params],
    queryFn: () => ordersService.listTreatmentFees(params),
    staleTime: 1000 * 60,
  });
}

/**
 * Admin-only manual status override (roll forward or roll back the
 * order to any lifecycle value). The backend enforces the role check;
 * the UI hides the affordance for non-admins.
 */
export function useOverrideOrderStatus(): UseMutationResult<
  DentalOrder,
  Error,
  { id: string; status: OrderStatus; reason?: string }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, status, reason }) =>
      ordersService.overrideStatus(id, status, reason),
    onSuccess: (order, { id }) => {
      syncOrderCaches(queryClient, order);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      // Treatment plan + quote views read order status indirectly via
      // their order include — refresh those too so the status badges
      // shown next to those tabs stay accurate.
      queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      toast.success(t('toasts.orders.statusUpdated'));
    },
    onError: (error) => toastMutationError(error),
  });
}

export function useDeleteOrder(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ordersService.deleteOrder,
    onSuccess: (_data, id) => {
      removeOrderFromLists(queryClient, id);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.removeQueries({ queryKey: orderKeys.detail(id) });
      toast.success(t('toasts.orders.deleted'));
    },
    onError: (error) => toastMutationError(error),
  });
}

export function usePermanentDeleteOrder(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ordersService.permanentDeleteOrder,
    onSuccess: (_data, id) => {
      removeOrderFromLists(queryClient, id);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.removeQueries({ queryKey: orderKeys.detail(id) });
      toast.success(t('toasts.orders.permanentlyDeleted'));
    },
    onError: (error) => toastMutationError(error),
  });
}

/**
 * Restore a soft-deleted order. Wipes the cached row from any list
 * (so the trash bin drops it) and invalidates both the live lists
 * and the detail query so the restored row shows up in the standard
 * catalogue on next fetch.
 */
export function useRestoreOrder(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ordersService.restoreOrder,
    onSuccess: (_data, id) => {
      removeOrderFromLists(queryClient, id);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      toast.success(t('toasts.orders.restored'));
    },
    onError: (error) => toastMutationError(error),
  });
}

/**
 * Bulk admin-only status update for N orders. Invalidates the LIST
 * caches (one re-fetch covers the whole table) and each affected
 * DETAIL cache so an open detail page re-syncs to the new status.
 *
 * The toast leans on the `{ updated, skipped }` payload returned by
 * the backend so the planner sees the exact count of rows that
 * actually moved.
 */
export function useBulkUpdateOrderStatus(): UseMutationResult<
  { updated: number; skipped: number },
  Error,
  { ids: string[]; status: OrderStatus; reason?: string }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ ids, status, reason }) =>
      ordersService.bulkUpdateStatus(ids, status, reason),
    onSuccess: ({ updated, skipped }, { ids }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      for (const id of ids) {
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      }
      queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      if (updated === 0) {
        toast.info(t('toasts.orders.bulkNoChange'));
      } else if (skipped > 0) {
        toast.success(
          t('toasts.orders.bulkUpdatedSkipped', { count: updated, skipped }),
        );
      } else {
        toast.success(t('toasts.orders.bulkUpdated', { count: updated }));
      }
    },
    onError: (error) => toastMutationError(error),
  });
}

/**
 * Bulk soft-delete (sets deletedAt). Removes the deleted ids from
 * any cached list pages so the table re-paints instantly without
 * waiting for the refetch — same optimistic-removal helper the
 * single-row delete uses.
 */
export function useBulkDeleteOrders(): UseMutationResult<
  { deleted: number; skipped: number },
  Error,
  string[]
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (ids: string[]) => ordersService.bulkDelete(ids),
    onSuccess: ({ deleted, skipped }, ids) => {
      for (const id of ids) {
        removeOrderFromLists(queryClient, id);
        queryClient.removeQueries({ queryKey: orderKeys.detail(id) });
      }
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      if (skipped > 0) {
        toast.success(
          t('toasts.orders.bulkDeletedSkipped', { count: deleted, skipped }),
        );
      } else {
        toast.success(t('toasts.orders.bulkDeleted', { count: deleted }));
      }
    },
    onError: (error) => toastMutationError(error),
  });
}

/**
 * Bulk restore N soft-deleted orders. Invalidates every list query so
 * the rows hop from the trash view back into the active list.
 */
export function useBulkRestoreOrders(): UseMutationResult<
  { restored: number; skipped: number },
  Error,
  string[]
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (ids: string[]) => ordersService.bulkRestore(ids),
    onSuccess: ({ restored, skipped }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      if (skipped > 0) {
        toast.success(
          t('toasts.orders.bulkRestoredSkipped', { count: restored, skipped }),
        );
      } else {
        toast.success(t('toasts.orders.bulkRestored', { count: restored }));
      }
    },
    onError: (error) => toastMutationError(error),
  });
}

/**
 * Bulk PERMANENT delete — hard-delete N orders + their files.
 * Removes both the list cache entries AND any detail cache so a
 * stale prefetched detail doesn't keep showing the gone order.
 */
export function useBulkPermanentDeleteOrders(): UseMutationResult<
  { deleted: number; skipped: number },
  Error,
  string[]
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (ids: string[]) => ordersService.bulkPermanentDelete(ids),
    onSuccess: ({ deleted, skipped }, ids) => {
      for (const id of ids) {
        removeOrderFromLists(queryClient, id);
        queryClient.removeQueries({ queryKey: orderKeys.detail(id) });
      }
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      if (skipped > 0) {
        toast.success(
          t('toasts.orders.bulkPermanentlyDeletedSkipped', {
            count: deleted,
            skipped,
          }),
        );
      } else {
        toast.success(
          t('toasts.orders.bulkPermanentlyDeleted', { count: deleted }),
        );
      }
    },
    onError: (error) => toastMutationError(error),
  });
}

export function useUpdateToothInstructions(): UseMutationResult<
  DentalOrder,
  Error,
  {
    id: string;
    instructions: ToothInstruction[];
    /**
     * Limits the backend's REPLACE-ALL to these types. Required for any
     * caller that doesn't own the whole odontogram — otherwise the save
     * would wipe rows that belong to a different surface (e.g. doctor
     * flags when the planner saves attachments). See
     * `UpdateToothInstructionsDto.replaceTypes` on the backend.
     */
    replaceTypes?: ToothInstructionType[];
  }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, instructions, replaceTypes }) =>
      ordersService.updateToothInstructions(id, instructions, replaceTypes),
    onSuccess: (order) => {
      // The PUT already returns the FULL updated order — write it into
      // the detail cache and the lists. Do NOT also invalidate the
      // detail key: that refired GET /orders/:id (files + variants
      // included) right after every odontogram save for data we
      // already hold.
      syncOrderCaches(queryClient, order);
      // The treatment plan review payload also includes the tooth
      // instructions (grouped odontogram + IPR map). Without this
      // invalidation, the IPR purple bars in the plan editor stay
      // stale until the user manually refreshes.
      queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
      toast.success(t('toasts.orders.odontogramSaved'));
    },
    onError: (error) => toastMutationError(error),
  });
}

export function useOrderFiles(id?: string): UseQueryResult<OrderFile[], Error> {
  return useQuery({
    queryKey: orderKeys.files(id ?? ''),
    queryFn: () => ordersService.getFiles(id ?? ''),
    enabled: !!id,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Right after an upload the media pipeline is still deriving
    // thumbnails/previews in the background (processingStatus pending/
    // processing). Poll gently until every file settles so thumbnails
    // pop in without a manual reload — then stop entirely.
    refetchInterval: (query) => {
      const busy = query.state.data?.some(
        (file) =>
          file.processingStatus === 'pending' ||
          file.processingStatus === 'processing',
      );
      return busy ? 5_000 : false;
    },
  });
}

export function useUploadOrderFiles(): UseMutationResult<
  OrderFile[],
  Error,
  {
    id: string;
    files: File[];
    category: OrderFileCategory;
    /** Optional 0–100 progress callback for big ZIP / CBCT uploads. */
    onProgress?: (percent: number) => void;
  }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, files, category, onProgress }) =>
      ordersService.uploadFiles(id, files, category, onProgress),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.files(variables.id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(variables.id) });
      toast.success(t('toasts.orders.filesUploaded'));
    },
    onError: (error) => {
      // Friendlier message for the most common big-upload failures.
      // Plain `axios.isAxiosError` would be cleaner but we already lean
      // on the shared extractor for status-code → human-readable text.
      const msg = extractApiErrorMessage(error);
      if (/network error|timeout/i.test(msg)) {
        toast.error(t('toasts.orders.uploadConnectionLost'));
      } else if (/413|payload too large|file too large/i.test(msg)) {
        toast.error(t('toasts.orders.uploadTooLarge'));
      } else {
        toast.error(msg);
      }
    },
  });
}

export function useDeleteOrderFile(): UseMutationResult<
  MessageResponse,
  Error,
  { id: string; fileId: string }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, fileId }) => ordersService.deleteFile(id, fileId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.files(variables.id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(variables.id) });
      toast.success(t('toasts.orders.fileDeleted'));
    },
    onError: (error) => toastMutationError(error),
  });
}
