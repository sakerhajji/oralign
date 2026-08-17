'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { useDebounce } from 'use-debounce';
import {
  ArchiveIcon,
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  ClockIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileTextIcon,
  NewspaperIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SendIcon,
  Trash2Icon,
} from 'lucide-react';

import { useT } from '@/lib/i18n/lang-context';
import type { Lang } from '@/lib/i18n/dict';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  blogShowcaseUrl,
  pickLocalized,
  resolveBlogMediaUrl,
} from '@/lib/api/blog.service';
import {
  useArchiveBlog,
  useBlogPosts,
  useDeleteBlog,
  usePermanentDeleteBlog,
  usePublishBlog,
  useRestoreBlog,
  useUnpublishBlog,
} from '@/lib/hooks/use-blog';
import { PermanentDeleteDialog } from '@/components/shared/permanent-delete-dialog';
import {
  BlogAudience,
  BlogStatus,
  type Blog,
  type BlogFilterParams,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreVertical } from 'lucide-react';
import { BlogEditorDialog } from '@/components/blog/blog-editor-dialog';

const PAGE_SIZE = 20;

/**
 * The trash tab is NOT a status — it maps to `includeDeleted`, which the
 * backend reads as "ONLY soft-deleted rows". Kept distinct from
 * BlogStatus.ARCHIVED, which is a live post that simply isn't published.
 */
const TRASH = 'trash' as const;
type StatusTab = BlogStatus | 'all' | typeof TRASH;

const STATUS_TABS = [
  { key: 'all' as const, labelKey: 'blogAdmin.tabs.all' },
  { key: BlogStatus.DRAFT, labelKey: 'blogAdmin.tabs.draft' },
  { key: BlogStatus.PUBLISHED, labelKey: 'blogAdmin.tabs.published' },
  { key: BlogStatus.ARCHIVED, labelKey: 'blogAdmin.tabs.archived' },
  { key: TRASH, labelKey: 'blogAdmin.tabs.trash' },
] as const;

// v2: audience filter (segmented). 'all' clears the params.audience filter.
const AUDIENCE_TABS = [
  { key: 'all' as const, labelKey: 'blogAdmin.audienceFilter.all' },
  { key: BlogAudience.PATIENT, labelKey: 'blogAdmin.audienceFilter.patient' },
  {
    key: BlogAudience.PRACTITIONER,
    labelKey: 'blogAdmin.audienceFilter.practitioner',
  },
] as const;

const dateLocale = (lang: Lang): Locale | undefined =>
  lang === 'fr' ? frLocale : undefined;
const dateFormat = (lang: Lang) => (lang === 'fr' ? 'd MMM yyyy' : 'MMM d, yyyy');

/**
 * Admin Blog CMS — list, filter, and manage articles. RBAC-gated to
 * admins / super-admins (doctors + designers are redirected). Search is
 * debounced, status tabs scope by lifecycle, a category Select narrows
 * further, and per-row actions cover edit / publish / unpublish /
 * archive / delete (with a confirm dialog). The "New article" button +
 * row Edit both open the wide editor dialog.
 */
