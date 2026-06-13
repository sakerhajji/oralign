'use client';

import * as React from 'react';
import Image from 'next/image';
import { EyeIcon, ImageIcon, Loader2Icon, PencilIcon, PlusIcon, XIcon } from 'lucide-react';

import { useT } from '@/lib/i18n/lang-context';
import { resolveBlogMediaUrl } from '@/lib/api/blog.service';
import {
  useCreateBlog,
  useUpdateBlog,
  useUploadBlogImage,
} from '@/lib/hooks/use-blog';
import {
  BlogStatus,
  type Blog,
  type BlogBlock,
  type BlogImage,
  type CreateBlogDto,
  type UpdateBlogDto,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BlockBuilder } from '@/components/blog/block-builder';
import { BlogContentPreview } from '@/components/blog/blog-content-preview';

export interface BlogEditorDialogProps {
  open: boolean;
  onClose: () => void;
  /** When set, the dialog edits this post; otherwise it creates a new one. */
  post?: Blog | null;
}

/**
 * Wide create/edit dialog for blog articles. Owns the full editable
 * shape — title, slug, excerpt, category, cover image, SEO fields,
 * status, and the structured `content` blocks (lifted from the embedded
 * BlockBuilder so Save persists them straight through).
 *
 * Mirrors the PackFormDialog reset pattern (useEffect on open + post)
 * so reopening the dialog on a different row never shows stale state.
 * The base Dialog caps at sm:max-w-sm — overridden to a wide,
 * scrollable surface for the two-pane form + builder.
 */
