'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCardIcon,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Stethoscope,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAllPayments, useMyPayments } from '@/lib/hooks';
import { useAuth } from '@/lib/providers/auth-provider';
import { usersService } from '@/lib/api';
import {
  PaymentMethod,
  PaymentRecordStatus,
  PaymentSortBy,
  PaymentSortOrder,
  UserRole,
  type PaymentFilterDto,
} from '@/lib/types';
import {
  PaymentHistoryTable,
  type PaymentRow,
} from '@/components/payments/payment-history-table';

// ─── Filter primitives ────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const STATUS_LABEL: Record<PaymentRecordStatus, string> = {
  [PaymentRecordStatus.SUCCESS]: 'Success',
  [PaymentRecordStatus.AWAITING_CONFIRMATION]: 'Awaiting confirmation',
  [PaymentRecordStatus.PENDING]: 'Pending',
  [PaymentRecordStatus.REJECTED]: 'Rejected',
  [PaymentRecordStatus.FAILED]: 'Failed',
  [PaymentRecordStatus.CANCELLED]: 'Cancelled',
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.CARD]: 'Card',
  [PaymentMethod.BANK_TRANSFER]: 'Bank transfer',
  [PaymentMethod.CASH]: 'Cash',
};

const ALL_STATUSES = Object.values(PaymentRecordStatus);
const ALL_METHODS = Object.values(PaymentMethod);

const SORT_OPTIONS: Array<{
  key: string;
  label: string;
  sortBy: PaymentSortBy;
  sortOrder: PaymentSortOrder;
}> = [
  {
    key: 'date-desc',
    label: 'Newest first',
    sortBy: PaymentSortBy.CREATED_AT,
    sortOrder: PaymentSortOrder.DESC,
  },
  {
    key: 'date-asc',
    label: 'Oldest first',
    sortBy: PaymentSortBy.CREATED_AT,
    sortOrder: PaymentSortOrder.ASC,
  },
  {
    key: 'paid-desc',
    label: 'Recently paid',
    sortBy: PaymentSortBy.PAID_AT,
    sortOrder: PaymentSortOrder.DESC,
  },
  {
    key: 'amount-desc',
    label: 'Highest amount',
    sortBy: PaymentSortBy.AMOUNT,
    sortOrder: PaymentSortOrder.DESC,
  },
  {
    key: 'amount-asc',
    label: 'Lowest amount',
    sortBy: PaymentSortBy.AMOUNT,
    sortOrder: PaymentSortOrder.ASC,
  },
  {
    key: 'status-asc',
    label: 'Status (A→Z)',
    sortBy: PaymentSortBy.STATUS,
    sortOrder: PaymentSortOrder.ASC,
  },
];

// ─────────────────────────────────────────────────────────────────────
// Page

