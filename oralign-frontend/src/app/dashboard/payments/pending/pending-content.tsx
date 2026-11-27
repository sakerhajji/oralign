'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RefreshCw, X } from 'lucide-react';
import {
  TransferQueueList,
  TransferQueueSkeleton,
} from '@/components/payments/pending/transfer-queue-list';
import {
  QUEUE_PAGE_SIZE,
  QUEUE_RECENT_DAYS,
  QUEUE_TABS,
  adoptAddressReview,
  queueUrlSearch,
  readQueueUrl,
  reviewStartState,
  reviewStep,
  type QueueUrlState,
} from '@/components/payments/pending/queue-format';
import { TransferReviewDialog } from '@/components/payments/pending/transfer-review-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useMarkTransferSubjectRead,
  useTransferQueue,
} from '@/lib/hooks/use-transfer-queue';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import { UserRole, type TransferQueueFilter, type TransferQueueRow } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatBusinessTime } from '@/lib/utils/business-day';

const HISTORY_URL = '/dashboard/payments/history';

/**
 * « Paiements en attente »: the practitioners' bank transfers (pack
 * installments and treatment fees) in ONE queue, four tabs (Nouveaux = not
 * yet opened by me, À vérifier = every transfer awaiting, Validés / Refusés
 * = the last 30 days), each row opening its receipt and the decision.
 * Admins only; anyone else is sent where their payments are.
 */
export function PendingPaymentsContent() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const signedInOther = !!user && !isAdmin;

  useEffect(() => {
    if (!signedInOther) return;
    // A dentist's payments live in the history desk; other roles have no
    // money screen at all.
    router.replace(user?.role === UserRole.DENTIST ? HISTORY_URL : '/dashboard');
  }, [signedInOther, router, user?.role]);

  if (!user) return <PendingDeskSkeleton />;
  if (!isAdmin) return <NoAccess />;
  return <PendingDesk key={user.id} />;
}

/**
 * The desk's state in the address bar (replaceState: tabs never stack
 * history). Read on mount, then written; a notification's ?review= link
 * clicked while the desk is open (same page, only the query changes, so
 * Next keeps this instance) is adopted during the render, like any other
 * state derived from a changed input (adoptAddressReview).
 */
