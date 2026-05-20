'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Download,
  FileText,
  Globe,
  Loader2,
  Send,
  Sparkles,
  Trash2,
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
  useSendQuotation,
  useUpdateQuotation,
} from '@/lib/hooks/use-quotations';
import { useCompanyBilling } from '@/lib/hooks/use-company-billing';
import {
  DevisLanguage,
  type Quotation,
  QuotationStatus,
  UserRole,
} from '@/lib/types';

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

/**
 * Locally compute the same totals the backend persists. Single source
 * of truth lives in `QuotationService.computeTotals` server-side; this
 * helper is purely for the live preview while the admin is typing.
 */
function computeTotals(
  treatmentFees: number,
  fabricationFees: number,
  deliveryFees: number,
  discountAmount: number,
  tvaRate: number,
) {
  const grossFees =
    Math.max(0, treatmentFees) +
    Math.max(0, fabricationFees) +
    Math.max(0, deliveryFees);
  const discount = Math.min(Math.max(0, discountAmount), grossFees);
  const subTotalHt = grossFees - discount;
  const safeRate = Math.max(0, Math.min(100, tvaRate));
  const tvaAmount = (subTotalHt * safeRate) / 100;
  return {
    subTotalHt,
    tvaAmount,
    totalTtc: subTotalHt + tvaAmount,
  };
}

