'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedCallback } from 'use-debounce';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit,
  Filter,
  Loader2,
  Mail,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
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
import { PatientDetailSheet } from '@/components/patients/patient-detail-sheet';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  useBulkDeletePatients,
  useCreatePatient,
  useDeletePatient,
  usePatientPrefetch,
  usePatients,
  useUpdatePatient,
} from '@/lib/hooks';
import { usersService } from '@/lib/api';
import {
  Gender,
  type Patient,
  type PatientFilterParams,
  type PatientSortField,
  type SortOrder,
  UserRole,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const SORT_OPTIONS: Array<{
  key: string;
  label: string;
  field: PatientSortField;
  order: SortOrder;
}> = [
  { key: 'created-desc', label: 'Newest first', field: 'createdAt', order: 'desc' },
  { key: 'created-asc', label: 'Oldest first', field: 'createdAt', order: 'asc' },
  { key: 'name-asc', label: 'Name (A–Z)', field: 'fullName', order: 'asc' },
  { key: 'name-desc', label: 'Name (Z–A)', field: 'fullName', order: 'desc' },
  { key: 'updated-desc', label: 'Recently updated', field: 'updatedAt', order: 'desc' },
];

export default function PatientsPage() {
  const { isAdmin, isDentist, user } = useAuth();
  const prefetchPatient = usePatientPrefetch();

  // ── Query state ─────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [search, setSearch] = useState('');
  const [searchInputKey, setSearchInputKey] = useState(0);
  const [doctorFilter, setDoctorFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sortKey, setSortKey] = useState<string>('created-desc');
  const [showFilters, setShowFilters] = useState(false);

  // ── Selection state ──────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Sheet state ──────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value.trim());
    setPage(1);
  }, 300);

  const params = useMemo<PatientFilterParams>(() => {
    const sortOption =
      SORT_OPTIONS.find((option) => option.key === sortKey) ?? SORT_OPTIONS[0];
    return {
      page,
      limit: pageSize,
      ...(search ? { search } : {}),
      ...(isAdmin && doctorFilter !== 'all' ? { doctorId: doctorFilter } : {}),
      ...(genderFilter !== 'all' ? { gender: genderFilter as Gender } : {}),
      ...(createdFrom ? { createdFrom } : {}),
      ...(createdTo ? { createdTo } : {}),
      sortBy: sortOption.field,
      sortOrder: sortOption.order,
    };
  }, [
    page,
    pageSize,
    search,
    isAdmin,
    doctorFilter,
    genderFilter,
    createdFrom,
    createdTo,
    sortKey,
  ]);

  const patientsQuery = usePatients(params);
  const createPatient = useCreatePatient();
  const updatePatient = useUpdatePatient();
  const removePatient = useDeletePatient();
  const bulkDelete = useBulkDeletePatients();

  const dentistsQuery = useQuery({
    queryKey: ['patient-dentists-filter'],
    queryFn: () =>
      usersService.getAllUsers({
        role: UserRole.DENTIST,
        page: 1,
        limit: 200,
      }),
    enabled: isAdmin,
    staleTime: 1000 * 60 * 5,
  });

  const patients = patientsQuery.data?.data ?? [];
  const total = patientsQuery.data?.total ?? 0;
  const totalPages = patientsQuery.data?.totalPages ?? 1;

  // Clear selection whenever the query params change (page turn, filter, etc.)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [params]);

  // ── Selection helpers ────────────────────────────────────────────
  const allOnPageSelected =
    patients.length > 0 && patients.every((p) => selectedIds.has(p.id));
  const someOnPageSelected =
    !allOnPageSelected && patients.some((p) => selectedIds.has(p.id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        patients.forEach((p) => next.delete(p.id));
      } else {
        patients.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }, [allOnPageSelected, patients]);

  // ── Active filter count ──────────────────────────────────────────
  const activeFilterCount =
    (search ? 1 : 0) +
    (isAdmin && doctorFilter !== 'all' ? 1 : 0) +
    (genderFilter !== 'all' ? 1 : 0) +
    (createdFrom ? 1 : 0) +
    (createdTo ? 1 : 0);

  // ── Handlers ────────────────────────────────────────────────────
  const clearSearch = useCallback(() => {
    setSearch('');
    setSearchInputKey((current) => current + 1);
    setPage(1);
  }, []);

  const clearAllFilters = useCallback(() => {
    clearSearch();
    setDoctorFilter('all');
    setGenderFilter('all');
    setCreatedFrom('');
    setCreatedTo('');
  }, [clearSearch]);

  const openCreate = useCallback(() => {
    setEditingPatient(null);
    setSheetOpen(true);
  }, []);

  const openEdit = useCallback((patient: Patient) => {
    setEditingPatient(patient);
    setSheetOpen(true);
  }, []);

  const handleSubmit = useCallback(
    (payload: ReturnType<typeof import('@/components/patients/patient-detail-sheet').normalizePatientForm>) => {
      if (editingPatient) {
        updatePatient.mutate(
          { id: editingPatient.id, data: payload },
          { onSuccess: () => setSheetOpen(false) },
        );
        return;
      }
      createPatient.mutate(payload, {
        onSuccess: () => setSheetOpen(false),
      });
    },
    [createPatient, editingPatient, updatePatient],
  );

  // Delete from sheet (existing behaviour)
  const handleSheetDelete = useCallback(() => {
    if (!editingPatient) return;
    removePatient.mutate(editingPatient.id, {
      onSuccess: () => setSheetOpen(false),
    });
  }, [editingPatient, removePatient]);

  // Direct row-level delete (from row dropdown, no sheet needed)
  const handleRowDelete = useCallback(
    (patient: Patient) => {
      removePatient.mutate(patient.id, {
        onSuccess: () =>
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(patient.id);
            return next;
          }),
      });
    },
    [removePatient],
  );

  // Bulk delete
  const handleBulkDelete = useCallback(() => {
    bulkDelete.mutate(Array.from(selectedIds), {
      onSuccess: () => setSelectedIds(new Set()),
    });
  }, [bulkDelete, selectedIds]);

  if (!isAdmin && !isDentist) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Card>
          <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <h1 className="text-2xl font-semibold">Patients</h1>
            <p className="text-muted-foreground">
              Your role does not manage patients directly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-5 p-4 lg:p-6">
      {/* ─── Header ───────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-background">
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center lg:p-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" />
              Clinical patient registry
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Patients
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {isAdmin
                ? 'Browse patients across every dentist on the platform, filter by demographics, and manage records.'
                : 'Browse your patient list, capture demographics, and prepare them for new aligner cases.'}
            </p>
          </div>
          <Button size="lg" onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Add Patient
          </Button>
        </div>
      </section>

      {/* ─── Toolbar ──────────────────────────────────────────────── */}
      <Card>
        <CardContent className="grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center sm:p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              key={searchInputKey}
              className="h-10 pl-10"
              placeholder="Search by name, email, or phone…"
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
              onClick={() => patientsQuery.refetch()}
              disabled={patientsQuery.isFetching}
              aria-label="Refresh"
            >
              <RefreshCw
                className={cn(
                  'h-4 w-4',
                  patientsQuery.isFetching && 'animate-spin',
                )}
              />
            </Button>
          </div>

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
                  Gender
                </Label>
                <Select
                  value={genderFilter}
                  onValueChange={(value) => {
                    setGenderFilter(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value={Gender.FEMALE}>Female</SelectItem>
                    <SelectItem value={Gender.MALE}>Male</SelectItem>
                    <SelectItem value={Gender.OTHER}>Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
              <div className="flex items-end sm:col-span-2 lg:col-span-4">
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

      {/* ─── Active filter chips ──────────────────────────────────── */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Active:</span>
          {search && (
            <FilterChip label={`Search: "${search}"`} onRemove={clearSearch} />
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
          {genderFilter !== 'all' && (
            <FilterChip
              label={`Gender: ${genderLabel(genderFilter)}`}
              onRemove={() => setGenderFilter('all')}
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

      {/* ─── Bulk action bar (visible when rows are checked) ─────── */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          isDeleting={bulkDelete.isPending}
          onClear={() => setSelectedIds(new Set())}
          onBulkDelete={handleBulkDelete}
        />
      )}

      {/* ─── Results ──────────────────────────────────────────────── */}
      {patientsQuery.isLoading ? (
        <PatientsLoading />
      ) : patientsQuery.error ? (
        <EmptyState
          icon={<UserRound className="h-10 w-10" />}
          title="Failed to load patients"
          description={patientsQuery.error.message}
          action={
            <Button variant="outline" onClick={() => patientsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : patients.length === 0 ? (
        <EmptyState
          icon={<UserRound className="h-10 w-10" />}
          title="No patients found"
          description={
            activeFilterCount > 0
              ? 'No patients match the current filters. Try widening the search or clearing filters.'
              : 'Add your first patient to start creating orders.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {activeFilterCount > 0 && (
                <Button variant="outline" onClick={clearAllFilters}>
                  Clear filters
                </Button>
              )}
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Add Patient
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {/* Select-all checkbox */}
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={allOnPageSelected}
                      data-state={someOnPageSelected ? 'indeterminate' : undefined}
                      onCheckedChange={toggleAll}
                      aria-label="Select all patients on this page"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Gender</TableHead>
                  {isAdmin && <TableHead>Dentist</TableHead>}
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((patient) => (
                  <PatientRow
                    key={patient.id}
                    patient={patient}
                    isAdmin={isAdmin}
                    checked={selectedIds.has(patient.id)}
                    onToggle={toggleSelect}
                    onOpen={openEdit}
                    onDelete={handleRowDelete}
                    onPrefetch={prefetchPatient}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="grid gap-3 md:hidden">
            {patients.map((patient) => (
              <PatientMobileCard
                key={patient.id}
                patient={patient}
                isAdmin={isAdmin}
                checked={selectedIds.has(patient.id)}
                onToggle={toggleSelect}
                onPrefetch={() => prefetchPatient(patient.id)}
                onOpen={openEdit}
                onDelete={handleRowDelete}
              />
            ))}
          </div>

          <PatientsPagination
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

      {/* ─── Detail sheet (create + edit) ─────────────────────────── */}
      <PatientDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        patient={editingPatient}
        isAdmin={isAdmin}
        currentUserId={user?.id}
        dentists={dentistsQuery.data?.data ?? []}
        isSaving={createPatient.isPending || updatePatient.isPending}
        isDeleting={removePatient.isPending}
        onSubmit={handleSubmit}
        onDelete={editingPatient ? handleSheetDelete : undefined}
      />
    </div>
  );
}

// ── Bulk action bar ─────────────────────────────────────────────────

function BulkActionBar({
  count,
  isDeleting,
  onClear,
  onBulkDelete,
}: {
  count: number;
  isDeleting: boolean;
  onClear: () => void;
  onBulkDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
        <span className="text-sm font-medium">
          {count} patient{count !== 1 ? 's' : ''} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-muted-foreground"
          onClick={onClear}
          disabled={isDeleting}
        >
          <X className="h-3.5 w-3.5" />
          Deselect all
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Delete {count} patient{count !== 1 ? 's' : ''}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </span>
              Delete {count} patient{count !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete {count} patient record{count !== 1 ? 's' : ''}. The
              records will disappear from active lists but existing orders are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onBulkDelete();
                setConfirmOpen(false);
              }}
            >
              Delete {count} patient{count !== 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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

// ── Row + mobile card (memoised so list doesn't re-render on keystrokes) ─

const PatientRow = function PatientRow({
  patient,
  isAdmin,
  checked,
  onToggle,
  onOpen,
  onDelete,
  onPrefetch,
}: {
  patient: Patient;
  isAdmin: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  onOpen: (patient: Patient) => void;
  onDelete: (patient: Patient) => void;
  onPrefetch: (id: string) => void;
}) {
  return (
    <TableRow
      tabIndex={0}
      data-state={checked ? 'selected' : undefined}
      onMouseEnter={() => onPrefetch(patient.id)}
      onFocus={() => onPrefetch(patient.id)}
      onClick={(event) => {
        if (
          (event.target as HTMLElement).closest(
            'button, a, [role="menuitem"], [role="dialog"], [role="checkbox"], input[type="checkbox"]',
          )
        ) {
          return;
        }
        onOpen(patient);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(patient);
        }
      }}
      className="cursor-pointer transition hover:bg-muted/30 focus:bg-muted/50 focus:outline-none data-[state=selected]:bg-primary/5"
    >
      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggle(patient.id)}
          aria-label={`Select ${patient.fullName}`}
        />
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{patient.fullName}</p>
            {patient.dateOfBirth && (
              <p className="text-xs text-muted-foreground">
                DOB {format(new Date(patient.dateOfBirth), 'MMM d, yyyy')}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm">
        {patient.email ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-sm">
        {patient.phone ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-sm">{genderLabel(patient.gender) ?? '—'}</TableCell>
      {isAdmin && (
        <TableCell className="text-sm">{patient.doctor?.fullName ?? '—'}</TableCell>
      )}
      <TableCell className="text-sm text-muted-foreground">
        {format(new Date(patient.createdAt), 'MMM d, yyyy')}
      </TableCell>
      <TableCell className="text-right">
        <PatientRowActions patient={patient} onOpen={onOpen} onDelete={onDelete} />
      </TableCell>
    </TableRow>
  );
};

function PatientRowActions({
  patient,
  onOpen,
  onDelete,
}: {
  patient: Patient;
  onOpen: (patient: Patient) => void;
  onDelete: (patient: Patient) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Actions for ${patient.fullName}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
            {patient.fullName}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onOpen(patient); }}
            className="gap-2"
          >
            <Edit className="h-4 w-4" />
            Open / edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete patient
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Inline confirm dialog for single-row delete */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </span>
              Delete patient?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes{' '}
              <span className="font-semibold">{patient.fullName}</span>.
              The record stays in the database but disappears from active patient
              lists. Existing orders remain visible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onDelete(patient);
                setConfirmOpen(false);
              }}
            >
              Delete patient
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PatientMobileCard({
  patient,
  isAdmin,
  checked,
  onToggle,
  onPrefetch,
  onOpen,
  onDelete,
}: {
  patient: Patient;
  isAdmin: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  onPrefetch: () => void;
  onOpen: (patient: Patient) => void;
  onDelete: (patient: Patient) => void;
}) {
  return (
    <Card
      data-state={checked ? 'selected' : undefined}
      onMouseEnter={onPrefetch}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, [role="menuitem"], input[type="checkbox"]')) {
          return;
        }
        onOpen(patient);
      }}
      className="cursor-pointer transition active:scale-[0.99] data-[state=selected]:ring-2 data-[state=selected]:ring-primary/40"
    >
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={checked}
              onCheckedChange={() => onToggle(patient.id)}
              aria-label={`Select ${patient.fullName}`}
              onClick={(e) => e.stopPropagation()}
              className="mt-1"
            />
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold">{patient.fullName}</h3>
              {isAdmin && (
                <p className="text-sm text-muted-foreground">
                  {patient.doctor?.fullName ?? 'No dentist'}
                </p>
              )}
            </div>
          </div>
          <PatientRowActions patient={patient} onOpen={onOpen} onDelete={onDelete} />
        </div>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {patient.email ?? 'No email'}
          </span>
          <span className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            {patient.phone ?? 'No phone'}
          </span>
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {patient.dateOfBirth
              ? format(new Date(patient.dateOfBirth), 'MMM d, yyyy')
              : 'No birth date'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function genderLabel(gender?: string | null): string | undefined {
  switch (gender) {
    case Gender.MALE:
      return 'Male';
    case Gender.FEMALE:
      return 'Female';
    case Gender.OTHER:
      return 'Other';
    default:
      return undefined;
  }
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

function PatientsLoading() {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PatientsPagination({
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
          {from}–{to} of {total} patients
        </span>
        <Separator orientation="vertical" className="hidden h-4 sm:block" />
        <div className="flex items-center gap-2">
          <Label htmlFor="patients-page-size" className="text-xs">
            Rows per page
          </Label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)}
          >
            <SelectTrigger id="patients-page-size" className="h-8 w-20">
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
