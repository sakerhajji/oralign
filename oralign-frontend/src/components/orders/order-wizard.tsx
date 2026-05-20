'use client';

import { Fragment, useState } from 'react';
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
  PatientStage,
  ToothInstruction,
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
  reason: string;
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
    reason: '',
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
      if (!newPatient.reason.trim()) {
        errors['newPatient.reason'] = 'Consultation reason is required.';
      }
      // email + phone + address + notes are OPTIONAL (same as the
      // dedicated patient form).
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return false;
    }

    if (patientMode === 'new' && !form.patientId) {
      // Combine the consultation reason with any free-form notes the
      // planner entered. The dedicated patients form treats `notes` as
      // free-form too, so this stays consistent — and the chief
      // complaint on the order is seeded separately below.
      const combinedNotes = [
        newPatient.notes.trim(),
        newPatient.reason.trim()
          ? `Consultation reason: ${newPatient.reason.trim()}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const createdPatient = await createPatient.mutateAsync({
        fullName: newPatient.fullName.trim(),
        email: newPatient.email.trim() || undefined,
        phone: newPatient.phone.trim() || undefined,
        gender: newPatient.gender,
        dateOfBirth: newPatient.dateOfBirth || undefined,
        address: newPatient.address.trim() || undefined,
        notes: combinedNotes || undefined,
        doctorId: isAdmin ? form.doctorId : undefined,
      });
      setForm((current) => ({
        ...current,
        patientId: createdPatient.id,
        chiefComplaint: current.chiefComplaint || newPatient.reason.trim(),
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

    const draftPayload = {
      ...form,
      patientId,
      chiefComplaint: form.chiefComplaint || newPatient.reason.trim(),
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

    await updateTeeth.mutateAsync({
      id: nextOrder.id,
      instructions: toothInstructions,
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
              selectedPatient={selectedPatient?.fullName ?? savedOrder?.patient?.fullName}
              selectedDentist={
                selectedDentist?.fullName ?? savedOrder?.doctor?.fullName ?? user?.fullName
              }
              form={form}
              toothInstructionCount={toothInstructions.length}
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
          <TextAreaField
            label="Reason for consultation"
            value={newPatient.reason}
            placeholder="Briefly describe why the patient is coming in…"
            error={errors['newPatient.reason']}
            disabled={!canModify}
            onChange={(value) => updateNewPatient('reason', value)}
          />
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
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>Patient stage</Label>
          <div className="grid gap-2 sm:grid-cols-3">
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
        </div>
        <div className="grid gap-2">
          <Label>Arch treatment</Label>
          <div className="grid gap-2 sm:grid-cols-3">
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
        </div>
      </div>

      <div className="grid gap-5">
        <TextInput
          label="Chief complaint"
          value={form.chiefComplaint ?? ''}
          placeholder="Describe the patient's main concern..."
          error={errors.chiefComplaint}
          disabled={disabled}
          onChange={(value) => updateField('chiefComplaint', value)}
        />
        {/* "Treat both arch" text input removed — it was a duplicate of the
            "Both arches" pill above. Choosing the pill already sets the
            boolean. The duplicate text input could leave the radio and the
            boolean out of sync (a real bug). */}
        <RadioGroupField
          label="Treatment plan"
          value={form.treatmentPlan ?? ''}
          options={treatmentPlanOptions}
          disabled={disabled}
          error={errors.treatmentPlan}
          onChange={(value) => updateField('treatmentPlan', value)}
        />
        {/* "Don't move" text removed — the Odontogram's "Do Not Move" colour
            captures this per-tooth in step 5 (the canonical place). */}
        <RadioGroupField
          label="A-P relationship"
          value={form.apRelationship ?? ''}
          options={apRelationshipOptions}
          disabled={disabled}
          onChange={(value) => updateField('apRelationship', value)}
        />
      </div>
    </div>
  );
}

// ─── Structured option tables for the mechanics fields ──────────────────────
// Each control writes a short structured string into the existing free-text
// backend column (e.g. ipr: "Both — anterior priority"). The wizard parses
// the same string back so the radio reflects what was previously chosen.

const segmentOptions = ['No', 'Anterior', 'Posterior', 'Both'] as const;
type Segment = (typeof segmentOptions)[number];

const segmentPriorityOptions = [
  'No priority',
  'Anterior priority',
  'Posterior priority',
] as const;

const biteRampOptions = ['No bite ramps', 'Anterior', 'Canine / cuspid', 'Molar'] as const;
const expansionOptions = ['No expansion', 'Anterior', 'Posterior', 'Both'] as const;

/** Pack a "segment + priority" pair into the saved string. */
function packSegment(segment: Segment, priority: string): string {
  if (segment === 'No') return 'No';
  if (segment === 'Both' && priority && priority !== 'No priority') {
    return `Both — ${priority.toLowerCase()}`;
  }
  return segment;
}

/** Recover the segment + priority from a saved string. */
function unpackSegment(value: string | undefined): {
  segment: Segment;
  priority: string;
} {
  const raw = (value ?? '').trim();
  if (!raw || raw === 'No' || /^no\b/i.test(raw)) return { segment: 'No', priority: 'No priority' };
  if (/^anterior/i.test(raw)) return { segment: 'Anterior', priority: 'No priority' };
  if (/^posterior/i.test(raw)) return { segment: 'Posterior', priority: 'No priority' };
  if (/^both/i.test(raw)) {
    if (/anterior/i.test(raw)) return { segment: 'Both', priority: 'Anterior priority' };
    if (/posterior/i.test(raw)) return { segment: 'Both', priority: 'Posterior priority' };
    return { segment: 'Both', priority: 'No priority' };
  }
  return { segment: 'No', priority: 'No priority' };
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
  // Decode the current saved strings into structured UI state.
  const ipr = unpackSegment(form.ipr);
  const expansion = unpackSegment(form.expansion);
  const spaces = form.spaces?.trim() ?? '';

  const setIpr = (segment: Segment, priority?: string) => {
    const next = packSegment(segment, priority ?? ipr.priority);
    updateField('ipr', next);
  };

  const setExpansion = (segment: Segment, priority?: string) => {
    const next = packSegment(segment, priority ?? expansion.priority);
    updateField('expansion', next === 'No' ? 'No expansion' : next);
  };

  return (
    <div className="space-y-6">
      {/* Anteroposterior text input REMOVED — duplicate of the
          "A-P relationship" radio in step 4 (Treatment). */}

      <TextInput
        label="Elastics"
        value={form.elastics ?? ''}
        placeholder="e.g. Class II elastics from upper canine to lower first molar, full-time"
        icon={<Info className="h-4 w-4" />}
        disabled={disabled}
        onChange={(value) => updateField('elastics', value)}
      />

      <RadioGroupField
        label="Open bite"
        value={form.openBite ?? ''}
        options={openBiteOptions}
        disabled={disabled}
        onChange={(value) => updateField('openBite', value)}
      />

      <RadioGroupField
        label="Midline"
        value={form.midline ?? ''}
        options={midlineOptions}
        disabled={disabled}
        onChange={(value) => updateField('midline', value)}
      />

      {/* ─── IPR ────────────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">IPR</legend>
        <p className="text-xs text-muted-foreground">
          Pick where interproximal reduction is allowed. "Both" reveals an
          optional priority — leave it on "No priority" if either segment
          may be done first.
        </p>
        <div className="grid gap-2 sm:grid-cols-4">
          {segmentOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={ipr.segment === opt}
              disabled={disabled}
              label={opt === 'No' ? 'No IPR' : opt}
              onClick={() => setIpr(opt)}
            />
          ))}
        </div>
        {ipr.segment === 'Both' && (
          <div className="grid gap-2 sm:grid-cols-3">
            {segmentPriorityOptions.map((p) => (
              <OptionPill
                key={p}
                active={ipr.priority === p}
                disabled={disabled}
                label={p}
                onClick={() => setIpr('Both', p)}
              />
            ))}
          </div>
        )}
      </fieldset>

      {/* ─── Bite ramps ─────────────────────────────────────────────────── */}
      <RadioGroupField
        label="Bite ramps"
        value={form.biteRamps ?? ''}
        options={biteRampOptions}
        disabled={disabled}
        onChange={(value) => updateField('biteRamps', value)}
      />

      {/* ─── Expansion ──────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Expansion</legend>
        <p className="text-xs text-muted-foreground">
          Select the segment that needs expansion, or "No expansion" if the
          arches are well-developed. "Both" reveals an optional priority.
        </p>
        <div className="grid gap-2 sm:grid-cols-4">
          {expansionOptions.map((opt) => {
            const norm: Segment = opt === 'No expansion' ? 'No' : opt;
            return (
              <OptionPill
                key={opt}
                active={expansion.segment === norm}
                disabled={disabled}
                label={opt}
                onClick={() => setExpansion(norm)}
              />
            );
          })}
        </div>
        {expansion.segment === 'Both' && (
          <div className="grid gap-2 sm:grid-cols-3">
            {segmentPriorityOptions.map((p) => (
              <OptionPill
                key={p}
                active={expansion.priority === p}
                disabled={disabled}
                label={p}
                onClick={() => setExpansion('Both', p)}
              />
            ))}
          </div>
        )}
      </fieldset>

      <RadioGroupField
        label="Crossbite"
        value={form.crossbite ?? ''}
        options={crossbiteOptions}
        disabled={disabled}
        onChange={(value) => updateField('crossbite', value)}
      />

      {/* ─── Spaces — single source of truth ────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">Spaces</legend>
        <div className="grid gap-2 sm:grid-cols-2">
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

function ReviewStep({
  savedOrder,
  selectedPatient,
  selectedDentist,
  form,
  toothInstructionCount,
}: {
  savedOrder?: DentalOrder;
  selectedPatient?: string;
  selectedDentist?: string;
  form: CreateOrderDto;
  toothInstructionCount: number;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <ReviewCard label="Order" value={savedOrder?.orderCode ?? 'Draft not saved'} />
      <ReviewCard label="Patient" value={selectedPatient ?? 'Not selected'} />
      <ReviewCard label="Dentist" value={selectedDentist ?? 'Current dentist'} />
      <ReviewCard label="Status" value={savedOrder?.status ?? OrderStatus.DRAFT} />
      <ReviewCard label="Stage" value={form.patientStage ?? 'Not set'} />
      <ReviewCard label="Arch" value={form.archTreatment ?? 'Not set'} />
      <ReviewCard label="Tooth rules" value={`${toothInstructionCount} selected`} />
      <ReviewCard
        label="Manufacturing"
        value={form.wantsManufacturing ? 'Requested' : 'Not requested'}
      />
    </div>
  );
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
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-md border bg-background px-3 text-sm font-semibold transition hover:border-primary/70 disabled:cursor-not-allowed disabled:opacity-60',
        active && 'border-primary bg-primary/5 text-primary',
      )}
    >
      {label}
    </button>
  );
}

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
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-x-4 gap-y-3">
        {options.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option)}
              className="inline-flex min-h-8 items-center gap-2 text-left text-sm text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                className={cn(
                  'grid h-5 w-5 place-items-center rounded-full border',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-input bg-background',
                )}
              >
                {active && <span className="h-2 w-2 rounded-full bg-current" />}
              </span>
              <span className={active ? 'font-medium text-foreground' : ''}>
                {option}
              </span>
            </button>
          );
        })}
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

function ReviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}

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
