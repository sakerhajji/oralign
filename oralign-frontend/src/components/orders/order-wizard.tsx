'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
  Info,
  ListChecks,
  Lock,
  Phone,
  Save,
  ScanLine,
  Search,
  Send,
  Target,
  UserRound,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

// Stable no-op for the read-only odontogram on the review step — an inline
// `() => undefined` would break the selector's memo boundary every render.
const NOOP_TOOTH_CHANGE = () => undefined;
import {
  ClinicalOrderFiles,
} from '@/components/orders/order-file-upload';
import { TreatmentFeePaymentDialog } from '@/components/orders/treatment-fee-payment-dialog';
import { ClinicalConditionsField } from '@/components/patients/clinical-conditions-field';
import { PatientProfilePhotoField } from '@/components/patients/patient-profile-photo-field';
import { useAuth } from '@/lib/providers/auth-provider';
import { useT } from '@/lib/i18n/lang-context';
import { patientsService } from '@/lib/api';
import {
  patientKeys,
  useCreateOrder,
  useCreatePatient,
  useDentistOptions,
  useUploadPatientProfilePhoto,
  useSubmitOrder,
  useUpdateOrder,
  useUpdateToothInstructions,
} from '@/lib/hooks';
import { useBillingPublicDefaults } from '@/lib/hooks/use-company-billing';
import { formatPrice } from '@/lib/utils/currency';
import {
  ArchTreatment,
  CLINICAL_CONDITION_OPTIONS,
  CLINICAL_CONDITION_OTHER,
  CreateOrderDto,
  DentalOrder,
  Gender,
  OrderStatus,
  Patient,
  PatientFilterParams,
  PatientStage,
  ToothInstruction,
  ToothInstructionType,
} from '@/lib/types';
import {
  packChiefComplaint,
  unpackChiefComplaint,
  formatChiefComplaint,
} from '@/lib/chief-complaint';
import { createOrderSchema } from '@/lib/schemas';
import { cn } from '@/lib/utils';

const BRAND_ACTIVE_BORDER = 'border-primary';

/**
 * Static step blueprint. Strings live in the i18n dictionary; this
 * array only holds the dict KEYS so changing the active language flips
 * the wizard copy without re-creating the array (icons + ordering are
 * the only constants that need to live at module scope).
 */
