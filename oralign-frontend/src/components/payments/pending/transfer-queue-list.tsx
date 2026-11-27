'use client';

import { useId, type ComponentProps } from 'react';
import { ChevronRight, FileQuestion, Paperclip } from 'lucide-react';
import { TransferStateBadge } from '@/components/payments/transfer-state-badge';
import { AmountWithWithholding } from '@/components/payments/withholding';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { doctorWithTitle } from '@/lib/doctor/doctor-contact';
import type { Lang } from '@/lib/i18n/dict';
import { useT } from '@/lib/i18n/lang-context';
import { refusalReasonOf } from '@/lib/payments/transfer-state';
import type { TransferQueueRow } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatBusinessDay, formatBusinessTime } from '@/lib/utils/business-day';
import { formatPrice } from '@/lib/utils/currency';
import { isAwaiting, rowInstant, rowSplit, rowSubjectLabel } from './queue-format';
import { SeenChip } from './transfer-badges';

/**
 * The rows of one tab of the pending desk: a table from lg (the payments
 * desk's frame), stacked cards below it, each opening the review. A row
 * still new to me carries the « Nouveau » chip and a bold name; every
 * badge has its words (never colour alone).
 */

const TABLE_FRAME = 'hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block';
const CARD_LIST = 'flex flex-col gap-2 lg:hidden';

type Translate = (path: string, vars?: Record<string, string | number>) => string;

function subjectText(row: TransferQueueRow, t: Translate): string {
  const label = rowSubjectLabel(row);
  return t(label.key, label.vars);
}

function dateParts(iso: string | null, lang: Lang): { day: string; time: string } | null {
  return iso ? { day: formatBusinessDay(iso, lang), time: formatBusinessTime(iso, lang) } : null;
}

/**
 * « Validé le … » / « Refusé le … » of a processed row, read from the row
 * itself (not the tab, which may still show the previous tab's rows while
 * the next ones load).
 */
function processedLabel(row: TransferQueueRow, lang: Lang, t: Translate): string | null {
  const date = dateParts(row.processedAt, lang);
  if (!date) return null;
  if (row.status === 'success') return t('pendingDesk.processedOn.valide', { date: date.day });
  if (row.status === 'rejected') return t('pendingDesk.processedOn.refuse', { date: date.day });
  return null;
}

/** A new row: still awaiting and my notification of it unread. */
const isNewToMe = (row: TransferQueueRow) => isAwaiting(row) && !row.seenByMe;

