'use client';

import { Loader2, Trash2 } from 'lucide-react';
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
import { useDeleteSupplementalOrder } from '@/lib/hooks/use-supplemental-orders';
import { useT } from '@/lib/i18n/lang-context';
import type { SupplementalOrderView } from '@/lib/types';

/** Confirmation before a draft request (and its files) leaves the case. */
export function DeleteDraftDialog({
  view,
  onClose,
}: {
  /** The draft to delete; `null` keeps the dialog closed. */
  view: SupplementalOrderView | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const remove = useDeleteSupplementalOrder();

  return (
    <AlertDialog open={view !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('supplemental.deleteDialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('supplemental.deleteDialog.description', { code: view?.order.orderCode ?? '' })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(event) => {
              // Keep the dialog open until the server confirms.
              event.preventDefault();
              if (!view) return;
              remove.mutate(
                {
                  requestId: view.order.id,
                  parentOrderId: view.parentOrder.id,
                  patientId: view.order.patientId,
                },
                { onSuccess: onClose },
              );
            }}
          >
            {remove.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
            )}
            {t('supplemental.actions.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
