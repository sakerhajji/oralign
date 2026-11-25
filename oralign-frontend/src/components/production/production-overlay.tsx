'use client';

import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { usePhoneLayout } from '@/hooks/use-phone-layout';
import { cn } from '@/lib/utils';

/**
 * The technician's forms: a bottom sheet on a phone (reachable with the
 * thumb, dragged down to dismiss), a side sheet or a dialog from md up.
 * Header and footer stay put; only the body scrolls, so "Enregistrer"
 * is always on screen above the keyboard.
 */
export function ProductionOverlay({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  desktop = 'sheet',
  busy = false,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** A long form slides in from the side; a short confirmation is a dialog. */
  desktop?: 'sheet' | 'dialog';
  /**
   * A write is in flight: drag, overlay tap, Escape and the X do nothing.
   * Closing would unmount the form, and its answer (the confirmation
   * step, the error, the toast) would be dropped without a word.
   */
  busy?: boolean;
  /** Where focus goes once closed (the control that opened it may be gone). */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const live = usePhoneLayout();
  // The layout is read once per opening: turning the phone to landscape
  // must not swap the drawer for the side sheet and remount the form
  // (the draft, the confirmation step and its Idempotency-Key with it).
  const [held, setHeld] = useState(live);
  if ((!open || held === null) && held !== live) setHeld(live);
  const phone = open && held !== null ? held : live;

  const change = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
  };
  const holdWhileBusy = (event: Event) => {
    if (busy) event.preventDefault();
  };

  // Unknown until the first client render: mounting the side sheet first
  // and swapping it for the drawer a frame later would flash.
  if (phone === null) return null;

  if (phone) {
    return (
      // A controlled vaul drawer still animates out on a drag even when
      // onOpenChange is ignored: `dismissible` is what stops the gesture.
      <Drawer open={open} onOpenChange={change} dismissible={!busy}>
        <DrawerContent onCloseAutoFocus={onCloseAutoFocus}>
          <div className="shrink-0 px-4 pt-2 pb-3">
            <DrawerTitle className="text-lg font-semibold">{title}</DrawerTitle>
            {description && (
              <DrawerDescription className="mt-0.5 truncate">{description}</DrawerDescription>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-4 py-4">
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t bg-popover px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  if (desktop === 'dialog') {
    return (
      <Dialog open={open} onOpenChange={change}>
        <DialogContent
          className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]"
          onInteractOutside={holdWhileBusy}
          onEscapeKeyDown={holdWhileBusy}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <div className="shrink-0 px-5 pt-5 pr-12 pb-3">
            <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
            {description && (
              <DialogDescription className="mt-0.5">{description}</DialogDescription>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer && <div className="shrink-0 border-t px-5 py-3">{footer}</div>}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={change}>
      <SheetContent
        side="right"
        className={cn('flex flex-col gap-0 p-0 data-[side=right]:sm:max-w-[480px]')}
        onInteractOutside={holdWhileBusy}
        onEscapeKeyDown={holdWhileBusy}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="shrink-0 border-b px-6 pt-5 pr-14 pb-4">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          {description && <SheetDescription className="mt-0.5">{description}</SheetDescription>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
        {footer && <div className="shrink-0 border-t px-6 py-4">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