function useQueueUrlState(): [QueueUrlState, (patch: Partial<QueueUrlState>) => void] {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<QueueUrlState>(() =>
    reviewStartState(readQueueUrl(searchParams)),
  );

  const address = readQueueUrl(searchParams);
  const [seenReview, setSeenReview] = useState(address.review);
  if (address.review !== seenReview) {
    setSeenReview(address.review);
    const adopted = adoptAddressReview(seenReview, address, state);
    if (adopted) setState(adopted);
  }

  useEffect(() => {
    const search = queueUrlSearch(state, window.location.search);
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${pathname}${search}${window.location.hash}`);
    }
  }, [state, pathname]);

  const patch = useCallback((next: Partial<QueueUrlState>) => {
    setState((current) => {
      const merged = { ...current, ...next };
      return merged.filter === current.filter &&
        merged.page === current.page &&
        merged.review === current.review
        ? current
        : merged;
    });
  }, []);
  return [state, patch];
}

function PendingDesk() {
  const { t, lang } = useT();
  const pathname = usePathname();
  const [url, patchUrl] = useQueueUrlState();
  const params = useMemo(
    () => ({ filter: url.filter, page: url.page, limit: QUEUE_PAGE_SIZE }),
    [url.filter, url.page],
  );
  const queue = useTransferQueue(params);
  const markSubjectRead = useMarkTransferSubjectRead();
  const page = queue.data;
  const rows = page?.data;
  const fresh = !!page && !queue.isPlaceholderData;

  // The open review: its subject, and the row as it was opened (kept while
  // the row leaves the tab after a decision, or someone else's).
  const [opened, setOpened] = useState<TransferQueueRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const liveRow = opened ? (rows?.find((row) => row.subjectKey === opened.subjectKey) ?? opened) : null;
  const openRow = useCallback((row: TransferQueueRow) => {
    setOpened(row);
    setDialogOpen(true);
  }, []);

  // A notification's link (?review=<subject>): open that transfer once the
  // page holding it is loaded, page after page from the first (the queue
  // is newest first, so an older transfer still awaiting sits further
  // down), or say it is not there. Settled during the render (no effect
  // round-trip), then the address forgets it.
  const [gone, setGone] = useState<{ key: string; final: boolean } | null>(null);
  // A new subject to open: an earlier « not found » banner is about
  // another transfer.
  const [reviewing, setReviewing] = useState(url.review);
  if (url.review !== reviewing) {
    setReviewing(url.review);
    if (url.review && gone) setGone(null);
  }
  if (url.review && fresh && page) {
    const step = reviewStep(url.review, url.filter, page);
    if (step.kind === 'found') {
      setOpened(page.data[step.index]);
      setDialogOpen(true);
      patchUrl({ review: null });
    } else if (step.kind === 'next_page') {
      patchUrl({ page: step.page });
    } else if (step.kind === 'gone') {
      // Final when the whole À vérifier tab was searched: the transfer is
      // out of the queue for good. Elsewhere it is only not in that tab.
      setGone({ key: url.review, final: step.final });
      patchUrl({ review: null });
    }
  }
  // A transfer gone for good must not keep my bell and badge counting it.
  const { mutate: markRead } = markSubjectRead;
  useEffect(() => {
    if (gone?.final) markRead(gone.key);
  }, [gone, markRead]);

  const setTab = (filter: TransferQueueFilter) => {
    setGone(null);
    patchUrl({ filter, page: 1, review: null });
  };
  const setPage = (next: number) => {
    patchUrl({ page: next });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // Past the last page (rows processed meanwhile): back to the last one.
  if (fresh && page && page.totalPages > 0 && url.page > page.totalPages) {
    patchUrl({ page: page.totalPages });
  }

  // On a narrow phone the strip scrolls sideways: a tab opened from the
  // address (?filter=refuse, a reload, a notification) may sit past the
  // edge. Bring the selected one into the strip, sideways only.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!strip || !active) return;
    const box = strip.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    if (tab.left < box.left || tab.right > box.right) {
      strip.scrollLeft += tab.left - box.left - (box.width - tab.width) / 2;
    }
  }, [url.filter]);

  const returnTo = `${pathname}${queueUrlSearch({ ...url, review: null }, '')}`;
  const updatedAt = queue.dataUpdatedAt;

  return (
    <DeskFrame>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {t('pendingDesk.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('pendingDesk.subtitle')}</p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {updatedAt > 0 && (
            <span className="hidden text-xs text-muted-foreground tabular-nums md:inline">
              {t('pendingDesk.updatedAt', {
                time: formatBusinessTime(new Date(updatedAt).toISOString(), lang),
              })}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void queue.refetch()}
            aria-label={t('pendingDesk.refresh')}
            title={t('pendingDesk.refresh')}
            className="text-muted-foreground pointer-coarse:size-12"
          >
            <RefreshCw className={cn(queue.isFetching && 'animate-spin')} aria-hidden="true" />
          </Button>
          <Button asChild variant="outline" size="sm" className="pointer-coarse:h-12">
            <Link href={HISTORY_URL}>{t('pendingDesk.historyLink')}</Link>
          </Button>
        </div>
      </header>

      <Tabs
        value={url.filter}
        onValueChange={(next) => setTab(next as TransferQueueFilter)}
        className="gap-4"
      >
        {/* The strip sits on a full-width rule; it scrolls sideways on a
            narrow phone instead of wrapping. */}
        <div
          ref={stripRef}
          className="no-scrollbar -mx-4 overflow-x-auto border-b px-4 lg:mx-0 lg:px-0"
        >
          <TabsList
            variant="line"
            aria-label={t('pendingDesk.tabs.aria')}
            className="h-auto gap-5 pb-[5px]"
          >
            {QUEUE_TABS.map((tab) => {
              const count = page?.counts[tab];
              const attention = tab === 'nouveau' && (count ?? 0) > 0;
              return (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="flex-none px-0.5 text-[15px] pointer-coarse:min-h-12"
                >
                  {t(`pendingDesk.tabs.${tab}`)}
                  <span
                    className={cn(
                      'min-w-6 rounded-full px-1.5 text-xs font-medium tabular-nums',
                      attention
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                      count === undefined && 'invisible',
                    )}
                  >
                    {count ?? 0}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* One panel, the open tab's: only its page is fetched. */}
        <TabsContent value={url.filter} className="flex min-w-0 flex-col gap-4">
          <TabHint filter={url.filter} />

          {gone && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
            >
              <Inbox className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {/* « No longer awaiting » only once the whole À vérifier
                    tab was searched; in another tab it is only absent. */}
                <p className="font-medium">
                  {t(gone.final ? 'pendingDesk.gone.title' : 'pendingDesk.gone.notInTabTitle')}
                </p>
                <p className="mt-0.5 text-xs opacity-90">
                  {t(gone.final ? 'pendingDesk.gone.body' : 'pendingDesk.gone.notInTabBody')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-me-1 shrink-0 pointer-coarse:size-12"
                onClick={() => setGone(null)}
                aria-label={t('pendingDesk.gone.dismiss')}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          )}

          {queue.isPending ? (
            <TransferQueueSkeleton />
          ) : queue.isError && !page ? (
            <DeskMessage
              icon={<AlertTriangle className="size-6 text-red-500" aria-hidden="true" />}
              title={t('pendingDesk.loadError')}
              detail={queue.error.message}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:h-12 pointer-coarse:px-4"
                  onClick={() => void queue.refetch()}
                >
                  <RefreshCw aria-hidden="true" />
                  {t('pendingDesk.retry')}
                </Button>
              }
            />
          ) : page && page.data.length === 0 ? (
            <EmptyTab filter={url.filter} />
          ) : page ? (
            <div
              aria-busy={queue.isPlaceholderData || undefined}
              className={cn('transition-opacity duration-150', queue.isPlaceholderData && 'opacity-60')}
            >
              {/* A refresh that failed while rows are on screen: say so, keep them. */}
              {queue.isError && (
                <p role="alert" className="mb-2 flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  {t('pendingDesk.staleError')}
                  <Button
                    variant="link"
                    size="xs"
                    className="h-auto px-0 pointer-coarse:min-h-12"
                    onClick={() => void queue.refetch()}
                  >
                    {t('pendingDesk.retry')}
                  </Button>
                </p>
              )}
              <TransferQueueList rows={page.data} onOpen={openRow} />
              {page.totalPages > 1 && (
                <Pager
                  page={page.page}
                  totalPages={page.totalPages}
                  total={page.total}
                  busy={queue.isFetching}
                  onPage={setPage}
                />
              )}
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      <TransferReviewDialog
        row={liveRow}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        returnTo={returnTo}
      />
    </DeskFrame>
  );
}

function TabHint({ filter }: { filter: TransferQueueFilter }) {
  const { t } = useT();
  if (filter === 'nouveau' || filter === 'a_verifier') {
    return <p className="-mt-1 text-xs text-muted-foreground">{t(`pendingDesk.tabHint.${filter}`)}</p>;
  }
  return (
    <p className="-mt-1 text-xs text-muted-foreground">
      {t('pendingDesk.tabHint.recent', { days: QUEUE_RECENT_DAYS })}{' '}
      <Link href={HISTORY_URL} className="font-medium text-foreground underline underline-offset-4">
        {t('pendingDesk.historyLink')}
      </Link>
      .
    </p>
  );
}

function EmptyTab({ filter }: { filter: TransferQueueFilter }) {
  const { t } = useT();
  const body =
    filter === 'nouveau'
      ? t('pendingDesk.empty.nouveauBody')
      : filter === 'a_verifier'
        ? t('pendingDesk.empty.a_verifierBody')
        : undefined;
  return (
    <DeskMessage
      icon={<Inbox className="size-6 text-muted-foreground" aria-hidden="true" />}
      title={t(`pendingDesk.empty.${filter}`, { days: QUEUE_RECENT_DAYS })}
      detail={body}
    />
  );
}

function Pager({
  page,
  totalPages,
  total,
  busy,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  const { t } = useT();
  return (
    <nav
      aria-label={t('pendingDesk.pager.aria')}
      className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
    >
      <span className="text-muted-foreground tabular-nums">
        {t('pendingDesk.pager.pageOf', { page, total: totalPages, count: total })}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="pointer-coarse:h-12"
          disabled={page <= 1 || busy}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
          {t('pendingDesk.pager.previous')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="pointer-coarse:h-12"
          disabled={page >= totalPages || busy}
          onClick={() => onPage(page + 1)}
        >
          {t('pendingDesk.pager.next')}
          <ChevronRight className="rtl:rotate-180" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

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

function DeskMessage({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-12 text-center ring-1 ring-foreground/10">
      {icon}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {detail && <p className="max-w-md text-xs text-muted-foreground">{detail}</p>}
      </div>
      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

function NoAccess() {
  const { t } = useT();
  return (
    <DeskFrame>
      <DeskMessage
        icon={<Inbox className="size-6 text-muted-foreground" aria-hidden="true" />}
        title={t('pendingDesk.noAccess')}
        detail={t('pendingDesk.noAccessBody')}
      />
    </DeskFrame>
  );
}

/** The desk's layout with grey bars, before the user is known. */
export function PendingDeskSkeleton() {
  return (
    <DeskFrame>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80 max-w-[70vw]" />
        </div>
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>
      <div className="flex gap-5 border-b pb-2">
        {QUEUE_TABS.map((tab) => (
          <Skeleton key={tab} className="h-5 w-24" />
        ))}
      </div>
      <TransferQueueSkeleton />
    </DeskFrame>
  );
}

