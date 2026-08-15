'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Box,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  FileUp,
  ImageIcon,
  Loader2,
  Maximize2,
  Pencil,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
import { formatDistanceToNow } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import {
  useDeleteOrderFile,
  useOrderFiles,
  useUploadOrderFiles,
} from '@/lib/hooks';
import { orderKeys } from '@/lib/hooks/use-orders';
import { getAccessToken } from '@/lib/api';
import {
  CHUNKED_UPLOAD_THRESHOLD_BYTES,
  uploadFileChunked,
  type ChunkedUploadPhase,
  type ResumableUploadError,
} from '@/lib/api/chunked-upload';
import { useT } from '@/lib/i18n/lang-context';
import { OrderFile, OrderFileCategory } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/utils/bytes';
import { ImageEditDialog } from './image-edit-dialog';

// Category → dict key (resolved with t() at render time so the labels
// flip with the language toggle).
const categories = [
  [OrderFileCategory.RIGHT_PHOTO, 'media.categories.rightPhoto'],
  [OrderFileCategory.FRONT_PHOTO, 'media.categories.frontPhoto'],
  [OrderFileCategory.LEFT_PHOTO, 'media.categories.leftPhoto'],
  [OrderFileCategory.UPPER_PHOTO, 'media.categories.upperPhoto'],
  [OrderFileCategory.LOWER_PHOTO, 'media.categories.lowerPhoto'],
  [OrderFileCategory.ORTHOPANTOMOGRAPHY, 'media.categories.opg'],
  [OrderFileCategory.STL, 'media.categories.stl'],
  [OrderFileCategory.PLY, 'media.categories.ply'],
  [OrderFileCategory.OBJ, 'media.categories.obj'],
  [OrderFileCategory.ZIP, 'media.categories.zip'],
  [OrderFileCategory.PDF, 'media.categories.pdf'],
  [OrderFileCategory.IMAGE, 'media.categories.images'],
  [OrderFileCategory.VIDEO, 'media.categories.videos'],
  [OrderFileCategory.OTHER, 'media.categories.dicom'],
] as const;

// Slot order is meaningful — on a 3-column grid the rows read as:
//   Row 1 (extraoral):  profile      | face-at-rest | smile
//   Row 2 (intraoral):  left lateral | frontal occl | right lateral
//   Row 3 (occlusal):   upper occl   | lower occl
// On 2-column screens they pair into natural left/right couples instead.
// Each slot now carries an i18n LABEL KEY (not a raw title string) so
// the title flips on the language toggle. The English fallback that
// used to live in `title` is gone — `t(titleKey)` is the single source
// of truth (dict's miss-handler still returns the dotted path so a
// typo at the call site stays visible on screen).
const patientImageSlots = [
  // ── Row 1: extraoral facial views ──────────────────────────────────────
  {
    key: 'profile',
    titleKey: 'orderForm.files.slots.profilePhoto',
    category: OrderFileCategory.LEFT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
    referenceImage: '/defaultImage/Profile%20photo.webp',
  },
  {
    key: 'face-rest',
    titleKey: 'orderForm.files.slots.faceRest',
    category: OrderFileCategory.IMAGE,
    icon: ImageIcon,
    accept: 'image/*',
    // Default reference swapped on purpose — the "smile" reference makes
    // it clearer to the dentist what view this slot expects, even though
    // the slot is technically "face at rest". See sibling slot below.
    referenceImage: '/defaultImage/Smilephoto.webp',
  },
  {
    key: 'smile',
    titleKey: 'orderForm.files.slots.smile',
    category: OrderFileCategory.FRONT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
    referenceImage: '/defaultImage/Faceatrestphoto.webp',
  },
  // ── Row 2: intraoral left / frontal / right ────────────────────────────
  {
    key: 'left-lateral',
    titleKey: 'orderForm.files.slots.leftLateral',
    category: OrderFileCategory.LEFT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
    referenceImage: '/defaultImage/Leftlateralview.webp',
  },
  {
    key: 'frontal-occlusion',
    titleKey: 'orderForm.files.slots.frontalOcclusion',
    category: OrderFileCategory.FRONT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
    referenceImage: '/defaultImage/Frontalocclusionview.webp',
  },
  {
    key: 'right-lateral',
    titleKey: 'orderForm.files.slots.rightLateral',
    category: OrderFileCategory.RIGHT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
    referenceImage: '/defaultImage/Rightlateralview.webp',
  },
  // ── Row 3: intraoral occlusal views ────────────────────────────────────
  {
    key: 'upper-occlusal',
    titleKey: 'orderForm.files.slots.upperOcclusal',
    category: OrderFileCategory.UPPER_PHOTO,
    icon: ScanLine,
    accept: 'image/*',
    referenceImage: '/defaultImage/Upperocclusalview.webp',
  },
  {
    key: 'lower-occlusal',
    titleKey: 'orderForm.files.slots.lowerOcclusal',
    category: OrderFileCategory.LOWER_PHOTO,
    icon: ScanLine,
    accept: 'image/*',
    // Public assets are served immutable in production. Keep a versioned
    // URL here so browsers fetch the corrected mandibular reference instead
    // of a previously cached placeholder image.
    referenceImage: '/defaultImage/Lowerocclusalview.webp?v=20260801',
  },
] as const;

const radiographySlots = [
  {
    key: 'panoramic',
    titleKey: 'orderForm.files.slots.panoramic',
    category: OrderFileCategory.ORTHOPANTOMOGRAPHY,
    icon: ScanLine,
    accept: 'image/*,.pdf',
    referenceImage: '/defaultImage/Panoramicradiography.webp',
  },
  {
    key: 'profile-tele',
    titleKey: 'orderForm.files.slots.profileTele',
    category: OrderFileCategory.IMAGE,
    icon: ScanLine,
    accept: 'image/*,.pdf',
    referenceImage: '/defaultImage/Profileteleradiography.webp',
  },
] as const;

const stlSlots = [
  {
    key: 'upper-stl',
    titleKey: 'orderForm.files.slots.upperStl',
    category: OrderFileCategory.STL,
  },
  {
    key: 'lower-stl',
    titleKey: 'orderForm.files.slots.lowerStl',
    category: OrderFileCategory.STL,
  },
  {
    key: 'first-occlusion',
    titleKey: 'orderForm.files.slots.firstOcclusion',
    category: OrderFileCategory.STL,
  },
  {
    key: 'second-occlusion',
    titleKey: 'orderForm.files.slots.secondOcclusion',
    category: OrderFileCategory.STL,
  },
] as const;

type ClinicalFileSection = 'patient-images' | 'radiography-stl';
type UploadSlotDefinition = {
  key: string;
  /** Dotted dict path resolved with `useT()` at render time. The raw
   *  English label that used to live in a `title` field is now in the
   *  dictionary so the slot name flips with the language switcher. */
  titleKey: string;
  category: OrderFileCategory;
  icon?: typeof ImageIcon;
  accept?: string;
  /** Public path to the reference photo shown as a placeholder. */
  referenceImage?: string;
};

export function OrderFileUpload({
  orderId,
  readOnly,
}: {
  orderId?: string;
  readOnly?: boolean;
}) {
  const { t } = useT();
  const filesQuery = useOrderFiles(orderId);
  const uploadFiles = useUploadOrderFiles();
  const deleteFile = useDeleteOrderFile();
  const [category, setCategory] = useState<OrderFileCategory>(
    OrderFileCategory.OTHER,
  );

  if (!orderId) {
    return <SaveDraftNotice />;
  }

  const files = filesQuery.data ?? [];

  return (
    <div className="space-y-5">
      {!readOnly && (
        <div className="grid gap-3 rounded-md border bg-background p-4 md:grid-cols-[220px_1fr_auto] md:items-center">
          <FileCategorySelect value={category} onChange={setCategory} />
          <input
            id="order-files-input"
            type="file"
            multiple
            className="text-sm"
            onChange={(event) => {
              const fileList = Array.from(event.target.files ?? []);
              if (fileList.length === 0) return;
              uploadFiles.mutate({
                id: orderId,
                files: fileList,
                category,
              });
              event.currentTarget.value = '';
            }}
          />
          <span className="text-sm text-muted-foreground">
            {/* Mirrors the backend cap (order.service.ts:
                maxUploadBytesFor). CBCT / DICOM ZIP bundles AND 3D scans
                (STL / PLY / OBJ) get the 1 GB ceiling; everything else
                stays at 50 MB. */}
            {category === OrderFileCategory.ZIP
              ? t('media.maxZipHint')
              : category === OrderFileCategory.STL ||
                  category === OrderFileCategory.PLY ||
                  category === OrderFileCategory.OBJ
                ? t('media.maxScanHint')
                : t('media.maxFileHint')}
          </span>
        </div>
      )}

      <FileGallery
        orderId={orderId}
        files={files}
        readOnly={readOnly}
        isLoading={filesQuery.isLoading}
        error={filesQuery.error}
        onDelete={(fileId) => deleteFile.mutate({ id: orderId, fileId })}
      />
    </div>
  );
}

/**
 * In-app "image clipboard" — when the user clicks Copy on an uploaded
 * slot image we stash a File reference here, then ALL other slots
 * (filled or empty) surface a Paste button that uses this file as
 * their source. No system-clipboard / no server roundtrip; the file
 * stays in memory until the user pastes, copies a different image,
 * or navigates away from the page.
 *
 * Stored as a strong File reference rather than a blob URL so the
 * bytes survive even after the source slot's blob URL is revoked
 * (e.g. when the source slot is unmounted by tab switching).
 */
export interface ImageClipboardEntry {
  file: File;
  /** Title of the slot the image was copied FROM — used in toasts. */
  sourceTitle: string;
}

