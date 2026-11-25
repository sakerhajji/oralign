'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Box, Download, FileArchive, FileText, Film, ImageIcon, Loader2, Rotate3d } from 'lucide-react';
import { toast } from '@/lib/toast';
import { modelFormatOf } from '@/components/orders/model-viewer/model-format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { Skeleton } from '@/components/ui/skeleton';
import { absoluteUrl, productionPaths, productionService } from '@/lib/api/production.service';
import { useAuthedImage } from '@/lib/hooks/use-authed-image';
import { useT } from '@/lib/i18n/lang-context';
import { OrderFileCategory } from '@/lib/types';
import type {
  ProductionFileVariant,
  ProductionFileView,
  ProductionPlanAttachmentView,
} from '@/lib/types/production';
import { formatBytes } from '@/lib/utils/bytes';

// three.js is heavy: the viewer's chunk loads only when a scan is opened.
const ModelViewer = dynamic(
  () => import('@/components/orders/model-viewer/model-viewer').then((module) => module.ModelViewer),
  { ssr: false, loading: () => <Skeleton className="h-full min-h-[420px] w-full rounded-xl" /> },
);

type FileKind = 'image' | 'model' | 'video' | 'pdf' | 'archive' | 'other';

function kindOf(file: ProductionFileView): FileKind {
  if (file.mimeType.startsWith('image/')) return 'image';
  if (modelFormatOf(file.originalName)) return 'model';
  if (file.mimeType.startsWith('video/')) return 'video';
  if (file.mimeType === 'application/pdf' || file.category === OrderFileCategory.PDF) return 'pdf';
  if (file.category === OrderFileCategory.ZIP) return 'archive';
  return 'other';
}

const KIND_ICON = {
  image: ImageIcon,
  model: Box,
  video: Film,
  pdf: FileText,
  archive: FileArchive,
  other: FileText,
} as const;

/** One download at a time per file; a failure says so in the UI language. */
function useDownloads() {
  const { t } = useT();
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const run = (id: string, download: () => Promise<void>) => {
    if (pending.has(id)) return;
    setPending((current) => new Set(current).add(id));
    download()
      .catch(() => toast.error(t('production.dossier.files.downloadError')))
      .finally(() =>
        setPending((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        }),
      );
  };
  return { pending, run };
}

interface FileGroup {
  category: ProductionFileView['category'];
  files: ProductionFileView[];
}

function groupByCategory(files: readonly ProductionFileView[]): FileGroup[] {
  const groups = new Map<string, FileGroup>();
  for (const file of files) {
    const group = groups.get(file.category);
    if (group) group.files.push(file);
    else groups.set(file.category, { category: file.category, files: [file] });
  }
  return [...groups.values()];
}

/**
 * The order's files by category: photos and x-rays as thumbnails that
 * open full screen, 3D scans with the live viewer, everything else as a
 * download. Every byte comes through the production stream (JWT, neutral
 * file names); nothing points at /uploads.
 */
export function DossierFiles({ orderId, files }: { orderId: string; files: ProductionFileView[] }) {
  const { t } = useT();
  const downloads = useDownloads();
  const [preview, setPreview] = useState<{ file: ProductionFileView; label: string } | null>(null);
  const [model, setModel] = useState<{ file: ProductionFileView; label: string } | null>(null);

  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('production.dossier.files.empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {groupByCategory(files).map((group) => {
        const categoryLabel = t(`production.dossier.files.categories.${group.category}`);
        return (
          <div key={group.category} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              {categoryLabel}
              <span className="ml-1 tabular-nums">({group.files.length})</span>
            </h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {group.files.map((file, index) => {
                const label =
                  group.files.length > 1
                    ? t('production.dossier.files.numbered', { category: categoryLabel, index: index + 1 })
                    : categoryLabel;
                return (
                  <FileTile
                    key={file.id}
                    orderId={orderId}
                    file={file}
                    label={label}
                    downloading={downloads.pending.has(file.id)}
                    onDownload={() =>
                      downloads.run(file.id, () => productionService.downloadOrderFile(orderId, file))
                    }
                    onPreview={() => setPreview({ file, label })}
                    onView3d={() => setModel({ file, label })}
                  />
                );
              })}
            </ul>
          </div>
        );
      })}

      <FileLightbox orderId={orderId} target={preview} onClose={() => setPreview(null)} />
      <ModelDialog
        orderId={orderId}
        target={model}
        onClose={() => setModel(null)}
        onDownload={(file) => downloads.run(file.id, () => productionService.downloadOrderFile(orderId, file))}
      />
    </div>
  );
}

