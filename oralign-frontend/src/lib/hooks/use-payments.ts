'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { paymentsService } from '@/lib/api/payments.service';
import { invoicesService } from '@/lib/api/invoices.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import { paymentPlanKeys } from './use-quotation-payment-plan';
import { quotationKeys } from './use-quotations';
import { orderKeys } from './use-orders';
import type {
  ConfirmPaymentDto,
  PaginatedResponse,
  Payment,
  PaymentFilterDto,
  RecordCashPaymentDto,
  RejectPaymentDto,
} from '@/lib/types';

export const paymentKeys = {
  all: ['payments'] as const,
  pending: (filters: Record<string, unknown>) =>
    [...paymentKeys.all, 'pending', filters] as const,
  history: (filters: Record<string, unknown>) =>
    [...paymentKeys.all, 'history', filters] as const,
  mine: (filters: Record<string, unknown>) =>
    [...paymentKeys.all, 'mine', filters] as const,
  detail: (id: string) => [...paymentKeys.all, 'detail', id] as const,
};

const PAYMENT_STALE_TIME = 10_000;

export function usePendingConfirmations(
  filters: PaymentFilterDto = {},
): UseQueryResult<PaginatedResponse<Payment>, Error> {
  return useQuery({
    queryKey: paymentKeys.pending(filters as Record<string, unknown>),
    queryFn: () => paymentsService.listPendingConfirmations(filters),
    staleTime: PAYMENT_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

/**
 * Admin payment history — every payment in the system. Use this on
 * the `/dashboard/payments/history` page. Refetch policy mirrors the
 * pending queue so an admin who has both tabs open sees them stay in
 * sync as new payments land.
 */
export function useAllPayments(
  filters: PaymentFilterDto = {},
): UseQueryResult<PaginatedResponse<Payment>, Error> {
  return useQuery({
    queryKey: paymentKeys.history(filters as Record<string, unknown>),
    queryFn: () => paymentsService.listAllPayments(filters),
    staleTime: PAYMENT_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

/**
 * Doctor's own payment history — backend automatically scopes by the
 * caller's userId. Admins can call this too and still receive every
 * row (the doctor-scoping branch only triggers for the dentist role).
 */
export function useMyPayments(
  filters: PaymentFilterDto = {},
): UseQueryResult<PaginatedResponse<Payment>, Error> {
  return useQuery({
    queryKey: paymentKeys.mine(filters as Record<string, unknown>),
    queryFn: () => paymentsService.listMyPayments(filters),
    staleTime: PAYMENT_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
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
 * itself, the pending queue, the installments + batches of the quote
 * the payment belongs to, the quote summary, the order summary, and
 * the orders list (because the order status can move on SUCCESS).
 */
function invalidateAfterPayment(
  queryClient: ReturnType<typeof useQueryClient>,
  payment: Payment,
  orderId?: string,
) {
  queryClient.invalidateQueries({ queryKey: paymentKeys.all });
  queryClient.invalidateQueries({
    queryKey: paymentPlanKeys.installments(payment.quotationId),
  });
  queryClient.invalidateQueries({
    queryKey: paymentPlanKeys.batches(payment.quotationId),
  });
  queryClient.invalidateQueries({
    queryKey: quotationKeys.detail(payment.quotationId),
  });
  if (orderId) {
    queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
  }
  queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
}

/**
 * Admin-only: set/override a payment's printed invoice number. On
 * success the whole payments fan-out is invalidated so the new number
 * shows in the history + mine lists and any open invoice preview.
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
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      toast.success(t('toasts.payments.invoiceNumberUpdated'));
    },
    onError: (error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

export function usePayByCard(): UseMutationResult<
  Payment,
  Error,
  {
    quotationId: string;
    installmentId: string;
    idempotencyKey: string;
    orderId?: string;
    mockOutcome?: 'success' | 'failed' | 'pending';
  }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ quotationId, installmentId, idempotencyKey, mockOutcome }) =>
      paymentsService.payByCard({
        quotationId,
        installmentId,
        idempotencyKey,
        mockOutcome,
      }),
    onSuccess: (payment, { orderId }) => {
      invalidateAfterPayment(queryClient, payment, orderId);
      if (payment.status === 'success') {
        toast.success(t('toasts.payments.paymentSuccess'));
      } else if (payment.status === 'pending') {
        toast.info(t('toasts.payments.paymentPending'));
      } else {
        toast.error(t('toasts.payments.paymentFailed'));
      }
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
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
