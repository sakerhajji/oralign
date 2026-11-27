'use client';

import { useEffect } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  paymentsService,
  type PaymentsReportFile,
  type ProofReadError,
} from '@/lib/api/payments.service';
import { ordersService } from '@/lib/api/orders.service';
import { invoicesService } from '@/lib/api/invoices.service';
import {
  classifyApiError,
  extractApiError,
  extractApiErrorMessage,
} from '@/lib/api/error';
import { receiptUploadError, type ReceiptErrorView } from '@/lib/payments/receipt-errors';
import {
  inFlightPaymentOf,
  inFlightRefusalKey,
  isPaymentAttemptInProgress,
  withholdingRefusalText,
  type RefusalAudience,
  type RefusedMethod,
} from '@/lib/payments/payment-refusals';
import { installmentTransferOf, isTransferInFlight } from '@/lib/payments/transfer-state';
import { isWelcomeGiftNothingDue } from '@/lib/api/welcome-gift.service';
import { useT } from '@/lib/i18n/lang-context';
import { formatPrice } from '@/lib/utils/currency';
import { paymentPlanKeys } from './use-quotation-payment-plan';
import { quotationKeys } from './use-quotations';
import { orderKeys } from './use-orders';
import { invoiceKeys } from './use-admin-invoices';
import { companyBillingKeys } from './use-company-billing';
import { invalidatePaymentViews, paymentKeys } from './payment-keys';
import { PaymentMethod, PaymentPurpose } from '@/lib/types';
import type {
  HostedPaymentSession,
  PaginatedResponse,
  Payment,
  PaymentFilterDto,
  PaymentListItem,
  PaymentPractitioner,
  PaymentsReportRequest,
  PaymentsSummary,
  PaymentsSummaryParams,
  QuoteInstallment,
  RecordCashPaymentDto,
} from '@/lib/types';

export { paymentKeys } from './payment-keys';

const PAYMENT_STALE_TIME = 10_000;

/** On-screen time of a refusal that explains what to do first. */
const REFUSAL_TOAST_MS = 9_000;

type Translate = ReturnType<typeof useT>['t'];
type QueryClient = ReturnType<typeof useQueryClient>;

/** The API's body of a failed request (its details: withholdingThreshold…). */
function errorBodyOf(error: unknown): unknown {
  return (error as { response?: { data?: unknown } } | null)?.response?.data;
}

/**
 * A retenue refusal (400 WITHHOLDING_DISABLED / _BELOW_THRESHOLD) in the
 * user's language, the server writing it in French only. The rule moved
 * on the server: the public defaults are read again, so the retenue
 * choice of an open dialog unticks itself. False for any other error.
 */
function toastWithholdingRefusal(queryClient: QueryClient, t: Translate, error: unknown): boolean {
  const text = withholdingRefusalText(
    extractApiError(error).errorCode,
    errorBodyOf(error),
    t,
    (value) => formatPrice(value),
  );
  if (!text) return false;
  void queryClient.invalidateQueries({ queryKey: companyBillingKeys.publicDefaults() });
  toast.error(text, { duration: REFUSAL_TOAST_MS });
  return true;
}

/**
 * Whether the installment's latest bank transfer waits on the admin, read
 * afresh (the plan is refetched); null when the plan cannot tell (not
 * loaded, or an API without `latestTransfer`).
 */
async function installmentTransferAwaiting(
  queryClient: QueryClient,
  quotationId: string,
  installmentId: string,
): Promise<boolean | null> {
  const queryKey = paymentPlanKeys.installments(quotationId);
  await queryClient.invalidateQueries({ queryKey });
  const row = queryClient
    .getQueryData<QuoteInstallment[]>(queryKey)
    ?.find((inst) => inst.id === installmentId);
  if (!row || row.latestTransfer === undefined) return null;
  return isTransferInFlight(installmentTransferOf(row).state);
}

/**
 * 409 PAYMENT_ATTEMPT_IN_PROGRESS on an installment: another payment of it
 * is open. Reload the plan so the panel shows it, then say what to do
 * first, in the reader's words (lib/payments/payment-refusals.ts).
 */