export function BlogPageContent() {
  const { t, lang } = useT();
  const { isAdmin, user } = useAuth();
  const router = useRouter();

  // RBAC guard — wait for auth to resolve, then bounce non-admins.
  React.useEffect(() => {
    if (user && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [user, isAdmin, router]);

  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch] = useDebounce(searchInput, 300);
  const [statusTab, setStatusTab] = React.useState<StatusTab>('all');
  const inTrash = statusTab === TRASH;
  const [audienceTab, setAudienceTab] = React.useState<BlogAudience | 'all'>(
    'all',
  );
  const [category, setCategory] = React.useState<string>('all');

  const params = React.useMemo<BlogFilterParams>(() => {
    const next: BlogFilterParams = {
      page,
      limit: PAGE_SIZE,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };
    if (debouncedSearch.trim()) next.search = debouncedSearch.trim();
    if (statusTab === TRASH) next.includeDeleted = true;
    else if (statusTab !== 'all') next.status = statusTab;
    if (audienceTab !== 'all') next.audience = audienceTab;
    if (category !== 'all') next.category = category;
    return next;
  }, [page, debouncedSearch, statusTab, audienceTab, category]);

  const list = useBlogPosts(params);
  const posts = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = list.data?.totalPages ?? 1;

  // Distinct categories across the loaded page — fed into the filter
  // Select. (A dedicated categories endpoint exists but only covers
  // PUBLISHED posts; for the admin CMS we surface whatever is present
  // in the current result set so drafts' categories are filterable too.)
  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of posts) {
      if (p.category) set.add(p.category);
    }
    if (category !== 'all') set.add(category);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [posts, category]);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingPost, setEditingPost] = React.useState<Blog | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<Blog | null>(null);
  const [confirmPurge, setConfirmPurge] = React.useState<Blog | null>(null);

  const publish = usePublishBlog();
  const unpublish = useUnpublishBlog();
  const archive = useArchiveBlog();
  const remove = useDeleteBlog();
  const restore = useRestoreBlog();
  const purge = usePermanentDeleteBlog();

  const openNew = () => {
    setEditingPost(null);
    setEditorOpen(true);
  };
  const openEdit = (post: Blog) => {
    setEditingPost(post);
    setEditorOpen(true);
  };
  // Open the post on the public showcase (audience → route) in a new tab.
  // Works for any status (drafts resolve to a 404 on the public site, but
  // the affordance is always available — primary styling signals when the
  // post is actually live).
  const openOnSite = (post: Blog) => {
    window.open(
      blogShowcaseUrl(post.audience, post.slug),
      '_blank',
      'noopener',
    );
  };

  // Don't render the page chrome for non-admins while the redirect
  // effect runs — avoids a one-frame flash of admin UI.
  if (user && !isAdmin) return null;

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <NewspaperIcon className="size-6 text-muted-foreground" />
            {t('blogAdmin.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('blogAdmin.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => list.refetch()}
            disabled={list.isFetching}
          >
            <RefreshCwIcon
              className={cn('size-4', list.isFetching && 'animate-spin')}
            />
          </Button>
          <Button onClick={openNew} className="gap-2">
            <PlusIcon className="size-4" />
            {t('blogAdmin.newPost')}
          </Button>
        </div>
      </div>

      {/* ── Status + audience tab strips ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Status tabs (lifecycle) */}
        <Tabs
          value={statusTab}
          onValueChange={(v) => {
            setStatusTab(v as StatusTab);
            setPage(1);
          }}
        >
          <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Audience filter (which showcase surface) */}
        <Tabs
          value={audienceTab}
          onValueChange={(v) => {
            setAudienceTab(v as BlogAudience | 'all');
            setPage(1);
          }}
        >
          <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
            {AUDIENCE_TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* ── Toolbar: search + category ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder={t('blogAdmin.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder={t('blogAdmin.fields.category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('blogAdmin.tabs.all')}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Results ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('blogAdmin.title')}</CardTitle>
          <CardDescription>{total}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : list.isError ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <FileTextIcon className="size-8 text-destructive/70" />
              <p className="text-sm text-destructive">{t('blogAdmin.error')}</p>
              <Button variant="outline" size="sm" onClick={() => list.refetch()}>
                {t('ordersPage.tryAgain')}
              </Button>
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <NewspaperIcon className="size-8 opacity-40" />
              <p className="text-sm text-muted-foreground">
                {inTrash
                  ? t('blogAdmin.trash.empty')
                  : debouncedSearch ||
                      statusTab !== 'all' ||
                      audienceTab !== 'all' ||
                      category !== 'all'
                    ? t('blogAdmin.emptyFiltered')
                    : t('blogAdmin.empty')}
              </p>
              {!(
                debouncedSearch ||
                statusTab !== 'all' ||
                audienceTab !== 'all' ||
                category !== 'all'
              ) ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t('blogAdmin.emptyHint')}
                  </p>
                  <Button size="sm" onClick={openNew} className="gap-2">
                    <PlusIcon className="size-4" />
                    {t('blogAdmin.newPost')}
                  </Button>
                </>
              ) : null}
            </div>
          ) : (
            <>
              {/* Desktop / tablet table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('blogAdmin.columns.title')}</TableHead>
                      <TableHead>{t('blogAdmin.columns.audience')}</TableHead>
                      <TableHead>{t('blogAdmin.columns.category')}</TableHead>
                      <TableHead>{t('blogAdmin.columns.status')}</TableHead>
                      <TableHead>{t('blogAdmin.columns.author')}</TableHead>
                      <TableHead className="text-right">
                        {t('blogAdmin.columns.views')}
                      </TableHead>
                      <TableHead>{t('blogAdmin.columns.readingTime')}</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posts.map((post) => (
                      <TableRow key={post.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <CoverThumb post={post} />
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {pickLocalized(post.title, lang)}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                /{post.slug}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <AudienceBadge audience={post.audience} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {post.category ? (
                            <Badge variant="secondary">{post.category}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={post.status} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {post.authorName}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <EyeIcon className="size-3.5" />
                            {post.views}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <ClockIcon className="size-3.5" />
                            {t('blogAdmin.readingTime', {
                              count: pickLocalized<number>(
                                post.readingTime,
                                lang,
                              ),
                            })}
                          </span>
                          <span className="mt-0.5 block text-xs">
                            {format(
                              new Date(post.updatedAt),
                              dateFormat(lang),
                              { locale: dateLocale(lang) },
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            post={post}
                            inTrash={inTrash}
                            onEdit={() => openEdit(post)}
                            onPublish={() => publish.mutate(post.id)}
                            onUnpublish={() => unpublish.mutate(post.id)}
                            onArchive={() => archive.mutate(post.id)}
                            onDelete={() => setConfirmDelete(post)}
                            onRestore={() => restore.mutate(post.id)}
                            onPurge={() => setConfirmPurge(post)}
                            onViewOnSite={() => openOnSite(post)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile stacked cards */}
              <div className="flex flex-col gap-3 p-3 md:hidden">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="rounded-lg border bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <CoverThumb post={post} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {pickLocalized(post.title, lang)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          /{post.slug}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={post.status} />
                          <AudienceBadge audience={post.audience} />
                          {post.category ? (
                            <Badge variant="secondary">{post.category}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <RowActions
                        post={post}
                        inTrash={inTrash}
                        onEdit={() => openEdit(post)}
                        onPublish={() => publish.mutate(post.id)}
                        onUnpublish={() => unpublish.mutate(post.id)}
                        onArchive={() => archive.mutate(post.id)}
                        onDelete={() => setConfirmDelete(post)}
                        onRestore={() => restore.mutate(post.id)}
                        onPurge={() => setConfirmPurge(post)}
                        onViewOnSite={() => openOnSite(post)}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{post.authorName}</span>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <EyeIcon className="size-3.5" />
                          {post.views}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ClockIcon className="size-3.5" />
                          {t('blogAdmin.readingTime', {
                            count: pickLocalized<number>(post.readingTime, lang),
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || list.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {lang === 'fr' ? 'Précédent' : 'Previous'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || list.isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {lang === 'fr' ? 'Suivant' : 'Next'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Editor dialog (create + edit share one surface) ── */}
      <BlogEditorDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        post={editingPost}
      />

      {/* ── Delete confirmation ── */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('blogAdmin.deleteConfirm.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('blogAdmin.deleteConfirm.body')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('blogAdmin.buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDelete) {
                  remove.mutate(confirmDelete.id);
                  setConfirmDelete(null);
                }
              }}
            >
              {t('blogAdmin.deleteConfirm.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Permanent delete (trash only, type-to-confirm) ── */}
      <PermanentDeleteDialog
        open={!!confirmPurge}
        onOpenChange={(o) => !o && setConfirmPurge(null)}
        title={t('blogAdmin.trash.permanentTitle')}
        description={
          confirmPurge
            ? `${pickLocalized(confirmPurge.title, lang)} — ${t('blogAdmin.trash.permanentBody')}`
            : t('blogAdmin.trash.permanentBody')
        }
        confirmLabel={t('blogAdmin.trash.permanentDelete')}
        pending={purge.isPending}
        onConfirm={() => {
          if (!confirmPurge) return;
          purge.mutate(confirmPurge.id, {
            onSuccess: () => setConfirmPurge(null),
          });
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Cover thumbnail

function CoverThumb({ post }: { post: Blog }) {
  const { t, lang } = useT();
  const src = resolveBlogMediaUrl(post.cover?.thumbUrl ?? post.cover?.url ?? null);
  const alt =
    pickLocalized(post.coverImageAlt, lang) || pickLocalized(post.title, lang);
  return (
    <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/40">
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={48}
          height={48}
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        <span className="px-1 text-center text-[9px] leading-tight text-muted-foreground">
          {t('blogAdmin.noCover')}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Status badge

function StatusBadge({ status }: { status: BlogStatus }) {
  const { t } = useT();
  switch (status) {
    case BlogStatus.PUBLISHED:
      return (
        <Badge className="border-emerald-300/60 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          {t('blogAdmin.status.published')}
        </Badge>
      );
    case BlogStatus.ARCHIVED:
      return <Badge variant="outline">{t('blogAdmin.status.archived')}</Badge>;
    case BlogStatus.DRAFT:
    default:
      return <Badge variant="secondary">{t('blogAdmin.status.draft')}</Badge>;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Audience badge

function AudienceBadge({ audience }: { audience: BlogAudience }) {
  const { t } = useT();
  return audience === BlogAudience.PATIENT ? (
    <Badge className="border-sky-300/60 bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
      {t('blogAdmin.audience.options.patient')}
    </Badge>
  ) : (
    <Badge className="border-violet-300/60 bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
      {t('blogAdmin.audience.options.practitioner')}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row-action dropdown — shared by table + mobile cards.

function RowActions({
  post,
  inTrash,
  onEdit,
  onPublish,
  onUnpublish,
  onArchive,
  onDelete,
  onRestore,
  onPurge,
  onViewOnSite,
}: {
  post: Blog;
  inTrash: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onViewOnSite: () => void;
}) {
  const { t } = useT();
  const isPublished = post.status === BlogStatus.PUBLISHED;

  // A trashed post gets exactly two choices: bring it back, or purge it.
  // Editing / publishing a deleted post makes no sense, and the backend
  // rejects a permanent delete outside the trash anyway.
  if (inTrash) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('blogAdmin.columns.actions')}>
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={onRestore} className="gap-2">
            <ArrowUpFromLineIcon className="size-4" />
            {t('blogAdmin.trash.restore')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onPurge}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2Icon className="size-4" />
            {t('blogAdmin.trash.permanentDelete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('blogAdmin.columns.actions')}>
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {/* View on site — always enabled, visually primary when live. */}
        <DropdownMenuItem
          onClick={onViewOnSite}
          className={cn(
            'gap-2',
            isPublished && 'text-primary focus:text-primary',
          )}
        >
          <ExternalLinkIcon className="size-4" />
          {t('blogAdmin.viewOnSite.label')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onEdit} className="gap-2">
          <PencilIcon className="size-4" />
          {t('blogAdmin.buttons.edit')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {post.status === BlogStatus.PUBLISHED ? (
          <DropdownMenuItem onClick={onUnpublish} className="gap-2">
            <ArrowDownToLineIcon className="size-4" />
            {t('blogAdmin.buttons.unpublish')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onPublish} className="gap-2">
            <SendIcon className="size-4" />
            {t('blogAdmin.buttons.publish')}
          </DropdownMenuItem>
        )}
        {post.status !== BlogStatus.ARCHIVED ? (
          <DropdownMenuItem onClick={onArchive} className="gap-2">
            <ArchiveIcon className="size-4" />
            {t('blogAdmin.buttons.archive')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onPublish} className="gap-2">
            <ArrowUpFromLineIcon className="size-4" />
            {t('blogAdmin.buttons.publish')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2Icon className="size-4" />
          {t('blogAdmin.buttons.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
