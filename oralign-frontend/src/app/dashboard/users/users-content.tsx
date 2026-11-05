'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import {
  Ban,
  CheckCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Users as UsersIcon,
} from 'lucide-react';
import {
  useBulkDeleteUsers,
  useBulkPermanentlyDeleteUsers,
  useBulkRestoreUsers,
  useBulkUpdateStatus,
  useDeletedUsers,
  useUpdateApproval,
  useUsers,
  useUserStats,
} from '@/lib/hooks/use-users';
import { VerificationStatus, type User } from '@/lib/types';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PermanentDeleteDialog } from '@/components/shared/permanent-delete-dialog';
import {
  AdminUsersList,
  UsersListSkeleton,
  type UserRowAction,
} from '@/components/users/admin-users-list';
import { ClinicViewDialog } from '@/components/users/clinic-view-dialog';
import { SearchFilters } from '@/components/users/search-filters';
import { ListPagination } from '@/components/shared/list-pagination';
import { UsersStats, useCountLabel } from '@/components/users/users-stats';
import {
  EMPTY_USERS_FILTERS,
  USERS_PAGE_SIZE,
  hasActiveFilters,
  readUsersUrlState,
  sameFilters,
  toUserFilterParams,
  usersUrlSearch,
  type UsersFilters,
  type UsersView,
} from '@/components/users/users-filters';

// Opened on demand: they carry the phone input (react-phone-input-2 and
// its flag sprite CSS) and the clinic map, none of which the list needs.
const loadCreateUserDialog = () => import('@/components/users/create-user-dialog');
const loadUserDetailSheet = () => import('@/components/users/user-detail-sheet');

const CreateUserDialog = dynamic(
  () => loadCreateUserDialog().then((mod) => mod.CreateUserDialog),
  { ssr: false },
);
const UserDetailSheet = dynamic(
  () => loadUserDetailSheet().then((mod) => mod.UserDetailSheet),
  { ssr: false },
);

type PendingAction = { action: UserRowAction; ids: string[] };

const ACTION_TITLE: Record<UserRowAction, string> = {
  delete: 'usersAdmin.bulkDeleteTitle',
  restore: 'usersAdmin.bulkRestoreTitle',
  permanent: 'usersAdmin.bulkPermanentTitle',
  block: 'usersAdmin.bulkBlockTitle',
  activate: 'usersAdmin.bulkActivateTitle',
};
const ACTION_VERB: Record<UserRowAction, string> = {
  delete: 'usersAdmin.bulkActionDelete',
  restore: 'usersAdmin.bulkActionRestore',
  permanent: 'usersAdmin.bulkActionPermanent',
  block: 'usersAdmin.bulkActionBlock',
  activate: 'usersAdmin.bulkActionActivate',
};
const ACTION_BUTTON: Record<UserRowAction, string> = {
  delete: 'usersAdmin.btnDelete',
  restore: 'usersAdmin.btnRestore',
  permanent: 'usersAdmin.btnPermanent',
  block: 'usersAdmin.btnBlock',
  activate: 'usersAdmin.btnActivate',
};

