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
import { PatientProfilePhotoField } from '@/components/patients/patient-profile-photo-field';
import { createPatientSchema, type CreatePatientFormData } from '@/lib/schemas';
import {
  CLINICAL_CONDITION_OTHER,
  Gender,
  type Patient,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';

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
  onSubmit: (
    data: ReturnType<typeof normalizePatientForm>,
    profilePhoto: File | null,
  ) => void;
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
  const { t } = useT();
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);

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
    setProfilePhoto(null);
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
            {mode === 'edit'
              ? t('patients.sheet.titleEdit')
              : t('patients.sheet.titleCreate')}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {mode === 'edit'
              ? t('patients.sheet.descEdit')
              : t('patients.sheet.descCreate')}
          </SheetDescription>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
              {initials || <UserRound className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold">
                {fullName.trim() ||
                  (mode === 'edit'
                    ? t('patients.sheet.unnamed')
                    : t('patients.sheet.titleCreate'))}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {patient?.gender && (
                  <Badge variant="secondary" className="text-[10px]">
                    {genderLabel(patient.gender, t)}
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
                    {t('patients.sheet.draftBadge')}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ─── Tabs ──────────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit((data) =>
            onSubmit(normalizePatientForm(data), profilePhoto),
          )}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <Tabs defaultValue="identity" className="flex flex-1 flex-col">
            <div className="border-b bg-muted/20 px-6">
              <TabsList className="h-12 w-full justify-start gap-1 bg-transparent p-0">
                <TabsTrigger
                  value="identity"
                  className="rounded-none border-b-2 border-transparent px-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {t('patients.sheet.tabIdentity')}
                </TabsTrigger>
                <TabsTrigger
                  value="contact"
                  className="rounded-none border-b-2 border-transparent px-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {t('patients.sheet.tabContact')}
                </TabsTrigger>
                <TabsTrigger
                  value="clinical"
                  className="rounded-none border-b-2 border-transparent px-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {t('patients.sheet.tabClinical')}
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className="rounded-none border-b-2 border-transparent px-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {t('patients.sheet.tabNotes')}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* ─── Identity tab ─────────────────────────────────── */}
              <TabsContent value="identity" className="m-0 space-y-4">
                <FieldGroup
                  label={t('patients.sheet.fieldName')}
                  required
                  error={errors.fullName?.message}
                >
                  <Input
                    placeholder={t('patients.sheet.fieldNamePh')}
                    {...register('fullName')}
                  />
                </FieldGroup>
                <PatientProfilePhotoField
                  value={profilePhoto}
                  existingUrl={patient?.profilePhotoUrl}
                  disabled={isSaving}
                  label={t('patients.sheet.profilePhotoLabel')}
                  hint={t('patients.sheet.profilePhotoHint')}
                  uploadLabel={t('patients.sheet.uploadProfilePhoto')}
                  changeLabel={t('patients.sheet.changeProfilePhoto')}
                  editorTitle={t('patients.sheet.profilePhotoEditorTitle')}
                  alt={fullName || t('patients.sheet.unnamed')}
                  onChange={setProfilePhoto}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldGroup label={t('patients.sheet.fieldDob')}>
                    <Input type="date" {...register('dateOfBirth')} />
                  </FieldGroup>
                  <FieldGroup label={t('patients.sheet.fieldGender')}>
                    <Select
                      value={gender}
                      onValueChange={(value) =>
                        setValue('gender', value as Gender, { shouldDirty: true })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('patients.sheet.fieldGenderPh')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={Gender.FEMALE}>{t('patients.genderFemale')}</SelectItem>
                        <SelectItem value={Gender.MALE}>{t('patients.genderMale')}</SelectItem>
                        <SelectItem value={Gender.OTHER}>{t('patients.genderOther')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                </div>
                {isAdmin && (
                  <FieldGroup label={t('patients.sheet.fieldDentist')} required>
                    <Select
                      value={doctorId}
                      onValueChange={(value) =>
                        setValue('doctorId', value, { shouldDirty: true })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('patients.sheet.fieldDentistPh')} />
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
                  <FieldGroup label={t('patients.sheet.fieldEmail')} error={errors.email?.message}>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder={t('patients.sheet.fieldEmailPh')}
                        className="pl-9"
                        {...register('email')}
                      />
                    </div>
                  </FieldGroup>
                  <FieldGroup label={t('patients.sheet.fieldPhone')} error={errors.phone?.message}>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={t('patients.sheet.fieldPhonePh')}
                        className="pl-9"
                        {...register('phone')}
                      />
                    </div>
                  </FieldGroup>
                </div>
                <FieldGroup label={t('patients.sheet.fieldAddress')}>
                  <Input
                    placeholder={t('patients.sheet.fieldAddressPh')}
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
                  label={t('patients.sheet.fieldNotes')}
                  description={t('patients.sheet.fieldNotesDesc')}
                >
                  <textarea
                    {...register('notes')}
                    placeholder={t('patients.sheet.fieldNotesPh')}
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
                    patientName={patient?.fullName ?? t('patients.sheet.deleteThis')}
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
                  {t('patients.sheet.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving || !!isDeleting || (mode === 'edit' && !isDirty)}
                  className="gap-2"
                >
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === 'edit'
                    ? t('patients.sheet.saveChanges')
                    : t('patients.sheet.createPatient')}
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
  const { t } = useT();
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
        {t('patients.sheet.deleteBtn')}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </span>
              {t('patients.sheet.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('patients.sheet.deleteBodyNamed', { name: patientName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('patients.sheet.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              {t('patients.sheet.deleteBtn')}
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

// Takes the translator function so the badge in the header strap and
// the page-level table share one localised source of truth.
type TFn = (path: string, vars?: Record<string, string | number>) => string;
function genderLabel(gender: string | null | undefined, t: TFn): string | undefined {
  switch (gender) {
    case Gender.MALE:
      return t('patients.genderMale');
    case Gender.FEMALE:
      return t('patients.genderFemale');
    case Gender.OTHER:
      return t('patients.genderOther');
    default:
      return undefined;
  }
}
