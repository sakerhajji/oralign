'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, CloudOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { draftSaveErrorMessage } from '@/lib/hooks/use-supplemental-orders';
import { useT } from '@/lib/i18n/lang-context';
import { formatBusinessTime } from '@/lib/utils/business-day';
import type { SaveStatus } from './use-supplemental-draft';

/** "Enregistré à 10:42" / "Enregistrement…" / the error with a retry. */
export function SaveStatusLine({
  status,
  dirty,
  savedAt,
  error,
  onRetry,
}: {
  status: SaveStatus;
  dirty: boolean;
  savedAt: string | null;
  error: unknown;
  onRetry: () => void;
}) {
  const { t, lang } = useT();

  let content: ReactNode;
  if (status === 'saving') {
    content = (
      <>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {t('supplemental.save.saving')}
      </>
    );
  } else if (status === 'error') {
    content = (
      <>
        <CloudOff className="h-4 w-4 text-red-600" aria-hidden />
        <span className="text-red-700 dark:text-red-400">
          {t('supplemental.save.failed', { reason: draftSaveErrorMessage(error, t) })}
        </span>
        <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={onRetry}>
          {t('supplemental.save.retry')}
        </Button>
      </>
    );
  } else if (dirty) {
    content = t('supplemental.save.pending');
  } else if (savedAt) {
    content = (
      <>
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
        {t('supplemental.save.savedAt', { time: formatBusinessTime(savedAt, lang) })}
      </>
    );
  } else {
    content = t('supplemental.save.upToDate');
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-9 flex-wrap items-center justify-end gap-2 text-sm text-muted-foreground"
    >
      {content}
    </div>
  );
}
