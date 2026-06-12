'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

/**
 * Full-screen image viewer (a.k.a. "lightbox").
 *
 * Why a dedicated component and not the shadcn <Dialog>:
 * the default DialogContent ships with `rounded-xl bg-popover ring-1
 * ring-foreground/10 p-4 gap-4` baked in — fine for form modals,
 * disastrous for a full-bleed image viewer because the rounded
 * corners, ring outline and popover background bleed through under
 * our `bg-black/95` override and the modal looks visually "corrupt"
 * at the edges. We also want a SOLID black backdrop (no
 * `backdrop-blur` artefacts from the default overlay) so the image
 * is judged on its own contrast, not against a half-transparent
 * blur of the page underneath.
 *
 * Built directly on the Radix Dialog primitives so we get a11y +
 * focus-trap + ESC handling for free, but we own every pixel of
 * the styling.
 *
 * Behaviour:
 *   • Solid black backdrop.
 *   • Click outside the image (anywhere on the backdrop) closes.
 *   • ESC closes.
 *   • Close button top-right (always visible, contrasts on black).
 *   • Image is centered and `max-h-full max-w-full object-contain`
 *     so it always fits without scrollbars.
 *   • Optional caption bar at the top of the viewport with the
 *     image's clinical label and filename — kept above the image
 *     in a dim translucent strip so it never blocks the picture.
 */
export interface ImageLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The image to display. Pass `null` to render nothing. */
  src: string | null | undefined;
  /** alt text + screen-reader title. */
  alt: string;
  /** Optional headline above the image (e.g. "Right lateral view"). */
  caption?: string;
  /** Optional sub-line under the caption (e.g. the original file name). */
  subCaption?: string;
}

export function ImageLightbox({
  open,
  onOpenChange,
  src,
  alt,
  caption,
  subCaption,
}: ImageLightboxProps) {
  const { t } = useT();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Solid black backdrop — NOT translucent, NOT blurred.
            The whole point of the lightbox is to remove every other
            page element from the user's field of view so the image
            is judged on its own. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />

        {/* Content layer: fills the viewport so the click-outside
            target IS the entire backdrop. The image inside stops
            click propagation so clicking ON the image keeps it open. */}
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-0 z-50 flex items-center justify-center bg-black p-0 outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
          onClick={(e) => {
            // Click outside the image closes; click on the image itself
            // is stopped below so the user can interact with it.
            if (e.target === e.currentTarget) onOpenChange(false);
          }}
        >
          {/* Required for a11y — Radix screams in dev otherwise. The
              title also doubles as the alt-text source. */}
          <DialogPrimitive.Title className="sr-only">
            {caption ?? alt}
          </DialogPrimitive.Title>

          {/* Top translucent caption bar. Skipped entirely when there
              is no caption to avoid an empty strip above the image. */}
          {(caption || subCaption) && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 bg-gradient-to-b from-black/70 to-transparent px-6 pb-12 pt-4 text-center text-white">
              {caption && (
                <p className="text-sm font-semibold tracking-wide sm:text-base">
                  {caption}
                </p>
              )}
              {subCaption && (
                <p className="text-xs text-white/70">{subCaption}</p>
              )}
            </div>
          )}

          {/* Close button. Pinned top-right with extra contrast so it's
              always visible against any image. */}
          <DialogPrimitive.Close
            className="absolute right-3 top-3 z-20 rounded-full bg-white/10 p-2 text-white outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label={t('uiBits.closeImageViewer')}
          >
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>

          {/* Image. `stopPropagation` so clicking it doesn't bubble up
              and trigger the click-outside close on the parent. */}
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[100dvh] max-w-[100vw] select-none object-contain"
              draggable={false}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
