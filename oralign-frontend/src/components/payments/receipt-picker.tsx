'use client';

import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  AlertCircle,
  Camera,
  FileText,
  ImagePlus,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IndeterminateBar, Progress } from '@/components/ui/progress';
import { useT } from '@/lib/i18n/lang-context';
import {
  RECEIPT_CAMERA_ACCEPT,
  RECEIPT_FILE_ACCEPT,
  prepareReceipt,
  type PreparedReceipt,
} from '@/lib/payments/compress-receipt';
import { receiptRefusalError, type ReceiptErrorView } from '@/lib/payments/receipt-errors';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/utils/bytes';

export type { PreparedReceipt } from '@/lib/payments/compress-receipt';

/** 48 px under a finger (DECISIONS: pointer-coarse targets), compact with a mouse. */
const TAP = 'h-11 sm:h-9 pointer-coarse:h-12';

/**
 * Is « Prendre une photo » on screen? The buttons show on a coarse pointer
 * only (`pointer-coarse:inline-flex`): an error may point at them only
 * then. Read when a file is refused, never during the render.
 */
function offersCamera(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

export interface ReceiptPickerProps {
  /** The receipt chosen, prepared for the upload; owned by the parent, which sends it. */
  value: PreparedReceipt | null;
  onChange: (receipt: PreparedReceipt | null) => void;
  disabled?: boolean;
  /** The parent is sending the receipt. */
  uploading?: boolean;
  /** Upload progress 0..1 while `uploading`; null = unknown (indeterminate bar). */
  progress?: number | null;
  /** A failed upload, explained under the receipt (lib/payments/receipt-errors.ts). */
  error?: ReceiptErrorView | null;
  /** "Try again", shown with a retryable `error`. */
  onRetry?: () => void;
  /** Say a receipt is missing (after a submit attempt without one). */
  showRequired?: boolean;
  title?: string;
  hint?: string;
  className?: string;
}

/**
 * The one receipt picker of the bank-transfer flows (pack installments and
 * treatment fee), spec §1 + §9:
 *
 *   - « Prendre une photo » opens the rear camera on a phone
 *     (`capture="environment"`); it only shows on a touch screen, where a
 *     camera is the point. « Choisir un fichier » opens the gallery / the
 *     files (images and PDF), and a file can be dropped on desktop;
 *   - the file is prepared here (lib/payments/compress-receipt.ts): photos
 *     lightened to about 2000 px, HEIC converted when the browser can,
 *     anything else refused inline before any upload;
 *   - a preview to check the receipt is legible, with Replace / Remove;
 *   - the upload's byte progress and its failure, inline, with a retry.
 *
 * Every target is 48 px on a coarse pointer; the inputs stay out of the tab
 * order (the buttons open them); status and errors are announced.
 */
export function ReceiptPicker({
  value,
  onChange,
  disabled = false,
  uploading = false,
  progress = null,
  error = null,
  onRetry,
  showRequired = false,
  title,
  hint,
  className,
}: ReceiptPickerProps) {
  const { t } = useT();
  const baseId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The latest pick wins when two are prepared at once.
  const pickRef = useRef(0);
  const [preparing, setPreparing] = useState(false);
  const [refusal, setRefusal] = useState<ReceiptErrorView | null>(null);
  const [dragging, setDragging] = useState(false);
  const locked = disabled || uploading || preparing;

  // Object-URL preview of an image, revoked when the file changes or the
  // picker unmounts (derived, not effect-driven state).
  const file = value?.file ?? null;
  const isImage = !!value && value.kind !== 'pdf';
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const pick = async (picked: File | null | undefined) => {
    if (!picked || locked) return;
    const ticket = ++pickRef.current;
    setRefusal(null);
    setPreparing(true);
    try {
      const result = await prepareReceipt(picked);
      if (ticket !== pickRef.current) return;
      if (result.ok) {
        onChange(result.receipt);
      } else {
        onChange(null);
        setRefusal(receiptRefusalError(result.reason, { camera: offersCamera() }));
      }
    } finally {
      if (ticket === pickRef.current) setPreparing(false);
    }
  };

  const openCamera = () => cameraRef.current?.click();
  const openFiles = () => fileRef.current?.click();

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (locked) return;
    void pick(event.dataTransfer.files?.[0]);
  };

  const shownError = error ?? refusal;
  const percent = progress === null ? null : Math.round(progress * 100);
  const titleId = `${baseId}-title`;
  const hintId = `${baseId}-hint`;

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={hintId}
      aria-busy={preparing || uploading || undefined}
      className={cn('space-y-3', className)}
    >
      <div>
        <p id={titleId} className="text-sm font-medium">
          {title ?? t('transfers.picker.title')}
        </p>
        <p id={hintId} className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {hint ?? t('transfers.picker.hint')}
        </p>
      </div>

      {value ? (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              {isImage ? <ImagePlus aria-hidden="true" className="size-4" /> : <FileText aria-hidden="true" className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={value.file.name}>
                {value.file.name}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {value.compressed
                  ? t('transfers.picker.compressed', {
                      from: formatBytes(value.originalBytes),
                      to: formatBytes(value.file.size),
                    })
                  : isImage
                    ? formatBytes(value.file.size)
                    : `${t('transfers.picker.pdf')} · ${formatBytes(value.file.size)}`}
              </p>
            </div>
          </div>

          {isImage && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob preview
            <img
              src={previewUrl}
              alt={t('transfers.picker.previewAlt')}
              className="max-h-[280px] w-full rounded-md border bg-muted/30 object-contain"
            />
          ) : previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <FileText aria-hidden="true" className="size-3.5" />
              {t('transfers.picker.openPreview')}
            </a>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('hidden pointer-coarse:inline-flex', TAP)}
              disabled={locked}
              onClick={openCamera}
            >
              <Camera aria-hidden="true" />
              {t('transfers.picker.takePhoto')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={TAP}
              disabled={locked}
              onClick={openFiles}
            >
              <Upload aria-hidden="true" />
              {t('transfers.picker.replace')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn('text-muted-foreground', TAP)}
              disabled={locked}
              aria-label={t('transfers.picker.removeAria', { name: value.file.name })}
              onClick={() => {
                setRefusal(null);
                onChange(null);
              }}
            >
              <X aria-hidden="true" />
              {t('transfers.picker.remove')}
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            if (locked) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'rounded-lg border border-dashed bg-muted/30 p-3 transition-colors',
            dragging && 'border-primary bg-primary/5',
            showRequired && !shownError && 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/20',
          )}
        >
          {/* A phone: the camera first, full width, the files under it. A
              mouse: the files alone (capture is ignored there), or a drop.
              flex-1 only in the row: in the column its 0 basis would
              override the TAP height (22 px buttons on a phone). */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className={cn('hidden justify-center pointer-coarse:inline-flex sm:flex-1', TAP)}
              disabled={locked}
              onClick={openCamera}
            >
              <Camera aria-hidden="true" />
              {t('transfers.picker.takePhoto')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn('justify-center bg-background sm:flex-1', TAP)}
              disabled={locked}
              onClick={openFiles}
            >
              <Upload aria-hidden="true" />
              {t('transfers.picker.chooseFile')}
            </Button>
          </div>
          <p className="mt-2 hidden text-center text-xs text-muted-foreground pointer-fine:block">
            {t('transfers.picker.dropHint')}
          </p>
        </div>
      )}

      {preparing ? (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          {t('transfers.picker.preparing')}
        </p>
      ) : null}

      {uploading ? (
        <div role="status" className="space-y-1.5">
          {percent === null ? (
            <IndeterminateBar aria-label={t('transfers.picker.uploadingPlain')} />
          ) : (
            <Progress value={percent} aria-label={t('transfers.picker.uploadingPlain')} />
          )}
          <p className="text-xs text-muted-foreground tabular-nums">
            {percent === null
              ? t('transfers.picker.uploadingPlain')
              : t('transfers.picker.uploading', { percent })}
          </p>
        </div>
      ) : null}

      {shownError && !uploading ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-900 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
        >
          <span className="flex items-start gap-2">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t(shownError.messageKey)}
          </span>
          {error && error.retryable && onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn('shrink-0 bg-background', TAP)}
              onClick={onRetry}
              disabled={disabled}
            >
              <RotateCcw aria-hidden="true" />
              {t('transfers.picker.retry')}
            </Button>
          ) : !error || error.kind === 'type' || error.kind === 'too_large' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn('shrink-0 bg-background', TAP)}
              onClick={openFiles}
              disabled={locked}
            >
              <Upload aria-hidden="true" />
              {t('transfers.picker.chooseAnother')}
            </Button>
          ) : null}
        </div>
      ) : showRequired && !value && !preparing ? (
        <p role="alert" className="text-xs font-medium text-amber-800 dark:text-amber-300">
          {t('transfers.picker.required')}
        </p>
      ) : null}

      {/* Opened by the buttons above: out of the tab order and of the
          accessibility tree, so each control is announced once. */}
      <input
        ref={cameraRef}
        type="file"
        accept={RECEIPT_CAMERA_ACCEPT}
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={locked}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          // Picking the same file again must fire `change` again.
          event.target.value = '';
          void pick(picked);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept={RECEIPT_FILE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={locked}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = '';
          void pick(picked);
        }}
      />
    </section>
  );
}