function toastInstallmentInFlight(
  queryClient: QueryClient,
  t: Translate,
  args: {
    audience: RefusalAudience;
    method: RefusedMethod;
    quotationId: string;
    installmentId: string;
    orderId?: string;
  },
): void {
  const awaiting =
    args.method === 'card'
      ? Promise.resolve(null)
      : installmentTransferAwaiting(queryClient, args.quotationId, args.installmentId);
  void awaiting
    .catch(() => null)
    .then((transferAwaiting) => {
      refreshQuotePlan(queryClient, args.quotationId, args.orderId);
      toast.error(
        t(inFlightRefusalKey(args.audience, inFlightPaymentOf(args.method, transferAwaiting))),
        { duration: REFUSAL_TOAST_MS },
      );
    });
}

/**
 * Options of the payments desk's live queries. `refetchInterval` keeps a
 * view that covers today current while it stays open (React Query pauses
 * it in a background tab).
 */
export interface LiveQueryOptions {
  enabled?: boolean;
  refetchInterval?: number | false;
}

/**
 * Admin payment history — every payment in the system. While a new
 * filter or page loads, the previous rows stay on screen
 * (`isPlaceholderData`) instead of flashing a skeleton.
 */
export function useAllPayments(
  filters: PaymentFilterDto = {},
  options: LiveQueryOptions = {},
): UseQueryResult<PaginatedResponse<PaymentListItem>, Error> {
  return useQuery({
    queryKey: paymentKeys.history(filters as Record<string, unknown>),
    queryFn: () => paymentsService.listAllPayments(filters),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? false,
    placeholderData: keepPreviousData,
    staleTime: PAYMENT_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

/**
 * Doctor's own payment history — the backend scopes it to the caller's
 * orders. Same placeholder behaviour as `useAllPayments`.
 */
export function useMyPayments(
  filters: PaymentFilterDto = {},
  options: LiveQueryOptions = {},
): UseQueryResult<PaginatedResponse<PaymentListItem>, Error> {
  return useQuery({
    queryKey: paymentKeys.mine(filters as Record<string, unknown>),
    queryFn: () => paymentsService.listMyPayments(filters),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? false,
    placeholderData: keepPreviousData,
    staleTime: PAYMENT_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

/**
 * How many payments match `filters` — one `limit: 1` request on the same
 * endpoint as the list (`scope`), keyed like it. `undefined` until known.
 */
export function usePaymentsTotal(
  filters: PaymentFilterDto,
  options: { scope: 'all' | 'mine'; enabled?: boolean },
): UseQueryResult<number, Error> {
  const countFilters: PaymentFilterDto = { ...filters, page: 1, limit: 1 };
  const all = options.scope === 'all';
  return useQuery({
    queryKey: all
      ? paymentKeys.history(countFilters as Record<string, unknown>)
      : paymentKeys.mine(countFilters as Record<string, unknown>),
    queryFn: () =>
      all
        ? paymentsService.listAllPayments(countFilters)
        : paymentsService.listMyPayments(countFilters),
    select: (data: PaginatedResponse<PaymentListItem>) => data.total,
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    staleTime: PAYMENT_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

/**
 * Money received over a range of business days (none → today), for the
 * caller's scope. The previous figures stay (dimmed by the caller) while
 * another range loads.
 */
export function usePaymentsSummary(
  params: PaymentsSummaryParams,
  options: Pick<LiveQueryOptions, 'refetchInterval'> = {},
): UseQueryResult<PaymentsSummary, Error> {
  return useQuery({
    queryKey: paymentKeys.summary(params as Record<string, unknown>),
    queryFn: () => paymentsService.getSummary(params),
    refetchInterval: options.refetchInterval ?? false,
    placeholderData: keepPreviousData,
    staleTime: PAYMENT_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

/**
 * Admin: the dentists a payments tab can be narrowed to — only those with
 * a payment of that kind. Rarely changes: kept for five minutes.
 */
export function usePaymentPractitioners(
  purpose: PaymentPurpose,
  options: { enabled?: boolean } = {},
): UseQueryResult<PaymentPractitioner[], Error> {
  return useQuery({
    queryKey: paymentKeys.practitioners(purpose),
    queryFn: () => paymentsService.listPractitioners(purpose),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60_000,
  });
}

/**
 * Generate the payments report PDF on the server. The caller decides what
 * to do with the file (download it, or print it); errors are left to the
 * caller too, which shows them where the report was asked for.
 */
export function usePaymentsReport(): UseMutationResult<
  PaymentsReportFile,
  Error,
  PaymentsReportRequest
> {
  return useMutation({
    mutationFn: (request) => paymentsService.downloadReport(request),
  });
}

export function useAdminPayment(
  paymentId: string,
  enabled = true,
): UseQueryResult<Payment, Error> {
  return useQuery({
    queryKey: paymentKeys.detail(paymentId),
    queryFn: () => paymentsService.adminGetPayment(paymentId),
    enabled: enabled && !!paymentId,
    staleTime: PAYMENT_STALE_TIME,
  });
}

/**
 * Every payment mutation invalidates the same fan-out: the payment
 * itself, every payments list, count and the takings summary, the
 * installments + batches of the quote the payment belongs to, the quote
 * itself, the order summary, and the orders list (because the order
 * status can move on SUCCESS).
 *
 * The quote is read by order (QuoteReview's quotationKeys.byOrder): its
 * receivedAmount, hasPaymentInFlight, canDelete / canRecall and status
 * move with every record, declaration, confirmation or rejection, and
 * the editor gates Delete, Recall, Change pack and the below-paid guard
 * on them.
 */
function invalidateAfterPayment(
  queryClient: ReturnType<typeof useQueryClient>,
  payment: Payment,
  orderId?: string,
) {
  invalidatePaymentViews(queryClient);
  if (payment.quotationId) {
    queryClient.invalidateQueries({
      queryKey: paymentPlanKeys.installments(payment.quotationId),
    });
    queryClient.invalidateQueries({
      queryKey: paymentPlanKeys.batches(payment.quotationId),
    });
    queryClient.invalidateQueries({
      queryKey: quotationKeys.detail(payment.quotationId),
    });
    const quoteOrderId = orderId ?? payment.orderId;
    queryClient.invalidateQueries({
      queryKey: quoteOrderId ? quotationKeys.byOrder(quoteOrderId) : quotationKeys.all,
    });
  }
  if (orderId) {
    queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
    queryClient.invalidateQueries({ queryKey: orderKeys.history(orderId) });
  }
  queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
}

/** The API's refusals of a receipt number, by errorCode. */
const INVOICE_NUMBER_ERRORS: Record<string, string> = {
  INVOICE_NUMBER_TAKEN: 'paymentsCommon.invoiceNumberErrors.taken',
  INVOICE_NUMBER_NOT_EDITABLE: 'paymentsCommon.invoiceNumberErrors.notEditable',
  INVOICE_NUMBER_RESERVED: 'paymentsCommon.invoiceNumberErrors.reserved',
};

/**
 * Admin-only: set/override a payment's printed invoice number. On
 * success the whole payments fan-out is invalidated so the new number
 * shows in the history + mine lists and any open invoice preview — and
 * the invoices desk too: the API renames the payment's automatic invoice
 * in the same transaction.
 */
export function useUpdateInvoiceNumber(): UseMutationResult<
  { id: string; invoiceNumber: string | null },
  Error,
  { paymentId: string; invoiceNumber: string }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ paymentId, invoiceNumber }) =>
      invoicesService.updateInvoiceNumber(paymentId, invoiceNumber),
    onSuccess: () => {
      invalidatePaymentViews(queryClient);
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.success(t('toasts.payments.invoiceNumberUpdated'));
    },
    onError: (error, { invoiceNumber }) => {
      // The API writes its refusals in English: a known one gets the
      // dashboard's own words, anything else keeps the server's.
      const { errorCode } = extractApiError(error);
      const key = errorCode ? INVOICE_NUMBER_ERRORS[errorCode] : undefined;
      toast.error(
        key ? t(key, { number: invoiceNumber.trim() }) : extractApiErrorMessage(error),
      );
    },
  });
}

/**
 * ClicToPay resolves the `MOBILE` page view to `mobile_payment.html`, a template
 * their production servers do not serve — customers on a narrow screen landed on
 * a 404. The desktop page is responsive, so every session asks for it.
 */
const HOSTED_PAGE_VIEW = 'DESKTOP' as const;

/** Who starts the card payment: the words of its refusals follow. */
export interface CardPaymentOptions {
  /** 'doctor' (default): the practitioner pays; 'admin': for him. */
  audience?: RefusalAudience;
}

/**
 * Start a ClicToPay card payment of an installment. Refusals are toasted:
 * a retenue that no longer applies and « a transfer awaits the admin »
 * (409 PAYMENT_ATTEMPT_IN_PROGRESS, the only reason a card start is
 * refused for another payment in flight) in the user's language; any
 * other one in the server's words.
 */
export function usePayByCard({ audience = 'doctor' }: CardPaymentOptions = {}): UseMutationResult<
  HostedPaymentSession,
  Error,
  {
    quotationId: string;
    installmentId: string;
    idempotencyKey: string;
    orderId: string;
    language?: 'fr' | 'en' | 'ar';
    applyWithholding?: boolean;
  }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ orderId, installmentId, idempotencyKey, language, applyWithholding }) =>
      paymentsService.createClicToPaySession({
        orderId,
        installmentId,
        idempotencyKey,
        purpose: PaymentPurpose.INSTALLMENT,
        language,
        pageView: HOSTED_PAGE_VIEW,
        applyWithholding,
      }),
    // The attempt is a payment row from now on ("in progress").
    onSuccess: () => invalidatePaymentViews(queryClient),
    onError: (err, { quotationId, installmentId, orderId }) => {
      if (toastWithholdingRefusal(queryClient, t, err)) return;
      if (isPaymentAttemptInProgress(extractApiError(err).errorCode)) {
        toastInstallmentInFlight(queryClient, t, {
          audience,
          method: 'card',
          quotationId,
          installmentId,
          orderId,
        });
        return;
      }
      toast.error(extractApiErrorMessage(err));
    },
  });
}

/**
 * Start a ClicToPay card payment of a treatment fee; refusals as for
 * `usePayByCard` (409 PAYMENT_ATTEMPT_IN_PROGRESS: the fee's transfer
 * awaits the admin, and the order is read again to show it).
 */
export function useCreateTreatmentFeeCardSession({
  audience = 'doctor',
}: CardPaymentOptions = {}): UseMutationResult<
  HostedPaymentSession,
  Error,
  {
    orderId: string;
    idempotencyKey: string;
    language?: 'fr' | 'en' | 'ar';
    applyWithholding?: boolean;
  }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ orderId, idempotencyKey, language, applyWithholding }) =>
      paymentsService.createClicToPaySession({
        orderId,
        idempotencyKey,
        purpose: PaymentPurpose.TREATMENT_FEE,
        language,
        pageView: HOSTED_PAGE_VIEW,
        applyWithholding,
      }),
    onSuccess: () => invalidatePaymentViews(queryClient),
    onError: (err, { orderId }) => {
      // Fees waived by the welcome gift — nothing to pay.
      if (isWelcomeGiftNothingDue(err)) {
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
        toast.error(t('welcomeGift.errors.nothingDue'));
        return;
      }
      if (toastWithholdingRefusal(queryClient, t, err)) return;
      if (isPaymentAttemptInProgress(extractApiError(err).errorCode)) {
        // The order banner then shows the transfer in flight.
        void queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
        void queryClient.invalidateQueries({ queryKey: orderKeys.history(orderId) });
        invalidatePaymentViews(queryClient);
        toast.error(t(inFlightRefusalKey(audience, inFlightPaymentOf('card', null))), {
          duration: REFUSAL_TOAST_MS,
        });
        return;
      }
      toast.error(extractApiErrorMessage(err));
    },
  });
}

