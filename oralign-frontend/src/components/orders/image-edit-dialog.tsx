'use client';

import { useEffect, useRef, useState } from 'react';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import {
  Crop as CropIcon,
  FlipHorizontal,
  FlipVertical,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// Zoom range used by the crop-mode slider. The minimum is 1× because going
// below "fits the editor" gains nothing — react-image-crop already lets
// the user draw arbitrarily small rectangles. The maximum is 4× because
// past that the displayed image becomes pixelated on small source photos
// and the crop precision gain is illusory.
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

export interface ImageEditDialogProps {
  /** The image File the user just picked from the OS file dialog. */
  file: File | null;
  /** Reference / example image shown next to the editor so the user can compare. */
  referenceImage?: string;
  /** Short label for the slot (e.g. "Smile photo") — shown in the title. */
  title: string;
  onCancel: () => void;
  /** Receives the new File with rotation/flip/crop baked into the pixel data. */
  onConfirm: (transformed: File) => void;
}

/**
 * Lightweight image editor — crop + rotate 90° CW/CCW + flip horizontal/vertical.
 *
 * The on-screen preview uses CSS transforms for instant rotation/flip feedback.
 * Crop is handled by react-image-crop, which gives us a draggable + resizable
 * selection rectangle with accessible keyboard support out of the box.
 *
 * On confirm the full transform stack (crop → rotation → flip) is REPLAYED
 * onto a `<canvas>` so the uploaded bytes actually reflect the edits — a CSS-
 * only rotation would upload the original file unchanged.
 *
 * Editor flow:
 *   1. User picks file → dialog opens in "transform" mode (rotate / flip).
 *   2. Click "Crop" → switches to crop mode, shows the react-image-crop UI.
 *   3. Drag the rectangle, then click "Apply crop" → bakes the crop into
 *      the working buffer and returns to transform mode.
 *   4. Click "Use this image" → final canvas render hits onConfirm.
 *
 * Crop is "destructive" — once applied it's baked into the working image
 * buffer so subsequent rotations operate on the cropped pixels. Reset wipes
 * everything back to the original file.
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

  // Crop state — keeps the user's in-progress rectangle (CSS units of
  // the rendered <img>) and a "completed" snapshot that we'll convert
  // to natural-pixel coordinates at confirm time.
  //
  // We do NOT store a "natural pixel" version up front because the
  // displayed-vs-natural ratio depends on the image's CURRENT layout
  // size, which changes when the user moves the zoom slider. Reading
  // both at the same instant (in applyCrop) keeps the math correct
  // regardless of what the slider was set to during selection.
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [pixelCrop, setPixelCrop] = useState<PixelCrop | undefined>(undefined);
  // Zoom factor in crop mode. Applied via inline width:`${zoom * 100}%`
  // on the <img>, which mutates `element.width` — so the
  // CSS-pixel-to-natural-pixel ratio in `applyCrop` stays correct
  // regardless of zoom level.
  const [zoom, setZoom] = useState(1);

  // `workingBlobUrl` holds the CURRENT working image — starts as the
  // original file, and after "Apply crop" gets replaced by the cropped
  // version. That way subsequent edits (rotate / re-crop) operate on the
  // already-cropped pixels and we don't lose information by stacking
  // canvas re-renders.
  const [workingBlobUrl, setWorkingBlobUrl] = useState<string | null>(null);
  const [workingFile, setWorkingFile] = useState<File | null>(null);

  const imageRef = useRef<HTMLImageElement | null>(null);

  // First mount of a new file → seed working state from the source file.
  useEffect(() => {
    if (!file) {
      setWorkingFile(null);
      setWorkingBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(file);
    setWorkingFile(file);
    setWorkingBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    // Reset transforms when a brand-new file enters the dialog.
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCrop(undefined);
    setPixelCrop(undefined);
    setCropMode(false);
    setZoom(1);
    setError(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Initial crop selection — center an 80%-width rectangle when the user
  // first enters crop mode so they can resize/move rather than draw from
  // scratch. Library handles all the resize / drag interactions.
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (cropMode && !crop) {
      const initial = centerCrop(
        makeAspectCrop(
          { unit: '%', width: 80 },
          // Aspect ratio derived from the image's natural dimensions so the
          // default crop frames the photo nicely regardless of orientation.
          naturalWidth / naturalHeight,
          naturalWidth,
          naturalHeight,
        ),
        naturalWidth,
        naturalHeight,
      );
      setCrop(initial);
    }
  };

  const reset = () => {
    if (!file) return;
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCrop(undefined);
    setPixelCrop(undefined);
    setCropMode(false);
    setZoom(1);
    // Restore the working buffer to the ORIGINAL file — so reset also
    // un-does a previously-applied crop.
    const url = URL.createObjectURL(file);
    setWorkingFile(file);
    setWorkingBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  };

  const enterCropMode = () => {
    setCropMode(true);
    setCrop(undefined); // re-initialised by handleImageLoad
    setZoom(1);
  };

  const cancelCropMode = () => {
    setCropMode(false);
    setCrop(undefined);
    setPixelCrop(undefined);
    setZoom(1);
  };

  const applyCrop = async () => {
    const imgEl = imageRef.current;
    if (!workingBlobUrl || !workingFile || !imgEl) {
      setError('Image not ready yet.');
      return;
    }
    if (!pixelCrop || pixelCrop.width < 4 || pixelCrop.height < 4) {
      setError('Pick a crop region first (drag on the image).');
      return;
    }

    // Convert CSS-pixel crop (what react-image-crop reports) to
    // natural-pixel crop (what the canvas needs).
    //
    // Critical bug this fixes: previously we loaded a DETACHED <img> in
    // bakeCrop to read its `width`. A detached image's `.width` equals
    // its `.naturalWidth`, so the scale factor came out to 1 and we
    // were treating CSS pixels as natural pixels — cropping the wrong
    // region. We must read the ratio from the IMAGE ELEMENT THAT IS
    // CURRENTLY ON SCREEN, because react-image-crop's coordinates are
    // in CSS pixels of THAT element. With the zoom slider in play the
    // element's CSS width changes too, so this has to be read here
    // (not at module load).
    const scaleX = imgEl.naturalWidth / imgEl.width;
    const scaleY = imgEl.naturalHeight / imgEl.height;
    const naturalRegion = {
      x: pixelCrop.x * scaleX,
      y: pixelCrop.y * scaleY,
      width: pixelCrop.width * scaleX,
      height: pixelCrop.height * scaleY,
    };

    setBusy(true);
    setError(null);
    try {
      const cropped = await bakeCrop(
        workingFile,
        workingBlobUrl,
        naturalRegion,
      );
      const url = URL.createObjectURL(cropped);
      setWorkingFile(cropped);
      setWorkingBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setCropMode(false);
      setCrop(undefined);
      setPixelCrop(undefined);
      setZoom(1);
    } catch (err) {
      setError((err as Error).message || 'Could not apply crop.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!workingFile || !workingBlobUrl) return;
    if (rotation === 0 && !flipH && !flipV) {
      // No transform to bake — workingFile is either the original file
      // (no edits) or the cropped version (crop already baked). Either
      // way it's ready to ship as-is.
      onConfirm(workingFile);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const transformed = await applyTransforms(
        workingFile,
        workingBlobUrl,
        rotation,
        flipH,
        flipV,
      );
      onConfirm(transformed);
    } catch (err) {
      setError((err as Error).message || 'Could not save image edits.');
    } finally {
      setBusy(false);
    }
  };

  // CSS transform mirroring the canvas math — keeps the preview cheap.
  // Disabled inside crop mode because react-image-crop needs the raw
  // (un-rotated) image to drive its selection rectangle.
  const previewTransform = cropMode
    ? undefined
    : `rotate(${rotation}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`;

  const hasEdits =
    rotation !== 0 || flipH || flipV || workingFile !== file;

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
                Crop, rotate or flip the photo before it uploads. Changes
                are applied to the saved file.
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
                toolbar stays on-screen without scrolling. The checker
                pattern provides a neutral, ignore-the-background frame.
                In crop mode this becomes `overflow-auto` so a zoomed-in
                image can be panned by scrolling. */}
            <div
              className={cn(
                'relative flex h-[42vh] min-h-[220px] items-center justify-center rounded-lg border bg-[linear-gradient(135deg,_#f8fafc_25%,_#f1f5f9_25%,_#f1f5f9_50%,_#f8fafc_50%,_#f8fafc_75%,_#f1f5f9_75%)] bg-[length:24px_24px] sm:h-[55vh]',
                cropMode && zoom > 1 ? 'overflow-auto' : 'overflow-hidden',
              )}
            >
              {workingBlobUrl ? (
                cropMode ? (
                  // Crop mode — react-image-crop drives the selection.
                  // The image is sized to `${zoom * 100}%` so the layout
                  // width changes with the zoom slider; react-image-crop
                  // reports its rect in CSS pixels of the rendered image,
                  // and applyCrop divides by element.width to recover
                  // natural-pixel coords. CSS `transform: scale()` is
                  // intentionally NOT used because it would leave
                  // element.width unchanged and break the math.
                  <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                    onComplete={(c) => setPixelCrop(c)}
                    keepSelection
                    className="max-h-full"
                    style={{
                      width: `${zoom * 100}%`,
                      maxWidth: zoom === 1 ? '100%' : 'none',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      ref={imageRef}
                      src={workingBlobUrl}
                      alt="Crop preview"
                      onLoad={handleImageLoad}
                      draggable={false}
                      className="block w-full select-none"
                    />
                  </ReactCrop>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={workingBlobUrl}
                    alt="Editing preview"
                    draggable={false}
                    className="max-h-full max-w-full select-none object-contain transition-transform duration-200"
                    style={{ transform: previewTransform }}
                  />
                )
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
            {cropMode ? (
              // Crop-mode toolbar — replaces the rotate/flip row so the
              // user has a focused affordance to pick a region and commit.
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <Button
                  type="button"
                  onClick={applyCrop}
                  disabled={busy || !pixelCrop || pixelCrop.width < 4}
                  className="gap-1.5"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CropIcon className="h-4 w-4" />
                  )}
                  Apply crop
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={cancelCropMode}
                  disabled={busy}
                >
                  Cancel crop
                </Button>

                {/* Zoom controls — slider gives precise selection of a
                    detail, +/- buttons give a one-click step. When
                    zoom > 1 the editor canvas becomes scrollable so the
                    user can pan to any region of the larger image. */}
                <div className="col-span-2 flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 sm:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))
                    }
                    disabled={busy || zoom <= ZOOM_MIN}
                    aria-label="Zoom out"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <input
                    type="range"
                    min={ZOOM_MIN}
                    max={ZOOM_MAX}
                    step={ZOOM_STEP}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    disabled={busy}
                    aria-label="Zoom"
                    className="h-1 w-24 cursor-pointer accent-primary disabled:opacity-50"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
                    }
                    disabled={busy || zoom >= ZOOM_MAX}
                    aria-label="Zoom in"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="ml-1 text-[10px] font-mono tabular-nums text-muted-foreground">
                    {zoom.toFixed(2)}×
                  </span>
                </div>

                <p className="col-span-2 hidden text-xs text-muted-foreground sm:block">
                  Drag to draw or move the rectangle, drag the corners
                  to resize. Use the zoom slider above for precision on
                  small details — the editor scrolls when zoomed in.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={enterCropMode}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <CropIcon className="h-4 w-4" />
                  Crop
                </Button>
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
                  className={cn(
                    'gap-1.5',
                    flipH && 'border-primary bg-primary/5',
                  )}
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
                  className={cn(
                    'gap-1.5',
                    flipV && 'border-primary bg-primary/5',
                  )}
                >
                  <FlipVertical className="h-4 w-4" />
                  Flip V
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  disabled={busy || !hasEdits}
                  className="col-span-2 gap-1.5 sm:col-span-1"
                >
                  <Undo2 className="h-4 w-4" />
                  Reset
                </Button>
              </div>
            )}

            <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-2">
              {error && (
                <p className="text-xs text-destructive sm:order-first">
                  {error}
                </p>
              )}
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={busy || !workingFile || cropMode}
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

