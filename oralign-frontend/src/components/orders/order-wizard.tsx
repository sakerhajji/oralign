'use client';

import { Fragment, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Factory,
  Info,
  ListChecks,
  Save,
  ScanLine,
  Send,
  ShieldCheck,
  Target,
  UserRound,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
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
import { Switch } from '@/components/ui/switch';

// The odontogram pulls a 4 MB anatomical SVG sprite (cached after the
// first request) — defer the component chunk until step 5 is shown so
// earlier steps stay light.
const OdontogramSelector = dynamic(
  () =>
    import('@/components/orders/odontogram-selector').then((m) => ({
      default: m.OdontogramSelector,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading odontogram…
      </div>
    ),
  },
);
import {
  ClinicalOrderFiles,
  OrderFileUpload,
} from '@/components/orders/order-file-upload';
import { ClinicalConditionsField } from '@/components/patients/clinical-conditions-field';
import { useAuth } from '@/lib/providers/auth-provider';
import { patientsService, usersService } from '@/lib/api';
import {
  useCreateOrder,
  useCreatePatient,
  useSubmitOrder,
  useUpdateOrder,
  useUpdateToothInstructions,
} from '@/lib/hooks';
import {
  ArchTreatment,
  CreateOrderDto,
  DentalOrder,
  Gender,
  OrderStatus,
  Patient,
  PatientStage,
  ToothInstruction,
  ToothInstructionType,
  UserRole,
} from '@/lib/types';
import { createOrderSchema } from '@/lib/schemas';
import { cn } from '@/lib/utils';

const BRAND_ACTIVE_TEXT = 'text-primary';
const BRAND_ACTIVE_BORDER = 'border-primary';
const BRAND_ACTIVE_BG = 'bg-primary';

const steps = [
  {
    title: 'Patient',
    heading: 'Patient Information: Add the necessary details for the patient',
    description:
      "Your patient file is more than a compilation of data. It's a portrait of personalized care waiting to be designed.",
    icon: UserRound,
  },
  {
    title: 'Images',
    heading: 'Patient images',
    description:
      'Add the facial and intraoral image set for a complete clinical package.',
    icon: Camera,
  },
  {
    title: 'Scans',
    heading: 'Radiography images and STL files',
    description:
      'Upload radiography and 3D scan files so reviewers can inspect the case visually.',
    icon: ScanLine,
  },
  {
    title: 'Treatment',
    heading: 'Treatment plan and clinical objective',
    description:
      'Capture the chief complaint, arch scope, and movement plan using the clinical options you provided.',
    icon: Target,
  },
  {
    // Combined "Odontogram + Movement" step. Tooth-level instructions are
    // shown FIRST (primary clinical task), with the AP/elastics/bite/IPR
    // controls underneath. Manufacturing has been dropped from the wizard.
    title: 'Movement',
    heading: 'Tooth-level instructions & movement plan',
    description:
      'Mark teeth that need no attachments, no IPR, or should not be moved — then document AP relationship, elastics, open bite, midline, IPR, bite ramps, crossbite, spaces, and extractions.',
    icon: ListChecks,
  },
  {
    title: 'Review',
    heading: 'Review and Submit: Confirm the order package',
    description:
      'Review the key order details before submitting the case for the next operational step.',
    icon: ClipboardCheck,
  },
] as const;

const patientStageOptions = [
  [PatientStage.INITIAL, 'Initial'],
  [PatientStage.REFINEMENT, 'Refinement'],
  [PatientStage.RETAINER, 'Retainer'],
] as const;

const treatmentPlanOptions = [
  'Full Arch',
  'Anterior Only',
  '4 - 4 only',
  'Dont Move 6 - 7 only',
] as const;

const apRelationshipOptions = [
  'Maintain',
  'Improve canine only',
  'Improve canine and molar',
  'Correct both Molar and Canine',
] as const;

const openBiteOptions = ['Correct', 'Maintain', 'Improved'] as const;
const midlineOptions = ['Maintain', 'Correct'] as const;
const crossbiteOptions = [
  'Correct',
  'Maintain',
  'Correct only anterior',
  'Correct only posterior',
] as const;
const spacesOptions = ['Close all spaces', 'Maintain spaces'] as const;
const materialOptions = ['TAGLUS', 'ZENDURA', 'NO MANUFACTURING'] as const;

type PatientMode = 'existing' | 'new';
type FieldErrors = Partial<Record<string, string>>;

/**
 * Mirrors the field set used by the dedicated /dashboard/patients form
 * so the planner sees the same affordances regardless of where they
 * create a patient from. `reason` is the inline-only addition because
 * the order wizard needs a chief complaint to seed the next step;
 * everything else maps 1:1 to `CreatePatientDto`.
 */
interface NewPatientDraft {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender?: Gender;
  address: string;
  notes: string;
  // Multi-select clinical conditions + free-text detail for "Other".
  // These ALSO double as the order's "Reason for consultation" — the
  // clinical team treats the two as the same concept (the patient
  // comes in BECAUSE OF the conditions). The standalone free-text
  // reason field was removed; the order's chiefComplaint is auto-
  // derived from these values on submit.
  clinicalConditions: string[];
  clinicalConditionsOther: string;
}

export function OrderWizard({ initialOrder }: { initialOrder?: DentalOrder }) {
  const router = useRouter();
  const { isAdmin, isDentist, user } = useAuth();
  const [step, setStep] = useState(0);
  const [patientMode, setPatientMode] = useState<PatientMode>('existing');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [savedOrder, setSavedOrder] = useState<DentalOrder | undefined>(
    initialOrder,
  );
  const [toothInstructions, setToothInstructions] = useState<ToothInstruction[]>(
    initialOrder?.toothInstructions ?? [],
  );
  const [newPatient, setNewPatient] = useState<NewPatientDraft>({
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: undefined,
    address: '',
    notes: '',
    clinicalConditions: [],
    clinicalConditionsOther: '',
  });
  const [form, setForm] = useState<CreateOrderDto>({
    doctorId: initialOrder?.doctorId,
    patientId: initialOrder?.patientId ?? '',
    patientStage: initialOrder?.patientStage,
    chiefComplaint: initialOrder?.chiefComplaint ?? '',
    archTreatment: initialOrder?.archTreatment,
    treatBothArch: initialOrder?.treatBothArch ?? false,
    treatmentPlan: initialOrder?.treatmentPlan ?? '',
    dontMoveOption: initialOrder?.dontMoveOption ?? '',
    apRelationship: initialOrder?.apRelationship ?? '',
    anteroposteriorRelationship:
      initialOrder?.anteroposteriorRelationship ?? '',
    elastics: initialOrder?.elastics ?? '',
    openBite: initialOrder?.openBite ?? '',
    midline: initialOrder?.midline ?? '',
    ipr: initialOrder?.ipr ?? '',
    biteRamps: initialOrder?.biteRamps ?? '',
    expansion: initialOrder?.expansion ?? '',
    crossbite: initialOrder?.crossbite ?? '',
    spaces: initialOrder?.spaces ?? '',
    extractions: initialOrder?.extractions ?? '',
    specialInstructions: initialOrder?.specialInstructions ?? '',
    additionalInstructions: initialOrder?.additionalInstructions ?? '',
    useCbctWithScans: initialOrder?.useCbctWithScans ?? false,
    wantsManufacturing: initialOrder?.wantsManufacturing ?? false,
    materials: initialOrder?.materials ?? [],
  });

  const createPatient = useCreatePatient();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const updateTeeth = useUpdateToothInstructions();
  const submitOrder = useSubmitOrder();

  const dentistsQuery = useQuery({
    queryKey: ['order-dentists'],
    queryFn: () =>
      usersService.getAllUsers({ role: UserRole.DENTIST, page: 1, limit: 100 }),
    enabled: isAdmin,
  });

  const patientsQuery = useQuery({
    queryKey: ['order-patients', isAdmin ? form.doctorId : user?.id],
    queryFn: () =>
      patientsService.getPatients({
        page: 1,
        limit: 100,
        ...(isAdmin && form.doctorId ? { doctorId: form.doctorId } : {}),
      }),
    enabled: isDentist || (isAdmin && !!form.doctorId),
  });

  const selectedPatient = patientsQuery.data?.data.find(
    (patient) => patient.id === form.patientId,
  );
  const selectedDentist = dentistsQuery.data?.data.find(
    (doctor) => doctor.id === form.doctorId,
  );
  const activeStep = steps[step];
  const ActiveIcon = activeStep.icon;
  const canModify = true;
  const canSubmit = !savedOrder || savedOrder.status === OrderStatus.DRAFT;
  const isSaving =
    createPatient.isPending ||
    createOrder.isPending ||
    updateOrder.isPending ||
    updateTeeth.isPending;

  const updateField = <K extends keyof CreateOrderDto>(
    key: K,
    value: CreateOrderDto[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  const updateNewPatient = <K extends keyof NewPatientDraft>(
    key: K,
    value: NewPatientDraft[K],
  ) => {
    setNewPatient((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [`newPatient.${key}`]: undefined }));
  };

  const ensurePatientReady = async (): Promise<string | false> => {
    const errors: FieldErrors = {};

    if (isAdmin && !form.doctorId) {
      errors.doctorId = 'Dentist selection is required.';
    }

    if (patientMode === 'existing') {
      if (!form.patientId) {
        errors.patientId = 'Patient selection is required.';
      }
    } else {
      if (!newPatient.fullName.trim()) {
        errors['newPatient.fullName'] = 'Patient name is required.';
      }
      if (!newPatient.dateOfBirth) {
        errors['newPatient.dateOfBirth'] = 'Date of birth is required.';
      }
      if (!newPatient.gender) {
        errors['newPatient.gender'] = 'Gender selection is required.';
      }
      // ── Reason for consultation ───────────────────────────────────
      // The clinical team merged "Reason for consultation" with the
      // Clinical Conditions checkboxes (they're the same concept).
      // Require AT LEAST ONE condition checked OR an "Other" entry
      // with detail text — otherwise the planner is creating a
      // patient with no documented chief complaint.
      const checkedConditions = newPatient.clinicalConditions.filter(Boolean);
      const otherSelected = checkedConditions.includes('Other');
      const otherDetail = newPatient.clinicalConditionsOther.trim();
      const hasReason = otherSelected
        ? checkedConditions.length > 1 || otherDetail.length > 0
        : checkedConditions.length > 0;
      if (!hasReason) {
        errors['newPatient.clinicalConditions'] =
          'Pick at least one clinical condition (or tick "Other" and add a description).';
      }
      // email + phone + address + notes are OPTIONAL (same as the
      // dedicated patient form).
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return false;
    }

    if (patientMode === 'new' && !form.patientId) {
      // Strip the "Other" detail when "Other" isn't selected so we
      // never persist orphan text. Empty arrays become `undefined`
      // on the wire so the backend's PATCH semantics also work.
      const conditions = newPatient.clinicalConditions.filter(Boolean);
      const otherSelected = conditions.includes('Other');
      const otherDetail = otherSelected
        ? newPatient.clinicalConditionsOther.trim() || undefined
        : undefined;

      // Auto-derive the order's chief complaint from the conditions:
      // the standard labels first, with the free-text "Other" detail
      // appended after an em-dash separator. Clipped at 240 chars to
      // stay within the column's reasonable size. Falls back to any
      // chief-complaint the planner had already typed in this session
      // (rare — the field doesn't appear on the patient step today,
      // but kept for forward-compatibility).
      const standardLabels = conditions.filter((c) => c !== 'Other');
      const derivedChiefComplaint = [
        standardLabels.join(', '),
        otherDetail ?? '',
      ]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 240);

      const createdPatient = await createPatient.mutateAsync({
        fullName: newPatient.fullName.trim(),
        email: newPatient.email.trim() || undefined,
        phone: newPatient.phone.trim() || undefined,
        gender: newPatient.gender,
        dateOfBirth: newPatient.dateOfBirth || undefined,
        address: newPatient.address.trim() || undefined,
        notes: newPatient.notes.trim() || undefined,
        clinicalConditions: conditions.length > 0 ? conditions : undefined,
        clinicalConditionsOther: otherDetail,
        doctorId: isAdmin ? form.doctorId : undefined,
      });
      setForm((current) => ({
        ...current,
        patientId: createdPatient.id,
        chiefComplaint:
          current.chiefComplaint?.trim() || derivedChiefComplaint || undefined,
      }));
      return createdPatient.id;
    }

    return form.patientId;
  };

  const validateCurrentStep = async (): Promise<boolean> => {
    const errors: FieldErrors = {};

    if (step === 0) {
      return Boolean(await ensurePatientReady());
    }

    if (step === 3) {
      if (!form.patientStage) {
        errors.patientStage = 'Patient stage is required.';
      }
      if (!form.archTreatment) {
        errors.archTreatment = 'Arch treatment is required.';
      }
      if (!form.chiefComplaint?.trim()) {
        errors.chiefComplaint = 'Chief complaint is required.';
      }
      if (!form.treatmentPlan?.trim()) {
        errors.treatmentPlan = 'Treatment plan is required.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return false;
    }

    setFieldErrors({});
    return true;
  };

  const validateForSubmit = async (): Promise<boolean> => {
    const patientId = await ensurePatientReady();
    if (!patientId) {
      setStep(0);
      return false;
    }

    const errors: FieldErrors = {};
    if (!form.patientStage) errors.patientStage = 'Patient stage is required.';
    if (!form.archTreatment) errors.archTreatment = 'Arch treatment is required.';
    if (!form.chiefComplaint?.trim()) {
      errors.chiefComplaint = 'Chief complaint is required.';
    }
    if (!form.treatmentPlan?.trim()) {
      errors.treatmentPlan = 'Treatment plan is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStep(3);
      return false;
    }

    setFieldErrors({});
    return true;
  };

  const saveDraft = async () => {
    const patientId = await ensurePatientReady();
    if (!patientId) return undefined;

    // The order's `chiefComplaint` falls back to a string derived from
    // the new patient's clinical-conditions selection — the merged
    // "Reason for consultation" concept. `ensurePatientReady` above
    // already wrote this into `form.chiefComplaint` when the planner
    // is creating a new patient, but we re-derive defensively in case
    // the form was reset.
    const derivedFromConditions = (() => {
      const conditions = newPatient.clinicalConditions.filter(Boolean);
      const standard = conditions.filter((c) => c !== 'Other');
      const other = conditions.includes('Other')
        ? newPatient.clinicalConditionsOther.trim()
        : '';
      return [standard.join(', '), other].filter(Boolean).join(' — ').slice(0, 240);
    })();

    const draftPayload = {
      ...form,
      patientId,
      chiefComplaint: form.chiefComplaint?.trim() || derivedFromConditions || undefined,
      materials: (form.materials ?? []).filter(Boolean),
      toothInstructions,
    };

    const parsed = createOrderSchema.safeParse(draftPayload);
    if (!parsed.success) {
      setFieldErrors({
        patientId:
          parsed.error.errors[0]?.message ?? 'Please complete required fields.',
      });
      setStep(0);
      return undefined;
    }

    const nextOrder = savedOrder
      ? await updateOrder.mutateAsync({ id: savedOrder.id, data: parsed.data })
      : await createOrder.mutateAsync(parsed.data);

    // The order wizard owns the FOUR doctor-level instruction types
    // (No Attachments / Do Not Move / No IPR / Extract). It does NOT
    // own ATTACHMENT — that's the planner's surface in the treatment
    // editor. Declare the scope explicitly so the backend's REPLACE-
    // ALL never wipes planner-set attachment rows when the doctor
    // re-saves her odontogram.
    await updateTeeth.mutateAsync({
      id: nextOrder.id,
      instructions: toothInstructions,
      replaceTypes: [
        ToothInstructionType.NO_ATTACHMENTS,
        ToothInstructionType.DO_NOT_MOVE,
        ToothInstructionType.NO_IPR,
        ToothInstructionType.EXTRACT,
      ],
    });
    setSavedOrder(nextOrder);
    return nextOrder;
  };

  if (!isAdmin && !isDentist) {
    return (
      <div className="mx-auto flex min-h-72 max-w-3xl items-center justify-center rounded-md border bg-card p-8 text-center text-muted-foreground shadow-sm">
        Your role can view allowed orders but cannot create or edit dentist
        clinical fields.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1220px] space-y-7">
      <OrderStepper currentStep={step} onStepChange={setStep} />

      <header className="mx-auto max-w-5xl text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ActiveIcon className="h-5 w-5" />
        </div>
        <h1 className="text-balance text-xl font-bold tracking-tight text-foreground md:text-2xl">
          {activeStep.heading}
        </h1>
        <p className="mx-auto mt-3 max-w-5xl text-sm leading-6 text-muted-foreground">
          {activeStep.description}
        </p>
      </header>

      <main className="rounded-md border bg-card p-4 shadow-[0_12px_35px_rgba(15,23,42,0.12)] md:p-5 lg:p-6">
        {step === 0 && (
          <PatientStep
            isAdmin={isAdmin}
            canModify={canModify}
            patientMode={patientMode}
            setPatientMode={(mode) => {
              setPatientMode(mode);
              setFieldErrors({});
              if (mode === 'new') updateField('patientId', '');
            }}
            form={form}
            newPatient={newPatient}
            selectedPatientName={selectedPatient?.fullName ?? savedOrder?.patient?.fullName}
            dentists={dentistsQuery.data?.data ?? []}
            patients={patientsQuery.data?.data ?? []}
            patientsLoading={patientsQuery.isLoading}
            errors={fieldErrors}
            updateField={updateField}
            updateNewPatient={updateNewPatient}
          />
        )}

        {step === 1 && (
          <ClinicalOrderFiles
            orderId={savedOrder?.id}
            readOnly={!canModify}
            section="patient-images"
          />
        )}

        {step === 2 && (
          <ClinicalOrderFiles
            orderId={savedOrder?.id}
            readOnly={!canModify}
            section="radiography-stl"
          />
        )}

        {step === 3 && (
          <TreatmentStep
            form={form}
            disabled={!canModify}
            errors={fieldErrors}
            updateField={updateField}
          />
        )}

        {step === 4 && (
          <div className="space-y-10">
            {/* Tooth-level instructions FIRST — primary clinical task on
                this step. Movement / bite / IPR controls follow under a
                visual divider so the user scrolls into them naturally. */}
            <OdontogramSelector
              value={toothInstructions}
              onChange={setToothInstructions}
              disabled={!canModify}
            />
            <div className="border-t pt-8">
              <AdvancedMovementStep
                form={form}
                disabled={!canModify}
                updateField={updateField}
              />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <ReviewStep
              savedOrder={savedOrder}
              selectedPatient={selectedPatient}
              newPatient={patientMode === 'new' ? newPatient : null}
              selectedDentist={selectedDentist}
              fallbackDentistName={
                savedOrder?.doctor?.fullName ?? user?.fullName ?? null
              }
              form={form}
              toothInstructions={toothInstructions}
            />
            <OrderFileUpload orderId={savedOrder?.id} readOnly />
          </div>
        )}
      </main>

      <footer className="flex flex-col gap-3 rounded-md border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          {canModify && (
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={saveDraft}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving
                ? 'Saving...'
                : savedOrder
                  ? 'Save Changes'
                  : 'Save Draft'}
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button
              type="button"
              onClick={async () => {
                const valid = await validateCurrentStep();
                if (!valid) return;
                if ((step === 0 || (step < 3 && !savedOrder)) && canModify) {
                  const order = await saveDraft();
                  if (!order) return;
                }
                setStep((current) => Math.min(steps.length - 1, current + 1));
              }}
            >
              Continue
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!canModify || !canSubmit || submitOrder.isPending}
              onClick={async () => {
                const valid = await validateForSubmit();
                if (!valid) return;
                const order = await saveDraft();
                if (!order) return;
                await submitOrder.mutateAsync(order.id);
                router.push(`/dashboard/orders/${order.id}`);
              }}
            >
              <Send className="mr-2 h-4 w-4" />
              Submit Order
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function OrderStepper({
  currentStep,
  onStepChange,
}: {
  currentStep: number;
  onStepChange: (step: number) => void;
}) {
  const current = steps[currentStep];
  // Total = step count + N-1 progress bars. The progress bars take `flex-1`
  // so they expand to fill whatever width the container provides — the
  // stepper always exactly fits its parent without a horizontal scroll.

  return (
    <nav aria-label="Order wizard steps" className="space-y-3">
      {/* Mobile-only context line — shows the title clearly because the
          circles below are too small for inline labels at phone widths. */}
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Step {currentStep + 1} of {steps.length}
        </span>
        <span className="truncate text-sm font-semibold text-foreground">
          {current.title}
        </span>
      </div>

      {/* Step rail — circles stretched evenly across the available width. */}
      <ol
        role="list"
        className="relative flex w-full items-center pb-6 sm:pb-8"
      >
        {steps.map((step, index) => {
          const active = index === currentStep;
          const complete = index < currentStep;
          return (
            <Fragment key={step.title}>
              <li className="relative flex shrink-0 flex-col items-center">
                <button
                  type="button"
                  // Free navigation — every step circle is clickable so the
                  // user can jump back and forth without finishing earlier
                  // steps. The Next button still validates before moving
                  // forward; this is just a quick-jump shortcut.
                  onClick={() => onStepChange(index)}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`Step ${index + 1}: ${step.title}`}
                  className={cn(
                    'group relative grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:h-9 sm:w-9 sm:text-sm',
                    active &&
                      'scale-110 border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25',
                    complete &&
                      'border-primary bg-primary/10 text-primary hover:bg-primary/20',
                    !active && !complete &&
                      'border-border bg-background text-muted-foreground hover:border-primary/60 hover:text-foreground',
                  )}
                >
                  {complete ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </button>

                {/* Label — absolutely positioned below the circle so its
                    presence (or absence below sm) doesn't push the
                    connector lines out of alignment. */}
                <span
                  className={cn(
                    'pointer-events-none absolute top-full mt-1.5 hidden whitespace-nowrap text-[11px] font-medium transition-colors sm:block',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {step.title}
                </span>
              </li>

              {/* Connector — `flex-1` makes it absorb every spare pixel,
                  so seven circles + six connectors always span the row
                  without scroll. Coloured to track completion. */}
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'mx-1 h-0.5 flex-1 rounded-full transition-colors sm:mx-2',
                    complete ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

function PatientStep({
  isAdmin,
  canModify,
  patientMode,
  setPatientMode,
  form,
  newPatient,
  selectedPatientName,
  dentists,
  patients,
  patientsLoading,
  errors,
  updateField,
  updateNewPatient,
}: {
  isAdmin: boolean;
  canModify: boolean;
  patientMode: PatientMode;
  setPatientMode: (mode: PatientMode) => void;
  form: CreateOrderDto;
  newPatient: NewPatientDraft;
  selectedPatientName?: string;
  dentists: { id: string; fullName: string }[];
  patients: { id: string; fullName: string }[];
  patientsLoading: boolean;
  errors: FieldErrors;
  updateField: <K extends keyof CreateOrderDto>(key: K, value: CreateOrderDto[K]) => void;
  updateNewPatient: <K extends keyof NewPatientDraft>(
    key: K,
    value: NewPatientDraft[K],
  ) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="mx-auto grid max-w-[540px] gap-3 sm:grid-cols-2">
        <ChoiceCard
          active={patientMode === 'existing'}
          title="Select one of your patients"
          description={selectedPatientName ?? 'Choose an existing patient from your list.'}
          onClick={() => setPatientMode('existing')}
        />
        <ChoiceCard
          active={patientMode === 'new'}
          title="Create a new patient"
          description="Add details to create a new patient."
          onClick={() => setPatientMode('new')}
        />
      </div>

      {isAdmin && (
        <div className="grid gap-2">
          <Label>Dentist</Label>
          <Select
            value={form.doctorId}
            onValueChange={(doctorId) => updateField('doctorId', doctorId)}
            disabled={!canModify}
          >
            <SelectTrigger className={cn('h-11', errors.doctorId && 'border-red-500')}>
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
          <FieldError message={errors.doctorId} />
        </div>
      )}

      {patientMode === 'existing' ? (
        <div className="grid gap-2">
          <Label>Patient</Label>
          <Select
            value={form.patientId}
            onValueChange={(patientId) => updateField('patientId', patientId)}
            disabled={!canModify || patientsLoading}
          >
            <SelectTrigger className={cn('h-11', errors.patientId && 'border-red-500')}>
              <SelectValue placeholder="Select patient from your list" />
            </SelectTrigger>
            <SelectContent>
              {patients.map((patient) => (
                <SelectItem key={patient.id} value={patient.id}>
                  {patient.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.patientId} />
        </div>
      ) : (
        // ──────────────────────────────────────────────────────────────
        // Inline "Create a new patient" form. Field set mirrors the
        // dedicated /dashboard/patients page so users see a consistent
        // form regardless of entry point. Required: name + DOB + gender +
        // reason. Optional: email, phone, address, notes.
        // ──────────────────────────────────────────────────────────────
        <div className="grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <TextInput
                label="Patient name"
                value={newPatient.fullName}
                placeholder="Full name"
                icon={<UserRound className="h-4 w-4" />}
                error={errors['newPatient.fullName']}
                disabled={!canModify}
                onChange={(value) => updateNewPatient('fullName', value)}
              />
            </div>
            <TextInput
              label="Email"
              value={newPatient.email}
              type="email"
              placeholder="patient@example.com"
              error={errors['newPatient.email']}
              disabled={!canModify}
              onChange={(value) => updateNewPatient('email', value)}
            />
            <TextInput
              label="Phone"
              value={newPatient.phone}
              placeholder="+216 12 345 678"
              error={errors['newPatient.phone']}
              disabled={!canModify}
              onChange={(value) => updateNewPatient('phone', value)}
            />
            <TextInput
              label="Date of birth"
              value={newPatient.dateOfBirth}
              type="date"
              icon={<CalendarDays className="h-4 w-4" />}
              error={errors['newPatient.dateOfBirth']}
              disabled={!canModify}
              onChange={(value) => updateNewPatient('dateOfBirth', value)}
            />
            <div className="grid gap-2">
              <Label>Gender</Label>
              <Select
                value={newPatient.gender}
                onValueChange={(gender) => updateNewPatient('gender', gender as Gender)}
                disabled={!canModify}
              >
                <SelectTrigger
                  className={cn('h-11', errors['newPatient.gender'] && 'border-red-500')}
                >
                  <SelectValue placeholder="Select patient gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Gender.FEMALE}>Female</SelectItem>
                  <SelectItem value={Gender.MALE}>Male</SelectItem>
                  <SelectItem value={Gender.OTHER}>Other</SelectItem>
                </SelectContent>
              </Select>
              <FieldError message={errors['newPatient.gender']} />
            </div>
            <div className="md:col-span-2">
              <TextInput
                label="Address"
                value={newPatient.address}
                placeholder="Street, city, postal code"
                error={errors['newPatient.address']}
                disabled={!canModify}
                onChange={(value) => updateNewPatient('address', value)}
              />
            </div>
          </div>
          <TextAreaField
            label="Notes"
            value={newPatient.notes}
            placeholder="Allergies, medical history, anything the planner should know…"
            error={errors['newPatient.notes']}
            disabled={!canModify}
            onChange={(value) => updateNewPatient('notes', value)}
          />
          {/* "Reason for consultation" — clinical-conditions checkboxes
              replace the previous free-text textarea. The clinical
              team treats the conditions list as the reason itself, and
              free-form detail still has a home via the "Other" toggle.
              The order's `chiefComplaint` is auto-derived from the
              selection in `saveDraft` / `ensurePatientReady` above. */}
          <ClinicalConditionsField
            conditions={newPatient.clinicalConditions}
            otherDetail={newPatient.clinicalConditionsOther}
            disabled={!canModify}
            idPrefix="new-patient-wizard"
            onConditionsChange={(next) =>
              updateNewPatient('clinicalConditions', next)
            }
            onOtherDetailChange={(next) =>
              updateNewPatient('clinicalConditionsOther', next)
            }
          />
          {errors['newPatient.clinicalConditions'] && (
            <FieldError message={errors['newPatient.clinicalConditions']} />
          )}
        </div>
      )}
    </div>
  );
}

function TreatmentStep({
  form,
  disabled,
  errors,
  updateField,
}: {
  form: CreateOrderDto;
  disabled?: boolean;
  errors: FieldErrors;
  updateField: <K extends keyof CreateOrderDto>(key: K, value: CreateOrderDto[K]) => void;
}) {
  return (
    // Every field on Step 4 uses the SAME <fieldset> card pattern as
    // Step 5 (Movement plan) — legend heading + one-line muted hint +
    // OptionPill grid. Keeps the whole wizard visually consistent so
    // the planner reads each control as the same kind of choice.
    <div className="space-y-6">
      {/* ─── Patient stage ────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Patient stage</legend>
        <p className="text-xs text-muted-foreground">
          Where the patient is in their treatment lifecycle.
        </p>
        <div
          role="radiogroup"
          aria-label="Patient stage"
          className="grid gap-2 sm:grid-cols-3"
        >
          {patientStageOptions.map(([value, label]) => (
            <ChoiceCard
              key={value}
              active={form.patientStage === value}
              disabled={disabled}
              title={label}
              description={stageDescription(value)}
              onClick={() => updateField('patientStage', value)}
            />
          ))}
        </div>
        <FieldError message={errors.patientStage} />
      </fieldset>

      {/* ─── Arch treatment ───────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Arch treatment</legend>
        <p className="text-xs text-muted-foreground">
          Which arch(es) the planner will treat. Choosing "Both arches"
          also sets the `treatBothArch` flag for downstream steps.
        </p>
        <div
          role="radiogroup"
          aria-label="Arch treatment"
          className="grid gap-2 sm:grid-cols-3"
        >
          <OptionPill
            active={form.archTreatment === ArchTreatment.UPPER}
            disabled={disabled}
            label="Upper"
            onClick={() => {
              updateField('archTreatment', ArchTreatment.UPPER);
              updateField('treatBothArch', false);
            }}
          />
          <OptionPill
            active={form.archTreatment === ArchTreatment.LOWER}
            disabled={disabled}
            label="Lower"
            onClick={() => {
              updateField('archTreatment', ArchTreatment.LOWER);
              updateField('treatBothArch', false);
            }}
          />
          <OptionPill
            active={form.archTreatment === ArchTreatment.BOTH}
            disabled={disabled}
            label="Both arches"
            onClick={() => {
              updateField('archTreatment', ArchTreatment.BOTH);
              updateField('treatBothArch', true);
            }}
          />
        </div>
        <FieldError message={errors.archTreatment} />
      </fieldset>

      {/* ─── Chief complaint ──────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Chief complaint</legend>
        <p className="text-xs text-muted-foreground">
          The patient's main concern in their own words. Used by the
          planner when designing the treatment plan and shown on the
          order detail page.
        </p>
        {/* Inline <Input> rather than the TextInput helper because the
            fieldset legend already supplies the field label. */}
        <Input
          type="text"
          value={form.chiefComplaint ?? ''}
          placeholder="Describe the patient's main concern..."
          disabled={disabled}
          onChange={(event) => updateField('chiefComplaint', event.target.value)}
          className={cn('h-11', errors.chiefComplaint && 'border-red-500')}
        />
        <FieldError message={errors.chiefComplaint} />
      </fieldset>

      {/* ─── Treatment plan ───────────────────────────────────────────── */}
      {/* "Treat both arch" text input removed — it was a duplicate of the
          "Both arches" pill above. Choosing the pill already sets the
          boolean. The duplicate text input could leave the radio and the
          boolean out of sync (a real bug). */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Treatment plan</legend>
        <p className="text-xs text-muted-foreground">
          Which segments the planner is allowed to move.
        </p>
        <div
          role="radiogroup"
          aria-label="Treatment plan"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {treatmentPlanOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={form.treatmentPlan === opt}
              disabled={disabled}
              label={opt}
              onClick={() => updateField('treatmentPlan', opt)}
            />
          ))}
        </div>
        <FieldError message={errors.treatmentPlan} />
      </fieldset>

      {/* ─── A-P relationship ─────────────────────────────────────────── */}
      {/* "Don't move" text removed — the Odontogram's "Do Not Move" colour
          captures this per-tooth in step 5 (the canonical place). */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">A-P relationship</legend>
        <p className="text-xs text-muted-foreground">
          Antero-posterior treatment goal for canines and molars.
        </p>
        <div
          role="radiogroup"
          aria-label="A-P relationship"
          className="grid gap-2 sm:grid-cols-2"
        >
          {apRelationshipOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={form.apRelationship === opt}
              disabled={disabled}
              label={opt}
              onClick={() => updateField('apRelationship', opt)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// ─── Structured option tables for the mechanics fields ──────────────────────
// Each control writes a short structured string into the existing free-text
// backend column (e.g. ipr: "Both"). The wizard parses the same string back
// so the radio reflects what was previously chosen.

const segmentOptions = ['No', 'Anterior', 'Posterior', 'Both'] as const;
type Segment = (typeof segmentOptions)[number];

const biteRampOptions = ['No bite ramps', 'Anterior', 'Canine / cuspid', 'Molar'] as const;
const expansionOptions = ['No expansion', 'Anterior', 'Posterior', 'Both'] as const;

/**
 * Pack a segment selection into the saved string.
 *
 * History note: an older revision of this UI exposed an extra
 * "No priority / Anterior priority / Posterior priority" radio when
 * `segment === 'Both'`, and packed it into the saved string as
 * `"Both — anterior priority"`. The clinical team asked for that
 * sub-radio to be removed, so we now always pack as a bare segment.
 * `unpackSegment` still tolerates the old strings on read so existing
 * orders don't break — the priority qualifier is simply dropped when
 * the user re-saves.
 */
function packSegment(segment: Segment): string {
  return segment === 'No' ? 'No' : segment;
}

/** Recover the segment from a saved string (tolerant of legacy priority suffixes). */
function unpackSegment(value: string | undefined): Segment {
  const raw = (value ?? '').trim();
  if (!raw || /^no\b/i.test(raw)) return 'No';
  if (/^anterior/i.test(raw)) return 'Anterior';
  if (/^posterior/i.test(raw)) return 'Posterior';
  if (/^both/i.test(raw)) return 'Both';
  return 'No';
}

// ─── Elastics ───────────────────────────────────────────────────────────────
// The elastics field stores a single free-text string in the DB. The UI
// exposes a SINGLE-SELECT radio (pill grid) for the five common clinical
// types plus a "No elastics" off-switch and a free-text notes input.
// The two are packed into one string like `"Class II elastics — Full-time
// wear"` and unpacked symmetrically.
//
// History note: an earlier revision used a multi-select checkbox grid.
// The clinical team asked for radio semantics — a case picks ONE elastic
// configuration; multi-elastic cases capture the secondary type in the
// notes field. unpackElastics is tolerant of the old multi-comma format
// on read so existing orders keep working: it picks the first known
// label and folds the rest into notes.

const elasticTypeOptions = [
  'No elastics',
  'Class I elastics',
  'Class II elastics',
  'Class III elastics',
  'Vertical bite elastics',
  'Criss-cross elastics',
] as const;
type ElasticType = (typeof elasticTypeOptions)[number];

/**
 * Pack a single elastic type + notes into the storage string.
 * Empty type + empty notes → empty string ("nothing chosen").
 * "No elastics" packs to just "No elastics" (no trailing notes).
 */
function packElastics(type: ElasticType | null, notes: string): string {
  const trimmed = notes.trim();
  if (!type && !trimmed) return '';
  if (type === 'No elastics') return 'No elastics';
  if (type && trimmed) return `${type} — ${trimmed}`;
  return type ?? trimmed;
}

/**
 * Recover the chosen elastic type + the notes from the stored string.
 * Tolerant of the legacy multi-select format (`"Class I, Class III —
 * notes"`) — first known label wins, the rest folds into notes.
 */
function unpackElastics(value: string | undefined): {
  type: ElasticType | null;
  notes: string;
} {
  const raw = (value ?? '').trim();
  if (!raw) return { type: null, notes: '' };
  // Split on the first em-dash we use as separator between type list and
  // notes. Anything before is the (possibly comma-separated) type list,
  // anything after is notes.
  const dashIdx = raw.indexOf('—');
  const head = dashIdx >= 0 ? raw.slice(0, dashIdx).trim() : raw;
  const tail = dashIdx >= 0 ? raw.slice(dashIdx + 1).trim() : '';
  const tokens = head
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  let chosen: ElasticType | null = null;
  const unmatched: string[] = [];
  for (const tok of tokens) {
    const hit = elasticTypeOptions.find(
      (opt) => opt.toLowerCase() === tok.toLowerCase(),
    );
    if (hit && !chosen) chosen = hit;
    else if (hit) unmatched.push(hit);
    else unmatched.push(tok);
  }
  const notes = [unmatched.join(', '), tail].filter(Boolean).join(' — ');
  return { type: chosen, notes };
}

function AdvancedMovementStep({
  form,
  disabled,
  updateField,
}: {
  form: CreateOrderDto;
  disabled?: boolean;
  updateField: <K extends keyof CreateOrderDto>(key: K, value: CreateOrderDto[K]) => void;
}) {
  // Decode the current saved strings into structured UI state. Each
  // segment is just `'No' | 'Anterior' | 'Posterior' | 'Both'` now —
  // the legacy priority qualifier was removed at the clinical team's
  // request and `unpackSegment` silently drops it from old data.
  const iprSegment = unpackSegment(form.ipr);
  const expansionSegment = unpackSegment(form.expansion);
  const spaces = form.spaces?.trim() ?? '';
  const elastics = unpackElastics(form.elastics);

  const setIpr = (segment: Segment) => {
    updateField('ipr', packSegment(segment));
  };

  const setExpansion = (segment: Segment) => {
    const packed = packSegment(segment);
    updateField('expansion', packed === 'No' ? 'No expansion' : packed);
  };

  /**
   * Select a single elastic type (radio semantics). Re-packs with
   * whatever the planner has in the notes field. Picking "No
   * elastics" silently clears notes too — they're meaningless when
   * the case has no elastics planned.
   */
  const setElasticType = (type: ElasticType) => {
    if (type === 'No elastics') {
      updateField('elastics', 'No elastics');
      return;
    }
    updateField('elastics', packElastics(type, elastics.notes));
  };

  const setElasticsNotes = (notes: string) => {
    updateField('elastics', packElastics(elastics.type, notes));
  };

  return (
    <div className="space-y-6">
      {/* Anteroposterior text input REMOVED — duplicate of the
          "A-P relationship" radio in step 4 (Treatment).

          Every form field below uses the SAME pattern: a `<fieldset>`
          card with a `<legend>` heading, a one-line muted description,
          and a grid of OptionPill radios. The clinical team wanted a
          balanced, consistent layout across IPR / Expansion / Spaces
          / Elastics / Open bite / Midline / Bite ramps / Crossbite —
          so they're all rendered the same way, with grid-column counts
          chosen per option count to keep the pills aligned within each
          card. */}

      {/* ─── Elastics ───────────────────────────────────────────────────
          Single-select (radio) — clinical team asked for one elastic
          configuration per case. Multi-elastic cases capture the
          secondary type in the notes field. */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Elastics</legend>
        <p className="text-xs text-muted-foreground">
          Pick the primary elastic configuration. Use the notes field for
          wear time, hook positions or a secondary type if more than one
          is needed.
        </p>
        <div
          role="radiogroup"
          aria-label="Elastic type"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {elasticTypeOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={elastics.type === opt}
              disabled={disabled}
              label={opt}
              onClick={() => setElasticType(opt)}
            />
          ))}
        </div>
        <TextInput
          label="Notes (optional)"
          value={elastics.notes}
          placeholder="e.g. Full-time wear; upper canine → lower first molar"
          icon={<Info className="h-4 w-4" />}
          disabled={disabled || elastics.type === 'No elastics'}
          onChange={setElasticsNotes}
        />
      </fieldset>

      {/* ─── Open bite ────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Open bite</legend>
        <p className="text-xs text-muted-foreground">
          What should happen to the open bite during treatment?
        </p>
        <div
          role="radiogroup"
          aria-label="Open bite"
          className="grid gap-2 sm:grid-cols-3"
        >
          {openBiteOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={form.openBite === opt}
              disabled={disabled}
              label={opt}
              onClick={() => updateField('openBite', opt)}
            />
          ))}
        </div>
      </fieldset>

      {/* ─── Midline ──────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Midline</legend>
        <p className="text-xs text-muted-foreground">
          Should the dental midline be maintained or corrected?
        </p>
        <div
          role="radiogroup"
          aria-label="Midline"
          className="grid gap-2 sm:grid-cols-2"
        >
          {midlineOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={form.midline === opt}
              disabled={disabled}
              label={opt}
              onClick={() => updateField('midline', opt)}
            />
          ))}
        </div>
      </fieldset>

      {/* ─── IPR ────────────────────────────────────────────────────────
          The "No priority / Anterior priority / Posterior priority"
          sub-radio that used to appear when "Both" was selected has
          been removed at the clinical team's request — they decide
          ordering at the chair, not on the form. */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">IPR</legend>
        <p className="text-xs text-muted-foreground">
          Pick where interproximal reduction is allowed.
        </p>
        <div
          role="radiogroup"
          aria-label="IPR segment"
          className="grid gap-2 sm:grid-cols-4"
        >
          {segmentOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={iprSegment === opt}
              disabled={disabled}
              label={opt === 'No' ? 'No IPR' : opt}
              onClick={() => setIpr(opt)}
            />
          ))}
        </div>
      </fieldset>

      {/* ─── Bite ramps ─────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Bite ramps</legend>
        <p className="text-xs text-muted-foreground">
          Where should the planner place bite ramps, if any?
        </p>
        <div
          role="radiogroup"
          aria-label="Bite ramps"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {biteRampOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={form.biteRamps === opt}
              disabled={disabled}
              label={opt}
              onClick={() => updateField('biteRamps', opt)}
            />
          ))}
        </div>
      </fieldset>

      {/* ─── Expansion ──────────────────────────────────────────────────
          Same removal as IPR above — no anterior / posterior priority
          when "Both" is selected. */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Expansion</legend>
        <p className="text-xs text-muted-foreground">
          Select the segment that needs expansion, or "No expansion" if
          the arches are well-developed.
        </p>
        <div
          role="radiogroup"
          aria-label="Expansion segment"
          className="grid gap-2 sm:grid-cols-4"
        >
          {expansionOptions.map((opt) => {
            const norm: Segment = opt === 'No expansion' ? 'No' : opt;
            return (
              <OptionPill
                key={opt}
                active={expansionSegment === norm}
                disabled={disabled}
                label={opt}
                onClick={() => setExpansion(norm)}
              />
            );
          })}
        </div>
      </fieldset>

      {/* ─── Crossbite ─────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Crossbite</legend>
        <p className="text-xs text-muted-foreground">
          What should happen to any present crossbite?
        </p>
        <div
          role="radiogroup"
          aria-label="Crossbite"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {crossbiteOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={form.crossbite === opt}
              disabled={disabled}
              label={opt}
              onClick={() => updateField('crossbite', opt)}
            />
          ))}
        </div>
      </fieldset>

      {/* ─── Spaces — single source of truth ────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Spaces</legend>
        <p className="text-xs text-muted-foreground">
          Close existing spaces or maintain them for future restorative
          work? Add detail in the notes field below.
        </p>
        <div
          role="radiogroup"
          aria-label="Spaces"
          className="grid gap-2 sm:grid-cols-2"
        >
          {spacesOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={spaces.startsWith(opt)}
              disabled={disabled}
              label={opt}
              onClick={() => updateField('spaces', opt)}
            />
          ))}
        </div>
        <TextAreaField
          label="Notes (optional)"
          compact
          value={
            spaces && !spacesOptions.some((o) => spaces === o)
              ? spaces.replace(
                  new RegExp(`^(${spacesOptions.join('|')})\\s*[—-]?\\s*`),
                  '',
                )
              : ''
          }
          placeholder="e.g. Close upper midline diastema; maintain space at #15 for future implant"
          disabled={disabled}
          onChange={(detail) => {
            const base = spacesOptions.find((o) => spaces.startsWith(o)) ?? '';
            const trimmed = detail.trim();
            updateField(
              'spaces',
              trimmed ? `${base ? `${base} — ` : ''}${trimmed}` : base,
            );
          }}
        />
      </fieldset>

      <TextInput
        label="Extractions"
        value={form.extractions ?? ''}
        placeholder="e.g. UR4 and UL4 (FDI 14, 24); confirmed with patient"
        icon={<Info className="h-4 w-4" />}
        disabled={disabled}
        onChange={(value) => updateField('extractions', value)}
      />
    </div>
  );
}

function ManufacturingStep({
  form,
  disabled,
  updateField,
}: {
  form: CreateOrderDto;
  disabled?: boolean;
  updateField: <K extends keyof CreateOrderDto>(key: K, value: CreateOrderDto[K]) => void;
}) {
  const deliveryDate = deliveryDateFromInstructions(form.additionalInstructions ?? '');

  return (
    <div className="space-y-6">
      <TextInput
        label="Special Instructions"
        value={form.specialInstructions ?? ''}
        placeholder="Add special clinical or lab instructions..."
        disabled={disabled}
        onChange={(value) => updateField('specialInstructions', value)}
      />

      <ToggleTile
        label="USE CBCT WITH SCANS"
        checked={!!form.useCbctWithScans}
        disabled={disabled}
        onCheckedChange={(value) => updateField('useCbctWithScans', value)}
      />

      <SectionDivider title="MANUFACTURE" />

      <div className="rounded-md border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        If you want manufacturing, select this option.
      </div>

      <ToggleTile
        label="You want Manufacturing"
        checked={!!form.wantsManufacturing}
        disabled={disabled}
        onCheckedChange={(value) => updateField('wantsManufacturing', value)}
      />

      <RadioGroupField
        label="MATERIALS"
        value={(form.materials ?? [])[0] ?? ''}
        options={materialOptions}
        disabled={disabled}
        onChange={(value) => {
          updateField('materials', value === 'NO MANUFACTURING' ? [] : [value]);
          updateField('wantsManufacturing', value !== 'NO MANUFACTURING');
        }}
      />

      <TextInput
        label="Delivery Date"
        value={deliveryDate}
        type="date"
        icon={<CalendarDays className="h-4 w-4" />}
        disabled={disabled}
        onChange={(value) =>
          updateField(
            'additionalInstructions',
            withDeliveryDate(form.additionalInstructions ?? '', value),
          )
        }
      />

      <TextAreaField
        label="Additional Instructions"
        value={removeDeliveryDateLine(form.additionalInstructions ?? '')}
        placeholder="Add final case notes..."
        disabled={disabled}
        onChange={(value) =>
          updateField('additionalInstructions', withDeliveryDate(value, deliveryDate))
        }
      />
    </div>
  );
}

/**
 * Step 6 — Review & submit.
 *
 * Layout MIRRORS /dashboard/orders/[id] one-to-one: same Section + Info
 * helpers, same column counts, same field order. The planner sees the
 * order exactly as it will read on the detail page once submitted, so
 * there are no surprises after the click. Sections rendered:
 *
 *   1. Patient information      (Section icon=UserRound)
 *   2. Treatment plan + clinical objective  (icon=Target)
 *   3. Tooth-level instructions + movement plan  (icon=ListChecks)
 *      – read-only odontogram + the eight mechanics fields from step 5
 *   4. Order metadata           (icon=ClipboardCheck)
 *
 * Files (patient images + radiography + STL) are rendered by the
 * <OrderFileUpload readOnly /> block in the parent wizard render so
 * they appear AFTER this component — keeps file management UI in one
 * place and avoids double-rendering the upload grid.
 */
function ReviewStep({
  savedOrder,
  selectedPatient,
  newPatient,
  selectedDentist,
  fallbackDentistName,
  form,
  toothInstructions,
}: {
  savedOrder?: DentalOrder;
  selectedPatient?: Patient;
  /** Inline new-patient draft when the planner is creating a patient on this order. */
  newPatient: NewPatientDraft | null;
  selectedDentist?: { id: string; fullName: string };
  /** Used when no specific dentist was picked (dentist creating their own order). */
  fallbackDentistName: string | null;
  form: CreateOrderDto;
  toothInstructions: ToothInstruction[];
}) {
  // Resolve patient demographics from whichever source is populated.
  // `selectedPatient` wins when the planner picked an existing record;
  // `newPatient` fills in for the inline-create flow before the draft
  // is saved (savedOrder.patient won't yet exist for unsaved drafts).
  const patientName =
    selectedPatient?.fullName ??
    savedOrder?.patient?.fullName ??
    newPatient?.fullName ??
    null;
  const patientEmail =
    selectedPatient?.email ?? savedOrder?.patient?.email ?? newPatient?.email ?? null;
  const patientPhone =
    selectedPatient?.phone ?? savedOrder?.patient?.phone ?? newPatient?.phone ?? null;
  const patientGender =
    selectedPatient?.gender ?? newPatient?.gender ?? undefined;
  const patientDob =
    selectedPatient?.dateOfBirth ?? newPatient?.dateOfBirth ?? null;
  const patientAddress =
    selectedPatient?.address ?? newPatient?.address ?? null;
  const patientNotes =
    selectedPatient?.notes ?? newPatient?.notes ?? null;
  const patientClinicalConditions =
    selectedPatient?.clinicalConditions ??
    newPatient?.clinicalConditions ??
    [];
  const patientClinicalConditionsOther =
    selectedPatient?.clinicalConditionsOther ??
    newPatient?.clinicalConditionsOther ??
    '';
  const dentistName =
    selectedDentist?.fullName ?? fallbackDentistName ?? null;

  // Build the IPR map for the read-only odontogram — same logic as the
  // detail page, so the purple bars show where the planner placed IPR.
  const iprValues = useMemo(() => {
    const map = new Map<number, string>();
    for (const i of toothInstructions) {
      if (i.type === 'ipr_value' && i.value && i.value.trim().length > 0) {
        map.set(i.toothNumber, i.value);
      }
    }
    return map;
  }, [toothInstructions]);

  const conditionsValue = formatClinicalConditions(
    patientClinicalConditions,
    patientClinicalConditionsOther,
  );

  return (
    <div className="space-y-6">
      {/* ─── 1 · Patient information ─────────────────────────────── */}
      <ReviewSection icon={UserRound} title="Patient information">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ReviewInfo label="Patient" value={patientName} />
          <ReviewInfo label="Dentist" value={dentistName} />
          <ReviewInfo label="Patient stage" value={form.patientStage} />
          <ReviewInfo label="Sex" value={reviewGenderLabel(patientGender)} />
          <ReviewInfo label="Date of birth" value={reviewFormatBirthDate(patientDob)} />
          <ReviewInfo label="Age" value={reviewAgeFromDob(patientDob)} />
          <ReviewInfo label="Patient email" value={patientEmail} />
          <ReviewInfo label="Patient phone" value={patientPhone} />
          <ReviewInfo label="Arch treatment" value={form.archTreatment} />
          {patientAddress && (
            <ReviewInfo label="Address" value={patientAddress} wide />
          )}
          {patientNotes && (
            <ReviewInfo label="Patient notes" value={patientNotes} wide />
          )}
          {conditionsValue && (
            <ReviewInfo
              label="Clinical conditions / reason"
              value={conditionsValue}
              wide
            />
          )}
        </div>
      </ReviewSection>

      {/* ─── 2 · Treatment plan & clinical objective ─────────────── */}
      <ReviewSection icon={Target} title="Treatment plan & clinical objective">
        <div className="grid gap-4 sm:grid-cols-2">
          <ReviewInfo
            label="Chief complaint"
            value={form.chiefComplaint}
            wide
          />
          <ReviewInfo
            label="Treatment plan"
            value={form.treatmentPlan}
            wide
          />
          <ReviewInfo label="A-P relationship" value={form.apRelationship} />
        </div>
      </ReviewSection>

      {/* ─── 3 · Movement plan + odontogram ──────────────────────── */}
      <ReviewSection
        icon={ListChecks}
        title="Tooth-level instructions & movement plan"
      >
        <div className="space-y-8">
          <OdontogramSelector
            value={toothInstructions}
            onChange={() => undefined}
            disabled
            iprValues={iprValues}
          />

          <div className="border-t pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ReviewInfo label="Elastics" value={form.elastics} wide />
              <ReviewInfo label="Open bite" value={form.openBite} />
              <ReviewInfo label="Midline" value={form.midline} />
              <ReviewInfo label="IPR" value={form.ipr} />
              <ReviewInfo label="Bite ramps" value={form.biteRamps} />
              <ReviewInfo
                label="Expansion"
                value={form.expansion ?? 'No expansion'}
              />
              <ReviewInfo label="Crossbite" value={form.crossbite} />
              <ReviewInfo label="Spaces" value={form.spaces} wide />
              <ReviewInfo label="Extractions" value={form.extractions} wide />
            </div>
          </div>

          {(form.specialInstructions || form.additionalInstructions) && (
            <div className="border-t pt-6">
              <div className="grid gap-4">
                <ReviewInfo
                  label="Special instructions"
                  value={form.specialInstructions}
                  wide
                />
                <ReviewInfo
                  label="Additional notes"
                  value={form.additionalInstructions}
                  wide
                />
              </div>
            </div>
          )}
        </div>
      </ReviewSection>

      {/* ─── 4 · Order metadata ──────────────────────────────────── */}
      <ReviewSection icon={ClipboardCheck} title="Order metadata">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReviewInfo
            label="CBCT requested"
            value={form.useCbctWithScans ? 'Yes' : 'No'}
          />
          <ReviewInfo
            label="Manufacturing"
            value={form.wantsManufacturing ? 'Requested' : 'Not requested'}
          />
          <ReviewInfo
            label="Materials"
            value={
              (form.materials ?? []).filter(Boolean).join(', ') || 'Not set'
            }
          />
          <ReviewInfo
            label="Order code"
            value={savedOrder?.orderCode ?? 'Draft not saved'}
          />
          <ReviewInfo
            label="Status"
            value={savedOrder?.status ?? OrderStatus.DRAFT}
          />
        </div>
      </ReviewSection>
    </div>
  );
}

// ─── Review-step layout helpers ────────────────────────────────────
// Intentional duplicates of <Section>/<Info> from /dashboard/orders/[id]
// so the wizard's final step LOOKS like the order detail page the
// planner / doctor will land on after submit. Kept local to avoid a
// circular import — the detail page lives in an app/ route and the
// wizard lives in components/, so we keep the helpers next to their
// only caller here. If the detail page ever shifts to a shared
// component, swap in via a single import line.

function ReviewSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Target;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <header className="flex items-center gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
      </header>
      <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </section>
  );
}

function ReviewInfo({
  label,
  value,
  wide,
}: {
  label: string;
  value?: string | null;
  wide?: boolean;
}) {
  const safeValue =
    typeof value === 'string' && value.trim().length > 0 ? value : '—';
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-3' : undefined}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-foreground">
        {safeValue}
      </p>
    </div>
  );
}

function reviewGenderLabel(gender?: Gender | string | null): string | undefined {
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

function reviewFormatBirthDate(dob?: string | null): string | undefined {
  if (!dob) return undefined;
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return undefined;
  // Matches the locale-friendly format on the detail page.
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * "32 yrs" / "2 yrs 4 mo" — same granularity as the detail page so the
 * planner sees identical age formatting between this preview and the
 * permanent record.
 */
function reviewAgeFromDob(dob?: string | null): string | undefined {
  if (!dob) return undefined;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return undefined;
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return undefined;
  if (years >= 3) return `${years} yrs`;
  if (years === 0) {
    if (months <= 1) return 'Less than 2 months';
    return `${months} mo`;
  }
  return `${years} yrs${months ? ` ${months} mo` : ''}`;
}

/**
 * Stitch the clinical-condition checkboxes + the "Other" free-text into
 * one display string. Empty → undefined so the section row hides.
 */
function formatClinicalConditions(
  conditions: string[] | undefined,
  other: string | undefined,
): string | undefined {
  const list = (conditions ?? []).filter(Boolean);
  const standard = list.filter((c) => c !== 'Other');
  const hasOther = list.includes('Other') && other && other.trim().length > 0;
  const parts: string[] = [];
  if (standard.length > 0) parts.push(standard.join(', '));
  if (hasOther) parts.push(other.trim());
  return parts.length > 0 ? parts.join(' — ') : undefined;
}

function ChoiceCard({
  active,
  title,
  description,
  onClick,
  disabled,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-12 items-start justify-between gap-3 rounded-md border bg-background px-4 py-3 text-left transition hover:border-primary/70 disabled:cursor-not-allowed disabled:opacity-60',
        active && `${BRAND_ACTIVE_BORDER} shadow-sm`,
      )}
    >
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      {active && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  icon,
  error,
  disabled,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  error?: string;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}
        <Input
          type={type}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn('h-11', icon && 'pl-10', error && 'border-red-500')}
        />
      </div>
      <FieldError message={error} />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  error,
  disabled,
  compact,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <textarea
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'w-full rounded-md border border-input bg-background px-3 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
          compact ? 'min-h-24' : 'min-h-28',
          error && 'border-red-500 focus-visible:ring-red-500',
        )}
      />
      <FieldError message={error} />
    </div>
  );
}

function ToggleTile({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex h-full min-h-16 items-center justify-between gap-3 rounded-md border bg-background px-4 py-3">
      <Label className="text-sm font-semibold">{label}</Label>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/**
 * Universal pill-style choice button used by every "pick one" control
 * in the order wizard — Expansion segments, IPR options, treatment-plan
 * stage, A-P relationship, open bite, midline, bite ramps, crossbite,
 * materials, etc. Single source of truth so the form has one look
 * instead of two competing radio aesthetics.
 *
 * When nested inside a parent with role="radiogroup" the pill exposes
 * itself as role="radio" with aria-checked, which gives screen readers
 * the standard radio-button experience (arrow keys to move, space to
 * select). Otherwise it's a plain button.
 */
function OptionPill({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-md border bg-background px-3 text-sm font-semibold transition',
        'hover:border-primary/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-60',
        active && 'border-primary bg-primary/5 text-primary shadow-sm',
      )}
    >
      {label}
    </button>
  );
}

/**
 * Single-choice "radio" rendered as a row of outlined pills — same look
 * as <OptionPill> used in the Expansion / IPR / chief-complaint blocks
 * so every choice in the wizard reads as the same control type. The
 * circle-dot variant we used previously was the only place in the form
 * that diverged from the pill aesthetic and it felt inconsistent.
 *
 * Click semantics are the same as a native radio: pick one, replaces
 * the current value. Disabled / error / label props are unchanged so
 * call sites don't need updating.
 */
function RadioGroupField({
  label,
  value,
  options,
  disabled,
  error,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  disabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => (
          <OptionPill
            key={option}
            label={option}
            active={value === option}
            disabled={disabled}
            onClick={() => onChange(option)}
          />
        ))}
      </div>
      <FieldError message={error} />
    </div>
  );
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-primary/55" />
      <span className="text-base font-medium tracking-[0.18em] text-muted-foreground">
        {title}
      </span>
      <span className="h-px flex-1 bg-primary/55" />
    </div>
  );
}

// ReviewCard removed — replaced by the larger ReviewSection / ReviewInfo
// helpers that mirror the order-detail page layout (see ReviewStep).

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600">{message}</p>;
}

const DELIVERY_DATE_PREFIX = 'Delivery date:';

function deliveryDateFromInstructions(value: string) {
  return (
    value
      .split('\n')
      .find((line) => line.trim().startsWith(DELIVERY_DATE_PREFIX))
      ?.replace(DELIVERY_DATE_PREFIX, '')
      .trim() ?? ''
  );
}

function removeDeliveryDateLine(value: string) {
  return value
    .split('\n')
    .filter((line) => !line.trim().startsWith(DELIVERY_DATE_PREFIX))
    .join('\n')
    .trimStart();
}

function withDeliveryDate(value: string, deliveryDate: string) {
  const cleanValue = removeDeliveryDateLine(value).trim();
  if (!deliveryDate) return cleanValue;
  return [cleanValue, `${DELIVERY_DATE_PREFIX} ${deliveryDate}`]
    .filter(Boolean)
    .join('\n');
}

function stageDescription(stage: PatientStage) {
  if (stage === PatientStage.REFINEMENT) return 'Correction or continuation.';
  if (stage === PatientStage.RETAINER) return 'Retention after treatment.';
  return 'First aligner case.';
}
