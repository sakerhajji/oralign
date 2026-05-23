'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedCallback } from 'use-debounce';
import { format } from 'date-fns';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit,
  Filter,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  // All knobs at the page level so a future "share this view" URL
  // hook can replace each one with a `useSearchParams` binding.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [search, setSearch] = useState('');
  // `searchInputKey` is bumped when we wipe the search from outside
  // the Input (chip dismiss, "Clear filters" button) so the uncontrolled
  // Input re-mounts with the new defaultValue. Without it, the displayed
  // text would stay stale even though `search` state is empty.
  const [searchInputKey, setSearchInputKey] = useState(0);
  const [doctorFilter, setDoctorFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sortKey, setSortKey] = useState<string>('created-desc');
  const [showFilters, setShowFilters] = useState(false);

  // Sheet state.
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

  const activeFilterCount =
    (search ? 1 : 0) +
    (isAdmin && doctorFilter !== 'all' ? 1 : 0) +
    (genderFilter !== 'all' ? 1 : 0) +
    (createdFrom ? 1 : 0) +
    (createdTo ? 1 : 0);

  // ── Handlers (memoised so child rows don't re-render on every keystroke) ─
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

  const handleDelete = useCallback(() => {
    if (!editingPatient) return;
    removePatient.mutate(editingPatient.id, {
      onSuccess: () => setSheetOpen(false),
    });
  }, [editingPatient, removePatient]);

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
                    onOpen={openEdit}
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
                onPrefetch={() => prefetchPatient(patient.id)}
                onOpen={openEdit}
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
        onDelete={editingPatient ? handleDelete : undefined}
      />
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

// ── Row + mobile card (memoised so list virtualisation stays cheap) ─

const PatientRow = function PatientRow({
  patient,
  isAdmin,
  onOpen,
  onPrefetch,
}: {
  patient: Patient;
  isAdmin: boolean;
  onOpen: (patient: Patient) => void;
  onPrefetch: (id: string) => void;
}) {
  return (
    <TableRow
      tabIndex={0}
      onMouseEnter={() => onPrefetch(patient.id)}
      onFocus={() => onPrefetch(patient.id)}
      onClick={(event) => {
        if (
          (event.target as HTMLElement).closest(
            'button, a, [role="menuitem"], [role="dialog"]',
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
      className="cursor-pointer transition hover:bg-muted/30 focus:bg-muted/50 focus:outline-none"
    >
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
        <PatientRowActions patient={patient} onOpen={onOpen} />
      </TableCell>
    </TableRow>
  );
};

function PatientRowActions({
  patient,
  onOpen,
}: {
  patient: Patient;
  onOpen: (patient: Patient) => void;
}) {
  return (
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
        <DropdownMenuItem onClick={() => onOpen(patient)} className="gap-2">
          <Edit className="h-4 w-4" />
          Open patient
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PatientMobileCard({
  patient,
  isAdmin,
  onPrefetch,
  onOpen,
}: {
  patient: Patient;
  isAdmin: boolean;
  onPrefetch: () => void;
  onOpen: (patient: Patient) => void;
}) {
  return (
    <Card
      onMouseEnter={onPrefetch}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, [role="menuitem"]')) {
          return;
        }
        onOpen(patient);
      }}
      className="cursor-pointer transition active:scale-[0.99]"
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{patient.fullName}</h3>
            {isAdmin && (
              <p className="text-sm text-muted-foreground">
                {patient.doctor?.fullName ?? 'No dentist'}
              </p>
            )}
          </div>
          <PatientRowActions patient={patient} onOpen={onOpen} />
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
