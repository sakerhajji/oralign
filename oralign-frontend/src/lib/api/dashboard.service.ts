import apiClient from './client';
import type {
  AdminBestPackRow,
  AdminDashboardKpis,
  AdminTopDoctorsResponse,
  AdminTrendsResponse,
  AvailablePack,
  DashboardRange,
  DoctorDashboardKpis,
} from '@/lib/types';

/**
 * Serialise the range filter. Backend DTO parses ISO strings via
 * class-transformer; we send them as `from` / `to` query params and
 * leave undefined keys out so the backend falls back to defaults.
 */
function serialiseRange(
  range?: DashboardRange & { limit?: number },
): Record<string, unknown> {
  if (!range) return {};
  const out: Record<string, unknown> = {};
  if (range.from) out.from = range.from;
  if (range.to) out.to = range.to;
  if (range.limit) out.limit = range.limit;
  return out;
}

export const adminDashboardService = {
  async kpis(range?: DashboardRange): Promise<AdminDashboardKpis> {
    const res = await apiClient.get<AdminDashboardKpis>('/admin/dashboard/kpis', {
      params: serialiseRange(range),
    });
    return res.data;
  },
  async topDoctors(
    range?: DashboardRange & { limit?: number },
  ): Promise<AdminTopDoctorsResponse> {
    const res = await apiClient.get<AdminTopDoctorsResponse>(
      '/admin/dashboard/top-doctors',
      { params: serialiseRange(range) },
    );
    return res.data;
  },
  async bestPacks(
    range?: DashboardRange & { limit?: number },
  ): Promise<AdminBestPackRow[]> {
    const res = await apiClient.get<AdminBestPackRow[]>(
      '/admin/dashboard/best-packs',
      { params: serialiseRange(range) },
    );
    return res.data;
  },
  async trends(range?: DashboardRange): Promise<AdminTrendsResponse> {
    const res = await apiClient.get<AdminTrendsResponse>(
      '/admin/dashboard/trends',
      { params: serialiseRange(range) },
    );
    return res.data;
  },
};

export const doctorDashboardService = {
  async kpis(): Promise<DoctorDashboardKpis> {
    const res = await apiClient.get<DoctorDashboardKpis>('/doctor/dashboard/kpis');
    return res.data;
  },
  async availablePacks(): Promise<AvailablePack[]> {
    const res = await apiClient.get<AvailablePack[]>(
      '/doctor/dashboard/available-packs',
    );
    return res.data;
  },
};
