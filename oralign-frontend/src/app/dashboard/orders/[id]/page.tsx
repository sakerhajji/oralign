'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Camera,
  ClipboardCheck,
  Edit,
  ListChecks,
  ScanLine,
  ShieldX,
  Target,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ClinicalOrderFiles } from '@/components/orders/order-file-upload';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { TreatmentPlanReview } from '@/components/orders/treatment-plan-review';
import {
  useCreateTreatmentPlan,
  useTreatmentPlansByOrder,
} from '@/lib/hooks/use-treatment-plans';
import { Plus, Sparkles } from 'lucide-react';
import {
  useDeleteOrder,
  useOrder,
  usePatient,
  usePermanentDeleteOrder,
} from '@/lib/hooks';
import { useAuth } from '@/lib/providers/auth-provider';
import { Gender, UserRole } from '@/lib/types';
import { useState } from 'react';

// Defer the odontogram (its sprite payload is heavy) until the page mounts.
const OdontogramSelector = dynamic(
  () =>
    import('@/components/orders/odontogram-selector').then((m) => ({
      default: m.OdontogramSelector,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Loading odontogram…
      </div>
    ),
  },
);

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderQuery = useOrder(params.id);
  const deleteOrder = useDeleteOrder();
  const permanentDeleteOrder = usePermanentDeleteOrder();
  const { isAdmin, isDentist, user } = useAuth();

  // Pull the full patient record separately — the order endpoint only
  // returns a slim {id,fullName,email,phone} on purpose, but the detail
  // page needs the full demographic profile (sex, DOB, age) clinicians
  // expect to see for a treatment plan review.
  const patientQuery = usePatient(orderQuery.data?.patientId ?? '');

  if (orderQuery.isLoading) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (orderQuery.error || !orderQuery.data) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <p className="font-medium text-red-600">
              Order not found or access is blocked
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard/orders">Back to orders</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const order = orderQuery.data;
  const patient = patientQuery.data;
  const canManage = isAdmin || isDentist;

  // ── View-page section layout ────────────────────────────────────────────
  // Mirrors the order-creation wizard but flattened into a single scrollable
  // page (no step navigation). Order of sections mirrors the wizard:
  //   1. Patient information
  //   2. Patient images
  //   3. Radiography & STL scans
  //   4. Treatment plan
  //   5. Movement & tooth-level instructions  (Odontogram first, then mechanics)
  // Each is a borderless card with a coloured icon + clear heading.

  return (
    <div className="@container/main flex flex-1 flex-col gap-6 p-4 lg:p-6">
      {/* ─── Sticky-ish header with the order code, status, and actions ─── */}
      <header className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="mb-1 px-0">
            <Link href="/dashboard/orders">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All orders
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {order.orderCode}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Created {format(new Date(order.createdAt), 'MMM d, yyyy')}
            {order.submittedAt
              ? ` · Submitted ${format(new Date(order.submittedAt), 'MMM d, yyyy')}`
              : ' · Not yet submitted'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button asChild>
              <Link href={`/dashboard/orders/${order.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
          {canManage && (
            <OrderDeleteAction
              title="Delete order?"
              description="This soft-deletes the order. Backend permissions still enforce dentist ownership."
              actionLabel="Delete"
              icon={<Trash2 className="mr-2 h-4 w-4" />}
              disabled={deleteOrder.isPending}
              onConfirm={() =>
                deleteOrder.mutate(order.id, {
                  onSuccess: () => router.push('/dashboard/orders'),
                })
              }
            />
          )}
          {isAdmin && (
            <OrderDeleteAction
              title="Permanently delete order?"
              description="This removes the order, tooth instructions, file records, and stored files. This cannot be undone."
              actionLabel="Delete forever"
              icon={<ShieldX className="mr-2 h-4 w-4" />}
              disabled={permanentDeleteOrder.isPending}
              destructive
              onConfirm={() =>
                permanentDeleteOrder.mutate(order.id, {
                  onSuccess: () => router.push('/dashboard/orders'),
                })
              }
            />
          )}
        </div>
      </header>

      {/* ─── 1 · Patient information ──────────────────────────────────── */}
      <Section icon={UserRound} title="Patient information">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Patient" value={order.patient?.fullName} />
          <Info label="Dentist" value={order.doctor?.fullName} />
          <Info label="Patient stage" value={order.patientStage} />
          <Info label="Sex" value={genderLabel(patient?.gender)} />
          <Info label="Date of birth" value={formatBirthDate(patient?.dateOfBirth)} />
          <Info label="Age" value={ageFromDob(patient?.dateOfBirth)} />
          <Info label="Patient email" value={order.patient?.email} />
          <Info label="Patient phone" value={order.patient?.phone} />
          <Info label="Arch treatment" value={order.archTreatment} />
          {patient?.address && (
            <Info label="Address" value={patient.address} wide />
          )}
          {patient?.notes && (
            <Info label="Patient notes" value={patient.notes} wide />
          )}
        </div>
      </Section>

      {/* ─── 2 · Patient images ───────────────────────────────────────── */}
      <Section icon={Camera} title="Patient images">
        <ClinicalOrderFiles
          orderId={order.id}
          readOnly
          section="patient-images"
        />
      </Section>

      {/* ─── 3 · Radiography & STL scans ──────────────────────────────── */}
      <Section icon={ScanLine} title="Radiography & STL scans">
        <ClinicalOrderFiles
          orderId={order.id}
          readOnly
          section="radiography-stl"
        />
      </Section>

      {/* ─── 4 · Treatment plan ───────────────────────────────────────── */}
      <Section icon={Target} title="Treatment plan & clinical objective">
        <div className="grid gap-4 sm:grid-cols-2">
          <Info label="Chief complaint" value={order.chiefComplaint} wide />
          <Info label="Treatment plan" value={order.treatmentPlan} wide />
          <Info label="A-P relationship" value={order.apRelationship} />
        </div>
      </Section>

      {/* ─── 5 · Movement & tooth-level instructions ──────────────────── */}
      <Section
        icon={ListChecks}
        title="Tooth-level instructions & movement plan"
      >
        <div className="space-y-8">
          {/* Odontogram FIRST — same as in the wizard's step 5 */}
          <OdontogramSelector
            value={order.toothInstructions ?? []}
            onChange={() => undefined}
            disabled
          />

          {/* Mechanics summary below the chart */}
          <div className="border-t pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Elastics" value={order.elastics} wide />
              <Info label="Open bite" value={order.openBite} />
              <Info label="Midline" value={order.midline} />
              <Info label="IPR" value={order.ipr} />
              <Info label="Bite ramps" value={order.biteRamps} />
              <Info label="Expansion" value={order.expansion ?? 'No expansion'} />
              <Info label="Crossbite" value={order.crossbite} />
              <Info label="Spaces" value={order.spaces} wide />
              <Info label="Extractions" value={order.extractions} wide />
            </div>
          </div>

          {(order.specialInstructions || order.additionalInstructions) && (
            <div className="border-t pt-6">
              <div className="grid gap-4">
                <Info
                  label="Special instructions"
                  value={order.specialInstructions}
                  wide
                />
                <Info
                  label="Additional notes"
                  value={order.additionalInstructions}
                  wide
                />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ─── Treatment plans (review) ─────────────────────────────────── */}
      <Section icon={Sparkles} title="Treatment plans">
        <TreatmentPlansSection orderId={order.id} role={user?.role as UserRole} />
      </Section>

      {/* Bottom meta block — small, low-priority info that used to be
          in a "Summary" sidebar but is more honest at the end. */}
      <Section icon={ClipboardCheck} title="Order metadata">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info
            label="CBCT requested"
            value={order.useCbctWithScans ? 'Yes' : 'No'}
          />
          <Info
            label="Manufacturing"
            value={order.wantsManufacturing ? 'Requested' : 'Not requested'}
          />
          <Info
            label="Materials"
            value={(order.materials ?? []).join(', ') || 'Not set'}
          />
          <Info
            label="Order code"
            value={order.orderCode}
          />
        </div>
      </Section>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function Section({
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

function Info({
  label,
  value,
  wide,
}: {
  label: string;
  value?: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-3' : undefined}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-foreground">
        {value && value.trim().length > 0 ? value : '—'}
      </p>
    </div>
  );
}

// ─── Patient demographic helpers ───────────────────────────────────────────

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

function formatBirthDate(dob?: string | null): string | undefined {
  if (!dob) return undefined;
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return undefined;
  return format(date, 'MMM d, yyyy');
}

/**
 * Compute the patient's age from their date of birth.
 * Returns "32 yrs" for adults, "2 yrs 4 mo" for toddlers (treatment-planning
 * for paediatric / growing patients hinges on this granularity).
 */
function ageFromDob(dob?: string | null): string | undefined {
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
  if (years < 5) {
    return `${years} yr${years === 1 ? '' : 's'}${months > 0 ? ` ${months} mo` : ''}`;
  }
  return `${years} yrs`;
}

// ─── Treatment plans list + review ─────────────────────────────────────────

function TreatmentPlansSection({
  orderId,
  role,
}: {
  orderId: string;
  role: UserRole;
}) {
  const plansQuery = useTreatmentPlansByOrder(orderId);
  const create = useCreateTreatmentPlan();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const plans = plansQuery.data ?? [];
  const activeId = selectedId ?? plans[0]?.id ?? null;
  const isPlanner =
    role === UserRole.ADMIN ||
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.DESIGNER;

  if (plansQuery.isLoading) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        Loading treatment plans…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {plans.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {plans.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={activeId === p.id ? 'default' : 'outline'}
              onClick={() => setSelectedId(p.id)}
              className="gap-2"
            >
              {p.name}
              <span className="rounded-full bg-background/30 px-1.5 py-0.5 text-[10px] uppercase">
                {p.status}
              </span>
            </Button>
          ))}
          {isPlanner && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => create.mutate({ orderId })}
              disabled={create.isPending}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New plan
            </Button>
          )}
        </div>
      )}
      {plans.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No treatment plans yet.
          {isPlanner && (
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                onClick={() => create.mutate({ orderId })}
                disabled={create.isPending}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Create the first plan
              </Button>
            </div>
          )}
        </div>
      ) : activeId ? (
        <TreatmentPlanReview treatmentPlanId={activeId} role={role} />
      ) : null}
    </div>
  );
}

function OrderDeleteAction({
  title,
  description,
  actionLabel,
  icon,
  disabled,
  destructive,
  onConfirm,
}: {
  title: string;
  description: string;
  actionLabel: string;
  icon: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={destructive ? 'destructive' : 'outline'}
          disabled={disabled}
        >
          {icon}
          {actionLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
