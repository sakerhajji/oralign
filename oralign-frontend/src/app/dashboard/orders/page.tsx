'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CheckCircle2,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Edit,
  Eye,
  FileText,
  Filter,
  Hourglass,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  RefreshCw,
  Search,
  ShieldX,
  Stethoscope,
  Trash2,
  UserRound,
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
import { useQuery } from '@tanstack/react-query';
import {
  OrderStatusBadge,
  orderStatusLabel,
} from '@/components/orders/order-status-badge';
import { usersService } from '@/lib/api';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  useBulkDeleteOrders,
  useBulkUpdateOrderStatus,
  useDeleteOrder,
  useOrderPrefetch,
  useOrders,
  useOverrideOrderStatus,
  usePermanentDeleteOrder,
} from '@/lib/hooks';
import {
  DentalOrder,
  OrderFilterParams,
  OrderSortField,
  OrderStatus,
  SortOrder,
  TreatmentPlanStatus,
  UserRole,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

// Status filter buckets surfaced as tabs above the table. "All" sits
// first so the page reads as "everything → narrow down". Other entries
// map 1:1 onto OrderStatus values; the legacy 4-status set is
// suppressed because the modern lifecycle is what planners think in.
const STATUS_TABS = [
  { key: 'all' as const, label: 'All' },
  { key: OrderStatus.DRAFT, label: 'Draft' },
  { key: OrderStatus.SUBMITTED, label: 'Submitted' },
  { key: OrderStatus.TREATMENT_PLAN_READY, label: 'Treatment ready' },
  { key: OrderStatus.TREATMENT_APPROVED, label: 'Treatment approved' },
  { key: OrderStatus.QUOTATION_SENT, label: 'Quote sent' },
  { key: OrderStatus.PAID, label: 'Paid' },
  { key: OrderStatus.FABRICATION, label: 'Fabrication' },
  { key: OrderStatus.SHIPPED, label: 'Shipped' },
  { key: OrderStatus.FINISHED, label: 'Finished' },
] as const;

const LEGACY_STATUSES = new Set<OrderStatus>([
  OrderStatus.IN_REVIEW,
  OrderStatus.APPROVED,
  OrderStatus.REJECTED,
  OrderStatus.CANCELLED,
]);

// Default sort: newest first. The dropdown lets the planner flip to
// other fields without leaving the page.
const SORT_OPTIONS: Array<{
  key: string;
  label: string;
  field: OrderSortField;
  order: SortOrder;
}> = [
  { key: 'created-desc', label: 'Newest first', field: 'createdAt', order: 'desc' },
  { key: 'created-asc', label: 'Oldest first', field: 'createdAt', order: 'asc' },
  { key: 'updated-desc', label: 'Recently updated', field: 'updatedAt', order: 'desc' },
  { key: 'code-asc', label: 'Order code (A–Z)', field: 'orderCode', order: 'asc' },
  { key: 'code-desc', label: 'Order code (Z–A)', field: 'orderCode', order: 'desc' },
  { key: 'status-asc', label: 'Status (A–Z)', field: 'status', order: 'asc' },
];

export default function OrdersPage() {
  const router = useRouter();
  const { isAdmin, isDentist, user } = useAuth();
  const deleteOrder = useDeleteOrder();
  const permanentDeleteOrder = usePermanentDeleteOrder();
  const overrideStatus = useOverrideOrderStatus();
  const bulkUpdateStatus = useBulkUpdateOrderStatus();
  const bulkDelete = useBulkDeleteOrders();
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

  // ── Multi-select state ────────────────────────────────────────────
  // Keeps the chosen IDs in a Set for O(1) hit-tests during render.
  // Reset implicitly when the page changes (selections are scoped to
  // the currently-visible page — the bulk action bar makes that
  // intent explicit with "N orders selected").
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Dentist filter list — admins can filter orders by owning doctor.
  // Capped at 200 to avoid an unbounded fetch on large clinics.
  const dentistsQuery = useQuery({
    queryKey: ['order-dentists-filter'],
    queryFn: () =>
      usersService.getAllUsers({
        role: UserRole.DENTIST,
        page: 1,
        limit: 200,
      }),
    enabled: isAdmin,
    staleTime: 1000 * 60 * 5,
  });

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
      ...(statusTab !== 'all' ? { status: statusTab as OrderStatus } : {}),
      ...(isAdmin && doctorFilter !== 'all' ? { doctorId: doctorFilter } : {}),
      ...(createdFrom ? { createdFrom } : {}),
      ...(createdTo ? { createdTo } : {}),
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
  ]);

  const ordersQuery = useOrders(params);
  const orders = ordersQuery.data?.data ?? [];
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

  const runSingleStatus = useCallback(
    (id: string, status: OrderStatus) => {
      overrideStatus.mutate({ id, status });
    },
    [overrideStatus],
  );

  const bulkPending =
    bulkUpdateStatus.isPending || bulkDelete.isPending;

  return (
    <div className="@container/main flex flex-1 flex-col gap-5 p-4 lg:p-6">
      {/* ─── Header ───────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-background">
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center lg:p-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ClipboardList className="h-4 w-4" />
              Aligner order operations
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Orders
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {isAdmin
                ? 'Review clinical submissions, dentist ownership, patient records, and uploaded case files from one workspace.'
                : user?.role === UserRole.DESIGNER
                  ? 'Review assigned order cases and attached clinical assets.'
                  : 'Create treatment drafts, attach scan files, and submit aligner cases for production review.'}
            </p>
          </div>
          {canCreate && (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/dashboard/orders/new">
                <Plus className="mr-2 h-4 w-4" />
                New Order
              </Link>
            </Button>
          )}
        </div>
      </section>

      {/* ─── Status tabs ──────────────────────────────────────────────
          Horizontal scrollable strip so the full lifecycle is visible
          on desktop AND swipeable on mobile. Each tab applies the
          backend status filter; "All" clears it. */}
      <div className="overflow-x-auto">
        <div className="flex w-full min-w-max gap-1 rounded-lg border bg-card p-1">
          {STATUS_TABS.map((tab) => {
            const active = statusTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatusTab(tab.key);
                  setPage(1);
                }}
                className={cn(
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Toolbar (search + filter toggle + sort + refresh) ────── */}
      <Card>
        <CardContent className="grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              key={searchInputKey}
              className="h-10 pl-10"
              placeholder="Search order code, patient, or dentist…"
              defaultValue={search}
              onChange={(event) => debouncedSearch(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-2"
              onClick={() => setShowFilters((current) => !current)}
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 rounded-full bg-primary/10 px-1.5 text-primary"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

            <SortMenu sortKey={sortKey} onChange={setSortKey} />

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={() => ordersQuery.refetch()}
              disabled={ordersQuery.isFetching}
              aria-label="Refresh"
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
                    Dentist
                  </Label>
                  <Select
                    value={doctorFilter}
                    onValueChange={(value) => {
                      setDoctorFilter(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="All dentists" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All dentists</SelectItem>
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
                  Created from
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
                  Created to
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
                  Clear filters
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
          <span className="text-muted-foreground">Active:</span>
          {statusTab !== 'all' && (
            <FilterChip
              label={`Status: ${orderStatusLabel[statusTab as OrderStatus] ?? statusTab}`}
              onRemove={() => setStatusTab('all')}
            />
          )}
          {search && (
            <FilterChip
              label={`Search: "${search}"`}
              onRemove={clearSearch}
            />
          )}
          {isAdmin && doctorFilter !== 'all' && (
            <FilterChip
              label={`Dentist: ${
                (dentistsQuery.data?.data ?? []).find((d) => d.id === doctorFilter)
                  ?.fullName ?? 'Unknown'
              }`}
              onRemove={() => setDoctorFilter('all')}
            />
          )}
          {createdFrom && (
            <FilterChip
              label={`From ${createdFrom}`}
              onRemove={() => setCreatedFrom('')}
            />
          )}
          {createdTo && (
            <FilterChip
              label={`To ${createdTo}`}
              onRemove={() => setCreatedTo('')}
            />
          )}
        </div>
      )}

      {/* ─── Bulk action bar (admin-only) ─────────────────────────────
          Appears whenever the admin has selected at least one row.
          Sticky at the top of the results region so it remains in
          view while the planner scrolls a long table. */}
      {isAdmin && selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          pending={bulkPending}
          onCancel={clearSelection}
          onSetStatus={runBulkStatus}
          onDelete={runBulkDelete}
        />
      )}

      {/* ─── Results ───────────────────────────────────────────────── */}
      {ordersQuery.isLoading ? (
        <OrdersLoading />
      ) : ordersQuery.error ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="Orders could not load"
          description={ordersQuery.error.message}
          action={
            <Button variant="outline" onClick={() => ordersQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="No orders found"
          description={
            activeFilterCount > 0
              ? 'No orders match the current filters. Try widening the search or clearing filters.'
              : 'Create a new order to get started.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {activeFilterCount > 0 && (
                <Button variant="outline" onClick={clearAllFilters}>
                  Clear filters
                </Button>
              )}
              {canCreate && (
                <Button asChild>
                  <Link href="/dashboard/orders/new">
                    <Plus className="mr-2 h-4 w-4" />
                    New Order
                  </Link>
                </Button>
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
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {isAdmin && (
                    <TableHead className="w-10">
                      <SelectAllCheckbox
                        checked={allOnPageSelected}
                        indeterminate={someOnPageSelected}
                        onChange={toggleAllOnPage}
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-[200px]">Order</TableHead>
                  <TableHead>Patient</TableHead>
                  {isAdmin && <TableHead>Dentist</TableHead>}
                  <TableHead>Clinical</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open order ${order.orderCode}`}
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
                      router.push(`/dashboard/orders/${order.id}`);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        router.push(`/dashboard/orders/${order.id}`);
                      }
                    }}
                    data-state={
                      selectedIds.has(order.id) ? 'selected' : undefined
                    }
                    className={cn(
                      'cursor-pointer transition hover:bg-muted/30 focus:bg-muted/50 focus:outline-none',
                      selectedIds.has(order.id) && 'bg-primary/5',
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
                          aria-label={`Select ${order.orderCode}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <ClipboardList className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {order.orderCode}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.files?.length ?? 0} file
                            {(order.files?.length ?? 0) === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PersonLine
                        icon={<UserRound className="h-4 w-4" />}
                        name={order.patient?.fullName ?? 'No patient'}
                        sub={order.patient?.phone ?? order.patient?.email}
                      />
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <PersonLine
                          icon={<Stethoscope className="h-4 w-4" />}
                          name={order.doctor?.fullName ?? 'No dentist'}
                          sub={order.doctor?.email}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium">
                          {order.archTreatment ?? 'Arch not set'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.patientStage ?? 'Stage not set'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <OrderStatusBadge status={order.status} />
                        <PlanBadge
                          order={order}
                          isDoctor={isDentist}
                          isAdmin={isAdmin}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(order.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <OrderRowActions
                        order={order}
                        canManage={canManage}
                        canPermanentDelete={isAdmin}
                        isAdmin={isAdmin}
                        isDeleting={deleteOrder.isPending}
                        isPermanentDeleting={permanentDeleteOrder.isPending}
                        onDelete={() => deleteOrder.mutate(order.id)}
                        onPermanentDelete={() =>
                          permanentDeleteOrder.mutate(order.id)
                        }
                        onChangeStatus={runSingleStatus}
                      />
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
                isDeleting={deleteOrder.isPending}
                isPermanentDeleting={permanentDeleteOrder.isPending}
                onPrefetch={() => prefetchOrder(order.id)}
                onDelete={() => deleteOrder.mutate(order.id)}
                onPermanentDelete={() => permanentDeleteOrder.mutate(order.id)}
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
  const active = SORT_OPTIONS.find((option) => option.key === sortKey);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2">
          {active?.order === 'asc' ? (
            <ArrowUp className="h-4 w-4" />
          ) : active?.order === 'desc' ? (
            <ArrowDown className="h-4 w-4" />
          ) : (
            <ArrowUpDown className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{active?.label ?? 'Sort'}</span>
          <span className="sm:hidden">Sort</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Sort by
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
            <span>{option.label}</span>
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

function PersonLine({
  icon,
  name,
  sub,
}: {
  icon: ReactNode;
  name: string;
  sub?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ── Row actions (grouped DropdownMenu + confirm dialogs) ────────────

function OrderRowActions({
  order,
  canManage,
  canPermanentDelete,
  isAdmin,
  isDeleting,
  isPermanentDeleting,
  onDelete,
  onPermanentDelete,
  onChangeStatus,
}: {
  order: DentalOrder;
  canManage: boolean;
  canPermanentDelete: boolean;
  /** Admin-only flag drives the visibility of the inline status menu. */
  isAdmin: boolean;
  isDeleting: boolean;
  isPermanentDeleting: boolean;
  onDelete: () => void;
  onPermanentDelete: () => void;
  onChangeStatus?: (id: string, status: OrderStatus) => void;
}) {
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
            aria-label={`Actions for ${order.orderCode}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
            {order.orderCode}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/orders/${order.id}`} className="gap-2">
              <Eye className="h-4 w-4" />
              View order
            </Link>
          </DropdownMenuItem>
          {canManage && (
            <DropdownMenuItem asChild>
              <Link
                href={`/dashboard/orders/${order.id}/edit`}
                className="gap-2"
              >
                <Edit className="h-4 w-4" />
                Edit order
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
                Change status…
              </DropdownMenuItem>
            </>
          )}
          {(canManage || canPermanentDelete) && <DropdownMenuSeparator />}
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
              Delete order
            </DropdownMenuItem>
          )}
          {canPermanentDelete && (
            <DropdownMenuItem
              onClick={(event) => {
                event.preventDefault();
                setHardOpen(true);
              }}
              disabled={isPermanentDeleting}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <ShieldX className="h-4 w-4" />
              Delete forever
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Single-order status picker dialog — admins only.
          Uses the existing `PUT /orders/:id/status` route under the
          hood (no submitted-at gymnastics needed; the service handles
          the back-and-forth fix-up). */}
      <StatusPickerDialog
        open={statusPickerOpen}
        onOpenChange={setStatusPickerOpen}
        title={`Change status of ${order.orderCode}`}
        currentStatus={order.status}
        onConfirm={(status) => {
          if (onChangeStatus) onChangeStatus(order.id, status);
          setStatusPickerOpen(false);
        }}
      />

      <ConfirmDeleteDialog
        open={softOpen}
        onOpenChange={setSoftOpen}
        title="Delete order?"
        description={`This will hide ${order.orderCode} from active order lists. The order can still be recovered from the database by an admin.`}
        confirmLabel="Delete"
        disabled={isDeleting}
        onConfirm={() => {
          onDelete();
          setSoftOpen(false);
        }}
      />

      <ConfirmDeleteDialog
        open={hardOpen}
        onOpenChange={setHardOpen}
        title="Permanently delete order?"
        description={`This permanently removes ${order.orderCode}, its tooth instructions, file records, and stored files. This cannot be undone.`}
        confirmLabel="Delete forever"
        disabled={isPermanentDeleting}
        destructive
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
          <AlertDialogCancel>Cancel</AlertDialogCancel>
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
  isDeleting,
  isPermanentDeleting,
  onPrefetch,
  onDelete,
  onPermanentDelete,
  onChangeStatus,
}: {
  order: DentalOrder;
  isAdmin: boolean;
  canManage: boolean;
  canPermanentDelete: boolean;
  isDeleting: boolean;
  isPermanentDeleting: boolean;
  onPrefetch: () => void;
  onDelete: () => void;
  onPermanentDelete: () => void;
  onChangeStatus?: (id: string, status: OrderStatus) => void;
}) {
  const router = useRouter();
  return (
    <Card
      onMouseEnter={onPrefetch}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, [role="menuitem"]')) {
          return;
        }
        router.push(`/dashboard/orders/${order.id}`);
      }}
      className="cursor-pointer transition active:scale-[0.99]"
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
              {format(new Date(order.createdAt), 'MMM d, yyyy')}
            </div>
            <h3 className="truncate text-lg font-semibold">{order.orderCode}</h3>
            <p className="truncate text-sm text-muted-foreground">
              {order.patient?.fullName ?? 'No patient selected'}
            </p>
          </div>
          <OrderRowActions
            order={order}
            canManage={canManage}
            canPermanentDelete={canPermanentDelete}
            isAdmin={isAdmin}
            isDeleting={isDeleting}
            isPermanentDeleting={isPermanentDeleting}
            onDelete={onDelete}
            onPermanentDelete={onPermanentDelete}
            onChangeStatus={onChangeStatus}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <OrderStatusBadge status={order.status} />
          <PlanBadge order={order} isDoctor={!isAdmin} isAdmin={isAdmin} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <MobileMeta label="Stage" value={order.patientStage ?? 'Not set'} />
          <MobileMeta label="Arch" value={order.archTreatment ?? 'Not set'} />
          {isAdmin && (
            <div className="col-span-2">
              <MobileMeta
                label="Dentist"
                value={order.doctor?.fullName ?? 'No dentist'}
              />
            </div>
          )}
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
                {count} order{count === 1 ? '' : 's'} selected
              </p>
              <p className="text-xs text-muted-foreground">
                Bulk actions are admin-only — every row in the batch is updated
                inside a single transaction.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick "Mark as Finished" — the most common bulk move
                at the end of the lifecycle. Other statuses are
                reachable through the picker dialog. */}
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
              Mark as Finished
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              className="gap-2"
              onClick={() => setStatusPickerOpen(true)}
            >
              <Wrench className="h-4 w-4" />
              Change status…
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete selected
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>

      <StatusPickerDialog
        open={statusPickerOpen}
        onOpenChange={setStatusPickerOpen}
        title={`Change status of ${count} order${count === 1 ? '' : 's'}`}
        onConfirm={(status) => {
          setStatusPickerOpen(false);
          onSetStatus(status);
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete ${count} order${count === 1 ? '' : 's'}?`}
        description={`This soft-deletes ${count} order${
          count === 1 ? '' : 's'
        }. The records stay in the database but disappear from active order lists. Hard-delete remains per-order from the row menu.`}
        confirmLabel={`Delete ${count} order${count === 1 ? '' : 's'}`}
        disabled={pending}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          onDelete();
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
  return (
    <Checkbox
      checked={checked || (indeterminate ? 'indeterminate' : false)}
      onCheckedChange={onChange}
      aria-label={checked ? 'Deselect all on page' : 'Select all on page'}
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
            Admins can move orders to any lifecycle status. Choose the target
            phase below — related side-tables (treatment plan, quotation) are
            NOT modified.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Target status
          </Label>
          <Select
            value={picked}
            onValueChange={(value) => setPicked(value as OrderStatus)}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(OrderStatus)
                .filter((value) => !LEGACY_STATUSES.has(value))
                .map((value) => (
                  <SelectItem key={value} value={value}>
                    {orderStatusLabel[value] ?? value}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!picked || picked === currentStatus}
            onClick={() => {
              if (picked) onConfirm(picked);
            }}
          >
            Apply status
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PlanBadge({
  order,
  isDoctor,
  isAdmin,
}: {
  order: DentalOrder;
  isDoctor: boolean;
  isAdmin: boolean;
}) {
  const status = order.latestPlanStatus;
  if (!status) return null;

  const audienceIsApprover = isDoctor || isAdmin;
  const map: Record<
    TreatmentPlanStatus,
    { label: string; tone: string; icon: ReactNode } | null
  > = {
    [TreatmentPlanStatus.PENDING]: {
      label: 'Plan being prepared',
      tone: 'border-slate-200 bg-slate-50 text-slate-700',
      icon: <Hourglass className="h-3 w-3" />,
    },
    [TreatmentPlanStatus.READY]: {
      label: audienceIsApprover ? 'Awaiting your review' : 'Awaiting doctor',
      tone: 'border-amber-300 bg-amber-50 text-amber-900',
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    [TreatmentPlanStatus.APPROVED]: {
      label: 'Plan approved',
      tone: 'border-emerald-300 bg-emerald-50 text-emerald-900',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    [TreatmentPlanStatus.REJECTED]: {
      label: 'Replanning requested',
      tone: 'border-red-300 bg-red-50 text-red-900',
      icon: <RefreshCcw className="h-3 w-3" />,
    },
  };
  const entry = map[status];
  if (!entry) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 whitespace-nowrap border px-1.5 py-0 text-[10px] font-medium',
        entry.tone,
      )}
    >
      {entry.icon}
      {entry.label}
    </Badge>
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
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
        <span>
          {from}–{to} of {total} orders
        </span>
        <Separator orientation="vertical" className="hidden h-4 sm:block" />
        <div className="flex items-center gap-2">
          <Label htmlFor="orders-page-size" className="text-xs">
            Rows per page
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
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
