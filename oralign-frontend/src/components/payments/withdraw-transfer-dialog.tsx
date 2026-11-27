'use client';

import type { MouseEvent } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useT } from '@/lib/i18n/lang-context';

/**
 * « Retirer ce virement ? » — the in-app confirmation (never
 * window.confirm) of withdrawing a declaration still awaiting the lab.
 * It stays open while the request runs, so a second tap cannot fire a
 * second withdrawal, and closes once the parent's mutation settles.
 */
export function WithdrawTransferDialog({
  open,
  onOpenChange,
  description,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const { t } = useT();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Undo2 aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t('transfers.withdrawDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} className="pointer-coarse:h-12">
            {t('transfers.withdrawDialog.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="pointer-coarse:h-12"
            disabled={pending}
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              // Closed by the parent when the request settles.
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {t('transfers.withdrawDialog.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
