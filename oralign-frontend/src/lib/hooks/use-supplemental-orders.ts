'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { supplementalOrdersService } from '@/lib/api/supplemental-orders.service';
import { classifyApiError } from '@/lib/api/error';
import { toast } from '@/lib/toast';
import { useT } from '@/lib/i18n/lang-context';
import type {
  ReviewSupplementalOrderDto,
  SupplementalKind,
  SupplementalOrderView,
  UpdateSupplementalOrderDto,
} from '@/lib/types';
import { orderKeys } from './use-orders';
import { patientKeys } from './use-patients';

const ELIGIBILITY_STALE_TIME = 15_000;
const LIST_STALE_TIME = 15_000;
const DETAIL_STALE_TIME = 10_000;
/** A refused action (409) is an explanation: keep it on screen longer. */
const CONFLICT_TOAST_DURATION = 9_000;

export const supplementalOrderKeys = {
  all: ['supplemental-orders'] as const,
  eligibility: (parentOrderId: string) =>
    [...supplementalOrderKeys.all, 'eligibility', parentOrderId] as const,
  list: (parentOrderId: string) =>
    [...supplementalOrderKeys.all, 'list', parentOrderId] as const,
  detail: (requestId: string) =>
    [...supplementalOrderKeys.all, 'detail', requestId] as const,
};

type Translate = ReturnType<typeof useT>['t'];

/** The dictionary's copy of a supplemental error code, if it has one. */
function translatedErrorCode(errorCode: string | null, t: Translate): string | null {
  if (!errorCode) return null;
  const key = `supplemental.errors.${errorCode}`;
  const translated = t(key);
  return translated === key ? null : translated;
}

/**
 * The backend answers in English with a stable error code; the code wins
 * when the dictionary knows it (`supplemental.errors.<CODE>`).
 */
export function supplementalErrorMessage(error: unknown, t: Translate): string {
  const info = classifyApiError(error);
  return translatedErrorCode(info.errorCode, t) ?? info.message;
}

/**
 * Why a draft save failed. Same as `supplementalErrorMessage`, except a
 * refused input without a known code (the validation pipe's 400) is
 * explained in the dashboard's language, its server detail kept.
 */
export function draftSaveErrorMessage(error: unknown, t: Translate): string {
  const info = classifyApiError(error);
  const translated = translatedErrorCode(info.errorCode, t);
  if (translated) return translated;
  if (info.kind === 'validation' && info.serverMessage) {
    return t('supplemental.errors.invalidInput', { detail: info.serverMessage });
  }
  return info.message;
}

function toastSupplementalError(error: unknown, t: Translate): void {
  const conflict = classifyApiError(error).status === 409;
  toast.error(
    supplementalErrorMessage(error, t),
    conflict ? { duration: CONFLICT_TOAST_DURATION } : undefined,
  );
}

/** The request a mutation acts on, and where it shows up. */
export interface SupplementalTarget {
  requestId: string;
  parentOrderId: string;
  /** Refreshes the patient's panel when known. */
  patientId?: string;
}

/**
 * `request`: only the request changed (a draft save) — the parent case
 * and its eligibility are never touched by a request edit.
 * `case`: the request's lifecycle moved, which changes what the parent
 * case offers (eligibility, panel, history).
 */
type RefreshScope = 'request' | 'case';

function refreshRelatedViews(
  queryClient: QueryClient,
  affected: { parentOrderId: string; childOrderIds: readonly string[]; patientId?: string },
  scope: RefreshScope,
): void {
  const { parentOrderId, childOrderIds, patientId } = affected;
  const invalidate = (queryKey: readonly unknown[], exact = false) =>
    void queryClient.invalidateQueries({ queryKey, exact });

  invalidate(supplementalOrderKeys.list(parentOrderId));
  for (const childId of childOrderIds) {
    // Exact: the child's file list is not affected by a request mutation.
    invalidate(orderKeys.detail(childId), true);
    invalidate(orderKeys.history(childId));
  }
  invalidate(orderKeys.lists());
  invalidate(patientKeys.lists());
  if (patientId) invalidate(patientKeys.detail(patientId));
  if (scope === 'case') {
    invalidate(supplementalOrderKeys.eligibility(parentOrderId));
    invalidate(orderKeys.detail(parentOrderId));
  }
}

function storeView(queryClient: QueryClient, view: SupplementalOrderView): void {
  queryClient.setQueryData(supplementalOrderKeys.detail(view.order.id), view);
}

export function useSupplementalEligibility(parentOrderId?: string) {
  return useQuery({
    queryKey: supplementalOrderKeys.eligibility(parentOrderId ?? ''),
    queryFn: () => supplementalOrdersService.eligibility(parentOrderId!),
    enabled: !!parentOrderId,
    staleTime: ELIGIBILITY_STALE_TIME,
  });
}

