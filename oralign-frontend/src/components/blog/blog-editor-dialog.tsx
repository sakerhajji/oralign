'use client';

import * as React from 'react';
import Image from 'next/image';
import { EyeIcon, ImageIcon, Loader2Icon, PencilIcon, PlusIcon, XIcon } from 'lucide-react';

import { useT } from '@/lib/i18n/lang-context';
import { resolveBlogMediaUrl, pickLocalized } from '@/lib/api/blog.service';
import {
  useCreateBlog,
  useUpdateBlog,
  useUploadBlogImage,
} from '@/lib/hooks/use-blog';
import {
  BlogAudience,
  BlogStatus,
  type Blog,
  type BlogBlock,
  type BlogImage,
  type CreateBlogDto,
  type Localized,
  type UpdateBlogDto,
} from '@/lib/types';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BlockBuilder } from '@/components/blog/block-builder';
import { BlogContentPreview } from '@/components/blog/blog-content-preview';

export interface BlogEditorDialogProps {
  open: boolean;
  onClose: () => void;
  /** When set, the dialog edits this post; otherwise it creates a new one. */
  post?: Blog | null;
}

/** The two bilingual editing languages. Distinct from the dashboard UI
 *  language (which can also be 'ar') — a post only ever carries en/fr. */
type EditLang = 'en' | 'fr';

/** A fresh, empty `Localized<T>` bag. */
const emptyLocalized = <T,>(empty: T): Localized<T> => ({ en: empty, fr: empty });

/**
 * Coerce a (possibly partial / legacy) localized bag read off a post
 * into a full `{ en, fr }` pair so the controlled inputs always have a
 * defined value per language.
 */
function readLocalized<T>(
  value: Partial<Localized<T>> | T | null | undefined,
  empty: T,
): Localized<T> {
  if (value == null) return emptyLocalized(empty);
  // Legacy bare scalar/array — mirror into both languages.
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { en: value as T, fr: value as T };
  }
  const bag = value as Partial<Localized<T>>;
  return {
    en: (bag.en ?? empty) as T,
    fr: (bag.fr ?? empty) as T,
  };
}

/**
 * Wide create/edit dialog for blog articles (v2 — bilingual + audience).
 *
 * LANGUAGE-NEUTRAL fields (audience, slug, category, cover image, status)
 * live OUTSIDE the language tabs. Two language Tabs (English / French)
 * each edit that language's title, excerpt, SEO title/description/
 * keywords, cover alt text, and a per-language BlockBuilder bound to
 * `content[lang]`. A post is saved with `Localized<…>` ({en,fr}) bags;
 * `title` requires at least one non-empty language (client-validated;
 * the backend enforces the same rule).
 *
 * Mirrors the PackFormDialog reset pattern (useEffect on open + post)
 * so reopening the dialog on a different row never shows stale state.
 * The base Dialog caps at sm:max-w-sm — overridden to a wide, scrollable
 * surface for the two-pane form + per-language builders.
 */
