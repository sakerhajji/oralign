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
import {
  useDeleteOrderFile,
  useOrderFiles,
  useUploadOrderFiles,
} from '@/lib/hooks';
import { getAccessToken } from '@/lib/api';
import { OrderFile, OrderFileCategory } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ImageEditDialog } from './image-edit-dialog';
import { ZipUploadDialog } from './zip-upload-dialog';

const categories = [
  [OrderFileCategory.RIGHT_PHOTO, 'Right photo'],
  [OrderFileCategory.FRONT_PHOTO, 'Front photo'],
  [OrderFileCategory.LEFT_PHOTO, 'Left photo'],
  [OrderFileCategory.UPPER_PHOTO, 'Upper photo'],
  [OrderFileCategory.LOWER_PHOTO, 'Lower photo'],
  [OrderFileCategory.ORTHOPANTOMOGRAPHY, 'Orthopantomography'],
  [OrderFileCategory.STL, 'STL'],
  [OrderFileCategory.PLY, 'PLY'],
  [OrderFileCategory.OBJ, 'OBJ'],
  [OrderFileCategory.ZIP, 'ZIP'],
  [OrderFileCategory.PDF, 'PDF'],
  [OrderFileCategory.IMAGE, 'Images'],
  [OrderFileCategory.VIDEO, 'Videos'],
  [OrderFileCategory.OTHER, 'Other'],
] as const;

// Slot order is meaningful — on a 3-column grid the rows read as:
//   Row 1 (extraoral):  profile      | face-at-rest | smile
//   Row 2 (intraoral):  left lateral | frontal occl | right lateral
//   Row 3 (occlusal):   upper occl   | lower occl
// On 2-column screens they pair into natural left/right couples instead.
const patientImageSlots = [
  // ── Row 1: extraoral facial views ──────────────────────────────────────
  {
    key: 'profile',
    title: 'Profile photo',
    category: OrderFileCategory.LEFT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
    referenceImage: '/defaultImage/Profile%20photo.webp',
  },
  {
    key: 'face-rest',
    title: 'Face at rest photo',
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
    title: 'Smile photo',
    category: OrderFileCategory.FRONT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
    referenceImage: '/defaultImage/Faceatrestphoto.webp',
  },
  // ── Row 2: intraoral left / frontal / right ────────────────────────────
  {
    key: 'left-lateral',
    title: 'Left lateral view',
    category: OrderFileCategory.LEFT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
    referenceImage: '/defaultImage/Leftlateralview.webp',
  },
  {
    key: 'frontal-occlusion',
    title: 'Frontal occlusion view',
    category: OrderFileCategory.FRONT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
    referenceImage: '/defaultImage/Frontalocclusionview.webp',
  },
  {
    key: 'right-lateral',
    title: 'Right lateral view',
    category: OrderFileCategory.RIGHT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
    referenceImage: '/defaultImage/Rightlateralview.webp',
  },
  // ── Row 3: intraoral occlusal views ────────────────────────────────────
  {
    key: 'upper-occlusal',
    title: 'Upper occlusal view',
    category: OrderFileCategory.UPPER_PHOTO,
    icon: ScanLine,
    accept: 'image/*',
    referenceImage: '/defaultImage/Upperocclusalview.webp',
  },
  {
    key: 'lower-occlusal',
    title: 'Lower occlusal view',
    category: OrderFileCategory.LOWER_PHOTO,
    icon: ScanLine,
    accept: 'image/*',
    referenceImage: '/defaultImage/Lowerocclusalview.webp',
  },
] as const;

const radiographySlots = [
  {
    key: 'panoramic',
    title: 'Panoramic radiography',
    category: OrderFileCategory.ORTHOPANTOMOGRAPHY,
    icon: ScanLine,
    accept: 'image/*,.pdf',
    referenceImage: '/defaultImage/Panoramicradiography.webp',
  },
  {
    key: 'profile-tele',
    title: 'Profile teleradiography',
    category: OrderFileCategory.IMAGE,
    icon: ScanLine,
    accept: 'image/*,.pdf',
    referenceImage: '/defaultImage/Profileteleradiography.webp',
  },
] as const;

