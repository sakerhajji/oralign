'use client';

import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/lang-context';
import { InvoiceStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Status tone stays quiet on purpose: the states an admin acts on —
 * issued (waiting for money), paid (settled) and cancelled (kept in the
 * series, out of the totals) — carry colour, and every badge carries its
 * label, so nothing is encoded by colour alone.
 */
const STATUS_TONE: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'bg-muted text-muted-foreground',
  [InvoiceStatus.ISSUED]:
    'border-sky-300/70 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  [InvoiceStatus.PAID]:
    'border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  [InvoiceStatus.CANCELLED]:
    'border-rose-300/70 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
};

const STATUS_LABEL_KEY: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'invoicesAdmin.statusDraft',
  [InvoiceStatus.ISSUED]: 'invoicesAdmin.statusIssued',
  [InvoiceStatus.PAID]: 'invoicesAdmin.statusPaid',
  [InvoiceStatus.CANCELLED]: 'invoicesAdmin.statusCancelled',
};

export function useInvoiceStatusLabel(): (status: InvoiceStatus) => string {
  const { t } = useT();
  return (status) => t(STATUS_LABEL_KEY[status]);
}

export function InvoiceStatusBadge({
  status,
  className,
}: {
  status: InvoiceStatus;
  className?: string;
}) {
  const label = useInvoiceStatusLabel();
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_TONE[status], className)}>
      {label(status)}
    </Badge>
  );
}
