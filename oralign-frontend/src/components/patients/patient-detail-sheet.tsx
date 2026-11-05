'use client';

import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Controller, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  Loader2,
  Mail,
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
import { PatientPhoneInput } from '@/components/patients/patient-phone-input';
import { PatientProfilePhotoField } from '@/components/patients/patient-profile-photo-field';
import { createPatientSchema, type CreatePatientFormData } from '@/lib/schemas';
import {
  CLINICAL_CONDITION_OTHER,
  Gender,
  type CreatePatientDto,
  type Patient,
  type UpdatePatientDto,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';

/**
 * Convert the patient form's surface shape into the API payload shape.
 *
 * Create: empty strings and an empty condition list are left out, so the
 * backend stores NULL, never "".
 *
 * Edit (PATCH): an emptied field must clear the stored value, so it is
 * sent as `null` (the backend clears on null and keeps omitted fields)
 * and an empty condition list is sent as `[]`. Without this, emptying
 * the phone or the notes saved fine but the old value came back.
 *
 * Either way `clinicalConditionsOther` is only kept while "Other" is
 * checked, so no orphan free text is ever stored.
 */
export function normalizePatientForm(
  data: CreatePatientFormData,
  mode: 'create',
): CreatePatientDto;
export function normalizePatientForm(
  data: CreatePatientFormData,
  mode: 'edit',
): UpdatePatientDto;
export function normalizePatientForm(
  data: CreatePatientFormData,
  mode: PatientDetailMode,
): CreatePatientDto | UpdatePatientDto {
  const conditions = (data.clinicalConditions ?? []).filter(Boolean);
  const text = (value: string | undefined) => value?.trim() || undefined;
  const otherDetail = conditions.includes(CLINICAL_CONDITION_OTHER)
    ? text(data.clinicalConditionsOther)
    : undefined;
  const base = {
    fullName: data.fullName.trim(),
    gender: data.gender,
    dateOfBirth: data.dateOfBirth || undefined,
    doctorId: data.doctorId || undefined,
  };
  if (mode === 'edit') {
    return {
      ...base,
      email: text(data.email) ?? null,
      phone: text(data.phone) ?? null,
      address: text(data.address) ?? null,
      notes: text(data.notes) ?? null,
      clinicalConditions: conditions,
      clinicalConditionsOther: otherDetail ?? null,
    };
  }
  return {
    ...base,
    email: text(data.email),
    phone: text(data.phone),
    address: text(data.address),
    notes: text(data.notes),
    clinicalConditions: conditions.length > 0 ? conditions : undefined,
    clinicalConditionsOther: otherDetail,
  };
}

/** What the sheet hands to its parent on save, tagged by mode. */
export type PatientSubmitPayload =
  | { mode: 'create'; data: CreatePatientDto }
  | { mode: 'edit'; data: UpdatePatientDto };

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
  onSubmit: (payload: PatientSubmitPayload, profilePhoto: File | null) => void;
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
 * The form lives inside react-hook-form (`createPatientSchema`, whose
 * messages are i18n keys). The phone is the flag picker (E.164 out,
 * Tunisia by default). An invalid submit opens the tab holding the
 * first error and focuses that field.
 */
export function PatientDetailSheet(props: PatientDetailSheetProps) {
  const { open, onOpenChange, patient, isSaving, isDeleting } = props;

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
        {/* The content unmounts when the sheet closes, so the body mounts
            once per opening (and per patient): the form seeds from
            `patient` at mount and nothing the parent re-renders — a save
            in flight, a refetched dentist list — can reset what the
            planner typed. A failed save keeps the form as it was. */}
        <PatientSheetBody key={patient?.id ?? 'new'} {...props} />
      </SheetContent>
    </Sheet>
  );
}

type SheetTab = 'identity' | 'contact' | 'clinical' | 'notes';
type PatientField = keyof CreatePatientFormData;

/**
 * Where each field lives, in on-screen order: an invalid submit opens
 * the tab of the first error and focuses that field.
 */
