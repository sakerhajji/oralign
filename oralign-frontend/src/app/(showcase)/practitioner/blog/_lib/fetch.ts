import type {
  BlogAudience,
  BlogDetail,
  BlogSummary,
  PaginatedResponse,
} from "@/lib/types";

/**
 * Server-side blog fetch helpers for the PUBLIC showcase blog — SHARED
 * across both audiences (patient + practitioner). The audience is always
 * passed in by the caller so this module stays surface-agnostic; it lives
 * under `practitioner/blog/_lib` for historical reasons but both audiences'
 * pages import it (a cross-route-group import is fine in the app router).
 *
 * These run only in React Server Components — never import the authed
 * axios `apiClient` here. We hit the public `/blog/...` routes with the
 * built-in `fetch`, so there's no auth header and Next can cache + revalidate
 * the responses (`{ next: { revalidate: 60 } }`).
 *
 * Base URL resolution:
 *   - In the browser bundle (not used here) `NEXT_PUBLIC_API_URL` points at
 *     the publicly reachable API origin.
 *   - Inside a server / container context the public hostname may not be
 *     resolvable, so an optional `API_INTERNAL_URL` lets deployments point
 *     server fetches at the in-cluster API (e.g. `http://backend:3000/api`).
 *
 * Every helper fails SOFT: a non-2xx response, a network error, or malformed
 * JSON resolves to an empty list / `null` so a flaky API never crashes the
 * page render (the UI shows its empty / not-found state instead).
 */

const REVALIDATE_SECONDS = 60;

/** Resolve the API base, honoring an internal override for server fetches. */
function apiBase(): string {
  const base =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000/api";
  // Normalize a trailing slash so we can always join with `${base}/blog/...`.
  return base.replace(/\/$/, "");
}

/** Build a `/blog/...` URL with any defined query params appended. */
function blogUrl(
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const url = new URL(`${apiBase()}/blog${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/** Shared fetch wrapper — typed JSON on 2xx, `null` on any failure. */
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type PublishedPostsResult = {
  posts: BlogSummary[];
  total: number;
  page: number;
  limit: number;
};

/**
 * First (or nth) page of published posts for one audience, newest first.
 * Returns an empty result on any failure so the caller can render its
 * empty state. `audience` narrows the list to the patient or practitioner
 * surface; it's always supplied by the page.
 */
export async function getPublishedPosts(params?: {
  audience?: BlogAudience;
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
}): Promise<PublishedPostsResult> {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 12;
  const data = await fetchJson<PaginatedResponse<BlogSummary>>(
    blogUrl("/published", {
      audience: params?.audience,
      page,
      limit,
      search: params?.search,
      category: params?.category,
    }),
  );
  if (!data || !Array.isArray(data.data)) {
    return { posts: [], total: 0, page, limit };
  }
  return {
    posts: data.data,
    total: data.total ?? data.data.length,
    page: data.page ?? page,
    limit: data.limit ?? limit,
  };
}

/**
 * Distinct categories among published posts of one audience. Empty array
 * on failure.
 */
export async function getCategories(
  audience?: BlogAudience,
): Promise<string[]> {
  const data = await fetchJson<string[]>(blogUrl("/categories", { audience }));
  return Array.isArray(data) ? data : [];
}

/**
 * A single published post by slug, scoped to an audience. `null` when the
 * post is missing, unpublished, soft-deleted, of the OTHER audience, or
 * the API is unreachable — the page maps that to `notFound()`.
 */
export async function getPostBySlug(
  slug: string,
  audience?: BlogAudience,
): Promise<BlogDetail | null> {
  if (!slug) return null;
  return fetchJson<BlogDetail>(
    blogUrl(`/${encodeURIComponent(slug)}`, { audience }),
  );
}

/**
 * Fire-and-forget public view-count increment. Plain POST with the
 * built-in `fetch` (no auth, no apiClient) — the article body already
 * rendered, so a failure here is silently ignored. Called once per
 * mount from the client `<BlogArticle>`.
 */
export async function recordView(slug: string): Promise<void> {
  if (!slug) return;
  try {
    await fetch(blogUrl(`/${encodeURIComponent(slug)}/view`), {
      method: "POST",
      headers: { Accept: "application/json" },
      // Never cache a mutation; this is a best-effort counter bump.
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    // Swallow — the view counter is non-critical telemetry.
  }
}
