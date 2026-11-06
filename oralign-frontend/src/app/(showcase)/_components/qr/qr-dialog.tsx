"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * A modal of the QR welcome, on the native <dialog>: the browser traps
 * focus inside, makes the page behind inert and closes it on Escape. Here
 * on top of that:
 *  - the page behind does not scroll while it is open, and does not shift
 *    sideways when its scrollbar goes (classic scrollbars, Windows);
 *  - a press that starts and ends on the backdrop closes it (not a text
 *    selection that ends outside);
 *  - on close, the focus goes back to the action that opens it — an
 *    explicit target, because Safari focuses nothing on a tap and a deep
 *    link has no opener at all;
 *  - its content mounts only while it is open (the film loads nothing
 *    until then, and unmounting it releases the video).
 *
 * `open` is owned by the caller (see useHashDialog); Escape and the
 * backdrop only ask the caller to close.
 */
export function QrDialog({
  open,
  onClose,
  labelledBy,
  className,
  returnFocusRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className: string;
  /** Where the focus goes on close: the action that opens this dialog. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    // Captured now: the card actions stay mounted while the dialog is open.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusBack = returnFocusRef?.current ?? opener;
    const root = document.documentElement;
    const { overflow, paddingRight } = root.style;
    // The page's own scrollbar, if it takes room: its width is padded back
    // so the page under the backdrop stays where it was.
    const scrollbar = window.innerWidth - root.clientWidth;
    if (!dialog.open) dialog.showModal();
    root.style.overflow = "hidden";
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
    return () => {
      root.style.overflow = overflow;
      root.style.paddingRight = paddingRight;
      if (dialog.open) dialog.close();
      focusBack?.focus({ preventScroll: true });
    };
  }, [open, returnFocusRef]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      // Escape: the caller closes (it also drops the URL hash).
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // The browser may still close it by itself (a second Escape without
      // a tap in between): keep the URL in step.
      onClose={open ? onClose : undefined}
      // The content fills the dialog box, so a press on the box itself is a
      // press on its backdrop.
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
        pressedOnBackdrop.current = false;
      }}
      className={className}
    >
      {open ? children : null}
    </dialog>
  );
}
