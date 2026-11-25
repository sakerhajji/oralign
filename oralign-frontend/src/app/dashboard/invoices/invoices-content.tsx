'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon, MoreHorizontalIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import {
  AccountingRecap,
  type DoctorTarget,
} from '@/components/invoices/accounting/accounting-recap';
import { ExportMenu } from '@/components/invoices/accounting/export-menu';
import { PeriodBar } from '@/components/invoices/accounting/period-bar';
import {
  periodRange,
  rangeSentence,
  toPeriodParams,
  type DeskView,
} from '@/components/invoices/accounting/period';
import { RecapSkeleton } from '@/components/invoices/accounting/recap-parts';
import {
  useBusinessToday,
  useInvoiceDesk,
} from '@/components/invoices/accounting/use-invoice-desk';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { invoiceKeys, useInvoiceAccountingSummary } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import { cn } from '@/lib/utils';
import { InvoiceListView, NEW_INVOICE_PATH, type DoctorFocus } from './invoice-list-view';

/**
 * Admin invoicing desk.
 *
 * Header (new invoice, exports) → one period bar for the whole page →
 * two views: the récapitulatif comptable (what the accountant needs for
 * the period: TVA per rate, stamps, retenues à la source, cash collected)
 * and the invoice list of the same period. The view and the period live
 * in the URL (`?view=list&period=lastMonth`), so a reload keeps them.
 */
export function InvoicesContent() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (user && !isAdmin) router.replace('/dashboard');
  }, [user, isAdmin, router]);

  if (!user) return <DeskSkeleton />;
  if (!isAdmin) return null;
  return <InvoiceDesk />;
}

function InvoiceDesk() {
  const { t, lang } = useT();
  const queryClient = useQueryClient();
  const { state, setView, setPeriod } = useInvoiceDesk();
  const today = useBusinessToday();

  const range = React.useMemo(() => periodRange(state.period, today), [state.period, today]);
  const periodParams = React.useMemo(() => toPeriodParams(range), [range]);
  const accounting = useInvoiceAccountingSummary(periodParams);
  const fetching = useIsFetching({ queryKey: invoiceKeys.all }) > 0;

  const [showArchived, setShowArchived] = React.useState(false);
  const [doctorFocus, setDoctorFocus] = React.useState<DoctorFocus | null>(null);

  // The list mounts on its first visit, then stays mounted (hidden) so its
  // search, status tab and page survive a trip to the récapitulatif.
  const [listVisited, setListVisited] = React.useState(state.view === 'list');
  if (state.view === 'list' && !listVisited) setListVisited(true);

  const summary = accounting.data;
  // Every invoice of the period, archive aside: counted + drafts + cancelled.
  const periodCount =
    summary && !accounting.isPlaceholderData
      ? summary.counted.count + summary.drafts.count + summary.cancelled.count
      : undefined;
  const zipCount =
    summary && !accounting.isPlaceholderData
      ? summary.counted.count + summary.cancelled.count
      : undefined;
  const rangeLabel = rangeSentence(range, lang, t);

  const openDoctor = (doctor: DoctorTarget) => {
    setDoctorFocus((current) => ({ ...doctor, nonce: (current?.nonce ?? 0) + 1 }));
    setShowArchived(false);
    setView('list');
  };

  const toggleTrash = () => {
    setShowArchived((value) => !value);
    setView('list');
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-3 pb-8 sm:gap-5 sm:p-5 lg:p-8">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {t('invoicesAdmin.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('invoiceDesk.accounting.subtitle')}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button asChild className="h-11 flex-1 sm:h-8 sm:flex-none">
            <Link href={NEW_INVOICE_PATH}>
              <PlusIcon className="size-4" />
              {t('invoicesAdmin.create')}
            </Link>
          </Button>
          <ExportMenu period={periodParams} rangeLabel={rangeLabel} zipCount={zipCount} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-11 sm:size-8"
                aria-label={t('invoiceDesk.moreActions')}
              >
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => void queryClient.invalidateQueries({ queryKey: invoiceKeys.all })}
                disabled={fetching}
              >
                <RefreshCwIcon className={cn('size-4', fetching && 'animate-spin')} />
                {t('invoicesAdmin.refresh')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleTrash}>
                <ArchiveIcon className="size-4" />
                {showArchived ? t('invoiceDesk.backToList') : t('invoicesAdmin.trash')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <PeriodBar period={state.period} range={range} today={today} onChange={setPeriod} />

      <Tabs
        value={state.view}
        onValueChange={(next) => setView(next as DeskView)}
        className="gap-4"
      >
        {/* The strip sits on a full-width rule. */}
        <div className="-mx-3 overflow-x-auto border-b px-3 sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0">
          <TabsList
            variant="line"
            aria-label={t('invoiceDesk.accounting.tabs.aria')}
            className="h-auto gap-5 pb-[5px]"
          >
            <TabsTrigger value="recap" className="h-11 flex-none px-0.5 text-[15px] sm:h-9">
              {t('invoiceDesk.accounting.tabs.recap')}
            </TabsTrigger>
            <TabsTrigger value="list" className="h-11 flex-none px-0.5 text-[15px] sm:h-9">
              {t('invoiceDesk.accounting.tabs.list')}
              <span
                className={cn(
                  'min-w-6 rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums',
                  periodCount === undefined && 'invisible',
                )}
              >
                {periodCount ?? 0}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="recap" className="min-w-0 text-base outline-none">
          <AccountingRecap
            query={accounting}
            onOpenDoctor={openDoctor}
            onShowList={() => setView('list')}
          />
        </TabsContent>
        <TabsContent
          value="list"
          forceMount
          className="min-w-0 text-base outline-none data-[state=inactive]:hidden"
        >
          {listVisited ? (
            <InvoiceListView
              range={range}
              showArchived={showArchived}
              onShowArchivedChange={setShowArchived}
              doctorFocus={doctorFocus}
              onClearDoctor={() => setDoctorFocus(null)}
              onAllDates={() => setPeriod({ key: 'all', from: '', to: '' })}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** The desk's frame while the signed-in user loads. */
function DeskSkeleton() {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-4 p-3 pb-8 sm:gap-5 sm:p-5 lg:p-8"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Skeleton className="h-7 w-32 sm:h-8" />
          <Skeleton className="mt-1 h-5 w-72 max-w-full" />
        </div>
        <Skeleton className="h-11 w-full sm:h-8 sm:w-64" />
      </div>
      <Skeleton className="h-[5.5rem] w-full rounded-xl" />
      <Skeleton className="h-11 w-64 max-w-full" />
      <RecapSkeleton />
    </div>
  );
}
