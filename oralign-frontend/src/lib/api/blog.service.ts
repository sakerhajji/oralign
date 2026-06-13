import apiClient from './client';
import type {
  Blog,
  BlogDetail,
  BlogFilterParams,
  BlogImage,
  BlogSummary,
  CreateBlogDto,
  MessageResponse,
  PaginatedResponse,
  UpdateBlogDto,
} from '@/lib/types';

/**
 * Turn a backend-stored `/uploads/blog/<file>` (or any other relative
 * `/uploads/...` path the blog DTOs return) into an absolute URL the
 * browser can load directly. Already-absolute http(s) URLs pass
 * through unchanged.
 *
 * Mirrors `resolveSliderMediaUrl`: strip the `/api` suffix off
 * `NEXT_PUBLIC_API_URL` to get the file-serving origin, then prefix.
 *
 * NOTE: API-origin images served this way are NOT run through the
 * Next.js image optimizer — render them with next/image `unoptimized`.
 */
export function resolveBlogMediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
  const apiOrigin = base.replace(/\/api\/?$/, '');
  return `${apiOrigin}${path.startsWith('/') ? '' : '/'}${path}`;
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

  deletePost: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(
      `/admin/blog/${id}`,
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

  /** Public: paginated published posts. */
  listPublished: async (params?: {
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

  /** Public: distinct categories among published posts. */
  listCategories: async (): Promise<string[]> => {
    const response = await apiClient.get<string[]>('/blog/categories');
    return response.data;
  },

  /** Public: a single published post by slug (404 if not published). */
  getPublishedBySlug: async (slug: string): Promise<BlogDetail> => {
    const response = await apiClient.get<BlogDetail>(
      `/blog/${encodeURIComponent(slug)}`,
    );
    return response.data;
  },
};
