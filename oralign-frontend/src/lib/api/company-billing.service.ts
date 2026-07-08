import apiClient from './client';
import type {
  BankDetails,
  CompanyBillingSettings,
  LegalInfo,
  UpsertCompanyBillingSettingsDto,
} from '@/lib/types';

/**
 * Admin-only API client for the singleton company-billing-settings row.
 * Endpoints are gated server-side; the frontend hides the navigation
 * link from non-admin roles for affordance only — RBAC is enforced by
 * the backend regardless.
 */

/**
 * Doctor-facing projection of the singleton settings row. Read via
 * `/company-billing-settings/public-defaults`, callable by dentist +
 * admin. Includes the bank-transfer details on purpose — they're the
 * money's destination, so payers need them.
 *
 * `bankDetails` is `null` until the admin saves it under
 * /account/billing-settings, and the backend collapses an empty `{}`
 * shape to null so the UI doesn't have to guard for blank strings.
 */
export interface BillingPublicDefaults {
  defaultTreatmentFee: number;
  defaultCurrency: string;
  companyName: string | null;
  companyAddress: string | null;
  companyCity: string | null;
  bankDetails: BankDetails | null;
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

  /**
   * PUBLIC (no-auth) legal identity — powers the compliance pages
   * (mentions légales, qui sommes-nous, conditions de vente,
   * réclamations) and the dashboard help page. Same source of truth the
   * admin manages at /account/billing-settings; every field may be null
   * until it's filled in, so callers render "à compléter" placeholders.
   */
  getLegalInfo: async (): Promise<LegalInfo> => {
    const res = await apiClient.get<LegalInfo>(
      '/company-billing-settings/legal-info',
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

/**
 * Resolve any stored upload path to its public absolute URL, no matter
 * how it was stored:
 *
 *   "/uploads/treatment-fee-proofs/abc.pdf" → http://api/.../uploads/treatment-fee-proofs/abc.pdf
 *   "treatment-fee-proofs/abc.pdf"          → http://api/.../uploads/treatment-fee-proofs/abc.pdf
 *   "http://example.com/x.pdf"              → http://example.com/x.pdf  (already absolute, returned verbatim)
 *
 * Different controllers historically stored paths in different shapes
 * (some with the `/uploads` prefix baked in, others without) — this
 * helper canonicalises all of them so the caller never has to think
 * about it. Returns null when the input is null/empty.
 */
export function resolveUploadUrl(
  relativePath: string | null | undefined,
): string | null {
  if (!relativePath) return null;
  // Already absolute? Pass it through (covers S3 / CDN migrations later).
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  const base =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
  const origin = base.replace(/\/api\/?$/, '');
  // Normalise to "uploads/<rest>" so we can always prefix `${origin}/`.
  const cleaned = relativePath
    .replace(/^\/+/, '')
    .replace(/^uploads\//, '');
  return `${origin}/uploads/${cleaned}`;
}