export function BlogEditorDialog({ open, onClose, post }: BlogEditorDialogProps) {
  const { t } = useT();
  const editing = !!post;
  const create = useCreateBlog();
  const update = useUpdateBlog();
  const uploadCover = useUploadBlogImage();

  // ── Language-neutral fields ──────────────────────────────────────
  const [audience, setAudience] = React.useState<BlogAudience>(
    BlogAudience.PRACTITIONER,
  );
  const [slug, setSlug] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [status, setStatus] = React.useState<BlogStatus>(BlogStatus.DRAFT);
  // Cover image — keep both the id (sent to the API) and the relative
  // url (for the local thumbnail preview). Shared across languages.
  const [coverImageId, setCoverImageId] = React.useState<string | null>(null);
  const [coverUrl, setCoverUrl] = React.useState<string | null>(null);

  // ── Per-language fields (Localized bags) ─────────────────────────
  const [title, setTitle] = React.useState<Localized<string>>(emptyLocalized(''));
  const [excerpt, setExcerpt] = React.useState<Localized<string>>(
    emptyLocalized(''),
  );
  const [coverImageAlt, setCoverImageAlt] = React.useState<Localized<string>>(
    emptyLocalized(''),
  );
  const [seoTitle, setSeoTitle] = React.useState<Localized<string>>(
    emptyLocalized(''),
  );
  const [seoDescription, setSeoDescription] = React.useState<Localized<string>>(
    emptyLocalized(''),
  );
  // Keywords held as a raw comma-separated string per language while
  // editing; split into string[] only at submit so the user can type
  // commas freely.
  const [seoKeywordsInput, setSeoKeywordsInput] = React.useState<
    Localized<string>
  >(emptyLocalized(''));
  const [content, setContent] = React.useState<{
    en: BlogBlock[];
    fr: BlogBlock[];
  }>({ en: [], fr: [] });

  const [activeLang, setActiveLang] = React.useState<EditLang>('fr');
  const [showPreview, setShowPreview] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  // Reset the whole form whenever the dialog opens or the target post
  // changes. (Same footgun the packs form documents — using useEffect,
  // not useMemo, so the side-effecting resets actually fire.)
  React.useEffect(() => {
    if (!open) return;
    setAudience(post?.audience ?? BlogAudience.PRACTITIONER);
    setSlug(post?.slug ?? '');
    setCategory(post?.category ?? '');
    setStatus(post?.status ?? BlogStatus.DRAFT);
    setCoverImageId(post?.coverImageId ?? null);
    setCoverUrl(post?.cover?.url ?? null);

    setTitle(readLocalized(post?.title, ''));
    setExcerpt(readLocalized(post?.excerpt, ''));
    setCoverImageAlt(readLocalized(post?.coverImageAlt, ''));
    setSeoTitle(readLocalized(post?.seoTitle, ''));
    setSeoDescription(readLocalized(post?.seoDescription, ''));
    const kw = readLocalized<string[]>(post?.seoKeywords, []);
    setSeoKeywordsInput({
      en: (kw.en ?? []).join(', '),
      fr: (kw.fr ?? []).join(', '),
    });
    setContent({
      en: post?.content?.en ?? [],
      fr: post?.content?.fr ?? [],
    });

    setActiveLang('fr');
    setShowPreview(false);
    setTouched(false);
  }, [open, post]);

  const submitting = create.isPending || update.isPending;
  // At least one language of the title must be non-empty (matches the
  // backend's create rule).
  const titleValid =
    title.en.trim().length > 0 || title.fr.trim().length > 0;

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

  // Split a comma-separated keyword string into a clean string[].
  const splitKeywords = (raw: string): string[] =>
    raw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

  const buildDto = (): CreateBlogDto => {
    return {
      audience,
      title: { en: title.en.trim(), fr: title.fr.trim() },
      slug: slug.trim() || undefined,
      excerpt: { en: excerpt.en.trim(), fr: excerpt.fr.trim() },
      content,
      coverImageId: coverImageId ?? undefined,
      coverImageAlt: {
        en: coverImageAlt.en.trim(),
        fr: coverImageAlt.fr.trim(),
      },
      category: category.trim() || undefined,
      status,
      seoTitle: { en: seoTitle.en.trim(), fr: seoTitle.fr.trim() },
      seoDescription: {
        en: seoDescription.en.trim(),
        fr: seoDescription.fr.trim(),
      },
      seoKeywords: {
        en: splitKeywords(seoKeywordsInput.en),
        fr: splitKeywords(seoKeywordsInput.fr),
      },
    };
  };

  const submit = () => {
    setTouched(true);
    if (!titleValid) {
      // Surface the failing language tab so the empty-title field is
      // visible to the user.
      if (!title.fr.trim() && !title.en.trim()) setActiveLang('fr');
      return;
    }
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
            title={pickLocalized(title, activeLang)}
            excerpt={pickLocalized(excerpt, activeLang)}
            category={category}
            cover={resolvedCover}
            coverAlt={pickLocalized(coverImageAlt, activeLang)}
            content={content[activeLang]}
            lang={activeLang}
          />
        ) : (
          <div className="grid gap-5 py-1">
            {/* ── Language-neutral basics ── */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Audience (required) */}
              <div className="space-y-1.5">
                <Label htmlFor="blog-audience">
                  {t('blogAdmin.audience.label')}
                </Label>
                <Select
                  value={audience}
                  onValueChange={(v) => setAudience(v as BlogAudience)}
                >
                  <SelectTrigger id="blog-audience">
                    <SelectValue
                      placeholder={t('blogAdmin.audience.placeholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BlogAudience.PATIENT}>
                      {t('blogAdmin.audience.options.patient')}
                    </SelectItem>
                    <SelectItem value={BlogAudience.PRACTITIONER}>
                      {t('blogAdmin.audience.options.practitioner')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {t('blogAdmin.audience.help')}
                </p>
              </div>
              {/* Category */}
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

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Slug */}
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
              {/* Status */}
              <div className="space-y-1.5">
                <Label htmlFor="blog-status">
                  {t('blogAdmin.fields.status')}
                </Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as BlogStatus)}
                >
                  <SelectTrigger id="blog-status">
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

            {/* ── Cover image (shared; alt is per-language inside tabs) ── */}
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
                      alt={pickLocalized(coverImageAlt, activeLang) || ''}
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

            {/* ── Language tabs (per-language title / excerpt / SEO / alt / blocks) ── */}
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                {t('blogAdmin.languageTabs.contentLanguageHint')}
              </p>
              <Tabs
                value={activeLang}
                onValueChange={(v) => setActiveLang(v as EditLang)}
              >
                <TabsList>
                  <TabsTrigger value="en">
                    {t('blogAdmin.languageTabs.en')}
                  </TabsTrigger>
                  <TabsTrigger value="fr">
                    {t('blogAdmin.languageTabs.fr')}
                  </TabsTrigger>
                </TabsList>

                {/* Render BOTH language panels so each BlockBuilder keeps
                    its own controlled state; Radix hides the inactive one
                    (forceMount keeps the inactive builder's DOM alive so
                    in-flight uploads on the hidden tab don't get torn
                    down). */}
                {(['en', 'fr'] as const).map((lng) => (
                  <TabsContent
                    key={lng}
                    value={lng}
                    forceMount
                    className="space-y-5 data-[state=inactive]:hidden"
                  >
                    <LanguagePanel
                      lang={lng}
                      title={title[lng]}
                      onTitleChange={(v) =>
                        setTitle((p) => ({ ...p, [lng]: v }))
                      }
                      titleInvalid={touched && !titleValid}
                      onTitleBlur={() => setTouched(true)}
                      excerpt={excerpt[lng]}
                      onExcerptChange={(v) =>
                        setExcerpt((p) => ({ ...p, [lng]: v }))
                      }
                      coverImageAlt={coverImageAlt[lng]}
                      onCoverImageAltChange={(v) =>
                        setCoverImageAlt((p) => ({ ...p, [lng]: v }))
                      }
                      seoTitle={seoTitle[lng]}
                      onSeoTitleChange={(v) =>
                        setSeoTitle((p) => ({ ...p, [lng]: v }))
                      }
                      seoDescription={seoDescription[lng]}
                      onSeoDescriptionChange={(v) =>
                        setSeoDescription((p) => ({ ...p, [lng]: v }))
                      }
                      seoKeywords={seoKeywordsInput[lng]}
                      onSeoKeywordsChange={(v) =>
                        setSeoKeywordsInput((p) => ({ ...p, [lng]: v }))
                      }
                      content={content[lng]}
                      onContentChange={(next) =>
                        setContent((p) => ({ ...p, [lng]: next }))
                      }
                    />
                  </TabsContent>
                ))}
              </Tabs>
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
// One language tab body — title / excerpt / cover-alt / SEO + blocks.

function LanguagePanel({
  lang,
  title,
  onTitleChange,
  titleInvalid,
  onTitleBlur,
  excerpt,
  onExcerptChange,
  coverImageAlt,
  onCoverImageAltChange,
  seoTitle,
  onSeoTitleChange,
  seoDescription,
  onSeoDescriptionChange,
  seoKeywords,
  onSeoKeywordsChange,
  content,
  onContentChange,
}: {
  lang: EditLang;
  title: string;
  onTitleChange: (v: string) => void;
  titleInvalid: boolean;
  onTitleBlur: () => void;
  excerpt: string;
  onExcerptChange: (v: string) => void;
  coverImageAlt: string;
  onCoverImageAltChange: (v: string) => void;
  seoTitle: string;
  onSeoTitleChange: (v: string) => void;
  seoDescription: string;
  onSeoDescriptionChange: (v: string) => void;
  seoKeywords: string;
  onSeoKeywordsChange: (v: string) => void;
  content: BlogBlock[];
  onContentChange: (next: BlogBlock[]) => void;
}) {
  const { t } = useT();
  const editingLabel =
    lang === 'en'
      ? t('blogAdmin.languageTabs.editingInEn')
      : t('blogAdmin.languageTabs.editingInFr');

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
          {editingLabel}
        </span>
      </div>

      {/* Title (required for at least one language) */}
      <div className="space-y-1.5">
        <Label htmlFor={`blog-title-${lang}`}>
          {t('blogAdmin.fields.title')}
        </Label>
        <Input
          id={`blog-title-${lang}`}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={onTitleBlur}
          placeholder={t('blogAdmin.fields.titlePlaceholder')}
          aria-invalid={titleInvalid}
        />
        <p className="text-[11px] text-muted-foreground">
          {t('blogAdmin.fields.titleHelpPerLang')}
        </p>
        {titleInvalid ? (
          <p className="text-[11px] text-destructive">
            {t('blogAdmin.validation.titleRequired')}
          </p>
        ) : null}
      </div>

      {/* Excerpt */}
      <div className="space-y-1.5">
        <Label htmlFor={`blog-excerpt-${lang}`}>
          {t('blogAdmin.fields.excerpt')}
        </Label>
        <Textarea
          id={`blog-excerpt-${lang}`}
          value={excerpt}
          onChange={(e) => onExcerptChange(e.target.value)}
          placeholder={t('blogAdmin.fields.excerptPlaceholder')}
          rows={2}
        />
        <p className="text-[11px] text-muted-foreground">
          {t('blogAdmin.fields.excerptHelpPerLang')}
        </p>
      </div>

      {/* Cover alt text (per language) */}
      <div className="space-y-1.5">
        <Label htmlFor={`blog-cover-alt-${lang}`}>
          {t('blogAdmin.fields.altText')}
        </Label>
        <Input
          id={`blog-cover-alt-${lang}`}
          value={coverImageAlt}
          onChange={(e) => onCoverImageAltChange(e.target.value)}
          placeholder={t('blogAdmin.fields.altTextPlaceholder')}
        />
        <p className="text-[11px] text-muted-foreground">
          {t('blogAdmin.fields.altTextHelp')}
        </p>
      </div>

      {/* Content blocks (per language) */}
      <div className="space-y-1.5">
        <BlockBuilder
          idPrefix={`blog-${lang}`}
          value={content}
          onChange={onContentChange}
        />
        <p className="text-[11px] text-muted-foreground">
          {t('blogAdmin.fields.contentHelpPerLang')}
        </p>
      </div>

      {/* SEO (per language) */}
      <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
        <Label className="text-sm font-medium">
          {t('blogAdmin.fields.seoSection')}
        </Label>
        <p className="text-[11px] text-muted-foreground">
          {t('blogAdmin.fields.seoHelpPerLang')}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor={`blog-seo-title-${lang}`} className="text-xs">
            {t('blogAdmin.fields.seoTitle')}
          </Label>
          <Input
            id={`blog-seo-title-${lang}`}
            value={seoTitle}
            onChange={(e) => onSeoTitleChange(e.target.value)}
            placeholder={t('blogAdmin.fields.seoTitlePlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`blog-seo-desc-${lang}`} className="text-xs">
            {t('blogAdmin.fields.seoDescription')}
          </Label>
          <Textarea
            id={`blog-seo-desc-${lang}`}
            value={seoDescription}
            onChange={(e) => onSeoDescriptionChange(e.target.value)}
            placeholder={t('blogAdmin.fields.seoDescriptionPlaceholder')}
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`blog-seo-keywords-${lang}`} className="text-xs">
            {t('blogAdmin.fields.seoKeywords')}
          </Label>
          <Input
            id={`blog-seo-keywords-${lang}`}
            value={seoKeywords}
            onChange={(e) => onSeoKeywordsChange(e.target.value)}
            placeholder={t('blogAdmin.fields.seoKeywordsPlaceholder')}
          />
          <p className="text-[11px] text-muted-foreground">
            {t('blogAdmin.fields.seoKeywordsHelp')}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// In-dashboard preview pane — header chrome + the shared block preview.
// Reflects the currently-active language tab.

function BlogPreviewPane({
  title,
  excerpt,
  category,
  cover,
  coverAlt,
  content,
  lang,
}: {
  title: string;
  excerpt: string;
  category: string;
  cover: string | null;
  coverAlt: string;
  content: BlogBlock[];
  lang: EditLang;
}) {
  const { t } = useT();
  const langLabel =
    lang === 'en'
      ? t('blogAdmin.languageTabs.en')
      : t('blogAdmin.languageTabs.fr');
  return (
    <div className="rounded-lg border bg-background">
      <article className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          {category ? (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {category}
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
            {langLabel}
          </span>
        </div>
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
          <BlogContentPreview blocks={content} lang={lang} />
        </div>
      </article>
    </div>
  );
}
