import apiClient from './client';
import type {
  CreatePackDto,
  CreatePackPriceDto,
  Pack,
  PackPrice,
  PaginatedResponse,
  UpdatePackDto,
  UpdatePackPriceDto,
} from '@/lib/types';

/**
 * Pack catalogue admin API. Every endpoint is admin-only on the
 * backend (RolesGuard with admin / super_admin). The doctor-visible
 * pack details are surfaced via the quotation snapshot, not directly,
 * so there is no doctor-facing pack endpoint.
 *
 * `list` returns the canonical `PaginatedResponse<Pack>` envelope —
 * not a raw array — so consumers must read `.data` to get the rows.
 * Mirrors the orders / users / patients services for consistency.
 */
export const packsService = {
  list: async (params?: {
    includeInactive?: boolean;
    forOrthodontists?: boolean;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<PaginatedResponse<Pack>> => {
    const res = await apiClient.get<PaginatedResponse<Pack>>('/admin/packs', {
      params,
    });
    return res.data;
  },

  /**
   * Public catalogue — backs the marketing showcase. No auth header
   * is required (the backend serves it via `@Public()`), so this is
   * safe to call from server components or unauthenticated browsers.
   * Returns only active, non-deleted packs with their active prices.
   */
  listPublic: async (): Promise<Pack[]> => {
    const res = await apiClient.get<Pack[]>('/packs/public');
    return res.data;
  },

  get: async (id: string): Promise<Pack> => {
    const res = await apiClient.get<Pack>(`/admin/packs/${id}`);
    return res.data;
  },

  create: async (dto: CreatePackDto): Promise<Pack> => {
    const res = await apiClient.post<Pack>('/admin/packs', dto);
    return res.data;
  },

  update: async (id: string, dto: UpdatePackDto): Promise<Pack> => {
    const res = await apiClient.patch<Pack>(`/admin/packs/${id}`, dto);
    return res.data;
  },

  /** Soft-delete — also marks isActive=false. */
  remove: async (id: string): Promise<{ id: string; deleted: true }> => {
    const res = await apiClient.delete<{ id: string; deleted: true }>(
      `/admin/packs/${id}`,
    );
    return res.data;
  },

  /** Permanent (hard) delete — admin-only, irreversible. */
  permanentRemove: async (id: string): Promise<{ id: string }> => {
    const res = await apiClient.delete<{ id: string }>(
      `/admin/packs/${id}/permanent`,
    );
    return res.data;
  },

  activate: async (id: string): Promise<Pack> => {
    const res = await apiClient.patch<Pack>(`/admin/packs/${id}/activate`, {});
    return res.data;
  },

  deactivate: async (id: string): Promise<Pack> => {
    const res = await apiClient.patch<Pack>(
      `/admin/packs/${id}/deactivate`,
      {},
    );
    return res.data;
  },

  // ─── Prices (per pack, per archType) ───────────────────────────────
  // Adding an active price for a (pack, archType) pair atomically
  // archives any previously-active price. Quotations always snapshot
  // the price that was active at attach-time, so changes are safe.

  addPrice: async (
    packId: string,
    dto: CreatePackPriceDto,
  ): Promise<PackPrice> => {
    const res = await apiClient.post<PackPrice>(
      `/admin/packs/${packId}/prices`,
      dto,
    );
    return res.data;
  },

  updatePrice: async (
    packId: string,
    priceId: string,
    dto: UpdatePackPriceDto,
  ): Promise<PackPrice> => {
    const res = await apiClient.patch<PackPrice>(
      `/admin/packs/${packId}/prices/${priceId}`,
      dto,
    );
    return res.data;
  },

  archivePrice: async (
    packId: string,
    priceId: string,
  ): Promise<PackPrice> => {
    const res = await apiClient.delete<PackPrice>(
      `/admin/packs/${packId}/prices/${priceId}`,
    );
    return res.data;
  },
};
