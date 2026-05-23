'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { extractApiErrorMessage, ordersService } from '@/lib/api';
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
  return useMutation({
    mutationFn: ordersService.createOrder,
    onSuccess: (order) => {
      syncOrderCaches(queryClient, order);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      toast.success('Order draft saved');
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}

export function useUpdateOrder(): UseMutationResult<
  DentalOrder,
  Error,
  { id: string; data: UpdateOrderDto }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => ordersService.updateOrder(id, data),
    onSuccess: (order, variables) => {
      syncOrderCaches(queryClient, order);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(variables.id) });
      toast.success('Order updated');
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}

export function useSubmitOrder(): UseMutationResult<DentalOrder, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ordersService.submitOrder,
    onSuccess: (order, id) => {
      syncOrderCaches(queryClient, order);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      toast.success('Order submitted');
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
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
      toast.success('Order status updated.');
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}

export function useDeleteOrder(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ordersService.deleteOrder,
    onSuccess: (_data, id) => {
      removeOrderFromLists(queryClient, id);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.removeQueries({ queryKey: orderKeys.detail(id) });
      toast.success('Order deleted');
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}

export function usePermanentDeleteOrder(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ordersService.permanentDeleteOrder,
    onSuccess: (_data, id) => {
      removeOrderFromLists(queryClient, id);
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.removeQueries({ queryKey: orderKeys.detail(id) });
      toast.success('Order permanently deleted');
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
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
        toast.info('No orders changed — already at the requested status.');
      } else if (skipped > 0) {
        toast.success(
          `${updated} order${updated === 1 ? '' : 's'} updated · ${skipped} skipped.`,
        );
      } else {
        toast.success(
          `${updated} order${updated === 1 ? '' : 's'} updated.`,
        );
      }
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
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
          `${deleted} order${deleted === 1 ? '' : 's'} deleted · ${skipped} skipped.`,
        );
      } else {
        toast.success(
          `${deleted} order${deleted === 1 ? '' : 's'} deleted.`,
        );
      }
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
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
  return useMutation({
    mutationFn: ({ id, instructions, replaceTypes }) =>
      ordersService.updateToothInstructions(id, instructions, replaceTypes),
    onSuccess: (order, variables) => {
      syncOrderCaches(queryClient, order);
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(variables.id) });
      // The treatment plan review payload also includes the tooth
      // instructions (grouped odontogram + IPR map). Without this
      // invalidation, the IPR purple bars in the plan editor stay
      // stale until the user manually refreshes.
      queryClient.invalidateQueries({ queryKey: ['treatment-plans'] });
      toast.success('Odontogram saved');
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
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
  });
}

export function useUploadOrderFiles(): UseMutationResult<
  OrderFile[],
  Error,
  { id: string; files: File[]; category: OrderFileCategory }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, files, category }) =>
      ordersService.uploadFiles(id, files, category),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.files(variables.id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(variables.id) });
      toast.success('Files uploaded');
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}

export function useDeleteOrderFile(): UseMutationResult<
  MessageResponse,
  Error,
  { id: string; fileId: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fileId }) => ordersService.deleteFile(id, fileId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.files(variables.id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(variables.id) });
      toast.success('File deleted');
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}
