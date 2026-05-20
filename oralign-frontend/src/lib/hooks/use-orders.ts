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
  UpdateOrderDto,
} from '@/lib/types';

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
    staleTime: 1000 * 60 * 3,
  });
}

export function useOrder(id?: string): UseQueryResult<DentalOrder, Error> {
  return useQuery({
    queryKey: orderKeys.detail(id ?? ''),
    queryFn: () => ordersService.getOrderById(id ?? ''),
    enabled: !!id,
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
    onSuccess: () => {
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
    onSuccess: (_data, variables) => {
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
    onSuccess: (_data, id) => {
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
    onSuccess: (_data, { id }) => {
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
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
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
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      queryClient.removeQueries({ queryKey: orderKeys.detail(id) });
      toast.success('Order permanently deleted');
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}

export function useUpdateToothInstructions(): UseMutationResult<
  DentalOrder,
  Error,
  { id: string; instructions: ToothInstruction[] }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, instructions }) =>
      ordersService.updateToothInstructions(id, instructions),
    onSuccess: (_data, variables) => {
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
