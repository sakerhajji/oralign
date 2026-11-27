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
import { productionService, readProductionError } from '@/lib/api/production.service';
import {
  PRODUCTION_ERROR,
  type ActCounters,
  type ArchPair,
  type CancelProductionEventInput,
  type DeclareProductionEventInput,
  type ProductionCancelResult,
  type ProductionCaseSheet,
  type ProductionDeclareResult,
  type ProductionDossier,
  type ProductionEventView,
  type ProductionMyDay,
  type ProductionMyDayChoice,
  type ProductionQueuePage,
  type ProductionQueueParams,
} from '@/lib/types/production';
import { invalidateProductionAdmin } from './use-production-admin';

/**
 * Lab production, technician side: the queue, the case sheet, the
 * dossier and "Ma journée", over productionService only
 * (production-build/CONTRACT.md §6). The admin desk has its own keys
 * (use-production-admin.ts).
 */
export const productionKeys = {
  all: ['production'] as const,
  queues: () => [...productionKeys.all, 'queue'] as const,
  queue: (params: ProductionQueueParams) => [...productionKeys.queues(), params] as const,
  sheets: () => [...productionKeys.all, 'sheet'] as const,
  sheet: (orderId: string) => [...productionKeys.sheets(), orderId] as const,
  dossier: (orderId: string) => [...productionKeys.all, 'dossier', orderId] as const,
  myDays: () => [...productionKeys.all, 'my-day'] as const,
  myDay: (day: ProductionMyDayChoice) => [...productionKeys.myDays(), day] as const,
  // Mutation keys: the overlays watch them (useIsMutating) so a sheet
  // cannot be dismissed while its write is in flight.
  declareWrite: () => [...productionKeys.all, 'declare'] as const,
  cancelWrite: () => [...productionKeys.all, 'cancel'] as const,
};

// The bench moves all day (two technicians, an admin delivering): lists
// poll instead of waiting for a socket the technician role has no room on.
const QUEUE_POLL_MS = 30_000;
const SHEET_STALE_MS = 10_000;
const DOSSIER_STALE_MS = 60_000;

export function useProductionQueue(
  params: ProductionQueueParams,
): UseQueryResult<ProductionQueuePage, Error> {
  return useQuery({
    queryKey: productionKeys.queue(params),
    queryFn: () => productionService.getQueue(params),
    staleTime: SHEET_STALE_MS,
    refetchInterval: QUEUE_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // Keep the rows on screen while a new search, tab or page loads.
    placeholderData: keepPreviousData,
  });
}

/**
 * The case sheet. It polls like the queue (spec §3): a tranche unlocked
 * while the sheet is open (a payment confirmed, an admin's manual unlock)
 * reaches the bench within 30 s, not on the next focus only.
 */