export function ClinicalOrderFiles({
  orderId,
  readOnly,
  section,
  cbctRequested,
  cbctToggle,
}: {
  orderId?: string;
  readOnly?: boolean;
  section: ClinicalFileSection;
  /**
   * Whether this order is marked as using a CBCT / DICOM bundle. Gates
   * the ZIP/CBCT upload block in the radiography-stl section:
   *   • editable mode → show ONLY when this is true;
   *   • read-only mode → also show when an uploaded ZIP bundle already
   *     exists (so admins / patients can still see a shipped CBCT
   *     volume even if the flag was later unset).
   */
  cbctRequested?: boolean;
  /**
   * Optional "CBCT requested" toggle, rendered by the wizard BETWEEN the
   * radiography slots and the STL section so the reading order is
   * Imagerie → panoramic → profile → CBCT toggle → STL → ZIP/DCM.
   * Read-only surfaces (review / order detail) omit it.
   */
  cbctToggle?: ReactNode;
}) {
  const { t } = useT();
  const filesQuery = useOrderFiles(orderId);
  const uploadFiles = useUploadOrderFiles();
  const deleteFile = useDeleteOrderFile();
  const queryClient = useQueryClient();

  // Lifted clipboard state — shared by every ClinicalMediaSlot below.
  // null when nothing has been copied yet.
  const [clipboard, setClipboard] = useState<ImageClipboardEntry | null>(null);

  // Which slot is currently uploading + its live progress (0-100).
  // Only one upload runs at a time (every slot is disabled while a
  // sibling uploads), so a single record drives the right slot's bar.
  const [activeUpload, setActiveUpload] = useState<{
    key: string;
    progress: number;
  } | null>(null);

  if (!orderId) {
    return <SaveDraftNotice />;
  }

  const files = filesQuery.data ?? [];

  const uploadSlot = (slot: UploadSlotDefinition, file: File) => {
    const named = withSlotName(slot.key, file);
    const onProgress = (percent: number) =>
      setActiveUpload((cur) =>
        cur && cur.key === slot.key ? { ...cur, progress: percent } : cur,
      );
    // Brief hold so the user sees 100% before the bar disappears, then
    // clear (server flush + DB insert happen after transfer).
    const settle = () => window.setTimeout(() => setActiveUpload(null), 500);
    setActiveUpload({ key: slot.key, progress: 0 });

    // Large scans (STL / PLY / OBJ up to the 1 GB ceiling) go through the
    // chunked / resumable pipeline — same one the CBCT ZIPs use — instead
    // of one giant multipart POST: 8 MiB segments with per-chunk retry,
    // so a flaky clinic connection doesn't restart a 600 MB scan from
    // zero. Small files keep the proven single-request path.
    if (named.size > CHUNKED_UPLOAD_THRESHOLD_BYTES) {
      void (async () => {
        try {
          await uploadFileChunked(orderId, named, slot.category, {
            onProgress,
          });
          await queryClient.invalidateQueries({
            queryKey: orderKeys.files(orderId),
          });
          await queryClient.invalidateQueries({
            queryKey: orderKeys.detail(orderId),
          });
        } catch (error) {
          const err = error as ResumableUploadError & {
            response?: { data?: { message?: string } };
          };
          toast.error(err.response?.data?.message ?? t('media.chunked.failed'));
        } finally {
          settle();
        }
      })();
      return;
    }

    uploadFiles.mutate(
      {
        id: orderId,
        files: [named],
        category: slot.category,
        onProgress,
      },
      { onSettled: settle },
    );
  };

  if (section === 'patient-images') {
    // The slot list is laid out in two grids so the trailing occlusal row
    // can be centred instead of orphaned in the left columns of a 3-col
    // grid. The first six slots fill rows 1+2; the last two (upper / lower
    // occlusal) go into a separate flex row that centres them as a pair.
    const extraoralAndLateral = patientImageSlots.slice(0, 6);
    const occlusals = patientImageSlots.slice(6);

    return (
      <div className="space-y-6">
        <SectionIntro
          title={t('orderForm.files.sections.patientImagesTitle')}
          description={t('orderForm.files.sections.patientImagesDesc')}
        />

        {/* ZIP bulk-upload moved to the Radiography / STL section — that
            context is where dentists typically deal with bundles (CBCT
            DICOM archives, multi-file STL exports). The patient-photo
            section only has eight slots and bulk-upload was confusing. */}

        <div className="grid justify-items-center gap-x-6 gap-y-6 sm:gap-y-8 md:grid-cols-2 md:justify-items-stretch xl:grid-cols-3">
          {extraoralAndLateral.map((slot) => (
            <ClinicalMediaSlot
              key={slot.key}
              orderId={orderId}
              title={t(slot.titleKey)}
              icon={slot.icon}
              accept={slot.accept}
              referenceImage={slot.referenceImage}
              disabled={readOnly || uploadFiles.isPending}
              readOnly={readOnly}
              uploading={activeUpload?.key === slot.key}
              progress={activeUpload?.key === slot.key ? activeUpload.progress : null}
              file={fileForSlot(files, slot, patientImageSlots)}
              onSelect={(file) => uploadSlot(slot, file)}
              clipboard={clipboard}
              onClipboard={setClipboard}
            />
          ))}
        </div>
        {occlusals.length > 0 && (
          <div className="flex flex-wrap items-stretch justify-center gap-x-6 gap-y-6 sm:gap-y-8">
            {occlusals.map((slot) => (
              <div
                key={slot.key}
                className="w-full max-w-[320px] sm:max-w-[300px] md:w-[44%] xl:w-[30%]"
              >
                <ClinicalMediaSlot
                  orderId={orderId}
                  title={t(slot.titleKey)}
                  icon={slot.icon}
                  accept={slot.accept}
                  referenceImage={slot.referenceImage}
                  disabled={readOnly || uploadFiles.isPending}
                  readOnly={readOnly}
                  uploading={activeUpload?.key === slot.key}
                  progress={activeUpload?.key === slot.key ? activeUpload.progress : null}
                  file={fileForSlot(files, slot, patientImageSlots)}
                  onSelect={(file) => uploadSlot(slot, file)}
                  clipboard={clipboard}
                  onClipboard={setClipboard}
                />
              </div>
            ))}
          </div>
        )}
        {/* "Other patient images" legacy list deliberately removed —
            uploads now flow through the slot grid above; any orphan files
            stay in the database and remain accessible via the admin /
            order-files endpoints, but we don't surface them on this page. */}
      </div>
    );
  }

  // ── CBCT / ZIP bundle visibility ────────────────────────────────────
  // The ZIP/CBCT upload is now gated on the order being marked as using a
  // CBCT bundle. In read-only mode we ALSO surface it whenever a bundle
  // was already uploaded — so admins / patients can still see a shipped
  // CBCT volume even if the flag is off (or was never re-set).
  const hasZipBundle = files.some((f) => f.category === OrderFileCategory.ZIP);
  const showCbctUpload = cbctRequested || (readOnly && hasZipBundle);

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <SectionIntro
          title={t('orderForm.files.sections.radiographyTitle')}
          description={t('orderForm.files.sections.radiographyDesc')}
        />
        <div className="grid justify-items-center gap-6 md:grid-cols-2 md:justify-items-stretch">
          {radiographySlots.map((slot) => (
            <ClinicalMediaSlot
              key={slot.key}
              orderId={orderId}
              title={t(slot.titleKey)}
              icon={slot.icon}
              accept={slot.accept}
              referenceImage={slot.referenceImage}
              disabled={readOnly || uploadFiles.isPending}
              readOnly={readOnly}
              uploading={activeUpload?.key === slot.key}
              progress={activeUpload?.key === slot.key ? activeUpload.progress : null}
              file={fileForSlot(files, slot, radiographySlots)}
              onSelect={(file) => uploadSlot(slot, file)}
              clipboard={clipboard}
              onClipboard={setClipboard}
            />
          ))}
        </div>
        {/* Legacy "Other radiography files" list removed — anything
            outside a tracked slot is intentionally hidden here. */}
      </section>

      <section className="space-y-5">
        <SectionIntro
          title={t('orderForm.files.sections.stlTitle')}
          description={t('orderForm.files.sections.stlDesc')}
        />
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {stlSlots.map((slot) => (
            <StlUploadTile
              key={slot.key}
              orderId={orderId}
              title={t(slot.titleKey)}
              disabled={readOnly || uploadFiles.isPending}
              uploading={activeUpload?.key === slot.key}
              progress={activeUpload?.key === slot.key ? activeUpload.progress : null}
              file={fileForSlot(files, slot, stlSlots)}
              readOnly={readOnly}
              onSelect={(file) => uploadSlot(slot, file)}
              onDelete={(fileId) => deleteFile.mutate({ id: orderId, fileId })}
            />
          ))}
        </div>
        {/* Legacy "Other scan files" list removed for the same reason —
            keep the page focused on the structured slots. */}
      </section>

      {/* CBCT-requested toggle + CBCT/ZIP bundle upload — placed BELOW the
          STL section (reading order: Imagerie → STL → CBCT toggle → CBCT /
          ZIP bundle). Editable surfaces (the wizard) pass the toggle node;
          read-only surfaces omit it. */}
      {cbctToggle ?? null}

      {/* CBCT / ZIP bundle upload — sits directly under the CBCT toggle
          (the thing it belongs to). Conditional: rendered when CBCT was
          requested for this order; in read-only mode (order detail /
          résumé) it also shows whenever a bundle already exists so admins /
          doctors still see the shipped CBCT / ZIP volume — that read-only
          render drops the upload row + delete buttons and just lists the
          uploaded bundles. */}
      {showCbctUpload && (
        <ZipUploadAction
          orderId={orderId}
          title={t('media.zipAction.freeformTitle')}
          category={OrderFileCategory.ZIP}
          files={files}
          onDelete={
            readOnly
              ? undefined
              : (fileId) => deleteFile.mutate({ id: orderId, fileId })
          }
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

function FileGallery({
  orderId,
  files,
  readOnly,
  isLoading,
  error,
  compact,
  onDelete,
}: {
  orderId: string;
  files: OrderFile[];
  readOnly?: boolean;
  isLoading: boolean;
  error: Error | null;
  compact?: boolean;
  onDelete: (fileId: string) => void;
}) {
  const { t } = useT();

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 pt-6 text-sm text-red-600">
          <RotateCcw className="h-4 w-4" />
          {t('media.filesLoadFailed', { message: error.message })}
        </CardContent>
      </Card>
    );
  }

  if (files.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-28 flex-col items-center justify-center gap-2 pt-6 text-center text-sm text-muted-foreground">
          <FileArchive className="h-7 w-7" />
          {t('media.noFilesYet')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className={cn(
        'grid gap-3',
        compact ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2',
      )}
    >
      {files.map((file) => (
        <SecureFilePreviewCard
          key={file.id}
          orderId={orderId}
          file={file}
          readOnly={readOnly}
          onDelete={() => onDelete(file.id)}
        />
      ))}
    </div>
  );
}

function SecureFilePreviewCard({
  orderId,
  file,
  readOnly,
  onDelete,
}: {
  orderId: string;
  file: OrderFile;
  readOnly?: boolean;
  onDelete: () => void;
}) {
  const { t } = useT();
  const previewType = getPreviewType(file);
  // Cards fetch ONLY the ~300px thumbnail, and only for images. The
  // old behaviour blob-fetched the FULL original for images, PDFs and
  // videos — an order with 8 clinical photos pulled 20-40 MB just to
  // paint 160px cards. PDFs/videos now load lazily in the fullscreen
  // viewer when opened.
  const { objectUrl, loading, error, refresh } = useSecureFileUrl(
    orderId,
    file.id,
    previewType === 'image',
    'thumb',
  );
  const isOptimizing =
    file.processingStatus === 'pending' || file.processingStatus === 'processing';
  const zipMeta =
    file.mediaMetadata && (file.mediaMetadata as { kind?: string }).kind === 'zip'
      ? (file.mediaMetadata as unknown as import('@/lib/types').ZipMediaMetadata)
      : undefined;

  return (
    <div className="overflow-hidden rounded-md border bg-background shadow-sm">
      <div className="flex h-40 items-center justify-center bg-muted/30">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : error ? (
          <div className="grid place-items-center gap-2 text-center text-xs text-red-600">
            <RotateCcw className="h-5 w-5" />
            {t('media.previewUnavailable')}
          </div>
        ) : (
          <PreviewSurface
            orderId={orderId}
            objectUrl={objectUrl}
            file={file}
            type={previewType}
          />
        )}
      </div>
      <div className="space-y-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{displayFileName(file)}</p>
          <p className="text-xs text-muted-foreground">
            {labelForCategory(file.category, t)} · {formatBytes(file.size)}
            {isOptimizing && (
              <span className="ml-1 text-primary/80">
                · {t('media.optimizing')}
              </span>
            )}
          </p>
        </div>
        {zipMeta && <ZipMetaSummary meta={zipMeta} />}
        <div className="flex flex-wrap gap-2">
          <PreviewDialog
            objectUrl={objectUrl}
            orderId={orderId}
            file={file}
            type={previewType}
            disabled={false}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadOrderFile(orderId, file)}
          >
            <Download className="mr-2 h-4 w-4" />
            {t('media.download')}
          </Button>
          {error && (
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('media.retry')}
            </Button>
          )}
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-red-600"
              onClick={onDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('common.delete')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewSurface({
  orderId,
  objectUrl,
  file,
  type,
  large,
}: {
  orderId: string;
  objectUrl?: string;
  file: OrderFile;
  type: PreviewType;
  large?: boolean;
}) {
  if (type === 'image' && objectUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={objectUrl}
        alt={displayFileName(file)}
        loading="lazy"
        decoding="async"
        // `object-contain` in BOTH the fullscreen (large) and the card
        // thumbnail (small) so the WHOLE clinical photo is always
        // visible. The thumbnail used to be `object-cover`, which
        // center-cropped portrait patient photos inside the rectangular
        // card — the face looked zoomed-in and the head/chin were
        // clipped. A neutral muted backdrop frames the letterboxing so
        // it reads as intentional. (Patient avatars are letter-based,
        // so no surface here needs a cover-cropped circular thumbnail.)
        className={cn(
          large
            ? 'max-h-full max-w-full object-contain'
            : 'h-full w-full bg-muted/40 object-contain',
        )}
      />
    );
  }

  if (type === 'pdf' && objectUrl) {
    return (
      <iframe
        title={displayFileName(file)}
        src={objectUrl}
        className="h-full w-full bg-background"
      />
    );
  }

  if (type === 'video' && objectUrl) {
    return <video src={objectUrl} controls className="h-full w-full bg-black" />;
  }

  if (type === 'model' && extensionFor(file.originalName) === 'stl') {
    // The live three.js viewer is EXPENSIVE (multi-MB fetch + WebGL
    // context per slot) — it only mounts in the fullscreen dialog.
    // Cards show the server-rendered thumbnail (or a placeholder while
    // the pipeline hasn't produced one yet).
    return large ? (
      <StlModelViewer orderId={orderId} file={file} large />
    ) : (
      <StlStaticPreview orderId={orderId} file={file} />
    );
  }

  if (type === 'model') {
    return <ModelPlaceholder file={file} large={large} />;
  }

  // ZIP archives are NEVER rendered in the browser — show their safe
  // server-side metadata (entry count, top-level listing) instead.
  if (
    file.mediaMetadata &&
    (file.mediaMetadata as { kind?: string }).kind === 'zip'
  ) {
    return (
      <ZipMetaPanel
        meta={file.mediaMetadata as unknown as import('@/lib/types').ZipMediaMetadata}
        file={file}
        large={large}
      />
    );
  }

  return (
    <div className="grid place-items-center gap-2 text-center text-muted-foreground">
      <FileText className="h-8 w-8" />
          <span className="text-xs">{displayFileName(file)}</span>
    </div>
  );
}

function PreviewDialog({
  orderId,
  objectUrl,
  file,
  type,
  disabled,
}: {
  orderId: string;
  objectUrl?: string;
  file: OrderFile;
  type: PreviewType;
  disabled?: boolean;
}) {
  const { t } = useT();
  return (
    <FullscreenFileViewer
      orderId={orderId}
      objectUrl={objectUrl}
      file={file}
      type={type}
      disabled={disabled}
      trigger={
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Eye className="mr-2 h-4 w-4" />
          {t('media.view')}
        </Button>
      }
    />
  );
}

function FullscreenFileViewer({
  orderId,
  objectUrl,
  file,
  type,
  disabled,
  trigger,
}: {
  orderId: string;
  objectUrl?: string;
  file: OrderFile;
  type: PreviewType;
  disabled?: boolean;
  trigger: ReactNode;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  // Lazy high-res fetch — runs ONLY once the dialog opens. Images pull
  // the ~1600px `lg` variant (the card already holds the thumb, which
  // shows instantly below while this loads); PDFs and videos pull
  // their original since nothing lighter can represent them. Nothing
  // here is fetched while the dialog stays closed — that's the whole
  // point of dropping the eager full-size card fetches.
  const wantsOwnFetch = type === 'image' || type === 'pdf' || type === 'video';
  const fullRes = useSecureFileUrl(
    orderId,
    file.id,
    open && wantsOwnFetch,
    type === 'image' ? 'lg' : undefined,
  );
  const effectiveUrl = fullRes.objectUrl ?? objectUrl;

  // Stop click-to-close from firing when the user clicks ON the image —
  // only background clicks should dismiss. Defined here so both image and
  // non-image branches share it.
  const onBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled && nextOpen) return;
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="fixed inset-0 left-0 top-0 h-screen w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-black/95 p-0 text-white ring-0 sm:max-w-none"
        onClick={onBackdropClick}
      >
        <DialogTitle className="sr-only">{displayFileName(file)}</DialogTitle>

        {/* Top bar — combines caption and close button into one flex row so
            they never overlap on narrow phones (previous absolute-positioned
            pair could collide below ~360 px). */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="pointer-events-none min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {displayFileName(file)}
            </p>
            <p className="mt-0.5 hidden text-xs text-white/60 sm:block">
              {t('media.closeHint')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('media.closePreview')}
            onClick={() => setOpen(false)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white shadow-lg transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-11 sm:w-11"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — for images we go straight to the <img> with viewport-relative
            constraints. Avoiding the previous percentage chain (parent h-* →
            child max-h-full → image) because some flexbox/grid combinations
            stop propagating the height cap, leaving the image at intrinsic
            size and clipping past the viewport. */}
        {type === 'image' && effectiveUrl ? (
          // ── Image preview surface ──
          // Was `flex h-full w-full` with inline `maxWidth/maxHeight:100%`
          // on the <img>. That path breaks for portrait phone photos
          // (4000×6000+) because `h-full` only resolves correctly when
          // every ancestor up the chain explicitly defines a height —
          // and shadcn's DialogContent doesn't propagate it through
          // the flex flow once the absolute-positioned top bar is
          // present. Result: image rendered at intrinsic size and only
          // the top of the head showed.
          //
          // Switching the container to `absolute inset-0` pins it to
          // the fixed-positioned DialogContent on all four sides, so
          // the box has a real computed height. The image then uses
          // Tailwind's `max-h-full max-w-full object-contain` which is
          // the reliable pattern for "fit inside its parent, preserve
          // aspect" and works for any source size.
          <div
            className="absolute inset-0 flex items-center justify-center p-2 pt-14 pb-4 sm:p-6 sm:pt-16 sm:pb-6"
            onClick={onBackdropClick}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={effectiveUrl}
              alt={displayFileName(file)}
              draggable={false}
              decoding="async"
              onClick={(event) => event.stopPropagation()}
              className="block max-h-full max-w-full select-none rounded-md object-contain shadow-2xl"
            />
          </div>
        ) : wantsOwnFetch && fullRes.loading && !effectiveUrl ? (
          <div className="flex h-full w-full items-center justify-center pt-14">
            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
          </div>
        ) : (
          <div
            className="flex h-full w-full items-center justify-center p-3 pt-14 sm:p-8 sm:pt-20"
            onClick={onBackdropClick}
          >
            <div
              className="h-[min(82vh,820px)] w-[min(96vw,1280px)] overflow-hidden rounded-md bg-background text-foreground shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <PreviewSurface
                orderId={orderId}
                objectUrl={effectiveUrl}
                file={file}
                type={type}
                large
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SlotFilePreview({
  orderId,
  file,
  secureFile,
}: {
  orderId: string;
  file: OrderFile;
  /** Pre-hoisted from the parent so we don't double-fetch the blob. */
  secureFile: SecureFileResult;
}) {
  const { t } = useT();
  const previewType = getPreviewType(file);
  const { objectUrl, loading, error } = secureFile;
  const viewerDisabled = loading || (!!error && previewType !== 'model');
  // Prefetch the fullscreen `lg` variant on hover/focus so the viewer opens
  // instantly.
  const prefetch =
    previewType === 'image'
      ? () => prefetchSecureFile(orderId, file.id, 'lg')
      : undefined;

  return (
    <div
      onMouseEnter={prefetch}
      className="group relative aspect-[4/3] w-full max-w-[320px] overflow-hidden rounded-xl border bg-muted/30 shadow-sm transition hover:border-primary hover:ring-4 hover:ring-primary/10 sm:max-w-[260px]"
    >
      {loading ? (
        <Skeleton className="h-full w-full rounded-xl" />
      ) : previewType === 'image' && objectUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={objectUrl}
          alt={displayFileName(file)}
          loading="lazy"
          decoding="async"
          // `object-contain` so the FULL image is visible inside the 4:3
          // card (portrait / square shots don't get cropped).
          className="h-full w-full object-contain bg-muted/40"
        />
      ) : previewType === 'model' ? (
        // Static server-rendered thumbnail — the live 3D viewer only mounts
        // when the user opens the fullscreen dialog.
        <StlStaticPreview orderId={orderId} file={file} />
      ) : (
        <span className="grid h-full w-full place-items-center text-muted-foreground">
          {previewType === 'pdf' ? (
            <FileText className="h-10 w-10" />
          ) : previewType === 'video' ? (
            <Video className="h-10 w-10" />
          ) : (
            <ImageIcon className="h-10 w-10" />
          )}
        </span>
      )}

      {/* Hover overlay — two actions: open full screen + download. Appears
          on hover / keyboard focus; the buttons are separate interactive
          elements (the full-screen one drives the viewer, the download one
          fetches the original bytes). */}
      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-foreground/45 opacity-0 backdrop-blur-[1px] transition group-hover:opacity-100 group-focus-within:opacity-100">
        <FullscreenFileViewer
          orderId={orderId}
          objectUrl={objectUrl}
          file={file}
          type={previewType}
          disabled={viewerDisabled}
          trigger={
            <button
              type="button"
              disabled={viewerDisabled}
              // Warm the fullscreen `lg` variant as early as possible so
              // the dialog opens on a cache hit instead of a fresh fetch:
              // on focus (keyboard), on pointer-enter (mouse arriving at
              // the button), and on pointer-down (the instant of a tap —
              // covers touch, where there's no hover to pre-warm on).
              onFocus={prefetch}
              onPointerEnter={prefetch}
              onPointerDown={prefetch}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-background px-3 text-xs font-semibold text-foreground shadow-md transition hover:bg-background/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Maximize2 className="h-4 w-4" />
              {previewType === 'model' ? t('media.view3d') : t('media.fullView')}
            </button>
          }
        />
        <button
          type="button"
          onClick={() => downloadOrderFile(orderId, file)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-background px-3 text-xs font-semibold text-foreground shadow-md transition hover:bg-background/90"
        >
          <Download className="h-4 w-4" />
          {t('media.download')}
        </button>
      </div>
    </div>
  );
}

function ClinicalMediaSlot({
  orderId,
  title,
  icon: Icon,
  accept,
  referenceImage,
  disabled,
  readOnly,
  uploading,
  progress,
  file,
  onSelect,
  clipboard,
  onClipboard,
}: {
  orderId: string;
  title: string;
  icon: typeof ImageIcon;
  accept?: string;
  /** Optional placeholder image showing the expected view orientation. */
  referenceImage?: string;
  disabled?: boolean;
  /**
   * Pure VIEW mode (order-detail page). Hides every upload affordance —
   * the picker label, the Replace/Edit/Copy/Paste row — leaving only a
   * clean, tappable preview. Distinct from `disabled`, which is also
   * true transiently while a sibling slot is mid-upload.
   */
  readOnly?: boolean;
  /** This slot's file is currently uploading — drives the progress bar. */
  uploading?: boolean;
  /** Upload progress 0-100 (null when not uploading). */
  progress?: number | null;
  file?: OrderFile;
  onSelect: (file: File) => void;
  /**
   * Shared cross-slot image clipboard. When a sibling slot has copied
   * its image, the entry lives here and every other slot offers a
   * "Paste" affordance backed by it. Null when nothing is copied.
   */
  clipboard?: ImageClipboardEntry | null;
  /** Update the shared clipboard. Called from the Copy button. */
  onClipboard?: (entry: ImageClipboardEntry | null) => void;
}) {
  const { t } = useT();
  const inputId = useMemo(
    () => `upload-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    [title],
  );

  // Hoist the secure-blob fetch up here (instead of leaving it inside
  // SlotFilePreview) so the preview thumbnail is fetched exactly once.
  // The slot grid fetches THUMB variants only — 8 clinical slots used
  // to pull 8 full-resolution originals on page load; now it's 8
  // ~10 KB WebPs. Edit/Copy fetch the original on demand (below).
  const isImage = !!file && file.mimeType.startsWith('image/');
  const previewType = file ? getPreviewType(file) : 'file';
  const secureFile = useSecureFileUrl(
    orderId,
    file?.id ?? '',
    !!file && previewType === 'image',
    'thumb',
  );

  // Intercept the OS picker — instead of uploading immediately, open the
  // editor so the user can rotate/flip the image first. Non-image files
  // (e.g. PDFs picked for radiography) skip the editor entirely.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [reEditing, setReEditing] = useState(false);

  const handlePicked = (picked: File) => {
    if (picked.type.startsWith('image/')) {
      setPendingFile(picked);
    } else {
      onSelect(picked);
    }
  };

  // Re-open the editor with the ALREADY-UPLOADED image. This MUST fetch
  // the ORIGINAL bytes — the preview blob is now a 300px thumbnail
  // variant, and editing + re-uploading that would silently destroy the
  // photo's resolution. The fetch is on-demand (only when the user
  // actually clicks Edit), so the page-load win from thumbnails stays.
  const handleEditExisting = async () => {
    if (!file) return;
    if (!isImage) {
      toast.error(t('media.toasts.onlyImagesEditable'));
      return;
    }
    setReEditing(true);
    try {
      const blob = await fetchOriginalBlob(orderId, file.id);
      const reconstructed = new File([blob], displayFileName(file), {
        type: blob.type || file.mimeType || 'image/jpeg',
      });
      setPendingFile(reconstructed);
    } catch (err) {
      // Log the underlying error for diagnostics; surface a clean toast.
      console.error('[ClinicalMediaSlot] edit-existing failed:', err);
      toast.error(t('media.toasts.editorOpenFailed'));
    } finally {
      setReEditing(false);
    }
  };

  // ── Copy / Paste handlers ──────────────────────────────────────────────
  // "Copy" feeds a fresh File into the shared clipboard, named after
  // the slot title so the pasted upload reads human-readably. It MUST
  // fetch the ORIGINAL bytes — the preview blob is a 300px thumbnail
  // variant now, and pasting that into another slot would re-upload a
  // thumbnail as if it were the clinical photo.
  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    if (!file || !isImage || !onClipboard) return;
    setCopying(true);
    try {
      const blob = await fetchOriginalBlob(orderId, file.id);
      const ext = file.mimeType.split('/')[1] || 'jpg';
      const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const reconstructed = new File([blob], `${safeTitle}.${ext}`, {
        type: blob.type || file.mimeType || 'image/jpeg',
      });
      onClipboard({ file: reconstructed, sourceTitle: title });
      toast.success(t('media.toasts.copied', { title }));
    } catch (err) {
      console.error('[ClinicalMediaSlot] copy failed:', err);
      toast.error(t('media.toasts.copyFailed'));
    } finally {
      setCopying(false);
    }
  };

  const handlePaste = () => {
    if (!clipboard) return;
    // Re-wrap as a new File so re-pasting into multiple slots doesn't
    // share the same reference (a few backend code paths read .name and
    // would otherwise see all uploads collide on identical names).
    const pastedFile = new File([clipboard.file], clipboard.file.name, {
      type: clipboard.file.type,
      lastModified: Date.now(),
    });
    onSelect(pastedFile);
    toast.success(
      t('media.toasts.pasted', { source: clipboard.sourceTitle, target: title }),
    );
  };

  return (
    <div className="grid w-full max-w-[340px] justify-items-center gap-3 rounded-xl border bg-background p-3 text-center shadow-sm sm:max-w-none sm:p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>

      {file ? (
        <SlotFilePreview
          orderId={orderId}
          file={file}
          secureFile={secureFile}
        />
      ) : readOnly ? (
        // VIEW mode, empty slot — no picker affordance, just a calm
        // "not provided" placeholder so the order detail reads clean.
        <div className="grid aspect-[4/3] w-full max-w-[320px] place-items-center rounded-xl border border-dashed bg-muted/20 text-center sm:max-w-[260px]">
          <span className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="h-7 w-7 opacity-40" />
            {t('media.notProvided')}
          </span>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            'group relative grid aspect-[4/3] w-full max-w-[320px] cursor-pointer place-items-center overflow-hidden rounded-xl border bg-muted/30 transition hover:border-primary hover:bg-primary/5 sm:max-w-[260px]',
            disabled && 'pointer-events-none opacity-60',
          )}
        >
          {referenceImage ? (
            <>
              {/* `object-contain` shows the whole reference (the X-ray
                  doesn't get zoomed/cropped). A neutral inner backdrop
                  keeps the image readable when its own padding is light,
                  and prevents it from melting into the card. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={referenceImage}
                alt={`${title} reference`}
                aria-hidden
                className="h-full w-full object-contain p-2 transition group-hover:scale-[1.02]"
              />

              {/* Subtle inset border separates the image area from the
                  card edge. */}
              <span
                className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-border/40 transition group-hover:ring-primary/40"
                aria-hidden
              />

              {/* Soft "Click to upload your photo" overlay — only visible
                  on hover/focus so it doesn't compete with the reference
                  image at rest. Makes the affordance discoverable without
                  a permanent badge over the picture. */}
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-foreground/70 via-foreground/35 to-transparent px-3 pt-6 pb-2 text-[11px] font-semibold uppercase tracking-wide text-background opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
                aria-hidden
              >
                <UploadCloud className="h-3.5 w-3.5" />
                Click to upload your photo
              </span>
            </>
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-2xl bg-background shadow-sm">
              <Icon className="h-9 w-9 text-muted-foreground transition group-hover:text-primary" />
            </span>
          )}
        </label>
      )}

      <input
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (!selected) {
            event.currentTarget.value = '';
            return;
          }
          handlePicked(selected);
          event.currentTarget.value = '';
        }}
      />

      {/* Live upload progress — visible while THIS slot's file transfers.
          CBCT-grade photos are small, but a real bar reassures the user
          the save is in flight rather than stalled. */}
      {uploading && (
        <div className="w-full max-w-[320px] space-y-1 sm:max-w-[260px]">
          <Progress value={progress ?? 0} className="h-1.5" />
          <p className="text-[10px] font-semibold tabular-nums text-primary">
            {t('media.uploadingPct', { pct: String(progress ?? 0) })}
          </p>
        </div>
      )}

      {/* Action row — hidden entirely in VIEW mode so the order detail
          stays clean (no greyed-out Upload/Replace buttons). */}
      {!readOnly && (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="secondary" size="sm" asChild disabled={disabled}>
          <label htmlFor={inputId} className="cursor-pointer">
            <UploadCloud className="mr-2 h-4 w-4" />
            {file ? t('media.replace') : t('media.upload')}
          </label>
        </Button>
        {file && file.mimeType.startsWith('image/') && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleEditExisting}
            disabled={disabled || reEditing}
            title={t('media.rotateTooltip')}
          >
            {reEditing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t('common.edit')}
          </Button>
        )}
        {/* Copy — only when the slot has an image AND the parent wired
            the shared clipboard. Reads the bytes from the local blob URL
            and stashes a File reference for sibling slots to paste. */}
        {file && isImage && onClipboard && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={disabled || copying || !secureFile.objectUrl}
            title={t('media.copyTooltip', { title })}
          >
            {copying ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t('media.copy')}
          </Button>
        )}
        {/* Paste — visible on EVERY slot whenever the shared clipboard
            holds something, including the one it was copied FROM (handy
            if the user copies, picks a different image somewhere else,
            then wants to restore the original). Pasting onto a filled
            slot replaces the image, same as the Replace button. */}
        {clipboard && onClipboard && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePaste}
            disabled={disabled}
            title={t('media.pasteTooltip', { source: clipboard.sourceTitle })}
            className="border-primary/40 text-primary"
          >
            <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" />
            {file ? t('media.pasteOver') : t('media.pasteImage')}
          </Button>
        )}
      </div>
      )}

      {file && (
        <p className="max-w-48 truncate text-xs text-muted-foreground">
          {displayFileName(file)}
        </p>
      )}

      {pendingFile && (
        <ImageEditDialog
          file={pendingFile}
          title={title}
          referenceImage={referenceImage}
          onCancel={() => setPendingFile(null)}
          onConfirm={(edited) => {
            setPendingFile(null);
            onSelect(edited);
          }}
        />
      )}
    </div>
  );
}

function StlUploadTile({
  orderId,
  title,
  disabled,
  uploading,
  progress,
  file,
  readOnly,
  onSelect,
  onDelete,
}: {
  orderId: string;
  title: string;
  disabled?: boolean;
  uploading?: boolean;
  progress?: number | null;
  file?: OrderFile;
  readOnly?: boolean;
  onSelect: (file: File) => void;
  onDelete: (fileId: string) => void;
}) {
  const { t } = useT();
  const inputId = useMemo(
    () => `upload-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    [title],
  );

  return (
    <div className="rounded-md border bg-background p-4">
      <input
        id={inputId}
        type="file"
        accept=".stl,.ply,.obj"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (!selected) return;
          onSelect(selected);
          event.currentTarget.value = '';
        }}
      />
      <div className="flex flex-col gap-4">
        {uploading && (
          <div className="space-y-1">
            <Progress value={progress ?? 0} className="h-1.5" />
            <p className="text-[10px] font-semibold tabular-nums text-primary">
              {t('media.uploadingPct', { pct: String(progress ?? 0) })}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-muted">
              <Box className="h-5 w-5 text-primary" />
            </span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">
                {file ? displayFileName(file) : t('media.noStlSelected')}
              </p>
            </div>
          </div>
          {!readOnly && (
            <Button
              type="button"
              variant={file ? 'outline' : 'secondary'}
              size="sm"
              asChild
              disabled={disabled}
            >
              <label htmlFor={inputId} className="cursor-pointer">
                <UploadCloud className="mr-2 h-4 w-4" />
                {file ? t('media.replace') : t('media.upload')}
              </label>
            </Button>
          )}
        </div>

        {file ? (
          <div className="space-y-3">
            {extensionFor(file.originalName) === 'stl' ? (
              // Live interactive 3D viewer, inline. It dynamically imports
              // three.js and prefers the pipeline's optimized GLB variant
              // (≈half the bytes of the raw STL, normals computed in the
              // browser), so the model loads fast while still being fully
              // rotatable/zoomable right in the slot — no extra click.
              <StlModelViewer orderId={orderId} file={file} />
            ) : (
              <ModelPlaceholder file={file} />
            )}
            <div className="flex flex-wrap gap-2">
              <FullscreenFileViewer
                orderId={orderId}
                file={file}
                type={getPreviewType(file)}
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    <Maximize2 className="mr-2 h-4 w-4" />
                    {t('media.fullView')}
                  </Button>
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadOrderFile(orderId, file)}
              >
                <Download className="mr-2 h-4 w-4" />
                {t('media.download')}
              </Button>
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-red-600"
                  onClick={() => onDelete(file.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('common.delete')}
                </Button>
              )}
            </div>
          </div>
        ) : readOnly ? (
          // VIEW mode, empty STL slot — calm placeholder, no picker.
          <div className="grid min-h-44 place-items-center rounded-md border border-dashed bg-muted/20 p-6 text-center">
            <span className="space-y-2 text-muted-foreground">
              <Box className="mx-auto h-9 w-9 opacity-40" />
              <span className="block text-xs">{t('media.notProvided')}</span>
            </span>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className={cn(
              'grid min-h-44 cursor-pointer place-items-center rounded-md border border-dashed bg-muted/20 p-6 text-center transition hover:border-primary hover:bg-primary/5',
              disabled && 'pointer-events-none opacity-60',
            )}
          >
            <span className="space-y-2 text-muted-foreground">
              <Box className="mx-auto h-9 w-9" />
              <span className="block text-sm font-medium text-foreground">
                {t('media.uploadThisStl')}
              </span>
              <span className="block text-xs">{t('media.stlFormats')}</span>
            </span>
          </label>
        )}
      </div>
    </div>
  );
}

function StlModelViewer({
  orderId,
  file,
  large,
}: {
  orderId: string;
  file: OrderFile;
  large?: boolean;
}) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0); // bump to force retry
  const optimizedModelVariant = file.variants?.model ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let disposed = false;
    let frameId = 0;
    let renderer: import('three').WebGLRenderer | undefined;
    let controls:
      | import('three/examples/jsm/controls/OrbitControls.js').OrbitControls
      | undefined;
    let geometry: import('three').BufferGeometry | undefined;
    let edgeGeometry: import('three').BufferGeometry | undefined;
    let material: import('three').Material | undefined;
    let edgeMaterial: import('three').Material | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let abortController: AbortController | undefined;

    const clearCanvas = () => {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };

    /**
     * Self-diagnosing fetch — surfaces the actual HTTP status and a
     * trimmed response snippet instead of a generic "Unable to load"
     * message. Common real-world causes we want visible:
     *   - 401 → auth token expired between page load and STL render
     *   - 404 → file row exists in DB but the bytes on disk are gone
     *   - 413 → nginx body-size limit hit (large STL)
     *   - network error → CORS / DNS / dropped connection
     */
    const fetchStlBuffer = async (signal: AbortSignal, variant?: string) => {
      const token = getAccessToken();
      const url = buildDownloadUrl(orderId, file.id, variant);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal,
        });
      } catch (err) {
        // Network-level failures (DNS, CORS, offline, mixed-content)
        // arrive as TypeError("Failed to fetch") with no status code.
        throw new Error(
          `Network error contacting ${url}: ${(err as Error).message}`,
        );
      }

      if (!response.ok) {
        // Try to surface the backend's reason without trusting it to
        // be JSON — exception filters sometimes return text/plain.
        let detail = '';
        try {
          const text = await response.text();
          detail = text.slice(0, 200);
        } catch {
          /* ignore */
        }
        throw new Error(
          `STL download failed (HTTP ${response.status} ${response.statusText})` +
            (detail ? `: ${detail}` : ''),
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        throw new Error('STL download returned 0 bytes.');
      }
      return arrayBuffer;
    };

    const init = async () => {
      try {
        setStatus('loading');
        setErrorMessage(undefined);
        clearCanvas();

        const [THREE, loaderModule, controlsModule] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/STLLoader.js'),
          import('three/examples/jsm/controls/OrbitControls.js'),
        ]);

        abortController = new AbortController();

        // Prefer the pipeline's optimized GLB (indexed + deduped —
        // typically 40-60% smaller than the raw STL and parses faster).
        // Any GLB failure falls back to the original STL so the viewer
        // never regresses for legacy/unprocessed files.
        let loadedGeometry: import('three').BufferGeometry | undefined;
        if (optimizedModelVariant) {
          try {
            const glbBuffer = await fetchStlBuffer(
              abortController.signal,
              'model',
            );
            if (disposed) return;
            const gltfModule = await import(
              'three/examples/jsm/loaders/GLTFLoader.js'
            );
            const gltf = await new gltfModule.GLTFLoader().parseAsync(
              glbBuffer,
              '',
            );
            gltf.scene.traverse((obj) => {
              const mesh = obj as import('three').Mesh;
              if (!loadedGeometry && mesh.isMesh) {
                loadedGeometry = mesh.geometry as import('three').BufferGeometry;
              }
            });
          } catch {
            loadedGeometry = undefined; // fall through to raw STL
          }
        }

        if (!loadedGeometry) {
          const arrayBuffer = await fetchStlBuffer(abortController.signal);
          if (disposed) return;
          loadedGeometry = new loaderModule.STLLoader().parse(arrayBuffer);
        }
        if (disposed) return;

        const scene = new THREE.Scene();
        // No scene.background — `alpha: true` keeps the renderer
        // transparent so the soft light gradient on the container shows
        // through. That's the "default" look the wrapping card defines.
        const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.width = '100%';
        container.appendChild(renderer.domElement);

        geometry = loadedGeometry;
        // The pipeline's GLB ships positions only (no normals — half
        // the bytes), and raw STL needs them computed anyway.
        geometry.computeVertexNormals();
        geometry.center();
        geometry.computeBoundingSphere();

        const radius = geometry.boundingSphere?.radius || 1;
        const scale = radius > 0 ? 1.35 / radius : 1;

        // Dark grey model material — Tailwind slate-600 (#475569). Reads
        // as clearly dental but contrasts strongly against the white card.
        material = new THREE.MeshStandardMaterial({
          color: 0x596b80,
          metalness: 0.08,
          roughness: 0.48,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.setScalar(scale);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);

        // Edge overlay — slate-900 at low opacity so it crisps up the
        // silhouette against white without dominating the surface shading.
        edgeMaterial = new THREE.LineBasicMaterial({
          color: 0x0f172a,
          transparent: true,
          opacity: 0.25,
        });
        edgeGeometry = new THREE.EdgesGeometry(geometry, 28);
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        mesh.add(edges);

        // Lighting tuned for a dark model on a white scene — bright
        // hemisphere keeps shadows soft, key light gives the cusps depth.
        const ambient = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 2.2);
        scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
        keyLight.position.set(3, -4, 5);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 1.1);
        fillLight.position.set(-4, 3, 3);
        scene.add(fillLight);

        // Reference grid ("échelle") stays removed — clean white-box
        // presentation, no floor lines.

        camera.position.set(0, -4.2, 2.2);
        controls = new controlsModule.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.autoRotate = false;
        controls.target.set(0, 0, 0);
        controls.update();

        const resize = () => {
          if (!renderer || !container) return;
          const width = Math.max(container.clientWidth, 280);
          const height = Math.max(container.clientHeight, large ? 360 : 240);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };

        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);

        const animate = () => {
          if (disposed || !renderer) return;
          controls?.update();
          renderer.render(scene, camera);
          frameId = window.requestAnimationFrame(animate);
        };

        animate();
        setStatus('ready');
      } catch (error) {
        if (disposed) return;
        // Log full error to console — the UI message gets truncated and
        // we want stack + cause available in DevTools for diagnostics.
        console.error('[StlModelViewer] load failed:', error);
        // undefined → the render falls back to the localized
        // t('media.unableToLoadStl') message.
        setErrorMessage(error instanceof Error ? error.message : undefined);
        setStatus('error');
      }
    };

    init();

    return () => {
      disposed = true;
      abortController?.abort();
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      controls?.dispose();
      geometry?.dispose();
      edgeGeometry?.dispose();
      material?.dispose();
      edgeMaterial?.dispose();
      renderer?.dispose();
      clearCanvas();
    };
    // `reloadKey` is part of the deps so clicking Retry replays the effect
    // without unmounting the component.
  }, [file.id, optimizedModelVariant, orderId, large, reloadKey]);

  return (
    <div
      className={cn(
        // Default theme — soft light gradient. Matches the rest of the
        // dashboard's card surfaces; transparent canvas sits on top.
        'relative w-full overflow-hidden rounded-md bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.10),_transparent_46%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.55))]',
        large ? 'h-full min-h-[420px]' : 'h-64 md:h-72',
      )}
    >
      <div
        ref={containerRef}
        className="h-full w-full"
      />
      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center bg-background/70 text-sm text-muted-foreground">
          {t('media.loading3d')}
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 p-4 text-center">
          <p className="max-w-md text-sm font-medium text-red-600">
            {errorMessage ?? t('media.unableToLoadStl')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
              className="gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('media.retry')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => downloadOrderFile(orderId, file)}
              className="gap-2"
            >
              <Download className="h-3.5 w-3.5" />
              {t('media.downloadInstead')}
            </Button>
          </div>
        </div>
      )}
      {status === 'ready' && (
        <div className="absolute bottom-3 left-3 rounded-full bg-background/85 px-3 py-1 text-xs font-medium shadow-sm">
          {t('media.dragHint')}
        </div>
      )}
    </div>
  );
}

