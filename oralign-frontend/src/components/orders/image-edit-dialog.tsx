'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FlipHorizontal, FlipVertical, Loader2, RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface ImageEditDialogProps {
  /** The image File the user just picked from the OS file dialog. */
  file: File | null;
  /** Reference / example image shown next to the editor so the user can compare. */
  referenceImage?: string;
  /** Short label for the slot (e.g. "Smile photo") — shown in the title. */
  title: string;
  onCancel: () => void;
  /** Receives the new File with rotation/flip baked into the pixel data. */
  onConfirm: (transformed: File) => void;
}

/**
 * Lightweight image editor — rotate 90° CW/CCW + flip horizontal/vertical.
 * The on-screen preview uses CSS transforms for instant feedback; on confirm
 * the transform stack is replayed onto a `<canvas>` so the uploaded bytes
 * actually reflect the user's edits (a CSS-only rotation would upload the
 * original file unchanged).
 */
export function ImageEditDialog({
  file,
  referenceImage,
  title,
  onCancel,
  onConfirm,
}: ImageEditDialogProps) {
  const [rotation, setRotation] = useState(0); // 0 / 90 / 180 / 270
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URL is the cheapest way to preview a File; revoke on close.
  const objectUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  // Reset transforms when a new file enters the dialog.
  useEffect(() => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setError(null);
  }, [file]);

  const reset = () => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
  };

  const handleConfirm = async () => {
    if (!file || !objectUrl) return;
    if (rotation === 0 && !flipH && !flipV) {
      // Nothing to do — return the original file untouched.
      onConfirm(file);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const transformed = await applyTransforms(file, objectUrl, rotation, flipH, flipV);
      onConfirm(transformed);
    } catch (err) {
      setError((err as Error).message || 'Could not save image edits.');
    } finally {
      setBusy(false);
    }
  };

  // CSS transform mirroring the canvas math — keeps the preview cheap.
  const previewTransform = `rotate(${rotation}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`;

  return (
    <Dialog
      open={!!file}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent
        className="max-h-[95dvh] w-[min(96vw,860px)] max-w-none overflow-y-auto p-0 sm:max-w-none"
        showCloseButton={false}
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-3 sm:px-6">
            <div className="min-w-0">
              <DialogTitle className="text-sm font-semibold sm:text-base">
                Adjust {title.toLowerCase()}
              </DialogTitle>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Rotate or flip the photo before it uploads. Changes are
                applied to the saved file.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => !busy && onCancel()}
              disabled={busy}
            >
              Cancel
            </Button>
          </header>

          <div className="grid gap-3 p-3 sm:grid-cols-[1fr_minmax(0,220px)] sm:gap-6 sm:p-6">
            {/* Editor canvas — shrinks aggressively on phones so the
                rotation toolbar stays on-screen without scrolling. */}
            <div className="relative flex h-[42vh] min-h-[220px] items-center justify-center overflow-hidden rounded-lg border bg-[linear-gradient(135deg,_#f8fafc_25%,_#f1f5f9_25%,_#f1f5f9_50%,_#f8fafc_50%,_#f8fafc_75%,_#f1f5f9_75%)] bg-[length:24px_24px] sm:h-[55vh]">
              {objectUrl ? (
                <img
                  src={objectUrl}
                  alt="Editing preview"
                  draggable={false}
                  className="max-h-full max-w-full select-none object-contain transition-transform duration-200"
                  style={{ transform: previewTransform }}
                />
              ) : (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Reference photo — compact horizontal strip on phones, full
                vertical column from sm+ where there's room. */}
            <aside className="flex items-stretch gap-3 rounded-lg border bg-muted/30 p-2 sm:flex-col sm:p-3">
              <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-md border bg-background sm:h-[200px] sm:w-full">
                {referenceImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={referenceImage}
                    alt={`${title} reference`}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No reference
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-col justify-center gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Reference
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  Match the patient's view to this orientation.
                </p>
              </div>
            </aside>
          </div>

          {/* Toolbar — wraps to two rows on phones; transform buttons grow
              to share the full width so they're easy to tap. */}
          <div className="space-y-2 border-t bg-muted/30 px-3 py-3 sm:flex sm:items-center sm:justify-between sm:space-y-0 sm:px-6">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRotation((r) => (r + 270) % 360)}
                disabled={busy}
                className="gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                Rotate left
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                disabled={busy}
                className="gap-1.5"
              >
                <RotateCw className="h-4 w-4" />
                Rotate right
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFlipH((v) => !v)}
                disabled={busy}
                className={cn('gap-1.5', flipH && 'border-primary bg-primary/5')}
              >
                <FlipHorizontal className="h-4 w-4" />
                Flip H
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFlipV((v) => !v)}
                disabled={busy}
                className={cn('gap-1.5', flipV && 'border-primary bg-primary/5')}
              >
                <FlipVertical className="h-4 w-4" />
                Flip V
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={reset}
                disabled={busy || (rotation === 0 && !flipH && !flipV)}
                className="col-span-2 gap-1.5 sm:col-span-1"
              >
                <Undo2 className="h-4 w-4" />
                Reset
              </Button>
            </div>

            <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-2">
              {error && (
                <p className="text-xs text-destructive sm:order-first">
                  {error}
                </p>
              )}
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={busy || !file}
                className="gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Use this image'
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pixel-baking transform ────────────────────────────────────────────────

async function applyTransforms(
  source: File,
  objectUrl: string,
  rotation: number,
  flipH: boolean,
  flipV: boolean,
): Promise<File> {
  const img = await loadImage(objectUrl);
  const quarter = rotation % 180 !== 0;
  const width = quarter ? img.naturalHeight : img.naturalWidth;
  const height = quarter ? img.naturalWidth : img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // Pixel-fidelity drawing — translate to centre, then rotate, then mirror,
  // then draw the image centred on the origin.
  ctx.translate(width / 2, height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  // Pick an output type that browsers reliably encode — fall back to JPEG
  // if the source is something Canvas can't round-trip (e.g. HEIC). Most
  // dental cameras emit JPEG/PNG so this is rarely hit.
  const outputType = ['image/png', 'image/jpeg', 'image/webp'].includes(source.type)
    ? source.type
    : 'image/jpeg';

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), outputType, 0.95),
  );
  if (!blob) {
    throw new Error('Browser could not encode the edited image.');
  }

  return new File([blob], source.name, {
    type: blob.type || outputType,
    lastModified: Date.now(),
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode the source image.'));
    img.src = src;
  });
}
