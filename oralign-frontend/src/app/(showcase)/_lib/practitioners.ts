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

const EMPTY_DIRECTORY: ListResponse = { data: [], total: 0, page: 1, limit: 100 };

/**
 * The whole public directory.
 *
 * By default it fails SOFT to an empty list: the finder still renders and
 * fetches on its own in the browser, and `next build` never hangs on an API
 * that isn't up.
 *
 * `strict` makes a timeout or a non-OK response throw instead — for a page
 * whose existence depends on the directory (a city page is a 404 when no
 * practitioner is listed there). Caching an empty directory as "no such
 * city" because the API blinked would deindex every city for an hour; a
 * thrown error keeps the previously rendered copy instead.
 */
export async function getPublicPractitioners({ strict = false }: { strict?: boolean } = {}): Promise<ListResponse> {
  try {
    const res = await fetch(`${apiBase()}/dentist-profile/public?limit=100`, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      if (strict) throw new Error(`Practitioner directory: HTTP ${res.status}`);
      return EMPTY_DIRECTORY;
    }
    const body = (await res.json()) as Partial<ListResponse> | null;
    const data = Array.isArray(body?.data) ? (body.data as PublicPractitioner[]) : [];
    return { data, total: body?.total ?? data.length, page: 1, limit: 100 };
  } catch (error) {
    if (strict) throw error;
    return EMPTY_DIRECTORY;
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
