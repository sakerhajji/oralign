'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/lang-context';

/** The literal the user must type — the same in every language on purpose. */
export const PERMANENT_DELETE_WORD = 'DELETE';

/**
 * THE confirmation for irreversible deletion, shared by orders, patients,
 * users and packs. Two rules the individual pages used to get wrong:
 *   1. the action stays disabled until the user types DELETE — a
 *      misclick can never purge history;
 *   2. the dialog stays open while the mutation is pending, so a 409
 *     ("history depends on it") lands with the context still visible.
 * The backend remains the authority (trash-first + dependency checks);
 * this only makes the honest path the easy one.
 */
export function PermanentDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useT();
  const [typed, setTyped] = React.useState('');
  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);
  const armed = typed.trim().toUpperCase() === PERMANENT_DELETE_WORD;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </span>
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div>{description}</div>
              <p className="font-medium text-foreground">
                {t('common.permanentDelete.irreversible')}
              </p>
              <label className="block space-y-1.5">
                <span className="text-xs">
                  {t('common.permanentDelete.typeToConfirm', { word: PERMANENT_DELETE_WORD })}
                </span>
                <Input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={PERMANENT_DELETE_WORD}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending}
                  aria-label={PERMANENT_DELETE_WORD}
                />
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('common.cancel')}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!armed || pending}
            onClick={onConfirm}
          >
            {pending
              ? t('common.permanentDelete.working')
              : (confirmLabel ?? t('common.permanentDelete.confirm'))}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
