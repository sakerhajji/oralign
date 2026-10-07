import type { ListResponse, PractitionerDetail, PublicPractitioner } from "./finder";

/**
 * Server-side reads of the public practitioner directory — the same
 * unauthenticated endpoints the client finder calls, fetched during
 * rendering so the network is in the HTML crawlers receive. The finder used
 * to be the only reader, and it runs in the browser: search engines saw an
 * empty directory.
 *
 * Base URL: `API_INTERNAL_URL` lets a container reach the in-cluster API;
 * otherwise the public `NEXT_PUBLIC_API_URL` (same rule as legal-info.ts).
 */

const REVALIDATE_SECONDS = 3600;
const TIMEOUT_MS = 5000;

function apiBase(): string {
  const base =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000/api";
  return base.replace(/\/$/, "");
}

/**
 * The whole public directory. Fails SOFT to an empty list: the finder still
 * renders and fetches on its own in the browser, and `next build` never hangs
 * on an API that isn't up.
 */
export async function getPublicPractitioners(): Promise<ListResponse> {
  try {
    const res = await fetch(`${apiBase()}/dentist-profile/public?limit=100`, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { data: [], total: 0, page: 1, limit: 100 };
    const body = (await res.json()) as Partial<ListResponse> | null;
    const data = Array.isArray(body?.data) ? (body.data as PublicPractitioner[]) : [];
    return { data, total: body?.total ?? data.length, page: 1, limit: 100 };
  } catch {
    return { data: [], total: 0, page: 1, limit: 100 };
  }
}

/**
 * One profile with its opening hours.
 *
 * Only a definite 404 resolves to null. Any other failure throws on purpose:
 * caching a "not found" for a practitioner who exists — just because the API
 * blinked — would deindex a real page for an hour.
 */
export async function getPublicPractitioner(id: string): Promise<PractitionerDetail | null> {
  const res = await fetch(`${apiBase()}/dentist-profile/public/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Practitioner ${id}: HTTP ${res.status}`);
  return (await res.json()) as PractitionerDetail;
}