export function PaymentHistoryContent() {
  const { isAdmin } = useAuth();

  // ── Filter state ─────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [search, setSearch] = useState('');
  const [searchInputKey, setSearchInputKey] = useState(0);
  const [selectedStatuses, setSelectedStatuses] = useState<PaymentRecordStatus[]>(
    [],
  );
  const [selectedMethods, setSelectedMethods] = useState<PaymentMethod[]>([]);
  const [doctorId, setDoctorId] = useState<string>('all');
  // Cached display name for the currently-picked doctor — so the
  // active-filter chip and the picker trigger keep showing "Dr. X"
  // even when the search box is cleared and the list of results
  // changes underneath us.
  const [doctorName, setDoctorName] = useState<string>('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sortKey, setSortKey] = useState<string>('date-desc');
  const [showFilters, setShowFilters] = useState(false);

  // ── Derived params for the wire ──────────────────────────────────
  //
  // Backward-compat note: the backend uses ValidationPipe with
  // `forbidNonWhitelisted: true`, which rejects any property the
  // running DTO doesn't recognise with a 400. The new filter +
  // sort fields ship with the matching DTO update, but a running
  // container may still be the OLD build — so we OMIT new fields
  // when they're at their defaults. The first paint of the page
  // sends ONLY `page` + `limit`, which every prior backend build
  // accepts. New fields only land on the wire when the user
  // actually picks them — at which point the backend must be the
  // new build anyway for the filter to have any effect.
  const params = useMemo<PaymentFilterDto>(() => {
    const sort = SORT_OPTIONS.find((s) => s.key === sortKey) ?? SORT_OPTIONS[0];
    const isDefaultSort =
      sort.sortBy === PaymentSortBy.CREATED_AT &&
      sort.sortOrder === PaymentSortOrder.DESC;
    return {
      page,
      limit: pageSize,
      ...(search ? { search } : {}),
      ...(selectedStatuses.length > 0 ? { statuses: selectedStatuses } : {}),
      ...(selectedMethods.length > 0 ? { methods: selectedMethods } : {}),
      ...(isAdmin && doctorId !== 'all' ? { doctorId } : {}),
      ...(createdFrom ? { createdFrom } : {}),
      ...(createdTo ? { createdTo } : {}),
      // Only ship sort fields when they diverge from the legacy
      // default ("newest first"). The backend's default orderBy
      // already matches that, so omitting them is a perfect no-op
      // for both old and new builds.
      ...(isDefaultSort
        ? {}
        : { sortBy: sort.sortBy, sortOrder: sort.sortOrder }),
    };
  }, [
    page,
    pageSize,
    search,
    selectedStatuses,
    selectedMethods,
    isAdmin,
    doctorId,
    createdFrom,
    createdTo,
    sortKey,
  ]);

  // ── Queries — react-query rule: both hooks always run, `enabled`
  //    keeps the wrong one dormant so role flip is a pure read ──
  const adminQuery = useAllPayments(params);
  const doctorQuery = useMyPayments(params);
  const listQuery = isAdmin ? adminQuery : doctorQuery;

  // Doctor-picker state (admin-only). Replaces the old "fetch top
  // 200 dentists" Select with a server-side searchable list — scales
  // past the 200 cap. The picker uses its own debounced query so
  // typing in the search box doesn't churn the main payments fetch.
  const [doctorSearch, setDoctorSearch] = useState('');
  const [debouncedDoctorSearch, setDebouncedDoctorSearch] = useState('');
  const setDoctorSearchDebounced = useDebouncedCallback(
    (v: string) => setDebouncedDoctorSearch(v.trim()),
    250,
  );
  const dentistsQuery = useQuery({
    queryKey: [
      'payment-history-dentists-picker',
      debouncedDoctorSearch,
    ],
    queryFn: () =>
      usersService.getAllUsers({
        role: UserRole.DENTIST,
        page: 1,
        limit: 25,
        ...(debouncedDoctorSearch ? { search: debouncedDoctorSearch } : {}),
      }),
    enabled: isAdmin,
    // Cache by query key — flipping search returns instantly when
    // the user re-types a query they ran a few seconds ago.
    staleTime: 1000 * 60 * 2,
    placeholderData: (prev) => prev,
  });

  const items = (listQuery.data?.data ?? []) as PaymentRow[];
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;
  const activeSort = SORT_OPTIONS.find((s) => s.key === sortKey);

  // ── Handlers ─────────────────────────────────────────────────────
  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value.trim());
    setPage(1);
  }, 300);

  const clearSearch = useCallback(() => {
    setSearch('');
    setSearchInputKey((k) => k + 1);
    setPage(1);
  }, []);

  const toggleStatus = useCallback((status: PaymentRecordStatus) => {
    setPage(1);
    setSelectedStatuses((cur) =>
      cur.includes(status) ? cur.filter((s) => s !== status) : [...cur, status],
    );
  }, []);

  const toggleMethod = useCallback((method: PaymentMethod) => {
    setPage(1);
    setSelectedMethods((cur) =>
      cur.includes(method) ? cur.filter((m) => m !== method) : [...cur, method],
    );
  }, []);

  const clearAllFilters = useCallback(() => {
    clearSearch();
    setSelectedStatuses([]);
    setSelectedMethods([]);
    setDoctorId('all');
    setDoctorName('');
    setDoctorSearch('');
    setDebouncedDoctorSearch('');
    setCreatedFrom('');
    setCreatedTo('');
    setPage(1);
  }, [clearSearch, setDebouncedDoctorSearch]);

  // ── Active filter count drives the badge ────────────────────────
  const activeFilterCount =
    (search ? 1 : 0) +
    (selectedStatuses.length > 0 ? 1 : 0) +
    (selectedMethods.length > 0 ? 1 : 0) +
    (isAdmin && doctorId !== 'all' ? 1 : 0) +
    (createdFrom ? 1 : 0) +
    (createdTo ? 1 : 0);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-3 sm:gap-5 sm:p-4 md:p-6">
      {/* ─── Header ───────────────────────────────────────────────── */}
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <CreditCardIcon className="size-6 text-primary" />
          Payment history
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {isAdmin
            ? 'Every payment recorded by the platform — card, bank transfer and cash combined. Search, filter, and sort to find any record across the full history.'
            : 'Every payment recorded against your orders, newest first. Search by order code or amount, filter by method or status.'}
        </p>
      </header>

      {/* ─── Toolbar (search + filters toggle + sort + refresh) ─── */}
      <Card>
        <CardContent className="grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              key={searchInputKey}
              className="h-10 pl-10"
              placeholder={
                isAdmin
                  ? 'Search order code, doctor, patient, or transaction…'
                  : 'Search order code or transaction…'
              }
              defaultValue={search}
              onChange={(e) => debouncedSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-2"
              onClick={() => setShowFilters((c) => !c)}
            >
              <Filter className="size-4" />
              Filters
              {activeFilterCount > 0 ? (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 rounded-full bg-primary/10 px-1.5 text-primary"
                >
                  {activeFilterCount}
                </Badge>
              ) : null}
            </Button>

            <SortMenu sortKey={sortKey} onChange={setSortKey} />

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={() => listQuery.refetch()}
              disabled={listQuery.isFetching}
              aria-label="Refresh"
            >
              <RefreshCw
                className={cn(
                  'size-4',
                  listQuery.isFetching && 'animate-spin',
                )}
              />
            </Button>
          </div>

          {showFilters ? (
            <div className="col-span-full grid gap-4 border-t pt-3">
              {/* Date + (admin only) doctor + clear */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    From date
                  </Label>
                  <Input
                    type="date"
                    value={createdFrom}
                    onChange={(e) => {
                      setCreatedFrom(e.target.value);
                      setPage(1);
                    }}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    To date
                  </Label>
                  <Input
                    type="date"
                    value={createdTo}
                    onChange={(e) => {
                      setCreatedTo(e.target.value);
                      setPage(1);
                    }}
                    className="h-10"
                  />
                </div>
                {isAdmin ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Doctor
                    </Label>
                    <DoctorSearchPicker
                      selectedId={doctorId}
                      selectedName={doctorName}
                      onPick={(id, name) => {
                        setDoctorId(id);
                        setDoctorName(name);
                        setPage(1);
                      }}
                      onClear={() => {
                        setDoctorId('all');
                        setDoctorName('');
                        setDoctorSearch('');
                        setDebouncedDoctorSearch('');
                        setPage(1);
                      }}
                      searchValue={doctorSearch}
                      onSearchChange={(v) => {
                        setDoctorSearch(v);
                        setDoctorSearchDebounced(v);
                      }}
                      results={dentistsQuery.data?.data ?? []}
                      isFetching={dentistsQuery.isFetching}
                    />
                  </div>
                ) : null}
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 gap-2"
                    onClick={clearAllFilters}
                    disabled={activeFilterCount === 0}
                  >
                    <X className="size-4" />
                    Clear filters
                  </Button>
                </div>
              </div>

              {/* Method chips — every PaymentMethod toggleable. Three
                  values so a single row works on every viewport. */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Methods ({selectedMethods.length} selected)
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_METHODS.map((m) => {
                    const checked = selectedMethods.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMethod(m)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
                          checked
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-input bg-background text-foreground hover:bg-accent',
                        )}
                      >
                        {checked ? <CheckCircle2 className="size-3" /> : null}
                        {METHOD_LABEL[m]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status chips — multi-select; six values fit in 2 rows. */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status ({selectedStatuses.length} selected)
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_STATUSES.map((s) => {
                    const checked = selectedStatuses.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleStatus(s)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
                          checked
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-input bg-background text-foreground hover:bg-accent',
                        )}
                      >
                        {checked ? <CheckCircle2 className="size-3" /> : null}
                        {STATUS_LABEL[s]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ─── Active filter chips ──────────────────────────────────── */}
      {activeFilterCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Active:</span>
          {search ? (
            <FilterChip
              label={`Search: "${search}"`}
              onRemove={clearSearch}
            />
          ) : null}
          {selectedMethods.length > 0 ? (
            <FilterChip
              label={`${selectedMethods.length} method${selectedMethods.length === 1 ? '' : 's'}`}
              onRemove={() => setSelectedMethods([])}
            />
          ) : null}
          {selectedStatuses.length > 0 ? (
            <FilterChip
              label={`${selectedStatuses.length} status${selectedStatuses.length === 1 ? '' : 'es'}`}
              onRemove={() => setSelectedStatuses([])}
            />
          ) : null}
          {isAdmin && doctorId !== 'all' ? (
            <FilterChip
              label={`Doctor: ${doctorName || 'Selected'}`}
              onRemove={() => {
                setDoctorId('all');
                setDoctorName('');
                setDoctorSearch('');
                setDebouncedDoctorSearch('');
              }}
            />
          ) : null}
          {createdFrom ? (
            <FilterChip
              label={`From ${createdFrom}`}
              onRemove={() => setCreatedFrom('')}
            />
          ) : null}
          {createdTo ? (
            <FilterChip
              label={`To ${createdTo}`}
              onRemove={() => setCreatedTo('')}
            />
          ) : null}
        </div>
      ) : null}

      {/* ─── Results ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle>
              {isAdmin ? 'All payments' : 'My payments'}
            </CardTitle>
            <CardDescription>
              {listQuery.isLoading
                ? 'Loading…'
                : `${total.toLocaleString()} entr${total === 1 ? 'y' : 'ies'}`}
            </CardDescription>
          </div>
          {activeSort ? (
            <span className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Sorted: {activeSort.label}
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.error ? (
            <PaymentsErrorState
              error={listQuery.error}
              onRetry={() => listQuery.refetch()}
            />
          ) : (
            <PaymentHistoryTable
              payments={items}
              isLoading={listQuery.isLoading}
              showActor={isAdmin}
              emptyMessage={
                activeFilterCount > 0
                  ? 'No payments match these filters.'
                  : isAdmin
                    ? 'No payments recorded yet.'
                    : 'You have not made any payments yet.'
              }
            />
          )}
        </CardContent>
      </Card>

      {/* ─── Pagination footer ────────────────────────────────────── */}
      {!listQuery.isLoading && total > 0 ? (
        <PaymentsPagination
          page={listQuery.data?.page ?? page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components

function SortMenu({
  sortKey,
  onChange,
}: {
  sortKey: string;
  onChange: (next: string) => void;
}) {
  const active = SORT_OPTIONS.find((o) => o.key === sortKey);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2">
          {active?.sortOrder === PaymentSortOrder.ASC ? (
            <ArrowUp className="size-4" />
          ) : active?.sortOrder === PaymentSortOrder.DESC ? (
            <ArrowDown className="size-4" />
          ) : (
            <ArrowUpDown className="size-4" />
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
            {option.key === sortKey ? (
              <CheckCircle2 className="size-3.5" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Error state with smart hints. A 400 from the backend on this page
 * almost always means the running container is the OLD build and
 * doesn't recognise one of our new filter fields. We detect that
 * pattern and surface a precise next step instead of the generic
 * "Try again".
 */
function PaymentsErrorState({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const message = error.message ?? '';
  // Axios surfaces validation rejections as "Request failed with
  // status code 400" — if we see that exact shape we can confidently
  // point at backend version mismatch as the most likely cause.
  const looksLikeStaleBackend =
    message.includes('400') || /should not exist|must be/i.test(message);
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center text-sm">
      <p className="font-medium text-destructive">Could not load payments.</p>
      <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      {looksLikeStaleBackend ? (
        <div className="max-w-md rounded-md border border-amber-300 bg-amber-50 p-3 text-left text-xs text-amber-900">
          <p className="font-semibold">Backend may need a rebuild.</p>
          <p className="mt-1">
            A 400 here typically means the running backend container is
            an older build that doesn&apos;t recognise the new filter
            fields. Rebuild and restart it:
          </p>
          <pre className="mt-2 rounded bg-white/60 px-2 py-1 font-mono text-[11px]">
            cd oralign-backend{'\n'}
            docker compose up -d --build backend{'\n'}
            # OR if running dev locally:{'\n'}
            npx prisma migrate deploy{'\n'}
            npm run start:dev
          </pre>
        </div>
      ) : null}
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
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
      <X className="size-3" />
    </button>
  );
}

function PaymentsPagination({
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
          {from.toLocaleString()}–{to.toLocaleString()} of{' '}
          {total.toLocaleString()} payments
        </span>
        <Separator orientation="vertical" className="hidden h-4 sm:block" />
        <div className="flex items-center gap-2">
          <Label htmlFor="payments-page-size" className="text-xs">
            Rows per page
          </Label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) =>
              onPageSizeChange(Number(value) as PageSize)
            }
          >
            <SelectTrigger id="payments-page-size" className="h-8 w-20">
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
          <ChevronLeft className="mr-1 size-4" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages.toLocaleString()}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Next
          <ChevronRight className="ml-1 size-4" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Doctor search picker
//
// Replaces a flat <Select> over the top-200 dentists with a real
// server-side search. The parent owns:
//   • The committed doctorId / doctorName (the picked value)
//   • The search input value (controlled — debounce lives in parent
//     so the hot keystroke doesn't churn the React-Query key on
//     every paint)
//   • The results array + isFetching flag from the parent's query
//
// This component is purely visual + keyboard-navigation glue, which
// keeps it framework-agnostic and easy to repurpose on other pages
// (orders, patients) later.

type DentistOption = { id: string; fullName: string; email?: string | null };

function DoctorSearchPicker({
  selectedId,
  selectedName,
  onPick,
  onClear,
  searchValue,
  onSearchChange,
  results,
  isFetching,
}: {
  selectedId: string;
  selectedName: string;
  onPick: (id: string, name: string) => void;
  onClear: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  results: DentistOption[];
  isFetching: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click-outside. We attach to mousedown so it fires
  // before any click handler on the panel can navigate.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const hasSelection = selectedId !== 'all' && !!selectedName;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger row — shows the chosen doctor as a badge OR the
          search input itself. Clicking the badge clears it; the
          input gets keyboard focus when open. */}
      {hasSelection && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm transition hover:bg-accent"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Stethoscope className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{selectedName}</span>
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onClear();
              }
            }}
            className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear doctor filter"
          >
            <X className="size-3.5" />
          </span>
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(e) => {
              onSearchChange(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search doctor name…"
            className="h-10 pl-10 pr-9"
          />
          {isFetching ? (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : searchValue ? (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                if (selectedId !== 'all') onClear();
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      )}

      {/* Floating result list. Mounted only while `open` so the
          dropdown doesn't pile up duplicate listeners across re-
          renders. Falls back to a friendly "no matches" copy when
          the search returns an empty page. */}
      {open && !hasSelection ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border bg-popover p-1 shadow-lg">
          {isFetching && results.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {searchValue
                ? `No doctors match "${searchValue}".`
                : 'No doctors available.'}
            </div>
          ) : (
            <ul className="flex flex-col">
              {results.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(d.id, d.fullName);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <Stethoscope className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{d.fullName}</span>
                      {d.email ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {d.email}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
            Showing top {results.length}. Type to narrow.
          </div>
        </div>
      ) : null}
    </div>
  );
}