const stlSlots = [
  {
    key: 'upper-stl',
    title: 'Add Upper STL impression',
    category: OrderFileCategory.STL,
  },
  {
    key: 'lower-stl',
    title: 'Add Lower STL impression',
    category: OrderFileCategory.STL,
  },
  {
    key: 'first-occlusion',
    title: 'Add First occlusion STL',
    category: OrderFileCategory.STL,
  },
  {
    key: 'second-occlusion',
    title: 'Add Second occlusion STL',
    category: OrderFileCategory.STL,
  },
] as const;

type ClinicalFileSection = 'patient-images' | 'radiography-stl';
type UploadSlotDefinition = {
  key: string;
  title: string;
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
                MAX_FILE_SIZE_ZIP_BUNDLE_BYTES vs the default). Only the
                ZIP category — used for CBCT / DICOM bundles — gets the
                1 GB ceiling; everything else stays at 50 MB. */}
            {category === OrderFileCategory.ZIP
              ? 'Max 1 GB per ZIP bundle (CBCT / DICOM)'
              : 'Max 50 MB per file'}
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
}: {
  orderId?: string;
  readOnly?: boolean;
  section: ClinicalFileSection;
}) {
  const filesQuery = useOrderFiles(orderId);
  const uploadFiles = useUploadOrderFiles();
  const deleteFile = useDeleteOrderFile();

  // Lifted clipboard state — shared by every ClinicalMediaSlot below.
  // null when nothing has been copied yet.
  const [clipboard, setClipboard] = useState<ImageClipboardEntry | null>(null);

  if (!orderId) {
    return <SaveDraftNotice />;
  }

  const files = filesQuery.data ?? [];
  const assignedPatientFileIds = new Set(
    patientImageSlots
      .map((slot) => fileForSlot(files, slot, patientImageSlots)?.id)
      .filter(Boolean),
  );
  // Files that explicitly belong to a patient image slot — keyed by the
  // `key__` prefix the upload helper writes. Helps us route legacy items
  // that share a generic category (e.g. IMAGE) into the right bucket.
  const patientSlotKeys = new Set<string>(
    patientImageSlots.map((slot) => slot.key),
  );
  const radiographySlotKeys = new Set<string>(
    radiographySlots.map((slot) => slot.key),
  );
  const extraPatientFiles = files.filter((file) => {
    if (assignedPatientFileIds.has(file.id)) return false;
    const prefix = slotPrefixOf(file);
    if (prefix && patientSlotKeys.has(prefix)) return true;
    if (prefix && radiographySlotKeys.has(prefix)) return false;
    return photoCategories.has(file.category);
  });

  const uploadSlot = (slot: UploadSlotDefinition, file: File) => {
    uploadFiles.mutate({
      id: orderId,
      files: [withSlotName(slot.key, file)],
      category: slot.category,
    });
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
          title="Patient images"
          description="Upload each facial and intraoral view. The faint reference shows the expected angle — rotate or flip your photo to match before it uploads."
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
              title={slot.title}
              icon={slot.icon}
              accept={slot.accept}
              referenceImage={slot.referenceImage}
              disabled={readOnly || uploadFiles.isPending}
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
                  title={slot.title}
                  icon={slot.icon}
                  accept={slot.accept}
                  referenceImage={slot.referenceImage}
                  disabled={readOnly || uploadFiles.isPending}
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

  const assignedRadiographyFileIds = new Set(
    radiographySlots
      .map((slot) => fileForSlot(files, slot, radiographySlots)?.id)
      .filter(Boolean),
  );
  // Same slot-key/category routing logic for radiography. Specifically,
  // avoid pulling in patient-image files that happen to share the IMAGE
  // category (face-rest slot) — they belong above, not here.
  const extraRadiographyFiles = files.filter((file) => {
    if (assignedRadiographyFileIds.has(file.id)) return false;
    const prefix = slotPrefixOf(file);
    if (prefix && radiographySlotKeys.has(prefix)) return true;
    if (prefix && patientSlotKeys.has(prefix)) return false;
    return (
      file.category === OrderFileCategory.ORTHOPANTOMOGRAPHY ||
      file.category === OrderFileCategory.PDF
    );
  });
  const assignedStlFileIds = new Set(
    stlSlots.map((slot) => fileForSlot(files, slot, stlSlots)?.id).filter(Boolean),
  );
  const extraStlFiles = files.filter(
    (file) => modelCategories.has(file.category) && !assignedStlFileIds.has(file.id),
  );

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <SectionIntro
          title="Radiography images"
          description="Include panoramic and profile radiography files to support the diagnosis."
        />
        <div className="grid justify-items-center gap-6 md:grid-cols-2 md:justify-items-stretch">
          {radiographySlots.map((slot) => (
            <ClinicalMediaSlot
              key={slot.key}
              orderId={orderId}
              title={slot.title}
              icon={slot.icon}
              accept={slot.accept}
              referenceImage={slot.referenceImage}
              disabled={readOnly || uploadFiles.isPending}
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
          title="STL files"
          description="Upload upper, lower, and occlusion scan files. STL, PLY, and OBJ are supported by the backend."
        />
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {stlSlots.map((slot) => (
            <StlUploadTile
              key={slot.key}
              orderId={orderId}
              title={slot.title}
              disabled={readOnly || uploadFiles.isPending}
              file={fileForSlot(files, slot, stlSlots)}
              readOnly={readOnly}
              onSelect={(file) => uploadSlot(slot, file)}
              onDelete={(fileId) => deleteFile.mutate({ id: orderId, fileId })}
            />
          ))}
        </div>

        {/* ZIP / CBCT bundle upload — placed here because dentists who
            upload a single archive almost always do so for radiology
            (CBCT DICOM volumes) or to ship a multi-file STL export. The
            ZipUploadDialog audits archive contents client-side before
            anything leaves the browser; CBCT .dcm files are also
            accepted as individual uploads. */}
        {!readOnly && (
          <ZipUploadAction
            orderId={orderId}
            title="Upload bundle (.zip) or CBCT (.dcm)"
            description="Ship a single ZIP archive (e.g. a CBCT DICOM volume, or a multi-file STL export). We audit it client-side for executables and unsafe filenames before saving. Single .dcm DICOM files are also accepted."
            category={OrderFileCategory.ZIP}
            files={files}
            onDelete={(fileId) => deleteFile.mutate({ id: orderId, fileId })}
          />
        )}
        {/* Legacy "Other scan files" list removed for the same reason —
            keep the page focused on the structured slots. */}
      </section>
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
          Failed to load files: {error.message}
        </CardContent>
      </Card>
    );
  }

  if (files.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-28 flex-col items-center justify-center gap-2 pt-6 text-center text-sm text-muted-foreground">
          <FileArchive className="h-7 w-7" />
          No files uploaded yet.
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

function LegacyFileList({
  title,
  description,
  orderId,
  files,
  readOnly,
  onDelete,
}: {
  title: string;
  description: string;
  orderId: string;
  files: OrderFile[];
  readOnly?: boolean;
  onDelete: (fileId: string) => void;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-2">
        {files.map((file) => (
          <LegacyFileRow
            key={file.id}
            orderId={orderId}
            file={file}
            readOnly={readOnly}
            onDelete={() => onDelete(file.id)}
          />
        ))}
      </div>
    </div>
  );
}

function LegacyFileRow({
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
  const previewType = getPreviewType(file);
  const needsBlobPreview = ['image', 'pdf', 'video'].includes(previewType);
  const { objectUrl } = useSecureFileUrl(orderId, file.id, needsBlobPreview);

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{displayFileName(file)}</p>
        <p className="text-xs text-muted-foreground">
          {labelForCategory(file.category)} · {formatBytes(file.size)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <PreviewDialog
          orderId={orderId}
          objectUrl={objectUrl}
          file={file}
          type={previewType}
          disabled={!objectUrl && previewType !== 'model'}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadOrderFile(orderId, file)}
        >
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-red-600"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        )}
      </div>
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
  const previewType = getPreviewType(file);
  const needsBlobPreview = ['image', 'pdf', 'video'].includes(previewType);
  const { objectUrl, loading, error, refresh } = useSecureFileUrl(
    orderId,
    file.id,
    needsBlobPreview,
  );

  return (
    <div className="overflow-hidden rounded-md border bg-background shadow-sm">
      <div className="flex h-40 items-center justify-center bg-muted/30">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : error ? (
          <div className="grid place-items-center gap-2 text-center text-xs text-red-600">
            <RotateCcw className="h-5 w-5" />
            Preview unavailable
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
            {labelForCategory(file.category)} · {formatBytes(file.size)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PreviewDialog
            objectUrl={objectUrl}
            orderId={orderId}
            file={file}
            type={previewType}
            disabled={!objectUrl && previewType !== 'model'}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadOrderFile(orderId, file)}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          {error && (
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
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
              Delete
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
        className={cn(
          large
            ? 'max-h-full max-w-full object-contain'
            : 'h-full w-full object-cover',
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
    return <StlModelViewer orderId={orderId} file={file} large={large} />;
  }

  if (type === 'model') {
    return <ModelPlaceholder file={file} large={large} />;
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
          View
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
  const [open, setOpen] = useState(false);

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
              Click outside or press Esc to close
            </p>
          </div>
          <button
            type="button"
            aria-label="Close preview"
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
        {type === 'image' && objectUrl ? (
          <div
            className="flex h-full w-full items-center justify-center px-2 pt-14 pb-4 sm:px-6 sm:pt-16 sm:pb-6"
            onClick={onBackdropClick}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={objectUrl}
              alt={displayFileName(file)}
              draggable={false}
              onClick={(event) => event.stopPropagation()}
              className="block select-none rounded-md shadow-2xl"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
              }}
            />
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
                objectUrl={objectUrl}
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
  const previewType = getPreviewType(file);
  const { objectUrl, loading, error } = secureFile;

  return (
    <FullscreenFileViewer
      orderId={orderId}
      objectUrl={objectUrl}
      file={file}
      type={previewType}
      disabled={loading || (!!error && previewType !== 'model')}
      trigger={
        <button
          type="button"
          disabled={loading || (!!error && previewType !== 'model')}
          className="group relative aspect-[4/3] w-full max-w-[320px] overflow-hidden rounded-xl border bg-muted/30 shadow-sm transition hover:border-primary hover:ring-4 hover:ring-primary/10 sm:max-w-[260px]"
        >
          {loading ? (
            <Skeleton className="h-full w-full rounded-xl" />
          ) : previewType === 'image' && objectUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={objectUrl}
              alt={displayFileName(file)}
              // `object-contain` so the FULL image is visible inside the
              // 4:3 thumbnail card — previously `object-cover` cropped
              // anything that wasn't a 4:3 photo (portrait shots, square
              // crops, screenshots) and the planner couldn't tell what
              // they'd uploaded without clicking through to the full
              // viewer. Background tint already provides the framing.
              className="h-full w-full object-contain bg-muted/40"
            />
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
          {/* Hover affordance — solid pill in the bottom-right corner so it
              never sits ON the patient photo full-width. */}
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-foreground/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-background opacity-0 shadow transition group-hover:opacity-100">
            View
          </span>
        </button>
      }
    />
  );
}

function ClinicalMediaSlot({
  orderId,
  title,
  icon: Icon,
  accept,
  referenceImage,
  disabled,
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
  const inputId = useMemo(
    () => `upload-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    [title],
  );

  // Hoist the secure-blob fetch up here (instead of leaving it inside
  // SlotFilePreview) so both the preview AND the Edit button reuse the same
  // cached blob — no duplicate authenticated request, no token-refresh race.
  const isImage = !!file && file.mimeType.startsWith('image/');
  const previewType = file ? getPreviewType(file) : 'file';
  const needsBlobPreview =
    !!file && ['image', 'pdf', 'video'].includes(previewType);
  const secureFile = useSecureFileUrl(orderId, file?.id ?? '', needsBlobPreview);

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

  // Re-open the editor with the ALREADY-UPLOADED image. We don't refetch
  // the bytes — `useSecureFileUrl` already loaded them into a blob: URL for
  // the preview. We just convert that local blob back into a File so the
  // editor's existing pipeline can consume it, exactly like an OS-picked
  // file. blob: URLs are same-origin and unauthenticated, so this never
  // races against token expiry or CORS.
  const handleEditExisting = async () => {
    if (!file) return;
    if (!isImage) {
      toast.error('Only images can be rotated or flipped.');
      return;
    }
    if (secureFile.error) {
      toast.error(`Couldn't open the image: ${secureFile.error}`);
      return;
    }
    if (!secureFile.objectUrl) {
      toast.error('The image is still loading — try again in a moment.');
      return;
    }
    setReEditing(true);
    try {
      const response = await fetch(secureFile.objectUrl); // blob: URL, local
      if (!response.ok) throw new Error('Local image cache miss.');
      const blob = await response.blob();
      const reconstructed = new File([blob], displayFileName(file), {
        type: blob.type || file.mimeType || 'image/jpeg',
      });
      setPendingFile(reconstructed);
    } catch (err) {
      // Log the underlying error for diagnostics; surface a clean toast.
      // eslint-disable-next-line no-console
      console.error('[ClinicalMediaSlot] edit-existing failed:', err);
      toast.error('Could not open the editor for this image.');
    } finally {
      setReEditing(false);
    }
  };

  // ── Copy / Paste handlers ──────────────────────────────────────────────
  // The slot's image bytes live as a blob: URL once `useSecureFileUrl`
  // resolves them. To "copy" the image to the shared clipboard, we fetch
  // those bytes (local, instant) and wrap them in a fresh File whose name
  // is the slot's title — so when the user pastes into another slot and
  // we end up uploading the file, the OrderFile.originalName is something
  // human-readable like "front-face.jpg" instead of the original camera
  // filename which may have nothing to do with the new slot.
  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    if (!file || !isImage || !onClipboard) return;
    if (!secureFile.objectUrl) {
      toast.error('The image is still loading — try again in a moment.');
      return;
    }
    setCopying(true);
    try {
      const response = await fetch(secureFile.objectUrl);
      if (!response.ok) throw new Error('Local image cache miss.');
      const blob = await response.blob();
      const ext = file.mimeType.split('/')[1] || 'jpg';
      const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const reconstructed = new File([blob], `${safeTitle}.${ext}`, {
        type: blob.type || file.mimeType || 'image/jpeg',
      });
      onClipboard({ file: reconstructed, sourceTitle: title });
      toast.success(`Copied "${title}" — pick a slot and paste it.`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ClinicalMediaSlot] copy failed:', err);
      toast.error('Could not copy this image.');
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
    toast.success(`Pasted from "${clipboard.sourceTitle}" → "${title}".`);
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

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="secondary" size="sm" asChild disabled={disabled}>
          <label htmlFor={inputId} className="cursor-pointer">
            <UploadCloud className="mr-2 h-4 w-4" />
            {file ? 'Replace' : 'Upload'}
          </label>
        </Button>
        {file && file.mimeType.startsWith('image/') && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleEditExisting}
            disabled={disabled || reEditing}
            title="Rotate or flip the uploaded photo"
          >
            {reEditing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
            )}
            Edit
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
            title={`Copy ${title} so you can paste it into another slot`}
          >
            {copying ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            Copy
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
            title={`Paste the image copied from "${clipboard.sourceTitle}"`}
            className="border-primary/40 text-primary"
          >
            <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" />
            {file ? 'Paste over' : 'Paste image'}
          </Button>
        )}
      </div>

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
  file,
  readOnly,
  onSelect,
  onDelete,
}: {
  orderId: string;
  title: string;
  disabled?: boolean;
  file?: OrderFile;
  readOnly?: boolean;
  onSelect: (file: File) => void;
  onDelete: (fileId: string) => void;
}) {
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-muted">
              <Box className="h-5 w-5 text-primary" />
            </span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">
                {file ? displayFileName(file) : 'No STL selected'}
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
                {file ? 'Replace' : 'Upload'}
              </label>
            </Button>
          )}
        </div>

        {file ? (
          <div className="space-y-3">
            {extensionFor(file.originalName) === 'stl' ? (
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
                    Full View
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
                Download
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
                  Delete
                </Button>
              )}
            </div>
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
                Upload this STL file
              </span>
              <span className="block text-xs">STL, PLY, or OBJ</span>
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0); // bump to force retry

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
    const fetchStlBuffer = async (signal: AbortSignal) => {
      const token = getAccessToken();
      const url = buildDownloadUrl(orderId, file.id);

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
        const arrayBuffer = await fetchStlBuffer(abortController.signal);
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

        geometry = new loaderModule.STLLoader().parse(arrayBuffer);
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
        // eslint-disable-next-line no-console
        console.error('[StlModelViewer] load failed:', error);
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load STL',
        );
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
  }, [file.id, orderId, large, reloadKey]);

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
          Loading 3D STL…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 p-4 text-center">
          <p className="max-w-md text-sm font-medium text-red-600">
            {errorMessage ?? 'Unable to load STL'}
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
              Retry
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => downloadOrderFile(orderId, file)}
              className="gap-2"
            >
              <Download className="h-3.5 w-3.5" />
              Download instead
            </Button>
          </div>
        </div>
      )}
      {status === 'ready' && (
        <div className="absolute bottom-3 left-3 rounded-full bg-background/85 px-3 py-1 text-xs font-medium shadow-sm">
          Drag to rotate · Scroll to zoom
        </div>
      )}
    </div>
  );
}

function ModelPlaceholder({ file, large }: { file: OrderFile; large?: boolean }) {
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
        {extensionFor(file.originalName).toUpperCase()} model
      </span>
    </div>
  );
}

function ZipUploadAction({
  orderId,
  title,
  description,
  category,
  files,
  onDelete,
}: {
  orderId: string;
  title: string;
  description: string;
  category: OrderFileCategory;
  /**
   * Full file list for the order — we filter to ZIP-category items
   * plus single-file .dcm uploads so the bundle area renders BOTH
   * shapes the upload flow can produce.
   */
  files: OrderFile[];
  /** Soft-delete a single file by id. Called from the confirm dialog. */
  onDelete: (fileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const uploadFiles = useUploadOrderFiles();
  const dicomInputId = useMemo(
    () => `dicom-upload-${orderId}-${category}`,
    [orderId, category],
  );

  // Pick the bundles that belong to THIS slot: anything in the ZIP
  // category PLUS standalone .dcm uploads (which land in IMAGE
  // category to keep them out of the photo-slot routing).
  const bundleFiles = useMemo(
    () =>
      files
        .filter((f) => {
          if (f.category === OrderFileCategory.ZIP) return true;
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

  // ── Live progress state ────────────────────────────────────────
  // CBCT / DICOM archives sit between 200 MB and 1 GB; the previous
  // UI just disabled the button and showed nothing, so a doctor would
  // alt-tab to check email and assume the upload had failed silently.
  // We now drive a real progress bar from axios's onUploadProgress
  // event, with the current file name + the percentage rendered
  // inline so the upload's clearly in flight.
  const [progress, setProgress] = useState<number | null>(null);
  const [currentFile, setCurrentFile] = useState<{
    name: string;
    size: number;
  } | null>(null);

  const startUpload = (file: File, cat: OrderFileCategory) => {
    setCurrentFile({ name: file.name, size: file.size });
    setProgress(0);
    uploadFiles.mutate(
      {
        id: orderId,
        files: [file],
        category: cat,
        onProgress: (percent) => setProgress(percent),
      },
      {
        onSettled: () => {
          // Slight delay so the user sees "100%" before the bar disappears
          // — masks the fact that "100% transferred" isn't quite "saved"
          // (the server still needs to flush + DB insert).
          window.setTimeout(() => {
            setProgress(null);
            setCurrentFile(null);
          }, 600);
        },
      },
    );
  };

  const isUploading = uploadFiles.isPending || progress !== null;

  return (
    <>
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <FileArchive className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 self-stretch sm:flex-row sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={isUploading}
            className="gap-2"
          >
            <UploadCloud className="h-4 w-4" />
            Choose ZIP…
          </Button>
          {/* CBCT volumes sometimes ship as a single uncompressed .dcm
              file rather than an archive. Offering a direct uploader
              avoids forcing the dentist to zip a single file. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            asChild
            disabled={isUploading}
          >
            <label htmlFor={dicomInputId} className="cursor-pointer gap-2">
              <UploadCloud className="h-4 w-4" />
              Single .dcm
            </label>
          </Button>
          <input
            id={dicomInputId}
            type="file"
            accept=".dcm,application/dicom"
            className="sr-only"
            disabled={isUploading}
            onChange={(event) => {
              const picked = event.target.files?.[0];
              event.currentTarget.value = '';
              if (!picked) return;
              startUpload(picked, OrderFileCategory.IMAGE);
            }}
          />
        </div>
      </div>

      {/* ── Live progress bar ──────────────────────────────────────
          Visible only while an upload is in flight. Stays on screen
          for ~600 ms after the request settles so the user sees the
          final 100% — important UX when the upload took minutes. */}
      {isUploading && currentFile && (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              <p className="truncate text-sm font-medium">
                Uploading {currentFile.name}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
              {progress ?? 0}%
            </span>
          </div>
          <Progress value={progress ?? 0} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {formatBytes(((progress ?? 0) / 100) * currentFile.size)} /{' '}
            {formatBytes(currentFile.size)}
            {progress === 100 && (
              <span className="ml-2 text-primary">· finalising on server…</span>
            )}
          </p>
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
            {bundleFiles.length} bundle file
            {bundleFiles.length === 1 ? '' : 's'} uploaded
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {bundleFiles.map((file) => {
              const ext = (file.originalName?.split('.').pop() ?? '').toLowerCase();
              const isDicom = ext === 'dcm';
              const isZip = ext === 'zip' || file.category === OrderFileCategory.ZIP;
              const Icon = isDicom ? FileImage : isZip ? FileArchive : FileText;
              const iconTint = isDicom
                ? 'bg-violet-100 text-violet-700'
                : 'bg-primary/10 text-primary';
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
                      title={file.originalName}
                    >
                      {file.originalName}
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
                      {(isDicom || isZip) && (
                        <>
                          <span className="mx-1.5 opacity-60">·</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                            {isDicom ? 'DICOM' : 'ZIP bundle'}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${file.originalName}`}
                    disabled={uploadFiles.isPending}
                    onClick={() => setPendingDelete(file)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ZipUploadDialog
        open={open}
        title={title}
        onClose={() => setOpen(false)}
        onConfirm={(file) => {
          setOpen(false);
          startUpload(file, category);
        }}
      />

      {/* Destructive confirm — CBCT volumes are typically the
          single biggest asset on an order, so an inline single-tap
          delete would be a foot-gun. */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bundle?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{pendingDelete?.originalName}</span>{' '}
              will be removed from this order. The file is soft-deleted on
              the server and can be restored by an admin if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Human-friendly byte formatter (1.2 MB, 873 KB, 1.4 GB, …). Used by
 * the upload progress strip; rounds to one decimal so a 207 MB CBCT
 * archive reads as "207.4 MB" not "207426742 B".
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
  return (
    <Card>
      <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
        <FileUp className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Save the draft before uploading files</p>
        <p className="text-sm text-muted-foreground">
          Files are stored after an order ID exists. Click Continue from the
          patient step or use Save Draft.
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
  return (
    <Select value={value} onValueChange={(next) => onChange(next as OrderFileCategory)}>
      <SelectTrigger id="order-file-category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {categories.map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
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

function useSecureFileUrl(
  orderId: string,
  fileId: string,
  enabled: boolean,
): SecureFileResult {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    objectUrl?: string;
    loading: boolean;
    error?: string;
  }>(() => ({ loading: enabled }));
  const objectUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let active = true;
    const token = getAccessToken();
    const url = buildDownloadUrl(orderId, fileId);

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load preview');
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setState({ objectUrl, loading: false });
      })
      .catch((error: Error) => {
        if (!active) return;
        setState({ loading: false, error: error.message });
      });

    return () => {
      active = false;
    };
  }, [enabled, fileId, orderId, version]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    },
    [],
  );

  return {
    objectUrl: state.objectUrl,
    loading: state.loading,
    error: state.error,
    refresh: () => setVersion((current) => current + 1),
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

function buildDownloadUrl(orderId: string, fileId: string) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
  return `${apiBase}/orders/${orderId}/files/${fileId}/download`;
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
  return file.originalName.replace(/^[a-z0-9-]+__/i, '');
}

/** Returns the slot key encoded into a file's name (the `key__` prefix the
 *  uploader writes), or null for legacy / category-only files. */
function slotPrefixOf(file: OrderFile): string | null {
  const match = file.originalName.match(/^([a-z0-9-]+)__/i);
  return match ? match[1] : null;
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
      link.download = displayFileName(file);
      link.click();
      URL.revokeObjectURL(href);
    });
}

const photoCategories = new Set<OrderFileCategory>([
  OrderFileCategory.RIGHT_PHOTO,
  OrderFileCategory.FRONT_PHOTO,
  OrderFileCategory.LEFT_PHOTO,
  OrderFileCategory.UPPER_PHOTO,
  OrderFileCategory.LOWER_PHOTO,
  OrderFileCategory.IMAGE,
]);

const modelCategories = new Set<OrderFileCategory>([
  OrderFileCategory.STL,
  OrderFileCategory.PLY,
  OrderFileCategory.OBJ,
]);

function labelForCategory(category: OrderFileCategory) {
  return categories.find(([value]) => value === category)?.[1] ?? 'Other';
}

function extensionFor(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? 'file';
}

// Note: `formatBytes` lives near ZipUploadAction above (line ~1916).
// That version handles GB too — required for the 1 GB CBCT bundles —
// so we share it from here instead of defining a second, MB-capped
// variant that quietly disagrees with the upload-progress strip.
