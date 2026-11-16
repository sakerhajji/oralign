'use client';

import { useState } from 'react';
import {
  useSupplementalEligibility,
  useSupplementalOrder,
} from '@/lib/hooks/use-supplemental-orders';
import type {
  SupplementalEligibility,
  SupplementalKind,
  SupplementalOrderView,
} from '@/lib/types';

/** Load key of the start card (no request to open yet). */
const NO_REQUEST = 'start';

export type WizardData =
  | { state: 'loading' }
  | { state: 'error'; error: unknown; retry: () => void }
  | {
      state: 'ready';
      eligibility: SupplementalEligibility;
      /** The request to edit or show; undefined: offer to start one. */
      view: SupplementalOrderView | undefined;
      /** A background refresh failed; the screen keeps the loaded data. */
      refreshError: unknown;
      retry: () => void;
    };

/**
 * What the wizard page needs: the case's eligibility and the request to
 * open (the explicit `requestId`, else the kind's active draft).
 *
 * The request is fetched for THIS visit before the screen opens — the
 * form seeds its answers once from it, so a view cached from an earlier
 * visit (and edited since on another device) must never seed it. Once a
 * screen has opened, a failed background refresh no longer replaces it:
 * the loaded data stays and `refreshError` reports the failure.
 */
export function useWizardData(
  parentOrderId: string,
  kind: SupplementalKind | null,
  requestId: string | null,
): WizardData {
  const eligibility = useSupplementalEligibility(kind ? parentOrderId : undefined);
  const activeRequestId = kind ? eligibility.data?.requests[kind].activeRequestId : null;
  const resolvedId = requestId ?? activeRequestId ?? undefined;
  const request = useSupplementalOrder(resolvedId, { fresh: true });

  const loadedNow =
    eligibility.isSuccess &&
    (!resolvedId || (request.isSuccess && request.isFetchedAfterMount));
  // The screen opened for this request stays open (adjusted during render,
  // the React pattern for state derived from earlier renders).
  const loadKey = resolvedId ?? NO_REQUEST;
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  if (loadedNow && openedKey !== loadKey) setOpenedKey(loadKey);
  const opened = loadedNow || openedKey === loadKey;

  const retry = () => {
    void eligibility.refetch();
    if (resolvedId) void request.refetch();
  };
  const error = eligibility.error ?? (resolvedId ? request.error : null);

  if (opened && eligibility.data && (!resolvedId || request.data)) {
    return {
      state: 'ready',
      eligibility: eligibility.data,
      view: resolvedId ? request.data : undefined,
      refreshError: error,
      retry,
    };
  }
  // An error from an earlier visit shows only once its retry is over.
  const fetching = eligibility.isFetching || (!!resolvedId && request.isFetching);
  if (error && !fetching) return { state: 'error', error, retry };
  return { state: 'loading' };
}
