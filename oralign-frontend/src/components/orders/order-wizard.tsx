'use client';

import { useState } from 'react';
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
import { OdontogramSelector } from '@/components/orders/odontogram-selector';
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
    title: 'Movement',
    heading: 'Movement, bite, and space instructions',
    description:
      'Document AP relationship, elastics, open bite, midline, IPR, bite ramps, crossbite, spaces, and extractions.',
    icon: ShieldCheck,
  },
  {
    title: 'Odontogram',
    heading: 'Odontogram: Select tooth-level instructions',
    description:
      'Mark teeth that need no attachments, no IPR, or should not be moved.',
    icon: ListChecks,
  },
  {
    title: 'Manufacture',
    heading: 'Manufacture and material preferences',
    description:
      'Set CBCT usage, manufacturing request, materials, delivery date, and final notes.',
    icon: Factory,
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

interface NewPatientDraft {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: Gender;
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
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: undefined,
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
      if (!newPatient.firstName.trim()) {
        errors['newPatient.firstName'] = 'First name is required.';
      }
      if (!newPatient.lastName.trim()) {
        errors['newPatient.lastName'] = 'Last name is required.';
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
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return false;
    }

    if (patientMode === 'new' && !form.patientId) {
      const createdPatient = await createPatient.mutateAsync({
        fullName: `${newPatient.firstName.trim()} ${newPatient.lastName.trim()}`,
        dateOfBirth: newPatient.dateOfBirth,
        gender: newPatient.gender,
        notes: newPatient.reason.trim(),
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
          <AdvancedMovementStep
            form={form}
            disabled={!canModify}
            updateField={updateField}
          />
        )}

        {step === 5 && (
          <OdontogramSelector
            value={toothInstructions}
            onChange={setToothInstructions}
            disabled={!canModify}
          />
        )}

        {step === 6 && (
          <ManufacturingStep
            form={form}
            disabled={!canModify}
            updateField={updateField}
          />
        )}

        {step === 7 && (
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
  return (
    <nav className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-center gap-3 px-1">
        {steps.map((step, index) => {
          const active = index === currentStep;
          const complete = index < currentStep;
          return (
            <li key={step.title} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onStepChange(index)}
                className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold"
              >
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border text-xs transition',
                    active && `${BRAND_ACTIVE_BG} border-primary text-primary-foreground shadow-sm`,
                    complete && 'border-primary bg-primary/5 text-primary',
                    !active && !complete && 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className={active ? BRAND_ACTIVE_TEXT : 'text-muted-foreground'}>
                  Step {index + 1}
                </span>
              </button>
              {index < steps.length - 1 && (
                <span className="h-px w-16 bg-border" aria-hidden />
              )}
            </li>
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
        <div className="grid gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <TextInput
              label="First name"
              value={newPatient.firstName}
              placeholder="Enter a first name..."
              icon={<UserRound className="h-4 w-4" />}
              error={errors['newPatient.firstName']}
              disabled={!canModify}
              onChange={(value) => updateNewPatient('firstName', value)}
            />
            <TextInput
              label="Last name"
              value={newPatient.lastName}
              placeholder="Enter the last name..."
              icon={<UserRound className="h-4 w-4" />}
              error={errors['newPatient.lastName']}
              disabled={!canModify}
              onChange={(value) => updateNewPatient('lastName', value)}
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
          </div>
          <TextAreaField
            label="Reason for consultation"
            value={newPatient.reason}
            placeholder="Briefly describe the reason for consultation..."
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
          label="Chief Complain"
          value={form.chiefComplaint ?? ''}
          placeholder="Describe the patient's main concern..."
          error={errors.chiefComplaint}
          disabled={disabled}
          onChange={(value) => updateField('chiefComplaint', value)}
        />
        <TextInput
          label="Treat both arch"
          value={form.treatBothArch ? 'Yes' : ''}
          placeholder="Add treat both arch notes..."
          icon={<Info className="h-4 w-4" />}
          disabled={disabled}
          onChange={(value) => {
            updateField('treatBothArch', value.trim().length > 0);
            if (value.trim().length > 0) {
              updateField('archTreatment', ArchTreatment.BOTH);
            }
          }}
        />
        <RadioGroupField
          label="Treatment plan"
          value={form.treatmentPlan ?? ''}
          options={treatmentPlanOptions}
          disabled={disabled}
          error={errors.treatmentPlan}
          onChange={(value) => updateField('treatmentPlan', value)}
        />
        <TextInput
          label="Don't move"
          value={form.dontMoveOption ?? ''}
          placeholder="Teeth or segments that should not move..."
          icon={<Info className="h-4 w-4" />}
          disabled={disabled}
          onChange={(value) => updateField('dontMoveOption', value)}
        />
        <RadioGroupField
          label="AP Relationship"
          value={form.apRelationship ?? ''}
          options={apRelationshipOptions}
          disabled={disabled}
          onChange={(value) => updateField('apRelationship', value)}
        />
      </div>
    </div>
  );
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
  return (
    <div className="space-y-6">
      <TextInput
        label="Anteroposterior relationship"
        value={form.anteroposteriorRelationship ?? ''}
        placeholder="Add anteroposterior notes..."
        icon={<Info className="h-4 w-4" />}
        disabled={disabled}
        onChange={(value) => updateField('anteroposteriorRelationship', value)}
      />
      <TextInput
        label="Elastics"
        value={form.elastics ?? ''}
        placeholder="Describe elastics protocol..."
        icon={<Info className="h-4 w-4" />}
        disabled={disabled}
        onChange={(value) => updateField('elastics', value)}
      />
      <RadioGroupField
        label="Open Bite"
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
      <TextInput
        label="IPR"
        value={form.ipr ?? ''}
        placeholder="Add IPR instructions..."
        icon={<Info className="h-4 w-4" />}
        disabled={disabled}
        onChange={(value) => updateField('ipr', value)}
      />
      <TextInput
        label="Bite Ramps"
        value={form.biteRamps ?? ''}
        placeholder="Add bite ramp instructions..."
        icon={<Info className="h-4 w-4" />}
        disabled={disabled}
        onChange={(value) => updateField('biteRamps', value)}
      />
      <RadioGroupField
        label="Crossbite"
        value={form.crossbite ?? ''}
        options={crossbiteOptions}
        disabled={disabled}
        onChange={(value) => updateField('crossbite', value)}
      />
      <RadioGroupField
        label="Spaces"
        value={form.spaces?.startsWith('Close all spaces') || form.spaces?.startsWith('Maintain spaces') ? form.spaces : ''}
        options={spacesOptions}
        disabled={disabled}
        onChange={(value) => updateField('spaces', value)}
      />
      <TextInput
        label="Spaces"
        value={form.spaces ?? ''}
        placeholder="Add detailed space instructions..."
        icon={<Info className="h-4 w-4" />}
        disabled={disabled}
        onChange={(value) => updateField('spaces', value)}
      />
      <TextInput
        label="Extractions"
        value={form.extractions ?? ''}
        placeholder="Add extraction instructions..."
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
