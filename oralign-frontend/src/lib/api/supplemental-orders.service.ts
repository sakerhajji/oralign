import apiClient from './client';
import type {
  MessageResponse,
  ReviewSupplementalOrderDto,
  SupplementalEligibility,
  SupplementalKind,
  SupplementalOrderView,
  UpdateSupplementalOrderDto,
} from '@/lib/types';

/** Header the create endpoint uses to replay a retried creation. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

const parentPath = (parentOrderId: string) => `/orders/${parentOrderId}`;
const requestPath = (requestId: string) =>
  `/orders/supplemental-requests/${requestId}`;

export const supplementalOrdersService = {
  eligibility: async (parentOrderId: string): Promise<SupplementalEligibility> => {
    const response = await apiClient.get<SupplementalEligibility>(
      `${parentPath(parentOrderId)}/supplemental-eligibility`,
    );
    return response.data;
  },

  list: async (parentOrderId: string): Promise<SupplementalOrderView[]> => {
    const response = await apiClient.get<SupplementalOrderView[]>(
      `${parentPath(parentOrderId)}/supplemental-requests`,
    );
    return response.data;
  },

  get: async (requestId: string): Promise<SupplementalOrderView> => {
    const response = await apiClient.get<SupplementalOrderView>(
      requestPath(requestId),
    );
    return response.data;
  },

  create: async (
    parentOrderId: string,
    type: SupplementalKind,
    idempotencyKey: string,
  ): Promise<SupplementalOrderView> => {
    const response = await apiClient.post<SupplementalOrderView>(
      `${parentPath(parentOrderId)}/supplemental-requests`,
      { type },
      { headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } },
    );
    return response.data;
  },

  update: async (
    requestId: string,
    dto: UpdateSupplementalOrderDto,
  ): Promise<SupplementalOrderView> => {
    const response = await apiClient.put<SupplementalOrderView>(
      requestPath(requestId),
      dto,
    );
    return response.data;
  },

  removeDraft: async (requestId: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(
      requestPath(requestId),
    );
    return response.data;
  },

  submit: async (requestId: string): Promise<SupplementalOrderView> => {
    const response = await apiClient.post<SupplementalOrderView>(
      `${requestPath(requestId)}/submit`,
    );
    return response.data;
  },

  review: async (
    requestId: string,
    dto: ReviewSupplementalOrderDto,
  ): Promise<SupplementalOrderView> => {
    const response = await apiClient.post<SupplementalOrderView>(
      `${requestPath(requestId)}/review`,
      dto,
    );
    return response.data;
  },

  convertToReplacement: async (
    requestId: string,
  ): Promise<SupplementalOrderView> => {
    const response = await apiClient.post<SupplementalOrderView>(
      `${requestPath(requestId)}/convert-to-replacement`,
    );
    return response.data;
  },
};
