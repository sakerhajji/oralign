'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  adminDashboardService,
  doctorDashboardService,
} from '@/lib/api/dashboard.service';
import type {
  AdminBestPackRow,
  AdminDashboardKpis,
  AdminTopDoctorsResponse,
  AdminTrendsResponse,
  AvailablePack,
  DashboardRange,
  DoctorDashboardKpis,
} from '@/lib/types';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  adminKpis: (range?: DashboardRange) =>
    [...dashboardKeys.all, 'admin', 'kpis', range ?? {}] as const,
  adminTopDoctors: (range?: DashboardRange & { limit?: number }) =>
    [...dashboardKeys.all, 'admin', 'top-doctors', range ?? {}] as const,
  adminBestPacks: (range?: DashboardRange & { limit?: number }) =>
    [...dashboardKeys.all, 'admin', 'best-packs', range ?? {}] as const,
  adminTrends: (range?: DashboardRange) =>
    [...dashboardKeys.all, 'admin', 'trends', range ?? {}] as const,
  doctorKpis: () => [...dashboardKeys.all, 'doctor', 'kpis'] as const,
  doctorPacks: () => [...dashboardKeys.all, 'doctor', 'packs'] as const,
};

// 30 s polling fallback. WebSocket invalidation will kick in sooner on
// real-time events; the poll is the safety net for tabs the WS missed.
const POLL_MS = 30_000;

export function useAdminDashboardKpis(
  range?: DashboardRange,
  enabled = true,
): UseQueryResult<AdminDashboardKpis, Error> {
  return useQuery({
    queryKey: dashboardKeys.adminKpis(range),
    queryFn: () => adminDashboardService.kpis(range),
    enabled,
    staleTime: 15_000,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
}

export function useAdminTopDoctors(
  range?: DashboardRange & { limit?: number },
  enabled = true,
): UseQueryResult<AdminTopDoctorsResponse, Error> {
  return useQuery({
    queryKey: dashboardKeys.adminTopDoctors(range),
    queryFn: () => adminDashboardService.topDoctors(range),
    enabled,
    staleTime: 30_000,
    refetchInterval: POLL_MS,
  });
}

export function useAdminBestPacks(
  range?: DashboardRange & { limit?: number },
  enabled = true,
): UseQueryResult<AdminBestPackRow[], Error> {
  return useQuery({
    queryKey: dashboardKeys.adminBestPacks(range),
    queryFn: () => adminDashboardService.bestPacks(range),
    enabled,
    staleTime: 30_000,
    refetchInterval: POLL_MS,
  });
}

export function useAdminTrends(
  range?: DashboardRange,
  enabled = true,
): UseQueryResult<AdminTrendsResponse, Error> {
  return useQuery({
    queryKey: dashboardKeys.adminTrends(range),
    queryFn: () => adminDashboardService.trends(range),
    enabled,
    staleTime: 60_000,
    refetchInterval: POLL_MS,
  });
}

export function useDoctorDashboardKpis(
  enabled = true,
): UseQueryResult<DoctorDashboardKpis, Error> {
  return useQuery({
    queryKey: dashboardKeys.doctorKpis(),
    queryFn: () => doctorDashboardService.kpis(),
    enabled,
    staleTime: 15_000,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
}

export function useDoctorAvailablePacks(
  enabled = true,
): UseQueryResult<AvailablePack[], Error> {
  return useQuery({
    queryKey: dashboardKeys.doctorPacks(),
    queryFn: () => doctorDashboardService.availablePacks(),
    enabled,
    staleTime: 60_000,
  });
}
