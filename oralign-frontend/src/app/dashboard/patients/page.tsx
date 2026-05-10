'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDebouncedCallback } from 'use-debounce';
import { format } from 'date-fns';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit,
  Mail,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  useCreatePatient,
  useDeletePatient,
  usePatients,
  useUpdatePatient,
} from '@/lib/hooks';
import { usersService } from '@/lib/api';
import { createPatientSchema, CreatePatientFormData } from '@/lib/schemas';
import { Gender, Patient, UserRole } from '@/lib/types';

const PAGE_SIZE = 10;
const ALL_DOCTORS = 'all';

function normalizePatientForm(data: CreatePatientFormData) {
  return {
    fullName: data.fullName.trim(),
    email: data.email?.trim() || undefined,
    phone: data.phone?.trim() || undefined,
    gender: data.gender,
    dateOfBirth: data.dateOfBirth || undefined,
    address: data.address?.trim() || undefined,
    notes: data.notes?.trim() || undefined,
    doctorId: data.doctorId || undefined,
  };
}

export default function PatientsPage() {
  const { isAdmin, isDentist, user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [doctorId, setDoctorId] = useState(ALL_DOCTORS);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [deletePatient, setDeletePatient] = useState<Patient | null>(null);

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(search ? { search } : {}),
      ...(isAdmin && doctorId !== ALL_DOCTORS ? { doctorId } : {}),
    }),
    [doctorId, isAdmin, page, search],
  );

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
        limit: 100,
      }),
    enabled: isAdmin,
    staleTime: 1000 * 60 * 10,
  });

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value.trim());
    setPage(1);
  }, 300);

  const patients = patientsQuery.data?.data ?? [];

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
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Patients</h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? 'Manage patients across all dentists'
              : 'Manage your clinic patients'}
          </p>
        </div>
        <Button onClick={openCreate} className="sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add Patient
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Search by name, email, or phone"
              onChange={(event) => debouncedSearch(event.target.value)}
            />
          </div>
          {isAdmin && (
            <Select
              value={doctorId}
              onValueChange={(value) => {
                setDoctorId(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full md:w-[240px]">
                <SelectValue placeholder="Filter by dentist" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DOCTORS}>All dentists</SelectItem>
                {(dentistsQuery.data?.data ?? []).map((doctor) => (
                  <SelectItem key={doctor.id} value={doctor.id}>
                    {doctor.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {patientsQuery.isLoading ? (
        <PatientsLoading />
      ) : patientsQuery.error ? (
        <Card>
          <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
            <h2 className="text-xl font-semibold text-red-600">
              Failed to load patients
            </h2>
            <p className="text-sm text-muted-foreground">
              {patientsQuery.error.message}
            </p>
            <Button variant="outline" onClick={() => patientsQuery.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : patients.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
            <UserRound className="h-12 w-12 text-muted-foreground" />
            <h2 className="text-xl font-semibold">No patients found</h2>
            <p className="text-sm text-muted-foreground">
              Add a patient or adjust your search filters.
            </p>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Patient
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle>Patients ({patientsQuery.data?.total ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Gender</TableHead>
                    {isAdmin && <TableHead>Dentist</TableHead>}
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patients.map((patient) => (
                    <TableRow key={patient.id}>
                      <TableCell className="font-medium">
                        {patient.fullName}
                      </TableCell>
                      <TableCell>{patient.email ?? '—'}</TableCell>
                      <TableCell>{patient.phone ?? '—'}</TableCell>
                      <TableCell>{patient.gender ?? '—'}</TableCell>
                      {isAdmin && (
                        <TableCell>{patient.doctor?.fullName ?? '—'}</TableCell>
                      )}
                      <TableCell>
                        {format(new Date(patient.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <PatientActions
                          patient={patient}
                          onEdit={openEdit}
                          onDelete={setDeletePatient}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:hidden">
            {patients.map((patient) => (
              <Card key={patient.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold">
                        {patient.fullName}
                      </h3>
                      {isAdmin && (
                        <p className="text-sm text-muted-foreground">
                          {patient.doctor?.fullName ?? 'No dentist'}
                        </p>
                      )}
                    </div>
                    <PatientActions
                      patient={patient}
                      onEdit={openEdit}
                      onDelete={setDeletePatient}
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
            ))}
          </div>

          <PatientsPagination
            page={page}
            total={patientsQuery.data?.total ?? 0}
            totalPages={patientsQuery.data?.totalPages ?? 1}
            onPageChange={setPage}
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
        open={!!deletePatient}
        onOpenChange={(open) => !open && setDeletePatient(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Patient</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft delete {deletePatient?.fullName}. The patient will no
              longer appear in patient lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deletePatient) return;
                removePatient.mutate(deletePatient.id, {
                  onSuccess: () => setDeletePatient(null),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PatientActions({
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
        <Button variant="ghost" size="icon" aria-label="Patient actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(patient)}>
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-red-600"
          onClick={() => onDelete(patient)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

  useEffect(() => {
    if (!open) return;
    reset({
      fullName: patient?.fullName ?? '',
      email: patient?.email ?? '',
      phone: patient?.phone ?? '',
      gender: patient?.gender,
      dateOfBirth: patient?.dateOfBirth
        ? patient.dateOfBirth.slice(0, 10)
        : '',
      address: patient?.address ?? '',
      notes: patient?.notes ?? '',
      doctorId:
        patient?.doctorId ?? (isAdmin ? dentists[0]?.id : currentUserId),
    });
  }, [currentUserId, dentists, isAdmin, open, patient, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {patient ? 'Edit Patient' : 'Add Patient'}
          </DialogTitle>
          <DialogDescription>
            {patient
              ? 'Update patient details'
              : 'Create a new patient record'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fullName">Patient Name *</Label>
              <Input id="fullName" {...register('fullName')} />
              {errors.fullName && (
                <p className="text-sm text-red-500">
                  {errors.fullName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" placeholder="+21612345678" {...register('phone')} />
              {errors.phone && (
                <p className="text-sm text-red-500">{errors.phone.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select
                value={gender}
                onValueChange={(value) => setValue('gender', value as Gender)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Gender.FEMALE}>Female</SelectItem>
                  <SelectItem value={Gender.MALE}>Male</SelectItem>
                  <SelectItem value={Gender.OTHER}>Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
            </div>
            {isAdmin && (
              <div className="space-y-2 sm:col-span-2">
                <Label>Dentist *</Label>
                <Select
                  value={doctorId}
                  onValueChange={(value) => setValue('doctorId', value)}
                >
                  <SelectTrigger>
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
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...register('address')} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                {...register('notes')}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-24 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Patient'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  total,
  totalPages,
  onPageChange,
}: {
  page: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} - {total} patients
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
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
