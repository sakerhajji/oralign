import type { BlogDetail, BlogSummary, PaginatedResponse } from "@/lib/types";

/**
 * Server-side blog fetch helpers for the PUBLIC practitioner blog.
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
 * First (or nth) page of published posts, newest first. Returns an empty
 * result on any failure so the caller can render its empty state.
 */
export async function getPublishedPosts(params?: {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
}): Promise<PublishedPostsResult> {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 12;
  const data = await fetchJson<PaginatedResponse<BlogSummary>>(
    blogUrl("/published", {
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

/** Distinct categories among published posts. Empty array on failure. */
export async function getCategories(): Promise<string[]> {
  const data = await fetchJson<string[]>(blogUrl("/categories"));
  return Array.isArray(data) ? data : [];
}

/**
 * A single published post by slug. `null` when the post is missing,
 * unpublished, soft-deleted, or the API is unreachable — the page maps
 * that to `notFound()`.
 */
export async function getPostBySlug(slug: string): Promise<BlogDetail | null> {
  if (!slug) return null;
  return fetchJson<BlogDetail>(blogUrl(`/${encodeURIComponent(slug)}`));
}
