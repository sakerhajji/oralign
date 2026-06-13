'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { blogService } from '@/lib/api/blog.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import type {
  Blog,
  BlogFilterParams,
  BlogImage,
  CreateBlogDto,
  MessageResponse,
  PaginatedResponse,
  UpdateBlogDto,
} from '@/lib/types';

const BLOG_LIST_STALE_TIME = 15_000;
const BLOG_DETAIL_STALE_TIME = 10_000;

export const blogKeys = {
  all: ['blog'] as const,
  lists: () => [...blogKeys.all, 'list'] as const,
  list: (params?: BlogFilterParams) => [...blogKeys.lists(), params] as const,
  details: () => [...blogKeys.all, 'detail'] as const,
  detail: (id: string) => [...blogKeys.details(), id] as const,
};

/**
 * Bust every blog cache (lists + details) in one shot. Mirrors the
 * `invalidateAll` style use-slider-media uses — a single key-prefix
 * invalidation covers the whole table + any open editor.
 */
function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: blogKeys.all });
}

/**
 * Admin blog list. `params` is the full `BlogFilterParams` — including
 * the v2 `audience` filter (patient | practitioner) and `status` — and
 * `blogKeys.list(params)` keys on the whole object, so adding an
 * audience/status filter refetches + caches independently with no
 * extra wiring. Public reads + the view beacon are handled by the
 * showcase pages directly (plain fetch), not through these hooks.
 */
export function useBlogPosts(
  params?: BlogFilterParams,
): UseQueryResult<PaginatedResponse<Blog>, Error> {
  return useQuery({
    queryKey: blogKeys.list(params),
    queryFn: () => blogService.listPosts(params),
    staleTime: BLOG_LIST_STALE_TIME,
    // Keep the previous page on screen while the next page / new
    // filter loads — no spinner flash on pagination + tab switches.
    placeholderData: (previousData) => previousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });
}

export function useBlogPost(id?: string): UseQueryResult<Blog, Error> {
  return useQuery({
    queryKey: blogKeys.detail(id ?? ''),
    queryFn: () => blogService.getPostById(id ?? ''),
    enabled: !!id,
    staleTime: BLOG_DETAIL_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });
}

export function useCreateBlog(): UseMutationResult<Blog, Error, CreateBlogDto> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (data) => blogService.createPost(data),
    onSuccess: (post) => {
      queryClient.setQueryData(blogKeys.detail(post.id), post);
      queryClient.invalidateQueries({ queryKey: blogKeys.lists() });
      toast.success(t('toasts.blog.created'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useUpdateBlog(): UseMutationResult<
  Blog,
  Error,
  { id: string; data: UpdateBlogDto }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, data }) => blogService.updatePost(id, data),
    onSuccess: (post) => {
      queryClient.setQueryData(blogKeys.detail(post.id), post);
      queryClient.invalidateQueries({ queryKey: blogKeys.lists() });
      queryClient.invalidateQueries({ queryKey: blogKeys.detail(post.id) });
      toast.success(t('toasts.blog.updated'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useDeleteBlog(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => blogService.deletePost(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: blogKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: blogKeys.lists() });
      toast.success(t('toasts.blog.deleted'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function usePublishBlog(): UseMutationResult<Blog, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => blogService.publishPost(id),
    onSuccess: (post) => {
      queryClient.setQueryData(blogKeys.detail(post.id), post);
      invalidateAll(queryClient);
      toast.success(t('toasts.blog.published'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useUnpublishBlog(): UseMutationResult<Blog, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => blogService.unpublishPost(id),
    onSuccess: (post) => {
      queryClient.setQueryData(blogKeys.detail(post.id), post);
      invalidateAll(queryClient);
      toast.success(t('toasts.blog.unpublished'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useArchiveBlog(): UseMutationResult<Blog, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => blogService.archivePost(id),
    onSuccess: (post) => {
      queryClient.setQueryData(blogKeys.detail(post.id), post);
      invalidateAll(queryClient);
      toast.success(t('toasts.blog.archived'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useUploadBlogImage(): UseMutationResult<
  BlogImage,
  Error,
  { file: File; onProgress?: (percent: number) => void }
> {
  const { t } = useT();
  return useMutation({
    mutationFn: ({ file, onProgress }) =>
      blogService.uploadImage(file, onProgress),
    onSuccess: () => {
      // Images aren't a list query — nothing to invalidate. The block
      // builder reads the returned BlogImage straight off the result.
      toast.success(t('toasts.blog.imageUploaded'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
