import apiClient from './client';
import type {
  AlignerDeliverySummary,
  RecordAlignerDeliveryInput,
} from '@/lib/types/aligner-delivery';

/** Aligner delivery endpoints — see AlignerDeliveryController (backend). */
export const alignerDeliveriesService = {
  getSummary: async (orderId: string): Promise<AlignerDeliverySummary> => {
    const response = await apiClient.get<AlignerDeliverySummary>(
      `/orders/${orderId}/aligner-deliveries`,
    );
    return response.data;
  },

  record: async (
    orderId: string,
    input: RecordAlignerDeliveryInput,
  ): Promise<AlignerDeliverySummary> => {
    const response = await apiClient.post<AlignerDeliverySummary>(
      `/orders/${orderId}/aligner-deliveries`,
      input,
    );
    return response.data;
  },

  setTotal: async (
    orderId: string,
    totalAligners: number,
  ): Promise<AlignerDeliverySummary> => {
    const response = await apiClient.patch<AlignerDeliverySummary>(
      `/orders/${orderId}/aligner-deliveries/total`,
      { totalAligners },
    );
    return response.data;
  },
};
