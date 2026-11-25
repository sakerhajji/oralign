'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { ListChecks, RefreshCw } from 'lucide-react';
import { AnomaliesView } from '@/components/production-admin/anomalies-view';
import { pluralSuffix } from '@/components/production-admin/format';
import { JournalView } from '@/components/production-admin/journal-view';
import { NoticesView } from '@/components/production-admin/notices-view';
import { ActFiguresSkeleton, PanelSkeleton } from '@/components/production-admin/parts';
import {
  PILOTAGE_VIEWS,
  periodDays,
  type PilotageView,
} from '@/components/production-admin/pilotage-state';
import { ProgressView } from '@/components/production-admin/progress-view';
import { RecapView } from '@/components/production-admin/recap-view';
import {
  useBusinessToday,
  usePilotageState,
} from '@/components/production-admin/use-pilotage-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  invalidateProductionAdmin,
  productionAdminKeys,
  useFailedNoticeCount,
  useProductionAnomalies,
} from '@/lib/hooks/use-production-admin';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import type { ProductionNoticeStatus } from '@/lib/types/production';
import { cn } from '@/lib/utils';

/** Where a non-admin lands: the production queue (technicians work there). */
const NON_ADMIN_HOME = '/dashboard/production';

/**
 * The lab owner's production desk. Waits for the signed-in user: an admin
 * gets the desk, anyone else is sent to the production queue (the API
 * refuses them these figures anyway), so a hard reload never flashes it.
 */
export function PilotageContent() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !isAdmin) router.replace(NON_ADMIN_HOME);
  }, [user, isAdmin, router]);

  if (!user || !isAdmin) return <PilotageSkeleton />;
  return <PilotageDesk key={user.id} />;
}

