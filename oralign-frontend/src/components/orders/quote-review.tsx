'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle,
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
  X,
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
import { quotationsService } from '@/lib/api/quotations.service';
import {
  useApproveQuotation,
  useCancelQuotation,
  useCreateQuotation,
  useGenerateQuotationPdf,
  useQuotationForOrder,
  useRejectQuotation,
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

const STATUS_LABEL: Record<QuotationStatus, string> = {
  [QuotationStatus.DRAFT]:    'Draft',
  [QuotationStatus.SENT]:     'Sent — awaiting doctor',
  [QuotationStatus.APPROVED]: 'Approved',
  [QuotationStatus.REJECTED]: 'Rejected',
  [QuotationStatus.CANCELED]: 'Canceled',
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
          The quotation tab is not part of the design workflow.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading quotation…
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
          No quotation has been issued yet. Please check back soon.
        </CardContent>
      </Card>
    );
  }

  const patientName = order?.patient?.fullName ?? 'Patient';
  const orderCode = order?.orderCode ?? '';

  // Both roles get the same header → controls → pack panel → footer
  // structure. The pack panel is the centerpiece; the admin's controls
  // shrink to one compact row (language + optional discount + notes).
  return isAdmin ? (
    <AdminLayout
      quote={quote}
      orderId={orderId}
      patientName={patientName}
      orderCode={orderCode}
    />
  ) : (
    <DoctorLayout
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
  rightSlot?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-r from-primary/8 via-primary/4 to-transparent">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <UserIcon className="h-3 w-3" />
              Patient
            </div>
            <h2 className="mt-0.5 truncate text-2xl font-semibold tracking-tight">
              {patientName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {orderCode ? (
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Order #{orderCode}
                </span>
              ) : null}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Created {dateOrDash(quote.createdAt)}
              </span>
              {quote.sentAt ? (
                <span>Sent {dateOrDash(quote.sentAt)}</span>
              ) : null}
              {quote.approvedAt ? (
                <span>Approved {dateOrDash(quote.approvedAt)}</span>
              ) : null}
              {quote.rejectedAt ? (
                <span>Rejected {dateOrDash(quote.rejectedAt)}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn('text-xs', STATUS_TONE[quote.status])}
            >
              {STATUS_LABEL[quote.status]}
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
  const create = useCreateQuotation();
  const [language, setLanguage] = useState<DevisLanguage>(DevisLanguage.FR);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          New quotation
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pick a language and start a draft. You&apos;ll attach a pack
          and split the total into tranches on the next screen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:max-w-xs">
          <Label>Language</Label>
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
          Start quotation
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

  useEffect(() => {
    setForm({
      language: quote.language,
      deliveryFees: quote.deliveryFees,
      discountAmount: quote.discountAmount,
      notes: quote.notes ?? '',
      adminMessage: quote.adminMessage ?? '',
    });
  }, [quote]);

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
          : 'Could not download the PDF — please try again.',
      );
    }
  };

  return (
    <div className="space-y-4">
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

      {/* Compact admin controls — language + delivery + discount + net.
          Delivery and discount only get touched AFTER the admin has
          attached a pack; the workflow is intentional: pick the pack
          first (in the panel below), then dial in the line-item
          adjustments here. */}
      <Card>
        <CardContent className="space-y-4 p-5">
          {!quote.packId ? (
            <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Pick a pack in the panel below to unlock delivery fees and
              discount. The price snapshot lives on the quote once a
              pack is attached.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Document language
              </Label>
              {/* Always interactive — once sent the rest of the form
                  locks, but the language pick stays live so admins
                  can issue a translated copy of the SAME quote on
                  demand. "Regenerate PDF" below picks this value up
                  and passes it to the backend as a `?lang=` override
                  without rolling back the lifecycle. */}
              <Select
                value={form.language}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, language: v as DevisLanguage }))
                }
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
              {!isEditable ? (
                <p className="text-[10px] leading-tight text-muted-foreground">
                  Pick another language and click <b>Regenerate PDF</b>{' '}
                  to send the doctor a translated copy.
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Delivery fees ({quote.currency})
              </Label>
              <Input
                type="number"
                step="0.001"
                min={0}
                value={form.deliveryFees}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    deliveryFees: Number(e.target.value) || 0,
                  }))
                }
                disabled={!isEditable || !quote.packId}
                placeholder="0.000"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Discount ({quote.currency})
              </Label>
              <Input
                type="number"
                step="0.001"
                min={0}
                value={form.discountAmount}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    discountAmount: Number(e.target.value) || 0,
                  }))
                }
                disabled={!isEditable || !quote.packId}
                placeholder="0.000"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Net to bill
              </Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm font-semibold tabular-nums">
                {quote.packId
                  ? formatMoney(netAfter, quote.currency)
                  : '—'}
              </div>
            </div>
          </div>

          {/* Collapsible notes — keep the surface uncluttered until the
              admin actually needs to write something. */}
          <button
            type="button"
            onClick={() => setNotesOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {notesOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            Notes & admin message
            {(form.notes || form.adminMessage) && !notesOpen ? (
              <span className="text-[10px] text-amber-700">
                · has content
              </span>
            ) : null}
          </button>
          {notesOpen ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Notes (visible to doctor)
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
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Admin message (PDF, above totals)
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

      {/* Pack + plan + tranches — the real workhorse. */}
      <QuotePackPanel quote={quote} role={UserRole.ADMIN} />

      {/* Sticky-ish action bar at the bottom. */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-xs text-muted-foreground">
            {isEditable
              ? 'Drafts stay editable until you send to the doctor.'
              : quote.status === QuotationStatus.SENT
                ? 'Sent — locked. Click "Recall to edit" to pull it back as a draft if anything is wrong.'
                : 'This quotation is locked. Cancel it first to make changes.'}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Recall — only shown on SENT quotes. Two-click: first
                click flips into confirm mode; second click fires the
                mutation. We use the same button slot so the bar
                doesn't shift, and clear the confirm flag on success
                via the hook's invalidation re-render. */}
            {quote.status === QuotationStatus.SENT ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
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
                className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              >
                {recall.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {confirmRecall ? 'Click again to confirm' : 'Recall to edit'}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => cancel.mutate({ id: quote.id, orderId })}
                disabled={cancel.isPending}
                className="gap-2 text-red-600"
              >
                <Trash2 className="h-4 w-4" />
                Cancel
              </Button>
            ) : null}
            {isEditable ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                disabled={update.isPending}
                className="gap-2"
              >
                {update.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGeneratePdf}
              disabled={generate.isPending || update.isPending}
              className="gap-2"
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {hasPdf ? 'Regenerate PDF' : 'Generate PDF'}
            </Button>
            {quote.status === QuotationStatus.DRAFT ? (
              <Button
                type="button"
                size="sm"
                onClick={handleSendToDoctor}
                disabled={send.isPending || update.isPending}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {send.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send to doctor
              </Button>
            ) : null}
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
  const approve = useApproveQuotation();
  const reject = useRejectQuotation();
  const generate = useGenerateQuotationPdf();
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  // Doctor-side language override — defaults to whatever the admin
  // sent the quote in. The doctor can flip this and hit "Regenerate"
  // to receive a translated copy of the same quote. Keeps the PDF on
  // the server identical for everyone (no per-user files), but the
  // doctor controls the language they read.
  const [docLang, setDocLang] = useState<DevisLanguage>(quote.language);
  useEffect(() => {
    setDocLang(quote.language);
  }, [quote.language]);

  // Doctors only ever see a quote that's been sent. Draft = waiting.
  if (quote.status === QuotationStatus.DRAFT) {
    return (
      <div className="space-y-4">
        <QuoteHeader
          quote={quote}
          patientName={patientName}
          orderCode={orderCode}
        />
        <Card>
          <CardContent className="flex min-h-32 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-foreground">
              Quotation pending
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              The team is still finalising the pack for your treatment.
              You&apos;ll be notified once it&apos;s ready to review.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isActionable = quote.status === QuotationStatus.SENT;
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
          : 'Could not download the PDF — please try again.',
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
    <div className="space-y-4">
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
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Read this quote in
              </Label>
              <Select
                value={docLang}
                onValueChange={(v) => setDocLang(v as DevisLanguage)}
                disabled={generate.isPending}
              >
                <SelectTrigger className="h-8 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DevisLanguage.FR}>Français</SelectItem>
                  <SelectItem value={DevisLanguage.EN}>English</SelectItem>
                  <SelectItem value={DevisLanguage.AR}>العربية</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground">
                Currently: {LANG_LABEL[quote.language]}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRegenerateInLanguage}
              disabled={generate.isPending || docLang === quote.language}
              className="gap-2"
              title={
                docLang === quote.language
                  ? 'Pick a different language to request another version.'
                  : undefined
              }
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Regenerate &amp; download
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {quote.adminMessage ? (
        <Card className="border-amber-200/60 bg-amber-50/40">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/70">
              From the team
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">
              {quote.adminMessage}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <QuotePackPanel quote={quote} role={UserRole.DENTIST} />

      {quote.notes ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{quote.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Approve / reject — only when awaiting doctor */}
      {isActionable ? (
        <Card className="border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-amber-50 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
              </span>
              Action required — review this quotation
            </CardTitle>
            <p className="ml-10 text-sm text-amber-900/80">
              Approve to start the payment plan, or reject if anything is
              off.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {showReject ? (
              <Textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Optional: explain why you're rejecting…"
              />
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  if (showReject) {
                    reject.mutate({
                      id: quote.id,
                      rejectionReason: rejectReason.trim() || undefined,
                    });
                  } else {
                    setShowReject(true);
                  }
                }}
                disabled={reject.isPending || approve.isPending}
                className="h-12 gap-2 border-red-300 bg-white text-red-700 hover:bg-red-50 hover:text-red-700"
              >
                {reject.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <X className="h-5 w-5" />
                )}
                {showReject ? 'Confirm reject' : 'Reject'}
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={() => approve.mutate(quote.id)}
                disabled={approve.isPending || reject.isPending}
                className="h-12 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {approve.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Check className="h-5 w-5" />
                )}
                Approve
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {quote.status === QuotationStatus.REJECTED && quote.rejectionReason ? (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-4 text-sm text-red-900">
            <p className="font-semibold">You rejected this quotation</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-red-900/80">
              {quote.rejectionReason}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
