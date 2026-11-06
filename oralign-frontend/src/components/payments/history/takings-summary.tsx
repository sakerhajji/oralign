'use client';

import { useId } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Figure, FigureRow } from '@/components/ui/figure-row';
import { extractApiError } from '@/lib/api/error';
import type { Lang } from '@/lib/i18n/dict';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentMethod, type PaymentsSummary, type PaymentsSummaryBucket } from '@/lib/types';
import { cn } from '@/lib/utils';
import { addDays, formatCalendarDay } from '@/lib/utils/business-day';
import { currencyCode, formatAmount, formatPrice } from '@/lib/utils/currency';
import type { DayRange, MethodFilter } from './history-filters';

type Translate = (path: string, vars?: Record<string, string | number>) => string;

/** The shortest unambiguous range: "du 1er au 6 nov. 2026" / "Nov 1 – 6, 2026". */
function rangeText(from: string, to: string, lang: Lang, t: Translate): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7);
  const start =
    lang === 'fr'
      ? formatCalendarDay(from, lang, sameMonth ? 'day' : sameYear ? 'dayMonth' : 'full')
      : formatCalendarDay(from, lang, sameYear ? 'dayMonth' : 'full');
  const end =
    lang === 'en' && sameMonth
      ? `${formatCalendarDay(to, lang, 'day')}, ${to.slice(0, 4)}`
      : formatCalendarDay(to, lang, 'full');
  return t('paymentsDesk.takings.range', { from: start, to: end });
}

/**
 * The line that names what the figures cover: "Encaissé aujourd’hui ·
 * jeu. 6 nov.", "Encaissé du 1er au 6 nov. 2026", "Réglé depuis le
 * 1er nov. 2026"… An admin received the money; a dentist paid it.
 */
export function takingsCaption(
  range: DayRange,
  today: string,
  isAdmin: boolean,
  lang: Lang,
  t: Translate,
): string {
  const key = (name: string) => `paymentsDesk.takings.${isAdmin ? 'admin' : 'dentist'}.${name}`;
  const { from, to } = range;
  if (from && to && from === to) {
    if (from === today) {
      return t(key('today'), { date: formatCalendarDay(from, lang, 'weekday') });
    }
    if (from === addDays(today, -1)) {
      return t(key('yesterday'), { date: formatCalendarDay(from, lang, 'weekday') });
    }
    return t(key('day'), { date: formatCalendarDay(from, lang, 'full') });
  }
  if (from && to) return t(key('range'), { range: rangeText(from, to, lang, t) });
  if (from) return t(key('since'), { date: formatCalendarDay(from, lang, 'full') });
  if (to) return t(key('until'), { date: formatCalendarDay(to, lang, 'full') });
  return t(key('today'), { date: formatCalendarDay(today, lang, 'weekday') });
}

/**
 * The money received over the desk's period: cash, card, transfer and
 * the total, installments and treatment fees together, each payment
 * counted once. The figures follow ONLY the period and (admins) the
 * dentist filter — never the tab, the search, the method or the status —
 * so they always answer "how much came in", whatever the list shows. The
 * caption names that scope, the dentist included.
 *
 * Each figure opens its payments: the list below switches to them (paid,
 * that method, those days), and the tab counts then show how many are
 * installments and how many treatment fees.
 */
export function TakingsSummary({
  summary,
  range,
  today,
  isAdmin,
  dentistName,
  picked,
  onPick,
}: {
  summary: UseQueryResult<PaymentsSummary, Error>;
  /** The days the figures are expected to cover (no period → today). */
  range: DayRange;
  today: string;
  isAdmin: boolean;
  /** Admins narrowed to one dentist: the figures are theirs only. */
  dentistName?: string | null;
  /** The figure whose payments the list shows right now, if any. */
  picked: MethodFilter | null;
  /** Show a figure's payments in the list (again: back to every payment). */
  onPick: (method: MethodFilter) => void;
}) {
  const { t, lang } = useT();
  const captionId = useId();
  const data = summary.data;
  // Once the figures are in, the caption names the range the server
  // actually counted: the words and the numbers are one fact.
  const shown: DayRange = data ? { from: data.from, to: data.to } : range;
  const caption = takingsCaption(shown, today, isAdmin, lang, t);
  const unit = currencyCode(data?.currency);

  const figure = (
    label: string,
    method: MethodFilter,
    bucket: PaymentsSummaryBucket | undefined,
    strong = false,
  ) => (
    <Figure
      size="lg"
      label={label}
      hint={bucket ? String(bucket.count) : undefined}
      value={data && bucket ? formatAmount(bucket.amount) : null}
      unit={unit}
      strong={strong}
      onSelect={() => onPick(method)}
      selected={picked === method}
      selectLabel={
        data && bucket
          ? t('paymentsDesk.takings.showAria', {
              label,
              amount: formatPrice(bucket.amount, data.currency),
              count: bucket.count,
            })
          : undefined
      }
    />
  );

  return (
    <section aria-labelledby={captionId} className="flex flex-col gap-2">
      <p id={captionId} className="text-sm text-muted-foreground">
        {caption}
        {dentistName ? ` · ${dentistName}` : ''}
      </p>
      {summary.isError && !data ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-card px-4 py-2.5 text-sm ring-1 ring-foreground/10">
          <p className="min-w-0 text-muted-foreground">
            {t('paymentsDesk.takings.error')} {extractApiError(summary.error).message}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void summary.refetch()}>
            <RefreshCw aria-hidden="true" />
            {t('paymentsDesk.retry')}
          </Button>
        </div>
      ) : (
        <div
          aria-busy={summary.isPlaceholderData || undefined}
          className={cn('transition-opacity duration-150', summary.isPlaceholderData && 'opacity-60')}
        >
          <FigureRow className="sm:grid-cols-4">
            {figure(t('paymentsDesk.method.cash'), PaymentMethod.CASH, data?.methods.cash)}
            {figure(t('paymentsDesk.method.card'), PaymentMethod.CARD, data?.methods.card)}
            {figure(
              t('paymentsDesk.method.bank_transfer'),
              PaymentMethod.BANK_TRANSFER,
              data?.methods.bank_transfer,
            )}
            {figure(t('paymentsDesk.takings.total'), 'all', data?.total, true)}
          </FigureRow>
        </div>
      )}
    </section>
  );
}