/**
 * Declare a pack-installment bank transfer with its receipt — or replace
 * the receipt of one still awaiting confirmation (`intent: 'replace'`:
 * the server supersedes the old declaration). Failures are NOT toasted:
 * the receipt picker explains them inline, with a retry
 * (lib/payments/receipt-errors.ts). A failure that means the transfer
 * moved on the server refreshes the plan.
 */
export function useDeclareBankTransfer(): UseMutationResult<
  Payment,
  Error,
  {
    quotationId: string;
    installmentId: string;
    bankReference?: string;
    proofFile?: File | Blob | null;
    orderId?: string;
    applyWithholding?: boolean;
    /** One key per declaration intent, reused by its retries. */
    idempotencyKey?: string;
    onUploadProgress?: (fraction: number) => void;
    /** Which success copy to show. */
    intent?: 'declare' | 'replace';
    /** Several declarations in a row ("all remaining"): the caller says it once. */
    silent?: boolean;
  }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({
      quotationId,
      installmentId,
      bankReference,
      proofFile,
      applyWithholding,
      idempotencyKey,
      onUploadProgress,
    }) =>
      paymentsService.declareBankTransfer({
        quotationId,
        installmentId,
        bankReference,
        proofFile,
        applyWithholding,
        idempotencyKey,
        onUploadProgress,
      }),
    onSuccess: (payment, { orderId, intent, silent }) => {
      invalidateAfterPayment(queryClient, payment, orderId);
      if (silent) return;
      toast.success(
        intent === 'replace'
          ? t('transfers.toasts.receiptReplaced')
          : t('toasts.payments.bankTransferDeclared'),
      );
    },
    onError: (err, { quotationId, orderId }) => {
      if (receiptErrorOf(err).refetch) {
        refreshQuotePlan(queryClient, quotationId, orderId);
      }
    },
  });
}

