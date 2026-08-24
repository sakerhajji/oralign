'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format, type Locale } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import {
  ArrowLeft,
  Camera,
  ClipboardCheck,
  Edit,
  FileArchive,
  ListChecks,
  Loader2,
  ScanLine,
  ShieldCheck,
  Target,
  Trash2,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { formatChiefComplaint } from '@/lib/chief-complaint';
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
  dashboardKeys,
  useBillingPublicDefaults,
  useDeleteOrder,
  useOrder,
  usePatient,
} from '@/lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useQuotationForOrder } from '@/lib/hooks/use-quotations';
import { ordersService } from '@/lib/api/orders.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { TreatmentFeePaymentDialog } from '@/components/orders/treatment-fee-payment-dialog';
import { TreatmentFeeReceiptDialog } from '@/components/orders/treatment-fee-receipt-dialog';
import { useAuth } from '@/lib/providers/auth-provider';
import { useT } from '@/lib/i18n/lang-context';
import {
  Gender,
  OrderFileCategory,
  OrderStatus,
  QuotationStatus,
  TreatmentPlanStatus,
  UserRole,
  type OrderFile,
} from '@/lib/types';
import { formatPrice } from '@/lib/utils/currency';
import { formatBytes } from '@/lib/utils/bytes';
import { safeDashboardReturnTo } from '@/lib/orders/order-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * CBCT delivery status derived from the order's ZIP bundle files:
 * none uploaded → awaiting; any still in the async pipeline →
 * processing; any failed → failed; otherwise uploaded.
 */
function cbctFilesStatus(
  files: OrderFile[],
): 'awaiting' | 'processing' | 'failed' | 'uploaded' {
  const zips = files.filter((f) => f.category === OrderFileCategory.ZIP);
  if (zips.length === 0) return 'awaiting';
  if (zips.some((f) => f.processingStatus === 'failed')) return 'failed';
  if (
    zips.some(
      (f) =>
        f.processingStatus === 'pending' || f.processingStatus === 'processing',
    )
  ) {
    return 'processing';
  }
  return 'uploaded';
}

// Defer the odontogram (its sprite payload is heavy) until the page mounts.
function OdontogramLoading() {
  const { t } = useT();
  return (
    <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
      {t('orderDetail.loadingOdontogram')}
    </div>
  );
}

const OdontogramSelector = dynamic(
  () =>
    import('@/components/orders/odontogram-selector').then((m) => ({
      default: m.OdontogramSelector,
    })),
  {
    ssr: false,
    loading: () => <OdontogramLoading />,
  },
);

type OrderDetailTab = 'order' | 'treatment-plans' | 'quote';

const ORDER_DETAIL_TAB_TRIGGER_CLASS =
  'group flex h-12 min-w-0 w-full items-center justify-center gap-2.5 rounded-lg border border-transparent px-4 text-center text-sm font-semibold text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:h-14';

const ORDER_DETAIL_TAB_ICON_CLASS =
  'grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border/70 bg-background/70 text-muted-foreground transition-colors group-data-[state=active]:border-primary group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground';

// Stable no-op + empty fallback for the read-only odontogram — inline
// `() => undefined` / `?? []` literals would mint new identities per page
// render and defeat the selector's memo boundary.
const NOOP_TOOTH_CHANGE = () => undefined;
const EMPTY_INSTRUCTIONS: never[] = [];

// Locale-aware date helpers. FR uses "d MMM yyyy" (e.g. "8 juin 2026")
// matching the orders list page so dates read consistently.
const dateLocale = (lang: 'en' | 'fr'): Locale | undefined =>
  lang === 'fr' ? frLocale : undefined;
