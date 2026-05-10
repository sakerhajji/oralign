'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Box,
  Download,
  Eye,
  FileArchive,
  FileText,
  FileUp,
  ImageIcon,
  Maximize2,
  RotateCcw,
  ScanLine,
  Trash2,
  UploadCloud,
  Video,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  useDeleteOrderFile,
  useOrderFiles,
  useUploadOrderFiles,
} from '@/lib/hooks';
import { getAccessToken } from '@/lib/api';
import { OrderFile, OrderFileCategory } from '@/lib/types';
import { cn } from '@/lib/utils';

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

const patientImageSlots = [
  {
    key: 'smile',
    title: 'Smile photo',
    category: OrderFileCategory.FRONT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
  },
  {
    key: 'face-rest',
    title: 'Face at rest photo',
    category: OrderFileCategory.IMAGE,
    icon: ImageIcon,
    accept: 'image/*',
  },
  {
    key: 'profile',
    title: 'Profile photo',
    category: OrderFileCategory.LEFT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
  },
  {
    key: 'upper-occlusal',
    title: 'Upper occlusal view',
    category: OrderFileCategory.UPPER_PHOTO,
    icon: ScanLine,
    accept: 'image/*',
  },
  {
    key: 'lower-occlusal',
    title: 'Lower occlusal view',
    category: OrderFileCategory.LOWER_PHOTO,
    icon: ScanLine,
    accept: 'image/*',
  },
  {
    key: 'left-lateral',
    title: 'Left lateral view',
    category: OrderFileCategory.LEFT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
  },
  {
    key: 'frontal-occlusion',
    title: 'Frontal occlusion view',
    category: OrderFileCategory.FRONT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
  },
  {
    key: 'right-lateral',
    title: 'Right lateral view',
    category: OrderFileCategory.RIGHT_PHOTO,
    icon: ImageIcon,
    accept: 'image/*',
  },
] as const;

const radiographySlots = [
  {
    key: 'panoramic',
    title: 'Panoramic radiography',
    category: OrderFileCategory.ORTHOPANTOMOGRAPHY,
    icon: ScanLine,
    accept: 'image/*,.pdf',
  },
  {
    key: 'profile-tele',
    title: 'Profile teleradiography',
    category: OrderFileCategory.IMAGE,
    icon: ScanLine,
    accept: 'image/*,.pdf',
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
            Max 50MB per file
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

  if (!orderId) {
    return <SaveDraftNotice />;
  }

  const files = filesQuery.data ?? [];
  const assignedPatientFileIds = new Set(
    patientImageSlots
      .map((slot) => fileForSlot(files, slot, patientImageSlots)?.id)
      .filter(Boolean),
  );
  const extraPatientFiles = files.filter(
    (file) => photoCategories.has(file.category) && !assignedPatientFileIds.has(file.id),
  );

  const uploadSlot = (slot: UploadSlotDefinition, file: File) => {
    uploadFiles.mutate({
      id: orderId,
      files: [withSlotName(slot.key, file)],
      category: slot.category,
    });
  };

  if (section === 'patient-images') {
    return (
      <div className="space-y-6">
        <SectionIntro
          title="Patient images"
          description="Upload the facial and intraoral views that help the clinical team read the case quickly."
        />
        <div className="grid gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
          {patientImageSlots.map((slot) => (
            <ClinicalMediaSlot
              key={slot.key}
              orderId={orderId}
              title={slot.title}
              icon={slot.icon}
              accept={slot.accept}
              disabled={readOnly || uploadFiles.isPending}
              file={fileForSlot(files, slot, patientImageSlots)}
              onSelect={(file) => uploadSlot(slot, file)}
            />
          ))}
        </div>
        {extraPatientFiles.length > 0 && (
          <LegacyFileList
            title="Other patient images"
            description="These files were uploaded before slot tracking was added."
            orderId={orderId}
            files={extraPatientFiles}
            readOnly={readOnly}
            onDelete={(fileId) => deleteFile.mutate({ id: orderId, fileId })}
          />
        )}
      </div>
    );
  }

  const assignedRadiographyFileIds = new Set(
    radiographySlots
      .map((slot) => fileForSlot(files, slot, radiographySlots)?.id)
      .filter(Boolean),
  );
  const extraRadiographyFiles = files.filter(
    (file) =>
      (file.category === OrderFileCategory.ORTHOPANTOMOGRAPHY ||
        file.category === OrderFileCategory.IMAGE ||
        file.category === OrderFileCategory.PDF) &&
      !assignedRadiographyFileIds.has(file.id),
  );
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
        <div className="grid gap-6 md:grid-cols-2">
          {radiographySlots.map((slot) => (
            <ClinicalMediaSlot
              key={slot.key}
              orderId={orderId}
              title={slot.title}
              icon={slot.icon}
              accept={slot.accept}
              disabled={readOnly || uploadFiles.isPending}
              file={fileForSlot(files, slot, radiographySlots)}
              onSelect={(file) => uploadSlot(slot, file)}
            />
          ))}
        </div>
        {extraRadiographyFiles.length > 0 && (
          <LegacyFileList
            title="Other radiography files"
            description="These files are still attached to this order."
            orderId={orderId}
            files={extraRadiographyFiles}
            readOnly={readOnly}
            onDelete={(fileId) => deleteFile.mutate({ id: orderId, fileId })}
          />
        )}
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
        {extraStlFiles.length > 0 && (
          <LegacyFileList
            title="Other scan files"
            description="These scans were uploaded before individual STL slots were tracked."
            orderId={orderId}
            files={extraStlFiles}
            readOnly={readOnly}
            onDelete={(fileId) => deleteFile.mutate({ id: orderId, fileId })}
          />
        )}
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
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setOpen(false);
          }
        }}
      >
        <DialogTitle className="sr-only">{displayFileName(file)}</DialogTitle>
        <button
          type="button"
          aria-label="Close preview"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white shadow-lg transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[calc(100vw-6rem)]">
          <p className="truncate text-sm font-semibold text-white">
            {displayFileName(file)}
          </p>
          <p className="mt-0.5 text-xs text-white/60">
            Click outside or press Esc to close
          </p>
        </div>
        <div
          className="flex h-full w-full items-center justify-center p-4 pt-20 sm:p-8 sm:pt-20"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div
            className={cn(
              'max-h-full max-w-full overflow-hidden',
              type === 'image'
                ? 'grid h-[calc(100vh-7rem)] w-[calc(100vw-2rem)] place-items-center'
                : 'h-[min(82vh,820px)] w-[min(94vw,1280px)] rounded-md bg-background text-foreground shadow-2xl',
            )}
            onClick={(event) => {
              if (type !== 'image') {
                event.stopPropagation();
                return;
              }

              const target = event.target as HTMLElement;
              if (target.tagName.toLowerCase() === 'img') {
                event.stopPropagation();
                return;
              }

              setOpen(false);
            }}
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
      </DialogContent>
    </Dialog>
  );
}