/** The receipt-picker meaning of a failed upload or withdrawal. */
export function receiptErrorOf(error: unknown): ReceiptErrorView {
  const { status, errorCode, kind } = classifyApiError(error);
  return receiptUploadError({ status, errorCode, kind });
}

/** Reload a quote's installments, batches and money, and its order. */
function refreshQuotePlan(
  queryClient: ReturnType<typeof useQueryClient>,
  quotationId: string,
  orderId?: string,
) {
  invalidatePaymentViews(queryClient);
  void queryClient.invalidateQueries({ queryKey: paymentPlanKeys.installments(quotationId) });
  void queryClient.invalidateQueries({ queryKey: paymentPlanKeys.batches(quotationId) });
  void queryClient.invalidateQueries({ queryKey: quotationKeys.detail(quotationId) });
  void queryClient.invalidateQueries({
    queryKey: orderId ? quotationKeys.byOrder(orderId) : quotationKeys.all,
  });
  if (orderId) {
    void queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
    void queryClient.invalidateQueries({ queryKey: orderKeys.history(orderId) });
  }
}

/**
 * Withdraw a pack-installment transfer still awaiting confirmation. The
 * installment is payable again; the receipt stays archived. A transfer
 * the lab processed meanwhile answers 409: say so and show its new state.
 */
