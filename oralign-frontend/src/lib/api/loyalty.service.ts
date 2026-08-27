import apiClient from './client';
import type {
  LoyaltyOverview,
  LoyaltyTier,
  LoyaltyTierInput,
} from '@/lib/types/loyalty';

/** Admin loyalty program endpoints — see LoyaltyController (backend). */
export const loyaltyService = {
  getOverview: async (): Promise<LoyaltyOverview> => {
    const response = await apiClient.get<LoyaltyOverview>(
      '/admin/loyalty/overview',
    );
    return response.data;
  },

  listTiers: async (): Promise<LoyaltyTier[]> => {
    const response = await apiClient.get<LoyaltyTier[]>('/admin/loyalty/tiers');
    return response.data;
  },

  updateTiers: async (tiers: LoyaltyTierInput[]): Promise<LoyaltyTier[]> => {
    const response = await apiClient.put<LoyaltyTier[]>(
      '/admin/loyalty/tiers',
      { tiers },
    );
    return response.data;
  },

  recompute: async (): Promise<{ closed: string }> => {
    const response = await apiClient.post<{ closed: string }>(
      '/admin/loyalty/recompute',
    );
    return response.data;
  },
};
