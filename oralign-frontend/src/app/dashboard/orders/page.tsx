'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { useT } from '@/lib/i18n/lang-context';
import { PermanentDeleteDialog } from '@/components/shared/permanent-delete-dialog';
import type { Lang } from '@/lib/i18n/dict';
import {
  AlertTriangle,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Edit,
  Eye,
  FileText,
  Filter,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldX,
  Trash,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { TreatmentFeeBadge } from '@/components/orders/treatment-fee-badge';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  buildOrderNavigationHref,
  handleOrderNavigation,
} from '@/lib/orders/order-navigation';
import {
  useBulkDeleteOrders,
  useBulkPermanentDeleteOrders,
  useBulkRestoreOrders,
  useBulkUpdateOrderStatus,
  useDeleteOrder,
  useDentistOptions,
  useOrderPrefetch,
  useOrders,
  useOverrideOrderStatus,
  usePermanentDeleteOrder,
  useRestoreOrder,
} from '@/lib/hooks';
import {
  DentalOrder,
  OrderFilterParams,
  OrderSortField,
  OrderStatus,
  SortOrder,
  UserRole,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  OrderPatientCell,
  OrderReviewBadge,
} from '@/components/orders/order-list-cells';

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

// Status filter buckets surfaced as tabs above the table. Each tab
// now carries a LIST of statuses so a single tab can cover an entire
// lifecycle phase — the Treatment-plan tab returns every row in any
// planning sub-state (planning + ready + revision-requested +
// approved) instead of only the one we historically picked. The
// backend's `statuses[]` filter handles the IN-set.
//
// Previously each tab filtered on ONE status: the "Treatment plan"
// tab missed orders sitting in PLANNING / READY / REVISION; the
// "In Fabrication" tab missed legacy PAID rows; users saw empty
// pages and complained the filter was broken. The list-per-tab
// model fixes all three issues without forcing the user to flip
// between two near-identical tabs.
//
// Notes on the layout:
//   • Submitted bucket also covers UNDER_REVIEW because admins who
//     haven't started planning yet still keep the row in that
//     "fresh inbox" mental box.
//   • Quote-sent bucket spans the whole post-quote / pre-paid range
//     (sent → plan selected → pending → review) so the doctor sees
//     "this is where the money conversation lives".
//   • In Fabrication bucket includes PAID for legacy rows (the
//     backend now auto-transitions paid → fabrication, but older
//     paid rows still need a home).
//   • Done bucket is FINISHED only — when the last batch is
//     delivered we now auto-transition there.
const STATUS_TABS = [
  {
    key: 'all' as const,
    labelKey: 'ordersPage.tabAll',
    statuses: [] as OrderStatus[],
  },
  {
    key: OrderStatus.DRAFT,
    labelKey: 'ordersPage.tabDraft',
    statuses: [OrderStatus.DRAFT],
  },
  {
    key: OrderStatus.SUBMITTED,
    labelKey: 'ordersPage.tabSubmitted',
    statuses: [OrderStatus.SUBMITTED, OrderStatus.UNDER_REVIEW],
  },
  {
    key: OrderStatus.TREATMENT_APPROVED,
    labelKey: 'ordersPage.tabTreatmentPlan',
    statuses: [
      OrderStatus.TREATMENT_PLANNING,
      OrderStatus.TREATMENT_PLAN_READY,
      OrderStatus.REVISION_REQUESTED,
      OrderStatus.TREATMENT_APPROVED,
    ],
  },
  {
    key: OrderStatus.QUOTATION_SENT,
    labelKey: 'ordersPage.tabQuoteSent',
    statuses: [
      OrderStatus.QUOTATION_SENT,
      OrderStatus.PAYMENT_PLAN_SELECTED,
      OrderStatus.PAYMENT_PENDING,
      OrderStatus.PAYMENT_REVIEW,
    ],
  },
  {
    key: OrderStatus.FABRICATION,
    labelKey: 'ordersPage.tabInFabrication',
    statuses: [
      OrderStatus.PAID,
      OrderStatus.FABRICATION,
      OrderStatus.READY_TO_SHIP,
      // SHIPPED used to live in its own tab. The clinical team
      // decided the in-transit window is too short to deserve a
      // dedicated bucket — most rows pass through SHIPPED for hours,
      // not days, before the admin flips the last batch to delivered
      // and the order auto-finishes. Fold it back into "In
      // Fabrication" so the workflow strip stays clean.
      OrderStatus.SHIPPED,
    ],
  },
  {
    key: OrderStatus.FINISHED,
    labelKey: 'ordersPage.tabDone',
    statuses: [OrderStatus.FINISHED],
  },
] as const;

const LEGACY_STATUSES = new Set<OrderStatus>([
  OrderStatus.IN_REVIEW,
  OrderStatus.APPROVED,
  OrderStatus.REJECTED,
  OrderStatus.CANCELLED,
]);

// Default sort: newest first. The dropdown lets the planner flip to
// other fields without leaving the page. Each option carries a
// `labelKey` so the dropdown re-renders the menu in the current
// language.
const SORT_OPTIONS: Array<{
  key: string;
  labelKey: string;
  field: OrderSortField;
  order: SortOrder;
}> = [
  { key: 'created-desc', labelKey: 'ordersPage.sortNewest', field: 'createdAt', order: 'desc' },
  { key: 'created-asc', labelKey: 'ordersPage.sortOldest', field: 'createdAt', order: 'asc' },
  { key: 'updated-desc', labelKey: 'ordersPage.sortUpdated', field: 'updatedAt', order: 'desc' },
  { key: 'code-asc', labelKey: 'ordersPage.sortCodeAsc', field: 'orderCode', order: 'asc' },
  { key: 'code-desc', labelKey: 'ordersPage.sortCodeDesc', field: 'orderCode', order: 'desc' },
  { key: 'status-asc', labelKey: 'ordersPage.sortStatus', field: 'status', order: 'asc' },
];