const steps = [
  {
    titleKey: 'orderForm.steps.patient',
    headingKey: 'orderForm.patient.sectionTitle',
    descriptionKey: 'orderForm.patient.sectionHint',
    icon: UserRound,
  },
  {
    titleKey: 'orderForm.steps.images',
    headingKey: 'orderForm.files.images.title',
    descriptionKey: 'orderForm.files.images.hint',
    icon: Camera,
  },
  {
    titleKey: 'orderForm.steps.radiography',
    headingKey: 'orderForm.files.radiography.title',
    descriptionKey: 'orderForm.files.radiography.hint',
    icon: ScanLine,
  },
  {
    titleKey: 'orderForm.steps.treatment',
    headingKey: 'orderForm.steps.treatment',
    descriptionKey: 'orderForm.treatment.chiefComplaintPh',
    icon: Target,
  },
  {
    // Combined "Odontogram + Movement" step. Tooth-level instructions are
    // shown FIRST (primary clinical task), with the AP/elastics/bite/IPR
    // controls underneath. Manufacturing has been dropped from the wizard.
    titleKey: 'orderForm.steps.advanced',
    headingKey: 'orderForm.advanced.sectionTitle',
    descriptionKey: 'orderForm.advanced.sectionHint',
    icon: ListChecks,
  },
  {
    titleKey: 'orderForm.steps.review',
    headingKey: 'orderForm.review.sectionTitle',
    descriptionKey: 'orderForm.review.sectionHint',
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
  profilePhoto: File | null;
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
  // Configured CBCT paid supplement (doctor-safe public-defaults read).
  // Null when the option is disabled or priced at 0 — the CBCT toggle
  // then behaves exactly as before (free).
  const { data: billingDefaults } = useBillingPublicDefaults();
  const cbctSupplement =
    billingDefaults?.cbctSupplementEnabled &&
    (billingDefaults?.cbctSupplementFee ?? 0) > 0
      ? {
          fee: billingDefaults.cbctSupplementFee,
          currency: billingDefaults.defaultCurrency ?? 'TND',
          baseFee: billingDefaults.defaultTreatmentFee ?? 0,
        }
      : null;
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [patientMode, setPatientMode] = useState<PatientMode>('existing');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // After Submit succeeds we open the treatment-fee dialog instead of
  // navigating away immediately. The dialog handles the pay flow and
  // pushes the user to /dashboard/orders/[id] on success/skip.
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);
  // Doctor's acceptance of the General Terms & Conditions — required to
  // submit (checkbox on the final review step; the backend also enforces).
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Final self-verification the doctor must tick before submit (that the
  // order's info / files / images are complete, correct and compliant).
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [savedOrder, setSavedOrder] = useState<DentalOrder | undefined>(
    initialOrder,
  );
  const [toothInstructions, setToothInstructions] = useState<ToothInstruction[]>(
    initialOrder?.toothInstructions ?? [],
  );
  const [newPatient, setNewPatient] = useState<NewPatientDraft>({
    fullName: '',
    profilePhoto: null,
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
  const uploadPatientProfilePhoto = useUploadPatientProfilePhoto();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const updateTeeth = useUpdateToothInstructions();
  const submitOrder = useSubmitOrder();

  // Dedup guard for inline new-patient creation. A single "Continue"
  // click calls ensurePatientReady() twice (validateCurrentStep then
  // saveDraft), and setForm({ patientId }) only commits next render —
  // so we cache the in-flight POST here to guarantee exactly one
  // patient is created per planner action.
  const newPatientPromiseRef = useRef<Promise<string> | null>(null);

  const dentistsQuery = useDentistOptions({ limit: 100, enabled: isAdmin });

  const patientParams: PatientFilterParams = {
    page: 1,
    limit: 100,
    ...(isAdmin && form.doctorId ? { doctorId: form.doctorId } : {}),
  };
  const patientsQuery = useQuery({
    // Use the shared `patientKeys` cache (not a private 'order-patients'
    // key) so creating a patient — on the /dashboard/patients page OR
    // inline in this wizard — invalidates this list too. Previously the
    // new patient only appeared after a hard refresh.
    queryKey: patientKeys.list(patientParams),
    queryFn: () => patientsService.getPatients(patientParams),
    enabled: isDentist || (isAdmin && !!form.doctorId),
    // Belt-and-suspenders: always refetch when the wizard mounts so a
    // just-created patient is present immediately, even if a fresh-but-
    // stale list happens to be cached.
    refetchOnMount: 'always',
  });

  const selectedPatient = patientsQuery.data?.data.find(
    (patient) => patient.id === form.patientId,
  );
  const selectedDentist = dentistsQuery.data?.data.find(
    (doctor) => doctor.id === form.doctorId,
  );
  const activeStep = steps[step];
  const ActiveIcon = activeStep.icon;

  // ── Chief complaint (order "Reason for consultation") ──────────────
  // Edited as a checkbox multi-select (shared CLINICAL_CONDITION_OPTIONS)
  // + an optional "Other" free-text. The order still stores ONE string
  // (`form.chiefComplaint`) — we pack/unpack around it so no backend
  // schema change is needed, and it stays SEPARATE from the patient's
  // own clinicalConditions (editing here never rewrites the patient).
  const [chiefConditions, setChiefConditions] = useState<string[]>(
    () => unpackChiefComplaint(initialOrder?.chiefComplaint).conditions,
  );
  const [chiefOther, setChiefOther] = useState<string>(
    () => unpackChiefComplaint(initialOrder?.chiefComplaint).other,
  );
  // Once the planner touches the chief-complaint field we stop auto-
  // mirroring the patient's reasons into it (their edit wins).
  const chiefTouchedRef = useRef(false);
  // Track which existing patient we've already seeded from, so switching
  // patients re-seeds but re-renders don't clobber edits.
  const seededPatientRef = useRef<string | null>(null);

  const handleChiefConditions = (next: string[]) => {
    chiefTouchedRef.current = true;
    setChiefConditions(next);
    updateField('chiefComplaint', packChiefComplaint(next, chiefOther));
  };
  const handleChiefOther = (next: string) => {
    chiefTouchedRef.current = true;
    setChiefOther(next);
    updateField('chiefComplaint', packChiefComplaint(chiefConditions, next));
  };

  // Seed the chief complaint from the chosen EXISTING patient's reasons
  // (once per patient, and only while untouched). Never runs when editing
  // an existing order — that already carries its own saved value.
  useEffect(() => {
    if (initialOrder) return;
    if (patientMode !== 'existing') return;
    const pid = form.patientId;
    if (!pid || seededPatientRef.current === pid) return;
    if (!selectedPatient) return;
    if (chiefTouchedRef.current) return;
    seededPatientRef.current = pid;
    const conds = CLINICAL_CONDITION_OPTIONS.filter(
      (o) =>
        o !== CLINICAL_CONDITION_OTHER &&
        (selectedPatient.clinicalConditions ?? []).includes(o),
    );
    const other = (selectedPatient.clinicalConditionsOther ?? '').trim();
    const ordered = other ? [...conds, CLINICAL_CONDITION_OTHER] : conds;
    setChiefConditions(ordered);
    setChiefOther(other);
    updateField('chiefComplaint', packChiefComplaint(ordered, other));
    // updateField is intentionally omitted — it's stable enough and the
    // seededPatientRef guard makes re-runs no-ops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.patientId, patientMode, selectedPatient, initialOrder]);

  // Mirror the NEW-patient conditions (entered in step 1) into the chief
  // complaint until the planner overrides it — preserves the previous
  // "reason auto-fills from conditions" behaviour for new patients.
  useEffect(() => {
    if (initialOrder) return;
    if (patientMode !== 'new') return;
    if (chiefTouchedRef.current) return;
    const conds = CLINICAL_CONDITION_OPTIONS.filter((o) =>
      newPatient.clinicalConditions.includes(o),
    );
    const other = newPatient.clinicalConditionsOther.trim();
    setChiefConditions(conds);
    setChiefOther(other);
    updateField('chiefComplaint', packChiefComplaint(conds, other));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    patientMode,
    newPatient.clinicalConditions,
    newPatient.clinicalConditionsOther,
    initialOrder,
  ]);
  // Once the treatment fee is paid, the owning doctor can no longer edit
  // the order — only an admin can. Mirrors the backend guard
  // (ensureOrderNotLockedByPayment). Admins are never locked.
  const paidLocked = !!savedOrder?.treatmentFeePaidAt && !isAdmin;
  const canModify = !paidLocked;
  const isDraftForSubmit = !savedOrder || savedOrder.status === OrderStatus.DRAFT;
  // The General T&C box must be checked before submit is allowed. Only
  // shown/required on the final review step for a draft order.
  const canSubmit = isDraftForSubmit && termsAccepted && reviewConfirmed;
  const isSaving =
    createPatient.isPending ||
    uploadPatientProfilePhoto.isPending ||
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
      // A single "Continue" click runs validateCurrentStep() AND then
      // saveDraft(), and both call ensurePatientReady(). Because the
      // setForm({ patientId }) below only commits on the next render,
      // the second call still sees an empty form.patientId — so without
      // a guard the patient is POSTed twice and the backend (correctly)
      // rejects the second as a duplicate, producing the "created" +
      // "already exists" double toast. Cache the in-flight creation so
      // every caller within the same click awaits the SAME request.
      let pending = newPatientPromiseRef.current;
      if (!pending) {
        // Strip the "Other" detail when "Other" isn't selected so we
        // never persist orphan text. Empty arrays become `undefined`
        // on the wire so the backend's PATCH semantics also work.
        const conditions = newPatient.clinicalConditions.filter(Boolean);
        const otherSelected = conditions.includes('Other');
        const otherDetail = otherSelected
          ? newPatient.clinicalConditionsOther.trim() || undefined
          : undefined;

        pending = createPatient
          .mutateAsync({
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
          })
          .then(async (createdPatient) => {
            if (newPatient.profilePhoto) {
              try {
                await uploadPatientProfilePhoto.mutateAsync({
                  id: createdPatient.id,
                  file: newPatient.profilePhoto,
                });
              } catch {
                // The patient is still usable if the optional photo upload
                // fails; the mutation already showed the actionable error.
              }
            }
            // The order's chiefComplaint is driven by the chief-complaint
            // multi-select (see handleChiefConditions / the mirror effect),
            // so we only need to bind the freshly-created patient id here.
            setForm((current) => ({
              ...current,
              patientId: createdPatient.id,
            }));
            return createdPatient.id;
          });
        // On failure, drop the cached promise so a later attempt POSTs
        // again instead of replaying a rejected request. The awaiting
        // caller still sees the original rejection (the create hook has
        // already surfaced the error toast).
        const inFlight = pending;
        inFlight.catch(() => {
          if (newPatientPromiseRef.current === inFlight) {
            newPatientPromiseRef.current = null;
          }
        });
        newPatientPromiseRef.current = inFlight;
      }
      return pending;
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

    // `chiefComplaint` is the packed chief-complaint multi-select value
    // (kept in sync by handleChiefConditions / the mirror effect). Trim
    // to `undefined` when nothing is selected.
    const draftPayload = {
      ...form,
      patientId,
      chiefComplaint: form.chiefComplaint?.trim() || undefined,
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
    //
    // Extract is exclusive: never persist EXTRACT together with another
    // doctor mark on the same tooth. Non-extraction marks combine freely.
    const extractTeeth = new Set(
      toothInstructions
        .filter((i) => i.type === ToothInstructionType.EXTRACT)
        .map((i) => i.toothNumber),
    );
    const OTHER_DOCTOR_MARKS = new Set<ToothInstructionType>([
      ToothInstructionType.NO_ATTACHMENTS,
      ToothInstructionType.DO_NOT_MOVE,
      ToothInstructionType.NO_IPR,
    ]);
    const sanitizedInstructions = toothInstructions.filter(
      (i) =>
        !(extractTeeth.has(i.toothNumber) && OTHER_DOCTOR_MARKS.has(i.type)),
    );
    await updateTeeth.mutateAsync({
      id: nextOrder.id,
      instructions: sanitizedInstructions,
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
          {t(activeStep.headingKey)}
        </h1>
        <p className="mx-auto mt-3 max-w-5xl text-sm leading-6 text-muted-foreground">
          {t(activeStep.descriptionKey)}
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
            dentistsLoading={dentistsQuery.isLoading}
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
          <div className="space-y-5">
            {/* CBCT toggle is now rendered INSIDE ClinicalOrderFiles,
                between the radiography slots and the STL section, so the
                reading order is Imagerie → panoramic → profile → CBCT →
                STL → ZIP/DCM. It stays the single source of truth for the
                `useCbctWithScans` flag; enabling it reveals the CBCT / ZIP
                bundle upload inline below the STL slots. */}
            <ClinicalOrderFiles
              orderId={savedOrder?.id}
              readOnly={!canModify}
              section="radiography-stl"
              cbctRequested={!!form.useCbctWithScans}
              cbctToggle={
                <div className="space-y-2">
                  <ToggleTile
                    label={t('orderForm.files.cbctRequested')}
                    description={t('orderForm.files.cbctRequestedHint')}
                    checked={!!form.useCbctWithScans}
                    disabled={!canModify}
                    onCheckedChange={(value) =>
                      updateField('useCbctWithScans', value)
                    }
                  />
                  {/* Paid-supplement notice — shown the moment the
                      toggle is on so the price is never a surprise. */}
                  {form.useCbctWithScans && cbctSupplement && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                      {t('orderForm.files.cbctSupplementNote', {
                        price: formatPrice(
                          cbctSupplement.fee,
                          cbctSupplement.currency,
                        ),
                      })}
                    </p>
                  )}
                </div>
              }
            />
          </div>
        )}

        {step === 3 && (
          <TreatmentStep
            form={form}
            disabled={!canModify}
            errors={fieldErrors}
            updateField={updateField}
            chiefConditions={chiefConditions}
            chiefOther={chiefOther}
            onChiefConditionsChange={handleChiefConditions}
            onChiefOtherChange={handleChiefOther}
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
                toothInstructions={toothInstructions}
              />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            {/* ReviewStep already renders the slot-based Patient images
                grid + Radiography & STL grid (via ClinicalOrderFiles in
                readOnly mode). The legacy `<OrderFileUpload readOnly />`
                block that USED to live below this was a flat
                category-grouped gallery — it duplicated every file the
                slot grid above already shows (same file appearing
                twice in the review). Removed for that reason. */}
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
              cbctSupplement={cbctSupplement}
            />
          </div>
        )}
      </main>

      {/* Paid-order lock notice — once the treatment fee is settled, a
          doctor can no longer edit the order (only an admin can). */}
      {paidLocked && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('orderForm.paidLock.banner')}</span>
        </div>
      )}

      {/* General Terms & Conditions — required to submit. Shown on the
          final review step for a draft order; the button below stays
          disabled until the box is ticked and the backend re-validates. */}
      {step === steps.length - 1 && canModify && isDraftForSubmit && (
        <label
          htmlFor="order-terms"
          className="flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3 text-sm shadow-sm"
        >
          <Checkbox
            id="order-terms"
            checked={termsAccepted}
            onCheckedChange={(v) => setTermsAccepted(v === true)}
            className="mt-0.5"
          />
          <span className="text-muted-foreground">
            {t('orderForm.terms.prefix')}{' '}
            <a
              href="/conditions-vente"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {t('orderForm.terms.link')}
            </a>
            {t('orderForm.terms.suffix')}
          </span>
        </label>
      )}

      {/* Final self-verification — the doctor confirms the order's info,
          files and images are complete / correct / compliant before submit.
          Required (client-side gate) alongside the T&C above. */}
      {step === steps.length - 1 && canModify && isDraftForSubmit && (
        <label
          htmlFor="order-review-confirm"
          className="flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3 text-sm shadow-sm"
        >
          <Checkbox
            id="order-review-confirm"
            checked={reviewConfirmed}
            onCheckedChange={(v) => setReviewConfirmed(v === true)}
            className="mt-0.5"
          />
          <span className="text-muted-foreground">
            {t('orderForm.reviewConfirm')}
          </span>
        </label>
      )}

      <footer className="flex flex-col gap-3 rounded-md border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          {t('common.back')}
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
                ? t('common.loading')
                : savedOrder
                  ? t('orderForm.actions.saveChanges')
                  : t('orderForm.actions.saveDraft')}
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button
              type="button"
              disabled={isSaving}
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
              {t('common.continue')}
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
                const submitted = await submitOrder.mutateAsync({
                  id: order.id,
                  termsAccepted,
                });
                // If the order is already paid (admin pre-paid an
                // older order, or no fee is configured) skip the
                // dialog and go straight to the detail page.
                if (submitted.treatmentFeePaidAt) {
                  router.push(`/dashboard/orders/${order.id}`);
                  return;
                }
                setSubmittedOrderId(order.id);
                setPayDialogOpen(true);
              }}
            >
              <Send className="mr-2 h-4 w-4" />
              {t('orderForm.actions.submitOrder')}
            </Button>
          )}
        </div>
      </footer>

      {/* Treatment fee payment dialog — shown after Submit succeeds.
          The doctor (or admin) picks card / bank transfer / cash, the
          backend stamps the right lifecycle status, and the dialog
          navigates to the order detail page on success. Closing
          without paying STILL navigates (the gate banner on the detail
          page picks up the conversation). */}
      {submittedOrderId && (
        <TreatmentFeePaymentDialog
          open={payDialogOpen}
          onOpenChange={(next) => {
            setPayDialogOpen(next);
            if (!next) router.push(`/dashboard/orders/${submittedOrderId}`);
          }}
          order={savedOrder ?? ({ id: submittedOrderId } as DentalOrder)}
          isAdmin={isAdmin}
          onPaid={() => {
            // No-op — the dialog will close itself which triggers
            // the router push above.
          }}
        />
      )}
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
  const { t } = useT();
  const current = steps[currentStep];
  // Total = step count + N-1 progress bars. The progress bars take `flex-1`
  // so they expand to fill whatever width the container provides — the
  // stepper always exactly fits its parent without a horizontal scroll.

  return (
    <nav aria-label={t('orderForm.advanced.wizardStepsAria')} className="space-y-3">
      {/* Mobile-only context line — shows the title clearly because the
          circles below are too small for inline labels at phone widths. */}
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('orderForm.step')} {currentStep + 1} {t('orderForm.of')} {steps.length}
        </span>
        <span className="truncate text-sm font-semibold text-foreground">
          {t(current.titleKey)}
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
            <Fragment key={step.titleKey}>
              <li className="relative flex shrink-0 flex-col items-center">
                <button
                  type="button"
                  // Free navigation — every step circle is clickable so the
                  // user can jump back and forth without finishing earlier
                  // steps. The Next button still validates before moving
                  // forward; this is just a quick-jump shortcut.
                  onClick={() => onStepChange(index)}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`${t('orderForm.step')} ${index + 1}: ${t(step.titleKey)}`}
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
                  {t(step.titleKey)}
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