function FileTile({
  orderId,
  file,
  label,
  downloading,
  onDownload,
  onPreview,
  onView3d,
}: {
  orderId: string;
  file: ProductionFileView;
  label: string;
  downloading: boolean;
  onDownload: () => void;
  onPreview: () => void;
  onView3d: () => void;
}) {
  const { t } = useT();
  const kind = kindOf(file);
  // A scan's thumbnail exists only once the pipeline rendered it: asking
  // for it before would stream the raw model, which an <img> cannot show.
  const thumbVariant: ProductionFileVariant | null =
    kind === 'image' ? (file.variants?.thumb ? 'thumb' : 'md') : kind === 'model' && file.variants?.thumb ? 'thumb' : null;
  const Icon = KIND_ICON[kind];

  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-lg ring-1 ring-foreground/10">
      {kind === 'image' ? (
        <button
          type="button"
          onClick={onPreview}
          aria-label={t('production.dossier.files.preview', { name: label })}
          className="block aspect-[4/3] w-full bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <AuthedThumb orderId={orderId} file={file} variant={thumbVariant} alt={label} icon={Icon} />
        </button>
      ) : kind === 'model' ? (
        <button
          type="button"
          onClick={onView3d}
          aria-label={t('production.dossier.files.view3dAria', { name: label })}
          className="block aspect-[4/3] w-full bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <AuthedThumb orderId={orderId} file={file} variant={thumbVariant} alt={label} icon={Icon} />
        </button>
      ) : (
        <div className="grid aspect-[4/3] w-full place-items-center bg-muted/40 text-muted-foreground">
          <Icon className="size-8" aria-hidden="true" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground" title={file.originalName}>
          {file.originalName} · {formatBytes(file.size)}
        </p>
        {/* Stacked full-width actions: a tile is ~170 px wide on a phone. */}
        <div className="mt-auto grid gap-1.5 pt-1">
          {kind === 'model' && (
            <Button type="button" variant="secondary" className="h-12 w-full px-2 pointer-fine:md:h-8" onClick={onView3d}>
              <Rotate3d aria-hidden="true" />
              {t('production.dossier.files.view3d')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full px-2 pointer-fine:md:h-8"
            onClick={onDownload}
            disabled={downloading}
            aria-label={t('production.dossier.files.downloadAria', { name: label })}
          >
            {downloading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            {t('production.dossier.files.download')}
          </Button>
        </div>
      </div>
    </li>
  );
}

function AuthedThumb({
  orderId,
  file,
  variant,
  alt,
  icon: Icon,
}: {
  orderId: string;
  file: ProductionFileView;
  variant: ProductionFileVariant | null;
  alt: string;
  icon: (typeof KIND_ICON)[FileKind];
}) {
  const { t } = useT();
  const { src, loading, error } = useAuthedImage(
    variant ? productionPaths.orderFile(orderId, file.id, variant) : null,
  );
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-contain" />;
  }
  if (loading) return <Skeleton className="h-full w-full rounded-none" />;
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
      <Icon className="size-8" aria-hidden="true" />
      <span className="text-[11px]">
        {error
          ? t('production.dossier.files.previewError')
          : file.processingStatus === 'pending' || file.processingStatus === 'processing'
            ? t('production.dossier.files.processing')
            : null}
      </span>
    </span>
  );
}

/** Full screen, from the largest ready variant (the original while none is). */
function FileLightbox({
  orderId,
  target,
  onClose,
}: {
  orderId: string;
  target: { file: ProductionFileView; label: string } | null;
  onClose: () => void;
}) {
  const file = target?.file;
  const variant: ProductionFileVariant | undefined = file?.variants?.lg ? 'lg' : file?.variants?.md ? 'md' : undefined;
  const { src } = useAuthedImage(file ? productionPaths.orderFile(orderId, file.id, variant) : null);
  return (
    <ImageLightbox
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      src={src}
      alt={target?.label ?? ''}
      caption={target?.label}
      subCaption={file?.originalName}
    />
  );
}

/** The live 3D viewer of one scan, with the pipeline's colour GLB when it exists. */
function ModelDialog({
  orderId,
  target,
  onClose,
  onDownload,
}: {
  orderId: string;
  target: { file: ProductionFileView; label: string } | null;
  onClose: () => void;
  onDownload: (file: ProductionFileView) => void;
}) {
  const { t } = useT();
  const file = target?.file;
  const format = file ? modelFormatOf(file.originalName) : null;
  const glb = file?.variants?.model;
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* The primitive's X grows to 48 px in the corner on a touch screen
          (the lab tablet); the title makes room for it. */}
      <DialogContent className="flex h-[85dvh] flex-col gap-3 sm:max-w-[calc(100%-2rem)] lg:max-w-5xl">
        <div className="pr-8 pointer-coarse:pr-14">
          <DialogTitle className="text-base font-semibold">
            {target?.label ?? t('production.dossier.viewer.title')}
          </DialogTitle>
          <DialogDescription className="truncate">{file?.originalName}</DialogDescription>
        </div>
        <div className="min-h-0 flex-1">
          {file && format && (
            <ModelViewer
              format={format}
              url={absoluteUrl(productionPaths.orderFile(orderId, file.id))}
              sizeBytes={file.size}
              glbUrl={glb ? absoluteUrl(productionPaths.orderFile(orderId, file.id, 'model')) : undefined}
              glbBytes={glb?.sizeBytes}
              large
              onDownload={() => onDownload(file)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The approved plan's result files: name, size and a download. */
export function PlanAttachmentList({
  orderId,
  attachments,
}: {
  orderId: string;
  attachments: ProductionPlanAttachmentView[];
}) {
  const { t } = useT();
  const downloads = useDownloads();
  if (attachments.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('production.dossier.plan.noFiles')}</p>;
  }
  return (
    <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={attachment.fileName}>
              {attachment.fileName}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(`production.dossier.files.planCategories.${attachment.category}`)}
              {attachment.sizeBytes !== null && ` · ${formatBytes(attachment.sizeBytes)}`}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-12 min-w-12 shrink-0 px-3 pointer-fine:md:h-8 pointer-fine:md:min-w-0"
            disabled={downloads.pending.has(attachment.id)}
            onClick={() =>
              downloads.run(attachment.id, () => productionService.downloadPlanAttachment(orderId, attachment))
            }
            aria-label={t('production.dossier.files.downloadAria', { name: attachment.fileName })}
          >
            {downloads.pending.has(attachment.id) ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Download aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{t('production.dossier.files.download')}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** A plan table image (movement / dental), enlarged on tap. */
export function PlanTableImage({ path, title }: { path: string; title: string }) {
  const { t } = useT();
  const { src, loading, error } = useAuthedImage(path);
  const [open, setOpen] = useState(false);
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-xs text-muted-foreground">{title}</figcaption>
      <button
        type="button"
        disabled={!src}
        onClick={() => setOpen(true)}
        aria-label={t('production.dossier.files.preview', { name: title })}
        className="block overflow-hidden rounded-lg bg-muted/40 ring-1 ring-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={title} className="max-h-80 w-full object-contain" />
        ) : loading ? (
          <Skeleton className="h-48 w-full rounded-none" />
        ) : (
          <span className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            {error ? t('production.dossier.plan.tableError') : null}
          </span>
        )}
      </button>
      <ImageLightbox open={open} onOpenChange={setOpen} src={src} alt={title} caption={title} />
    </figure>
  );
}
