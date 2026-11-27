'use client';

import { CheckCircle2, Clock3, ScanSearch, Upload, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/lang-context';
import {
  TRANSFER_STATE_TONE,
  transferStateLabelKey,
  type TransferAudience,
  type TransferTone,
} from '@/lib/payments/transfer-state';
import type { TransferState } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The palette of PaymentStatusBadge (ink for done, amber for "waits on
 * someone", red for "did not go through"), plus sky for a receipt the
 * lab has opened: a transfer state reads like a payment status
 * everywhere, and never by colour alone (each badge has its label and
 * its icon).
 */
const TONE_CLASS: Readonly<Record<TransferTone, string>> = {
  neutral: 'border-transparent bg-muted text-muted-foreground',
  waiting:
    'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  review:
    'border-sky-300/70 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  success: 'border-transparent bg-muted text-foreground',
  danger:
    'border-red-300/70 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
};

const ICON: Readonly<Record<TransferState, typeof Clock3>> = {
  awaiting_receipt: Upload,
  receipt_sent: Clock3,
  to_verify: ScanSearch,
  paid: CheckCircle2,
  refused: XCircle,
};

/** A transfer's derived state (CONTRACT §7) as a labelled badge. */
export function TransferStateBadge({
  state,
  audience = 'doctor',
  className,
}: {
  state: TransferState | null | undefined;
  audience?: TransferAudience;
  className?: string;
}) {
  const { t } = useT();
  if (!state) return <span className="text-muted-foreground">—</span>;
  const Icon = ICON[state];
  return (
    <Badge
      variant="outline"
      className={cn('gap-1 font-medium', TONE_CLASS[TRANSFER_STATE_TONE[state]], className)}
    >
      <Icon aria-hidden="true" className="size-3" />
      {t(transferStateLabelKey(state, audience))}
    </Badge>
  );
}
