'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ClinicalConditionsField } from '@/components/patients/clinical-conditions-field';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  useCreatePatient,
  useDeletePatient,
  usePatientPrefetch,
  usePatients,
  useUpdatePatient,
} from '@/lib/hooks';
import { usersService } from '@/lib/api';
import { createPatientSchema, CreatePatientFormData } from '@/lib/schemas';
import {
  CLINICAL_CONDITION_OTHER,
  Gender,
  Patient,
  PatientFilterParams,
  PatientSortField,
  SortOrder,
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

function normalizePatientForm(data: CreatePatientFormData) {
  const conditions = (data.clinicalConditions ?? []).filter(Boolean);
  const otherDetail = conditions.includes(CLINICAL_CONDITION_OTHER)
    ? data.clinicalConditionsOther?.trim() || undefined
    : undefined;
  return {
    fullName: data.fullName.trim(),
    email: data.email?.trim() || undefined,
    phone: data.phone?.trim() || undefined,
    gender: data.gender,
    dateOfBirth: data.dateOfBirth || undefined,
    address: data.address?.trim() || undefined,
    notes: data.notes?.trim() || undefined,
    clinicalConditions: conditions.length > 0 ? conditions : undefined,
    clinicalConditionsOther: otherDetail,
    doctorId: data.doctorId || undefined,
  };
}

export default function PatientsPage() {
  const { isAdmin, isDentist, user } = useAuth();
  const prefetchPatient = usePatientPrefetch();

  // Query state — keep all knobs at the page level so the URL-bound
  // version (future) can replace each one with a search param hook.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [search, setSearch] = useState('');
  const [doctorFilter, setDoctorFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sortKey, setSortKey] = useState<string>('created-desc');
  const [showFilters, setShowFilters] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);

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

  const clearAllFilters = () => {
    setSearch('');
    setDoctorFilter('all');
    setGenderFilter('all');
    setCreatedFrom('');
    setCreatedTo('');
    setPage(1);
  };

  const openCreate = () => {
    setEditingPatient(null);
    setFormOpen(true);
  };
  const openEdit = (patient: Patient) => {
    setEditingPatient(patient);
    setFormOpen(true);
  };

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
            <FilterChip label={`Search: "${search}"`} onRemove={() => setSearch('')} />
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
                  <TableRow
                    key={patient.id}
                    tabIndex={0}
                    onMouseEnter={() => prefetchPatient(patient.id)}
                    onFocus={() => prefetchPatient(patient.id)}
                    onClick={(event) => {
                      // Only treat as a row activation if the click landed
                      // on the row chrome, not a button / link / menu item.
                      if (
                        (event.target as HTMLElement).closest(
                          'button, a, [role="menuitem"], [role="dialog"]',
                        )
                      ) {
                        return;
                      }
                      openEdit(patient);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openEdit(patient);
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
                          <p className="truncate font-semibold">
                            {patient.fullName}
                          </p>
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
                      <TableCell className="text-sm">
                        {patient.doctor?.fullName ?? '—'}
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(patient.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <PatientRowActions
                        patient={patient}
                        onEdit={openEdit}
                        onDelete={setDeleteTarget}
                      />
                    </TableCell>
                  </TableRow>
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
                onEdit={openEdit}
                onDelete={setDeleteTarget}
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

      <PatientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        patient={editingPatient}
        isAdmin={isAdmin}
        currentUserId={user?.id}
        dentists={dentistsQuery.data?.data ?? []}
        isSaving={createPatient.isPending || updatePatient.isPending}
        onSubmit={(data) => {
          const payload = normalizePatientForm(data);
          if (editingPatient) {
            updatePatient.mutate(
              { id: editingPatient.id, data: payload },
              { onSuccess: () => setFormOpen(false) },
            );
            return;
          }
          createPatient.mutate(payload, { onSuccess: () => setFormOpen(false) });
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </span>
              Delete patient?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes <span className="font-semibold">{deleteTarget?.fullName}</span>.
              The record stays in the database but disappears from active patient
              lists. Existing orders for this patient stay visible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                removePatient.mutate(deleteTarget.id, {
                  onSuccess: () => setDeleteTarget(null),
                });
              }}
            >
              Delete patient
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

// ── Row actions ─────────────────────────────────────────────────────

function PatientRowActions({
  patient,
  onEdit,
  onDelete,
}: {
  patient: Patient;
  onEdit: (patient: Patient) => void;
  onDelete: (patient: Patient) => void;
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
        <DropdownMenuItem onClick={() => onEdit(patient)} className="gap-2">
          <Edit className="h-4 w-4" />
          Edit patient
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete(patient)}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Delete patient
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Mobile card ─────────────────────────────────────────────────────

function PatientMobileCard({
  patient,
  isAdmin,
  onPrefetch,
  onEdit,
  onDelete,
}: {
  patient: Patient;
  isAdmin: boolean;
  onPrefetch: () => void;
  onEdit: (patient: Patient) => void;
  onDelete: (patient: Patient) => void;
}) {
  return (
    <Card
      onMouseEnter={onPrefetch}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, [role="menuitem"]')) {
          return;
        }
        onEdit(patient);
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
          <PatientRowActions
            patient={patient}
            onEdit={onEdit}
            onDelete={onDelete}
          />
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

// ── Patient form dialog (sectioned for clarity) ─────────────────────

function PatientFormDialog({
  open,
  onOpenChange,
  patient,
  isAdmin,
  currentUserId,
  dentists,
  isSaving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: Patient | null;
  isAdmin: boolean;
  currentUserId?: string;
  dentists: { id: string; fullName: string }[];
  isSaving: boolean;
  onSubmit: (data: CreatePatientFormData) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<CreatePatientFormData>({
    resolver: zodResolver(createPatientSchema),
  });

  const gender = watch('gender');
  const doctorId = watch('doctorId');
  const clinicalConditions = watch('clinicalConditions') ?? [];
  const clinicalConditionsOther = watch('clinicalConditionsOther') ?? '';

  useEffect(() => {
    if (!open) return;
    reset({
      fullName: patient?.fullName ?? '',
      email: patient?.email ?? '',
      phone: patient?.phone ?? '',
      gender: patient?.gender,
      dateOfBirth: patient?.dateOfBirth ? patient.dateOfBirth.slice(0, 10) : '',
      address: patient?.address ?? '',
      notes: patient?.notes ?? '',
      clinicalConditions: patient?.clinicalConditions ?? [],
      clinicalConditionsOther: patient?.clinicalConditionsOther ?? '',
      doctorId: patient?.doctorId ?? (isAdmin ? dentists[0]?.id : currentUserId),
    });
  }, [currentUserId, dentists, isAdmin, open, patient, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[min(96vw,720px)] max-w-none overflow-y-auto sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
              <UserRound className="h-4 w-4" />
            </span>
            {patient ? 'Edit patient' : 'Add patient'}
          </DialogTitle>
          <DialogDescription>
            {patient
              ? 'Update demographics, clinical conditions and dentist assignment.'
              : 'Capture identity + clinical context so the planner has everything needed for the first order.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* ── Identity ─────────────────────────────────────────── */}
          <fieldset className="space-y-3 rounded-lg border bg-card p-4">
            <legend className="px-1 text-sm font-semibold">Identity</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="fullName">
                  Patient name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fullName"
                  {...register('fullName')}
                  placeholder="Full legal name"
                  className="mt-1.5"
                />
                {errors.fullName && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.fullName.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="dateOfBirth">Date of birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  {...register('dateOfBirth')}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Gender</Label>
                <Select
                  value={gender}
                  onValueChange={(value) => setValue('gender', value as Gender)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={Gender.FEMALE}>Female</SelectItem>
                    <SelectItem value={Gender.MALE}>Male</SelectItem>
                    <SelectItem value={Gender.OTHER}>Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && (
                <div className="sm:col-span-2">
                  <Label>
                    Assigned dentist <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={doctorId}
                    onValueChange={(value) => setValue('doctorId', value)}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select dentist" />
                    </SelectTrigger>
                    <SelectContent>
                      {dentists.map((doctor) => (
                        <SelectItem key={doctor.id} value={doctor.id}>
                          {doctor.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </fieldset>

          {/* ── Contact ──────────────────────────────────────────── */}
          <fieldset className="space-y-3 rounded-lg border bg-card p-4">
            <legend className="px-1 text-sm font-semibold">Contact</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  placeholder="patient@example.com"
                  className="mt-1.5"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="+21612345678"
                  {...register('phone')}
                  className="mt-1.5"
                />
                {errors.phone && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.phone.message}
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  {...register('address')}
                  placeholder="Street, city, postal code"
                  className="mt-1.5"
                />
              </div>
            </div>
          </fieldset>

          {/* ── Notes ────────────────────────────────────────────── */}
          <fieldset className="space-y-3 rounded-lg border bg-card p-4">
            <legend className="px-1 text-sm font-semibold">Notes</legend>
            <textarea
              id="notes"
              {...register('notes')}
              placeholder="Allergies, relevant medical history, anything the planner should know…"
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </fieldset>

          {/* ── Clinical conditions / reason for consultation ────── */}
          <ClinicalConditionsField
            conditions={clinicalConditions}
            otherDetail={clinicalConditionsOther}
            idPrefix="patient-dialog"
            onConditionsChange={(next) =>
              setValue('clinicalConditions', next, { shouldDirty: true })
            }
            onOtherDetailChange={(next) =>
              setValue('clinicalConditionsOther', next, { shouldDirty: true })
            }
            otherDetailError={errors.clinicalConditionsOther?.message}
          />

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : patient ? 'Save changes' : 'Create patient'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {description}
          </p>
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
