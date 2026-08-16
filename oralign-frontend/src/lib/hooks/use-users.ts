'use client';

import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usersService, extractApiErrorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n/lang-context';
import { User, UserRole, CreateUserDto, UpdateUserDto, PaginatedResponse, UserFilterParams, MessageResponse, BulkActionDto, BulkUpdateStatusDto } from '@/lib/types';

// Query keys
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (params?: UserFilterParams) => [...userKeys.lists(), params] as const,
  deletedLists: () => [...userKeys.all, 'deleted'] as const,
  deletedList: (params?: UserFilterParams) => [...userKeys.deletedLists(), params] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  currentUser: () => [...userKeys.all, 'current'] as const,
};

/**
 * Dentist options for admin pickers / filters (order wizard, orders +
 * patients list filters). Keyed on the users LIST factory, so:
 *   - the three screens that need this share one cache entry, and
 *   - creating / editing / deleting a user (which invalidates
 *     `userKeys.all`) refreshes them — the previous ad-hoc string keys
 *     ('order-dentists', 'order-dentists-filter', 'patient-dentists-filter')
 *     never did, so a freshly added dentist was missing until reload.
 */
export function useDentistOptions(
  options: { limit?: number; enabled?: boolean } = {},
): UseQueryResult<PaginatedResponse<User>, Error> {
  const params: UserFilterParams = {
    role: UserRole.DENTIST,
    page: 1,
    limit: options.limit ?? 200,
  };
  return useQuery<PaginatedResponse<User>, Error>({
    queryKey: userKeys.list(params),
    queryFn: () => usersService.getAllUsers(params),
    enabled: options.enabled ?? true,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook to get current logged-in user
 */
export function useCurrentUser(): UseQueryResult<User, Error> {
  return useQuery<User, Error>({
    queryKey: userKeys.currentUser(),
    queryFn: usersService.getCurrentUser,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

/**
 * Hook to get all users with pagination and filters (Admin only)
 */
export function useUsers(params?: UserFilterParams): UseQueryResult<PaginatedResponse<User>, Error> {
  return useQuery<PaginatedResponse<User>, Error>({
    queryKey: userKeys.list(params),
    queryFn: () => usersService.getAllUsers(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to get all deleted users with pagination and filters (Admin only)
 */
export function useDeletedUsers(params?: UserFilterParams): UseQueryResult<PaginatedResponse<User>, Error> {
  return useQuery<PaginatedResponse<User>, Error>({
    queryKey: userKeys.deletedList(params),
    queryFn: () => usersService.getDeletedUsers(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to get user by ID (Admin only)
 */
export function useUser(id: string): UseQueryResult<User, Error> {
  return useQuery<User, Error>({
    queryKey: userKeys.detail(id),
    queryFn: () => usersService.getUserById(id),
    enabled: !!id,
  });
}

/**
 * Hook to create a new user (Admin only)
 */
export function useCreateUser(): UseMutationResult<User, Error, CreateUserDto> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<User, Error, CreateUserDto>({
    mutationFn: usersService.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success(t('toasts.users.created'));
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

/**
 * Hook to update a user
 */
export function useUpdateUser(): UseMutationResult<User, Error, { id: string; data: UpdateUserDto }> {
  const queryClient = useQueryClient();

  return useMutation<User, Error, { id: string; data: UpdateUserDto }>({
    mutationFn: ({ id, data }) => usersService.updateUser(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
    },
  });
}

/**
 * Hook to delete a user (Admin only)
 */
export function useDeleteUser(): UseMutationResult<MessageResponse, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<MessageResponse, Error, string>({
    mutationFn: usersService.deleteUser,
    onSuccess: () => {
      // Invalidate users list to refetch
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.deletedLists() });
      toast.success(t('toasts.users.deleted'));
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

/**
 * Hook to restore a user (Admin only)
 */
export function useRestoreUser(): UseMutationResult<User, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<User, Error, string>({
    mutationFn: usersService.restoreUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.deletedLists() });
      toast.success(t('toasts.users.restored'));
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

/**
 * Hook to bulk delete users (Admin only)
 */
export function useBulkDeleteUsers(): UseMutationResult<MessageResponse & { count: number }, Error, BulkActionDto> {
  const queryClient = useQueryClient();

  return useMutation<MessageResponse & { count: number }, Error, BulkActionDto>({
    mutationFn: usersService.bulkDeleteUsers,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.deletedLists() });
      toast.success(data.message);
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

/**
 * Hook to bulk restore users (Admin only)
 */
export function useBulkRestoreUsers(): UseMutationResult<MessageResponse & { count: number }, Error, BulkActionDto> {
  const queryClient = useQueryClient();

  return useMutation<MessageResponse & { count: number }, Error, BulkActionDto>({
    mutationFn: usersService.bulkRestoreUsers,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.deletedLists() });
      toast.success(data.message);
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

/**
 * Hook to bulk update user status (Admin only)
 */
export function useBulkUpdateStatus(): UseMutationResult<MessageResponse & { count: number }, Error, BulkUpdateStatusDto> {
  const queryClient = useQueryClient();

  return useMutation<MessageResponse & { count: number }, Error, BulkUpdateStatusDto>({
    mutationFn: usersService.bulkUpdateStatus,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.deletedLists() });
      toast.success(data.message);
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

/**
 * Hook to permanently delete a user (Hard delete - Admin only)
 */
export function usePermanentlyDeleteUser(): UseMutationResult<MessageResponse, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<MessageResponse, Error, string>({
    mutationFn: usersService.permanentlyDeleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.deletedLists() });
      toast.success(t('toasts.users.permanentlyDeleted'));
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

/**
 * Hook to approve / reject / re-pending a user (Admin only).
 * On approval the backend sends the welcome email automatically.
 */
export function useUpdateApproval(): UseMutationResult<
  User,
  Error,
  { id: string; verificationStatus: 'pending' | 'approved' | 'rejected' }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation<
    User,
    Error,
    { id: string; verificationStatus: 'pending' | 'approved' | 'rejected' }
  >({
    mutationFn: ({ id, verificationStatus }) =>
      usersService.updateApproval(id, verificationStatus),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: userKeys.detail(variables.id),
      });
      const key =
        variables.verificationStatus === 'approved'
          ? 'toasts.users.approved'
          : variables.verificationStatus === 'rejected'
            ? 'toasts.users.rejected'
            : 'toasts.users.setPending';
      toast.success(t(key));
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

/**
 * Hook to bulk permanently delete users (Hard delete - Admin only)
 */
export function useBulkPermanentlyDeleteUsers(): UseMutationResult<MessageResponse & { count: number }, Error, BulkActionDto> {
  const queryClient = useQueryClient();

  return useMutation<MessageResponse & { count: number }, Error, BulkActionDto>({
    mutationFn: usersService.bulkPermanentlyDeleteUsers,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.deletedLists() });
      toast.success(data.message);
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}
