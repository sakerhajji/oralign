'use client';

import { useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Globe,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { quotationsService } from '@/lib/api/quotations.service';
// Approve / Reject hooks were removed alongside the doctor's Approve
// / Reject card — paying the first installment now implicitly
// approves the quote on the backend. The admin's quote view in this
// file uses Cancel + Revert-to-draft for the equivalent "no longer
// valid" affordance, so those stay imported.
import {
  useCancelQuotation,
  useCreateQuotation,
  useGenerateQuotationPdf,
  useQuotationForOrder,
  useRevertQuotationToDraft,
  useSendQuotation,
  useUpdateQuotation,
} from '@/lib/hooks/use-quotations';
import { useCompanyBilling } from '@/lib/hooks/use-company-billing';
import { useOrder } from '@/lib/hooks/use-orders';
import {
  DevisLanguage,
  type Quotation,
  QuotationStatus,
  UserRole,
} from '@/lib/types';
import { QuotePackPanel } from './quote-pack-panel';

// ─── Visual tokens ────────────────────────────────────────────────────────

interface Props {
  orderId: string;
  role: UserRole;
}

const STATUS_TONE: Record<QuotationStatus, string> = {
  [QuotationStatus.DRAFT]:    'border-slate-200 bg-slate-50 text-slate-700',
  [QuotationStatus.SENT]:     'border-amber-300 bg-amber-50 text-amber-900',
  [QuotationStatus.APPROVED]: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  [QuotationStatus.REJECTED]: 'border-red-300 bg-red-50 text-red-900',
  [QuotationStatus.CANCELED]: 'border-slate-200 bg-slate-50 text-slate-500',
};

// Status enum → dictionary key (label text resolved with t() inside
// the components — see quoteUi.review.status in the dictionary).
const STATUS_LABEL_KEY: Record<QuotationStatus, string> = {
  [QuotationStatus.DRAFT]:    'quoteUi.review.status.draft',
  [QuotationStatus.SENT]:     'quoteUi.review.status.sent',
  [QuotationStatus.APPROVED]: 'quoteUi.review.status.approved',
  [QuotationStatus.REJECTED]: 'quoteUi.review.status.rejected',
  [QuotationStatus.CANCELED]: 'quoteUi.review.status.canceled',
};

const LANG_LABEL: Record<DevisLanguage, string> = {
  [DevisLanguage.FR]: 'Français',
  [DevisLanguage.EN]: 'English',
  [DevisLanguage.AR]: 'العربية',
};

function formatMoney(amount: number, currency: string): string {
  const formatted = Math.abs(amount).toLocaleString('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const signed = amount < 0 ? `-${formatted}` : formatted;
  return `${signed} ${currency}`;
}

const dateOrDash = (iso?: string | null) =>
  iso ? format(new Date(iso), 'MMM d, yyyy') : '—';

// ─────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────

export function QuoteReview({ orderId, role }: Props) {
  const { t } = useT();
  const isAdmin = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  const isDoctor = role === UserRole.DENTIST;

  const { data: quote, isLoading } = useQuotationForOrder(orderId);
  const { data: settings } = useCompanyBilling(isAdmin);
  // Order fetch is shared by both admin + doctor — we use it for the
  // patient name + creation date in the new header. It's already in
  // the React-Query cache after the page's main order query, so this
  // is effectively free.
  const { data: order } = useOrder(orderId);

  if (!isAdmin && !isDoctor) {
    return (
      <Card>
        <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
          {t('quoteUi.review.notPartOfWorkflow')}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t('quoteUi.review.loading')}
        </CardContent>
      </Card>
    );
  }

  if (!quote && isAdmin) {
    return (
      <AdminCreate
        orderId={orderId}
        defaultCurrency={settings?.defaultCurrency ?? 'TND'}
      />
    );
  }

  if (!quote) {
    return (
      <Card>
        <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
          {t('quoteUi.review.noQuoteYet')}
        </CardContent>
      </Card>
    );
  }

  const patientName =
    order?.patient?.fullName ?? t('quoteUi.review.patientFallback');
  const orderCode = order?.orderCode ?? '';

  // Both roles get the same header → controls → pack panel → footer
  // structure. The pack panel is the centerpiece; the admin's controls
  // shrink to one compact row (language + optional discount + notes).
  return isAdmin ? (
    <AdminLayout
      key={`${quote.id}:${quote.updatedAt ?? quote.status}`}
      quote={quote}
      orderId={orderId}
      patientName={patientName}
      orderCode={orderCode}
    />
  ) : (
    <DoctorLayout
      key={`${quote.id}:${quote.updatedAt ?? quote.language}`}
      quote={quote}
      patientName={patientName}
      orderCode={orderCode}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared header — patient + dates + status
// ─────────────────────────────────────────────────────────────────────────

function QuoteHeader({
  quote,
  patientName,
  orderCode,
  rightSlot,
}: {
  quote: Quotation;
  patientName: string;
  orderCode: string;
  rightSlot?: ReactNode;
}) {
  const { t } = useT();
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-r from-primary/8 via-primary/4 to-transparent">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <UserIcon className="h-3 w-3" />
              {t('quoteUi.review.patient')}
            </div>
            <h2 className="mt-0.5 break-words text-2xl font-semibold tracking-tight">
              {patientName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {orderCode ? (
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {t('quoteUi.review.orderNum', { code: orderCode })}
                </span>
              ) : null}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {t('quoteUi.review.createdDate', {
                  date: dateOrDash(quote.createdAt),
                })}
              </span>
              {quote.sentAt ? (
                <span>
                  {t('quoteUi.review.sentDate', {
                    date: dateOrDash(quote.sentAt),
                  })}
                </span>
              ) : null}
              {quote.approvedAt ? (
                <span>
                  {t('quoteUi.review.approvedDate', {
                    date: dateOrDash(quote.approvedAt),
                  })}
                </span>
              ) : null}
              {quote.rejectedAt ? (
                <span>
                  {t('quoteUi.review.rejectedDate', {
                    date: dateOrDash(quote.rejectedAt),
                  })}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end [&>button]:h-9 [&>button]:w-full sm:[&>button]:w-auto">
            <Badge
              variant="outline"
              className={cn('text-xs', STATUS_TONE[quote.status])}
            >
              {t(STATUS_LABEL_KEY[quote.status])}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Globe className="mr-1 h-3 w-3" />
              {LANG_LABEL[quote.language]}
            </Badge>
            {rightSlot}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Admin: empty-state create form
// ─────────────────────────────────────────────────────────────────────────

function AdminCreate({
  orderId,
  defaultCurrency,
}: {
  orderId: string;
  defaultCurrency: string;
}) {
  const { t } = useT();
  const create = useCreateQuotation();
  const [language, setLanguage] = useState<DevisLanguage>(DevisLanguage.FR);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          {t('quoteUi.review.newQuote')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('quoteUi.review.newQuoteDesc')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:max-w-xs">
          <Label>{t('language.label')}</Label>
          <Select
            value={language}
            onValueChange={(v) => setLanguage(v as DevisLanguage)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DevisLanguage.FR}>Français</SelectItem>
              <SelectItem value={DevisLanguage.EN}>English</SelectItem>
              <SelectItem value={DevisLanguage.AR}>العربية</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="lg"
          onClick={() =>
            create.mutate({
              orderId,
              dto: {
                language,
                currency: defaultCurrency,
                // VAT rate stays at billing-config default — admin
                // doesn't tweak it on the quote anymore.
              },
            })
          }
          disabled={create.isPending}
          className="gap-2"
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {t('quoteUi.review.startQuote')}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Admin layout
// ─────────────────────────────────────────────────────────────────────────

function AdminLayout({
  quote,
  orderId,
  patientName,
  orderCode,
}: {
  quote: Quotation;
  orderId: string;
  patientName: string;
  orderCode: string;
}) {
  const { t } = useT();
  const update = useUpdateQuotation();
  const generate = useGenerateQuotationPdf();
  const send = useSendQuotation();
  const cancel = useCancelQuotation();
  const recall = useRevertQuotationToDraft();
  // Local confirm flag — recall is a one-click action with consequences
  // for the doctor (their bell pings), so we ask once before firing.
  const [confirmRecall, setConfirmRecall] = useState(false);

  // Only the fields admins still touch directly: language (controls PDF
  // rendering), delivery fees (admin-added to the pack), discount
  // (subtracted from pack), notes, admin message. Fees/VAT are owned
  // by the pack snapshot + billing settings now.
  const [form, setForm] = useState({
    language: quote.language,
    deliveryFees: quote.deliveryFees,
    discountAmount: quote.discountAmount,
    notes: quote.notes ?? '',
    adminMessage: quote.adminMessage ?? '',
  });
  const [notesOpen, setNotesOpen] = useState(
    !!(quote.notes || quote.adminMessage),
  );

  const isEditable = quote.status === QuotationStatus.DRAFT;
  const canCancel =
    quote.status === QuotationStatus.DRAFT ||
    quote.status === QuotationStatus.SENT;
  const hasPdf = !!quote.pdfFilePath;

  // Pack price snapshot lives on `treatmentFees` for pack quotes —
  // we don't surface the field name to the admin (no more "Treatment
  // fees" UI), it's just the original pack catalog price. The net the
  // doctor will pay is `pack + delivery − discount`.
  const packPrice = quote.treatmentFees;
  const netAfter = Math.max(
    0,
    packPrice +
      (Number(form.deliveryFees) || 0) -
      (Number(form.discountAmount) || 0),
  );

  const draftDto = () => ({
    language: form.language,
    // `treatmentFees` carries the pack-price snapshot for pack quotes
    // — we forward it untouched so the backend can recompute totals
    // without flipping back to fees-mode. For legacy non-pack drafts
    // the field is still 0, same as before.
    treatmentFees: quote.treatmentFees,
    fabricationFees: 0,
    deliveryFees: Number(form.deliveryFees) || 0,
    discountAmount: Number(form.discountAmount) || 0,
    tvaRate: quote.tvaRate, // sourced from billing settings on create
    currency: quote.currency,
    notes: form.notes,
    adminMessage: form.adminMessage,
  });

  const saveCurrentDraftIfNeeded = async () => {
    if (!isEditable) return;
    await update.mutateAsync({ id: quote.id, dto: draftDto() });
  };

  const handleSaveDraft = () => {
    update.mutate({ id: quote.id, dto: draftDto() });
  };

  const handleGeneratePdf = async () => {
    try {
      // Draft → persist the new fee shape before rendering.
      // Sent/approved → form is otherwise locked, but the language
      // dropdown stays live so admin can issue a translated copy on
      // demand. Either way we hand the current selection to the
      // backend as a `?lang=` override.
      await saveCurrentDraftIfNeeded();
      await generate.mutateAsync({ id: quote.id, lang: form.language });
    } catch {
      /* toast raised by hook */
    }
  };

  const handleSendToDoctor = async () => {
    try {
      await saveCurrentDraftIfNeeded();
      await send.mutateAsync(quote.id);
    } catch {
      /* toast raised by hook */
    }
  };

  const handleDownloadPdf = async () => {
    if (!hasPdf) return;
    try {
      const fileName = `${quote.quotationNumber ?? 'quotation'}.pdf`;
      await quotationsService.downloadPdf(quote.id, fileName);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('quoteUi.review.pdfError'),
      );
    }
  };

  return (
    <div className="space-y-3">
      <QuoteHeader
        quote={quote}
        patientName={patientName}
        orderCode={orderCode}
        rightSlot={
          hasPdf ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              PDF
            </Button>
          ) : null
        }
      />

      {/* Step 1 — Pack. Choosing the pack is the first thing the admin
          does; its price snapshot drives every number below. */}
      <QuotePackPanel
        quote={quote}
        role={UserRole.ADMIN}
        section="pack"
        patientName={patientName}
        orderCode={orderCode}
      />

      {/* Step 2 — Pricing adjustments. Only meaningful once a pack is
          attached, so they sit directly under it. */}
      {quote.packId ? (
        <Card size="sm">
          <CardContent className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">
                {t('quoteUi.review.pricingTitle')}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('quoteUi.review.pricingDesc')}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t('quoteUi.review.deliveryFees', {
                    currency: quote.currency,
                  })}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  className="h-10"
                  value={form.deliveryFees}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      deliveryFees: Number(e.target.value) || 0,
                    }))
                  }
                  disabled={!isEditable}
                  placeholder="0.000"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t('quoteUi.review.discount', { currency: quote.currency })}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  className="h-10"
                  value={form.discountAmount}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      discountAmount: Number(e.target.value) || 0,
                    }))
                  }
                  disabled={!isEditable}
                  placeholder="0.000"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t('quoteUi.review.netToBill')}
                </Label>
                <div className="flex h-10 items-center rounded-md border bg-primary/5 px-3 text-base font-semibold tabular-nums">
                  {formatMoney(netAfter, quote.currency)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 3 — Payment plan / tranches (auto-calculated). */}
      {quote.packId ? (
        <QuotePackPanel
          quote={quote}
          role={UserRole.ADMIN}
          section="plan"
          patientName={patientName}
          orderCode={orderCode}
        />
      ) : null}

      {/* Document settings — language + internal/PDF notes. Lower
          priority than the pack + plan, so they sit near the actions. */}
      <Card size="sm">
        <CardContent className="space-y-3">
          {/* Language + notes toggle share one row so the card never
              leaves a big empty half. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid gap-1.5 sm:w-64">
              <Label className="text-xs font-medium text-muted-foreground">
                {t('quoteUi.review.docLanguage')}
              </Label>
              {/* Always interactive — once sent the rest of the form
                  locks, but the language pick stays live so admins can
                  issue a translated copy of the SAME quote on demand.
                  "Regenerate PDF" passes it to the backend as a `?lang=`
                  override without rolling back the lifecycle. */}
              <Select
                value={form.language}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, language: v as DevisLanguage }))
                }
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DevisLanguage.FR}>Français</SelectItem>
                  <SelectItem value={DevisLanguage.EN}>English</SelectItem>
                  <SelectItem value={DevisLanguage.AR}>العربية</SelectItem>
                </SelectContent>
              </Select>
              {!isEditable ? (
                <p className="text-xs leading-tight text-muted-foreground">
                  {t('quoteUi.review.regenHintBefore')}{' '}
                  <b>{t('quoteUi.review.regeneratePdf')}</b>{' '}
                  {t('quoteUi.review.regenHintAfter')}
                </p>
              ) : null}
            </div>

            {/* Collapsible notes toggle — keeps the surface uncluttered
                until the admin actually needs to write something. */}
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground sm:mt-6"
            >
              {notesOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {t('quoteUi.review.notesToggle')}
              {(form.notes || form.adminMessage) && !notesOpen ? (
                <span className="text-xs text-amber-700">
                  {t('quoteUi.review.hasContent')}
                </span>
              ) : null}
            </button>
          </div>
          {notesOpen ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-sm font-medium">
                  {t('quoteUi.review.notesDoctor')}
                </Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, notes: e.target.value }))
                  }
                  disabled={!isEditable}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-sm font-medium">
                  {t('quoteUi.review.adminMessage')}
                </Label>
                <Textarea
                  rows={3}
                  value={form.adminMessage}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, adminMessage: e.target.value }))
                  }
                  disabled={!isEditable}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Action bar — the four primary actions, aligned and comfortably
          sized so they're easy to spot and tap. */}
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {isEditable
              ? t('quoteUi.review.footerDraft')
              : quote.status === QuotationStatus.SENT
                ? t('quoteUi.review.footerSent')
                : t('quoteUi.review.footerLocked')}
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap sm:items-center sm:justify-end [&>button]:w-full sm:[&>button]:w-auto">
            {/* Recall — only shown on SENT quotes. Two-click: first
                click flips into confirm mode; second click fires the
                mutation. We use the same button slot so the bar
                doesn't shift, and clear the confirm flag on success
                via the hook's invalidation re-render. */}
            {quote.status === QuotationStatus.SENT ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (confirmRecall) {
                    recall.mutate(quote.id, {
                      onSuccess: () => setConfirmRecall(false),
                    });
                  } else {
                    setConfirmRecall(true);
                  }
                }}
                onBlur={() => setConfirmRecall(false)}
                disabled={recall.isPending}
                className="h-10 gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              >
                {recall.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {confirmRecall
                  ? t('quoteUi.review.confirmRecall')
                  : t('quoteUi.review.recallToEdit')}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => cancel.mutate({ id: quote.id, orderId })}
                disabled={cancel.isPending}
                className="h-10 gap-2 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
                {t('common.cancel')}
              </Button>
            ) : null}
            {isEditable ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={update.isPending}
                className="h-10 gap-2"
              >
                {update.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {t('common.save')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={handleGeneratePdf}
              disabled={generate.isPending || update.isPending}
              className="h-10 gap-2"
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {hasPdf
                ? t('quoteUi.review.regeneratePdf')
                : t('quoteUi.review.generatePdf')}
            </Button>
            {quote.status === QuotationStatus.DRAFT ? (() => {
              // Pack-based quotes can only ship after the admin has
              // configured the payment plan — otherwise the doctor's
              // Approve action would fail with a 400 from the backend
              // (no QuoteInstallment rows). paymentMode is set as part
              // of configurePaymentPlan, so it's the source of truth
              // for "plan exists".
              const needsPlanConfig =
                !!quote.packId && !quote.paymentMode;
              return (
                <Button
                  type="button"
                  onClick={handleSendToDoctor}
                  disabled={
                    send.isPending || update.isPending || needsPlanConfig
                  }
                  className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700 sm:min-w-[150px]"
                  title={
                    needsPlanConfig
                      ? t('quoteUi.review.planFirstTitle')
                      : undefined
                  }
                >
                  {send.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {needsPlanConfig
                    ? t('quoteUi.review.planFirst')
                    : t('quoteUi.review.sendToDoctor')}
                </Button>
              );
            })() : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Doctor layout
// ─────────────────────────────────────────────────────────────────────────

function DoctorLayout({
  quote,
  patientName,
  orderCode,
}: {
  quote: Quotation;
  patientName: string;
  orderCode: string;
}) {
  const { t } = useT();
  // `useApproveQuotation` / `useRejectQuotation` used to power the
  // doctor's Approve / Reject card here. That card is gone — the
  // backend auto-approves a SENT quote on first payment and there's
  // no manual reject affordance — so the hooks aren't called from
  // this component anymore. Imports remain so the admin's quote view
  // (in this same file) can keep using them.
  const generate = useGenerateQuotationPdf();
  // Doctor-side language override — defaults to whatever the admin
  // sent the quote in. The doctor can flip this and hit "Regenerate"
  // to receive a translated copy of the same quote. Keeps the PDF on
  // the server identical for everyone (no per-user files), but the
  // doctor controls the language they read.
  const [docLang, setDocLang] = useState<DevisLanguage>(quote.language);
  // Doctors only ever see a quote that's been sent. Draft = waiting.
  if (quote.status === QuotationStatus.DRAFT) {
    return (
      <div className="space-y-3">
        <QuoteHeader
          quote={quote}
          patientName={patientName}
          orderCode={orderCode}
        />
        <Card>
          <CardContent className="flex min-h-32 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-foreground">
              {t('quoteUi.review.pendingTitle')}
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              {t('quoteUi.review.pendingDesc')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasPdf = !!quote.pdfFilePath;

  const handleDownloadPdf = async () => {
    if (!hasPdf) return;
    try {
      const fileName = `${quote.quotationNumber ?? 'quotation'}.pdf`;
      await quotationsService.downloadPdf(quote.id, fileName);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('quoteUi.review.pdfError'),
      );
    }
  };

  const handleRegenerateInLanguage = async () => {
    // Re-render then auto-download so the doctor gets the translated
    // file in a single click rather than picking a language + clicking
    // "regenerate" + clicking "download".
    try {
      await generate.mutateAsync({ id: quote.id, lang: docLang });
      const fileName = `${quote.quotationNumber ?? 'quotation'}.pdf`;
      await quotationsService.downloadPdf(quote.id, fileName);
    } catch (err) {
      if (err instanceof Error && err.message) {
        toast.error(err.message);
      }
    }
  };

  return (
    <div className="space-y-3">
      <QuoteHeader
        quote={quote}
        patientName={patientName}
        orderCode={orderCode}
        rightSlot={
          hasPdf ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              PDF
            </Button>
          ) : null
        }
      />

      {/* Language picker — doctor can request the same quote in
          another language (FR / EN / AR) and the backend re-renders
          the PDF on the fly. The fresh file auto-downloads so the
          interaction is one click, not three. Disabled while the
          render is in flight; the chosen language persists on the
          row so subsequent default downloads also serve this lang. */}
      {hasPdf ? (
        <Card size="sm">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div className="flex w-full flex-1 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <Label className="text-xs font-medium text-muted-foreground">
                {t('quoteUi.review.readIn')}
              </Label>
              <Select
                value={docLang}
                onValueChange={(v) => setDocLang(v as DevisLanguage)}
                disabled={generate.isPending}
              >
                <SelectTrigger className="h-10 w-full sm:h-9 sm:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DevisLanguage.FR}>Français</SelectItem>
                  <SelectItem value={DevisLanguage.EN}>English</SelectItem>
                  <SelectItem value={DevisLanguage.AR}>العربية</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground">
                {t('quoteUi.review.currently', {
                  lang: LANG_LABEL[quote.language],
                })}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleRegenerateInLanguage}
              disabled={generate.isPending || docLang === quote.language}
              className="h-10 w-full gap-2 sm:h-9 sm:w-auto"
              title={
                docLang === quote.language
                  ? t('quoteUi.review.pickDifferent')
                  : undefined
              }
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t('quoteUi.review.regenDownload')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {quote.adminMessage ? (
        <Card className="border-amber-200/60 bg-amber-50/40">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/70">
              {t('quoteUi.review.fromTeam')}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">
              {quote.adminMessage}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <QuotePackPanel
        quote={quote}
        role={UserRole.DENTIST}
        patientName={patientName}
        orderCode={orderCode}
      />

      {quote.notes ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('quoteUi.review.notes')}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{quote.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      {/*
        Approve / Reject card was here.
        The doctor's quote flow no longer asks for an explicit Approve
        / Reject decision — sending the quote IS the offer, and the
        doctor paying the first installment IS the acceptance. The
        QuotePackPanel above already surfaces the payment timeline
        with per-row Pay buttons; rendering an "Action required —
        approve to start the payment plan" gate underneath made the
        page read like a two-step process when it's really one. The
        backend auto-flips the quote to `approved` the moment the
        first payment lands (see PaymentsService.approveQuoteIfSent)
        so the audit trail stays intact.

       */}

      {quote.status === QuotationStatus.REJECTED && quote.rejectionReason ? (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-4 text-sm text-red-900">
            <p className="font-semibold">{t('quoteUi.review.youRejected')}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-red-900/80">
              {quote.rejectionReason}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