export function useSupplementalOrders(parentOrderId?: string) {
  return useQuery({
    queryKey: supplementalOrderKeys.list(parentOrderId ?? ''),
    queryFn: () => supplementalOrdersService.list(parentOrderId!),
    enabled: !!parentOrderId,
    staleTime: LIST_STALE_TIME,
  });
}

/**
 * One request. `fresh`: never trust the cache — refetch whenever the
 * caller mounts or switches request, for a screen that seeds an editor
 * from the view (it then waits for `isFetchedAfterMount`).
 */
export function useSupplementalOrder(requestId?: string, options?: { fresh?: boolean }) {
  return useQuery({
    queryKey: supplementalOrderKeys.detail(requestId ?? ''),
    queryFn: () => supplementalOrdersService.get(requestId!),
    enabled: !!requestId,
    staleTime: options?.fresh ? 0 : DETAIL_STALE_TIME,
  });
}

export function useCreateSupplementalOrder() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (variables: {
      parentOrderId: string;
      type: SupplementalKind;
      idempotencyKey: string;
    }) =>
      supplementalOrdersService.create(
        variables.parentOrderId,
        variables.type,
        variables.idempotencyKey,
      ),
    onSuccess: (view, variables) => {
      storeView(queryClient, view);
      refreshRelatedViews(
        queryClient,
        {
          parentOrderId: variables.parentOrderId,
          childOrderIds: [view.order.id],
          patientId: view.order.patientId,
        },
        'case',
      );
    },
    onError: (error) => toastSupplementalError(error, t),
  });
}

/**
 * Draft save. Silent on purpose: the wizard autosaves and reports the
 * outcome in its own status line (with a retry), not with toasts.
 */
export function useUpdateSupplementalOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: SupplementalTarget & { data: UpdateSupplementalOrderDto }) =>
      supplementalOrdersService.update(variables.requestId, variables.data),
    onSuccess: (view, variables) => {
      storeView(queryClient, view);
      refreshRelatedViews(
        queryClient,
        {
          parentOrderId: variables.parentOrderId,
          childOrderIds: [variables.requestId],
          patientId: variables.patientId,
        },
        'request',
      );
    },
  });
}

export function useSubmitSupplementalOrder() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (variables: SupplementalTarget) =>
      supplementalOrdersService.submit(variables.requestId),
    onSuccess: (view, variables) => {
      storeView(queryClient, view);
      refreshRelatedViews(
        queryClient,
        {
          parentOrderId: variables.parentOrderId,
          childOrderIds: [variables.requestId],
          patientId: variables.patientId,
        },
        'case',
      );
      toast.success(t('supplemental.toasts.submitted'));
    },
    onError: (error) => toastSupplementalError(error, t),
  });
}

export function useDeleteSupplementalOrder() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (variables: SupplementalTarget) =>
      supplementalOrdersService.removeDraft(variables.requestId),
    onSuccess: (_response, variables) => {
      queryClient.removeQueries({
        queryKey: supplementalOrderKeys.detail(variables.requestId),
      });
      refreshRelatedViews(
        queryClient,
        {
          parentOrderId: variables.parentOrderId,
          childOrderIds: [variables.requestId],
          patientId: variables.patientId,
        },
        'case',
      );
      toast.success(t('supplemental.toasts.deleted'));
    },
    onError: (error) => toastSupplementalError(error, t),
  });
}

export function useReviewSupplementalOrder() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (variables: SupplementalTarget & { data: ReviewSupplementalOrderDto }) =>
      supplementalOrdersService.review(variables.requestId, variables.data),
    onSuccess: (view, variables) => {
      storeView(queryClient, view);
      refreshRelatedViews(
        queryClient,
        {
          parentOrderId: variables.parentOrderId,
          childOrderIds: [variables.requestId],
          patientId: variables.patientId,
        },
        'case',
      );
      toast.success(t('supplemental.toasts.reviewed'));
    },
    onError: (error) => toastSupplementalError(error, t),
  });
}

/** Rejected warranty → paid replacement draft. Resolves to the replacement. */
export function useConvertWarrantyToReplacement() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (variables: SupplementalTarget) =>
      supplementalOrdersService.convertToReplacement(variables.requestId),
    onSuccess: (replacement, variables) => {
      storeView(queryClient, replacement);
      void queryClient.invalidateQueries({
        queryKey: supplementalOrderKeys.detail(variables.requestId),
      });
      refreshRelatedViews(
        queryClient,
        {
          parentOrderId: variables.parentOrderId,
          childOrderIds: [variables.requestId, replacement.order.id],
          patientId: variables.patientId,
        },
        'case',
      );
      toast.success(t('supplemental.toasts.converted'));
    },
    onError: (error) => toastSupplementalError(error, t),
  });
}
