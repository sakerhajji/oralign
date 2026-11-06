'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { paymentsService, type PaymentsReportFile } from '@/lib/api/payments.service';
import { invoicesService } from '@/lib/api/invoices.service';
import { extractApiError, extractApiErrorMessage } from '@/lib/api/error';
import { isWelcomeGiftNothingDue } from '@/lib/api/welcome-gift.service';
import { useT } from '@/lib/i18n/lang-context';
import { paymentPlanKeys } from './use-quotation-payment-plan';
import { quotationKeys } from './use-quotations';
import { orderKeys } from './use-orders';
import { invoiceKeys } from './use-admin-invoices';
import { invalidatePaymentViews, paymentKeys } from './payment-keys';
import { PaymentPurpose } from '@/lib/types';
import type {
  ConfirmPaymentDto,
  HostedPaymentSession,
  PaginatedResponse,
  Payment,
  PaymentFilterDto,
  PaymentListItem,
  PaymentPractitioner,
  PaymentsReportRequest,
  PaymentsSummary,
  PaymentsSummaryParams,
  RecordCashPaymentDto,
  RejectPaymentDto,
} from '@/lib/types';

export { paymentKeys } from './payment-keys';

const PAYMENT_STALE_TIME = 10_000;

/**
 * Options of the payments desk's live queries. `refetchInterval` keeps a
 * view that covers today current while it stays open (React Query pauses
 * it in a background tab).
 */
export interface LiveQueryOptions {
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function usePendingConfirmations(
  filters: PaymentFilterDto = {},
): UseQueryResult<PaginatedResponse<PaymentListItem>, Error> {
  return useQuery({
    queryKey: paymentKeys.pending(filters as Record<string, unknown>),
    queryFn: () => paymentsService.listPendingConfirmations(filters),
    staleTime: PAYMENT_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
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
 * summary, the order summary, and the orders list (because the order
 * status can move on SUCCESS).
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

export function usePayByCard(): UseMutationResult<
  HostedPaymentSession,
  Error,
  {
    quotationId: string;
    installmentId: string;
    idempotencyKey: string;
    orderId: string;
    language?: 'fr' | 'en' | 'ar';
  }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, installmentId, idempotencyKey, language }) =>
      paymentsService.createClicToPaySession({
        orderId,
        installmentId,
        idempotencyKey,
        purpose: PaymentPurpose.INSTALLMENT,
        language,
        pageView: HOSTED_PAGE_VIEW,
      }),
    // The attempt is a payment row from now on ("in progress").
    onSuccess: () => invalidatePaymentViews(queryClient),
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useCreateTreatmentFeeCardSession(): UseMutationResult<
  HostedPaymentSession,
  Error,
  { orderId: string; idempotencyKey: string; language?: 'fr' | 'en' | 'ar' }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ orderId, idempotencyKey, language }) =>
      paymentsService.createClicToPaySession({
        orderId,
        idempotencyKey,
        purpose: PaymentPurpose.TREATMENT_FEE,
        language,
        pageView: HOSTED_PAGE_VIEW,
      }),
    onSuccess: () => invalidatePaymentViews(queryClient),
    onError: (err, { orderId }) => {
      // Fees waived by the welcome gift — nothing to pay.
      if (isWelcomeGiftNothingDue(err)) {
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
        toast.error(t('welcomeGift.errors.nothingDue'));
        return;
      }
      toast.error(extractApiErrorMessage(err));
    },
  });
}

export function useDeclareBankTransfer(): UseMutationResult<
  Payment,
  Error,
  {
    quotationId: string;
    installmentId: string;
    bankReference?: string;
    proofFile?: File | Blob | null;
    orderId?: string;
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
    }) =>
      paymentsService.declareBankTransfer({
        quotationId,
        installmentId,
        bankReference,
        proofFile,
      }),
    onSuccess: (payment, { orderId }) => {
      invalidateAfterPayment(queryClient, payment, orderId);
      toast.success(t('toasts.payments.bankTransferDeclared'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useConfirmBankTransfer(): UseMutationResult<
  Payment,
  Error,
  { paymentId: string; dto: ConfirmPaymentDto; orderId?: string }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ paymentId, dto }) =>
      paymentsService.confirmBankTransfer(paymentId, dto),
    onSuccess: (payment, { orderId }) => {
      invalidateAfterPayment(queryClient, payment, orderId);
      toast.success(t('toasts.payments.bankTransferConfirmed'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useRejectBankTransfer(): UseMutationResult<
  Payment,
  Error,
  { paymentId: string; dto: RejectPaymentDto; orderId?: string }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ paymentId, dto }) =>
      paymentsService.rejectBankTransfer(paymentId, dto),
    onSuccess: (payment, { orderId }) => {
      invalidateAfterPayment(queryClient, payment, orderId);
      toast.success(t('toasts.payments.bankTransferRejected'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

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
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