// ──────────────────────────────────────────────────────────────────
// Patient search picker — inline, no popover, no extra dependency.
//
// Replaces a flat <Select> dropdown that previously listed every
// patient by name with no filtering. The picker now searches across
// FULL NAME, PHONE NUMBER and EMAIL so a doctor with hundreds of
// patients can find Mrs. Hajji by typing "haj", "+216 12", or even
// her last 4 digits. Match is case-insensitive and substring-based
// (not fuzzy — most users want predictable prefix-y matching).
//
// UX notes:
//   • If a patient is already selected, render a tidy "selected
//     patient" chip with a Change button — the user gets clear
//     feedback that the picker is "in selected mode" rather than
//     dropping back to the empty search every time.
//   • When the user hits Change, the chip swaps for the search input
//     and a scrollable list of matches with a max height so long
//     lists don't push the form out of view.
//   • Empty state copy when filter returns nothing tells the user
//     the search came up dry rather than implying no patients exist.
// ──────────────────────────────────────────────────────────────────
/**
 * Admin-only searchable practitioner picker. Mirrors PatientSearchPicker's
 * UX (search input → scrollable results → collapsed chip once chosen) so the
 * admin can find a doctor by name / email / phone instead of scrolling a
 * plain dropdown. Filters the already-fetched dentist list client-side —
 * same approach as the patient picker (no debounce, list capped server-side).
 */
