'use client';

import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

/**
 * MY "Nouveau / Consulté" on a transfer still awaiting: the read state of
 * my own notification row of the subject (per admin, DECISIONS §2), not
 * the global "opened" stamp. Processed rows have nothing left to see and
 * show no chip. The workflow state itself is the shared
 * TransferStateBadge (components/payments/transfer-state-badge.tsx,
 * audience "admin").
 */
export function SeenChip({ seen, className }: { seen: boolean; className?: string }) {
  const { t } = useT();
  if (seen) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>
        {t('pendingDesk.seen.seen')}
      </span>
    );
  }
  return (
    <Badge
      className={cn(
        'border-transparent bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground',
        className,
      )}
    >
      {t('pendingDesk.seen.new')}
    </Badge>
  );
}
