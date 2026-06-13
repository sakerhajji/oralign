'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  Heading2Icon,
  ImageIcon,
  ImagesIcon,
  Loader2Icon,
  MinusIcon,
  MousePointerClickIcon,
  PlusIcon,
  QuoteIcon,
  TextIcon,
  Trash2Icon,
  VideoIcon,
  XIcon,
} from 'lucide-react';

import { useT } from '@/lib/i18n/lang-context';
import { resolveBlogMediaUrl } from '@/lib/api/blog.service';
import { useUploadBlogImage } from '@/lib/hooks/use-blog';
import type { BlogBlock, BlogBlockType, BlogImage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ─────────────────────────────────────────────────────────────────────
// Helpers

/** Stable client id for a freshly added block. */
function newId(): string {
  // crypto.randomUUID is available in every browser the dashboard
  // targets; the `?.` keeps SSR / test environments from throwing.
  return (
    globalThis.crypto?.randomUUID?.() ??
    `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

/**
 * Construct an empty block of the requested type with a fresh id. Each
 * variant starts in its "blank" shape so the builder can render the
 * editing controls immediately.
 */
function makeBlock(type: BlogBlockType): BlogBlock {
  const id = newId();
  switch (type) {
    case 'heading':
      return { id, type: 'heading', level: 2, content: '' };
    case 'paragraph':
      return { id, type: 'paragraph', content: '' };
    case 'image':
      return { id, type: 'image', url: '', alt: '', caption: '' };
    case 'gallery':
      return { id, type: 'gallery', images: [] };
    case 'video':
      return { id, type: 'video', url: '' };
    case 'quote':
      return { id, type: 'quote', content: '', cite: '' };
    case 'cta':
      return { id, type: 'cta', label: '', url: '' };
    case 'divider':
      return { id, type: 'divider' };
  }
}

const BLOCK_TYPES: BlogBlockType[] = [
  'heading',
  'paragraph',
  'image',
  'gallery',
  'video',
  'quote',
  'cta',
  'divider',
];

function blockIcon(type: BlogBlockType): React.ReactNode {
  switch (type) {
    case 'heading':
      return <Heading2Icon className="size-4" />;
    case 'paragraph':
      return <TextIcon className="size-4" />;
    case 'image':
      return <ImageIcon className="size-4" />;
    case 'gallery':
      return <ImagesIcon className="size-4" />;
    case 'video':
      return <VideoIcon className="size-4" />;
    case 'quote':
      return <QuoteIcon className="size-4" />;
    case 'cta':
      return <MousePointerClickIcon className="size-4" />;
    case 'divider':
      return <MinusIcon className="size-4" />;
  }
}

/** Accepts only YouTube / Vimeo watch URLs — mirrors the public renderer. */
function isSupportedVideoUrl(url: string): boolean {
  if (!url.trim()) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be' ||
      host === 'vimeo.com' ||
      host === 'player.vimeo.com'
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public component

export interface BlockBuilderProps {
  value: BlogBlock[];
  onChange: (next: BlogBlock[]) => void;
  /**
   * Optional namespace for the builder's file-input element ids. The
   * bilingual editor mounts TWO builders (one per language tab) bound to
   * `content.en` / `content.fr`; without a per-instance prefix the
   * image-block `<input id>`s (`blog-block-image-0`) would collide
   * between the two trees, so a label click on the FR tab could focus
   * the EN tab's hidden file input. Defaults to a stable fallback so the
   * single-instance / legacy call sites keep working unchanged.
   */
  idPrefix?: string;
}

/**
 * Controlled JSON block builder. The parent (editor dialog) owns the
 * `BlogBlock[]` state so Save persists `content` straight through. The
 * builder manipulates the array immutably and re-emits via `onChange`.
 *
 * Reordering uses the same @dnd-kit vertical-sortable mechanics as the
 * shared `data-table.tsx`: `DndContext` + `closestCenter` +
 * `restrictToVerticalAxis`, a `SortableContext` with
 * `verticalListSortingStrategy`, and `arrayMove` inside `handleDragEnd`.
 * Move-up / move-down buttons provide a keyboard-accessible fallback.
 */
export function BlockBuilder({
  value,
  onChange,
  idPrefix = 'blog',
}: BlockBuilderProps) {
  const { t } = useT();

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );

  const ids = React.useMemo<UniqueIdentifier[]>(
    () => value.map((b) => b.id),
    [value],
  );

  const addBlock = (type: BlogBlockType) => {
    onChange([...value, makeBlock(type)]);
  };

  const updateBlock = (id: string, next: BlogBlock) => {
    onChange(value.map((b) => (b.id === id ? next : b)));
  };

  const removeBlock = (id: string) => {
    onChange(value.filter((b) => b.id !== id));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    onChange(arrayMove(value, index, target));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = ids.indexOf(active.id);
      const newIndex = ids.indexOf(over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange(arrayMove(value, oldIndex, newIndex));
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">
          {t('blogAdmin.blocks.sectionTitle')}
        </Label>
        <AddBlockMenu onAdd={addBlock} />
      </div>

      {value.length === 0 ? (
        <div className="grid place-items-center gap-3 rounded-lg border border-dashed bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t('blogAdmin.blocks.empty')}
          </p>
          <AddBlockMenu onAdd={addBlock} />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {value.map((block, index) => (
                <SortableBlockCard
                  key={block.id}
                  block={block}
                  idPrefix={idPrefix}
                  isFirst={index === 0}
                  isLast={index === value.length - 1}
                  onChange={(next) => updateBlock(block.id, next)}
                  onRemove={() => removeBlock(block.id)}
                  onMoveUp={() => move(index, -1)}
                  onMoveDown={() => move(index, 1)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Add-block menu

function AddBlockMenu({ onAdd }: { onAdd: (type: BlogBlockType) => void }) {
  const { t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <PlusIcon className="size-4" />
          {t('blogAdmin.buttons.addBlock')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('blogAdmin.blocks.pickerTitle')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {BLOCK_TYPES.map((type) => (
          <DropdownMenuItem
            key={type}
            onClick={() => onAdd(type)}
            className="gap-2"
          >
            {blockIcon(type)}
            {t(`blogAdmin.blocks.types.${type}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sortable card wrapper

function SortableBlockCard({
  block,
  idPrefix,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: BlogBlock;
  idPrefix: string;
  isFirst: boolean;
  isLast: boolean;
  onChange: (next: BlogBlock) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { t } = useT();
  const { attributes, listeners, transform, transition, setNodeRef, isDragging } =
    useSortable({ id: block.id });

  return (
    <div
      ref={setNodeRef}
      data-dragging={isDragging}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'relative z-0 rounded-lg border bg-card shadow-sm',
        'data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 data-[dragging=true]:shadow-md',
      )}
    >
      {/* Header: drag handle + type label + reorder/remove controls */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 cursor-grab text-muted-foreground hover:bg-transparent active:cursor-grabbing"
          aria-label={t('blogAdmin.blocks.pickerTitle')}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </Button>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {blockIcon(block.type)}
          {t(`blogAdmin.blocks.types.${block.type}`)}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={isFirst}
            onClick={onMoveUp}
            aria-label={t('blogAdmin.buttons.moveUp')}
          >
            <ArrowUpIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={isLast}
            onClick={onMoveDown}
            aria-label={t('blogAdmin.buttons.moveDown')}
          >
            <ArrowDownIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label={t('blogAdmin.buttons.removeBlock')}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </span>
      </div>

      {/* Body: per-type editor */}
      <div className="p-3">
        <BlockEditor block={block} idPrefix={idPrefix} onChange={onChange} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-type editor — exhaustive switch over the discriminated union

function BlockEditor({
  block,
  idPrefix,
  onChange,
}: {
  block: BlogBlock;
  idPrefix: string;
  onChange: (next: BlogBlock) => void;
}) {
  const { t } = useT();

  switch (block.type) {
    case 'heading':
      return (
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <div className="space-y-1.5">
            <Label className="text-xs">
              {t('blogAdmin.blocks.headingLevel')}
            </Label>
            <Select
              value={String(block.level)}
              onValueChange={(v) =>
                onChange({ ...block, level: Number(v) === 3 ? 3 : 2 })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">
                  {t('blogAdmin.blocks.headingLevel2')}
                </SelectItem>
                <SelectItem value="3">
                  {t('blogAdmin.blocks.headingLevel3')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              {t(`blogAdmin.blocks.types.heading`)}
            </Label>
            <Input
              value={block.content}
              onChange={(e) => onChange({ ...block, content: e.target.value })}
              placeholder={t('blogAdmin.blocks.headingPlaceholder')}
              className={block.level === 2 ? 'font-semibold' : ''}
            />
          </div>
        </div>
      );

    case 'paragraph':
      return (
        <div className="space-y-1.5">
          <Textarea
            value={block.content}
            onChange={(e) => onChange({ ...block, content: e.target.value })}
            placeholder={t('blogAdmin.blocks.paragraphPlaceholder')}
            rows={4}
          />
        </div>
      );

    case 'image':
      return (
        <ImageBlockEditor
          block={block}
          fieldKey={`${idPrefix}-image-${block.id}`}
          onChange={onChange}
        />
      );

    case 'gallery':
      return <GalleryBlockEditor block={block} onChange={onChange} />;

    case 'video':
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{t('blogAdmin.blocks.videoUrl')}</Label>
          <Input
            type="url"
            value={block.url}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
            placeholder={t('blogAdmin.blocks.videoUrlPlaceholder')}
            aria-invalid={block.url.trim() !== '' && !isSupportedVideoUrl(block.url)}
          />
          <p
            className={cn(
              'text-[11px]',
              block.url.trim() !== '' && !isSupportedVideoUrl(block.url)
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
          >
            {t('blogAdmin.blocks.videoHelp')}
          </p>
        </div>
      );

    case 'quote':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Textarea
              value={block.content}
              onChange={(e) => onChange({ ...block, content: e.target.value })}
              placeholder={t('blogAdmin.blocks.quotePlaceholder')}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('blogAdmin.blocks.quoteCite')}</Label>
            <Input
              value={block.cite ?? ''}
              onChange={(e) =>
                onChange({ ...block, cite: e.target.value || undefined })
              }
              placeholder={t('blogAdmin.blocks.quoteCitePlaceholder')}
            />
          </div>
        </div>
      );

    case 'cta':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('blogAdmin.blocks.ctaLabel')}</Label>
              <Input
                value={block.label}
                onChange={(e) => onChange({ ...block, label: e.target.value })}
                placeholder={t('blogAdmin.blocks.ctaLabelPlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('blogAdmin.blocks.ctaUrl')}</Label>
              <Input
                value={block.url}
                onChange={(e) => onChange({ ...block, url: e.target.value })}
                placeholder={t('blogAdmin.blocks.ctaUrlPlaceholder')}
                aria-invalid={
                  block.url.trim() !== '' &&
                  !block.url.startsWith('/') &&
                  !block.url.startsWith('https://')
                }
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('blogAdmin.blocks.ctaHelp')}
          </p>
        </div>
      );

    case 'divider':
      return (
        <p className="text-[11px] text-muted-foreground">
          {t('blogAdmin.blocks.dividerHelp')}
        </p>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Image block editor — upload + alt + caption + thumbnail

function ImageBlockEditor({
  block,
  fieldKey,
  onChange,
}: {
  block: Extract<BlogBlock, { type: 'image' }>;
  fieldKey: string;
  onChange: (next: BlogBlock) => void;
}) {
  const { t } = useT();
  const upload = useUploadBlogImage();
  const inputId = `blog-block-${fieldKey}`;

  const handleFile = (file: File | null) => {
    if (!file) return;
    upload.mutate(
      { file },
      {
        onSuccess: (img: BlogImage) => {
          onChange({
            ...block,
            imageId: img.id,
            url: img.url,
            width: img.width,
            height: img.height,
          });
        },
      },
    );
  };

  const preview = resolveBlogMediaUrl(block.url || null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted/40">
          {preview ? (
            <Image
              src={preview}
              alt={block.alt || ''}
              width={96}
              height={96}
              unoptimized
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={inputId}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors hover:bg-muted"
          >
            {upload.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PlusIcon className="size-4" />
            )}
            {block.url
              ? t('blogAdmin.buttons.replaceCover')
              : t('blogAdmin.buttons.uploadImage')}
            <input
              id={inputId}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={upload.isPending}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {block.url ? (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...block,
                  imageId: undefined,
                  url: '',
                  width: undefined,
                  height: undefined,
                })
              }
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <XIcon className="size-3" />
              {t('blogAdmin.buttons.removeBlock')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('blogAdmin.fields.altText')}</Label>
          <Input
            value={block.alt ?? ''}
            onChange={(e) =>
              onChange({ ...block, alt: e.target.value || undefined })
            }
            placeholder={t('blogAdmin.fields.altTextPlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('blogAdmin.blocks.imageCaption')}</Label>
          <Input
            value={block.caption ?? ''}
            onChange={(e) =>
              onChange({ ...block, caption: e.target.value || undefined })
            }
            placeholder={t('blogAdmin.blocks.imageCaptionPlaceholder')}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Gallery block editor — multi-image upload + per-image alt + reorder

function GalleryBlockEditor({
  block,
  onChange,
}: {
  block: Extract<BlogBlock, { type: 'gallery' }>;
  onChange: (next: BlogBlock) => void;
}) {
  const { t } = useT();
  const upload = useUploadBlogImage();
  const inputId = `blog-gallery-${block.id}`;

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Upload sequentially so each resolved BlogImage appends in order.
    Array.from(files).forEach((file) => {
      upload.mutate(
        { file },
        {
          onSuccess: (img: BlogImage) => {
            onChange({
              ...block,
              images: [
                ...block.images,
                {
                  imageId: img.id,
                  url: img.url,
                  width: img.width,
                  height: img.height,
                  alt: '',
                },
              ],
            });
          },
        },
      );
    });
  };

  const updateImage = (
    idx: number,
    patch: Partial<(typeof block.images)[number]>,
  ) => {
    onChange({
      ...block,
      images: block.images.map((img, i) =>
        i === idx ? { ...img, ...patch } : img,
      ),
    });
  };

  const removeImage = (idx: number) => {
    onChange({ ...block, images: block.images.filter((_, i) => i !== idx) });
  };

  const moveImage = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= block.images.length) return;
    onChange({ ...block, images: arrayMove(block.images, idx, target) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {t('blogAdmin.blocks.galleryHelp')}
        </p>
        <label
          htmlFor={inputId}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors hover:bg-muted"
        >
          {upload.isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <PlusIcon className="size-4" />
          )}
          {t('blogAdmin.buttons.addImage')}
          <input
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={upload.isPending}
            onChange={(e) => addFiles(e.target.files)}
          />
        </label>
      </div>

      {block.images.length > 0 ? (
        <ul className="grid gap-2">
          {block.images.map((img, idx) => {
            const preview = resolveBlogMediaUrl(img.url || null);
            return (
              <li
                key={`${img.imageId ?? img.url}-${idx}`}
                className="flex items-center gap-3 rounded-md border bg-background p-2"
              >
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/40">
                  {preview ? (
                    <Image
                      src={preview}
                      alt={img.alt || ''}
                      width={56}
                      height={56}
                      unoptimized
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="size-5 text-muted-foreground" />
                  )}
                </div>
                <Input
                  value={img.alt ?? ''}
                  onChange={(e) =>
                    updateImage(idx, { alt: e.target.value || undefined })
                  }
                  placeholder={t('blogAdmin.fields.altTextPlaceholder')}
                  className="h-9 flex-1"
                />
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={idx === 0}
                    onClick={() => moveImage(idx, -1)}
                    aria-label={t('blogAdmin.buttons.moveUp')}
                  >
                    <ArrowUpIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={idx === block.images.length - 1}
                    onClick={() => moveImage(idx, 1)}
                    aria-label={t('blogAdmin.buttons.moveDown')}
                  >
                    <ArrowDownIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => removeImage(idx)}
                    aria-label={t('blogAdmin.buttons.removeBlock')}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid place-items-center rounded-md border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          <ImagesIcon className="mb-1 size-5 opacity-50" />
          {t('blogAdmin.blocks.galleryHelp')}
        </div>
      )}
    </div>
  );
}