export function TransferQueueList({
  rows,
  onOpen,
}: {
  rows: TransferQueueRow[];
  onOpen: (row: TransferQueueRow) => void;
}) {
  return (
    <>
      <QueueTable rows={rows} onOpen={onOpen} />
      <ul className={CARD_LIST}>
        {rows.map((row) => (
          <li key={row.subjectKey}>
            <QueueCard row={row} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </>
  );
}

function QueueTable({
  rows,
  onOpen,
}: {
  rows: TransferQueueRow[];
  onOpen: (row: TransferQueueRow) => void;
}) {
  const { t, lang } = useT();
  return (
    <div className={TABLE_FRAME}>
      <Table className="table-fixed">
        <TableCaption className="sr-only">{t('pendingDesk.caption')}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <Head className="w-36">{t('pendingDesk.col.declared')}</Head>
            <Head>{t('pendingDesk.col.who')}</Head>
            <Head className="w-48">{t('pendingDesk.col.subject')}</Head>
            <Head className="w-40 text-right">{t('pendingDesk.col.amount')}</Head>
            <Head className="w-52">{t('pendingDesk.col.state')}</Head>
            <Head className="w-28">{t('pendingDesk.col.receipt')}</Head>
            <Head className="w-28 text-right">
              <span className="sr-only">{t('pendingDesk.col.action')}</span>
            </Head>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const declared = dateParts(rowInstant(row), lang);
            const processed = processedLabel(row, lang, t);
            const reason = refusalReasonOf(row.rejectionReason);
            const fresh = isNewToMe(row);
            return (
              <TableRow
                key={row.subjectKey}
                onClick={() => onOpen(row)}
                className={cn('cursor-pointer', fresh && 'bg-primary/[0.03]')}
              >
                <TableCell className={cn('align-top', fresh && 'border-s-2 border-s-primary')}>
                  {declared ? (
                    <>
                      <span className="block truncate tabular-nums">{declared.day}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {declared.time}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <span className={cn('block truncate', fresh ? 'font-semibold' : 'font-medium')}>
                    {row.patient?.fullName ?? '—'}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {doctorWithTitle(row.doctor?.fullName) ?? '—'}
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  <span className="block truncate">{subjectText(row, t)}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {row.orderCode}
                  </span>
                </TableCell>
                <TableCell className="text-right align-top font-medium tabular-nums">
                  <AmountWithWithholding
                    cash={row.amounts.cash}
                    split={rowSplit(row)}
                    currency={row.amounts.currency}
                    kind={row.kind === 'treatment_fee' ? 'fee' : 'installment'}
                    className="items-end"
                  />
                </TableCell>
                <TableCell className="align-top">
                  <span className="flex min-w-0 flex-col items-start gap-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <TransferStateBadge state={row.state} audience="admin" />
                      {isAwaiting(row) && <SeenChip seen={row.seenByMe} />}
                    </span>
                    {processed && (
                      <span className="text-xs text-muted-foreground tabular-nums">{processed}</span>
                    )}
                    {reason && (
                      <span
                        className="line-clamp-2 text-xs leading-snug text-red-800 dark:text-red-300"
                        title={reason}
                      >
                        {reason}
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  <ReceiptMark hasProof={row.hasProof} />
                </TableCell>
                <TableCell className="text-right align-top">
                  <Button
                    type="button"
                    size="sm"
                    variant={isAwaiting(row) ? 'default' : 'outline'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(row);
                    }}
                    aria-label={t('pendingDesk.action.rowAria', {
                      name: row.patient?.fullName ?? row.orderCode,
                    })}
                  >
                    {isAwaiting(row) ? t('pendingDesk.action.review') : t('pendingDesk.action.view')}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function Head({ className, ...props }: ComponentProps<typeof TableHead>) {
  return (
    <TableHead
      scope="col"
      className={cn('text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

/** Whether a receipt is attached: its words beside its icon. */
function ReceiptMark({ hasProof, className }: { hasProof: boolean; className?: string }) {
  const { t } = useT();
  return hasProof ? (
    <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
      <Paperclip className="size-3.5" aria-hidden="true" />
      {t('pendingDesk.receipt.attached')}
    </span>
  ) : (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300',
        className,
      )}
    >
      <FileQuestion className="size-3.5" aria-hidden="true" />
      {t('pendingDesk.receipt.none')}
    </span>
  );
}

/**
 * A transfer on a phone: who and how much first, then what it is for and
 * its state, the whole card one thumb-sized target.
 *
 * Below lg the cards are the only rendering of the queue, so a screen
 * reader must hear what the eye triages on: the card's name is « Ouvrir
 * le virement de … » plus the amount, and its description the facts, the
 * state, « Nouveau », « Aucun reçu », the date and a refusal reason (an
 * aria-label alone would hide all of it: a button's content is not read).
 */
function QueueCard({ row, onOpen }: { row: TransferQueueRow; onOpen: (row: TransferQueueRow) => void }) {
  const { t, lang } = useT();
  const id = useId();
  const fresh = isNewToMe(row);
  const declared = dateParts(rowInstant(row), lang);
  const reason = refusalReasonOf(row.rejectionReason);
  const facts = [
    subjectText(row, t),
    row.orderCode,
    doctorWithTitle(row.doctor?.fullName),
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      aria-labelledby={`${id}-name ${id}-amount`}
      aria-describedby={[`${id}-facts`, `${id}-state`, reason ? `${id}-reason` : null]
        .filter(Boolean)
        .join(' ')}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl bg-card px-4 py-3 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-muted/60',
        fresh && 'border-s-4 border-s-primary',
      )}
    >
      <span id={`${id}-name`} className="sr-only">
        {t('pendingDesk.action.rowAria', { name: row.patient?.fullName ?? row.orderCode })}
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn('truncate text-[15px] leading-5', fresh ? 'font-semibold' : 'font-medium')}>
            {row.patient?.fullName ?? row.orderCode}
          </span>
          <span
            id={`${id}-amount`}
            className="shrink-0 text-[15px] leading-5 font-semibold tabular-nums"
          >
            {formatPrice(row.amounts.cash, row.amounts.currency)}
          </span>
        </span>
        <span id={`${id}-facts`} className="block truncate text-xs text-muted-foreground">
          {facts.join(' · ')}
        </span>
        <span id={`${id}-state`} className="flex flex-wrap items-center gap-1.5">
          <TransferStateBadge state={row.state} audience="admin" />
          {isAwaiting(row) && <SeenChip seen={row.seenByMe} />}
          {!row.hasProof && <ReceiptMark hasProof={false} />}
          {declared && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {declared.day} · {declared.time}
            </span>
          )}
        </span>
        {reason && (
          <span
            id={`${id}-reason`}
            className="line-clamp-2 text-xs leading-snug text-red-800 dark:text-red-300"
          >
            {reason}
          </span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
    </button>
  );
}

/** The list's final layout with grey bars, while the first page loads. */
export function TransferQueueSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      <div className={TABLE_FRAME}>
        <div className="h-10 border-b" />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex h-[61px] items-center gap-6 border-b px-4 last:border-0">
            <div className="w-28 space-y-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-5 w-28 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        ))}
      </div>
      <div className={CARD_LIST}>
        {Array.from({ length: Math.min(rows, 4) }, (_, index) => (
          <div key={index} className="space-y-2 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
