import type { LegalCompany } from "@/lib/legal/legal-content";

/**
 * Server-side fetch of the PUBLIC legal identity (mentions légales) for
 * the showcase compliance pages. Runs only in React Server Components, so
 * the merchant's real company data (raison sociale, matricule fiscal,
 * adresse, hébergeur, …) is baked into the initial HTML — exactly what
 * the payment provider and search engines need to see.
 *
 * Mirrors the blog fetch helper: hits the unauthenticated
 * `/company-billing-settings/legal-info` route with the built-in `fetch`
 * (no auth header) and fails SOFT — a network error or non-2xx resolves
 * to an all-null company object so the page still renders (every dynamic
 * value shows a localized "à compléter" placeholder).
 *
 * Base URL: `API_INTERNAL_URL` lets a container point server fetches at
 * the in-cluster API; otherwise the public `NEXT_PUBLIC_API_URL`.
 */

const REVALIDATE_SECONDS = 300;

const EMPTY: LegalCompany = {
  companyName: null,
  tradeName: null,
  legalForm: null,
  taxRegistrationNumber: null,
  registreDeCommerce: null,
  address: null,
  city: null,
  country: null,
  phone: null,
  email: null,
  hostingProvider: null,
  hostingProviderUrl: null,
  websiteDomain: null,
  currency: null,
};

function apiBase(): string {
  const base =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000/api";
  return base.replace(/\/$/, "");
}

export async function getLegalCompany(): Promise<LegalCompany> {
  try {
    const res = await fetch(`${apiBase()}/company-billing-settings/legal-info`, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as Partial<LegalCompany> | null;
    return { ...EMPTY, ...(data ?? {}) };
  } catch {
    return EMPTY;
  }
}