export function UsersPageContent() {
  const { t } = useT();
  const countLabel = useCountLabel();
  const searchParams = useSearchParams();

  // ── View state. The URL is read once (deep links, reload) and then only
  // written, with history.replaceState: no navigation, no RSC request,
  // and nothing ever flows back into the search box while typing.
  const [initial] = useState(() => readUsersUrlState(searchParams));
  const [view, setView] = useState<UsersView>(initial.view);
  const [filters, setFilters] = useState<UsersFilters>(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [searchBoxKey, setSearchBoxKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // ── Dialogs
  const [createMounted, setCreateMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<{ userId: string; tab: string; key: number } | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [clinicViewUser, setClinicViewUser] = useState<User | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const listTopRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const search = usersUrlSearch({ view, page, filters }, window.location.search);
    if (search !== window.location.search) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${search}${window.location.hash}`,
      );
    }
  }, [view, page, filters]);

  // Warm the on-demand chunks once the page is idle, so the first click on
  // "Add user" or a row does not wait for the network.
  useEffect(() => {
    const preload = () => {
      void loadUserDetailSheet();
      void loadCreateUserDialog();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(preload, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  // ── Data
  const apiParams = useMemo(() => toUserFilterParams(filters, page), [filters, page]);
  const activeQuery = useUsers(apiParams, { enabled: view === 'active' });
  const deletedQuery = useDeletedUsers(apiParams, { enabled: view === 'deleted' });
  const list = view === 'deleted' ? deletedQuery : activeQuery;
  const stats = useUserStats();

  const bulkDelete = useBulkDeleteUsers();
  const bulkRestore = useBulkRestoreUsers();
  const bulkPermanentDelete = useBulkPermanentlyDeleteUsers();
  const bulkUpdateStatus = useBulkUpdateStatus();
  const updateApproval = useUpdateApproval();

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = list.data?.totalPages ?? 1;
  // Previous rows stay on screen while the next search/filter/page loads.
  const refreshing = list.isPlaceholderData;
  const filtered = hasActiveFilters(filters);
  const pendingCount = stats.data?.pending ?? 0;

  // A page past the end (stale link, last row of a page deleted): settle on
  // the last page that exists once the real answer for this key is in.
  if (list.data && !list.isPlaceholderData) {
    const lastPage = Math.max(1, list.data.totalPages);
    if (page > lastPage) setPage(lastPage);
  }

  // ── State changes. Any filter, page or tab change clears the selection:
  // bulk actions must never hit rows that are no longer on screen.
  const changeFilters = (patch: Partial<UsersFilters>) => {
    const next = { ...filters, ...patch };
    if (sameFilters(next, filters)) return;
    setFilters(next);
    setPage(1);
    setSelected(new Set());
  };

  const clearFilters = () => {
    setFilters(EMPTY_USERS_FILTERS);
    setPage(1);
    setSelected(new Set());
    setSearchBoxKey((key) => key + 1);
  };

  const changeView = (next: UsersView) => {
    if (next === view) return;
    setView(next);
    setPage(1);
    setSelected(new Set());
  };

  const goToPage = (next: number) => {
    setPage(next);
    setSelected(new Set());
    const top = listTopRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) {
      listTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  };

  const toggleAll = () =>
    setSelected((prev) =>
      rows.length > 0 && rows.every((u) => prev.has(u.id))
        ? new Set()
        : new Set(rows.map((u) => u.id)),
    );

  const toggleUser = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openCreate = () => {
    setCreateMounted(true);
    setCreateOpen(true);
  };

  // A new key per opening remounts the sheet on the right tab; closing
  // keeps it mounted so the slide-out animation plays.
  const openUser = (userId: string, tab = 'profile') => {
    setDetail((prev) => ({ userId, tab, key: (prev?.key ?? 0) + 1 }));
    setDetailOpen(true);
  };

  // ── Bulk / row actions
  const actionBusy =
    bulkDelete.isPending ||
    bulkRestore.isPending ||
    bulkPermanentDelete.isPending ||
    bulkUpdateStatus.isPending;

  const askAction = (action: UserRowAction, ids: string[]) => {
    if (ids.length > 0) setPendingAction({ action, ids });
  };

  const runAction = async () => {
    if (!pendingAction || actionBusy) return;
    const { action, ids } = pendingAction;
    try {
      if (action === 'delete') await bulkDelete.mutateAsync({ ids });
      else if (action === 'restore') await bulkRestore.mutateAsync({ ids });
      else if (action === 'permanent') await bulkPermanentDelete.mutateAsync({ ids });
      else await bulkUpdateStatus.mutateAsync({ ids, isActive: action === 'activate' });
    } catch {
      // The hook already toasted the backend's explanation (409 = history
      // depends on it). Keep the selection so the admin can act again.
      setPendingAction(null);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setPendingAction(null);
  };

  const confirmText = pendingAction
    ? t(pendingAction.ids.length === 1 ? 'usersAdmin.bulkConfirmOne' : 'usersAdmin.bulkConfirmMany', {
        action: t(ACTION_VERB[pendingAction.action]),
        count: pendingAction.ids.length,
      }) +
      (pendingAction.action === 'delete' ? t('usersAdmin.bulkIrreversible') : '')
    : '';

  const selectedIds = [...selected];

  return (
    <UsersPageFrame>
      <UsersHeader onAdd={openCreate} />

      {view === 'active' && pendingCount > 0 && filters.approval !== VerificationStatus.PENDING && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/30">
          <p className="flex min-w-0 items-start gap-2.5 text-sm text-amber-900 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              <span className="font-medium">
                {t(pendingCount === 1 ? 'usersAdmin.pendingBannerOne' : 'usersAdmin.pendingBannerMany', {
                  count: pendingCount,
                })}
              </span>{' '}
              <span className="text-amber-800/80 dark:text-amber-300/80">
                {t('usersDesk.pending.hint')}
              </span>
            </span>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 self-start border-amber-300 bg-background/70 sm:self-auto dark:border-amber-800"
            onClick={() => changeFilters({ approval: VerificationStatus.PENDING })}
          >
            {t('usersDesk.pending.show')}
          </Button>
        </div>
      )}

      <UsersStats stats={stats.data} unavailable={stats.isError} />

      <Tabs value={view} onValueChange={(value) => changeView(value as UsersView)}>
        <TabsList variant="line">
          <TabsTrigger value="active" className="px-3">
            {t('usersDesk.tabs.accounts')}
          </TabsTrigger>
          <TabsTrigger value="deleted" className="px-3">
            {t('usersDesk.tabs.deleted')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <SearchFilters
        key={searchBoxKey}
        filters={filters}
        onChange={changeFilters}
        busy={refreshing}
        placeholder={
          view === 'deleted'
            ? t('usersDesk.filters.searchDeletedPh')
            : t('usersDesk.filters.searchPh')
        }
      />

      <section
        ref={listTopRef}
        aria-labelledby="users-list-title"
        className="flex scroll-mt-4 flex-col gap-3"
      >
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-center gap-3">
            {rows.length > 0 && (
              <Checkbox
                className="lg:hidden"
                checked={rows.every((u) => selected.has(u.id))}
                onCheckedChange={toggleAll}
                aria-label={t('usersDesk.list.selectPage')}
              />
            )}
            {list.isLoading ? (
              <Skeleton className="h-4 w-28" />
            ) : (
              <h2 id="users-list-title" className="truncate text-sm font-medium tabular-nums">
                {view === 'deleted'
                  ? countLabel('usersDesk.list.deleted', total)
                  : countLabel('usersDesk.list.users', total)}
              </h2>
            )}
          </div>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              {t('usersDesk.filters.clear')}
            </Button>
          )}
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <span className="text-sm font-medium">
              {t(selected.size === 1 ? 'usersAdmin.selectedOne' : 'usersAdmin.selectedMany', {
                count: selected.size,
              })}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {view === 'deleted' ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => askAction('restore', selectedIds)}>
                    <RefreshCw aria-hidden="true" />
                    {t('usersAdmin.restore')}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => askAction('permanent', selectedIds)}>
                    <Trash2 aria-hidden="true" />
                    {t('usersAdmin.permanentlyDelete')}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => askAction('activate', selectedIds)}>
                    <CheckCircle aria-hidden="true" />
                    {t('usersAdmin.activate')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => askAction('block', selectedIds)}>
                    <Ban aria-hidden="true" />
                    {t('usersAdmin.block')}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => askAction('delete', selectedIds)}>
                    <Trash2 aria-hidden="true" />
                    {t('usersAdmin.delete')}
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                {t('usersAdmin.cancel')}
              </Button>
            </div>
          </div>
        )}

        {list.isLoading ? (
          <UsersListSkeleton />
        ) : list.isError && !list.data ? (
          <ListMessage
            title={t('usersDesk.list.loadError')}
            detail={list.error?.message}
            action={
              <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
                <RefreshCw aria-hidden="true" />
                {t('usersAdmin.retry')}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <ListMessage
            title={
              filtered
                ? t('usersDesk.list.emptyFiltered')
                : view === 'deleted'
                  ? t('usersAdmin.emptyDeleted')
                  : t('usersAdmin.emptyActive')
            }
            action={
              filtered ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  {t('usersDesk.filters.clear')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div
            aria-busy={refreshing}
            className={cn('transition-opacity duration-150', refreshing && 'opacity-60')}
          >
            <AdminUsersList
              users={rows}
              viewMode={view}
              selectedUsers={selected}
              onToggleAll={toggleAll}
              onToggleUser={toggleUser}
              onOpenUser={openUser}
              onViewClinic={setClinicViewUser}
              onApprovalChange={(id, verificationStatus) =>
                updateApproval.mutate({ id, verificationStatus })
              }
              onUserAction={(user, action) => askAction(action, [user.id])}
            />
          </div>
        )}

        {!list.isLoading && rows.length > 0 && (
          <ListPagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={USERS_PAGE_SIZE}
            onPageChange={goToPage}
          />
        )}
      </section>

      {createMounted && <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />}
      {detail && (
        <UserDetailSheet
          key={detail.key}
          userId={detail.userId}
          initialTab={detail.tab}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      )}
      {clinicViewUser?.dentistProfile && (
        <ClinicViewDialog
          open
          onOpenChange={(open) => !open && setClinicViewUser(null)}
          profile={clinicViewUser.dentistProfile}
          dentistName={clinicViewUser.fullName}
        />
      )}

      {/* Permanent (hard) delete — typed confirmation, stays open while pending. */}
      <PermanentDeleteDialog
        open={pendingAction?.action === 'permanent'}
        onOpenChange={(open) => {
          if (!open && !bulkPermanentDelete.isPending) setPendingAction(null);
        }}
        title={t('usersAdmin.bulkPermanentTitle')}
        description={confirmText + t('usersAdmin.bulkPermanentNote')}
        confirmLabel={t('usersAdmin.btnPermanent')}
        pending={bulkPermanentDelete.isPending}
        onConfirm={() => void runAction()}
      />

      {/* Soft delete / restore / block / activate. */}
      <AlertDialog
        open={!!pendingAction && pendingAction.action !== 'permanent'}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction ? t(ACTION_TITLE[pendingAction.action]) : null}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirmText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>{t('usersAdmin.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant={pendingAction?.action === 'delete' ? 'destructive' : 'default'}
              disabled={actionBusy}
              onClick={(event) => {
                // Keep the dialog open until the mutation settles (Radix
                // would close it on click otherwise).
                event.preventDefault();
                void runAction();
              }}
            >
              {pendingAction ? t(ACTION_BUTTON[pendingAction.action]) : null}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UsersPageFrame>
  );
}

// ─── Shared frame (page + its Suspense fallback) ─────────────────────────────

function UsersPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="@container/main flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 flex-col gap-4 px-4 py-4 md:gap-5 md:py-6 lg:px-6">
        {children}
      </div>
    </div>
  );
}

function UsersHeader({ onAdd }: { onAdd?: () => void }) {
  const { t } = useT();
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t('usersAdmin.title')}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t('usersDesk.subtitle')}
        </p>
      </div>
      <Button className="w-full shrink-0 sm:w-auto" onClick={onAdd} disabled={!onAdd}>
        <Plus aria-hidden="true" />
        {t('usersAdmin.addUser')}
      </Button>
    </header>
  );
}

function ListMessage({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-12 text-center ring-1 ring-foreground/10">
      <UsersIcon className="size-6 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * The page's Suspense fallback (before `useSearchParams` resolves): the
 * same frame, header, figures, tabs, filter bar and list shapes as the
 * loaded page, so nothing moves when it swaps in.
 */
export function UsersPageSkeleton() {
  const { t } = useT();
  return (
    <UsersPageFrame>
      <UsersHeader />
      <UsersStats stats={undefined} />
      <div className="flex h-8 items-center gap-4 px-3" aria-hidden="true">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center" aria-hidden="true">
        <Skeleton className="h-9 w-full xl:flex-1" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:flex xl:shrink-0">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full xl:w-40" />
          ))}
        </div>
      </div>
      <section className="flex flex-col gap-3" aria-busy="true" aria-label={t('usersAdmin.loadingFallback')}>
        <div className="flex min-h-8 items-center">
          <Skeleton className="h-4 w-28" />
        </div>
        <UsersListSkeleton />
      </section>
    </UsersPageFrame>
  );
}
