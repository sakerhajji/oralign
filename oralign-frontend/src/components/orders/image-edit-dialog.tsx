'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
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
import { useT } from '@/lib/i18n/lang-context';

// Zoom range used by the crop-mode slider. The minimum is 1× because going
// below "fits the editor" gains nothing — react-image-crop already lets
// the user draw arbitrarily small rectangles. The maximum is 4× because
// past that the displayed image becomes pixelated on small source photos
// and the crop precision gain is illusory.
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

// In crop mode the image is contain-fitted to the editor canvas MINUS this
// inset (px) on every side. react-image-crop renders its edge & corner drag
// handles centred ON the selection boundary, so when a full-frame selection
// sits flush against the canvas edge the top/bottom/corner handles land on
// (and get clipped by) the canvas border — only the left/right mid handles
// stay grabbable. The inset keeps the whole image (and therefore every
// handle) clear of the border so the user can trim ANY side.
const CROP_CANVAS_INSET = 28;

// A small source photo is allowed to scale UP to fill the inset canvas so its
// crop surface and handles are a comfortable size to drag. The crop is stored
// in PERCENT and converted to natural pixels on apply, so scaling the DISPLAY
// never changes the saved pixels — this cap is purely about display ergonomics
// (it stops a tiny thumbnail from being blown up into a blurry wall).
const CROP_MAX_DISPLAY_UPSCALE = 6;

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
  const { t } = useT();
  const [rotation, setRotation] = useState(0); // 0 / 90 / 180 / 270
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Crop state — the selection rectangle in PERCENT units (resolution-
  // and zoom-independent). We deliberately don't keep a display-pixel
  // copy: `applyCrop` converts this percent rectangle straight to
  // natural-pixel coordinates, so the saved file is always identical to
  // the selection the user sees regardless of the current zoom level.
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  // Zoom factor in crop mode. Drives the explicit px width/height of the
  // contain-fitted crop image (see `cropFit`), so the
  // display-pixel-to-natural-pixel ratio in `applyCrop` stays correct
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

  // Editor-canvas measurement. The crop image is sized to CONTAIN-fit
  // this box at zoom 1 (so portrait, landscape AND square photos are
  // fully visible without being clipped), then scaled up from that fit
  // by the zoom slider. We measure with a ResizeObserver so the fit
  // recomputes on viewport changes / phone rotation / dialog resize.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  // Natural pixel size of the CURRENT working image (the un-rotated
  // buffer the cropper operates on). Captured on image load.
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  );

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Seed synchronously — the observer's first async callback can lag a
    // frame, and (critically) this effect only re-runs when the dialog
    // (re)opens [dep: file]; with empty deps it ran once before the Radix
    // dialog had mounted its content, so `canvasRef` was null, the observer
    // never attached, `canvasSize` stayed null and the cropper deadlocked
    // on a spinner. Re-attaching on open + seeding here fixes that.
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setCanvasSize({ w: rect.width, h: rect.height });
    }
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr && cr.width > 0 && cr.height > 0) {
        setCanvasSize({ w: cr.width, h: cr.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [file]);

  // Decode the working image's natural size as soon as the blob URL is
  // set — INDEPENDENT of react-image-crop's <img> onLoad. This is the
  // fix for the "crop view shows the photo zoomed-in" bug: previously
  // `naturalSize` was only captured from the cropper image's onLoad,
  // which a browser may NOT re-fire for an already-cached blob when the
  // element remounts on entering crop mode. With `naturalSize` missing,
  // `cropFit` was null and the image fell back to `maxHeight: 100%` —
  // which has no effect inside react-image-crop's auto-height wrapper,
  // so the photo rendered at full natural size and got clipped by the
  // canvas (looking like an extreme zoom). Decoding here guarantees
  // `cropFit` is ready the instant crop mode opens, so the whole image
  // is always contain-fitted and visible.
  useEffect(() => {
    if (!workingBlobUrl) {
      setNaturalSize(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.src = workingBlobUrl;
    return () => {
      cancelled = true;
    };
  }, [workingBlobUrl]);

  // CONTAIN-fit dimensions for the crop image: the largest size that
  // fits inside the editor canvas (minus the handle-clearance inset)
  // while preserving the image's aspect ratio, multiplied by the zoom
  // factor. `baseScale` is the contain-fit scale, then capped at
  // CROP_MAX_DISPLAY_UPSCALE (6×): large photos shrink to fit, small ones
  // grow enough to give comfortable drag handles without being blown up
  // into a blurry wall. The zoom slider scales from there. (Pathological
  // slivers — e.g. a 1px-wide source — render one axis ~1px; that axis is
  // hard to grab but bakes correctly. Real clinical photos never hit it.)
  //
  // Because we hand the cropper an explicit px width/height that
  // matches what the user sees, react-image-crop reports its rectangle
  // in those same display pixels — and `applyCrop`'s
  // `naturalWidth / element.width` ratio recovers the correct
  // natural-pixel region. No CSS-only "fake zoom" anywhere; the saved
  // file is always a real canvas crop of the selected region.
  const cropFit = useMemo(() => {
    if (!canvasSize || !naturalSize) return null;
    if (canvasSize.w <= 0 || canvasSize.h <= 0) return null;
    // Fit inside the canvas minus the handle-clearance inset on every side,
    // so a full-frame selection never pushes its handles onto the border.
    const availW = Math.max(1, canvasSize.w - CROP_CANVAS_INSET * 2);
    const availH = Math.max(1, canvasSize.h - CROP_CANVAS_INSET * 2);
    const containScale = Math.min(availW / naturalSize.w, availH / naturalSize.h);
    // contain-FILL the inset canvas: shrink large photos to fit, modestly
    // grow small ones (capped) — so EVERY image, portrait / landscape /
    // square / tiny / huge, presents the same comfortable, fully-visible
    // crop surface. Percent-based crop math keeps the saved pixels exact
    // regardless of this display scale.
    const baseScale = Math.min(containScale, CROP_MAX_DISPLAY_UPSCALE);
    const scale = baseScale * zoom;
    return {
      width: Math.max(1, Math.round(naturalSize.w * scale)),
      height: Math.max(1, Math.round(naturalSize.h * scale)),
    };
  }, [canvasSize, naturalSize, zoom]);

  // When the user changes zoom in crop mode, re-centre the scroll viewport on
  // the middle of the photo. Without this a zoom-in throws the view to the
  // top-left corner (auto-margin centring collapses once the image overflows),
  // which feels like the image "jumped". Centring keeps the focus stable.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !cropMode) return;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
  }, [zoom, cropMode, cropFit]);

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
    setNaturalSize(null);
    setCropMode(false);
    setZoom(1);
    setError(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Capture the working image's natural size on every load (a fresh
  // file, or the re-load after a crop is baked into the buffer) so the
  // contain-fit math always reflects the pixels currently on screen.
  // Then seed a gentle default crop so the user resizes/moves rather
  // than drawing from scratch.
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setNaturalSize({ w: naturalWidth, h: naturalHeight });
    if (cropMode && !crop) {
      // Seed the selection at the FULL FRAME (100%), not a centred
      // sub-region. Entering crop mode then shows the whole image with
      // the selection covering everything — so clicking "Crop" never
      // zooms, and clicking "Apply crop" without dragging is a no-op
      // (no progressive shrink when the user enters crop mode several
      // times in a row). The doctor pulls the handles inward only when
      // they actually want to trim something. This is the "show the
      // full image first, then crop" behaviour.
      const initial = centerCrop(
        makeAspectCrop(
          { unit: '%', width: 100 },
          // Aspect ratio derived from the image's natural dimensions so the
          // 100% box exactly covers the photo regardless of orientation.
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
    setCropMode(false);
    setZoom(1);
    setError(null);
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
    setError(null);
  };

  const cancelCropMode = () => {
    setCropMode(false);
    setCrop(undefined);
    setZoom(1);
    setError(null);
  };

  const applyCrop = async () => {
    setError(null);
    if (!workingBlobUrl || !workingFile) {
      setError(t('orderForm.files.imageEdit.errorNotReady'));
      return;
    }
    // Require a selection that covers a meaningful slice of the image.
    // We validate against the PERCENT crop (not the display-pixel one)
    // so the guard is independent of the current zoom level.
    if (!crop || crop.width < 1 || crop.height < 1) {
      setError(t('orderForm.files.imageEdit.errorPickRegion'));
      return;
    }

    // Full-frame selection → nothing to crop. Exit crop mode WITHOUT
    // re-baking: a 100% crop would re-encode the image through canvas
    // (a lossy JPEG round-trip) and a stray rounding pixel could shave
    // the edge, which compounds if the user enters crop mode several
    // times. Treating "essentially the whole image" as a no-op keeps
    // repeated Crop clicks from ever shrinking the photo.
    if (
      crop.unit === '%' &&
      crop.width >= 99.5 &&
      crop.height >= 99.5 &&
      crop.x <= 0.5 &&
      crop.y <= 0.5
    ) {
      setCropMode(false);
      setCrop(undefined);
      setZoom(1);
      return;
    }

    // Convert the PERCENT crop directly to NATURAL-pixel coordinates.
    //
    // We deliberately derive the region from the percent crop + the
    // image's natural size rather than from the display-pixel crop
    // react-image-crop reports. The percent crop is resolution- and
    // zoom-independent: it means the same region whether the editor is
    // showing the image at 0.3× (large photo, contain-fit) or 4×
    // (zoomed in). Reading display pixels instead would go stale the
    // moment the user nudges the zoom slider without re-dragging,
    // baking a crop from the wrong place. Percent removes that whole
    // class of bug and keeps the saved file pixel-identical to the
    // selection the user sees.
    const naturalW = imageRef.current?.naturalWidth ?? naturalSize?.w ?? 0;
    const naturalH = imageRef.current?.naturalHeight ?? naturalSize?.h ?? 0;
    if (naturalW <= 0 || naturalH <= 0) {
      setError(t('orderForm.files.imageEdit.errorNotReady'));
      return;
    }
    const pct = crop.unit === '%';
    const naturalRegion = {
      x: pct ? (crop.x / 100) * naturalW : crop.x,
      y: pct ? (crop.y / 100) * naturalH : crop.y,
      width: pct ? (crop.width / 100) * naturalW : crop.width,
      height: pct ? (crop.height / 100) * naturalH : crop.height,
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
      setZoom(1);
    } catch (err) {
      setError(
        (err as Error).message || t('orderForm.files.imageEdit.errorApplyCrop'),
      );
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
      setError(
        (err as Error).message || t('orderForm.files.imageEdit.errorSaveEdits'),
      );
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
                {t('orderForm.files.imageEdit.title', {
                  slot: title.toLowerCase(),
                })}
              </DialogTitle>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {t('orderForm.files.imageEdit.subtitle')}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => !busy && onCancel()}
              disabled={busy}
            >
              {t('orderForm.files.imageEdit.cancel')}
            </Button>
          </header>

          <div className="grid gap-3 p-3 sm:grid-cols-[1fr_minmax(0,220px)] sm:gap-6 sm:p-6">
            {/* Editor canvas — shrinks aggressively on phones so the
                toolbar stays on-screen without scrolling. The checker
                pattern provides a neutral, ignore-the-background frame.
                In crop mode this is `overflow-auto` so a zoomed-in image
                can be panned by scrolling (the `m-auto` cropper below
                stays reachable in every corner). */}
            <div
              ref={canvasRef}
              className={cn(
                'oralign-crop-canvas relative flex h-[42vh] min-h-[220px] items-center rounded-lg border bg-[linear-gradient(135deg,_#f8fafc_25%,_#f1f5f9_25%,_#f1f5f9_50%,_#f8fafc_50%,_#f8fafc_75%,_#f1f5f9_75%)] bg-[length:24px_24px] sm:h-[55vh]',
                // Crop mode scrolls so a zoomed-in image can be panned to any
                // edge. We must NOT use plain `justify-center` here: on the
                // main axis it keeps an overflowing flex item centred, pushing
                // its start edge to a negative offset `scrollLeft` can never
                // reach (the left side of a zoomed wide photo gets stranded).
                // `safe center` centres while the image fits but falls back to
                // start-alignment once it overflows, so every edge stays
                // scrollable. Transform mode just contains the preview.
                cropMode
                  ? 'overflow-auto [justify-content:safe_center]'
                  : 'justify-center overflow-hidden',
              )}
            >
              {!workingBlobUrl ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : cropMode ? (
                // Crop mode — react-image-crop drives the selection.
                //
                // Sizing: when the canvas + natural size are measured we
                // hand the cropper an EXPLICIT contain-fit px size
                // (`cropFit`), which also lets the zoom slider scale up.
                // BEFORE measurement (or if it never lands) we fall back to
                // a VIEWPORT-relative cap (`maxHeight: 60vh`, `maxWidth:
                // 100%`) — NOT `maxHeight: 100%`, which has no effect inside
                // react-image-crop's auto-height wrapper and would let a
                // tall photo render at full natural size (clipped → looks
                // zoomed). The vh cap is independent of any parent, so the
                // WHOLE image is always contained and the cropper never
                // deadlocks on a spinner.
                //
                // Correctness is independent of display size: the crop is
                // stored in PERCENT and `applyCrop` converts it to
                // natural-pixel coords, so the saved file always matches
                // the selection regardless of how the image is sized here.
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  keepSelection
                  ruleOfThirds
                  // `m-auto` (not the parent's justify/items-center) centres
                  // the cropper when it fits AND keeps it fully scrollable to
                  // every corner once zoom makes it overflow — auto margins
                  // collapse to 0 on overflow instead of clipping the start,
                  // which the flexbox `justify-center` alone would do.
                  className="m-auto"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imageRef}
                    src={workingBlobUrl}
                    alt="Crop preview"
                    onLoad={handleImageLoad}
                    draggable={false}
                    className="block select-none"
                    style={
                      cropFit
                        ? { width: cropFit.width, height: cropFit.height }
                        : { maxWidth: '100%', maxHeight: '60vh' }
                    }
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
                    {t('orderForm.files.imageEdit.noReference')}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-col justify-center gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('orderForm.files.imageEdit.reference')}
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {t('orderForm.files.imageEdit.referenceHint')}
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
                  disabled={busy || !crop || crop.width < 1 || crop.height < 1}
                  className="gap-1.5"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CropIcon className="h-4 w-4" />
                  )}
                  {t('orderForm.files.imageEdit.applyCrop')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={cancelCropMode}
                  disabled={busy}
                >
                  {t('orderForm.files.imageEdit.cancelCrop')}
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
                    aria-label={t('orderForm.files.imageEdit.zoomOut')}
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
                    aria-label={t('orderForm.files.imageEdit.zoomLabel')}
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
                    aria-label={t('orderForm.files.imageEdit.zoomIn')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="ml-1 text-[10px] font-mono tabular-nums text-muted-foreground">
                    {zoom.toFixed(2)}×
                  </span>
                </div>

                <p className="col-span-2 hidden text-xs text-muted-foreground sm:block">
                  {t('orderForm.files.imageEdit.cropHint')}
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
                  {t('orderForm.files.imageEdit.crop')}
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
                  {t('orderForm.files.imageEdit.rotateLeft')}
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
                  {t('orderForm.files.imageEdit.rotateRight')}
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
                  {t('orderForm.files.imageEdit.flipHorizontal')}
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
                  {t('orderForm.files.imageEdit.flipVertical')}
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
                  {t('orderForm.files.imageEdit.reset')}
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
                    {t('common.loading')}
                  </>
                ) : (
                  t('orderForm.files.imageEdit.useImage')
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