// ── Pixel-baking transforms ───────────────────────────────────────────────

/**
 * Bake a rectangular crop into a new File. The region is given in
 * NATURAL-PIXEL coordinates (already converted from CSS pixels by the
 * caller using the rendered image's `naturalWidth / width` ratio), so
 * we just draw straight from those coordinates with no further scaling.
 *
 * Keeping the conversion in the CALLER (rather than re-doing it here
 * by loading a detached <img>) is what fixes the "crop is from a
 * different place than the selection" bug — a detached image's
 * `.width` equals its `.naturalWidth`, so scaling from inside this
 * helper used to come out to 1× and we ended up cropping CSS-pixel
 * coordinates out of a natural-pixel source.
 */
async function bakeCrop(
  source: File,
  objectUrl: string,
  naturalRegion: { x: number; y: number; width: number; height: number },
): Promise<File> {
  const img = await loadImage(objectUrl);

  // Clamp to the source's natural bounds so a slightly-off rect
  // (sub-pixel rounding, a zoom level the user just dragged off) can
  // never request bytes that don't exist.
  const sx = Math.max(0, Math.min(img.naturalWidth - 1, Math.round(naturalRegion.x)));
  const sy = Math.max(0, Math.min(img.naturalHeight - 1, Math.round(naturalRegion.y)));
  const sw = Math.max(
    1,
    Math.min(img.naturalWidth - sx, Math.round(naturalRegion.width)),
  );
  const sh = Math.max(
    1,
    Math.min(img.naturalHeight - sy, Math.round(naturalRegion.height)),
  );

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvasToFile(canvas, source);
}

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

  return canvasToFile(canvas, source);
}

async function canvasToFile(
  canvas: HTMLCanvasElement,
  source: File,
): Promise<File> {
  // Pick an output type that browsers reliably encode — fall back to JPEG
  // if the source is something Canvas can't round-trip (e.g. HEIC). Most
  // dental cameras emit JPEG/PNG so this is rarely hit.
  const outputType = ['image/png', 'image/jpeg', 'image/webp'].includes(
    source.type,
  )
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
