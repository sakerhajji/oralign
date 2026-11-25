'use client';

import type { ComponentType } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  BanknoteIcon,
  CalculatorIcon,
  CircleHelpIcon,
  CreditCardIcon,
  FilePenIcon,
  FileTextIcon,
  InfoIcon,
  LandmarkIcon,
  PercentIcon,
  ReceiptTextIcon,
  ScaleIcon,
  StampIcon,
  TriangleAlertIcon,
  WalletIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { extractApiErrorMessage } from '@/lib/api/error';
import type { Lang } from '@/lib/i18n/dict';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentMethod, type InvoiceAccountingSummary } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';
import { monthLabel, rateLabel } from './period';
import { CARD, KpiCard, RecapSkeleton, SectionCard, num, plural } from './recap-parts';

/** A practitioner picked in the retenues table: the list opens on his invoices. */
export interface DoctorTarget {
  /** null when the invoices carry no practitioner account (matched by name). */
  id: string | null;
  name: string;
}

const P = 'invoiceDesk.accounting';

/**
 * The récapitulatif comptable of the period: what an expert-comptable
 * asks for every month, read off the API's accounting summary.
 *
 *   figures → TVA collectée par taux (the TVA return) + encaissements par
 *   mode → retenues à la source par docteur (the certificates to claim)
 *   → détail par mois (2+ months) → what was left out, and why.
 *
 * Counted: issued or paid invoices, not archived, issued inside the
 * period. Drafts and cancelled invoices are only reported in the notes.
 */
export function AccountingRecap({
  query,
  onOpenDoctor,
  onShowList,
}: {
  query: UseQueryResult<InvoiceAccountingSummary, Error>;
  onOpenDoctor: (doctor: DoctorTarget) => void;
  onShowList: () => void;
}) {
  const { t } = useT();

  if (query.isError && !query.data) {
    return (
      <div className={cn(CARD, 'flex flex-col items-center gap-3 px-6 py-12 text-center')}>
        <TriangleAlertIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">{t(`${P}.loadError`)}</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {extractApiErrorMessage(query.error)}
        </p>
        <Button
          variant="outline"
          className="h-11 sm:h-8"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {t('invoiceDesk.retry')}
        </Button>
      </div>
    );
  }

  const data = query.data;
  if (!data) return <RecapSkeleton />;

  // Another period loading: the previous figures stay, dimmed, in place.
  const refreshing = query.isPlaceholderData;

  return (
    <div
      className={cn('flex flex-col gap-4 transition-opacity', refreshing && 'opacity-60')}
      aria-busy={refreshing || undefined}
    >
      {num(data.counted.count) === 0 ? (
        <EmptyRecap data={data} onShowList={onShowList} />
      ) : (
        <>
          <Figures data={data} />
          {/* Each card keeps its own height: a short TVA table is not stretched. */}
          <div className="grid min-w-0 gap-4 xl:grid-cols-5 xl:items-start">
            <TvaByRate data={data} className="xl:col-span-3" />
            <ByMethod data={data} className="xl:col-span-2" />
          </div>
          <WithholdingByDoctor data={data} onOpenDoctor={onOpenDoctor} />
          {data.byMonth.length >= 2 ? <ByMonth data={data} /> : null}
          <Notes data={data} />
        </>
      )}
    </div>
  );
}

// ─── Figures ─────────────────────────────────────────────────────────

function Figures({ data }: { data: InvoiceAccountingSummary }) {
  const { t, lang } = useT();
  const c = data.counted;
  const withheldInvoices = data.withholdingByDoctor.reduce((sum, row) => sum + num(row.count), 0);
  const discount = num(c.discountAmount);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        icon={ReceiptTextIcon}
        label={t(`${P}.kpi.revenue`)}
        value={num(c.subTotalHt)}
        sub={plural(t, lang, `${P}.invoices`, num(c.count))}
        extra={
          discount > 0
            ? t(`${P}.kpi.discount`, { amount: formatPrice(discount) })
            : undefined
        }
      />
      <KpiCard
        icon={PercentIcon}
        label={t(`${P}.kpi.tva`)}
        value={num(c.tvaAmount)}
        sub={t(`${P}.kpi.tvaSub`)}
        emphasis
      />
      <KpiCard
        icon={StampIcon}
        label={t(`${P}.kpi.stamp`)}
        value={num(c.stampDuty)}
        sub={plural(t, lang, `${P}.stamps`, num(c.stampCount))}
      />
      <KpiCard
        icon={FileTextIcon}
        label={t(`${P}.kpi.ttc`)}
        value={num(c.totalTtc)}
        sub={t(`${P}.kpi.ttcSub`)}
      />
      <KpiCard
        icon={ScaleIcon}
        label={t(`${P}.kpi.withholding`)}
        value={num(c.withholdingAmount)}
        sub={
          withheldInvoices > 0
            ? t(`${P}.kpi.withholdingSub`, {
                invoices: plural(t, lang, `${P}.invoices`, withheldInvoices),
              })
            : t(`${P}.kpi.withholdingNone`)
        }
      />
      <KpiCard
        icon={WalletIcon}
        label={t(`${P}.kpi.collected`)}
        value={num(data.paid.netPayable)}
        sub={plural(t, lang, `${P}.paidInvoices`, num(data.paid.count))}
        extra={
          num(data.unpaid.count) > 0 ? (
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {t(`${P}.kpi.toCollect`, {
                amount: formatPrice(num(data.unpaid.netPayable)),
                invoices: plural(t, lang, `${P}.invoices`, num(data.unpaid.count)),
              })}
            </span>
          ) : (
            t(`${P}.kpi.allCollected`)
          )
        }
      />
    </div>
  );
}

