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
  ShieldCheck,
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
import { OrderStatusChangeDialog } from '@/components/orders/order-status-change-dialog';
import { TreatmentPlanReview } from '@/components/orders/treatment-plan-review';
import { QuoteReview } from '@/components/orders/quote-review';
import {
  useCreateTreatmentPlan,
  useTreatmentPlansByOrder,
} from '@/lib/hooks/use-treatment-plans';
import { useTreatmentChatSocket } from '@/lib/hooks/use-treatment-chat-socket';
import { FileText, Plus, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useCompanyBilling,
  useDeleteOrder,
  useMarkTreatmentFeePaid,
  useOrder,
  usePatient,
  usePermanentDeleteOrder,
} from '@/lib/hooks';
import { useQuotationForOrder } from '@/lib/hooks/use-quotations';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  Gender,
  OrderStatus,
  QuotationStatus,
  TreatmentPlanStatus,
  UserRole,
} from '@/lib/types';
import { useEffect, useMemo, useRef, useState } from 'react';

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

type OrderDetailTab = 'order' | 'treatment-plans' | 'quote';

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

  // Order-scoped quote — drives both whether the Quote tab is shown and
  // which decision badge it carries. Doctors can read their own order's
  // quote (RBAC allows owning dentist); admins always see it.
  const quotationQuery = useQuotationForOrder(orderQuery.data?.id ?? '');
  const [activeTab, setActiveTab] = useState<OrderDetailTab>('order');
  const [mountedTabs, setMountedTabs] = useState<Set<OrderDetailTab>>(
    () => new Set(['order']),
  );
  const initializedOrderIdRef = useRef<string | null>(null);

  const defaultTab = useMemo<OrderDetailTab>(() => {
    if (!orderQuery.data) return 'order';
    return computeDefaultTab({
      status: orderQuery.data.status,
      hasTreatmentPlans: (orderQuery.data.treatmentPlansCount ?? 0) > 0,
      hasQuotation: !!quotationQuery.data,
    });
  }, [
    orderQuery.data?.status,
    orderQuery.data?.treatmentPlansCount,
    quotationQuery.data,
  ]);

  useEffect(() => {
    const orderId = orderQuery.data?.id;
    if (!orderId || initializedOrderIdRef.current === orderId) return;
    initializedOrderIdRef.current = orderId;
    setActiveTab(defaultTab);
    setMountedTabs(new Set([defaultTab]));
  }, [defaultTab, orderQuery.data?.id]);

  useEffect(() => {
    setMountedTabs((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

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
  const hasQuotationSignal =
    !!quotationQuery.data || POST_QUOTE_STATUSES.has(order.status);

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
            {/* Admin manual override — small, low-visual-weight chip
                tucked next to the status badge so it doesn't compete
                with the doctor-facing actions. Backend re-enforces
                the role check; hiding the trigger is affordance only. */}
            {isAdmin && (
              <OrderStatusChangeDialog
                orderId={order.id}
                orderCode={order.orderCode}
                currentStatus={order.status}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    Change status
                  </Button>
                }
              />
            )}
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

      {/* ─── Treatment-fee gate banner ─────────────────────────────────────
          Renders only when there's a configured treatment fee > 0 and the
          order hasn't paid it yet. The doctor sees a "Pay treatment fee"
          CTA; the admin sees "Mark as paid" so they can record cash /
          transfer collection. Either action stamps `treatmentFeePaidAt`,
          which the backend uses to unlock treatment-plan creation. */}
      <TreatmentFeeGateBanner
        order={order}
        canActAsAdmin={isAdmin}
        canActAsDoctor={isDentist}
      />

      {/* ─── Tab visibility + default selection ─────────────────────────────
            Doctors only see what's been created — no empty Quote tab on a
            brand-new order. Admins/designers ALWAYS see both tabs because
            they need an entry-point to create the first plan / first quote.

            Default tab priority (mirrors what's "live" in the order):
              1. Quote exists                       → 'quote'
              2. At least one treatment plan exists → 'treatment-plans'
              3. Otherwise                          → 'order'
            Computed from order.status as a synchronous fallback so the tab
            picks correctly even before the /quotations/order/:id query
            settles — the status itself encodes the lifecycle.

            "Needs attention" dot on a tab:
              • Doctor side: status awaits THEIR action
                  - plan.status === 'ready'         → review treatment plan
                  - quote.status === 'sent'         → approve / reject quote
              • Admin / designer side: doctor reacted recently
                  - plan.status approved / rejected
                  - quote.status approved / rejected

            Heavy tabs are lazy-mounted the first time they are opened, then
            kept mounted while switching tabs. This avoids loading treatment
            viewers / chat / quote forms while the user is only reading the
            order summary. */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as OrderDetailTab)}
      >
        <TabsList className="w-full justify-start sm:w-auto">
          <TabsTrigger value="order">Order details</TabsTrigger>
          {showTreatmentTab({
            isPlanner: isAdmin || user?.role === UserRole.DESIGNER,
            hasTreatmentPlans: (order.treatmentPlansCount ?? 0) > 0,
          }) && (
            <TabsTrigger value="treatment-plans" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Treatment plans
              {(order.treatmentPlansCount ?? 0) > 0 && (
                <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {order.treatmentPlansCount}
                </span>
              )}
              {needsTreatmentAttention({
                role: user?.role,
                latestPlanStatus: order.latestPlanStatus,
              }) && <AttentionDot />}
            </TabsTrigger>
          )}
          {showQuoteTab({
            isPlanner: isAdmin || user?.role === UserRole.DESIGNER,
            hasQuotation: hasQuotationSignal,
          }) && (
            <TabsTrigger value="quote" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Quote
              {needsQuoteAttention({
                role: user?.role,
                status: quotationQuery.data?.status,
              }) && <AttentionDot />}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent
          value="order"
          forceMount
          className="space-y-6 data-[state=inactive]:hidden"
        >
          {mountedTabs.has('order') && (
            <>
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
          {/* Odontogram FIRST — same as in the wizard's step 5. We pass
              the planner-added IPR map so the read-only view also shows
              purple bars between teeth where IPR is planned. The setter is
              omitted intentionally — the order page is view-only here;
              IPR editing lives in the treatment-plan review screen. */}
          <OdontogramSelector
            value={order.toothInstructions ?? []}
            onChange={() => undefined}
            disabled
            iprValues={
              new Map(
                (order.toothInstructions ?? [])
                  .filter(
                    (i) =>
                      i.type === 'ipr_value' &&
                      !!i.value &&
                      i.value.trim().length > 0,
                  )
                  .map((i) => [i.toothNumber, i.value as string]),
              )
            }
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
            </>
          )}
        </TabsContent>

        {/* Treatment-plans tab — separate so the chat/timeline doesn't
            fight the patient record for visual real-estate. It mounts only
            after first open, then stays alive so the WebSocket connection
            isn't torn down when the doctor flips back to Order details.

            The "Action required — review this plan" message + approve /
            reject buttons live at the BOTTOM of this tab (rendered by
            TreatmentPlanReview's ApprovalActions card). No separate
            page-level footer — the action card is the message. */}
        <TabsContent
          value="treatment-plans"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          {mountedTabs.has('treatment-plans') ? (
            <TreatmentPlansSection orderId={order.id} role={user?.role as UserRole} />
          ) : null}
        </TabsContent>

        {/* Quote tab — admin issues, doctor approves / rejects. Also
            lazy-mounted, so quotation forms don't block the order summary. */}
        <TabsContent
          value="quote"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          {mountedTabs.has('quote') ? (
            <QuoteReview orderId={order.id} role={user?.role as UserRole} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab visibility / default / attention helpers ─────────────────────────

/**
 * Order statuses that imply a quotation has already been issued. Used as
 * a synchronous fallback for the default-tab calculation so the page
 * doesn't have to wait for the /quotations/order/:id query to settle
 * before deciding which tab opens first.
 */
const POST_QUOTE_STATUSES = new Set<OrderStatus>([
  OrderStatus.QUOTATION_SENT,
  OrderStatus.PAYMENT_PLAN_SELECTED,
  OrderStatus.PAYMENT_PENDING,
  OrderStatus.PAYMENT_REVIEW,
  OrderStatus.PAID,
  OrderStatus.FABRICATION,
  OrderStatus.READY_TO_SHIP,
  OrderStatus.SHIPPED,
  OrderStatus.FINISHED,
]);

/**
 * Pick the initial tab on first mount.
 * Priority: existing quote → existing treatment plan → order details.
 * `hasQuotation` lags by one render-tick on first paint (async query);
 * we compensate by also treating any post-quote OrderStatus as proof
 * that a quote exists.
 */
function computeDefaultTab(args: {
  status: OrderStatus;
  hasTreatmentPlans: boolean;
  hasQuotation: boolean;
}): 'order' | 'treatment-plans' | 'quote' {
  if (args.hasQuotation || POST_QUOTE_STATUSES.has(args.status)) {
    return 'quote';
  }
  if (args.hasTreatmentPlans) {
    return 'treatment-plans';
  }
  return 'order';
}

/** Treatment-plans tab is shown for planners always, doctors only when content exists. */
function showTreatmentTab(args: {
  isPlanner: boolean;
  hasTreatmentPlans: boolean;
}): boolean {
  return args.isPlanner || args.hasTreatmentPlans;
}

/** Quote tab is shown for planners always, doctors only when a quote exists. */
function showQuoteTab(args: {
  isPlanner: boolean;
  hasQuotation: boolean;
}): boolean {
  return args.isPlanner || args.hasQuotation;
}

/**
 * Does the treatment tab need the doctor / planner's attention?
 * – Doctor: a plan is "ready" → they should approve or reject.
 * – Planner: the doctor just reacted (approved / rejected).
 */
function needsTreatmentAttention(args: {
  role: UserRole | undefined;
  latestPlanStatus?: TreatmentPlanStatus;
}): boolean {
  if (!args.latestPlanStatus) return false;
  if (args.role === UserRole.DENTIST) {
    return args.latestPlanStatus === TreatmentPlanStatus.READY;
  }
  if (
    args.role === UserRole.ADMIN ||
    args.role === UserRole.SUPER_ADMIN ||
    args.role === UserRole.DESIGNER
  ) {
    return (
      args.latestPlanStatus === TreatmentPlanStatus.APPROVED ||
      args.latestPlanStatus === TreatmentPlanStatus.REJECTED
    );
  }
  return false;
}

/** Same logic but for the quotation lifecycle. */
function needsQuoteAttention(args: {
  role: UserRole | undefined;
  status?: QuotationStatus;
}): boolean {
  if (!args.status) return false;
  if (args.role === UserRole.DENTIST) {
    return args.status === QuotationStatus.SENT;
  }
  if (
    args.role === UserRole.ADMIN ||
    args.role === UserRole.SUPER_ADMIN ||
    args.role === UserRole.DESIGNER
  ) {
    return (
      args.status === QuotationStatus.APPROVED ||
      args.status === QuotationStatus.REJECTED
    );
  }
  return false;
}

/**
 * Small pulsing dot rendered inside a TabsTrigger to signal "you have
 * something to look at here". Pulses primary so it pops without being
 * shouty like a destructive red would.
 */
function AttentionDot() {
  return (
    <span className="relative ml-1 flex h-2 w-2" aria-label="New activity">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
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

  // Order-scoped socket: keeps the plan list in sync (admin creating a
  // new plan → doctor sees it appear without a refresh) AND drives the
  // conversation's live indicator. Mounted once per order, so it
  // survives plan-tab switches and is alive even when zero plans exist.
  const { connected: socketConnected } = useTreatmentChatSocket(orderId);

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
        <TreatmentPlanReview
          treatmentPlanId={activeId}
          role={role}
          socketConnected={socketConnected}
        />
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

/**
 * Treatment-fee gate banner.
 *
 * Visibility rules (server-side gate mirrored here as UX guidance):
 *  • Show ONLY when the order has been submitted at least once
 *    (treatment fee on a draft makes no sense).
 *  • If `treatmentFeePaidAt` is set → green "paid" confirmation card.
 *  • If `defaultTreatmentFee` from CompanyBillingSettings is 0 → render
 *    nothing (legacy / fee-free tenants keep the previous flow).
 *  • Otherwise → amber "fee pending" card with an action button.
 *
 * Action affordance:
 *  • Doctor sees "Pay treatment fee" — currently records as paid; a
 *    full doctor-self-pay flow can be wired to the Payments service in
 *    a follow-up. For now the action does the same DB write the admin
 *    would do, so the gate clears either way.
 *  • Admin sees "Mark as paid" — for cash / bank-transfer collection
 *    recorded out-of-band.
 */
function TreatmentFeeGateBanner({
  order,
  canActAsAdmin,
  canActAsDoctor,
}: {
  order: import('@/lib/types').DentalOrder;
  canActAsAdmin: boolean;
  canActAsDoctor: boolean;
}) {
  const { data: settings } = useCompanyBilling();
  const markPaid = useMarkTreatmentFeePaid();

  const fee = settings?.defaultTreatmentFee ?? 0;
  const currency = settings?.defaultCurrency ?? 'TND';
  // Don't fire on drafts — fee semantics don't apply until submission.
  const isSubmitted = order.status !== OrderStatus.DRAFT;
  // Tenants without a treatment fee → no banner.
  if (!isSubmitted || fee <= 0) return null;
  const isPaid = !!order.treatmentFeePaidAt;

  if (isPaid) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              Treatment fee paid
            </p>
            <p className="text-xs text-emerald-800/80">
              Amount: {order.treatmentFeeAmount ?? fee} {currency}
              {order.treatmentFeePaidAt &&
                ` · Paid ${format(new Date(order.treatmentFeePaidAt), 'MMM d, yyyy')}`}
              . The treatment plan can now be sent.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const canAct = canActAsAdmin || canActAsDoctor;
  const actionLabel = canActAsAdmin ? 'Mark as paid' : 'Pay treatment fee';

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-900">
            Awaiting treatment fee — {fee} {currency}
          </p>
          <p className="text-xs text-amber-800/80">
            The professional fee must be settled before the admin can send
            the treatment plan. This is a one-time payment per order.
          </p>
        </div>
        {canAct && (
          <Button
            type="button"
            size="sm"
            className="bg-amber-600 hover:bg-amber-700"
            disabled={markPaid.isPending}
            onClick={() => markPaid.mutate({ id: order.id, amount: fee })}
          >
            {markPaid.isPending ? 'Saving…' : actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