function DoctorSearchPicker({
  doctors,
  loading,
  selectedId,
  errorMessage,
  disabled,
  onSelect,
}: {
  doctors: {
    id: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
  }[];
  loading: boolean;
  selectedId: string | undefined;
  errorMessage?: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  const selected = useMemo(
    () => doctors.find((d) => d.id === selectedId),
    [doctors, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return doctors;
    const qDigits = q.replace(/\D/g, '');
    return doctors.filter((d) => {
      const name = d.fullName.toLowerCase();
      const email = (d.email ?? '').toLowerCase();
      const phone = (d.phone ?? '').toLowerCase();
      const phoneDigits = phone.replace(/\D/g, '');
      return (
        name.includes(q) ||
        email.includes(q) ||
        (qDigits.length >= 2 && phoneDigits.includes(qDigits))
      );
    });
  }, [doctors, query]);

  // Selected-mode: tidy chip + Change button.
  if (selected && !expanded) {
    return (
      <div className="space-y-2">
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5 shadow-sm transition',
            errorMessage && 'border-red-500',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {(selected.fullName.trim().charAt(0) || '?').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selected.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {selected.email || selected.phone || (
                  <span className="italic">
                    {t('orderForm.patient.doctorPickerSelected')}
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            disabled={disabled}
            onClick={() => {
              setExpanded(true);
              setQuery('');
            }}
          >
            {t('orderForm.patient.pickerChange')}
          </Button>
        </div>
        {errorMessage ? <FieldError message={errorMessage} /> : null}
      </div>
    );
  }

  // Search-mode: input + scrollable list.
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus={expanded}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('orderForm.patient.doctorPickerPlaceholder')}
          disabled={disabled || loading}
          className={cn('h-11 pl-10 pr-9', errorMessage && 'border-red-500')}
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('uiBits.clearSearch')}
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-md border bg-card">
        {loading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {t('orderForm.patient.doctorPickerLoading')}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {t('orderForm.patient.doctorPickerEmpty')}
          </p>
        ) : (
          <ul
            role="listbox"
            aria-label={t('orderForm.patient.doctorPickerLabel')}
            className="max-h-64 overflow-y-auto"
          >
            {filtered.map((d) => {
              const isActive = d.id === selectedId;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    disabled={disabled}
                    onClick={() => {
                      onSelect(d.id);
                      setExpanded(false);
                      setQuery('');
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left transition last:border-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none',
                      isActive && 'bg-primary/5',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {(d.fullName.trim().charAt(0) || '?').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {d.fullName}
                        </p>
                        {d.email ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {d.email}
                          </p>
                        ) : d.phone ? (
                          <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                            <Phone className="me-1 inline h-3 w-3" />
                            {d.phone}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {isActive ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!loading && query && filtered.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {t('orderForm.patient.pickerResults', { count: filtered.length })}
        </p>
      ) : null}

      {errorMessage ? <FieldError message={errorMessage} /> : null}
    </div>
  );
}

function PatientSearchPicker({
  patients,
  loading,
  selectedId,
  errorMessage,
  disabled,
  onSelect,
}: {
  patients: {
    id: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
  }[];
  loading: boolean;
  selectedId: string | undefined;
  errorMessage?: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  // When a patient is already selected we collapse the picker into a
  // chip — `expanded` flips back when the user clicks Change.
  const [expanded, setExpanded] = useState(false);

  const selected = useMemo(
    () => patients.find((p) => p.id === selectedId),
    [patients, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    // Strip non-digit chars from query when the user is searching by
    // phone so "+216 12 345 678" matches "+21612345678" (no spaces
    // stored). We still compare against the raw name/email — only
    // the phone matcher uses the digit-only form.
    const qDigits = q.replace(/\D/g, '');
    return patients.filter((p) => {
      const name = p.fullName.toLowerCase();
      const phone = (p.phone ?? '').toLowerCase();
      const phoneDigits = phone.replace(/\D/g, '');
      const email = (p.email ?? '').toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        (qDigits.length >= 2 && phoneDigits.includes(qDigits))
      );
    });
  }, [patients, query]);

  // Selected-mode: tidy chip + Change button.
  if (selected && !expanded) {
    return (
      <div className="space-y-2">
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2.5 shadow-sm transition',
            errorMessage && 'border-red-500',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <UserRound className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {selected.fullName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {selected.phone || selected.email || (
                  <span className="italic">
                    {t('orderForm.patient.pickerSelected')}
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            disabled={disabled}
            onClick={() => {
              setExpanded(true);
              setQuery('');
            }}
          >
            {t('orderForm.patient.pickerChange')}
          </Button>
        </div>
        {errorMessage ? (
          <FieldError message={errorMessage} />
        ) : null}
      </div>
    );
  }

  // Search-mode: input + scrollable list.
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus={expanded}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('orderForm.patient.pickerPlaceholder')}
          disabled={disabled || loading}
          className={cn('h-11 pl-10 pr-9', errorMessage && 'border-red-500')}
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('uiBits.clearSearch')}
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Results list. Capped height so it doesn't grow off-screen
          when the doctor has hundreds of patients; the inner div
          scrolls. Tabular-num font on the phone keeps numbers easy
          to scan. */}
      <div className="overflow-hidden rounded-md border bg-card">
        {loading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {t('orderForm.patient.pickerLoading')}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {t('orderForm.patient.pickerEmpty')}
          </p>
        ) : (
          <ul
            role="listbox"
            aria-label={t('orderForm.patient.pickerLabel')}
            className="max-h-64 overflow-y-auto"
          >
            {filtered.map((p) => {
              const isActive = p.id === selectedId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    disabled={disabled}
                    onClick={() => {
                      onSelect(p.id);
                      setExpanded(false);
                      setQuery('');
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left transition last:border-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none',
                      isActive && 'bg-primary/5',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {(p.fullName.trim().charAt(0) || '?').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {p.fullName}
                        </p>
                        {p.phone ? (
                          <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                            <Phone className="me-1 inline h-3 w-3" />
                            {p.phone}
                          </p>
                        ) : p.email ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {p.email}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {isActive ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Result count — small caption beneath the list so the user
          knows whether they've narrowed the search enough. Hidden
          when nothing's been typed (the whole list is shown). */}
      {!loading && query && filtered.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {t('orderForm.patient.pickerResults', { count: filtered.length })}
        </p>
      ) : null}

      {errorMessage ? <FieldError message={errorMessage} /> : null}
    </div>
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
  dentistsLoading,
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
  // Practitioner picker (admin-only) searches by name / email / phone,
  // so it needs those fields on each dentist row.
  dentists: {
    id: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
  }[];
  dentistsLoading: boolean;
  // Picker needs `phone` (and optionally `email`) so the user can
  // search by anything they remember about the patient — most of our
  // doctors store phone numbers more reliably than email, so phone is
  // the primary secondary identifier.
  patients: {
    id: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
  }[];
  patientsLoading: boolean;
  errors: FieldErrors;
  updateField: <K extends keyof CreateOrderDto>(key: K, value: CreateOrderDto[K]) => void;
  updateNewPatient: <K extends keyof NewPatientDraft>(
    key: K,
    value: NewPatientDraft[K],
  ) => void;
}) {
  const { t } = useT();
  return (
    <div className="space-y-5">
      <div className="mx-auto grid max-w-[540px] gap-3 sm:grid-cols-2">
        <ChoiceCard
          active={patientMode === 'existing'}
          title={t('orderForm.patient.chooseOneOfYour')}
          description={selectedPatientName ?? t('orderForm.patient.chooseExistingHint')}
          onClick={() => setPatientMode('existing')}
        />
        <ChoiceCard
          active={patientMode === 'new'}
          title={t('orderForm.patient.createNewCardTitle')}
          description={t('orderForm.patient.createNewHint')}
          onClick={() => setPatientMode('new')}
        />
      </div>

      {isAdmin && (
        <div className="grid gap-2">
          <Label>{t('orderForm.patient.dentistLabel')}</Label>
          {/* Searchable practitioner picker (same UX as the patient picker
              below) — a plain dropdown is unusable once a clinic has many
              doctors. Doctors are picked by name / email / phone. */}
          <DoctorSearchPicker
            doctors={dentists}
            loading={dentistsLoading}
            selectedId={form.doctorId}
            errorMessage={errors.doctorId}
            disabled={!canModify}
            onSelect={(doctorId) => updateField('doctorId', doctorId)}
          />
        </div>
      )}

      {patientMode === 'existing' ? (
        <div className="grid gap-2">
          <Label>{t('orderForm.patient.patientLabel')}</Label>
          <PatientSearchPicker
            patients={patients}
            loading={patientsLoading}
            selectedId={form.patientId}
            errorMessage={errors.patientId}
            disabled={!canModify}
            onSelect={(patientId) => updateField('patientId', patientId)}
          />
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
                label={t('orderForm.patient.patientNameLabel')}
                value={newPatient.fullName}
                placeholder={t('orderForm.patient.fullNameInputPh')}
                icon={<UserRound className="h-4 w-4" />}
                error={errors['newPatient.fullName']}
                disabled={!canModify}
                onChange={(value) => updateNewPatient('fullName', value)}
              />
            </div>
            <div className="md:col-span-2">
              <PatientProfilePhotoField
                value={newPatient.profilePhoto}
                disabled={!canModify}
                label={t('patients.sheet.profilePhotoLabel')}
                hint={t('patients.sheet.profilePhotoHint')}
                uploadLabel={t('patients.sheet.uploadProfilePhoto')}
                changeLabel={t('patients.sheet.changeProfilePhoto')}
                editorTitle={t('patients.sheet.profilePhotoEditorTitle')}
                alt={newPatient.fullName || t('patients.sheet.unnamed')}
                onChange={(file) => updateNewPatient('profilePhoto', file)}
              />
            </div>
            <TextInput
              label={t('orderForm.patient.email')}
              value={newPatient.email}
              type="email"
              placeholder="patient@example.com"
              error={errors['newPatient.email']}
              disabled={!canModify}
              onChange={(value) => updateNewPatient('email', value)}
            />
            <TextInput
              label={t('orderForm.patient.phone')}
              value={newPatient.phone}
              placeholder={t('orderForm.patient.phoneInputPh')}
              error={errors['newPatient.phone']}
              disabled={!canModify}
              onChange={(value) => updateNewPatient('phone', value)}
            />
            <TextInput
              label={t('orderForm.patient.dob')}
              value={newPatient.dateOfBirth}
              type="date"
              icon={<CalendarDays className="h-4 w-4" />}
              error={errors['newPatient.dateOfBirth']}
              disabled={!canModify}
              onChange={(value) => updateNewPatient('dateOfBirth', value)}
            />
            <div className="grid gap-2">
              <Label>{t('orderForm.patient.genderLabel')}</Label>
              <Select
                value={newPatient.gender}
                onValueChange={(gender) => updateNewPatient('gender', gender as Gender)}
                disabled={!canModify}
              >
                <SelectTrigger
                  className={cn('h-11', errors['newPatient.gender'] && 'border-red-500')}
                >
                  <SelectValue placeholder={t('orderForm.patient.selectGenderPh')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Gender.FEMALE}>{t('orderForm.patient.sexFemale')}</SelectItem>
                  <SelectItem value={Gender.MALE}>{t('orderForm.patient.sexMale')}</SelectItem>
                  <SelectItem value={Gender.OTHER}>{t('orderForm.patient.sexOther')}</SelectItem>
                </SelectContent>
              </Select>
              <FieldError message={errors['newPatient.gender']} />
            </div>
            <div className="md:col-span-2">
              <TextInput
                label={t('orderForm.patient.address')}
                value={newPatient.address}
                placeholder={t('orderForm.patient.addressInputPh')}
                error={errors['newPatient.address']}
                disabled={!canModify}
                onChange={(value) => updateNewPatient('address', value)}
              />
            </div>
          </div>
          <TextAreaField
            label={t('orderForm.patient.notesLabel')}
            value={newPatient.notes}
            placeholder={t('orderForm.patient.notesInputPh')}
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
  chiefConditions,
  chiefOther,
  onChiefConditionsChange,
  onChiefOtherChange,
}: {
  form: CreateOrderDto;
  disabled?: boolean;
  errors: FieldErrors;
  updateField: <K extends keyof CreateOrderDto>(key: K, value: CreateOrderDto[K]) => void;
  chiefConditions: string[];
  chiefOther: string;
  onChiefConditionsChange: (next: string[]) => void;
  onChiefOtherChange: (next: string) => void;
}) {
  const { t } = useT();

  // ── Option-pill label resolvers ─────────────────────────────────────
  // The SAVED value stays English (it's the backend storage key) but the
  // VISIBLE label runs through `t()` so the same row renders in EN / FR /
  // AR. A small map keeps the mapping in one spot per option list.
  const TREATMENT_PLAN_KEY: Record<string, string> = {
    'Full Arch': 'orderForm.treatment.planFullArch',
    'Anterior Only': 'orderForm.treatment.planAnteriorOnly',
    '4 - 4 only': 'orderForm.treatment.plan4to4',
    'Dont Move 6 - 7 only': 'orderForm.treatment.planDontMove67',
  };
  const AP_KEY: Record<string, string> = {
    Maintain: 'orderForm.treatment.apMaintainOpt',
    'Improve canine only': 'orderForm.treatment.apImproveCanine',
    'Improve canine and molar': 'orderForm.treatment.apImproveCanineMolar',
    'Correct both Molar and Canine': 'orderForm.treatment.apCorrectBoth',
  };
  const PATIENT_STAGE_DESC: Record<PatientStage, string> = {
    [PatientStage.INITIAL]: 'orderForm.treatment.stageInitialDesc',
    [PatientStage.REFINEMENT]: 'orderForm.treatment.stageRefinementDesc',
    [PatientStage.RETAINER]: 'orderForm.treatment.stageRetainerDesc',
  };
  const PATIENT_STAGE_LABEL: Record<PatientStage, string> = {
    [PatientStage.INITIAL]: 'orderForm.patient.stageInitial',
    [PatientStage.REFINEMENT]: 'orderForm.patient.stageRefinement',
    [PatientStage.RETAINER]: 'orderForm.patient.stageRetainer',
  };

  return (
    // Every field on Step 4 uses the SAME <fieldset> card pattern as
    // Step 5 (Movement plan) — legend heading + one-line muted hint +
    // OptionPill grid. Keeps the whole wizard visually consistent so
    // the planner reads each control as the same kind of choice.
    <div className="space-y-6">
      {/* ─── Patient stage ────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t('orderForm.treatment.patientStageLegend')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.treatment.patientStageHint')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('orderForm.treatment.patientStageLegend')}
          className="grid gap-2 sm:grid-cols-3"
        >
          {patientStageOptions.map(([value]) => (
            <ChoiceCard
              key={value}
              active={form.patientStage === value}
              disabled={disabled}
              title={t(PATIENT_STAGE_LABEL[value])}
              description={t(PATIENT_STAGE_DESC[value])}
              onClick={() => updateField('patientStage', value)}
            />
          ))}
        </div>
        <FieldError message={errors.patientStage} />
      </fieldset>

      {/* ─── Arch treatment ───────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t('orderForm.treatment.archTreatmentLegend')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.treatment.archTreatmentHint')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('orderForm.treatment.archTreatmentLegend')}
          className="grid gap-2 sm:grid-cols-3"
        >
          <OptionPill
            active={form.archTreatment === ArchTreatment.UPPER}
            disabled={disabled}
            label={t('orderForm.treatment.archUpper')}
            onClick={() => {
              updateField('archTreatment', ArchTreatment.UPPER);
              updateField('treatBothArch', false);
            }}
          />
          <OptionPill
            active={form.archTreatment === ArchTreatment.LOWER}
            disabled={disabled}
            label={t('orderForm.treatment.archLower')}
            onClick={() => {
              updateField('archTreatment', ArchTreatment.LOWER);
              updateField('treatBothArch', false);
            }}
          />
          <OptionPill
            active={form.archTreatment === ArchTreatment.BOTH}
            disabled={disabled}
            label={t('orderForm.treatment.archBoth')}
            onClick={() => {
              updateField('archTreatment', ArchTreatment.BOTH);
              updateField('treatBothArch', true);
            }}
          />
        </div>
        <FieldError message={errors.archTreatment} />
      </fieldset>

      {/* ─── Chief complaint (multi-select "Reason for consultation") ───
          Same checkbox field the patient form uses, so the two surfaces
          stay 1:1. Stored on the ORDER (packed into chiefComplaint) — it
          prefills from the patient's reasons but is edited independently
          per order. */}
      <div className="space-y-2">
        <ClinicalConditionsField
          conditions={chiefConditions}
          otherDetail={chiefOther}
          disabled={disabled}
          idPrefix="chief-complaint"
          legendLabel={t('orderForm.treatment.chiefComplaintLegend')}
          descriptionText={t('orderForm.treatment.chiefComplaintHint')}
          onConditionsChange={onChiefConditionsChange}
          onOtherDetailChange={onChiefOtherChange}
        />
        <FieldError message={errors.chiefComplaint} />
      </div>

      {/* ─── Treatment plan ───────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t('orderForm.treatment.treatmentPlanLegend')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.treatment.treatmentPlanHint')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('orderForm.treatment.treatmentPlanLegend')}
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {treatmentPlanOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={form.treatmentPlan === opt}
              disabled={disabled}
              label={TREATMENT_PLAN_KEY[opt] ? t(TREATMENT_PLAN_KEY[opt]) : opt}
              onClick={() => updateField('treatmentPlan', opt)}
            />
          ))}
        </div>
        <FieldError message={errors.treatmentPlan} />
      </fieldset>

      {/* ─── A-P relationship ─────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t('orderForm.treatment.apLegend')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.treatment.apHint')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('orderForm.treatment.apLegend')}
          className="grid gap-2 sm:grid-cols-2"
        >
          {apRelationshipOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={form.apRelationship === opt}
              disabled={disabled}
              label={AP_KEY[opt] ? t(AP_KEY[opt]) : opt}
              onClick={() => updateField('apRelationship', opt)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// ─── Structured option tables for the mechanics fields ──────────────────────
// These controls write stable English values into the existing free-text
// columns. The normalizers below also understand the previous
// Anterior / Posterior / Both values so older drafts remain editable.

const iprOptions = ['Priority', 'If necessary', 'No IPR'] as const;
type IprOption = (typeof iprOptions)[number];

const expansionOptions = ['Priority', 'If necessary', 'No expansion'] as const;
type ExpansionOption = (typeof expansionOptions)[number];

// Bite-ramp placement options. Re-spec'd at the clinic's request to
// the occlusal-stop + tooth-group set the planners actually use:
// "Cale occlusale" plus the three tooth groups. Storage values are
// the stable English keys; FR labels resolve through the dict.
// Order matches the four bite-plane locations the clinic requested (labels
// resolve via BITE_RAMPS_KEY → dict). Storage values stay the stable English
// keys so existing saved orders keep working; only display order + labels changed.
// NB: the stored key `Molars` is LABELLED "retro-incisor 11, 21" and
// `Incisors` is "retro-incisor 12–22" (legacy key names). Clinic wants the
// central-incisor pair (11, 21) listed before the lateral pair (12–22).
const biteRampOptions = ['Occlusal stop', 'Molars', 'Incisors', 'Canines'] as const;

function normalizeIprChoice(value: string | undefined): IprOption | undefined {
  const raw = (value ?? '').trim();
  if (!raw) return undefined;
  if (/no\s*ipr|^no$/i.test(raw)) return 'No IPR';
  if (/priority/i.test(raw)) return 'Priority';
  if (/if\s*necessary|anterior|posterior|both/i.test(raw)) return 'If necessary';
  return undefined;
}

function normalizeExpansionChoice(
  value: string | undefined,
): ExpansionOption | undefined {
  const raw = (value ?? '').trim();
  if (!raw) return undefined;
  if (/no\s*expansion|^no$/i.test(raw)) return 'No expansion';
  if (/priority/i.test(raw)) return 'Priority';
  if (/if\s*necessary|anterior|posterior|both/i.test(raw)) return 'If necessary';
  return undefined;
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
  // Only the emptiness decision is trimmed — the note text itself is stored
  // VERBATIM so a controlled-input round-trip never swallows a space the
  // doctor just typed (every space is momentarily trailing while typing, so
  // trimming here made the spacebar feel broken). Same principle the Spaces
  // field below already uses.
  const hasNotes = notes.trim().length > 0;
  if (!type && !hasNotes) return '';
  if (type === 'No elastics') return 'No elastics';
  if (type && hasNotes) return `${type} — ${notes}`;
  if (type) return type;
  return notes;
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
  const raw = value ?? '';
  if (!raw.trim()) return { type: null, notes: '' };

  // Split on the first em-dash we use as separator between the type list and
  // the notes. Anything before is the (possibly comma-separated) type list;
  // anything after is the note — kept VERBATIM (only the single leading
  // space of our " — " glue is dropped) so the doctor's spaces survive the
  // controlled-input round-trip.
  const dashIdx = raw.indexOf('—');
  if (dashIdx < 0) {
    // No separator: a bare type, a legacy comma-list of types, or pure
    // free-text notes. Tokenise only to detect a known type; if none
    // matches, the whole value is the note and is returned verbatim (no
    // re-join — that would rewrite the user's spacing/commas).
    const tokens = raw.split(',').map((p) => p.trim()).filter(Boolean);
    let chosen: ElasticType | null = null;
    const leftover: string[] = [];
    for (const tok of tokens) {
      const hit = elasticTypeOptions.find(
        (opt) => opt.toLowerCase() === tok.toLowerCase(),
      );
      if (hit && !chosen) chosen = hit;
      else if (hit) leftover.push(hit);
      else leftover.push(tok);
    }
    return chosen
      ? { type: chosen, notes: leftover.join(', ') }
      : { type: null, notes: raw };
  }

  const head = raw.slice(0, dashIdx).trim();
  let tail = raw.slice(dashIdx + 1);
  if (tail.startsWith(' ')) tail = tail.slice(1); // drop the separator space only
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
  const prefix = unmatched.join(', ');
  const notes = prefix ? (tail ? `${prefix} — ${tail}` : prefix) : tail;
  return { type: chosen, notes };
}

function AdvancedMovementStep({
  form,
  disabled,
  updateField,
  toothInstructions,
}: {
  form: CreateOrderDto;
  disabled?: boolean;
  updateField: <K extends keyof CreateOrderDto>(key: K, value: CreateOrderDto[K]) => void;
  /**
   * Pass-through of the tooth-level marks chosen in the odontogram
   * above. We mirror the EXTRACT picks into the Extractions card so
   * the doctor sees the source of truth (clicked teeth) next to the
   * free-text field that gets persisted in `form.extractions`.
   */
  toothInstructions: ToothInstruction[];
}) {
  const { t } = useT();

  // ── Open bite / crossbite gate questions ────────────────────────────
  // The clinical team wants these two sections to open with a yes/no
  // question instead of showing treatment options straight away. The
  // answer is UI-only: "yes" reveals the options, "no" hides them and
  // clears any previously picked option so a hidden choice can never be
  // submitted. Untouched, the answer is derived from the saved value so
  // editing a draft that has one re-opens with the options visible.
  const [openBiteAnswer, setOpenBiteAnswer] = useState<'yes' | 'no' | null>(null);
  const [crossbiteAnswer, setCrossbiteAnswer] = useState<'yes' | 'no' | null>(null);
  const openBiteNeeded: boolean | undefined =
    openBiteAnswer !== null
      ? openBiteAnswer === 'yes'
      : (form.openBite ?? '').trim() === 'No'
        ? false
        : (form.openBite ?? '').trim()
          ? true
          : undefined;
  const crossbiteNeeded: boolean | undefined =
    crossbiteAnswer !== null
      ? crossbiteAnswer === 'yes'
      : (form.crossbite ?? '').trim() === 'No'
        ? false
        : (form.crossbite ?? '').trim()
          ? true
          : undefined;
  const answerOpenBite = (yes: boolean) => {
    setOpenBiteAnswer(yes ? 'yes' : 'no');
    if (yes && (form.openBite ?? '').trim() === 'No') updateField('openBite', '');
    if (!yes) updateField('openBite', 'No');
  };
  const answerCrossbite = (yes: boolean) => {
    setCrossbiteAnswer(yes ? 'yes' : 'no');
    if (yes && (form.crossbite ?? '').trim() === 'No') updateField('crossbite', '');
    if (!yes) updateField('crossbite', 'No');
  };

  // ── Option-pill label resolvers ─────────────────────────────────────
  // Saved values stay English (backend storage key) — labels run
  // through t() for localisation. Tables collect every mapping in one
  // place so a translator can find them at a glance.
  const IPR_KEY: Record<IprOption, string> = {
    Priority: 'orderForm.advanced.iprPriorityOpt',
    'If necessary': 'orderForm.advanced.iprIfNecessaryOpt',
    'No IPR': 'orderForm.advanced.iprNoneOpt',
  };
  const BITE_RAMPS_KEY: Record<string, string> = {
    'Occlusal stop': 'orderForm.advanced.biteRampsOcclusalStop',
    Incisors: 'orderForm.advanced.biteRampsIncisors',
    Canines: 'orderForm.advanced.biteRampsCanines',
    Molars: 'orderForm.advanced.biteRampsMolars',
  };
  const EXPANSION_KEY: Record<ExpansionOption, string> = {
    Priority: 'orderForm.advanced.expansionPriorityOpt',
    'If necessary': 'orderForm.advanced.expansionIfNecessaryOpt',
    'No expansion': 'orderForm.advanced.expansionNoneOpt',
  };
  const ELASTIC_KEY: Record<string, string> = {
    'No elastics': 'orderForm.advanced.elasticsNone',
    'Class I elastics': 'orderForm.advanced.elasticsClassI',
    'Class II elastics': 'orderForm.advanced.elasticsClassII',
    'Class III elastics': 'orderForm.advanced.elasticsClassIII',
    'Vertical bite elastics': 'orderForm.advanced.elasticsVertical',
    'Criss-cross elastics': 'orderForm.advanced.elasticsCrossCross',
  };
  const OPEN_BITE_KEY: Record<string, string> = {
    Correct: 'orderForm.advanced.openBiteCorrectOpt',
    Maintain: 'orderForm.advanced.openBiteMaintainOpt',
    Improved: 'orderForm.advanced.openBiteImprovedOpt',
  };
  const MIDLINE_KEY: Record<string, string> = {
    Maintain: 'orderForm.advanced.midlineMaintainOpt',
    Correct: 'orderForm.advanced.midlineCorrectOpt',
  };
  const CROSSBITE_KEY: Record<string, string> = {
    Correct: 'orderForm.advanced.crossbiteCorrectOpt',
    Maintain: 'orderForm.advanced.crossbiteMaintainOpt',
    'Correct only anterior': 'orderForm.advanced.crossbiteAnteriorOpt',
    'Correct only posterior': 'orderForm.advanced.crossbitePosteriorOpt',
  };
  const SPACES_KEY: Record<string, string> = {
    'Close all spaces': 'orderForm.advanced.spacesCloseOpt',
    'Maintain spaces': 'orderForm.advanced.spacesMaintainOpt',
  };

  // Decode the current saved strings into the three clinical choices. The
  // normalizers map legacy segment values to "If necessary" so old drafts
  // still show a meaningful active option instead of appearing blank.
  //
  // IMPORTANT: an UNSET field decodes to `undefined`, NOT `'No'`. The
  // form must open with NOTHING pre-selected — the doctor actively
  // picks an option rather than the form quietly submitting a choice the
  // doctor never made.
  const iprChoice = normalizeIprChoice(form.ipr);
  const expansionChoice = normalizeExpansionChoice(form.expansion);
  // Don't trim here — that strips trailing spaces while the doctor is
  // still typing notes, which made it feel like the spacebar didn't
  // work in the Spaces card. We only need leading whitespace ignored
  // so the option-pill activity check matches; `trimStart` is enough.
  const spaces = form.spaces?.trimStart() ?? '';
  const elastics = unpackElastics(form.elastics);

  // Teeth the doctor flagged for extraction in the odontogram above.
  // FDI numbering, sorted ascending for a stable display.
  const extractTeeth = useMemo(
    () =>
      toothInstructions
        .filter((t) => t.type === ToothInstructionType.EXTRACT)
        .map((t) => t.toothNumber)
        .sort((a, b) => a - b),
    [toothInstructions],
  );

  const setIpr = (choice: IprOption) => {
    updateField('ipr', choice);
  };

  const setExpansion = (choice: ExpansionOption) => {
    updateField('expansion', choice);
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
        <legend className="px-1 text-sm font-semibold">{t('orderForm.advanced.elastics')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.advanced.elasticsHint')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('orderForm.advanced.elastics')}
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {elasticTypeOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={elastics.type === opt}
              disabled={disabled}
              label={ELASTIC_KEY[opt] ? t(ELASTIC_KEY[opt]) : opt}
              onClick={() => setElasticType(opt)}
            />
          ))}
        </div>
        <TextInput
          label={t('orderForm.advanced.elasticsNotesLabel')}
          value={elastics.notes}
          placeholder={t('orderForm.advanced.elasticsNotesPh')}
          icon={<Info className="h-4 w-4" />}
          disabled={disabled || elastics.type === 'No elastics'}
          onChange={setElasticsNotes}
        />
      </fieldset>

      {/* ─── Open bite ────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t('orderForm.advanced.openBite')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.advanced.openBiteAsk')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('orderForm.advanced.openBiteAsk')}
          className="grid grid-cols-2 gap-2"
        >
          <OptionPill
            active={openBiteNeeded === true}
            disabled={disabled}
            label={t('common.yes')}
            onClick={() => answerOpenBite(true)}
          />
          <OptionPill
            active={openBiteNeeded === false}
            disabled={disabled}
            label={t('common.no')}
            onClick={() => answerOpenBite(false)}
          />
        </div>
        {openBiteNeeded === true && (
          <>
            <p className="text-xs text-muted-foreground">
              {t('orderForm.advanced.openBiteHint')}
            </p>
            <div
              role="radiogroup"
              aria-label={t('orderForm.advanced.openBite')}
              className="grid gap-2 sm:grid-cols-3"
            >
              {openBiteOptions.map((opt) => (
                <OptionPill
                  key={opt}
                  active={form.openBite === opt}
                  disabled={disabled}
                  label={OPEN_BITE_KEY[opt] ? t(OPEN_BITE_KEY[opt]) : opt}
                  onClick={() => updateField('openBite', opt)}
                />
              ))}
            </div>
          </>
        )}
      </fieldset>

      {/* ─── Midline ──────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t('orderForm.treatment.midline')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.advanced.midlineHint')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('orderForm.treatment.midline')}
          className="grid gap-2 sm:grid-cols-2"
        >
          {midlineOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={form.midline === opt}
              disabled={disabled}
              label={MIDLINE_KEY[opt] ? t(MIDLINE_KEY[opt]) : opt}
              onClick={() => updateField('midline', opt)}
            />
          ))}
        </div>
      </fieldset>

      {/* ─── IPR ────────────────────────────────────────────────────────
          Three direct clinical choices keep the field readable: priority,
          if necessary, or no IPR. */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">IPR</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.advanced.iprHint')}
        </p>
        <div
          role="radiogroup"
          aria-label="IPR"
          className="grid gap-2 sm:grid-cols-3"
        >
          {iprOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={iprChoice === opt}
              disabled={disabled}
              label={t(IPR_KEY[opt])}
              onClick={() => setIpr(opt)}
            />
          ))}
        </div>
      </fieldset>

      {/* ─── Bite ramps ─────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t('orderForm.advanced.biteRamps')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.advanced.biteRampsHint')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('orderForm.advanced.biteRamps')}
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {biteRampOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={form.biteRamps === opt}
              disabled={disabled}
              label={BITE_RAMPS_KEY[opt] ? t(BITE_RAMPS_KEY[opt]) : opt}
              onClick={() => updateField('biteRamps', opt)}
            />
          ))}
        </div>
      </fieldset>

      {/* ─── Expansion ────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t('orderForm.advanced.expansion')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.advanced.expansionHint')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('orderForm.advanced.expansion')}
          className="grid gap-2 sm:grid-cols-3"
        >
          {expansionOptions.map((opt) => {
            return (
              <OptionPill
                key={opt}
                active={expansionChoice === opt}
                disabled={disabled}
                label={t(EXPANSION_KEY[opt])}
                onClick={() => setExpansion(opt)}
              />
            );
          })}
        </div>
      </fieldset>

      {/* ─── Crossbite ─────────────────────────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t('orderForm.advanced.crossbite')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.advanced.crossbiteAsk')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('orderForm.advanced.crossbiteAsk')}
          className="grid grid-cols-2 gap-2"
        >
          <OptionPill
            active={crossbiteNeeded === true}
            disabled={disabled}
            label={t('common.yes')}
            onClick={() => answerCrossbite(true)}
          />
          <OptionPill
            active={crossbiteNeeded === false}
            disabled={disabled}
            label={t('common.no')}
            onClick={() => answerCrossbite(false)}
          />
        </div>
        {crossbiteNeeded === true && (
          <>
            <p className="text-xs text-muted-foreground">
              {t('orderForm.advanced.crossbiteHint')}
            </p>
            <div
              role="radiogroup"
              aria-label={t('orderForm.advanced.crossbite')}
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            >
              {crossbiteOptions.map((opt) => (
                <OptionPill
                  key={opt}
                  active={form.crossbite === opt}
                  disabled={disabled}
                  label={CROSSBITE_KEY[opt] ? t(CROSSBITE_KEY[opt]) : opt}
                  onClick={() => updateField('crossbite', opt)}
                />
              ))}
            </div>
          </>
        )}
      </fieldset>

      {/* ─── Spaces — single source of truth ────────────────────────────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t('orderForm.advanced.spaces')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.advanced.spacesHint')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('orderForm.advanced.spaces')}
          className="grid gap-2 sm:grid-cols-2"
        >
          {spacesOptions.map((opt) => (
            <OptionPill
              key={opt}
              active={spaces.startsWith(opt)}
              disabled={disabled}
              label={SPACES_KEY[opt] ? t(SPACES_KEY[opt]) : opt}
              onClick={() => updateField('spaces', opt)}
            />
          ))}
        </div>
        <TextAreaField
          label={t('orderForm.advanced.elasticsNotesLabel')}
          compact
          value={
            spaces && !spacesOptions.some((o) => spaces === o)
              ? spaces.replace(
                  new RegExp(`^(${spacesOptions.join('|')})\\s*[—-]?\\s*`),
                  '',
                )
              : ''
          }
          placeholder={t('orderForm.advanced.spacesNotesPh')}
          disabled={disabled}
          onChange={(detail) => {
            // Preserve the doctor's whitespace as-is while they type —
            // trimming in onChange used to swallow trailing spaces and
            // made the spacebar feel broken. We still strip the prefix
            // back on read via the regex above, so the saved value
            // stays clean.
            const base = spacesOptions.find((o) => spaces.startsWith(o)) ?? '';
            updateField(
              'spaces',
              detail ? `${base ? `${base} — ` : ''}${detail}` : base,
            );
          }}
        />
      </fieldset>

      {/* ─── Extractions — odontogram picks + free-text notes ──────── */}
      <fieldset className="space-y-3 rounded-lg border bg-card p-4">
        <legend className="px-1 text-sm font-semibold">{t('orderForm.advanced.extractions')}</legend>
        <p className="text-xs text-muted-foreground">
          {t('orderForm.advanced.extractionsHint')}
        </p>

        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('orderForm.advanced.extractionsTeethTitle')}
          </p>
          {extractTeeth.length === 0 ? (
            <p className="mt-2 text-xs italic text-muted-foreground">
              {t('orderForm.advanced.extractionsEmpty')}
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {extractTeeth.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-800 ring-1 ring-orange-200"
                >
                  #{n}
                </span>
              ))}
            </div>
          )}
        </div>

        <TextInput
          label={t('orderForm.advanced.elasticsNotesLabel')}
          value={form.extractions ?? ''}
          placeholder={t('orderForm.advanced.extractionsNotesPh')}
          icon={<Info className="h-4 w-4" />}
          disabled={disabled}
          onChange={(value) => updateField('extractions', value)}
        />
      </fieldset>
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
 * Files (patient images + radiography + STL) are rendered INSIDE this
 * component as the new sections 2 + 3 (via <ClinicalOrderFiles
 * readOnly />). The previous flat `<OrderFileUpload readOnly />`
 * block at the parent level has been removed because it duplicated
 * every file the slot grid here already shows.
 */
function ReviewStep({
  savedOrder,
  selectedPatient,
  newPatient,
  selectedDentist,
  fallbackDentistName,
  form,
  toothInstructions,
  cbctSupplement,
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
  /** Configured CBCT paid supplement — null when disabled or free. */
  cbctSupplement: { fee: number; currency: string; baseFee: number } | null;
}) {
  const { t } = useT();
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

  // Teeth flagged for extraction in the odontogram (FDI, sorted). The
  // résumé's "Extractions" row used to show only the free-text notes, so
  // teeth picked WITHOUT a note appeared nowhere — fold the selected
  // teeth into the displayed value too.
  const extractionsSummary = useMemo(() => {
    const teeth = toothInstructions
      .filter((i) => i.type === ToothInstructionType.EXTRACT)
      .map((i) => i.toothNumber)
      .sort((a, b) => a - b);
    return [teeth.join(', '), (form.extractions ?? '').trim()]
      .filter(Boolean)
      .join(' · ');
  }, [toothInstructions, form.extractions]);

  const conditionsValue = formatClinicalConditions(
    patientClinicalConditions,
    patientClinicalConditionsOther,
  );

  return (
    <div className="space-y-6">
      {/* ─── 1 · Patient information ─────────────────────────────── */}
      <ReviewSection icon={UserRound} title={t('orderForm.review.patientInfo')}>
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

      {/* ─── 2 · Patient images ──────────────────────────────────────
          Use the exact same <ClinicalOrderFiles> grid the planner
          interacted with in step 2 of the wizard. Passing readOnly
          drops the upload affordances + the per-slot trash button but
          keeps every photo card (Profile, Face at rest, Smile, lateral
          views, occlusal views) in the SAME 3-column layout — so
          Review reads as a faithful preview of the order detail page
          the doctor will see post-submit.

          If `savedOrder` isn't there yet (draft hasn't been saved at
          all), the component already renders its own "save the draft
          first" notice — we don't gate it here. */}
      <ReviewSection icon={Camera} title={t('orderForm.review.patientImages')}>
        <ClinicalOrderFiles
          orderId={savedOrder?.id}
          readOnly
          section="patient-images"
        />
      </ReviewSection>

      {/* ─── 3 · Radiography, STL scans & bundles ────────────────────
          Same component, same grid layout, different section key. This
          surface also renders the read-only ZIP/CBCT bundles list
          (with the Download button) that we just polished. Avoiding
          a separate "Files" block keeps Review one-to-one with the
          upload flow above. */}
      <ReviewSection icon={ScanLine} title={t('orderForm.review.radiographyScans')}>
        <ClinicalOrderFiles
          orderId={savedOrder?.id}
          readOnly
          section="radiography-stl"
          cbctRequested={!!form.useCbctWithScans}
        />
      </ReviewSection>

      {/* ─── 4 · Treatment plan & clinical objective ─────────────── */}
      <ReviewSection icon={Target} title={t('orderForm.review.treatmentObjective')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReviewInfo
            label={t('orderForm.treatment.chiefComplaint')}
            value={formatChiefComplaint(form.chiefComplaint, t)}
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
        title={t('orderForm.review.toothLevel')}
      >
        <div className="space-y-8">
          <OdontogramSelector
            value={toothInstructions}
            onChange={NOOP_TOOTH_CHANGE}
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
              {/* No "No expansion" fallback — an unset field reads as
                  empty in the review, matching the form's no-default
                  behaviour instead of implying a choice. */}
              <ReviewInfo label="Expansion" value={form.expansion} />
              <ReviewInfo label="Crossbite" value={form.crossbite} />
              <ReviewInfo label="Spaces" value={form.spaces} wide />
              <ReviewInfo label="Extractions" value={extractionsSummary} wide />
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
      <ReviewSection icon={ClipboardCheck} title={t('orderForm.review.orderMetadata')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReviewInfo
            label="CBCT requested"
            value={form.useCbctWithScans ? 'Yes' : 'No'}
          />
          {/* Manufacturing + Materials removed from the order review per
              the clinic's flow — those are decided downstream, not by the
              doctor at order time. */}
          <ReviewInfo
            label="Order code"
            value={savedOrder?.orderCode ?? 'Draft not saved'}
          />
          <ReviewInfo
            label="Status"
            value={savedOrder?.status ?? OrderStatus.DRAFT}
          />
        </div>

        {/* ── Price summary — only when CBCT is requested AND priced.
            The supplement shown prefers the order's own snapshot (an
            already-saved draft carries the authoritative amount); the
            configured default covers the not-yet-saved case. */}
        {form.useCbctWithScans &&
          (savedOrder?.cbctFeeAmount || cbctSupplement) && (
            <dl className="mt-4 max-w-sm space-y-1 rounded-lg border bg-muted/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t('orderForm.review.priceBase')}
                </dt>
                <dd className="font-medium tabular-nums">
                  {formatPrice(
                    cbctSupplement?.baseFee ?? 0,
                    savedOrder?.cbctFeeCurrency ??
                      cbctSupplement?.currency ??
                      'TND',
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t('orderForm.review.priceCbct')}
                </dt>
                <dd className="font-medium tabular-nums">
                  {formatPrice(
                    savedOrder?.cbctFeeAmount ?? cbctSupplement?.fee ?? 0,
                    savedOrder?.cbctFeeCurrency ??
                      cbctSupplement?.currency ??
                      'TND',
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t pt-1.5">
                <dt className="font-semibold">
                  {t('orderForm.review.priceTotal')}
                </dt>
                <dd className="font-semibold tabular-nums">
                  {formatPrice(
                    (cbctSupplement?.baseFee ?? 0) +
                      (savedOrder?.cbctFeeAmount ?? cbctSupplement?.fee ?? 0),
                    savedOrder?.cbctFeeCurrency ??
                      cbctSupplement?.currency ??
                      'TND',
                  )}
                </dd>
              </div>
            </dl>
          )}
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
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  /** Optional helper line shown beneath the label. */
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex h-full min-h-16 items-center justify-between gap-3 rounded-md border bg-background px-4 py-3">
      <div className="min-w-0">
        <Label className="text-sm font-semibold">{label}</Label>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
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
        // `relative` so the absolute-positioned check badge can pin
        // itself to the top-right corner without nudging the label.
        // `pr-9` reserves room for the badge so a long label
        // ("Don't Move 6 - 7 only") never gets clipped by it.
        'group relative inline-flex min-h-11 items-center justify-center rounded-md border bg-background px-3 pr-9 text-sm font-semibold transition',
        'hover:border-primary/70',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-60',
        active && 'border-primary bg-primary/5 text-primary shadow-sm',
      )}
    >
      <span className="text-center">{label}</span>
      {/* Selection check badge — same visual the ChoiceCard uses, so
          every radio-style block in the wizard reads identically. */}
      {active && (
        <CheckCircle2
          className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary"
          aria-hidden
        />
      )}
    </button>
  );
}

// ReviewCard removed — replaced by the larger ReviewSection / ReviewInfo
// helpers that mirror the order-detail page layout (see ReviewStep).

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600">{message}</p>;
}

