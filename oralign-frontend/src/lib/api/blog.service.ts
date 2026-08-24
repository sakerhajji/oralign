import apiClient from './client';
export { resolveBlogMediaUrl } from '@/lib/blog-media';
import { BlogAudience } from '@/lib/types';
import type {
  Blog,
  BlogDetail,
  BlogFilterParams,
  BlogImage,
  BlogSummary,
  CreateBlogDto,
  Localized,
  MessageResponse,
  PaginatedResponse,
  UpdateBlogDto,
} from '@/lib/types';

/**
 * Resolve a bilingual `Localized<T>` bag to the value for `lang`,
 * falling back to FR then EN then a typed empty value. The blog API
 * (v2) returns every reader-facing text field as `{ en, fr }`; the
 * dashboard CMS (`useT()` → 'en' | 'fr') and the public showcase
 * (`useShowcaseLang()` → 'fr' | 'en' | 'ar') both pick a language with
 * this helper. AR (showcase-only) has no blog copy of its own, so it
 * resolves through the FR fallback — matching the showcase default.
 *
 * Defensive about partial/legacy shapes: a missing bag, a missing
 * leaf, or even a bare string/array coerces sensibly so a render never
 * throws on half-translated data.
 */
export function pickLocalized<T = string>(
  value: Localized<T> | Partial<Localized<T>> | T | null | undefined,
  lang: string,
): T {
  // Bare value (legacy plain string/array) — return as-is.
  if (value == null) return '' as unknown as T;
  if (typeof value !== 'object' || Array.isArray(value)) {
    return value as T;
  }
  const bag = value as Partial<Localized<T>>;
  const key = lang === 'en' ? 'en' : 'fr';
  return (bag[key as 'en' | 'fr'] ??
    bag.fr ??
    bag.en ??
    ('' as unknown as T)) as T;
}

/**
 * Build the public showcase URL for a post by slug. The public blog is
 * unified: patient- and practitioner-authored posts all live under the
 * single `/blog/<slug>` route. `audience` is accepted for call-site
 * compatibility (the CMS passes the post's audience) but is not part of the
 * URL anymore.
 */
export function blogShowcaseUrl(
  _audience: BlogAudience | string,
  slug: string,
): string {
  return `/blog/${encodeURIComponent(slug)}`;
}

export const blogService = {
  /**
   * Admin paginated list. `paramsSerializer: { indexes: null }` keeps
   * any array filter (none today, but future-proof) as repeated query
   * params without bracket/index suffixes — same fix as the orders
   * service so a stray `seoKeywords[0]=` shape can never 400 the list.
   */
  listPosts: async (
    params?: BlogFilterParams,
  ): Promise<PaginatedResponse<Blog>> => {
    const response = await apiClient.get<PaginatedResponse<Blog>>(
      '/admin/blog',
      {
        params,
        paramsSerializer: { indexes: null },
      },
    );
    return response.data;
  },

  getPostById: async (id: string): Promise<Blog> => {
    const response = await apiClient.get<Blog>(`/admin/blog/${id}`);
    return response.data;
  },

  createPost: async (data: CreateBlogDto): Promise<Blog> => {
    const response = await apiClient.post<Blog>('/admin/blog', data);
    return response.data;
  },

  updatePost: async (id: string, data: UpdateBlogDto): Promise<Blog> => {
    const response = await apiClient.patch<Blog>(`/admin/blog/${id}`, data);
    return response.data;
  },

  // Deletion lifecycle: archive (soft) → restore → permanent.
  deletePost: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(
      `/admin/blog/${id}`,
    );
    return response.data;
  },

  restorePost: async (id: string): Promise<Blog> => {
    const response = await apiClient.patch<Blog>(`/admin/blog/${id}/restore`);
    return response.data;
  },

  /**
   * Purge an archived post for good. The backend refuses a live post
   * (400 NOT_ARCHIVED) and leaves the shared image library untouched.
   */
  permanentDeletePost: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(
      `/admin/blog/${id}/permanent`,
    );
    return response.data;
  },

  publishPost: async (id: string): Promise<Blog> => {
    const response = await apiClient.patch<Blog>(`/admin/blog/${id}/publish`);
    return response.data;
  },

  unpublishPost: async (id: string): Promise<Blog> => {
    const response = await apiClient.patch<Blog>(`/admin/blog/${id}/unpublish`);
    return response.data;
  },

  archivePost: async (id: string): Promise<Blog> => {
    const response = await apiClient.patch<Blog>(`/admin/blog/${id}/archive`);
    return response.data;
  },

  /**
   * Upload a single blog image (multipart, field name `file`). Do NOT
   * set Content-Type manually — axios reads the FormData and emits
   * `multipart/form-data; boundary=...` automatically; forcing the
   * header strips the boundary and the server can't parse the body.
   *
   * `timeout: 0` disables the global axios timeout for THIS request so
   * a large cover image on a slow clinic uplink doesn't trip the
   * default 30 s ceiling. `onProgress` receives a 0–100 percentage.
   */
  uploadImage: async (
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<BlogImage> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<BlogImage>(
      '/admin/blog/images',
      formData,
      {
        timeout: 0,
        onUploadProgress: onProgress
          ? (event) => {
              if (event.total && event.total > 0) {
                onProgress(Math.round((event.loaded * 100) / event.total));
              }
            }
          : undefined,
      },
    );
    return response.data;
  },

  // ── Optional server-side public reads ─────────────────────────────
  // The showcase pages fetch these in server components for metadata +
  // SEO. They hit the PUBLIC `/blog` routes (no auth) through the same
  // axios client. Kept tiny + typed so a server component can import
  // one helper instead of re-deriving the URL.

  /**
   * Public: paginated published posts. `audience` narrows the list to
   * one showcase surface (patient vs practitioner) — the public blog
   * pages always pass it.
   */
  listPublished: async (params?: {
    audience?: BlogAudience;
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
  }): Promise<PaginatedResponse<BlogSummary>> => {
    const response = await apiClient.get<PaginatedResponse<BlogSummary>>(
      '/blog/published',
      { params, paramsSerializer: { indexes: null } },
    );
    return response.data;
  },

  /**
   * Public: distinct categories among published posts. Pass `audience`
   * to scope the list to one showcase surface.
   */
  listCategories: async (audience?: BlogAudience): Promise<string[]> => {
    const response = await apiClient.get<string[]>('/blog/categories', {
      params: audience ? { audience } : undefined,
    });
    return response.data;
  },

  /**
   * Public: a single published post by slug (404 if not published, or
   * if `audience` is provided and the post belongs to the other
   * surface).
   */
  getPublishedBySlug: async (
    slug: string,
    audience?: BlogAudience,
  ): Promise<BlogDetail> => {
    const response = await apiClient.get<BlogDetail>(
      `/blog/${encodeURIComponent(slug)}`,
      { params: audience ? { audience } : undefined },
    );
    return response.data;
  },
};
