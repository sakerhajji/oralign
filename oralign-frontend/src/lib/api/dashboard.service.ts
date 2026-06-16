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

/** Lightweight attention counts for the admin sidebar badges. */
export interface AdminSidebarBadges {
  /** Orders a doctor submitted that the admin hasn't triaged yet. */
  newOrders: number;
  /** Dentists awaiting admin approval (verificationStatus = pending). */
  pendingApprovals: number;
}

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
  async sidebarBadges(): Promise<AdminSidebarBadges> {
    const res = await apiClient.get<AdminSidebarBadges>(
      '/admin/dashboard/sidebar-badges',
    );
    return res.data;
  },
};

/**
 * Per-order breakdown of the doctor's outstanding balance. Powers the
 * KPI popup on the doctor dashboard. Shape is dictated by
 * `DoctorDashboardService.listOutstandingOrders` on the backend.
 */
export interface DoctorOutstandingOrder {
  orderId: string;
  orderCode: string;
  patientName: string | null;
  packName: string | null;
  totalPrice: number;
  paidAmount: number;
  remaining: number;
  currency: string;
  paymentStatus: 'pending' | 'partially_paid';
  updatedAt: string;
}

export interface DoctorOutstandingOrdersResponse {
  /** Sum of `remaining` across every row. */
  totalOutstanding: number;
  /** Row count (capped at 100 server-side). */
  count: number;
  currency: string;
  data: DoctorOutstandingOrder[];
}

/**
 * Same row shape as the outstanding-orders endpoint — paid orders
 * always have `remaining: 0`. Kept as a separate type so a future
 * paid-order-specific field doesn't bleed into the outstanding type.
 */
export interface DoctorPaidOrdersResponse {
  /** Sum of `paidAmount` across every row — total collected revenue. */
  totalCollected: number;
  /** Row count (capped at 100 server-side). */
  count: number;
  currency: string;
  data: DoctorOutstandingOrder[];
}

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
  async outstandingOrders(): Promise<DoctorOutstandingOrdersResponse> {
    const res = await apiClient.get<DoctorOutstandingOrdersResponse>(
      '/doctor/dashboard/outstanding-orders',
    );
    return res.data;
  },
  async paidOrders(): Promise<DoctorPaidOrdersResponse> {
    const res = await apiClient.get<DoctorPaidOrdersResponse>(
      '/doctor/dashboard/paid-orders',
    );
    return res.data;
  },
};