export function useWithdrawBankTransfer(): UseMutationResult<
  Payment,
  Error,
  { paymentId: string; quotationId: string; orderId?: string; note?: string }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ paymentId, note }) => paymentsService.withdrawBankTransfer(paymentId, note),
    onSuccess: (payment, { orderId }) => {
      invalidateAfterPayment(queryClient, payment, orderId ?? payment.orderId);
      toast.success(t('transfers.toasts.withdrawn'));
    },
    onError: (err, { quotationId, orderId }) => {
      const view = receiptErrorOf(err);
      if (view.refetch) refreshQuotePlan(queryClient, quotationId, orderId);
      toast.error(
        view.kind === 'server' ? extractApiErrorMessage(err) : t(view.messageKey),
      );
    },
  });
}

/**
 * The doctor's own payment row (GET quotations/:qid/payments/:pid): what a
 * declaration was made with, e.g. its retenue choice, before replacing it.
 */
export function useOwnPayment(
  quotationId: string | null | undefined,
  paymentId: string | null | undefined,
  enabled = true,
): UseQueryResult<Payment, Error> {
  return useQuery({
    queryKey: [...paymentKeys.detail(paymentId ?? ''), 'own', quotationId ?? ''] as const,
    queryFn: () =>
      paymentsService.getOwnPayment({
        quotationId: quotationId ?? '',
        paymentId: paymentId ?? '',
      }),
    enabled: enabled && !!quotationId && !!paymentId,
    staleTime: PAYMENT_STALE_TIME,
  });
}

