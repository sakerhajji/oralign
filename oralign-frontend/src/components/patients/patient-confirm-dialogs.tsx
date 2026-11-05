'use client';

import { useState } from 'react';
import { PermanentDeleteDialog } from '@/components/shared/permanent-delete-dialog';
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
import { useT } from '@/lib/i18n/lang-context';
import type { Patient } from '@/lib/types';

/** A destructive request waiting for the user's confirmation. */
export type PatientConfirm =
  | { kind: 'trash'; patient: Patient }
  | { kind: 'bulk'; ids: string[] }
  | { kind: 'permanent'; patient: Patient }
  | null;

/**
 * The page's confirmations, rendered once at page level (never inside a
 * row, whose click would catch the dialog's own clicks): moving one or
 * several patients to the trash, and the typed-word permanent delete.
 */
export function PatientConfirmDialogs({
  confirm,
  onClose,
  isAdmin,
  purging,
  onTrash,
  onBulkTrash,
  onPurge,
}: {
  confirm: PatientConfirm;
  onClose: () => void;
  isAdmin: boolean;
  /** The permanent delete is running (its dialog waits for the answer). */
  purging: boolean;
  onTrash: (patient: Patient) => void;
  onBulkTrash: (ids: string[]) => void;
  onPurge: (patient: Patient) => void;
}) {
  const { t } = useT();
  // Keep the last request on screen while a dialog animates closed.
  const [shown, setShown] = useState(confirm);
  if (confirm && confirm !== shown) setShown(confirm);

  const close = (open: boolean) => {
    if (!open) onClose();
  };

  const trashTitle =
    shown?.kind === 'trash'
      ? t('patientDesk.confirm.trashTitle', { name: shown.patient.fullName })
      : shown?.kind === 'bulk'
        ? t(
            shown.ids.length === 1
              ? 'patientDesk.confirm.bulkTitleOne'
              : 'patientDesk.confirm.bulkTitleMany',
            { count: shown.ids.length },
          )
        : '';
  const trashBody =
    shown?.kind === 'bulk'
      ? t('patientDesk.confirm.bulkBody')
      : isAdmin
        ? t('patientDesk.confirm.trashBodyAdmin')
        : t('patientDesk.confirm.trashBodyDentist');

  return (
    <>
      <AlertDialog
        open={confirm?.kind === 'trash' || confirm?.kind === 'bulk'}
        onOpenChange={close}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trashTitle}</AlertDialogTitle>
            <AlertDialogDescription>{trashBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('patientDesk.confirm.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirm?.kind === 'trash') onTrash(confirm.patient);
                else if (confirm?.kind === 'bulk') onBulkTrash(confirm.ids);
                onClose();
              }}
            >
              {t('patientDesk.actions.trash')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PermanentDeleteDialog
        open={confirm?.kind === 'permanent'}
        onOpenChange={close}
        title={t('patientDesk.confirm.permanentTitle')}
        description={
          shown?.kind === 'permanent'
            ? t('patientDesk.confirm.permanentBody', { name: shown.patient.fullName })
            : ''
        }
        confirmLabel={t('patientDesk.actions.deletePermanently')}
        pending={purging}
        onConfirm={() => {
          if (confirm?.kind === 'permanent') onPurge(confirm.patient);
        }}
      />
    </>
  );
}