// ─── TVA by rate ─────────────────────────────────────────────────────

const MONEY = 'text-right tabular-nums';

function TvaByRate({ data, className }: { data: InvoiceAccountingSummary; className?: string }) {
  const { t, lang } = useT();
  const c = data.counted;
  return (
    <SectionCard
      title={t(`${P}.rates.title`)}
      hint={t(`${P}.rates.hint`)}
      className={className}
      footer={
        <span className="flex items-start gap-1.5">
          <StampIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {t(`${P}.rates.stampLine`, {
            amount: formatPrice(num(c.stampDuty)),
            stamps: plural(t, lang, `${P}.stamps`, num(c.stampCount)),
          })}
        </span>
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">{t(`${P}.rates.colRate`)}</TableHead>
            <TableHead className="text-right">{t(`${P}.rates.colBase`)}</TableHead>
            <TableHead className="text-right">{t(`${P}.rates.colTva`)}</TableHead>
            <TableHead className="pr-4 text-right">{t(`${P}.colInvoices`)}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.byRate.map((row) => (
            <TableRow key={row.rate}>
              <TableCell className="pl-4 font-medium tabular-nums">
                {rateLabel(num(row.rate), lang)}
              </TableCell>
              <TableCell className={MONEY}>{formatPrice(num(row.baseHt))}</TableCell>
              <TableCell className={MONEY}>{formatPrice(num(row.tvaAmount))}</TableCell>
              <TableCell className={cn(MONEY, 'pr-4')}>{num(row.count)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell className="pl-4 font-semibold">{t(`${P}.total`)}</TableCell>
            <TableCell className={cn(MONEY, 'font-semibold')}>
              {formatPrice(num(c.subTotalHt))}
            </TableCell>
            <TableCell className={cn(MONEY, 'font-semibold')}>
              {formatPrice(num(c.tvaAmount))}
            </TableCell>
            <TableCell className={cn(MONEY, 'pr-4 font-semibold')}>{num(c.count)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </SectionCard>
  );
}

// ─── Cash collected by method ────────────────────────────────────────

const METHOD_ORDER: (PaymentMethod | null)[] = [
  PaymentMethod.CARD,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CASH,
  PaymentMethod.CHEQUE,
  null,
];

const METHOD_META: Record<string, { icon: ComponentType<{ className?: string }>; key: string }> = {
  [PaymentMethod.CARD]: { icon: CreditCardIcon, key: 'card' },
  [PaymentMethod.BANK_TRANSFER]: { icon: LandmarkIcon, key: 'bankTransfer' },
  [PaymentMethod.CASH]: { icon: BanknoteIcon, key: 'cash' },
  [PaymentMethod.CHEQUE]: { icon: FilePenIcon, key: 'cheque' },
  none: { icon: CircleHelpIcon, key: 'none' },
};

const methodRank = (method: PaymentMethod | null) => {
  const index = METHOD_ORDER.indexOf(method);
  return index === -1 ? METHOD_ORDER.length : index;
};

function percentLabel(share: number, lang: Lang): string {
  const value = share.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    maximumFractionDigits: share > 0 && share < 1 ? 1 : 0,
  });
  return lang === 'fr' ? `${value} %` : `${value}%`;
}

function ByMethod({ data, className }: { data: InvoiceAccountingSummary; className?: string }) {
  const { t, lang } = useT();
  const total = num(data.paid.netPayable);
  const rows = [...data.byMethod]
    .filter((row) => num(row.count) > 0 || num(row.netPayable) !== 0)
    .sort((a, b) => methodRank(a.method) - methodRank(b.method));

  return (
    <SectionCard
      title={t(`${P}.methods.title`)}
      hint={t(`${P}.methods.hint`)}
      className={className}
      footer={
        <span className="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <span>
            {t(`${P}.methods.total`)}{' '}
            <span className="font-medium text-foreground tabular-nums">{formatPrice(total)}</span>
          </span>
          {num(data.unpaid.count) > 0 ? (
            <span>
              {t(`${P}.methods.toCollect`)}{' '}
              <span className="font-medium text-foreground tabular-nums">
                {formatPrice(num(data.unpaid.netPayable))}
              </span>{' '}
              ({plural(t, lang, `${P}.invoices`, num(data.unpaid.count))})
            </span>
          ) : null}
        </span>
      }
    >
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t(`${P}.methods.empty`)}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => {
            const meta = METHOD_META[row.method ?? 'none'] ?? METHOD_META.none;
            const Icon = meta.icon;
            const amount = num(row.netPayable);
            const share = total > 0 ? Math.max(0, Math.min(100, (amount / total) * 100)) : 0;
            return (
              <li key={row.method ?? 'none'} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="font-medium">{t(`${P}.methods.${meta.key}`)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {plural(t, lang, `${P}.invoices`, num(row.count))}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm font-medium tabular-nums">
                    {formatPrice(amount)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2" aria-hidden="true">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                    {percentLabel(share, lang)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

// ─── Retenues à la source by practitioner ────────────────────────────

function WithholdingByDoctor({
  data,
  onOpenDoctor,
}: {
  data: InvoiceAccountingSummary;
  onOpenDoctor: (doctor: DoctorTarget) => void;
}) {
  const { t, lang } = useT();
  const rows = data.withholdingByDoctor;
  const totals = rows.reduce(
    (sum, row) => ({
      count: sum.count + num(row.count),
      base: sum.base + num(row.baseTtc),
      withheld: sum.withheld + num(row.withholdingAmount),
    }),
    { count: 0, base: 0, withheld: 0 },
  );

  return (
    <SectionCard
      title={t(`${P}.withholding.title`)}
      hint={t(`${P}.withholding.hint`)}
      footer={
        rows.length > 0 ? (
          <span className="flex items-start gap-1.5">
            <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {t(`${P}.withholding.note`)}
          </span>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t(`${P}.withholding.empty`)}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">{t('invoicesAdmin.colClient')}</TableHead>
              <TableHead>{t(`${P}.withholding.colTaxId`)}</TableHead>
              <TableHead className="text-right">{t(`${P}.colInvoices`)}</TableHead>
              <TableHead className="text-right">{t(`${P}.withholding.colBase`)}</TableHead>
              <TableHead className="pr-4 text-right">{t(`${P}.withholding.colAmount`)}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.doctorId ?? `name:${row.name}`}>
                <TableCell className="pl-4">
                  <button
                    type="button"
                    onClick={() => onOpenDoctor({ id: row.doctorId, name: row.name })}
                    title={t(`${P}.withholding.openTitle`, { name: row.name })}
                    className="inline-flex min-h-11 max-w-64 items-center text-left font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none sm:min-h-0"
                  >
                    <span className="truncate">{row.name}</span>
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {row.taxId || '—'}
                </TableCell>
                <TableCell className={MONEY}>{num(row.count)}</TableCell>
                <TableCell className={MONEY}>{formatPrice(num(row.baseTtc))}</TableCell>
                <TableCell className={cn(MONEY, 'pr-4 font-medium')}>
                  {formatPrice(num(row.withholdingAmount))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 1 ? (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="pl-4 font-semibold" colSpan={2}>
                  {t(`${P}.total`)}{' '}
                  <span className="font-normal text-muted-foreground">
                    ({plural(t, lang, `${P}.doctors`, rows.length)})
                  </span>
                </TableCell>
                <TableCell className={cn(MONEY, 'font-semibold')}>{totals.count}</TableCell>
                <TableCell className={cn(MONEY, 'font-semibold')}>
                  {formatPrice(totals.base)}
                </TableCell>
                <TableCell className={cn(MONEY, 'pr-4 font-semibold')}>
                  {formatPrice(totals.withheld)}
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      )}
    </SectionCard>
  );
}

// ─── Months ──────────────────────────────────────────────────────────

function ByMonth({ data }: { data: InvoiceAccountingSummary }) {
  const { t, lang } = useT();
  const c = data.counted;
  const months = [...data.byMonth].sort((a, b) => a.month.localeCompare(b.month));
  return (
    <SectionCard title={t(`${P}.months.title`)} hint={t(`${P}.months.hint`)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">{t(`${P}.months.colMonth`)}</TableHead>
            <TableHead className="text-right">{t(`${P}.colInvoices`)}</TableHead>
            <TableHead className="text-right">{t(`${P}.months.colHt`)}</TableHead>
            <TableHead className="text-right">{t(`${P}.months.colTva`)}</TableHead>
            <TableHead className="text-right">{t(`${P}.months.colStamp`)}</TableHead>
            <TableHead className="text-right">{t(`${P}.months.colTtc`)}</TableHead>
            <TableHead className="text-right">{t(`${P}.months.colWithholding`)}</TableHead>
            <TableHead className="pr-4 text-right">{t(`${P}.months.colNet`)}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {months.map((row) => (
            <TableRow key={row.month}>
              <TableCell className="pl-4 font-medium">{monthLabel(row.month, lang)}</TableCell>
              <TableCell className={MONEY}>{num(row.count)}</TableCell>
              <TableCell className={MONEY}>{formatPrice(num(row.subTotalHt))}</TableCell>
              <TableCell className={MONEY}>{formatPrice(num(row.tvaAmount))}</TableCell>
              <TableCell className={MONEY}>{formatPrice(num(row.stampDuty))}</TableCell>
              <TableCell className={MONEY}>{formatPrice(num(row.totalTtc))}</TableCell>
              <TableCell className={MONEY}>{formatPrice(num(row.withholdingAmount))}</TableCell>
              <TableCell className={cn(MONEY, 'pr-4')}>{formatPrice(num(row.netPayable))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell className="pl-4 font-semibold">{t(`${P}.total`)}</TableCell>
            <TableCell className={cn(MONEY, 'font-semibold')}>{num(c.count)}</TableCell>
            <TableCell className={cn(MONEY, 'font-semibold')}>{formatPrice(num(c.subTotalHt))}</TableCell>
            <TableCell className={cn(MONEY, 'font-semibold')}>{formatPrice(num(c.tvaAmount))}</TableCell>
            <TableCell className={cn(MONEY, 'font-semibold')}>{formatPrice(num(c.stampDuty))}</TableCell>
            <TableCell className={cn(MONEY, 'font-semibold')}>{formatPrice(num(c.totalTtc))}</TableCell>
            <TableCell className={cn(MONEY, 'font-semibold')}>
              {formatPrice(num(c.withholdingAmount))}
            </TableCell>
            <TableCell className={cn(MONEY, 'pr-4 font-semibold')}>
              {formatPrice(num(c.netPayable))}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </SectionCard>
  );
}

// ─── What was left out ───────────────────────────────────────────────

function Notes({ data }: { data: InvoiceAccountingSummary }) {
  const { t, lang } = useT();
  const parts: string[] = [];
  if (num(data.drafts.count) > 0) {
    parts.push(
      t(`${P}.notes.drafts`, {
        invoices: plural(t, lang, `${P}.drafts`, num(data.drafts.count)),
        amount: formatPrice(num(data.drafts.totalTtc)),
      }),
    );
  }
  if (num(data.cancelled.count) > 0) {
    parts.push(
      t(`${P}.notes.cancelled`, {
        invoices: plural(t, lang, `${P}.cancelledInvoices`, num(data.cancelled.count)),
        amount: formatPrice(num(data.cancelled.totalTtc)),
      }),
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <CalculatorIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {t(`${P}.notes.rule`)}
        {parts.length > 0 ? ` ${t(`${P}.notes.excluded`)} ${parts.join(' · ')}.` : ''}
      </span>
    </p>
  );
}

function EmptyRecap({
  data,
  onShowList,
}: {
  data: InvoiceAccountingSummary;
  onShowList: () => void;
}) {
  const { t } = useT();
  const others = num(data.drafts.count) + num(data.cancelled.count);
  return (
    <>
      <div className={cn(CARD, 'flex flex-col items-center gap-3 px-6 py-12 text-center')}>
        <ReceiptTextIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">{t(`${P}.empty.title`)}</p>
        <p className="max-w-md text-sm text-muted-foreground">{t(`${P}.empty.body`)}</p>
        {others > 0 ? (
          <Button variant="outline" className="h-11 sm:h-8" onClick={onShowList}>
            {t(`${P}.empty.showList`)}
          </Button>
        ) : null}
      </div>
      <Notes data={data} />
    </>
  );
}