/** Which receipt to read through the authenticated streams (CONTRACT §2.1 / §2.2). */
export type TransferReceiptSource =
  | { kind: 'installment'; paymentId: string }
  | { kind: 'treatment_fee'; orderId: string };

/**
 * Receipt bytes, kept apart from `paymentKeys.all`: every payment write
 * invalidates that root, and an open receipt must not be downloaded
 * again for it. `version` (the declaration instant) refetches a replaced
 * receipt.
 */
export const transferReceiptKeys = {
  all: ['transfer-receipt'] as const,
  of: (source: TransferReceiptSource, version?: string | null) =>
    [
      ...transferReceiptKeys.all,
      source.kind,
      source.kind === 'installment' ? source.paymentId : source.orderId,
      version ?? null,
    ] as const,
};

/**
 * A transfer receipt's bytes, through the authenticated stream (the
 * uploads folder is private). The owning dentist and admins only; a 404
 * (PROOF_NOT_FOUND) is not retried.
 */
export function useTransferReceipt(
  source: TransferReceiptSource | null,
  options: { enabled?: boolean; version?: string | null } = {},
): UseQueryResult<Blob, ProofReadError> {
  return useQuery<Blob, ProofReadError>({
    queryKey: source
      ? transferReceiptKeys.of(source, options.version)
      : [...transferReceiptKeys.all, 'none'],
    queryFn: () => {
      if (!source) throw new Error('No receipt');
      return source.kind === 'installment'
        ? paymentsService.getPaymentProof(source.paymentId)
        : ordersService.getTreatmentFeeProof(source.orderId);
    },
    enabled: (options.enabled ?? true) && !!source,
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: (count, error) => error.status !== 404 && error.status !== 403 && count < 1,
  });
}

/** How often a screen waiting on the lab's decision looks again. */
export const TRANSFER_REFRESH_MS = 30_000;

/**
 * While a transfer waits on the lab, refresh `queryKeys` every 30 s on a
 * visible tab, so the doctor's panel turns « Payé » or « Refusé » without
 * a reload once an admin decides (the dashboard socket is admins-only).
 * Stops as soon as `active` is false.
 */
export function useRefreshWhileInFlight(
  queryKeys: readonly QueryKey[],
  active: boolean,
  intervalMs: number = TRANSFER_REFRESH_MS,
): void {
  const queryClient = useQueryClient();
  // The keys as a value: a new array literal each render must not restart the timer.
  const signature = JSON.stringify(queryKeys);
  useEffect(() => {
    if (!active) return;
    const keys = JSON.parse(signature) as QueryKey[];
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, queryClient, signature]);
}

/**
 * Admin: record cash or a cheque handed over for an installment. A retenue
 * that no longer applies, and another payment of the installment still
 * open (409 PAYMENT_ATTEMPT_IN_PROGRESS: a transfer to confirm or refuse
 * first, or a card attempt not yet decided, told apart from the plan read
 * afresh), are explained in the admin's language.
 */
export function useRecordCash(): UseMutationResult<
  Payment,
  Error,
  {
    quotationId: string;
    installmentId: string;
    dto: RecordCashPaymentDto;
    orderId?: string;
  }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ quotationId, installmentId, dto }) =>
      paymentsService.recordCash({ quotationId, installmentId, dto }),
    onSuccess: (payment, { orderId }) => {
      invalidateAfterPayment(queryClient, payment, orderId);
      toast.success(t('toasts.payments.cashRecorded'));
    },
    onError: (err, { quotationId, installmentId, orderId, dto }) => {
      if (toastWithholdingRefusal(queryClient, t, err)) return;
      if (isPaymentAttemptInProgress(extractApiError(err).errorCode)) {
        toastInstallmentInFlight(queryClient, t, {
          audience: 'admin',
          method: dto.method === PaymentMethod.CHEQUE ? 'cheque' : 'cash',
          quotationId,
          installmentId,
          orderId,
        });
        return;
      }
      toast.error(extractApiErrorMessage(err));
    },
  });
}