const dateFmt = (lang: 'en' | 'fr') =>
  lang === 'fr' ? 'd MMM yyyy' : 'MMM d, yyyy';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderQuery = useOrder(params.id);
  const deleteOrder = useDeleteOrder();
  const { isAdmin, isDentist, user } = useAuth();
  const { t, lang } = useT();
  const requestedTab = parseOrderDetailTab(searchParams.get('tab'));
  const returnHref =
    safeDashboardReturnTo(searchParams.get('returnTo')) ?? '/dashboard/orders';

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

  // ── Admin "seen" marker ─────────────────────────────────────────────
  // The first time an admin opens an order, stamp `adminSeenAt` server-
  // side so the sidebar "new orders" badge clears once the order has been
  // checked. Idempotent on the backend; the ref limits it to one call per
  // order id, and on a fresh stamp we refresh the badge immediately rather
  // than waiting for the 30s poll. Non-admins are skipped entirely.
  const queryClient = useQueryClient();
  const seenMarkedForRef = useRef<string | null>(null);
  useEffect(() => {
    const id = orderQuery.data?.id;
    if (!id || !isAdmin || seenMarkedForRef.current === id) return;
    seenMarkedForRef.current = id;
    ordersService
      .markSeen(id)
      .then((res) => {
        if (res.seen) {
          queryClient.invalidateQueries({
            queryKey: dashboardKeys.adminSidebarBadges(),
          });
        }
      })
      .catch(() => {
        // Non-critical — the badge's 30s poll reconciles regardless.
        seenMarkedForRef.current = null;
      });
  }, [orderQuery.data?.id, isAdmin, queryClient]);

  // ── Admin / designer: download ALL files + data as one ZIP ──────────
  // Fetches the archive as a blob through the authed apiClient (a plain
  // <a href> can't carry the Bearer token), then triggers a browser
  // save. State guards against a double-click while a large CBCT order
  // is still streaming.
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadingSheet, setDownloadingSheet] = useState(false);
  // Fiche commande seule (PDF): donnees + plan approuve. Contrairement au
  // ZIP labo, le dentiste proprietaire y a droit — le backend refuse les
  // commandes d'autrui.
  const handleDownloadSheet = async () => {
    const current = orderQuery.data;
    if (!current || downloadingSheet) return;
    setDownloadingSheet(true);
    const pendingToast = toast.loading(t('orderDetail.sheet.preparing'));
    try {
      const blob = await ordersService.downloadOrderSheet(current.id, lang);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${lang === 'en' ? 'ORDER SHEET' : 'FICHE COMMANDE'} - ${current.orderCode}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success(t('orderDetail.sheet.success'), { id: pendingToast });
    } catch {
      toast.error(t('orderDetail.sheet.error'), { id: pendingToast });
    } finally {
      setDownloadingSheet(false);
    }
  };
  const handleDownloadAllZip = async () => {
    const current = orderQuery.data;
    if (!current || downloadingZip) return;
    setDownloadingZip(true);
    const pendingToast = toast.loading(t('orderDetail.downloadAll.preparing'));
    try {
      // Swap the static "preparing" label for live received-bytes as soon
      // as the stream starts, so a multi-hundred-MB CBCT export visibly
      // progresses instead of looking stuck. Throttled to whole MB so the
      // toast doesn't re-render on every chunk.
      let lastShownMb = -1;
      const blob = await ordersService.downloadAllZip(current.id, (loaded) => {
        const mb = Math.floor(loaded / (1024 * 1024));
        if (mb <= lastShownMb) return;
        lastShownMb = mb;
        toast.loading(
          t('orderDetail.downloadAll.downloading', {
            size: formatBytes(loaded),
          }),
          { id: pendingToast },
        );
      }, lang);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const safeCode = (current.orderCode || current.id).replace(
        /[^\w.-]+/g,
        '_',
      );
      link.download = `order-${safeCode}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success(t('orderDetail.downloadAll.success'), { id: pendingToast });
    } catch (error) {
      toast.error(extractApiErrorMessage(error), { id: pendingToast });
    } finally {
      setDownloadingZip(false);
    }
  };

  const defaultTab = useMemo<OrderDetailTab>(() => {
    if (!orderQuery.data) return 'order';
    return computeDefaultTab({
      status: orderQuery.data.status,
      hasTreatmentPlans: (orderQuery.data.treatmentPlansCount ?? 0) > 0,
      hasQuotation: !!quotationQuery.data,
    });
  }, [
    orderQuery.data,
    quotationQuery.data,
  ]);

  const initialTab = useMemo<OrderDetailTab>(() => {
    if (!orderQuery.data) return 'order';
    return resolveRequestedTab({
      requestedTab,
      defaultTab,
      isPlanner: isAdmin || user?.role === UserRole.DESIGNER,
      hasTreatmentPlans: (orderQuery.data.treatmentPlansCount ?? 0) > 0,
      hasQuotation:
        !!quotationQuery.data ||
        POST_QUOTE_STATUSES.has(orderQuery.data.status),
    });
  }, [
    defaultTab,
    isAdmin,
    orderQuery.data,
    quotationQuery.data,
    requestedTab,
    user?.role,
  ]);

  useEffect(() => {
    const orderId = orderQuery.data?.id;
    if (!orderId) return;

    const initKey = `${orderId}:${requestedTab ?? 'default'}`;
    if (initializedOrderIdRef.current === initKey) return;

    initializedOrderIdRef.current = initKey;
    setActiveTab(initialTab);
    setMountedTabs(new Set([initialTab]));
  }, [initialTab, orderQuery.data?.id, requestedTab]);

  useEffect(() => {
    setMountedTabs((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const handleTabChange = (value: string) => {
    const nextTab = parseOrderDetailTab(value);
    if (!nextTab) return;

    setActiveTab(nextTab);
    setMountedTabs((current) => new Set([...current, nextTab]));

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('tab', nextTab);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  // Legacy per-tooth IPR map for the read-only odontogram. Memoized —
  // this used to be built inline in JSX, so EVERY page render (tab
  // switches, dialog toggles, query settles) re-filtered the instruction
  // list, built a fresh Map and broke the odontogram's memo boundary.
  const orderToothInstructions = orderQuery.data?.toothInstructions;
  const legacyIprValues = useMemo(() => {
    const instructions = orderToothInstructions ?? [];
    return new Map(
      instructions
        .filter(
          (i) =>
            i.type === 'ipr_value' && !!i.value && i.value.trim().length > 0,
        )
        .map((i) => [i.toothNumber, i.value as string]),
    );
  }, [orderToothInstructions]);

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
              {t('orderDetail.orderNotFound')}
            </p>
            <Button asChild variant="outline">
              <Link href={returnHref}>{t('orderDetail.backToOrders')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const order = orderQuery.data;
  const patient = patientQuery.data;
  const canManage = isAdmin || isDentist;
  // Once the treatment fee is paid, a non-admin (the owning doctor) can no
  // longer edit or delete the order — mirrors the backend guard. Admins
  // keep full control.
  const paidLocked = !!order.treatmentFeePaidAt && !isAdmin;
  const canEditOrder = canManage && !paidLocked;
  const hasQuotationSignal =
    !!quotationQuery.data || POST_QUOTE_STATUSES.has(order.status);
  const isPlanner = isAdmin || user?.role === UserRole.DESIGNER;
  const hasTreatmentPlans = (order.treatmentPlansCount ?? 0) > 0;
  const shouldShowTreatmentPlansTab = showTreatmentTab({
    isPlanner,
    hasTreatmentPlans,
  });
  const shouldShowQuoteTab = showQuoteTab({
    isPlanner,
    hasQuotation: hasQuotationSignal,
  });
  const tabListColumns =
    shouldShowTreatmentPlansTab && shouldShowQuoteTab
      ? 'sm:grid-cols-3'
      : shouldShowTreatmentPlansTab || shouldShowQuoteTab
        ? 'sm:grid-cols-2'
        : 'sm:grid-cols-1';

  // Extractions summary — the doctor marks teeth for extraction on the
  // odontogram (tooth instructions of type 'extract'); `order.extractions`
  // is only the free-text note. Combine the flagged FDI teeth (sorted) with
  // the note so the résumé reflects what was actually selected, not just the
  // optional comment. Mirrors the wizard's ReviewStep summary.
  const extractionTeeth = (order.toothInstructions ?? [])
    .filter((i) => i.type === 'extract')
    .map((i) => i.toothNumber)
    .sort((a, b) => a - b);
  const extractionsSummary =
    [extractionTeeth.join(', '), (order.extractions ?? '').trim()]
      .filter(Boolean)
      .join(' · ') || undefined;

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
      <header className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="mb-1 px-0">
            <Link href={returnHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('orderDetail.backToList')}
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 break-all text-2xl font-bold tracking-tight sm:text-3xl">
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
                    className="h-8 gap-1.5 text-xs"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {t('orderDetail.changeStatus')}
                  </Button>
                }
              />
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('orderDetail.createdOn')}{' '}
            {format(new Date(order.createdAt), dateFmt(lang), { locale: dateLocale(lang) })}
            {order.submittedAt
              ? ` · ${t('orderDetail.submittedOn')} ${format(new Date(order.submittedAt), dateFmt(lang), { locale: dateLocale(lang) })}`
              : ''}
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap sm:justify-end">
          {/* Fiche commande (PDF) — pour TOUS les roles, y compris le
              dentiste: c'est sa commande et le plan qu'il a approuve. */}
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadSheet}
            disabled={downloadingSheet}
            className="h-10 w-full justify-center sm:w-auto"
          >
            {downloadingSheet ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            {t('orderDetail.sheet.label')}
          </Button>
          {/* Admin / designer bulk export — pulls EVERY order file plus
              an order-data.json into a single ZIP. Hidden from doctors:
              the backend also rejects them (planner-only RBAC). */}
          {(isAdmin || user?.role === UserRole.DESIGNER) && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadAllZip}
              disabled={downloadingZip}
              className="h-10 w-full justify-center sm:w-auto"
            >
              {downloadingZip ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileArchive className="mr-2 h-4 w-4" />
              )}
              {t('orderDetail.downloadAll.label')}
            </Button>
          )}
          {canEditOrder && (
            <Button asChild>
              <Link
                href={`/dashboard/orders/${order.id}/edit`}
                className="h-10 w-full justify-center sm:w-auto"
              >
                <Edit className="mr-2 h-4 w-4" />
                {t('common.edit')}
              </Link>
            </Button>
          )}
          {canEditOrder && (
            <OrderDeleteAction
              title={t('orderDetail.delete') + ' ?'}
              description={t('orderDetail.deleteDescription')}
              actionLabel={t('common.delete')}
              cancelLabel={t('common.cancel')}
              icon={<Trash2 className="mr-2 h-4 w-4" />}
              disabled={deleteOrder.isPending}
              onConfirm={() =>
                deleteOrder.mutate(order.id, {
                  onSuccess: () => router.push(returnHref),
                })
              }
            />
          )}
          {/* Permanent deletion is trash-first: it lives in the orders
              trash view (admin), never on a live order's page. */}
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
        onValueChange={handleTabChange}
      >
        <div className="w-full rounded-xl border bg-muted/50 p-1.5 shadow-sm">
          <TabsList
            className={`grid !h-auto w-full grid-cols-1 items-stretch gap-1 bg-transparent p-0 ${tabListColumns}`}
          >
            <TabsTrigger value="order" className={ORDER_DETAIL_TAB_TRIGGER_CLASS}>
              <span className={ORDER_DETAIL_TAB_ICON_CLASS}>
                <ListChecks className="h-4 w-4" />
              </span>
              <span className="min-w-0 truncate">
                {t('orderDetail.tabs.details')}
              </span>
            </TabsTrigger>
            {shouldShowTreatmentPlansTab && (
              <TabsTrigger
                value="treatment-plans"
                className={ORDER_DETAIL_TAB_TRIGGER_CLASS}
              >
                <span className={ORDER_DETAIL_TAB_ICON_CLASS}>
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="min-w-0 truncate">
                  {t('orderDetail.tabs.treatmentPlan')}
                </span>
                {hasTreatmentPlans && (
                  <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                    {order.treatmentPlansCount}
                  </span>
                )}
                {needsTreatmentAttention({
                  role: user?.role,
                  latestPlanStatus: order.latestPlanStatus,
                }) && <AttentionDot />}
              </TabsTrigger>
            )}
            {shouldShowQuoteTab && (
              <TabsTrigger
                value="quote"
                className={ORDER_DETAIL_TAB_TRIGGER_CLASS}
              >
                <span className={ORDER_DETAIL_TAB_ICON_CLASS}>
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 truncate">
                  {t('orderDetail.tabs.quote')}
                </span>
                {needsQuoteAttention({
                  role: user?.role,
                  status: quotationQuery.data?.status,
                }) && <AttentionDot />}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent
          value="order"
          forceMount
          className="space-y-6 data-[state=inactive]:hidden"
        >
          {mountedTabs.has('order') && (
            <>
      {/* ─── 1 · Patient information ──────────────────────────────────── */}
      <Section icon={UserRound} title={t('orderDetail.patientCard.title')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label={t('orderForm.patient.pickerLabel')} value={order.patient?.fullName} />
          <Info label={t('orderDetail.patientCard.dentist')} value={order.doctor?.fullName} />
          <Info label={t('orderDetail.patientCard.stage')} value={order.patientStage} />
          <Info label={t('orderDetail.patientCard.sex')} value={genderLabel(patient?.gender, t)} />
          <Info label={t('orderDetail.patientCard.dob')} value={formatBirthDate(patient?.dateOfBirth, lang)} />
          <Info label={t('orderForm.patient.age')} value={ageFromDob(patient?.dateOfBirth, t)} />
          <Info label={t('orderDetail.patientCard.email')} value={order.patient?.email} />
          <Info label={t('orderDetail.patientCard.phone')} value={order.patient?.phone} />
          <Info label={t('orderDetail.patientCard.arch')} value={order.archTreatment} />
          {patient?.address && (
            <Info label={t('orderDetail.patientCard.address')} value={patient.address} wide />
          )}
          {patient?.notes && (
            <Info label={t('orderDetail.patientCard.notes')} value={patient.notes} wide />
          )}
        </div>
      </Section>

      {/* ─── 2 · Patient images ───────────────────────────────────────── */}
      <Section icon={Camera} title={t('orderDetail.sections.patientImages')}>
        <ClinicalOrderFiles
          orderId={order.id}
          readOnly
          section="patient-images"
        />
      </Section>

      {/* ─── 3 · Radiography & STL scans ──────────────────────────────── */}
      <Section icon={ScanLine} title={t('orderDetail.sections.radiographyScans')}>
        <ClinicalOrderFiles
          orderId={order.id}
          readOnly
          section="radiography-stl"
          cbctRequested={!!order.useCbctWithScans}
        />
      </Section>

      {/* ─── 4 · Treatment plan ───────────────────────────────────────── */}
      <Section icon={Target} title={t('orderDetail.sections.clinicalObjective')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Info label={t('orderForm.treatment.chiefComplaint')} value={formatChiefComplaint(order.chiefComplaint, t)} wide />
          <Info label={t('orderForm.steps.treatment')} value={order.treatmentPlan} wide />
          <Info label={t('orderForm.treatment.apRelationship')} value={order.apRelationship} />
        </div>
      </Section>

      {/* ─── 5 · Movement & tooth-level instructions ──────────────────── */}
      <Section
        icon={ListChecks}
        title={t('orderDetail.sections.toothLevel')}
      >
        <div className="space-y-8">
          {/* Odontogram FIRST — same as in the wizard's step 5. We pass
              the planner-added IPR map so the read-only view also shows
              purple bars between teeth where IPR is planned. The setter is
              omitted intentionally — the order page is view-only here;
              IPR editing lives in the treatment-plan review screen. */}
          <OdontogramSelector
            value={order.toothInstructions ?? EMPTY_INSTRUCTIONS}
            onChange={NOOP_TOOTH_CHANGE}
            disabled
            iprValues={legacyIprValues}
          />

          {/* Mechanics summary below the chart */}
          <div className="border-t pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Info label={t('orderDetail.movement.elastics')} value={order.elastics} wide />
              <Info label={t('orderDetail.movement.openBite')} value={order.openBite} />
              <Info label={t('orderDetail.movement.midline')} value={order.midline} />
              <Info label={t('orderDetail.movement.ipr')} value={order.ipr} />
              <Info label={t('orderDetail.movement.biteRamps')} value={order.biteRamps} />
              <Info
                label={t('orderDetail.movement.expansion')}
                value={order.expansion ?? t('orderDetail.movement.noExpansion')}
              />
              <Info label={t('orderDetail.movement.crossbite')} value={order.crossbite} />
              <Info label={t('orderDetail.movement.spaces')} value={order.spaces} wide />
              <Info label={t('orderDetail.movement.extractions')} value={extractionsSummary} wide />
            </div>
          </div>

          {(order.specialInstructions || order.additionalInstructions) && (
            <div className="border-t pt-6">
              <div className="grid gap-4">
                <Info
                  label={t('orderDetail.movement.specialInstructions')}
                  value={order.specialInstructions}
                  wide
                />
                <Info
                  label={t('orderDetail.movement.additionalNotes')}
                  value={order.additionalInstructions}
                  wide
                />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Bottom meta block — small, low-priority info that used to be
          in a "Summary" sidebar but is more honest at the end.
          Manufacturing + Materials were dropped at the clinic's
          request: the lab handles fabrication + material choice
          internally, so surfacing them on the doctor-facing order
          was noise. CBCT + order code are the meaningful metadata. */}
      <Section icon={ClipboardCheck} title={t('orderDetail.sections.orderMetadata')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Info
            label={t('orderDetail.metadata.cbctRequested')}
            value={order.useCbctWithScans ? t('orderDetail.metadata.yes') : t('orderDetail.metadata.no')}
          />
          <Info
            label={t('orderDetail.metadata.orderCode')}
            value={order.orderCode}
          />
          {/* CBCT paid supplement — the price snapshotted on THIS order
              when CBCT was requested (config changes never reprice it). */}
          {(order.cbctFeeAmount ?? 0) > 0 && (
            <Info
              label={t('orderDetail.metadata.cbctSupplement')}
              value={formatPrice(
                order.cbctFeeAmount ?? 0,
                order.cbctFeeCurrency ?? 'TND',
              )}
            />
          )}
          {/* CBCT delivery status, derived from the ZIP bundle files. */}
          {order.useCbctWithScans && (
            <Info
              label={t('orderDetail.metadata.cbctFiles')}
              value={t(`orderDetail.metadata.cbctStatus.${cbctFilesStatus(order.files ?? [])}`)}
            />
          )}
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

function parseOrderDetailTab(value: string | null): OrderDetailTab | null {
  if (
    value === 'order' ||
    value === 'treatment-plans' ||
    value === 'quote'
  ) {
    return value;
  }
  return null;
}

function resolveRequestedTab(args: {
  requestedTab: OrderDetailTab | null;
  defaultTab: OrderDetailTab;
  isPlanner: boolean;
  hasTreatmentPlans: boolean;
  hasQuotation: boolean;
}): OrderDetailTab {
  if (!args.requestedTab) {
    return args.defaultTab;
  }
  if (args.requestedTab === 'order') {
    return 'order';
  }
  if (
    args.requestedTab === 'treatment-plans' &&
    showTreatmentTab({
      isPlanner: args.isPlanner,
      hasTreatmentPlans: args.hasTreatmentPlans,
    })
  ) {
    return 'treatment-plans';
  }
  if (
    args.requestedTab === 'quote' &&
    showQuoteTab({
      isPlanner: args.isPlanner,
      hasQuotation: args.hasQuotation,
    })
  ) {
    return 'quote';
  }
  return args.defaultTab;
}

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
  const { t } = useT();
  return (
    <span className="relative ml-1 flex h-2 w-2 shrink-0" aria-label={t('orderDetail.newActivity')}>
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

type TFn = (path: string, vars?: Record<string, string | number>) => string;

function genderLabel(gender: string | null | undefined, t: TFn): string | undefined {
  switch (gender) {
    case Gender.MALE:
      return t('orderDetail.gender.male');
    case Gender.FEMALE:
      return t('orderDetail.gender.female');
    case Gender.OTHER:
      return t('orderDetail.gender.other');
    default:
      return undefined;
  }
}

function formatBirthDate(dob: string | null | undefined, lang: 'en' | 'fr'): string | undefined {
  if (!dob) return undefined;
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return undefined;
  return format(date, dateFmt(lang), { locale: dateLocale(lang) });
}

/**
 * Compute the patient's age from their date of birth.
 * Returns "32 yrs" for adults, "2 yrs 4 mo" for toddlers (treatment-planning
 * for paediatric / growing patients hinges on this granularity).
 */
function ageFromDob(dob: string | null | undefined, t: TFn): string | undefined {
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
    const yrLabel = years === 1 ? t('orderDetail.age.yr') : t('orderDetail.age.yrs');
    return `${years} ${yrLabel}${months > 0 ? ` ${months} ${t('orderDetail.age.mo')}` : ''}`;
  }
  return `${years} ${t('orderDetail.age.yrs')}`;
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
  const { t } = useT();

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
        {t('orderDetail.plans.loading')}
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
              {t('orderDetail.plans.newPlan')}
            </Button>
          )}
        </div>
      )}
      {plans.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {t('orderDetail.plans.empty')}
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
                {t('orderDetail.plans.createFirst')}
              </Button>
            </div>
          )}
        </div>
      ) : activeId ? (
        <TreatmentPlanReview
          treatmentPlanId={activeId}
          role={role}
          socketConnected={socketConnected}
          onPlanCreated={setSelectedId}
        />
      ) : null}
    </div>
  );
}

function OrderDeleteAction({
  title,
  description,
  actionLabel,
  cancelLabel,
  icon,
  disabled,
  destructive,
  onConfirm,
}: {
  title: string;
  description: string;
  actionLabel: string;
  cancelLabel: string;
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
          className="h-10 w-full justify-center sm:w-auto"
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
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
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
  // Doctor-safe public-defaults endpoint, same as the payment dialog.
  // Was previously `useCompanyBilling()` which hits the admin-only
  // /admin/company-billing-settings route — for a dentist it returned
  // 403, `settings` was undefined, fee fell through to 0, and the
  // banner returned `null` early. Result: a submitted-but-unpaid
  // order showed no "Pay treatment fee" CTA at all, and the doctor
  // couldn't action it. This swap is the same fix we already applied
  // to TreatmentFeePaymentDialog — the banner is the second consumer
  // of the same setting and needed the same treatment.
  const { data: defaults } = useBillingPublicDefaults();
  const [payOpen, setPayOpen] = useState(false);
  // The receipt-viewer modal — opened from the awaiting-confirmation
  // banner. Replaces the previous "click Confirm and hope" flow with
  // "view the proof → click Confirm in the same modal".
  const [receiptOpen, setReceiptOpen] = useState(false);
  const { t, lang } = useT();

  const fee = defaults?.defaultTreatmentFee ?? 0;
  const currency = defaults?.defaultCurrency ?? 'TND';
  const isSubmitted = order.status !== OrderStatus.DRAFT;
  if (!isSubmitted || fee <= 0) return null;

  const isPaid = !!order.treatmentFeePaidAt;
  // The three intermediate states we care about:
  //   • awaiting_confirmation → bank-transfer proof uploaded, admin
  //     hasn't confirmed yet. Show a different banner that lets the
  //     admin confirm one tap (or surfaces "waiting for admin" to
  //     the doctor).
  const awaitingConfirm =
    !isPaid && order.treatmentFeePaymentStatus === 'awaiting_confirmation';

  if (isPaid) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-900">
              {t('orderDetail.fee.titlePaid')}
            </p>
            <p className="text-xs text-emerald-800/80">
              {order.treatmentFeeAmount ?? fee} {currency}
              {order.treatmentFeePaymentMethod &&
                ` · ${t('orderDetail.feeBanner.paidViaSuffix', { method: order.treatmentFeePaymentMethod.replace('_', ' ') })}`}
              {order.treatmentFeePaidAt &&
                ` · ${format(new Date(order.treatmentFeePaidAt), dateFmt(lang), { locale: dateLocale(lang) })}`}
              . {t('orderDetail.feeBanner.paidHint')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (awaitingConfirm) {
    return (
      <>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-900">
                {t('orderDetail.feeBanner.pendingTitle', {
                  amount: String(order.treatmentFeeAmount ?? fee),
                  currency,
                })}
              </p>
              <p className="text-xs text-blue-800/80">
                {canActAsAdmin
                  ? t('orderDetail.fee.adminPendingHint')
                  : t('orderDetail.fee.doctorPendingHint')}
              </p>
            </div>
            {/*
              Two-button strip — admins get "View receipt & confirm"
              which opens the proof in a modal with the Confirm action
              embedded; doctors get a read-only "View receipt" so they
              can verify what they uploaded.
             */}
            <div className="flex flex-wrap items-center gap-2">
              {order.treatmentFeeProofPath && (
                <Button
                  type="button"
                  size="sm"
                  variant={canActAsAdmin ? 'outline' : 'default'}
                  className={
                    canActAsAdmin
                      ? 'border-blue-300 bg-white text-blue-900 hover:bg-blue-100'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }
                  onClick={() => setReceiptOpen(true)}
                >
                  {t('orderDetail.fee.viewReceipt')}
                </Button>
              )}
              {canActAsAdmin && (
                <Button
                  type="button"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => setReceiptOpen(true)}
                >
                  {t('orderDetail.fee.adminConfirm')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <TreatmentFeeReceiptDialog
          open={receiptOpen}
          onOpenChange={setReceiptOpen}
          orderId={order.id}
          orderCode={order.orderCode}
          proofPath={order.treatmentFeeProofPath ?? null}
          amount={Number(order.treatmentFeeAmount ?? fee)}
          currency={currency}
          doctorName={order.doctor?.fullName ?? null}
          patientName={order.patient?.fullName ?? null}
          method={order.treatmentFeePaymentMethod ?? null}
          // The order doesn't carry a dedicated "treatment fee submitted at"
          // timestamp — but updatedAt is the most recent edit (the receipt
          // upload is the latest write in awaiting-confirmation state), so
          // it's the right approximation. Falls back gracefully if missing.
          submittedAt={order.updatedAt ?? null}
          canConfirm={canActAsAdmin}
        />
      </>
    );
  }

  const canAct = canActAsAdmin || canActAsDoctor;
  return (
    <>
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {t('orderDetail.feeBanner.awaitingTitle', { amount: String(fee), currency })}
            </p>
            <p className="text-xs text-amber-800/80">
              {t('orderDetail.feeBanner.awaitingHint')}
            </p>
          </div>
          {canAct && (
            <Button
              type="button"
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => setPayOpen(true)}
            >
              {t('orderDetail.fee.doctorPay')}
            </Button>
          )}
        </CardContent>
      </Card>
      <TreatmentFeePaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        order={order}
        isAdmin={canActAsAdmin}
      />
    </>
  );
}