export function BlogEditorDialog({ open, onClose, post }: BlogEditorDialogProps) {
  const { t } = useT();
  const editing = !!post;
  const create = useCreateBlog();
  const update = useUpdateBlog();
  const uploadCover = useUploadBlogImage();

  const [title, setTitle] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [excerpt, setExcerpt] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [status, setStatus] = React.useState<BlogStatus>(BlogStatus.DRAFT);
  const [content, setContent] = React.useState<BlogBlock[]>([]);
  // Cover image — keep both the id (sent to the API) and the relative
  // url (for the local thumbnail preview).
  const [coverImageId, setCoverImageId] = React.useState<string | null>(null);
  const [coverUrl, setCoverUrl] = React.useState<string | null>(null);
  const [coverImageAlt, setCoverImageAlt] = React.useState('');
  const [seoTitle, setSeoTitle] = React.useState('');
  const [seoDescription, setSeoDescription] = React.useState('');
  // Keywords held as a raw comma-separated string while editing; split
  // into string[] only at submit so the user can type commas freely.
  const [seoKeywordsInput, setSeoKeywordsInput] = React.useState('');
  const [showPreview, setShowPreview] = React.useState(false);
  const [titleTouched, setTitleTouched] = React.useState(false);

  // Reset the whole form whenever the dialog opens or the target post
  // changes. (Same footgun the packs form documents — using useEffect,
  // not useMemo, so the side-effecting resets actually fire.)
  React.useEffect(() => {
    if (!open) return;
    setTitle(post?.title ?? '');
    setSlug(post?.slug ?? '');
    setExcerpt(post?.excerpt ?? '');
    setCategory(post?.category ?? '');
    setStatus(post?.status ?? BlogStatus.DRAFT);
    setContent(post?.content ?? []);
    setCoverImageId(post?.coverImageId ?? null);
    setCoverUrl(post?.cover?.url ?? null);
    setCoverImageAlt(post?.coverImageAlt ?? '');
    setSeoTitle(post?.seoTitle ?? '');
    setSeoDescription(post?.seoDescription ?? '');
    setSeoKeywordsInput((post?.seoKeywords ?? []).join(', '));
    setShowPreview(false);
    setTitleTouched(false);
  }, [open, post]);

  const submitting = create.isPending || update.isPending;
  const titleValid = title.trim().length > 0;

  const handleCoverFile = (file: File | null) => {
    if (!file) return;
    uploadCover.mutate(
      { file },
      {
        onSuccess: (img: BlogImage) => {
          setCoverImageId(img.id);
          setCoverUrl(img.url);
        },
      },
    );
  };

  const removeCover = () => {
    setCoverImageId(null);
    setCoverUrl(null);
  };

  const buildDto = (): CreateBlogDto => {
    const keywords = seoKeywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    return {
      title: title.trim(),
      slug: slug.trim() || undefined,
      excerpt: excerpt.trim() || undefined,
      content,
      coverImageId: coverImageId ?? undefined,
      coverImageAlt: coverImageAlt.trim() || undefined,
      category: category.trim() || undefined,
      status,
      seoTitle: seoTitle.trim() || undefined,
      seoDescription: seoDescription.trim() || undefined,
      seoKeywords: keywords.length > 0 ? keywords : undefined,
    };
  };

  const submit = () => {
    setTitleTouched(true);
    if (!titleValid) return;
    const dto = buildDto();
    if (editing && post) {
      update.mutate(
        { id: post.id, data: dto as UpdateBlogDto },
        { onSuccess: () => onClose() },
      );
    } else {
      create.mutate(dto, { onSuccess: () => onClose() });
    }
  };

  const resolvedCover = resolveBlogMediaUrl(coverUrl);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t('blogAdmin.dialog.editTitle')
              : t('blogAdmin.dialog.newTitle')}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? t('blogAdmin.dialog.editSubtitle')
              : t('blogAdmin.dialog.newSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* Preview toggle */}
        <div className="flex items-center justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowPreview((p) => !p)}
          >
            {showPreview ? (
              <PencilIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
            {showPreview
              ? t('blogAdmin.buttons.edit')
              : t('blogAdmin.buttons.preview')}
          </Button>
        </div>

        {showPreview ? (
          <BlogPreviewPane
            title={title}
            excerpt={excerpt}
            category={category}
            cover={resolvedCover}
            coverAlt={coverImageAlt}
            content={content}
          />
        ) : (
          <div className="grid gap-5 py-1">
            {/* ── Basics ── */}
            <div className="space-y-1.5">
              <Label htmlFor="blog-title">{t('blogAdmin.fields.title')}</Label>
              <Input
                id="blog-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setTitleTouched(true)}
                placeholder={t('blogAdmin.fields.titlePlaceholder')}
                aria-invalid={titleTouched && !titleValid}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="blog-slug">{t('blogAdmin.fields.slug')}</Label>
                <Input
                  id="blog-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={t('blogAdmin.fields.slugPlaceholder')}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t('blogAdmin.fields.slugHelp')}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="blog-category">
                  {t('blogAdmin.fields.category')}
                </Label>
                <Input
                  id="blog-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={t('blogAdmin.fields.categoryPlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="blog-excerpt">
                {t('blogAdmin.fields.excerpt')}
              </Label>
              <Textarea
                id="blog-excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder={t('blogAdmin.fields.excerptPlaceholder')}
                rows={2}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('blogAdmin.fields.excerptHelp')}
              </p>
            </div>

            {/* ── Cover image ── */}
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <Label className="text-sm font-medium">
                {t('blogAdmin.fields.coverImage')}
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {t('blogAdmin.fields.coverImageHelp')}
              </p>
              <div className="flex flex-wrap items-start gap-3">
                <div className="grid h-28 w-44 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background">
                  {resolvedCover ? (
                    <Image
                      src={resolvedCover}
                      alt={coverImageAlt || ''}
                      width={176}
                      height={112}
                      unoptimized
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <ImageIcon className="size-6" />
                      <span className="text-[11px]">
                        {t('blogAdmin.cover.none')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <label
                    htmlFor="blog-cover-file"
                    className="inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors hover:bg-muted"
                  >
                    {uploadCover.isPending ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <PlusIcon className="size-4" />
                    )}
                    {coverUrl
                      ? t('blogAdmin.buttons.replaceCover')
                      : t('blogAdmin.buttons.uploadCover')}
                    <input
                      id="blog-cover-file"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadCover.isPending}
                      onChange={(e) =>
                        handleCoverFile(e.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  <div className="space-y-1.5">
                    <Label htmlFor="blog-cover-alt" className="text-xs">
                      {t('blogAdmin.fields.altText')}
                    </Label>
                    <Input
                      id="blog-cover-alt"
                      value={coverImageAlt}
                      onChange={(e) => setCoverImageAlt(e.target.value)}
                      placeholder={t('blogAdmin.fields.altTextPlaceholder')}
                    />
                  </div>
                  {coverUrl ? (
                    <button
                      type="button"
                      onClick={removeCover}
                      className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                    >
                      <XIcon className="size-3" />
                      {t('blogAdmin.buttons.removeCover')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* ── Content blocks ── */}
            <BlockBuilder value={content} onChange={setContent} />

            {/* ── SEO ── */}
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <Label className="text-sm font-medium">
                {t('blogAdmin.fields.seoSection')}
              </Label>
              <div className="space-y-1.5">
                <Label htmlFor="blog-seo-title" className="text-xs">
                  {t('blogAdmin.fields.seoTitle')}
                </Label>
                <Input
                  id="blog-seo-title"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder={t('blogAdmin.fields.seoTitlePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="blog-seo-desc" className="text-xs">
                  {t('blogAdmin.fields.seoDescription')}
                </Label>
                <Textarea
                  id="blog-seo-desc"
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  placeholder={t('blogAdmin.fields.seoDescriptionPlaceholder')}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="blog-seo-keywords" className="text-xs">
                  {t('blogAdmin.fields.seoKeywords')}
                </Label>
                <Input
                  id="blog-seo-keywords"
                  value={seoKeywordsInput}
                  onChange={(e) => setSeoKeywordsInput(e.target.value)}
                  placeholder={t('blogAdmin.fields.seoKeywordsPlaceholder')}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t('blogAdmin.fields.seoKeywordsHelp')}
                </p>
              </div>
            </div>

            {/* ── Status ── */}
            <div className="space-y-1.5">
              <Label htmlFor="blog-status">{t('blogAdmin.fields.status')}</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as BlogStatus)}
              >
                <SelectTrigger id="blog-status" className="sm:w-60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BlogStatus.DRAFT}>
                    {t('blogAdmin.status.draft')}
                  </SelectItem>
                  <SelectItem value={BlogStatus.PUBLISHED}>
                    {t('blogAdmin.status.published')}
                  </SelectItem>
                  <SelectItem value={BlogStatus.ARCHIVED}>
                    {t('blogAdmin.status.archived')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('blogAdmin.buttons.cancel')}
          </Button>
          <Button onClick={submit} disabled={submitting || !titleValid}>
            {submitting ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : null}
            {t('blogAdmin.buttons.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// In-dashboard preview pane — header chrome + the shared block preview.

function BlogPreviewPane({
  title,
  excerpt,
  category,
  cover,
  coverAlt,
  content,
}: {
  title: string;
  excerpt: string;
  category: string;
  cover: string | null;
  coverAlt: string;
  content: BlogBlock[];
}) {
  const { t } = useT();
  return (
    <div className="rounded-lg border bg-background">
      <article className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        {category ? (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {category}
          </span>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title || t('blogAdmin.fields.titlePlaceholder')}
        </h1>
        {excerpt ? (
          <p className="text-base text-muted-foreground">{excerpt}</p>
        ) : null}
        {cover ? (
          <div className="overflow-hidden rounded-xl border">
            <Image
              src={cover}
              alt={coverAlt || title || ''}
              width={1200}
              height={630}
              unoptimized
              className="h-auto w-full object-cover"
            />
          </div>
        ) : null}
        <div className="pt-2">
          <BlogContentPreview blocks={content} />
        </div>
      </article>
    </div>
  );
}