function CircleFilePreview({
  orderId,
  file,
}: {
  orderId: string;
  file: OrderFile;
}) {
  const previewType = getPreviewType(file);
  const needsBlobPreview = ['image', 'pdf', 'video'].includes(previewType);
  const { objectUrl, loading, error } = useSecureFileUrl(
    orderId,
    file.id,
    needsBlobPreview,
  );

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
          className="group relative h-32 w-32 overflow-hidden rounded-full border bg-muted/30 shadow-sm transition hover:border-primary hover:ring-4 hover:ring-primary/10"
        >
          {loading ? (
            <Skeleton className="h-full w-full rounded-full" />
          ) : previewType === 'image' && objectUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={objectUrl}
              alt={displayFileName(file)}
              className="h-full w-full object-cover"
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
          <span className="absolute inset-x-0 bottom-0 bg-background/88 py-2 text-xs font-medium opacity-0 transition group-hover:opacity-100">
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
  disabled,
  file,
  onSelect,
}: {
  orderId: string;
  title: string;
  icon: typeof ImageIcon;
  accept?: string;
  disabled?: boolean;
  file?: OrderFile;
  onSelect: (file: File) => void;
}) {
  const inputId = useMemo(
    () => `upload-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    [title],
  );

  return (
    <div className="grid justify-items-center gap-3 rounded-md border bg-background p-4 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {file ? (
        <CircleFilePreview orderId={orderId} file={file} />
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            'group grid h-32 w-32 cursor-pointer place-items-center rounded-full border bg-muted/40 transition hover:border-primary hover:bg-primary/5',
            disabled && 'pointer-events-none opacity-60',
          )}
        >
          <span className="grid h-24 w-24 place-items-center rounded-full bg-background shadow-sm">
            <Icon className="h-10 w-10 text-muted-foreground transition group-hover:text-primary" />
          </span>
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
          if (!selected) return;
          onSelect(selected);
          event.currentTarget.value = '';
        }}
      />
      <Button type="button" variant="secondary" size="sm" asChild disabled={disabled}>
        <label htmlFor={inputId} className="cursor-pointer">
          <UploadCloud className="mr-2 h-4 w-4" />
          {file ? 'Replace File' : 'Choose File'}
        </label>
      </Button>
      {file && (
        <p className="max-w-48 truncate text-xs text-muted-foreground">
          {displayFileName(file)}
        </p>
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

    const clearCanvas = () => {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
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

        const token = getAccessToken();
        const response = await fetch(buildDownloadUrl(orderId, file.id), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          throw new Error('Unable to load STL file');
        }

        const arrayBuffer = await response.arrayBuffer();
        if (disposed) return;

        const scene = new THREE.Scene();
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

        material = new THREE.MeshStandardMaterial({
          color: 0xf1f5f9,
          metalness: 0.04,
          roughness: 0.46,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.setScalar(scale);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);

        edgeMaterial = new THREE.LineBasicMaterial({
          color: readPrimaryThreeColor(THREE),
          transparent: true,
          opacity: 0.35,
        });
        edgeGeometry = new THREE.EdgesGeometry(geometry, 28);
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        mesh.add(edges);

        const ambient = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 2.4);
        scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(3, -4, 5);
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 1.1);
        fillLight.position.set(-4, 3, 3);
        scene.add(fillLight);

        const grid = new THREE.GridHelper(3.6, 18, 0xcbd5e1, 0xe2e8f0);
        grid.position.y = -1.1;
        scene.add(grid);

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
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load STL');
        setStatus('error');
      }
    };

    init();

    return () => {
      disposed = true;
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
  }, [file.id, orderId, large]);

  return (
    <div
      className={cn(
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
          Loading 3D STL...
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-background/80 p-4 text-center text-sm text-red-600">
          {errorMessage ?? 'Unable to load STL'}
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

function useSecureFileUrl(orderId: string, fileId: string, enabled: boolean) {
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

function readPrimaryThreeColor(THREE: typeof import('three')) {
  const primary = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary')
    .trim();

  if (!primary) return new THREE.Color(0x334155);

  try {
    return new THREE.Color(`hsl(${primary})`);
  } catch {
    return new THREE.Color(0x334155);
  }
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
