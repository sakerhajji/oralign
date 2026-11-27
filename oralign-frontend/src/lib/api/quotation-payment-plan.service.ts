import apiClient from './client';
import type {
  AttachPackToQuotationDto,
  ConfigurePaymentPlanDto,
  QuoteInstallment,
  QuoteStepBatch,
  Quotation,
} from '@/lib/types';

/**
 * Pack-attach + payment-plan + batch-delivery surface for a Quotation.
 * Mirrors `oralign-backend/src/quotations/controllers/quotation-payment-plan.controller.ts`.
 *
 * Plan reads are exposed to doctors + admins; mutations + delivery are
 * admin-only — the backend enforces that, the UI just hides the
 * controls.
 */
export const quotationPaymentPlanService = {
  attachPack: async (
    quotationId: string,
    dto: AttachPackToQuotationDto,
  ): Promise<Quotation> => {
    const res = await apiClient.patch<Quotation>(
      `/quotations/${quotationId}/attach-pack`,
      dto,
    );
    return res.data;
  },

  configurePaymentPlan: async (
    quotationId: string,
    dto: ConfigurePaymentPlanDto,
  ): Promise<Quotation> => {
    const res = await apiClient.put<Quotation>(
      `/quotations/${quotationId}/payment-plan`,
      dto,
    );
    return res.data;
  },

  getInstallments: async (
    quotationId: string,
  ): Promise<QuoteInstallment[]> => {
    const res = await apiClient.get<QuoteInstallment[]>(
      `/quotations/${quotationId}/installments`,
    );
    return res.data;
  },

  getStepBatches: async (
    quotationId: string,
  ): Promise<QuoteStepBatch[]> => {
    const res = await apiClient.get<QuoteStepBatch[]>(
      `/quotations/${quotationId}/step-batches`,
    );
    return res.data;
  },

  /**
   * Mark an unlocked step batch as delivered. Locked batches return
   * 400 — payment must land first.
   */
  deliverBatch: async (
    quotationId: string,
    batchId: string,
  ): Promise<QuoteStepBatch> => {
    const res = await apiClient.post<QuoteStepBatch>(
      `/quotations/${quotationId}/step-batches/${batchId}/deliver`,
      {},
    );
    return res.data;
  },

  /**
   * Admin: release a LOCKED batch by hand, with a reason (spec §3). The
   * installment stays due; a repeat on an unlocked batch returns it as is.
   * 400 UNLOCK_REASON_REQUIRED, 404 BATCH_NOT_FOUND (BATCH_UNLOCK_ERROR).
   */
  unlockBatch: async (
    quotationId: string,
    batchId: string,
    reason: string,
  ): Promise<QuoteStepBatch> => {
    const res = await apiClient.post<QuoteStepBatch>(
      `/quotations/${encodeURIComponent(quotationId)}/step-batches/${encodeURIComponent(batchId)}/unlock`,
      { reason },
    );
    return res.data;
  },
};
