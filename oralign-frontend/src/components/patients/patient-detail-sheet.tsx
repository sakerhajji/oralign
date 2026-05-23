'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Loader2,
  Mail,
  Phone,
  Stethoscope,
  Trash2,
  UserRound,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ClinicalConditionsField } from '@/components/patients/clinical-conditions-field';
import { createPatientSchema, type CreatePatientFormData } from '@/lib/schemas';
import {
  CLINICAL_CONDITION_OTHER,
  Gender,
  type Patient,
} from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Convert the patient form's surface shape into the API payload shape:
 *
 *   • empty strings → `undefined` (so the backend stores NULL, not "")
 *   • `clinicalConditions` empty array → undefined (PATCH semantics —
 *     "field not sent" means leave alone)
 *   • `clinicalConditionsOther` is only kept when "Other" is checked;
 *     otherwise we strip it so we never persist orphan free-text.
 *
 * Exported so the parent page can stage create + update payloads with
 * the same normalisation rules.
 */
export function normalizePatientForm(data: CreatePatientFormData) {
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

export type PatientDetailMode = 'create' | 'edit';

export interface PatientDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` (or undefined) → create mode; a Patient → edit mode. */
  patient: Patient | null | undefined;
  /** Drives whether the dentist-assignment dropdown is shown. */
  isAdmin: boolean;
  /** Auto-fills the dentist field for dentist-role users in create mode. */
  currentUserId?: string;
  /** Dentist directory for the assignment dropdown (admin). */
  dentists: { id: string; fullName: string }[];
  /** True while the create or update mutation is in flight. */
  isSaving: boolean;
  /** True while the delete mutation is in flight. */
  isDeleting?: boolean;
  /** Save handler — payload is already normalised via `normalizePatientForm`. */
  onSubmit: (data: ReturnType<typeof normalizePatientForm>) => void;
  /** Delete handler. Only invoked in edit mode + only when admin/owner. */
  onDelete?: () => void;
}

/**
 * Right-side slide-out sheet that handles BOTH create and edit. Mirrors
 * the UX of `UserDetailSheet` on the Users page: a header strap with
 * an icon avatar + identity badges, four content tabs (Identity,
 * Contact, Clinical, Notes), and a sticky footer with Save / Delete /
 * Cancel.
 *
 * Why a sheet and not a separate `/dashboard/patients/[id]` route:
 * patient records on Oralign are simple — there's no detail page
 * worth the page transition, and the inline editor lets a planner
 * stay in their filter / sort context while opening a record. Matches
 * the Users page exactly so the two surfaces feel consistent.
 *
 * The form lives inside react-hook-form (same `createPatientSchema`
 * the standalone dialog used) so validation, dirty-state and reset
 * semantics are unchanged from the previous popup.
 */
export function PatientDetailSheet({
  open,
  onOpenChange,
  patient,
  isAdmin,
  currentUserId,
  dentists,
  isSaving,
  isDeleting,
  onSubmit,
  onDelete,
}: PatientDetailSheetProps) {
  const mode: PatientDetailMode = patient ? 'edit' : 'create';

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    setValue,
    watch,
  } = useForm<CreatePatientFormData>({
    resolver: zodResolver(createPatientSchema),
  });

  const gender = watch('gender');
  const doctorId = watch('doctorId');
  const fullName = watch('fullName') ?? '';
  const clinicalConditions = watch('clinicalConditions') ?? [];
  const clinicalConditionsOther = watch('clinicalConditionsOther') ?? '';

  // Reset the form whenever the sheet (re-)opens, or the underlying
  // patient changes (e.g. the planner picks a different row before
  // closing this one — rare but the safety net keeps the form honest).
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

  const initials = useMemo(() => buildInitials(fullName), [fullName]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Don't let the sheet close while a save is in flight — the
        // planner would lose the optimistic feedback otherwise.
        if (!next && (isSaving || isDeleting)) return;
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
      >
        {/* ─── Header strap (avatar + identity badges) ────────────── */}
        <header className="shrink-0 border-b bg-card px-6 py-4">
          <SheetTitle className="sr-only">
            {mode === 'edit' ? 'Edit patient' : 'New patient'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {mode === 'edit'
              ? 'Edit demographics, clinical conditions and dentist assignment for this patient.'
              : 'Capture identity and clinical context for a new patient record.'}
          </SheetDescription>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
              {initials || <UserRound className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold">
                {fullName.trim() ||
                  (mode === 'edit' ? 'Unnamed patient' : 'New patient')}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {patient?.gender && (
                  <Badge variant="secondary" className="text-[10px]">
                    {genderLabel(patient.gender)}
                  </Badge>
                )}
                {patient?.doctor?.fullName && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Stethoscope className="h-3 w-3" />
                    {patient.doctor.fullName}
                  </Badge>
                )}
                {mode === 'create' && (
                  <Badge
                    variant="outline"
                    className="border-amber-400 bg-amber-50 text-[10px] text-amber-800"
                  >
                    Draft — not saved yet
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ─── Tabs ──────────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit((data) => onSubmit(normalizePatientForm(data)))}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <Tabs defaultValue="identity" className="flex flex-1 flex-col">
            <div className="border-b bg-muted/20 px-6">
              <TabsList className="h-12 w-full justify-start gap-1 bg-transparent p-0">
                <TabsTrigger
                  value="identity"
                  className="rounded-none border-b-2 border-transparent px-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Identity
                </TabsTrigger>
                <TabsTrigger
                  value="contact"
                  className="rounded-none border-b-2 border-transparent px-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Contact
                </TabsTrigger>
                <TabsTrigger
                  value="clinical"
                  className="rounded-none border-b-2 border-transparent px-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Clinical
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className="rounded-none border-b-2 border-transparent px-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Notes
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* ─── Identity tab ─────────────────────────────────── */}
              <TabsContent value="identity" className="m-0 space-y-4">
                <FieldGroup
                  label="Patient name"
                  required
                  error={errors.fullName?.message}
                >
                  <Input
                    placeholder="Full legal name"
                    {...register('fullName')}
                  />
                </FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldGroup label="Date of birth">
                    <Input type="date" {...register('dateOfBirth')} />
                  </FieldGroup>
                  <FieldGroup label="Gender">
                    <Select
                      value={gender}
                      onValueChange={(value) =>
                        setValue('gender', value as Gender, { shouldDirty: true })
                      }
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
                  </FieldGroup>
                </div>
                {isAdmin && (
                  <FieldGroup label="Assigned dentist" required>
                    <Select
                      value={doctorId}
                      onValueChange={(value) =>
                        setValue('doctorId', value, { shouldDirty: true })
                      }
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
                  </FieldGroup>
                )}
              </TabsContent>

              {/* ─── Contact tab ─────────────────────────────────── */}
              <TabsContent value="contact" className="m-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldGroup label="Email" error={errors.email?.message}>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="patient@example.com"
                        className="pl-9"
                        {...register('email')}
                      />
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Phone" error={errors.phone?.message}>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="+21612345678"
                        className="pl-9"
                        {...register('phone')}
                      />
                    </div>
                  </FieldGroup>
                </div>
                <FieldGroup label="Address">
                  <Input
                    placeholder="Street, city, postal code"
                    {...register('address')}
                  />
                </FieldGroup>
              </TabsContent>

              {/* ─── Clinical conditions tab ─────────────────────── */}
              <TabsContent value="clinical" className="m-0">
                <ClinicalConditionsField
                  conditions={clinicalConditions}
                  otherDetail={clinicalConditionsOther}
                  idPrefix="patient-sheet"
                  onConditionsChange={(next) =>
                    setValue('clinicalConditions', next, { shouldDirty: true })
                  }
                  onOtherDetailChange={(next) =>
                    setValue('clinicalConditionsOther', next, {
                      shouldDirty: true,
                    })
                  }
                  otherDetailError={errors.clinicalConditionsOther?.message}
                />
              </TabsContent>

              {/* ─── Notes tab ─────────────────────────────────── */}
              <TabsContent value="notes" className="m-0 space-y-4">
                <FieldGroup
                  label="Internal notes"
                  description="Allergies, relevant medical history, anything the planner should know. Visible to the dentist and the planner only."
                >
                  <textarea
                    {...register('notes')}
                    placeholder="Notes…"
                    className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  />
                </FieldGroup>
              </TabsContent>
            </div>

            {/* ─── Sticky footer ───────────────────────────────── */}
            <footer className="flex shrink-0 items-center justify-between gap-2 border-t bg-card px-6 py-3">
              <div>
                {mode === 'edit' && onDelete && (
                  <DeletePatientButton
                    patientName={patient?.fullName ?? 'this patient'}
                    onConfirm={onDelete}
                    disabled={isSaving || !!isDeleting}
                    loading={!!isDeleting}
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSaving || !!isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving || !!isDeleting || (mode === 'edit' && !isDirty)}
                  className="gap-2"
                >
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === 'edit' ? 'Save changes' : 'Create patient'}
                </Button>
              </div>
            </footer>
          </Tabs>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────

function FieldGroup({
  label,
  description,
  required,
  error,
  children,
}: {
  label: string;
  description?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-baseline justify-between gap-2">
        <span>
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </span>
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function DeletePatientButton({
  patientName,
  onConfirm,
  disabled,
  loading,
}: {
  patientName: string;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          'gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive',
        )}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        Delete patient
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </span>
              Delete patient?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes <span className="font-semibold">{patientName}</span>.
              The record stays in the database but disappears from active patient
              lists. Existing orders for this patient remain visible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onConfirm();
                setOpen(false);
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

// ── helpers ─────────────────────────────────────────────────────────

function buildInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

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