export function useProductionSheet(
  orderId: string,
  { enabled = true }: { enabled?: boolean } = {},
): UseQueryResult<ProductionCaseSheet, Error> {
  return useQuery({
    queryKey: productionKeys.sheet(orderId),
    queryFn: () => productionService.getCaseSheet(orderId),
    enabled: enabled && !!orderId,
    staleTime: SHEET_STALE_MS,
    refetchInterval: QUEUE_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useProductionDossier(
  orderId: string,
): UseQueryResult<ProductionDossier, Error> {
  return useQuery({
    queryKey: productionKeys.dossier(orderId),
    queryFn: () => productionService.getDossier(orderId),
    enabled: !!orderId,
    staleTime: DOSSIER_STALE_MS,
  });
}

export function useProductionMyDay(
  day: ProductionMyDayChoice,
): UseQueryResult<ProductionMyDay, Error> {
  return useQuery({
    queryKey: productionKeys.myDay(day),
    queryFn: () => productionService.getMyDay(day),
    staleTime: SHEET_STALE_MS,
    refetchOnWindowFocus: true,
    // Switching Aujourd'hui / Hier keeps the other day on screen (dimmed)
    // instead of flashing skeletons; `data.day` says which day it is.
    placeholderData: keepPreviousData,
  });
}

// ─── Cache writes after a declare or cancel ─────────────────────────

const ARCH_ORDER: Record<ProductionEventView['arch'], number> = { upper: 0, lower: 1 };

/** The sheet's history order: performedAt desc, createdAt desc, arch, id. */
function compareHistory(a: ProductionEventView, b: ProductionEventView): number {
  return (
    b.performedAt.localeCompare(a.performedAt) ||
    b.createdAt.localeCompare(a.createdAt) ||
    ARCH_ORDER[a.arch] - ARCH_ORDER[b.arch] ||
    a.id.localeCompare(b.id)
  );
}

/** `events` replace their rows by id; new ones join the history. */
function mergeHistory(
  history: readonly ProductionEventView[],
  events: readonly ProductionEventView[],
): ProductionEventView[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  const merged = history.map((row) => {
    const fresh = byId.get(row.id);
    if (!fresh) return row;
    byId.delete(row.id);
    return fresh;
  });
  return [...merged, ...byId.values()].sort(compareHistory);
}

interface ProductionWriteResult {
  events: ProductionEventView[];
  counters: ArchPair<ActCounters>;
  sheetVersion: string;
}

/**
 * The response IS the new state of the rows and counters: write it into
 * the open sheet at once (the buttons' counters move under her finger),
 * patch the rows already listed in "Ma journée", then refetch what the
 * response cannot carry (next steps, released ranges after a delivery,
 * an auto-finished status) and the lists.
 */
function applyWriteResult(
  queryClient: QueryClient,
  orderId: string,
  result: ProductionWriteResult,
): void {
  queryClient.setQueryData<ProductionCaseSheet>(productionKeys.sheet(orderId), (sheet) =>
    sheet
      ? {
          ...sheet,
          history: mergeHistory(sheet.history, result.events),
          counters: result.counters,
          sheetVersion: result.sheetVersion,
        }
      : sheet,
  );
  const byId = new Map(result.events.map((event) => [event.id, event]));
  queryClient.setQueriesData<ProductionMyDay>({ queryKey: productionKeys.myDays() }, (day) =>
    day
      ? {
          ...day,
          events: day.events.map((row) => {
            const fresh = byId.get(row.id);
            return fresh ? { ...fresh, order: row.order } : row;
          }),
        }
      : day,
  );
  void queryClient.invalidateQueries({ queryKey: productionKeys.sheet(orderId) });
  void queryClient.invalidateQueries({ queryKey: productionKeys.queues() });
  void queryClient.invalidateQueries({ queryKey: productionKeys.myDays() });
  // An admin entering from the sheet then opening Pilotage sees it at once
  // (only marks cached desk queries stale; a technician has none).
  void invalidateProductionAdmin(queryClient);
}

// Refusals that mean the sheet on screen is stale (the case left
// production, a batch was locked or delivered, the plan changed): refetch
// it so the banner, the ranges and the next steps tell the truth.
const STALE_SHEET_CODES: ReadonlySet<string> = new Set([
  PRODUCTION_ERROR.ORDER_NOT_IN_PRODUCTION,
  PRODUCTION_ERROR.STEPS_NOT_RELEASED,
  PRODUCTION_ERROR.STEP_BEYOND_PLANNED_TOTAL,
  PRODUCTION_ERROR.CANCEL_WINDOW_PASSED,
]);

function refreshStaleSheet(queryClient: QueryClient, orderId: string, error: unknown): void {
  const { status, errorCode } = readProductionError(error);
  if (status === 404 || (errorCode !== null && STALE_SHEET_CODES.has(errorCode))) {
    void queryClient.invalidateQueries({ queryKey: productionKeys.sheet(orderId) });
  }
}

export interface DeclareProductionVars {
  input: DeclareProductionEventInput;
  /** Created once per form opening; the SAME key for every retry. */
  idempotencyKey: string;
}

/**
 * POST /production/events. No toast here: the form owns the feedback
 * (a 409 PRODUCTION_CONFIRM_REQUIRED turns it into a confirmation step,
 * the other refusals are shown inline next to the fields).
 */
export function useDeclareProductionEvent(): UseMutationResult<
  ProductionDeclareResult,
  Error,
  DeclareProductionVars
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: productionKeys.declareWrite(),
    mutationFn: ({ input, idempotencyKey }) =>
      productionService.declareEvent(input, idempotencyKey),
    onSuccess: (result, { input }) => applyWriteResult(queryClient, input.orderId, result),
    onError: (error, { input }) => refreshStaleSheet(queryClient, input.orderId, error),
  });
}

export interface CancelProductionVars {
  eventId: string;
  orderId: string;
  input: CancelProductionEventInput;
}

/** PATCH /production/events/:id/cancel (feedback in the dialog). */
export function useCancelProductionEvent(): UseMutationResult<
  ProductionCancelResult,
  Error,
  CancelProductionVars
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: productionKeys.cancelWrite(),
    mutationFn: ({ eventId, input }) => productionService.cancelEvent(eventId, input),
    onSuccess: (result, { orderId }) => applyWriteResult(queryClient, orderId, result),
    onError: (error, { orderId }) => {
      refreshStaleSheet(queryClient, orderId, error);
      // "Ma journée" shows the same rows: their canCancel moved too.
      void queryClient.invalidateQueries({ queryKey: productionKeys.myDays() });
    },
  });
}
