'use client';

import { useId, useState } from 'react';
import { Download, FileDown, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { saveBlobAs } from '@/lib/api/blob-download';
import { usePaymentPractitioners, usePaymentsReport } from '@/lib/hooks';
import type { Lang } from '@/lib/i18n/dict';
import { useT } from '@/lib/i18n/lang-context';
import { toast } from '@/lib/toast';
import type { PaymentsReportKind } from '@/lib/types';
import { cn } from '@/lib/utils';
import { printPdf } from '@/lib/utils/print-pdf';
import {
  TAB_PURPOSE,
  TAB_REPORT_KIND,
  toReportRequest,
  type DeskState,
  type HistoryTab,
  type TabFilters,
} from './history-filters';

type Translate = (path: string, vars?: Record<string, string | number>) => string;
type TabTotals = Partial<Record<HistoryTab, number>>;

const KINDS: PaymentsReportKind[] = ['treatment_fee', 'installment', 'consolidated'];

/** The tabs a report kind covers, in the desk's order. */
const KIND_TABS: Record<PaymentsReportKind, HistoryTab[]> = {
  treatment_fee: ['frais'],
  installment: ['echeances'],
  consolidated: ['frais', 'echeances'],
};

const KIND_LABEL: Record<PaymentsReportKind, string> = {
  treatment_fee: 'paymentsDesk.report.scopeFees',
  installment: 'paymentsDesk.report.scopeInstallments',
  consolidated: 'paymentsDesk.report.scopeConsolidated',
};

/**
 * "Exporter le rapport PDF": the page's main action. The dialog says what
 * the report will hold (the open tab by default, or both: consolidated),
 * in which language, and with which criteria — the period and each tab's
 * own filters, exactly as on screen — then downloads or prints the PDF
 * the server builds from every matching row.
 */
export function ReportExport({
  state,
  today,
  isAdmin,
  totals,
  rangeLabel,
}: {
  state: DeskState;
  today: string;
  isAdmin: boolean;
  /** Each tab's row count, for the scope options. */
  totals: TabTotals;
  /** The period in words. */
  rangeLabel: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-9 shrink-0 gap-2">
          <FileDown aria-hidden="true" />
          <span className="hidden sm:inline">{t('paymentsDesk.report.export')}</span>
          <span className="sm:hidden">{t('paymentsDesk.report.exportShort')}</span>
        </Button>
      </DialogTrigger>
      {/* Mounted while open: each opening starts from the open tab. */}
      {open && (
        <ReportDialog
          state={state}
          today={today}
          isAdmin={isAdmin}
          totals={totals}
          rangeLabel={rangeLabel}
          onDone={() => setOpen(false)}
        />
      )}
    </Dialog>
  );
}

function rowsText(count: number | undefined, t: Translate): string | null {
  if (count === undefined) return null;
  if (count === 0) return t('paymentsDesk.report.rowsNone');
  if (count === 1) return t('paymentsDesk.report.rowsOne');
  return t('paymentsDesk.report.rows', { count });
}

function ReportDialog({
  state,
  today,
  isAdmin,
  totals,
  rangeLabel,
  onDone,
}: {
  state: DeskState;
  today: string;
  isAdmin: boolean;
  totals: TabTotals;
  rangeLabel: string;
  onDone: () => void;
}) {
  const { t, lang } = useT();
  const [kind, setKind] = useState<PaymentsReportKind>(TAB_REPORT_KIND[state.tab]);
  const [reportLang, setReportLang] = useState<Lang>(lang);
  const [action, setAction] = useState<'download' | 'print' | null>(null);
  const report = usePaymentsReport();
  const kindName = useId();
  const langName = useId();

  const run = (mode: 'download' | 'print') => {
    setAction(mode);
    report.mutate(toReportRequest(state, kind, reportLang, today, { isAdmin }), {
      onSuccess: ({ blob, fileName }) => {
        if (mode === 'download') {
          saveBlobAs(blob, fileName);
          toast.success(t('paymentsDesk.report.downloaded', { name: fileName }));
        } else {
          printPdf(blob);
        }
        onDone();
      },
      onSettled: () => setAction(null),
    });
  };

  const errorCode = (report.error as (Error & { errorCode?: string }) | null)?.errorCode;
  const error = report.error
    ? errorCode === 'REPORT_TOO_LARGE'
      ? t('paymentsDesk.report.errors.tooLarge')
      : t('paymentsDesk.report.errors.generic')
    : null;

  const rowsOf = (each: PaymentsReportKind) => {
    const tabs = KIND_TABS[each];
    if (tabs.some((tab) => totals[tab] === undefined)) return null;
    return rowsText(
      tabs.reduce((sum, tab) => sum + (totals[tab] ?? 0), 0),
      t,
    );
  };

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('paymentsDesk.report.title')}</DialogTitle>
        <DialogDescription>{t('paymentsDesk.report.description')}</DialogDescription>
      </DialogHeader>

      <fieldset className="flex flex-col gap-2" disabled={report.isPending}>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">
          {t('paymentsDesk.report.scope')}
        </legend>
        {KINDS.map((each) => {
          const rows = rowsOf(each);
          return (
            <label
              key={each}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40',
                'has-[input:checked]:border-foreground has-[input:checked]:bg-muted/50',
                'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring/50',
              )}
            >
              <input
                type="radio"
                name={kindName}
                value={each}
                checked={kind === each}
                onChange={() => setKind(each)}
                className="mt-0.5 size-4 accent-foreground"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium">{t(KIND_LABEL[each])}</span>
                  {rows && (
                    <span className="text-xs text-muted-foreground tabular-nums">{rows}</span>
                  )}
                </span>
                {each === 'consolidated' && (
                  <span className="text-xs text-muted-foreground">
                    {t('paymentsDesk.report.scopeConsolidatedHint')}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-2" disabled={report.isPending}>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">
          {t('paymentsDesk.report.language')}
        </legend>
        <div className="flex flex-wrap gap-4">
          {(['fr', 'en'] as const).map((each) => (
            <label key={each} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name={langName}
                value={each}
                checked={reportLang === each}
                onChange={() => setReportLang(each)}
                className="size-4 accent-foreground"
              />
              {each === 'fr' ? t('paymentsDesk.report.french') : t('paymentsDesk.report.english')}
            </label>
          ))}
        </div>
      </fieldset>

      <section className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
        <h3 className="text-xs font-medium text-muted-foreground">
          {t('paymentsDesk.report.criteria')}
        </h3>
        <p className="text-sm">
          {t('paymentsDesk.filters.chip', {
            label: t('paymentsDesk.period.label'),
            value: rangeLabel,
          })}
        </p>
        {KIND_TABS[kind].map((tab) => (
          <TabCriteria key={tab} tab={tab} filters={state.filters[tab]} isAdmin={isAdmin} />
        ))}
        <p className="text-xs text-muted-foreground">{t('paymentsDesk.report.note')}</p>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {report.isPending && (
        <p role="status" className="sr-only">
          {t('paymentsDesk.report.generating')}
        </p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => run('print')} disabled={report.isPending}>
          {action === 'print' ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Printer aria-hidden="true" />
          )}
          {t('paymentsDesk.report.print')}
        </Button>
        <Button onClick={() => run('download')} disabled={report.isPending}>
          {action === 'download' ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {t('paymentsDesk.report.download')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** One tab's filters in words, as the report will print them. */
function TabCriteria({
  tab,
  filters,
  isAdmin,
}: {
  tab: HistoryTab;
  filters: TabFilters;
  isAdmin: boolean;
}) {
  const { t } = useT();
  const picked = isAdmin && filters.doctor !== 'all';
  const practitioners = usePaymentPractitioners(TAB_PURPOSE[tab], { enabled: picked });
  const chip = (label: string, value: string) =>
    t('paymentsDesk.filters.chip', { label, value });

  const parts: string[] = [];
  if (picked) {
    parts.push(
      chip(
        t('paymentsDesk.filters.practitioner'),
        practitioners.data?.find((doctor) => doctor.id === filters.doctor)?.fullName ??
          t('paymentsDesk.filters.practitionerUnlisted'),
      ),
    );
  }
  if (filters.method !== 'all') {
    parts.push(chip(t('paymentsDesk.filters.method'), t(`paymentsDesk.method.${filters.method}`)));
  }
  if (filters.status !== 'all') {
    parts.push(chip(t('paymentsDesk.filters.status'), t(`paymentsDesk.status.${filters.status}`)));
  }
  if (tab === 'echeances' && filters.rank !== 'all') {
    parts.push(t(`paymentsDesk.filters.rankChip.${filters.rank}`));
  }
  if (filters.search) {
    parts.push(t('paymentsDesk.filters.chipSearch', { value: filters.search }));
  }

  return (
    <p className="text-sm">
      <span className="font-medium">
        {tab === 'frais' ? t('paymentsDesk.tabs.fees') : t('paymentsDesk.tabs.installments')}
      </span>
      <span className="text-muted-foreground">
        {' — '}
        {parts.length > 0 ? parts.join(' · ') : t('paymentsDesk.report.noFilter')}
      </span>
    </p>
  );
}