// Locale-aware date helpers shared by row + mobile-card formatters.
const dateLocale = (lang: Lang): Locale | undefined =>
  lang === 'fr' ? frLocale : undefined;
const dateFormat = (lang: Lang) =>
  lang === 'fr' ? 'd MMM yyyy' : 'MMM d, yyyy';

// Translator type — surfaced so leaf helpers can accept `t` without
// pulling the context in places that already have it in scope.
type TFn = (path: string, vars?: Record<string, string | number>) => string;

/**
 * Resolve an OrderStatus to its localised label by piggy-backing on
 * the existing `orders.statusLabel.*` dict block (it predates this
 * page's translation work). Falls back to the raw enum value when a
 * brand-new status lands before its translations do.
 */
function localisedStatusLabel(status: OrderStatus, t: TFn): string {
  const key = `orders.statusLabel.${status}`;
  const hit = t(key);
  return hit !== key ? hit : String(status);
}

export default function OrdersPage() {
  const router = useRouter();
  const { isAdmin, isDentist, user } = useAuth();
  const { t, lang } = useT();
  const deleteOrder = useDeleteOrder();
  const permanentDeleteOrder = usePermanentDeleteOrder();
  const restoreOrder = useRestoreOrder();
  const overrideStatus = useOverrideOrderStatus();
  const bulkUpdateStatus = useBulkUpdateOrderStatus();
  const bulkDelete = useBulkDeleteOrders();
  // Bulk operations that ONLY make sense in trash view — restore N
  // soft-deleted orders, or hard-delete them with file blob cleanup.
  const bulkRestore = useBulkRestoreOrders();
  const bulkPermanentDelete = useBulkPermanentDeleteOrders();
  const prefetchOrder = useOrderPrefetch();

  // ── Query state (all in URL-derivable shape so a future "share this
  //    view" feature can hydrate from search params without changes here).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [search, setSearch] = useState('');
  // Key bump so we can clear the uncontrolled search Input from outside
  // (chip dismiss / Clear all). Without this, the displayed text stays
  // stale even though `search` state is empty.
  const [searchInputKey, setSearchInputKey] = useState(0);
  const [statusTab, setStatusTab] = useState<OrderStatus | 'all'>('all');
  const [doctorFilter, setDoctorFilter] = useState<string>('all');
  const [createdFrom, setCreatedFrom] = useState<string>('');
  const [createdTo, setCreatedTo] = useState<string>('');
  const [sortKey, setSortKey] = useState<string>('created-desc');
  const [showFilters, setShowFilters] = useState(false);
  // Trash bin — admin-only toggle. When ON the page swaps to the
  // deleted-orders view (rows with deletedAt set) and the row menu
  // surfaces Restore + Delete forever instead of Edit + Delete. We
  // clear the multi-select when flipping so bulk-status doesn't fire
  // against deleted rows by accident.
  const [showDeleted, setShowDeleted] = useState(false);

  // ── Multi-select state ────────────────────────────────────────────
  // Keeps the chosen IDs in a Set for O(1) hit-tests during render.
  // Reset implicitly when the page changes (selections are scoped to
  // the currently-visible page — the bulk action bar makes that
  // intent explicit with "N orders selected").
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Dentist filter list — admins can filter orders by owning doctor.
  // Capped at 200 to avoid an unbounded fetch on large clinics.
  const dentistsQuery = useDentistOptions({ enabled: isAdmin });

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value.trim());
    setPage(1);
  }, 300);

  const params = useMemo<OrderFilterParams>(() => {
    const sortOption =
      SORT_OPTIONS.find((option) => option.key === sortKey) ?? SORT_OPTIONS[0];
    return {
      page,
      limit: pageSize,
      ...(search ? { search } : {}),
      // Send the multi-status list when the active tab carries more
      // than one OrderStatus (e.g. Treatment plan = 4 statuses). For
      // the single-status tabs the list still works — the backend
      // filter accepts both shapes. "All" sends nothing so every
      // status passes through.
      ...(() => {
        if (statusTab === 'all') return {};
        const tab = STATUS_TABS.find((t) => t.key === statusTab);
        return tab && tab.statuses.length > 0
          ? { statuses: [...tab.statuses] as OrderStatus[] }
          : { status: statusTab as OrderStatus };
      })(),
      ...(isAdmin && doctorFilter !== 'all' ? { doctorId: doctorFilter } : {}),
      ...(createdFrom ? { createdFrom } : {}),
      ...(createdTo ? { createdTo } : {}),
      // Trash-bin filter is admin-only on the backend — sending it
      // from a doctor session is a no-op (silently ignored).
      ...(isAdmin && showDeleted ? { includeDeleted: true } : {}),
      sortBy: sortOption.field,
      sortOrder: sortOption.order,
    };
  }, [
    page,
    pageSize,
    search,
    statusTab,
    isAdmin,
    doctorFilter,
    createdFrom,
    createdTo,
    sortKey,
    showDeleted,
  ]);

  const ordersQuery = useOrders(params);
  const orders = useMemo(() => ordersQuery.data?.data ?? [], [ordersQuery.data]);
  const total = ordersQuery.data?.total ?? 0;
  const totalPages = ordersQuery.data?.totalPages ?? 1;
  const canCreate = isDentist || isAdmin;
  const canManage = isDentist || isAdmin;

  // Active-filter count drives the "Filters (N)" badge so the planner
  // sees at a glance how the result set is constrained.
  const activeFilterCount =
    (statusTab !== 'all' ? 1 : 0) +
    (search ? 1 : 0) +
    (isAdmin && doctorFilter !== 'all' ? 1 : 0) +
    (createdFrom ? 1 : 0) +
    (createdTo ? 1 : 0);

  // ── Selection derivations ────────────────────────────────────────
  // The "select all on this page" checkbox tristates between unchecked,
  // checked, and indeterminate based on what's already picked. The
  // currentPageSelected count drives the bulk action bar copy.
  const currentPageSelected = useMemo(
    () => orders.filter((order) => selectedIds.has(order.id)).length,
    [orders, selectedIds],
  );
  const allOnPageSelected =
    orders.length > 0 && currentPageSelected === orders.length;
  const someOnPageSelected =
    currentPageSelected > 0 && currentPageSelected < orders.length;

  // ── Memoised handlers ────────────────────────────────────────────
  // Pulled out so the rendered row components don't re-create their
  // callbacks on every keystroke in the search box — keeps the table
  // re-render scoped to the row that actually changed selection.

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const pageIds = orders.map((order) => order.id);
      const allSelected = pageIds.every((id) => next.has(id));
      if (allSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }, [orders]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const clearSearch = useCallback(() => {
    setSearch('');
    setSearchInputKey((current) => current + 1);
    setPage(1);
  }, []);

  const clearAllFilters = useCallback(() => {
    setStatusTab('all');
    clearSearch();
    setDoctorFilter('all');
    setCreatedFrom('');
    setCreatedTo('');
  }, [clearSearch]);

  // ── Bulk action handlers ─────────────────────────────────────────
  // Each one runs ONE network call (the backend wraps the batch in a
  // transaction). On success the selection is cleared so the next
  // action starts from a clean slate.

  const runBulkStatus = useCallback(
    (status: OrderStatus) => {
      if (selectedIds.size === 0) return;
      bulkUpdateStatus.mutate(
        { ids: Array.from(selectedIds), status },
        { onSuccess: () => clearSelection() },
      );
    },
    [bulkUpdateStatus, clearSelection, selectedIds],
  );

  const runBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    bulkDelete.mutate(Array.from(selectedIds), {
      onSuccess: () => clearSelection(),
    });
  }, [bulkDelete, clearSelection, selectedIds]);

  /** Trash-view: bring N selected deleted orders back to the catalogue. */
  const runBulkRestore = useCallback(() => {
    if (selectedIds.size === 0) return;
    bulkRestore.mutate(Array.from(selectedIds), {
      onSuccess: () => clearSelection(),
    });
  }, [bulkRestore, clearSelection, selectedIds]);

  /** Trash-view: hard-delete N selected orders + wipe their files. */
  const runBulkPermanentDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    bulkPermanentDelete.mutate(Array.from(selectedIds), {
      onSuccess: () => clearSelection(),
    });
  }, [bulkPermanentDelete, clearSelection, selectedIds]);

  const runSingleStatus = useCallback(
    (id: string, status: OrderStatus) => {
      overrideStatus.mutate({ id, status });
    },
    [overrideStatus],
  );

  const bulkPending =
    bulkUpdateStatus.isPending || bulkDelete.isPending;
  const trashBulkPending =
    bulkRestore.isPending || bulkPermanentDelete.isPending;

  return (
    <div className="@container/main flex flex-1 flex-col gap-5 p-4 pb-24 lg:p-6 lg:pb-24">
      {/* ─── Header ───────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-background">
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center lg:p-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ClipboardList className="h-4 w-4" />
              {t('ordersPage.eyebrow')}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('ordersPage.title')}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {isAdmin
                ? t('ordersPage.subtitleAdmin')
                : user?.role === UserRole.DESIGNER
                  ? t('ordersPage.subtitleDesigner')
                  : t('ordersPage.subtitleDentist')}
            </p>
          </div>
          {canCreate && (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/dashboard/orders/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('ordersPage.newOrder')}
              </Link>
            </Button>
          )}
        </div>
      </section>

      {/* ─── Toolbar (search + lifecycle tabs + sort + actions) ──── */}
      <Card>
        <CardContent className="grid min-w-0 gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_190px] xl:grid-cols-[minmax(300px,1fr)_minmax(500px,1.6fr)_190px]">
          <div className="relative min-w-0 md:order-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              key={searchInputKey}
              className="h-10 pl-10"
              placeholder={t('ordersPage.searchPh')}
              defaultValue={search}
              onChange={(event) => debouncedSearch(event.target.value)}
            />
          </div>
          <div className="min-w-0 md:order-3 md:col-span-2 xl:order-2 xl:col-span-1">
            <div
              className="flex h-10 min-w-0 w-full items-center gap-1 overflow-x-auto rounded-lg border bg-background p-1 scrollbar-none"
              role="tablist"
              aria-label={t('ordersPage.statusTabsAria')}
            >
              {STATUS_TABS.map((tab) => {
                const active = statusTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setStatusTab(tab.key);
                      setPage(1);
                    }}
                    className={cn(
                      'min-h-8 shrink-0 whitespace-nowrap rounded-md px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {t(tab.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 md:hidden">
            <SortMenu sortKey={sortKey} onChange={setSortKey} />
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 md:order-4 md:col-span-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-2"
              onClick={() => setShowFilters((current) => !current)}
            >
              <Filter className="h-4 w-4" />
              {t('ordersPage.filters')}
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 rounded-full bg-primary/10 px-1.5 text-primary"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

            {/* Trash-bin toggle — admin only. When ON the page swaps
                to deleted-orders view: the row menu surfaces Restore
                + Delete forever (the hard-delete that "deletes
                infinity"). Flipping the toggle clears the multi-
                select so bulk operations can't cross modes. */}
            {isAdmin && (
              <Button
                variant={showDeleted ? 'default' : 'outline'}
                size="sm"
                className="h-10 gap-2"
                onClick={() => {
                  setShowDeleted((current) => !current);
                  setPage(1);
                  clearSelection();
                }}
                aria-pressed={showDeleted}
                title={
                  showDeleted
                    ? t('ordersPage.backToActiveTitle')
                    : t('ordersPage.showDeletedTitle')
                }
              >
                <Trash className="h-4 w-4" />
                {showDeleted ? t('ordersPage.activeOrders') : t('ordersPage.trash')}
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={() => ordersQuery.refetch()}
              disabled={ordersQuery.isFetching}
              aria-label={t('ordersPage.refresh')}
            >
              <RefreshCw
                className={cn(
                  'h-4 w-4',
                  ordersQuery.isFetching && 'animate-spin',
                )}
              />
            </Button>
          </div>

          {/* Expandable filter row — keeps the toolbar compact when
              nothing's been touched, but a single click reveals the
              advanced filters (date range + dentist for admins). */}
          {showFilters && (
            <div className="col-span-full grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('ordersPage.dentistLabel')}
                  </Label>
                  <Select
                    value={doctorFilter}
                    onValueChange={(value) => {
                      setDoctorFilter(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={t('ordersPage.allDentists')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('ordersPage.allDentists')}</SelectItem>
                      {(dentistsQuery.data?.data ?? []).map((doctor) => (
                        <SelectItem key={doctor.id} value={doctor.id}>
                          {doctor.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('ordersPage.createdFrom')}
                </Label>
                <Input
                  type="date"
                  value={createdFrom}
                  onChange={(event) => {
                    setCreatedFrom(event.target.value);
                    setPage(1);
                  }}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('ordersPage.createdTo')}
                </Label>
                <Input
                  type="date"
                  value={createdTo}
                  onChange={(event) => {
                    setCreatedTo(event.target.value);
                    setPage(1);
                  }}
                  className="h-10"
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 gap-2"
                  onClick={clearAllFilters}
                  disabled={activeFilterCount === 0}
                >
                  <X className="h-4 w-4" />
                  {t('ordersPage.clearFilters')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Active filter chips ──────────────────────────────────────
          Render the in-effect filters as removable chips so the planner
          can see what's narrowing the results and dismiss one at a time
          without opening the filter panel. */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('ordersPage.activeLabel')}</span>
          {statusTab !== 'all' && (
            <FilterChip
              label={t('ordersPage.chipStatus', {
                // Resolve the active tab's friendly label (e.g.
                // "Treatment plan") rather than the underlying
                // single status (which would read "Treatment
                // approved" and confuse users into thinking the
                // filter is narrower than it actually is — the tab
                // covers four planning sub-statuses).
                value: (() => {
                  const tab = STATUS_TABS.find((t) => t.key === statusTab);
                  return tab
                    ? t(tab.labelKey)
                    : localisedStatusLabel(statusTab as OrderStatus, t);
                })(),
              })}
              onRemove={() => setStatusTab('all')}
            />
          )}
          {search && (
            <FilterChip
              label={t('ordersPage.chipSearch', { value: search })}
              onRemove={clearSearch}
            />
          )}
          {isAdmin && doctorFilter !== 'all' && (
            <FilterChip
              label={t('ordersPage.chipDentist', {
                value:
                  (dentistsQuery.data?.data ?? []).find((d) => d.id === doctorFilter)
                    ?.fullName ?? t('ordersPage.chipUnknown'),
              })}
              onRemove={() => setDoctorFilter('all')}
            />
          )}
          {createdFrom && (
            <FilterChip
              label={t('ordersPage.chipFrom', { value: createdFrom })}
              onRemove={() => setCreatedFrom('')}
            />
          )}
          {createdTo && (
            <FilterChip
              label={t('ordersPage.chipTo', { value: createdTo })}
              onRemove={() => setCreatedTo('')}
            />
          )}
        </div>
      )}

      {/* ─── Trash banner ────────────────────────────────────────────
          Surfaces the "viewing deleted orders" state so the admin
          can't lose track of what they're acting on. Recall: the
          row chrome is muted too, but a top banner makes the mode
          unmissable. */}
      {isAdmin && showDeleted && (
        <Card className="border-destructive/25 bg-destructive/5">
          <CardContent className="flex flex-col gap-2 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex items-center gap-2">
              <Trash className="h-4 w-4" />
              <span>{t('ordersPage.trashBannerBody')}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/25 bg-background text-destructive hover:bg-destructive/10"
              onClick={() => {
                setShowDeleted(false);
                setPage(1);
                clearSelection();
              }}
            >
              {t('ordersPage.backToActive')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Bulk action bar (admin-only) ─────────────────────────────
          Two variants, mutually exclusive on `showDeleted`:
            • Active view → status changes + soft delete
            • Trash view  → restore + permanent delete (file-blob wipe)
          The action bar only renders when at least one row is checked. */}
      {isAdmin && selectedIds.size > 0 && !showDeleted && (
        <BulkActionBar
          count={selectedIds.size}
          pending={bulkPending}
          onCancel={clearSelection}
          onSetStatus={runBulkStatus}
          onDelete={runBulkDelete}
        />
      )}
      {isAdmin && selectedIds.size > 0 && showDeleted && (
        <TrashBulkActionBar
          count={selectedIds.size}
          pending={trashBulkPending}
          onCancel={clearSelection}
          onRestore={runBulkRestore}
          onPermanentDelete={runBulkPermanentDelete}
        />
      )}

      {/* ─── Results ───────────────────────────────────────────────── */}
      {ordersQuery.isLoading ? (
        <OrdersLoading />
      ) : ordersQuery.error ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title={t('ordersPage.loadingFailedTitle')}
          description={ordersQuery.error.message}
          action={
            <Button variant="outline" onClick={() => ordersQuery.refetch()}>
              {t('ordersPage.tryAgain')}
            </Button>
          }
        />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={
            showDeleted ? (
              <Trash className="h-10 w-10" />
            ) : (
              <ClipboardList className="h-10 w-10" />
            )
          }
          title={
            showDeleted
              ? t('ordersPage.emptyTrashTitle')
              : t('ordersPage.emptyOrdersTitle')
          }
          description={
            showDeleted
              ? t('ordersPage.emptyTrashBody')
              : activeFilterCount > 0
                ? t('ordersPage.emptyFilteredBody')
                : t('ordersPage.emptyNoneBody')
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {showDeleted ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleted(false);
                    setPage(1);
                  }}
                >
                  {t('ordersPage.backToActiveTitle')}
                </Button>
              ) : (
                <>
                  {activeFilterCount > 0 && (
                    <Button variant="outline" onClick={clearAllFilters}>
                      {t('ordersPage.clearFilters')}
                    </Button>
                  )}
                  {canCreate && (
                    <Button asChild>
                      <Link href="/dashboard/orders/new">
                        <Plus className="mr-2 h-4 w-4" />
                        {t('ordersPage.newOrder')}
                      </Link>
                    </Button>
                  )}
                </>
              )}
            </div>
          }
        />
      ) : (
        <>
          {/* Desktop table. Each row prefetches the detail GET on
              hover/focus and navigates on click so the planner lands
              on the detail page with a warm cache (no spinner). */}
          <Card className="hidden overflow-hidden md:block">
            <Table className="min-w-[1240px]">
              {/*
                Sticky header so the column labels stay anchored while
                the planner scrolls through long result sets. The
                bg-muted/40 tint + backdrop-blur trick keeps the row
                edges legible when rows scroll underneath.
               */}
              <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur">
                <TableRow className="hover:bg-muted/40">
                  {isAdmin && (
                    <TableHead className="w-10">
                      <SelectAllCheckbox
                        checked={allOnPageSelected}
                        indeterminate={someOnPageSelected}
                        onChange={toggleAllOnPage}
                      />
                    </TableHead>
                  )}
                  <TableHead className="min-w-[230px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('ordersPage.colPatient')}
                  </TableHead>
                  <TableHead
                    className="w-[150px] p-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    aria-sort={sortKey === 'code-asc' ? 'ascending' : 'none'}
                  >
                    <button
                      type="button"
                      className="flex min-h-10 w-full items-center gap-1 px-2 text-left transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      onClick={() => setSortKey('code-asc')}
                    >
                      {t('ordersPage.colCaseId')}
                      {sortKey === 'code-asc' ? (
                        <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[190px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('ordersPage.colPractice')}
                  </TableHead>
                  <TableHead className="min-w-[180px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('ordersPage.colDoctor')}
                  </TableHead>
                  <TableHead
                    className="w-[150px] p-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    aria-sort={sortKey === 'created-desc' ? 'descending' : 'none'}
                  >
                    <button
                      type="button"
                      className="flex min-h-10 w-full items-center gap-1 px-2 text-left transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      onClick={() => setSortKey('created-desc')}
                    >
                      {t('ordersPage.colSubmitTime')}
                      {sortKey === 'created-desc' ? (
                        <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead
                    className="w-[150px] p-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    aria-sort={sortKey === 'updated-desc' ? 'descending' : 'none'}
                  >
                    <button
                      type="button"
                      className="flex min-h-10 w-full items-center gap-1 px-2 text-left transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      onClick={() => setSortKey('updated-desc')}
                    >
                      {t('ordersPage.colUpdateTime')}
                      {sortKey === 'updated-desc' ? (
                        <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[165px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('ordersPage.colCaseStatus')}
                  </TableHead>
                  <TableHead className="min-w-[185px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('ordersPage.colReviewStatus')}
                  </TableHead>
                  <TableHead className="min-w-[150px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('ordersPage.colOperation')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order.id}
                    role="link"
                    tabIndex={0}
                    aria-label={t('ordersPage.openOrderAria', { code: order.orderCode })}
                    onMouseEnter={() => prefetchOrder(order.id)}
                    onFocus={() => prefetchOrder(order.id)}
                    onClick={(event) => {
                      // Skip when the user clicks an interactive
                      // descendant — buttons, the action dropdown,
                      // alert-dialog triggers, etc.
                      if (
                        (event.target as HTMLElement).closest(
                          'button, a, [role="menuitem"], [role="dialog"]',
                        )
                      ) {
                        return;
                      }
                      handleOrderNavigation(order, router);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleOrderNavigation(order, router);
                      }
                    }}
                    data-state={
                      selectedIds.has(order.id) ? 'selected' : undefined
                    }
                    className={cn(
                      'cursor-pointer transition hover:bg-muted/30 focus:bg-muted/50 focus:outline-none',
                      selectedIds.has(order.id) && 'bg-primary/5',
                      // Trash-view tinting: muted background + destructive
                      // context so deleted rows are visually
                      // recoverable but unmistakably "not live".
                      showDeleted &&
                        'bg-muted/60 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {isAdmin && (
                      <TableCell
                        className="w-10"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.has(order.id)}
                          onCheckedChange={() => toggleRow(order.id)}
                          aria-label={t('ordersPage.selectOrderAria', { code: order.orderCode })}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <OrderPatientCell
                        patient={order.patient}
                        emptyLabel={t('ordersPage.noPatient')}
                        emptyContactLabel={t('ordersPage.noContact')}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium text-foreground">
                      {order.orderCode}
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-[190px] truncate text-sm font-medium">
                        {order.doctor?.clinicName ?? t('ordersPage.noDentist')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {order.doctor?.fullName ?? t('ordersPage.noDentist')}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {order.doctor?.email}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {format(new Date(order.submittedAt ?? order.createdAt), dateFormat(lang), {
                        locale: dateLocale(lang),
                      })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {format(new Date(order.updatedAt), dateFormat(lang), {
                        locale: dateLocale(lang),
                      })}
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <OrderReviewBadge
                          order={order}
                          isDoctor={isDentist}
                          isAdmin={isAdmin}
                          showEmpty
                        />
                        <TreatmentFeeBadge order={order} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        {canManage && !showDeleted ? (
                          <Link
                            href={`/dashboard/orders/${order.id}/edit`}
                            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {t('ordersPage.editShort')}
                          </Link>
                        ) : null}
                        <Link
                          href={buildOrderNavigationHref(order)}
                          className="text-xs font-semibold text-foreground transition hover:text-primary"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {t('ordersPage.detailShort')}
                        </Link>
                      <OrderRowActions
                        order={order}
                        canManage={canManage}
                        canPermanentDelete={isAdmin}
                        isAdmin={isAdmin}
                        isDeletedView={showDeleted}
                        isDeleting={deleteOrder.isPending}
                        isPermanentDeleting={permanentDeleteOrder.isPending}
                        isRestoring={restoreOrder.isPending}
                        onDelete={() => deleteOrder.mutate(order.id)}
                        onPermanentDelete={() =>
                          permanentDeleteOrder.mutate(order.id)
                        }
                        onRestore={() => restoreOrder.mutate(order.id)}
                        onChangeStatus={runSingleStatus}
                      />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile card list — same data, restacked vertically. The
              whole card is clickable so the planner doesn't have to
              hunt for a "View" button. */}
          <div className="grid gap-3 md:hidden">
            {orders.map((order) => (
              <OrderMobileCard
                key={order.id}
                order={order}
                isAdmin={isAdmin}
                canManage={canManage}
                canPermanentDelete={isAdmin}
                isDeletedView={showDeleted}
                isDeleting={deleteOrder.isPending}
                isPermanentDeleting={permanentDeleteOrder.isPending}
                isRestoring={restoreOrder.isPending}
                onPrefetch={() => prefetchOrder(order.id)}
                onDelete={() => deleteOrder.mutate(order.id)}
                onPermanentDelete={() => permanentDeleteOrder.mutate(order.id)}
                onRestore={() => restoreOrder.mutate(order.id)}
                onChangeStatus={runSingleStatus}
              />
            ))}
          </div>

          <OrdersPagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}

// ── Toolbar pieces ──────────────────────────────────────────────────

function SortMenu({
  sortKey,
  onChange,
}: {
  sortKey: string;
  onChange: (next: string) => void;
}) {
  const { t } = useT();
  const active = SORT_OPTIONS.find((option) => option.key === sortKey);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-10 w-full justify-start gap-2 px-3"
          aria-label={t('ordersPage.sortBy')}
        >
          {active?.order === 'asc' ? (
            <ArrowUp className="h-4 w-4" />
          ) : active?.order === 'desc' ? (
            <ArrowDown className="h-4 w-4" />
          ) : (
            <ArrowUpDown className="h-4 w-4" />
          )}
          <span className="min-w-0 truncate text-left text-xs">
            <span className="text-muted-foreground">{t('ordersPage.sortBy')}:</span>{' '}
            {active ? t(active.labelKey) : t('ordersPage.sort')}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('ordersPage.sortBy')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.key}
            onClick={() => onChange(option.key)}
            className={cn(
              'flex items-center justify-between gap-2',
              option.key === sortKey && 'bg-accent text-accent-foreground',
            )}
          >
            <span>{t(option.labelKey)}</span>
            {option.key === sortKey && <CheckCircle2 className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium transition hover:bg-muted hover:text-foreground"
    >
      <span>{label}</span>
      <X className="h-3 w-3" />
    </button>
  );
}

// ── Row actions (grouped DropdownMenu + confirm dialogs) ────────────

function OrderRowActions({
  order,
  canManage,
  canPermanentDelete,
  isAdmin,
  isDeletedView,
  isDeleting,
  isPermanentDeleting,
  isRestoring,
  onDelete,
  onPermanentDelete,
  onRestore,
  onChangeStatus,
}: {
  order: DentalOrder;
  canManage: boolean;
  canPermanentDelete: boolean;
  /** Admin-only flag drives the visibility of the inline status menu. */
  isAdmin: boolean;
  /** When true, the row belongs to the trash bin: surface Restore +
   *  Delete forever instead of Edit + Soft-delete. */
  isDeletedView?: boolean;
  isDeleting: boolean;
  isPermanentDeleting: boolean;
  isRestoring?: boolean;
  onDelete: () => void;
  onPermanentDelete: () => void;
  onRestore?: () => void;
  onChangeStatus?: (id: string, status: OrderStatus) => void;
}) {
  const { t } = useT();
  const [softOpen, setSoftOpen] = useState(false);
  const [hardOpen, setHardOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={t('ordersPage.actionsForAria', { code: order.orderCode })}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
            {order.orderCode}
            {isDeletedView ? (
              <span className="ml-1 text-destructive">{t('ordersPage.deletedSuffix')}</span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={buildOrderNavigationHref(order)} className="gap-2">
              <Eye className="h-4 w-4" />
              {t('ordersPage.viewOrder')}
            </Link>
          </DropdownMenuItem>
          {isDeletedView && canPermanentDelete ? (
            <>
              <DropdownMenuSeparator />
              {onRestore ? (
                <DropdownMenuItem
                  onClick={(event) => {
                    event.preventDefault();
                    onRestore();
                  }}
                  disabled={isRestoring}
                  className="gap-2 text-emerald-700 focus:text-emerald-800"
                >
                  <ArchiveRestore className="h-4 w-4" />
                  {t('ordersPage.restore')}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={(event) => {
                  event.preventDefault();
                  setHardOpen(true);
                }}
                disabled={isPermanentDeleting}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <ShieldX className="h-4 w-4" />
                {t('ordersPage.deleteForever')}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              {canManage && (
                <DropdownMenuItem asChild>
                  <Link
                    href={`/dashboard/orders/${order.id}/edit`}
                    className="gap-2"
                  >
                    <Edit className="h-4 w-4" />
                    {t('ordersPage.editOrder')}
                  </Link>
                </DropdownMenuItem>
              )}
              {isAdmin && onChangeStatus && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.preventDefault();
                      setStatusPickerOpen(true);
                    }}
                    className="gap-2"
                  >
                    <Wrench className="h-4 w-4" />
                    {t('ordersPage.changeStatusDots')}
                  </DropdownMenuItem>
                </>
              )}
              {canManage && <DropdownMenuSeparator />}
              {canManage && (
                <DropdownMenuItem
                  onClick={(event) => {
                    event.preventDefault();
                    setSoftOpen(true);
                  }}
                  disabled={isDeleting}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('ordersPage.deleteOrder')}
                </DropdownMenuItem>
              )}
              {/* "Delete forever" lives in the trash view only (trash-first). */}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <StatusPickerDialog
        open={statusPickerOpen}
        onOpenChange={setStatusPickerOpen}
        title={t('ordersPage.statusPickerTitle', { code: order.orderCode })}
        currentStatus={order.status}
        onConfirm={(status) => {
          if (onChangeStatus) onChangeStatus(order.id, status);
          setStatusPickerOpen(false);
        }}
      />

      <ConfirmDeleteDialog
        open={softOpen}
        onOpenChange={setSoftOpen}
        title={t('ordersPage.deleteOrderTitle')}
        description={t('ordersPage.deleteOrderBody', { code: order.orderCode })}
        confirmLabel={t('ordersPage.deleteOrderConfirm')}
        disabled={isDeleting}
        onConfirm={() => {
          onDelete();
          setSoftOpen(false);
        }}
      />

      <PermanentDeleteDialog
        open={hardOpen}
        onOpenChange={setHardOpen}
        title={t('ordersPage.hardDeleteTitle')}
        description={t('ordersPage.hardDeleteBody', { code: order.orderCode })}
        confirmLabel={t('ordersPage.deleteForever')}
        pending={isPermanentDeleting}
        onConfirm={() => {
          onPermanentDelete();
          setHardOpen(false);
        }}
      />
    </>
  );
}

function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  disabled,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useT();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </span>
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('ordersPage.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={disabled}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Mobile card ─────────────────────────────────────────────────────

function OrderMobileCard({
  order,
  isAdmin,
  canManage,
  canPermanentDelete,
  isDeletedView,
  isDeleting,
  isPermanentDeleting,
  isRestoring,
  onPrefetch,
  onDelete,
  onPermanentDelete,
  onRestore,
  onChangeStatus,
}: {
  order: DentalOrder;
  isAdmin: boolean;
  canManage: boolean;
  canPermanentDelete: boolean;
  isDeletedView?: boolean;
  isDeleting: boolean;
  isPermanentDeleting: boolean;
  isRestoring?: boolean;
  onPrefetch: () => void;
  onDelete: () => void;
  onPermanentDelete: () => void;
  onRestore?: () => void;
  onChangeStatus?: (id: string, status: OrderStatus) => void;
}) {
  const router = useRouter();
  const { t, lang } = useT();
  return (
    <Card
      role="link"
      tabIndex={0}
      aria-label={t('ordersPage.openOrderAria', { code: order.orderCode })}
      onMouseEnter={onPrefetch}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, [role="menuitem"]')) {
          return;
        }
        handleOrderNavigation(order, router);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleOrderNavigation(order, router);
        }
      }}
      className={cn(
        'cursor-pointer border-border/80 bg-card shadow-sm transition active:scale-[0.99] hover:border-primary/25 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        isDeletedView && 'border-destructive/20 bg-muted/60 text-muted-foreground',
      )}
    >
      <CardContent className="space-y-3.5 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <OrderPatientCell
            patient={order.patient}
            emptyLabel={t('ordersPage.noPatient')}
            emptyContactLabel={t('ordersPage.noContact')}
            className="min-w-0 flex-1"
          />
          {isDeletedView ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('ordersPage.deletedPill')}
            </span>
          ) : null}
          <OrderRowActions
            order={order}
            canManage={canManage}
            canPermanentDelete={canPermanentDelete}
            isAdmin={isAdmin}
            isDeletedView={isDeletedView}
            isDeleting={isDeleting}
            isPermanentDeleting={isPermanentDeleting}
            isRestoring={isRestoring}
            onDelete={onDelete}
            onPermanentDelete={onPermanentDelete}
            onRestore={onRestore}
            onChangeStatus={onChangeStatus}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <OrderStatusBadge status={order.status} />
          <OrderReviewBadge order={order} isDoctor={!isAdmin} isAdmin={isAdmin} />
          <TreatmentFeeBadge order={order} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MobileMeta
            label={t('ordersPage.mobileStage')}
            value={order.patientStage ?? t('ordersPage.notSet')}
          />
          <MobileMeta
            label={t('ordersPage.mobileArch')}
            value={order.archTreatment ?? t('ordersPage.notSet')}
          />
          {isAdmin && (
            <div className="col-span-2">
              <MobileMeta
                label={t('ordersPage.mobileDentist')}
                value={order.doctor?.fullName ?? t('ordersPage.noDentist')}
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <span className="truncate text-xs text-muted-foreground">
            {format(new Date(order.createdAt), dateFormat(lang), {
              locale: dateLocale(lang),
            })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5"
            onClick={(event) => {
              event.stopPropagation();
              handleOrderNavigation(order, router);
            }}
          >
            <Eye className="size-3.5" />
            {t('ordersPage.viewOrder')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MobileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}

// ── Plan + status badges ────────────────────────────────────────────

/**
 * Treatment-plan notification badge shown alongside the order status.
 * Role-aware wording so the chip is actionable rather than descriptive.
 */
// ── Bulk action bar (admin-only) ─────────────────────────────────────
//
// Floating action region that appears above the table when at least
// one row is selected. Keeps the high-impact admin operations one
// click away without bloating the per-row dropdown menu. The actions
// hit the bulk endpoints once per click — server-side transactions
// keep the whole batch atomic.

function BulkActionBar({
  count,
  pending,
  onCancel,
  onSetStatus,
  onDelete,
}: {
  count: number;
  pending: boolean;
  onCancel: () => void;
  onSetStatus: (status: OrderStatus) => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  return (
    <>
      <Card className="border-primary/40 bg-primary/5 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary">
              <CheckSquare2 className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {t('ordersPage.bulkSelected', { count })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('ordersPage.bulkSubtext')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={pending}
              className="gap-2"
              onClick={() => onSetStatus(OrderStatus.FINISHED)}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {t('ordersPage.bulkMarkFinished')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              className="gap-2"
              onClick={() => setStatusPickerOpen(true)}
            >
              <Wrench className="h-4 w-4" />
              {t('ordersPage.bulkChangeStatus')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              {t('ordersPage.bulkDeleteSelected')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onCancel}
            >
              {t('ordersPage.cancel')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <StatusPickerDialog
        open={statusPickerOpen}
        onOpenChange={setStatusPickerOpen}
        title={t('ordersPage.bulkChangeStatusTitle', { count })}
        onConfirm={(status) => {
          setStatusPickerOpen(false);
          onSetStatus(status);
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t('ordersPage.bulkDeleteTitle', { count })}
        description={t('ordersPage.bulkDeleteBody', { count })}
        confirmLabel={t('ordersPage.bulkDeleteConfirm', { count })}
        disabled={pending}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          onDelete();
        }}
      />
    </>
  );
}

// ── Trash bulk action bar ──────────────────────────────────────────
// Mirrors `BulkActionBar` shape but with trash-mode buttons:
//   • Restore selected     → un-deletes N rows (idempotent on live ones)
//   • Delete forever       → hard-delete + wipe files from disk
// Sits above the deleted-orders table so the admin doesn't have to
// open each row's `⋮` menu to clean up the trash.
function TrashBulkActionBar({
  count,
  pending,
  onCancel,
  onRestore,
  onPermanentDelete,
}: {
  count: number;
  pending: boolean;
  onCancel: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  const { t } = useT();
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [confirmHardOpen, setConfirmHardOpen] = useState(false);
  return (
    <>
      <Card className="border-destructive/25 bg-destructive/5 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10 text-destructive">
              <Trash className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-destructive">
                {t('ordersPage.trashBulkSelected', { count })}
              </p>
              <p className="text-xs text-destructive/80">
                {t('ordersPage.trashBulkSubtext')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={pending}
              className="gap-2"
              onClick={() => setConfirmRestoreOpen(true)}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArchiveRestore className="h-4 w-4" />
              )}
              {t('ordersPage.bulkRestoreSelected')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              className="gap-2"
              onClick={() => setConfirmHardOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              {t('ordersPage.bulkDeleteForever')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onCancel}
            >
              {t('ordersPage.cancel')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={confirmRestoreOpen}
        onOpenChange={setConfirmRestoreOpen}
        title={t('ordersPage.bulkRestoreTitle', { count })}
        description={t('ordersPage.bulkRestoreBody', { count })}
        confirmLabel={t('ordersPage.bulkRestoreConfirm', { count })}
        disabled={pending}
        onConfirm={() => {
          setConfirmRestoreOpen(false);
          onRestore();
        }}
      />

      <PermanentDeleteDialog
        open={confirmHardOpen}
        onOpenChange={setConfirmHardOpen}
        title={t('ordersPage.bulkHardTitle', { count })}
        description={t('ordersPage.bulkHardBody', { count })}
        confirmLabel={t('ordersPage.bulkDeleteForever')}
        pending={pending}
        onConfirm={() => {
          setConfirmHardOpen(false);
          onPermanentDelete();
        }}
      />
    </>
  );
}

// ── Select-all-on-page checkbox ─────────────────────────────────────
// Wraps Radix Checkbox to expose a tri-state "indeterminate" indicator
// the way classic mail-app inboxes do — half-filled when some rows on
// the page are selected, fully filled when all are.

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const { t } = useT();
  return (
    <Checkbox
      checked={checked || (indeterminate ? 'indeterminate' : false)}
      onCheckedChange={onChange}
      aria-label={
        checked ? t('ordersPage.deselectAllAria') : t('ordersPage.selectAllAria')
      }
    />
  );
}

// ── Status picker dialog (single + bulk reuse) ──────────────────────
// A small modal that lets the admin pick any OrderStatus value. Used
// by the single-row "Change status…" action AND the bulk action bar
// so the picker UI is centralised — change the option list once,
// both call sites pick up the change.

function StatusPickerDialog({
  open,
  onOpenChange,
  title,
  currentStatus,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** When set, used to highlight the current value in the dropdown. */
  currentStatus?: OrderStatus;
  onConfirm: (status: OrderStatus) => void;
}) {
  const { t } = useT();
  const [picked, setPicked] = useState<OrderStatus | undefined>(currentStatus);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
              <Wrench className="h-4 w-4" />
            </span>
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('ordersPage.statusPickerBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('ordersPage.targetStatus')}
          </Label>
          <Select
            value={picked}
            onValueChange={(value) => setPicked(value as OrderStatus)}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder={t('ordersPage.selectStatus')} />
            </SelectTrigger>
            <SelectContent>
              {Object.values(OrderStatus)
                .filter((value) => !LEGACY_STATUSES.has(value))
                .map((value) => (
                  <SelectItem key={value} value={value}>
                    {localisedStatusLabel(value, t)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('ordersPage.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!picked || picked === currentStatus}
            onClick={() => {
              if (picked) onConfirm(picked);
            }}
          >
            {t('ordersPage.applyStatus')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Page-state placeholders ─────────────────────────────────────────

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

function OrdersLoading() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Pagination footer with page-size selector ───────────────────────

function OrdersPagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: PageSize;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 pr-24 sm:flex-row sm:items-center sm:justify-between sm:p-4 sm:pr-28">
      <div className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
        <span>
          {t('ordersPage.pagSummaryWithPage', { total, page, totalPages })}
        </span>
        <Separator orientation="vertical" className="hidden h-4 sm:block" />
        <div className="flex items-center gap-2">
          <Label htmlFor="orders-page-size" className="text-xs">
            {t('ordersPage.pagRowsPerPage')}
          </Label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)}
          >
            <SelectTrigger id="orders-page-size" className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button
          variant="outline"
          size="sm"
          className="min-h-10"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t('ordersPage.pagPrevious')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-10"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          {t('ordersPage.pagNext')}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