function formatMoney(amount: number, currency: string): string {
  const formatted = Math.abs(amount).toLocaleString('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const signed = amount < 0 ? `-${formatted}` : formatted;
  return `${signed} ${currency}`;
}

/**
 * Quotation tab content for the order-detail page. Admin sees the
 * editable form + send/PDF/cancel actions; the doctor (order owner)
 * sees a read-only summary + approve / reject buttons. Designer sees
 * the empty state.
 */
export function QuoteReview({ orderId, role }: Props) {
  const isAdmin = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  const isDoctor = role === UserRole.DENTIST;

  const { data: quote, isLoading } = useQuotationForOrder(orderId);
  const { data: settings } = useCompanyBilling(isAdmin);

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
        defaultTvaRate={settings?.defaultTvaRate ?? 19}
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

  return isAdmin ? (
    <AdminView quote={quote} orderId={orderId} />
  ) : (
    <DoctorView quote={quote} />
  );
}

// ─── Admin: empty-state create form ───────────────────────────────────────

function AdminCreate({
  orderId,
  defaultCurrency,
  defaultTvaRate,
}: {
  orderId: string;
  defaultCurrency: string;
  defaultTvaRate: number;
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
          Pick a language and start a draft. You can fill the fees and
          generate the PDF before sending it to the doctor.
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
                tvaRate: defaultTvaRate,
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

// ─── Admin view ────────────────────────────────────────────────────────────

function AdminView({ quote, orderId }: { quote: Quotation; orderId: string }) {
  const update = useUpdateQuotation();
  const generate = useGenerateQuotationPdf();
  const send = useSendQuotation();
  const cancel = useCancelQuotation();

  const [form, setForm] = useState({
    language: quote.language,
    treatmentFees: quote.treatmentFees,
    fabricationFees: quote.fabricationFees,
    deliveryFees: quote.deliveryFees,
    discountAmount: quote.discountAmount,
    tvaRate: quote.tvaRate,
    currency: quote.currency,
    notes: quote.notes ?? '',
    adminMessage: quote.adminMessage ?? '',
  });

  useEffect(() => {
    setForm({
      language: quote.language,
      treatmentFees: quote.treatmentFees,
      fabricationFees: quote.fabricationFees,
      deliveryFees: quote.deliveryFees,
      discountAmount: quote.discountAmount,
      tvaRate: quote.tvaRate,
      currency: quote.currency,
      notes: quote.notes ?? '',
      adminMessage: quote.adminMessage ?? '',
    });
  }, [quote]);

  const totals = useMemo(
    () =>
      computeTotals(
        form.treatmentFees,
        form.fabricationFees,
        form.deliveryFees,
        form.discountAmount,
        form.tvaRate,
      ),
    [form],
  );

  const isEditable = quote.status === QuotationStatus.DRAFT;
  const canCancel =
    quote.status === QuotationStatus.DRAFT ||
    quote.status === QuotationStatus.SENT;
  const hasPdf = !!quote.pdfFilePath;

  // Compose the current form into a save-able DTO. Used by both the
  // explicit "Save draft" button AND the implicit save that fires
  // before Generate PDF / Send to doctor so the admin never loses
  // un-saved typed values to a misclick.
  const draftDto = (): {
    language: typeof form.language;
    treatmentFees: number;
    fabricationFees: number;
    deliveryFees: number;
    discountAmount: number;
    tvaRate: number;
    currency: string;
    notes: string;
    adminMessage: string;
  } => ({
    language: form.language,
    treatmentFees: Number(form.treatmentFees) || 0,
    fabricationFees: Number(form.fabricationFees) || 0,
    deliveryFees: Number(form.deliveryFees) || 0,
    discountAmount: Number(form.discountAmount) || 0,
    tvaRate: Number(form.tvaRate) || 0,
    currency: form.currency,
    notes: form.notes,
    adminMessage: form.adminMessage,
  });

  // Persist whatever's currently in the form, but only when the quote
  // is still in draft state (server rejects edits on sent/approved/
  // rejected anyway). Returns the updated quote so the caller can chain
  // the next mutation against the FRESH server state.
  const saveCurrentDraftIfNeeded = async () => {
    if (!isEditable) return;
    try {
      await update.mutateAsync({ id: quote.id, dto: draftDto() });
    } catch (err) {
      // Swallow the toast that useUpdateQuotation already raised — we
      // still want the caller to know it failed so it doesn't continue
      // sending stale data.
      throw err;
    }
  };

  const handleGeneratePdf = async () => {
    try {
      await saveCurrentDraftIfNeeded();
      await generate.mutateAsync(quote.id);
    } catch {
      // toast already raised by the mutation hook
    }
  };

  const handleSendToDoctor = async () => {
    try {
      await saveCurrentDraftIfNeeded();
      await send.mutateAsync(quote.id);
    } catch {
      // toast already raised by the mutation hook
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
      {/* Status / metadata */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              {quote.quotationNumber ?? 'Quotation (draft)'}
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
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Created {format(new Date(quote.createdAt), 'MMM d, yyyy HH:mm')}
              {quote.sentAt &&
                ` · Sent ${format(new Date(quote.sentAt), 'MMM d, yyyy')}`}
              {quote.approvedAt &&
                ` · Approved ${format(new Date(quote.approvedAt), 'MMM d, yyyy')}`}
              {quote.rejectedAt &&
                ` · Rejected ${format(new Date(quote.rejectedAt), 'MMM d, yyyy')}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasPdf && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            )}
            {canCancel && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => cancel.mutate({ id: quote.id, orderId })}
                disabled={cancel.isPending}
                className="gap-2 text-red-600"
              >
                <Trash2 className="h-4 w-4" />
                Cancel quotation
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Editable form (draft only) — read-only summary otherwise */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fees &amp; language</CardTitle>
          {!isEditable && (
            <p className="text-xs text-muted-foreground">
              This quotation is no longer editable. Cancel it first if you
              need to make changes.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Language</Label>
              <Select
                value={form.language}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, language: v as DevisLanguage }))
                }
                disabled={!isEditable}
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

            <FeeField
              label="Treatment fees"
              value={form.treatmentFees}
              onChange={(v) =>
                setForm((s) => ({ ...s, treatmentFees: v }))
              }
              currency={form.currency}
              disabled={!isEditable}
            />
            <FeeField
              label="Fabrication fees"
              value={form.fabricationFees}
              onChange={(v) =>
                setForm((s) => ({ ...s, fabricationFees: v }))
              }
              currency={form.currency}
              disabled={!isEditable}
            />
            <FeeField
              label="Delivery fees"
              value={form.deliveryFees}
              onChange={(v) =>
                setForm((s) => ({ ...s, deliveryFees: v }))
              }
              currency={form.currency}
              disabled={!isEditable}
            />
            <FeeField
              label="Discount"
              value={form.discountAmount}
              onChange={(v) =>
                setForm((s) => ({ ...s, discountAmount: v }))
              }
              currency={form.currency}
              disabled={!isEditable}
            />
            <div className="grid gap-2">
              <Label>VAT rate (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={form.tvaRate}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    tvaRate: Number(e.target.value) || 0,
                  }))
                }
                disabled={!isEditable}
              />
            </div>
            <div className="grid gap-2">
              <Label>Currency</Label>
              <Input
                value={form.currency}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    currency: e.target.value.toUpperCase(),
                  }))
                }
                disabled={!isEditable}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Notes (visible to doctor)</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((s) => ({ ...s, notes: e.target.value }))
                }
                disabled={!isEditable}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Admin message (rendered on PDF above totals)</Label>
              <Textarea
                rows={2}
                value={form.adminMessage}
                onChange={(e) =>
                  setForm((s) => ({ ...s, adminMessage: e.target.value }))
                }
                disabled={!isEditable}
              />
            </div>
          </div>

          {/* Totals preview */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Live totals
            </p>
            <div className="grid gap-1 text-sm">
              <Row
                label="Subtotal (HT)"
                value={formatMoney(totals.subTotalHt, form.currency)}
              />
              <Row
                label={`VAT (${form.tvaRate.toFixed(2)} %)`}
                value={formatMoney(totals.tvaAmount, form.currency)}
              />
              <Row
                label="Total (TTC)"
                value={formatMoney(totals.totalTtc, form.currency)}
                emphasis
              />
            </div>
          </div>

          {/* Actions. Save / Generate / Send all funnel through helpers
              that auto-save the current form FIRST so the admin can't
              accidentally send a quote with stale zeros. */}
          <div className="flex flex-wrap gap-2">
            {isEditable && (
              <Button
                type="button"
                onClick={() => update.mutate({ id: quote.id, dto: draftDto() })}
                disabled={update.isPending}
                className="gap-2"
              >
                {update.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save draft
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
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
            {quote.status === QuotationStatus.DRAFT && (
              <Button
                type="button"
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
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Doctor view ──────────────────────────────────────────────────────────

function DoctorView({ quote }: { quote: Quotation }) {
  const approve = useApproveQuotation();
  const reject = useRejectQuotation();
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  if (quote.status === QuotationStatus.DRAFT) {
    return (
      <Card>
        <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-medium text-foreground">
            Quotation pending
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            The team is still finalising the fees for your treatment. You
            will receive a notification once the quotation is sent.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isActionable = quote.status === QuotationStatus.SENT;
  const hasPdf = !!quote.pdfFilePath;

  // Doctors download through the authenticated axios client so the
  // Bearer token actually rides the request (a plain `<a href>` would
  // 401 against the JwtAuthGuard with "Invalid or expired token").
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
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            {quote.quotationNumber ?? 'Quotation'}
            <Badge
              variant="outline"
              className={cn('text-xs', STATUS_TONE[quote.status])}
            >
              {STATUS_LABEL[quote.status]}
            </Badge>
          </CardTitle>
          {hasPdf && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row
            label="Treatment fees"
            value={formatMoney(quote.treatmentFees, quote.currency)}
          />
          <Row
            label="Fabrication fees"
            value={formatMoney(quote.fabricationFees, quote.currency)}
          />
          <Row
            label="Delivery fees"
            value={formatMoney(quote.deliveryFees, quote.currency)}
          />
          {quote.discountAmount > 0 && (
            <Row
              label="Discount"
              value={`-${formatMoney(quote.discountAmount, quote.currency)}`}
            />
          )}
          <div className="border-t pt-2" />
          <Row
            label="Subtotal (HT)"
            value={formatMoney(quote.subTotalHt, quote.currency)}
          />
          <Row
            label={`VAT (${quote.tvaRate.toFixed(2)} %)`}
            value={formatMoney(quote.tvaAmount, quote.currency)}
          />
          <Row
            label="Total (TTC)"
            value={formatMoney(quote.totalTtc, quote.currency)}
            emphasis
          />
          {quote.adminMessage && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Message
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {quote.adminMessage}
              </p>
            </div>
          )}
          {quote.notes && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{quote.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval bar — only when the quote is awaiting the doctor */}
      {isActionable && (
        <Card className="border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-amber-50 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
              </span>
              Action required — review this quotation
            </CardTitle>
            <p className="ml-10 text-sm text-amber-900/80">
              Approve to move the order to fabrication, or reject to
              decline (the order will be canceled).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {showReject && (
              <Textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Optional: explain why you're rejecting (e.g. fees out of range, missing item…)"
              />
            )}
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
      )}

      {quote.status === QuotationStatus.REJECTED && quote.rejectionReason && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-4 text-sm text-red-900">
            <p className="font-semibold">You rejected this quotation</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-red-900/80">
              {quote.rejectionReason}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────

function FeeField({
  label,
  value,
  onChange,
  currency,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  currency: string;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label>
        {label} <span className="text-muted-foreground">({currency})</span>
      </Label>
      <Input
        type="number"
        step="0.001"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        disabled={disabled}
      />
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={emphasis ? 'font-semibold' : 'text-muted-foreground'}>
        {label}
      </span>
      <span className={emphasis ? 'text-lg font-bold' : 'font-medium'}>
        {value}
      </span>
    </div>
  );
}
