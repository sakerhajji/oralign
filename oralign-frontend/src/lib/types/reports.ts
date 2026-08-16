// Reports
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import type { AdminBestPackRow, AdminDashboardKpis, AdminTopDoctorsResponse, AdminTrendsResponse } from './dashboard';

// ==========================================
// REPORTS
// ==========================================

export type ReportExportType = 'revenue' | 'doctors' | 'packs';

export interface ReportSummary {
  generatedAt: string;
  range: { from: string; to: string };
  kpis: AdminDashboardKpis;
  topDoctors: AdminTopDoctorsResponse;
  bestPacks: AdminBestPackRow[];
  trends: AdminTrendsResponse;
}