const FIELD_TABS: ReadonlyArray<readonly [PatientField, SheetTab]> = [
  ['fullName', 'identity'],
  ['dateOfBirth', 'identity'],
  ['gender', 'identity'],
  ['doctorId', 'identity'],
  ['email', 'contact'],
  ['phone', 'contact'],
  ['address', 'contact'],
  ['clinicalConditions', 'clinical'],
  ['clinicalConditionsOther', 'clinical'],
  ['notes', 'notes'],
];

const TAB_TRIGGER_CLASS =
  'shrink-0 rounded-none border-b-2 border-transparent px-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none';
// Every tab stays mounted (hidden when inactive) so each field keeps its
// ref and its error, whichever tab is open.
const TAB_CONTENT_CLASS = 'm-0 data-[state=inactive]:hidden';
const NO_CONDITIONS: string[] = [];

function PatientSheetBody({
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
  const [tab, setTab] = useState<SheetTab>('identity');

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
    getValues,
    setFocus,
    setValue,
  } = useForm<CreatePatientFormData>({
    resolver: zodResolver(createPatientSchema),
    // Focus is handled in onInvalid: the field may sit on another tab.
    shouldFocusError: false,
    defaultValues: {
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
    },
  });

  // An admin creating a patient defaults to the first dentist — also
  // when the directory arrives after the sheet opened. Never overrides a
  // pick, and doesn't count as an edit.
  const firstDentistId = dentists[0]?.id;
  useEffect(() => {
    if (patient || !isAdmin || !firstDentistId || getValues('doctorId')) return;
    setValue('doctorId', firstDentistId);
  }, [firstDentistId, getValues, isAdmin, patient, setValue]);

  const gender = useWatch({ control, name: 'gender' });
  const doctorId = useWatch({ control, name: 'doctorId' });
  const fullName = useWatch({ control, name: 'fullName' }) ?? '';
  const clinicalConditions = useWatch({ control, name: 'clinicalConditions' }) ?? NO_CONDITIONS;
  const clinicalConditionsOther = useWatch({ control, name: 'clinicalConditionsOther' }) ?? '';

  const initials = useMemo(() => buildInitials(fullName), [fullName]);
  // Schema messages are i18n keys.
  const errorText = (message?: string) => (message ? t(message) : undefined);

  const onInvalid = (fieldErrors: FieldErrors<CreatePatientFormData>) => {
    const first = FIELD_TABS.find(([field]) => fieldErrors[field]);
    if (!first) return;
    const [field, fieldTab] = first;
    // Show the tab before focusing: a hidden field can't take focus.
    flushSync(() => setTab(fieldTab));
    setFocus(field);
  };

  return (
    <>
      {/* ─── Header strap (avatar + identity badges) ────────────── */}
      <header className="shrink-0 border-b bg-card px-4 py-4 sm:px-6">
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
        <div className="flex min-w-0 items-start gap-3 pr-8">
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
        noValidate
        onSubmit={handleSubmit(
          (data) =>
            onSubmit(
              mode === 'edit'
                ? { mode: 'edit', data: normalizePatientForm(data, 'edit') }
                : { mode: 'create', data: normalizePatientForm(data, 'create') },
              profilePhoto,
            ),
          onInvalid,
        )}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as SheetTab)}
          className="flex flex-1 flex-col"
        >
          <div className="overflow-x-auto border-b bg-muted/20 px-4 sm:px-6">
            <TabsList className="h-12 min-w-max justify-start gap-1 bg-transparent p-0">
              <TabsTrigger value="identity" className={TAB_TRIGGER_CLASS}>
                {t('patients.sheet.tabIdentity')}
              </TabsTrigger>
              <TabsTrigger value="contact" className={TAB_TRIGGER_CLASS}>
                {t('patients.sheet.tabContact')}
              </TabsTrigger>
              <TabsTrigger value="clinical" className={TAB_TRIGGER_CLASS}>
                {t('patients.sheet.tabClinical')}
              </TabsTrigger>
              <TabsTrigger value="notes" className={TAB_TRIGGER_CLASS}>
                {t('patients.sheet.tabNotes')}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            {/* ─── Identity tab ─────────────────────────────────── */}
            <TabsContent
              value="identity"
              forceMount
              className={cn(TAB_CONTENT_CLASS, 'space-y-4')}
            >
              <FieldGroup
                label={t('patients.sheet.fieldName')}
                htmlFor="patient-sheet-name"
                required
                error={errorText(errors.fullName?.message)}
              >
                <Input
                  id="patient-sheet-name"
                  placeholder={t('patients.sheet.fieldNamePh')}
                  aria-invalid={!!errors.fullName}
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
                <FieldGroup label={t('patients.sheet.fieldDob')} htmlFor="patient-sheet-dob">
                  <Input id="patient-sheet-dob" type="date" {...register('dateOfBirth')} />
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
            <TabsContent
              value="contact"
              forceMount
              className={cn(TAB_CONTENT_CLASS, 'space-y-4')}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldGroup
                  label={t('patients.sheet.fieldEmail')}
                  htmlFor="patient-sheet-email"
                  error={errorText(errors.email?.message)}
                >
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="patient-sheet-email"
                      type="email"
                      placeholder={t('patients.sheet.fieldEmailPh')}
                      className="pl-9"
                      aria-invalid={!!errors.email}
                      {...register('email')}
                    />
                  </div>
                </FieldGroup>
                <FieldGroup
                  label={t('patients.sheet.fieldPhone')}
                  htmlFor="patient-sheet-phone"
                  error={errorText(errors.phone?.message)}
                >
                  {/* Flag picker, Tunisia by default; stores E.164. */}
                  <Controller
                    control={control}
                    name="phone"
                    render={({ field }) => (
                      <PatientPhoneInput
                        id="patient-sheet-phone"
                        name={field.name}
                        size="sm"
                        ref={field.ref}
                        value={field.value ?? ''}
                        onChange={(next) => field.onChange(next.phone)}
                        onBlur={field.onBlur}
                        disabled={isSaving}
                        isInvalid={!!errors.phone}
                      />
                    )}
                  />
                </FieldGroup>
              </div>
              <FieldGroup label={t('patients.sheet.fieldAddress')} htmlFor="patient-sheet-address">
                <Input
                  id="patient-sheet-address"
                  placeholder={t('patients.sheet.fieldAddressPh')}
                  {...register('address')}
                />
              </FieldGroup>
            </TabsContent>

            {/* ─── Clinical conditions tab ─────────────────────── */}
            <TabsContent value="clinical" forceMount className={TAB_CONTENT_CLASS}>
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
                otherDetailError={errorText(errors.clinicalConditionsOther?.message)}
              />
            </TabsContent>

            {/* ─── Notes tab ─────────────────────────────────── */}
            <TabsContent
              value="notes"
              forceMount
              className={cn(TAB_CONTENT_CLASS, 'space-y-4')}
            >
              <FieldGroup
                label={t('patients.sheet.fieldNotes')}
                htmlFor="patient-sheet-notes"
                description={t('patients.sheet.fieldNotesDesc')}
              >
                <textarea
                  id="patient-sheet-notes"
                  {...register('notes')}
                  placeholder={t('patients.sheet.fieldNotesPh')}
                  className="min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </FieldGroup>
            </TabsContent>
          </div>

          {/* ─── Sticky footer ───────────────────────────────── */}
          <footer className="flex shrink-0 flex-col gap-3 border-t bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="w-full sm:w-auto">
              {mode === 'edit' && onDelete && (
                <DeletePatientButton
                  patientName={patient?.fullName ?? t('patients.sheet.deleteThis')}
                  onConfirm={onDelete}
                  disabled={isSaving || !!isDeleting}
                  loading={!!isDeleting}
                />
              )}
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => onOpenChange(false)}
                disabled={isSaving || !!isDeleting}
              >
                {t('patients.sheet.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={
                  isSaving ||
                  !!isDeleting ||
                  (mode === 'edit' && !isDirty && !profilePhoto)
                }
                className="w-full gap-2 sm:w-auto"
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
    </>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────

function FieldGroup({
  label,
  htmlFor,
  description,
  required,
  error,
  children,
}: {
  label: string;
  /** Id of the control the label names (clicking it focuses the field). */
  htmlFor?: string;
  description?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2">
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
          'w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto',
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