function PilotageDesk() {
  const { t, lang } = useT();
  const queryClient = useQueryClient();
  const today = useBusinessToday();
  const desk = usePilotageState(today);
  const { state, setView, setNoticeStatus } = desk;

  const day = state.day || today;
  const range = useMemo(() => periodDays(state.period, today), [state.period, today]);

  // The two tabs whose count needs action: the period's discrepancies and
  // the notices failed for good. The Écarts badge is the desk's "something
  // to review" signal, so it shows on every view: it shares the Écarts
  // view's cache entry, fetched once per period, and never polls (only the
  // open Écarts view does).
  const anomalies = useProductionAnomalies(range);
  const anomalyCount = anomalies.isPlaceholderData ? undefined : anomalies.data?.items.length;
  const failedNotices = useFailedNoticeCount();
  const counts: Partial<Record<PilotageView, number | undefined>> = {
    ecarts: anomalyCount,
    notices: failedNotices,
  };

  const fetching = useIsFetching({ queryKey: productionAdminKeys.all }) > 0;

  const showNotices = (status: ProductionNoticeStatus) => {
    setNoticeStatus(status);
    setView('notices');
  };

  return (
    <DeskFrame>
      <DeskHeader
        action={
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground sm:size-8"
              onClick={() => void invalidateProductionAdmin(queryClient)}
              aria-label={t('productionAdmin.refresh')}
              title={t('productionAdmin.refresh')}
            >
              <RefreshCw className={cn(fetching && 'animate-spin')} aria-hidden="true" />
            </Button>
            <Button asChild variant="outline" className="h-11 sm:h-8">
              <Link href={NON_ADMIN_HOME}>
                <ListChecks aria-hidden="true" />
                {t('productionAdmin.openQueue')}
              </Link>
            </Button>
          </>
        }
      />

      <Tabs
        value={state.view}
        onValueChange={(next) => setView(next as PilotageView)}
        className="gap-4"
      >
        {/* The strip sits on a full-width rule. On a phone the five views
            wrap onto a second row instead of scrolling sideways, so every
            tab and its count stay in sight. The list's own height must be
            auto (the primitive pins it to h-8 through a group variant, which
            a plain h-auto does not beat): otherwise the rows and the active
            underline overflow it. */}
        <div className="-mx-4 border-b px-4 lg:mx-0 lg:px-0">
          <TabsList
            variant="line"
            aria-label={t('productionAdmin.viewsAria')}
            className="flex-wrap justify-start gap-x-5 gap-y-[5px] pb-[5px] group-data-horizontal/tabs:h-auto"
          >
            {PILOTAGE_VIEWS.map((view) => {
              const count = counts[view];
              return (
                <TabsTrigger
                  key={view}
                  value={view}
                  className="h-11 flex-none px-0.5 text-[15px] sm:h-9"
                >
                  {t(`productionAdmin.views.${view}`)}
                  {count ? (
                    <>
                      <span
                        className="min-w-6 rounded-full bg-muted px-1.5 text-xs font-medium text-foreground tabular-nums"
                        aria-hidden="true"
                      >
                        {count}
                      </span>
                      <span className="sr-only">
                        {t(`productionAdmin.tabCount.${view}${pluralSuffix(count, lang)}`, {
                          count,
                        })}
                      </span>
                    </>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Only the open view is mounted: only its figures are fetched. */}
        <TabsContent value="journal" className="min-w-0 outline-none">
          <JournalView day={day} today={today} onDayChange={desk.setDay} />
        </TabsContent>
        <TabsContent value="recap" className="min-w-0 outline-none">
          <RecapView
            period={state.period}
            range={range}
            today={today}
            onPeriodChange={desk.setPeriod}
          />
        </TabsContent>
        <TabsContent value="avancement" className="min-w-0 outline-none">
          <ProgressView
            filters={state.progress}
            searchKey={desk.searchKey}
            today={today}
            onPatch={desk.patchProgress}
            onReset={desk.resetProgress}
            onPage={desk.setProgressPage}
          />
        </TabsContent>
        <TabsContent value="ecarts" className="min-w-0 outline-none">
          <AnomaliesView
            period={state.period}
            range={range}
            today={today}
            kind={state.kind}
            onPeriodChange={desk.setPeriod}
            onKindChange={desk.setKind}
            onShowNotices={showNotices}
          />
        </TabsContent>
        <TabsContent value="notices" className="min-w-0 outline-none">
          <NoticesView
            filters={state.notices}
            today={today}
            onStatus={desk.setNoticeStatus}
            onPage={desk.setNoticePage}
          />
        </TabsContent>
      </Tabs>
    </DeskFrame>
  );
}

// ─── Frame, header, skeleton ────────────────────────────────────────

function DeskFrame({ children }: { children: ReactNode }) {
  return (
    <div className="@container/main flex min-w-0 flex-1 flex-col">
      {/* Bottom room on phones: the support bubble floats there. */}
      <div className="flex min-w-0 flex-col gap-4 px-4 pt-4 pb-24 md:gap-5 md:pt-6 md:pb-8 lg:px-6">
        {children}
      </div>
    </div>
  );
}

function DeskHeader({ action }: { action?: ReactNode }) {
  const { t } = useT();
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t('productionAdmin.title')}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t('productionAdmin.subtitle')}
        </p>
      </div>
      {action ? <div className="flex items-center gap-1 sm:gap-2">{action}</div> : null}
    </header>
  );
}

/** The desk's own layout with grey bars, before the user (or the URL) is known. */
export function PilotageSkeleton() {
  return (
    <DeskFrame>
      <div className="flex items-start justify-between gap-3" aria-hidden="true">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64 max-w-[70vw]" />
          <Skeleton className="h-4 w-96 max-w-[80vw]" />
        </div>
        <Skeleton className="hidden h-8 w-40 rounded-lg sm:block" />
      </div>
      {/* Rows as tall as the real tabs, wrapping the same way on a phone. */}
      <div className="flex flex-wrap gap-x-5 gap-y-[5px] border-b pt-[3px] pb-[5px]" aria-hidden="true">
        {PILOTAGE_VIEWS.map((view) => (
          <Skeleton key={view} className="my-3 h-5 w-20 shrink-0 sm:my-2" />
        ))}
      </div>
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-9 w-72 max-w-full rounded-lg" />
        <ActFiguresSkeleton />
        <PanelSkeleton rows={4} />
      </div>
    </DeskFrame>
  );
}
