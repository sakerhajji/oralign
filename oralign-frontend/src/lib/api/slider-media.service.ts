import apiClient from './client';
import type {
  CreateSliderMediaInput,
  PaginatedResponse,
  SliderMedia,
  SliderMediaDeviceTarget,
  SliderMediaFilters,
  UpdateSliderMediaInput,
} from '@/lib/types';

/**
 * Turn a backend-stored `/uploads/slider/<file>` into an absolute URL
 * the browser can load directly. Already-absolute URLs (https://…)
 * pass through unchanged.
 */
export function resolveSliderMediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
  const apiOrigin = base.replace(/\/api\/?$/, '');
  return `${apiOrigin}${path.startsWith('/') ? '' : '/'}${path}`;
}

function buildFormData(input: CreateSliderMediaInput | UpdateSliderMediaInput) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    if (k === 'desktopFile' || k === 'mobileFile') continue;
    if (Array.isArray(v)) {
      fd.append(k, v.join(','));
    } else {
      fd.append(k, String(v));
    }
  }
  const desktopFile = (input as CreateSliderMediaInput).desktopFile;
  const mobileFile = (input as CreateSliderMediaInput).mobileFile;
  if (desktopFile) fd.append('desktop', desktopFile);
  if (mobileFile) fd.append('mobile', mobileFile);
  return fd;
}

function serialiseFilters(filters: SliderMediaFilters): Record<string, unknown> {
  const params: Record<string, unknown> = { ...filters };
  for (const k of Object.keys(params)) {
    const v = params[k];
    if (v === undefined || v === null || v === '') delete params[k];
  }
  return params;
}

export const sliderMediaService = {
  async listActive(
    device: SliderMediaDeviceTarget,
  ): Promise<{ device: SliderMediaDeviceTarget; data: SliderMedia[] }> {
    const res = await apiClient.get<{
      device: SliderMediaDeviceTarget;
      data: SliderMedia[];
    }>('/slider-media/active', { params: { device } });
    return res.data;
  },

  async listAdmin(
    filters: SliderMediaFilters = {},
  ): Promise<PaginatedResponse<SliderMedia>> {
    const res = await apiClient.get<PaginatedResponse<SliderMedia>>('/slider-media', {
      params: serialiseFilters(filters),
    });
    return res.data;
  },

  async getOne(id: string): Promise<SliderMedia> {
    const res = await apiClient.get<SliderMedia>(`/slider-media/${id}`);
    return res.data;
  },

  async create(input: CreateSliderMediaInput): Promise<SliderMedia> {
    const fd = buildFormData(input);
    const res = await apiClient.post<SliderMedia>('/slider-media', fd);
    return res.data;
  },

  async update(id: string, input: UpdateSliderMediaInput): Promise<SliderMedia> {
    const fd = buildFormData(input);
    const res = await apiClient.patch<SliderMedia>(`/slider-media/${id}`, fd);
    return res.data;
  },

  async activate(id: string): Promise<SliderMedia> {
    const res = await apiClient.patch<SliderMedia>(`/slider-media/${id}/activate`);
    return res.data;
  },

  async deactivate(id: string): Promise<SliderMedia> {
    const res = await apiClient.patch<SliderMedia>(`/slider-media/${id}/deactivate`);
    return res.data;
  },

  async reorder(ids: string[]): Promise<{ updated: number }> {
    const res = await apiClient.post<{ updated: number }>('/slider-media/reorder', { ids });
    return res.data;
  },

  async softDelete(id: string): Promise<{ id: string }> {
    const res = await apiClient.delete<{ id: string }>(`/slider-media/${id}`);
    return res.data;
  },

  async restore(id: string): Promise<SliderMedia> {
    const res = await apiClient.post<SliderMedia>(`/slider-media/${id}/restore`);
    return res.data;
  },
};