function ModelPlaceholder({ file, large }: { file: OrderFile; large?: boolean }) {
  const { t } = useT();
  return (
    <div
      className={cn(
        'relative grid place-items-center rounded-md border bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.16),_transparent_46%),linear-gradient(135deg,_hsl(var(--muted)),_hsl(var(--background)))]',
        large ? 'h-full min-h-[420px] w-full' : 'h-full w-full',
      )}
    >
      <div
        className={cn(
          'grid place-items-center rounded-md border border-primary/30 bg-background/80 shadow-sm',
          large ? 'h-20 w-20 rotate-45' : 'h-16 w-16 rotate-45',
        )}
      >
        <Box
          className={cn(
            '-rotate-45 text-primary',
            large ? 'h-8 w-8' : 'h-7 w-7',
          )}
        />
      </div>
      <span className="absolute bottom-3 rounded-full bg-background/85 px-3 py-1 text-xs font-medium">
        {t('media.modelBadge', {
          ext: extensionFor(file.originalName).toUpperCase(),
        })}
      </span>
    </div>
  );
}

/**
 * Static STL preview — the server-rendered thumbnail when the pipeline
 * has produced one, otherwise a lightweight placeholder with geometry
 * facts. Never touches three.js and never downloads the model itself;
 * the live viewer mounts exclusively in the fullscreen dialog.
 */
