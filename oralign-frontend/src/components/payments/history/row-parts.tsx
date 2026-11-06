'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ChevronRight, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TableHead } from '@/components/ui/table';
import type { Lang } from '@/lib/i18n/dict';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentMethod } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  formatBusinessDay,
  formatBusinessDayShort,
  formatBusinessTime,
} from '@/lib/utils/business-day';

/**
 * Pieces shared by the two tables of the payments desk (installments and
 * treatment fees): the same columns read the same way in both.
 */

/** Where an order opened from the desk returns: the desk, filters kept. */
export function orderHref(orderId: string, returnTo: string, tab?: 'quote'): string {
  const params = new URLSearchParams();
  if (tab) params.set('tab', tab);
  params.set('returnTo', returnTo);
  return `/dashboard/orders/${orderId}?${params}`;
}

export function withReturnTo(path: string, returnTo: string): string {
  return `${path}?${new URLSearchParams({ returnTo })}`;
}

/** A column header: grey, sentence case, scoped to its column. */
export function ColHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <TableHead
      scope="col"
      className={cn('text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

/** The day over its time, both in Tunis time (the days the takings are cut in). */
export function DateTime({ iso }: { iso: string }) {
  const { lang } = useT();
  return (
    <>
      <span className="block truncate tabular-nums">{formatBusinessDay(iso, lang)}</span>
      <span className="block text-xs text-muted-foreground tabular-nums">
        {formatBusinessTime(iso, lang)}
      </span>
    </>
  );
}

/**
 * The day and time on one line for a phone row, the year only when it is
 * not `today`'s: "6 nov. 14:32" / "Nov 6, 14:32".
 */
export function dateTimeLine(iso: string, lang: Lang, today: string): string {
  const day = formatBusinessDayShort(iso, lang, today);
  return `${day}${lang === 'en' ? ',' : ''} ${formatBusinessTime(iso, lang)}`;
}

export function useMethodLabel(): (method: PaymentMethod | null | undefined) => string | null {
  const { t } = useT();
  return (method) => (method ? t(`paymentsDesk.method.${method}`) : null);
}

/**
 * The method, and the transfer proof beside it when the dentist sent one:
 * the proof is the evidence of the transfer, so it sits with the method.
 */
export function MethodCell({
  method,
  onViewProof,
}: {
  method: PaymentMethod | null | undefined;
  /** Set when the row carries a proof. */
  onViewProof?: () => void;
}) {
  const { t } = useT();
  const label = useMethodLabel()(method);
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate text-muted-foreground">{label ?? '—'}</span>
      {onViewProof && (
        // 24px (the WCAG 2.2 minimum for a pointer target): "Bank
        // transfer" and its clip fit the column without an ellipsis.
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onViewProof}
          aria-label={t('paymentsDesk.list.proofAria')}
          title={t('paymentsDesk.list.proofAria')}
          className="text-muted-foreground hover:text-foreground"
        >
          <Paperclip aria-hidden="true" />
        </Button>
      )}
    </span>
  );
}

export function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

/** What a tap on a phone row opens: its receipt, its proof or its order. */
export type PhoneRowAction =
  | { kind: 'receipt'; href: string }
  | { kind: 'proof'; onOpen: () => void }
  | { kind: 'order'; href: string };

const ACTION_LABEL: Record<PhoneRowAction['kind'], string> = {
  receipt: 'paymentsDesk.list.actionReceipt',
  proof: 'paymentsDesk.list.actionProof',
  order: 'paymentsDesk.list.actionOrder',
};

const PHONE_ROW =
  'flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none active:bg-muted/60';

/**
 * A row below lg: the patient and the amount on line 1; the status, then
 * every other field of the row on line 2, wrapping to a third line
 * rather than cutting one off (fields move to the second line, they are
 * never dropped); a chevron at the right edge. What a tap opens (the
 * receipt, the proof, the order) follows from the status and is named
 * for screen readers. The whole row is the target, so it is thumb-sized.
 */
export function PhoneRow({
  title,
  amount,
  status,
  meta,
  action,
}: {
  title: string;
  amount: string;
  status: ReactNode;
  meta: string;
  action: PhoneRowAction;
}) {
  const { t } = useT();
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[15px] leading-5 font-medium">{title}</span>
          <span className="shrink-0 text-[15px] leading-5 font-medium tabular-nums">
            {amount}
          </span>
        </span>
        {/* leading-5 matches the badge's 20px: a wrapped line sits under
            the first, the badge stays level with it. */}
        <span className="mt-1 flex min-w-0 items-start gap-2 text-xs leading-5 text-muted-foreground">
          {status}
          <span className="line-clamp-2 min-w-0">{meta}</span>
        </span>
        <span className="sr-only">{t(ACTION_LABEL[action.kind])}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );
  return action.kind === 'proof' ? (
    <button type="button" onClick={action.onOpen} className={PHONE_ROW}>
      {content}
    </button>
  ) : (
    <Link href={action.href} className={PHONE_ROW}>
      {content}
    </Link>
  );
}

/** Rows that stay on screen, dimmed, while the next result set loads. */
export function BusyList({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <div
      aria-busy={busy || undefined}
      className={cn('transition-opacity duration-150', busy && 'opacity-60')}
    >
      {children}
    </div>
  );
}

export const TABLE_FRAME = 'hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block';
export const PHONE_LIST =
  'divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:hidden';

/** The list's final layout with grey bars at the values' real sizes. */
export function HistoryListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      <div className={TABLE_FRAME}>
        <div className="h-10 border-b" />
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="flex h-[57px] items-center gap-6 border-b px-4 last:border-0"
          >
            <div className="w-24 space-y-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3 w-10" />
            </div>
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="ml-6 h-3.5 w-24" />
            <Skeleton className="ml-6 h-3.5 w-20" />
          </div>
        ))}
      </div>
      <ul className={PHONE_LIST}>
        {Array.from({ length: Math.min(rows, 6) }, (_, index) => (
          <li key={index} className="flex min-h-16 flex-col justify-center gap-2 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
