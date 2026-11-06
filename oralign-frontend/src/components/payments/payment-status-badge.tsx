'use client';

import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentRecordStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAID = 'border-transparent bg-muted text-foreground';
const WAITING =
  'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300';
const FAILED =
  'border-red-300/70 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300';
const QUIET = 'border-transparent bg-muted text-muted-foreground';

/**
 * Grey for what is fine, colour only on what needs a look: most rows are
 * paid, and a column of green pills drowned the few that need someone.
 * Paid reads in ink (done), a card session still open and the endings
 * that cost nothing (cancelled, expired) in grey; amber waits on someone
 * (a transfer to confirm, a gateway answer being verified); red did not
 * go through. Pale tints with dark text of the same hue.
 */
const TONE: Record<PaymentRecordStatus, string> = {
  [PaymentRecordStatus.SUCCESS]: PAID,
  [PaymentRecordStatus.AWAITING_CONFIRMATION]: WAITING,
  [PaymentRecordStatus.UNKNOWN]: WAITING,
  [PaymentRecordStatus.PENDING]: QUIET,
  [PaymentRecordStatus.FAILED]: FAILED,
  [PaymentRecordStatus.REJECTED]: FAILED,
  [PaymentRecordStatus.CANCELLED]: QUIET,
  [PaymentRecordStatus.EXPIRED]: QUIET,
};

/**
 * The one badge for a payment's status, on every payments screen (the
 * payments desk, the confirmation queue, the transfer-proof dialog), so a
 * state reads the same everywhere. Every badge carries its label: nothing
 * is told by colour alone. A status the app does not know yet shows its
 * raw value in grey rather than a wrong label.
 */
export function PaymentStatusBadge({
  status,
  className,
}: {
  status: PaymentRecordStatus | null | undefined;
  className?: string;
}) {
  const { t } = useT();
  if (!status) return <span className="text-muted-foreground">—</span>;
  const key = `paymentsDesk.status.${status}`;
  const label = t(key);
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', TONE[status] ?? QUIET, className)}
    >
      {label === key ? status : label}
    </Badge>
  );
}