function StlStaticPreview({
  orderId,
  file,
  tall,
}: {
  orderId: string;
  file: OrderFile;
  tall?: boolean;
}) {
  const { t } = useT();
  // Only request the variant when the API says it exists — for STL a
  // blind request would fall back to the RAW model bytes, which an
  // <img> can't render.
  const hasThumb = Boolean(file.variants?.thumb);
  const { objectUrl, loading } = useSecureFileUrl(
    orderId,
    file.id,
    hasThumb,
    'thumb',
  );
  const stlMeta =
    file.mediaMetadata && (file.mediaMetadata as { kind?: string }).kind === 'stl'
      ? (file.mediaMetadata as unknown as import('@/lib/types').StlMediaMetadata)
      : undefined;

  return (
    <div
      className={cn(
        'relative grid h-full w-full place-items-center overflow-hidden rounded-md bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.10),_transparent_46%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.55))]',
        tall && 'h-64 md:h-72',
      )}
    >
      {hasThumb && loading ? (
        <Skeleton className="h-full w-full" />
      ) : hasThumb && objectUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={objectUrl}
          alt={displayFileName(file)}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="grid place-items-center gap-2 p-4 text-center text-muted-foreground">
          <Box className="h-9 w-9 text-primary/70" />
          <span className="text-xs font-medium">{t('media.stlModel')}</span>
          {stlMeta && (
            <span className="text-[11px]">
              {t('media.stlTriangles', {
                count: stlMeta.triangleCount.toLocaleString(),
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact one-line ZIP facts under a gallery card. */
function ZipMetaSummary({
  meta,
}: {
  meta: import('@/lib/types').ZipMediaMetadata;
}) {
  const { t } = useT();
  return (
    <div className="space-y-1 rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
      <p>
        {t('media.zipFiles', { count: String(meta.entryCount) })} ·{' '}
        {t('media.zipUncompressed', {
          size: formatBytes(meta.totalUncompressedBytes),
        })}
      </p>
      {meta.suspicious && (
        <p className="font-medium text-amber-600">{t('media.zipSuspicious')}</p>
      )}
    </div>
  );
}

/**
 * ZIP preview surface — metadata only, by design. The archive is NEVER
 * inflated or rendered in the browser; this panel shows what the
 * backend read from the central directory so the user can decide
 * whether to download the (potentially 800 MB CBCT) bundle.
 */
function ZipMetaPanel({
  meta,
  file,
  large,
}: {
  meta: import('@/lib/types').ZipMediaMetadata;
  file: OrderFile;
  large?: boolean;
}) {
  const { t } = useT();

  if (!large) {
    return (
      <div className="grid place-items-center gap-1.5 p-3 text-center text-muted-foreground">
        <FileArchive className="h-8 w-8" />
        <span className="text-xs font-medium text-foreground">
          {t('media.zipArchive')}
        </span>
        <span className="text-[11px]">
          {t('media.zipFiles', { count: String(meta.entryCount) })} ·{' '}
          {formatBytes(file.size)}
        </span>
      </div>
    );
  }

  const shown = meta.topLevelEntries.slice(0, 24);
  const hidden = Math.max(0, meta.topLevelEntries.length - shown.length);

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-muted">
          <FileArchive className="h-6 w-6 text-primary" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{displayFileName(file)}</p>
          <p className="text-xs text-muted-foreground">
            {t('media.zipFiles', { count: String(meta.entryCount) })} ·{' '}
            {formatBytes(file.size)} ·{' '}
            {t('media.zipUncompressed', {
              size: formatBytes(meta.totalUncompressedBytes),
            })}
          </p>
        </div>
      </div>

      {meta.suspicious && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          {t('media.zipSuspicious')}
        </p>
      )}

      {shown.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('media.zipContents')}
          </p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {shown.map((entry) => (
              <li
                key={entry}
                className="truncate rounded bg-muted/40 px-2 py-1 font-mono text-xs"
              >
                {entry}
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('media.zipMore', { count: String(hidden) })}
            </p>
          )}
        </div>
      )}

      <p className="mt-auto text-xs text-muted-foreground">
        {t('media.zipNoPreview')}
      </p>
    </div>
  );
}

function ZipUploadAction({
  orderId,
  title,
  category,
  files,
  onDelete,
  readOnly,
}: {
  orderId: string;
  title: string;
  category: OrderFileCategory;
  /**
   * Full file list for the order — we filter to ZIP-category items
   * plus single-file .dcm uploads so the bundle area renders BOTH
   * shapes the upload flow can produce.
   */
  files: OrderFile[];
  /**
   * Soft-delete a single file by id. Required when readOnly is false;
   * ignored when readOnly is true.
   */
  onDelete?: (fileId: string) => void;
  /**
   * When true, render a view-only variant for the order-detail page:
   * the upload action row + per-file trash buttons are hidden, but
   * the uploaded-bundles list still renders so admins / patients can
   * see what was provided.
   */
  readOnly?: boolean;
}) {
  const uploadFiles = useUploadOrderFiles();
  const fileInputId = useMemo(
    () => `bundle-upload-${orderId}-${category}`,
    [orderId, category],
  );

  // Pick the files that belong to THIS control: ZIP archives, standalone
  // .dcm uploads (which land in IMAGE category), and any other loose
  // attachment (uploaded under the neutral OTHER category — never used by
  // the structured photo / radiography / STL slots).
  const bundleFiles = useMemo(
    () =>
      files
        .filter((f) => {
          if (f.category === OrderFileCategory.ZIP) return true;
          if (f.category === OrderFileCategory.OTHER) return true;
          const ext = f.originalName?.split('.').pop()?.toLowerCase();
          return ext === 'dcm';
        })
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [files],
  );

  const [pendingDelete, setPendingDelete] = useState<OrderFile | null>(null);

  const { t } = useT();

  // ── Staged (chosen-but-not-yet-uploaded) files ─────────────────
  // The backend takes ONE category per multipart request, so a batch
  // must be homogeneous: either a SINGLE .zip archive, OR one-or-more
  // .dcm DICOM files — never mixed. We enforce that at selection time
  // and surface a removable list so the user reviews the batch before
  // it uploads.
  const [staged, setStaged] = useState<File[]>([]);
  const stagedKind: 'zip' | 'files' | null = staged.length
    ? extOf(staged[0]) === 'zip'
      ? 'zip'
      : 'files'
    : null;

  // ── Live progress state ────────────────────────────────────────
  // CBCT / DICOM archives sit between 200 MB and 1 GB; axios reports a
  // single GLOBAL percentage for the whole multipart request (all files
  // stream together), so we render ONE batch progress bar rather than a
  // per-file bar the backend can't actually feed.
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadingCount, setUploadingCount] = useState<number | null>(null);
  // Chunked-upload extras: the current phase for the status line, and
  // whether an interrupted upload can be resumed (server session alive).
  const [chunkPhase, setChunkPhase] = useState<ChunkedUploadPhase | null>(null);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const queryClient = useQueryClient();

  // True while the client-side content-security pre-check reads file
  // headers — normally a few ms, but gates the picker so a second pick
  // can't race the first.
  const [checking, setChecking] = useState(false);

  const isUploading = uploadFiles.isPending || progress !== null;

  // Validate + classify a fresh selection, then merge into `staged` under
  // the "one ZIP bundle OR any number of loose files" rule. ANY file type
  // is accepted except scripts/executables (dropped by the security sniff).
  const onPickFiles = async (picked: File[]) => {
    if (picked.length === 0) return;

    // Content-security pre-check — read each file's HEADER (and extension)
    // and drop anything that is a script/executable or a fake container.
    // The backend re-validates authoritatively; this just fails fast with a
    // clear, localized reason so the doctor isn't left guessing.
    setChecking(true);
    const safe: File[] = [];
    try {
      for (const f of picked) {
        const threat = await sniffClientThreat(f);
        if (threat) {
          toast.error(t(`media.zipAction.security.${threat}`, { name: f.name }));
        } else {
          safe.push(f);
        }
      }
    } finally {
      setChecking(false);
    }
    if (safe.length === 0) return;

    const zips = safe.filter((f) => extOf(f) === 'zip');
    const others = safe.filter((f) => extOf(f) !== 'zip');

    // A ZIP is an exclusive bundle — the backend takes one category per
    // request, so it can't share a batch with loose files.
    if (zips.length > 0 && others.length > 0) {
      toast.error(t('media.zipAction.mixError'));
      return;
    }

    if (zips.length > 0) {
      // Only one ZIP at a time — a ZIP selection REPLACES the staged set.
      if (zips.length > 1) toast.warning(t('media.zipAction.oneZipReplaced'));
      const zip = zips[zips.length - 1];
      // Fail fast on the 1 GB ZIP ceiling — the server enforces it too,
      // but rejecting BEFORE a multi-minute transfer is basic courtesy.
      if (zip.size > 1024 * 1024 * 1024) {
        toast.error(t('media.chunked.tooBig', { name: zip.name }));
        return;
      }
      setResumeAvailable(false);
      setStaged([zip]);
      return;
    }

    // Loose files (any type) — can't sit on top of a staged ZIP.
    if (stagedKind === 'zip') {
      toast.error(t('media.zipAction.removeZipFirst'));
      return;
    }
    // Append, de-duplicating by name+size so re-picking a file is a no-op.
    setStaged((cur) => {
      const seen = new Set(cur.map((f) => `${f.name}:${f.size}`));
      const additions = others.filter((f) => !seen.has(`${f.name}:${f.size}`));
      return [...cur, ...additions];
    });
  };

  const removeStaged = (index: number) =>
    setStaged((cur) => cur.filter((_, i) => i !== index));

  /**
   * Chunked path for large ZIPs: segments + per-chunk retry + resume.
   * The server session survives interruptions, so re-invoking this after
   * a failure continues from the last received chunk.
   */
  const startChunkedZipUpload = async (file: File) => {
    setResumeAvailable(false);
    setUploadingCount(1);
    setProgress(0);
    try {
      await uploadFileChunked(orderId, file, category, {
        onProgress: setProgress,
        onPhase: setChunkPhase,
      });
      toast.success(t('media.chunked.done'));
      setStaged([]);
      // Same cache refresh as the single-shot mutation's onSuccess.
      await queryClient.invalidateQueries({
        queryKey: orderKeys.files(orderId),
      });
      await queryClient.invalidateQueries({
        queryKey: orderKeys.detail(orderId),
      });
    } catch (error) {
      const err = error as ResumableUploadError & {
        response?: { status?: number; data?: { message?: string } };
      };
      const serverMessage = err.response?.data?.message;
      if (err.response?.status === 409 && serverMessage) {
        // Duplicate upload — the backend message is user-friendly.
        toast.error(serverMessage);
        setStaged([]);
      } else if (err.resumable) {
        toast.error(t('media.chunked.failed'));
        setResumeAvailable(true);
      } else {
        toast.error(serverMessage ?? t('media.chunked.failed'));
      }
    } finally {
      window.setTimeout(() => {
        setProgress(null);
        setUploadingCount(null);
        setChunkPhase(null);
      }, 600);
    }
  };

  const startUploadBatch = () => {
    if (staged.length === 0) return;
    // Large single ZIPs go through the chunked/resumable pipeline; small
    // files keep the proven single-request path.
    if (
      stagedKind === 'zip' &&
      staged[0].size > CHUNKED_UPLOAD_THRESHOLD_BYTES
    ) {
      void startChunkedZipUpload(staged[0]);
      return;
    }
    // ZIP → the caller's category (ZIP). A pure DICOM batch → IMAGE (the
    // existing single-.dcm routing). Any other loose file(s) → OTHER, so
    // arbitrary attachments land in a neutral bucket and still surface in
    // the uploaded-files list below.
    const cat =
      stagedKind === 'zip'
        ? category
        : staged.every((f) => extOf(f) === 'dcm')
          ? OrderFileCategory.IMAGE
          : OrderFileCategory.OTHER;
    setUploadingCount(staged.length);
    setProgress(0);
    uploadFiles.mutate(
      {
        id: orderId,
        files: staged,
        category: cat,
        onProgress: (percent) => setProgress(percent),
      },
      {
        onSuccess: () => setStaged([]),
        onSettled: () => {
          // Slight delay so the user sees "100%" before the bar disappears
          // — "100% transferred" isn't quite "saved" (server flush + DB
          // insert happen after the last byte lands).
          window.setTimeout(() => {
            setProgress(null);
            setUploadingCount(null);
          }, 600);
        },
      },
    );
  };

  return (
    <>
      {/* Upload action row — hidden on the order-detail page. When read-
          only we still render a compact header so the bundles list has
          context ("here are the uploaded archives for this order"). */}
      {readOnly ? (
        bundleFiles.length > 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-4">
            <FileArchive className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {t('media.zipAction.uploadedBundleTitle')}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('media.zipAction.uploadedBundleDesc')}
              </p>
            </div>
          </div>
        ) : null
      ) : (
      <div className="space-y-3 rounded-xl border border-dashed bg-muted/20 p-4">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileArchive className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('media.zipAction.pickerHint')}
              </p>
            </div>
          </div>
          {/* One unified picker: `multiple` lets the dentist select a
              whole DICOM series at once; the extension guard in
              onPickFiles keeps a ZIP batch to a single archive. */}
          <Button type="button" variant="outline" size="sm" asChild>
            <label
              htmlFor={fileInputId}
              className={cn(
                'cursor-pointer gap-2',
                (isUploading || checking) && 'pointer-events-none opacity-50',
              )}
            >
              <UploadCloud className="h-4 w-4" />
              {staged.length
                ? t('media.zipAction.addMore')
                : t('media.zipAction.chooseFiles')}
            </label>
          </Button>
          <input
            id={fileInputId}
            type="file"
            multiple
            // No `accept` filter — the OS picker shows ALL file types. The
            // security sniff + backend scan reject scripts/executables.
            className="sr-only"
            disabled={isUploading || checking}
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              event.currentTarget.value = '';
              void onPickFiles(picked);
            }}
          />
        </div>

        {/* Content-security pre-check indicator — brief, shown while file
            headers are read. Reassures the doctor uploads are scanned. */}
        {checking && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('media.zipAction.security.checking')}
          </p>
        )}

        {/* Staged list — review + remove before uploading. */}
        {staged.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('media.zipAction.stagedTitle')}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={isUploading}
                onClick={() => setStaged([])}
              >
                {t('media.zipAction.clearStaged')}
              </Button>
            </div>
            <ul className="divide-y rounded-lg border bg-card">
              {staged.map((file, index) => {
                const ext = extOf(file);
                const isDicom = ext === 'dcm';
                const isZip = ext === 'zip';
                const Icon = isDicom ? FileImage : isZip ? FileArchive : FileText;
                const iconTint = isDicom
                  ? 'bg-violet-100 text-violet-700'
                  : isZip
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground';
                const badgeLabel = isDicom
                  ? t('media.zipAction.dicomBadge')
                  : isZip
                    ? t('media.zipAction.zipBadge')
                    : ext
                      ? ext.toUpperCase()
                      : t('media.zipAction.fileBadge');
                return (
                  <li
                    key={`${file.name}:${file.size}:${index}`}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                        iconTint,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-medium"
                        title={file.name}
                      >
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {formatBytes(file.size)}
                        </span>
                        <span className="mx-1.5 opacity-60">·</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          {badgeLabel}
                        </span>
                        <span className="mx-1.5 opacity-60">·</span>
                        <span className={cn(isUploading && 'text-primary')}>
                          {isUploading
                            ? t('media.zipAction.statusUploading')
                            : t('media.zipAction.statusQueued')}
                        </span>
                        <span className="mx-1.5 opacity-60">·</span>
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                          <ShieldCheck className="h-3 w-3" />
                          {t('media.zipAction.security.verifiedBadge')}
                        </span>
                      </p>
                    </div>
                    {!isUploading && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t('media.zipAction.removeAria', {
                          name: file.name,
                        })}
                        onClick={() => removeStaged(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button
              type="button"
              size="sm"
              className="w-full gap-2 sm:w-auto"
              disabled={isUploading || staged.length === 0}
              onClick={startUploadBatch}
            >
              <UploadCloud className="h-4 w-4" />
              {resumeAvailable
                ? t('media.chunked.resume')
                : t('media.zipAction.uploadCount', { count: staged.length })}
            </Button>
          </div>
        )}
      </div>
      )}

      {/* ── Batch progress bar ─────────────────────────────────────
          Visible only while an upload is in flight. Stays on screen
          for ~600 ms after the request settles so the user sees the
          final 100% — important UX when the upload took minutes. The
          percentage is the GLOBAL transfer for the whole batch (all
          files stream in a single multipart request). */}
      {isUploading && uploadingCount && (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              <p className="truncate text-sm font-medium">
                {t('media.zipAction.uploadingBatch', { count: uploadingCount })}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
              {progress ?? 0}%
            </span>
          </div>
          <Progress value={progress ?? 0} className="h-2" />
          {/* Chunked uploads narrate their phase; the single-shot path
              keeps the original "finalising" hint at 100%. */}
          {chunkPhase ? (
            <p className="text-xs text-primary">
              {t(`media.chunked.${chunkPhase}`)}
            </p>
          ) : (
            progress === 100 && (
              <p className="text-xs text-primary">
                {t('media.zipAction.finalising')}
              </p>
            )
          )}
        </div>
      )}

      {/* ── Uploaded bundles list ────────────────────────────────────
          Without this strip the user has no idea their 200 MB CBCT
          actually landed — they see the progress bar finish and the
          slot reverts to its empty state. This list is the authoritative
          "yes, it's saved" feedback, with metadata + a destructive
          confirm before any file is removed. */}
      {bundleFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {bundleFiles.length === 1
              ? t('media.zipAction.bundleCountOne')
              : t('media.zipAction.bundleCountMany', {
                  count: bundleFiles.length,
                })}
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {bundleFiles.map((file) => {
              const ext = (file.originalName?.split('.').pop() ?? '').toLowerCase();
              const isDicom = ext === 'dcm';
              const isZip = ext === 'zip' || file.category === OrderFileCategory.ZIP;
              const isDICOMBundleFile = file.category === OrderFileCategory.OTHER;
              const Icon = isDicom ? FileImage : isZip ? FileArchive : FileText;
              const iconTint = isDicom
                ? 'bg-violet-100 text-violet-700'
                : isZip
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground';
              const badgeLabel = isDicom
                ? 'DICOM'
                : isZip
                  ? t('media.zipAction.zipBadge')
                  : isDICOMBundleFile
                    ? t('media.zipAction.dicomBadge')
                    : ext
                      ? ext.toUpperCase()
                      : t('media.zipAction.fileBadge');
              return (
                <li
                  key={file.id}
                  className="flex items-center gap-3 px-3 py-2.5 sm:px-4"
                >
                  <span
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-lg',
                      iconTint,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      title={displayFileName(file)}
                    >
                      {displayFileName(file)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {formatBytes(file.size)}
                      </span>
                      <span className="mx-1.5 opacity-60">·</span>
                      <span
                        title={new Date(file.createdAt).toLocaleString()}
                      >
                        {formatDistanceToNow(new Date(file.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      <span className="mx-1.5 opacity-60">·</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {badgeLabel}
                      </span>
                    </p>
                  </div>
                  {/* Download — always visible (both modes). Uses the
                      shared `downloadOrderFile` helper which fetches
                      the file with the JWT then streams it to a
                      hidden <a download> click, so the browser saves
                      under the original filename without ever exposing
                      a token in the URL bar. */}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    aria-label={t('media.zipAction.downloadAria', {
                      name: displayFileName(file),
                    })}
                    onClick={() => downloadOrderFile(orderId, file)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {!readOnly && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t('media.zipAction.deleteAria', {
                        name: displayFileName(file),
                      })}
                      disabled={uploadFiles.isPending}
                      onClick={() => setPendingDelete(file)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Destructive confirm — never mounts in read-only mode. CBCT
          volumes are typically the single biggest asset on an order, so
          an inline single-tap delete would be a foot-gun. */}
      {!readOnly && (
        <>
          <AlertDialog
            open={!!pendingDelete}
            onOpenChange={(o) => !o && setPendingDelete(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('media.zipAction.deleteBundleTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="font-medium">
                    {pendingDelete ? displayFileName(pendingDelete) : ''}
                  </span>{' '}
                  {t('media.zipAction.deleteBundleDesc')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    if (pendingDelete && onDelete) onDelete(pendingDelete.id);
                    setPendingDelete(null);
                  }}
                >
                  {t('media.zipAction.deleteFile')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}

/** Lower-cased file extension (without the dot), or '' if none. */
function extOf(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

// Script/executable extensions refused at pick time (mirrors the backend
// `CODE_EXTENSIONS` denylist in file-security.ts). Any OTHER extension is
// accepted — the policy is "any file type except scripts/executables".
const CLIENT_CODE_EXTENSIONS = new Set<string>([
  'exe', 'dll', 'so', 'dylib', 'bin', 'msi', 'msp', 'com', 'scr', 'cpl',
  'sys', 'drv', 'ocx', 'efi', 'apk', 'app', 'dmg', 'pkg', 'deb', 'rpm',
  'appimage', 'msix', 'sh', 'bash', 'zsh', 'ksh', 'csh', 'bat', 'cmd',
  'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'js', 'mjs', 'cjs', 'jse', 'wsf',
  'wsh', 'hta', 'ahk', 'py', 'pyc', 'pyo', 'pyw', 'rb', 'pl', 'pm', 'php',
  'php3', 'php4', 'php5', 'php7', 'phtml', 'phar', 'lua', 'tcl', 'groovy',
  'asp', 'aspx', 'ashx', 'asmx', 'jsp', 'jspx', 'cgi', 'htaccess', 'cshtml',
  'vbhtml', 'html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz', 'mht', 'mhtml',
  'url', 'xml', 'xsl', 'xslt', 'jar', 'class', 'dex', 'war', 'ear', 'docm',
  'xlsm', 'pptm', 'dotm', 'xltm', 'potm', 'xlam', 'ppam', 'sldm', 'xll',
  'lnk', 'reg', 'scf', 'inf', 'sct', 'wsc', 'job', 'msc', 'gadget', 'chm',
  'pif', 'application',
]);

/**
 * Fast client-side content sniff — reads the file HEADER (not the whole
 * file) and flags anything whose extension is a script/executable, whose
 * bytes are a program/executable, that carries runnable script/markup, or
 * (for a `.zip`) doesn't actually start like a ZIP. A UX courtesy so the
 * doctor gets an instant, clear reason; the backend (`file-security.ts`)
 * re-validates authoritatively and is the real gate. Returns an i18n reason
 * code, or null when clean. Never throws — a read error resolves to null so
 * the backend still decides.
 */
async function sniffClientThreat(
  file: File,
): Promise<'executable' | 'script' | 'mismatch' | 'blockedType' | null> {
  // Extension denylist first — instant, no read needed.
  if (CLIENT_CODE_EXTENSIONS.has(extOf(file))) return 'blockedType';
  try {
    // 64 KB header: enough for signatures, the DICOM preamble (@128), and
    // any leading script markup — without reading a 1 GB CBCT into memory.
    const headerLen = Math.min(file.size, 64 * 1024);
    const bytes = new Uint8Array(await file.slice(0, headerLen).arrayBuffer());
    const at = (sig: number[], off = 0) =>
      sig.every((b, i) => bytes[off + i] === b);

    // Executable / script binary signatures (offset 0).
    if (
      at([0x4d, 0x5a]) || // MZ (PE .exe/.dll)
      at([0x7f, 0x45, 0x4c, 0x46]) || // ELF
      at([0x23, 0x21]) || // #! shebang
      at([0xca, 0xfe, 0xba, 0xbe]) || // Java class / Mach-O fat
      at([0xfe, 0xed, 0xfa, 0xce]) ||
      at([0xfe, 0xed, 0xfa, 0xcf]) ||
      at([0xce, 0xfa, 0xed, 0xfe]) ||
      at([0xcf, 0xfa, 0xed, 0xfe]) ||
      at([0xd0, 0xcf, 0x11, 0xe0]) // OLE compound
    ) {
      return 'executable';
    }

    const ext = extOf(file);
    if (ext === 'zip') {
      const isZip =
        at([0x50, 0x4b, 0x03, 0x04]) ||
        at([0x50, 0x4b, 0x05, 0x06]) ||
        at([0x50, 0x4b, 0x07, 0x08]);
      if (!isZip) return 'mismatch';
    }

    // A DICOM with the standard preamble is trusted binary — skip the
    // text-marker scan (medical volumes can contain arbitrary bytes).
    const isDicom =
      ext === 'dcm' &&
      bytes.length >= 132 &&
      at([0x44, 0x49, 0x43, 0x4d], 128); // "DICM"
    if (!isDicom) {
      const text = new TextDecoder('latin1').decode(bytes).toLowerCase();
      const markers = [
        '<?php',
        '<script',
        '#!/bin/',
        '#!/usr/bin/',
        '<!doctype html',
        '<html',
        '<svg',
        'powershell',
        'javascript:',
        'createobject(',
        'activexobject',
        // high-signal code / command-execution tokens (mirror backend)
        'os.popen',
        'os.system',
        'subprocess',
        'child_process',
        'require(',
        'eval(',
        'exec(',
        'shell_exec',
        '/bin/sh',
      ];
      if (markers.some((m) => text.includes(m))) return 'script';
    }

    return null;
  } catch {
    return null; // never block on a read error — the backend still validates
  }
}

function SectionIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-3xl text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function SaveDraftNotice() {
  const { t } = useT();
  return (
    <Card>
      <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
        <FileUp className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">{t('media.saveDraftFirst')}</p>
        <p className="text-sm text-muted-foreground">
          {t('media.saveDraftFirstDetail')}
        </p>
      </CardContent>
    </Card>
  );
}

function FileCategorySelect({
  value,
  onChange,
}: {
  value: OrderFileCategory;
  onChange: (value: OrderFileCategory) => void;
}) {
  const { t } = useT();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as OrderFileCategory)}>
      <SelectTrigger id="order-file-category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {categories.map(([value, labelKey]) => (
          <SelectItem key={value} value={value}>
            {t(labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type PreviewType = 'image' | 'pdf' | 'video' | 'model' | 'file';

export interface SecureFileResult {
  objectUrl?: string;
  loading: boolean;
  error?: string;
  refresh: () => void;
}

// ── Module-level blob cache for order-file previews ──────────────────────
// Clinical photos are multi-MB. Without a cache, the fullscreen viewer
// re-fetched the `lg` variant on EVERY open (and cards re-fetched their
// thumb on every remount), so opening a picture always paid a fresh
// network round-trip — the "takes time to open" lag. We keep one in-memory
// map URL → blob URL (+ in-flight promise dedupe + LRU eviction) so each
// variant downloads at most once per session, re-opens are instant, and we
// can PREFETCH on hover so even the first open is instant. Mirrors the
// proven cache in use-authed-image.ts.
const SECURE_FILE_CACHE_MAX = 60;
type SecureBlobEntry = { promise: Promise<string>; blobUrl?: string };
const secureFileCache = new Map<string, SecureBlobEntry>();

function touchSecureKey(key: string): void {
  const entry = secureFileCache.get(key);
  if (!entry) return;
  secureFileCache.delete(key);
  secureFileCache.set(key, entry); // re-insert → most-recently-used
}

function evictSecureCache(): void {
  while (secureFileCache.size > SECURE_FILE_CACHE_MAX) {
    const oldest = secureFileCache.keys().next().value;
    if (!oldest) break;
    const entry = secureFileCache.get(oldest);
    if (entry?.blobUrl) URL.revokeObjectURL(entry.blobUrl);
    secureFileCache.delete(oldest);
  }
}

function fetchSecureBlobUrl(url: string): Promise<string> {
  const existing = secureFileCache.get(url);
  if (existing) {
    touchSecureKey(url);
    return existing.promise;
  }
  const token = getAccessToken();
  const promise = fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((response) => {
      if (!response.ok) throw new Error('Unable to load preview');
      return response.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      const entry = secureFileCache.get(url);
      if (entry) entry.blobUrl = objectUrl;
      return objectUrl;
    })
    .catch((err: Error) => {
      // Don't poison the cache on failure — drop so the next call retries.
      secureFileCache.delete(url);
      throw err;
    });
  secureFileCache.set(url, { promise });
  evictSecureCache();
  return promise;
}

/**
 * Warm the cache for a file variant before the user opens it — call on
 * hover/focus of a thumbnail so the fullscreen `lg` image is already in
 * flight (usually ready) by the time the click lands.
 */
export function prefetchSecureFile(
  orderId: string,
  fileId: string,
  variant?: string,
): void {
  if (typeof window === 'undefined' || !getAccessToken()) return;
  void fetchSecureBlobUrl(buildDownloadUrl(orderId, fileId, variant)).catch(
    () => undefined,
  );
}

function useSecureFileUrl(
  orderId: string,
  fileId: string,
  enabled: boolean,
  /**
   * Optimized variant to fetch (thumb | md | lg). The backend falls
   * back to the original automatically while processing is pending,
   * so cards can request thumbnails blindly — a 10 KB WebP instead of
   * the multi-MB original on every render.
   */
  variant?: string,
): SecureFileResult {
  const url = buildDownloadUrl(orderId, fileId, variant);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    url: string;
    version: number;
    objectUrl?: string;
    loading: boolean;
    error?: string;
  }>(() => {
    // Synchronous cache hit → no skeleton flash on remount / re-open.
    if (!enabled) return { url, version: 0, loading: false };
    const entry = secureFileCache.get(url);
    if (entry?.blobUrl) {
      touchSecureKey(url);
      return { url, version: 0, objectUrl: entry.blobUrl, loading: false };
    }
    return { url, version: 0, loading: true };
  });

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const entry = secureFileCache.get(url);
    if (entry?.blobUrl) {
      queueMicrotask(() => {
        if (!active) return;
        touchSecureKey(url);
        setState({
          url,
          version,
          objectUrl: entry.blobUrl,
          loading: false,
        });
      });
      return undefined;
    }
    fetchSecureBlobUrl(url)
      .then((objectUrl) => {
        if (active) setState({ url, version, objectUrl, loading: false });
      })
      .catch((error: Error) => {
        if (active) setState({ url, version, loading: false, error: error.message });
      });
    return () => {
      active = false;
    };
    // `version` lets refresh() force a re-fetch after eviction.
  }, [enabled, url, version]);

  // No per-unmount revocation: blob URLs live in the shared module cache
  // and may still be in use by another mount. Eviction revokes them.

  const hasCurrentState =
    enabled && state.url === url && state.version === version;

  return {
    objectUrl: hasCurrentState ? state.objectUrl : undefined,
    loading: enabled ? (hasCurrentState ? state.loading : true) : false,
    error: hasCurrentState ? state.error : undefined,
    refresh: () => {
      const entry = secureFileCache.get(url);
      if (entry?.blobUrl) URL.revokeObjectURL(entry.blobUrl);
      secureFileCache.delete(url);
      setVersion((current) => current + 1);
    },
  };
}

function getPreviewType(file: OrderFile): PreviewType {
  const extension = extensionFor(file.originalName);
  if (file.mimeType.startsWith('image/')) return 'image';
  if (file.mimeType === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (file.mimeType.startsWith('video/')) return 'video';
  if (['stl', 'ply', 'obj'].includes(extension)) return 'model';
  return 'file';
}

function buildDownloadUrl(orderId: string, fileId: string, variant?: string) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
  const base = `${apiBase}/orders/${orderId}/files/${fileId}/download`;
  return variant ? `${base}?variant=${encodeURIComponent(variant)}` : base;
}

/**
 * Authenticated fetch of the ORIGINAL bytes. Used by flows that must
 * never operate on an optimized variant: re-editing a slot photo and
 * copy/paste between slots both re-upload their result, so feeding
 * them a 300px thumbnail would silently destroy the original quality.
 */
async function fetchOriginalBlob(orderId: string, fileId: string): Promise<Blob> {
  const token = getAccessToken();
  const response = await fetch(buildDownloadUrl(orderId, fileId), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Original download failed (HTTP ${response.status})`);
  }
  return response.blob();
}

function withSlotName(slotKey: string, file: File) {
  return new File([file], `${slotKey}__${file.name}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

function fileForSlot(
  files: OrderFile[],
  slot: UploadSlotDefinition,
  allSlots: readonly UploadSlotDefinition[],
) {
  const prefixed = latestByCreatedAt(
    files.filter((file) => file.originalName.startsWith(`${slot.key}__`)),
  );

  if (prefixed) return prefixed;

  const categoryUsedMoreThanOnce =
    allSlots.filter((item) => item.category === slot.category).length > 1;

  if (categoryUsedMoreThanOnce) return undefined;

  return latestByCreatedAt(
    files.filter(
      (file) =>
        file.category === slot.category && !file.originalName.includes('__'),
    ),
  );
}

function latestByCreatedAt(files: OrderFile[]) {
  return [...files].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  )[0];
}

function displayFileName(file: OrderFile) {
  // Show the clean, meaningful name the backend assigns
  // (Doctor_Patient_category_NNN) everywhere — viewer caption, cards,
  // labels, downloads — NEVER the client's "image1.jpeg". Legacy rows
  // (no generatedName) fall back to the original with the slot prefix
  // stripped.
  if (file.generatedName) return file.generatedName;
  return file.originalName.replace(/^[a-z0-9-]+__/i, '');
}

function downloadOrderFile(orderId: string, file: OrderFile) {
  const token = getAccessToken();
  fetch(buildDownloadUrl(orderId, file.id), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((response) => response.blob())
    .then((blob) => {
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      // Prefer the backend's clean ordered name (Patient_Category_NNN.ext)
      // so a bulk download lands sorted and self-describing on disk.
      link.download = file.generatedName ?? displayFileName(file);
      link.click();
      URL.revokeObjectURL(href);
    });
}

function labelForCategory(
  category: OrderFileCategory,
  t: (path: string) => string,
) {
  const key =
    categories.find(([value]) => value === category)?.[1] ??
    'media.categories.other';
  return t(key);
}

function extensionFor(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? 'file';
}

// Note: `formatBytes` lives near ZipUploadAction above (line ~1916).
// That version handles GB too — required for the 1 GB CBCT bundles —
// so we share it from here instead of defining a second, MB-capped
// variant that quietly disagrees with the upload-progress strip.
