import apiClient from './client';
import type {
  CompanyBillingSettings,
  UpsertCompanyBillingSettingsDto,
} from '@/lib/types';

/**
 * Admin-only API client for the singleton company-billing-settings row.
 * Endpoints are gated server-side; the frontend hides the navigation
 * link from non-admin roles for affordance only — RBAC is enforced by
 * the backend regardless.
 */
export interface BillingPublicDefaults {
  defaultTreatmentFee: number;
  defaultCurrency: string;
}

export const companyBillingService = {
  /** Returns null when the admin hasn't saved anything yet. */
  get: async (): Promise<CompanyBillingSettings | null> => {
    const res = await apiClient.get<CompanyBillingSettings | null>(
      '/admin/company-billing-settings',
    );
    return res.data;
  },

  /**
   * Doctor-safe "public defaults" projection — returns ONLY the
   * treatment fee + currency from the singleton settings row. Hits
   * a different controller (`/company-billing-settings/...`, NOT
   * the admin one above) and is callable by `dentist` + admin roles.
   * Used by the treatment-fee payment dialog so the doctor sees the
   * same amount the admin configured under /account/billing-settings.
   */
  getPublicDefaults: async (): Promise<BillingPublicDefaults> => {
    const res = await apiClient.get<BillingPublicDefaults>(
      '/company-billing-settings/public-defaults',
    );
    return res.data;
  },

  upsert: async (
    dto: UpsertCompanyBillingSettingsDto,
  ): Promise<CompanyBillingSettings> => {
    const res = await apiClient.put<CompanyBillingSettings>(
      '/admin/company-billing-settings',
      dto,
    );
    return res.data;
  },

  uploadLogo: async (file: File): Promise<CompanyBillingSettings> => {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post<CompanyBillingSettings>(
      '/admin/company-billing-settings/logo',
      form,
      // No manual Content-Type — axios sets the boundary itself.
    );
    return res.data;
  },

  deleteLogo: async (): Promise<CompanyBillingSettings | null> => {
    const res = await apiClient.delete<CompanyBillingSettings | null>(
      '/admin/company-billing-settings/logo',
    );
    return res.data;
  },

  /**
   * Resolve a stored relative path (e.g. "company-logos/<uuid>.png") to
   * the absolute URL the browser can fetch. The backend serves uploads
   * under `/uploads/...` via the existing ServeStaticModule.
   */
  resolveLogoUrl: (relativePath: string | null | undefined): string | null => {
    if (!relativePath) return null;
    const base =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    const origin = base.replace(/\/api\/?$/, '');
    const cleaned = relativePath.replace(/^\/+/, '');
    return `${origin}/uploads/${cleaned}`;
  },
};
