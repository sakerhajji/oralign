'use client';

import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Download, Globe, Loader2, RotateCcw, Send } from 'lucide-react';
import {
  PackChoiceFields,
  useResolvedPackChoice,
  type PackChoice,
} from '@/components/billing/pack-choice';
import { archLabel, packName } from '@/components/billing/pack-picker';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DecimalInput } from '@/components/ui/decimal-input';
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
import { formatTimestampDay } from '@/lib/utils/calendar-date';
import { formatPrice } from '@/lib/utils/currency';
import { useT } from '@/lib/i18n/lang-context';
import { quotationsService } from '@/lib/api/quotations.service';
import {
  useCancelQuotation,
  useCreateQuotation,
  useGenerateQuotationPdf,
  useQuotationForOrder,
  useRevertQuotationToDraft,
  useSendQuotation,
  useUpdateQuotation,
} from '@/lib/hooks/use-quotations';
import { useAttachPackToQuotation } from '@/lib/hooks/use-quotation-payment-plan';
import { useCompanyBilling } from '@/lib/hooks/use-company-billing';
import { useOrder } from '@/lib/hooks/use-orders';
import {
  ArchType,
  DevisLanguage,
  type Quotation,
  QuotationStatus,
  UserRole,
} from '@/lib/types';
import { QuotePackPanel } from './quote-pack-panel';
import { QuoteStep } from './quote-step';

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

const LANGUAGES = [DevisLanguage.FR, DevisLanguage.EN, DevisLanguage.AR];

// ─────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────

export function QuoteReview({ orderId, role }: Props) {
  const { t } = useT();
  const isAdmin = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  const isDoctor = role === UserRole.DENTIST;

  const { data: quote, isLoading } = useQuotationForOrder(orderId);
  const { data: settings } = useCompanyBilling(isAdmin);
  // Order fetch is shared by both admin + doctor — used for the patient
  // name and order code. It's already in the React-Query cache after the
  // page's main order query, so this is effectively free.
  const { data: order } = useOrder(orderId);

  if (!isAdmin && !isDoctor) {
    return <EmptyCard>{t('quoteUi.review.notPartOfWorkflow')}</EmptyCard>;
  }

  if (isLoading) {
    return (
      <EmptyCard>
        <Loader2 className="mr-2 size-5 animate-spin" />
        {t('quoteUi.review.loading')}
      </EmptyCard>
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
    return <EmptyCard>{t('quoteUi.review.noQuoteYet')}</EmptyCard>;
  }

  const patientName =
    order?.patient?.fullName ?? t('quoteUi.review.patientFallback');
  const orderCode = order?.orderCode ?? '';

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

function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: QuotationStatus }) {
  const { t } = useT();
  return (
    <Badge variant="outline" className={cn('shrink-0 text-xs', STATUS_TONE[status])}>
      {t(STATUS_LABEL_KEY[status])}
    </Badge>
  );
}

function LanguageSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: DevisLanguage;
  onChange: (language: DevisLanguage) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as DevisLanguage)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((language) => (
          <SelectItem key={language} value={language}>
            {LANG_LABEL[language]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** "Order ORD-… · created 18 Sept 2026" — the quote's context line. */
function quoteContext(
  quote: Quotation,
  orderCode: string,
  t: ReturnType<typeof useT>['t'],
  lang: ReturnType<typeof useT>['lang'],
): string {
  return [
    orderCode ? t('quoteEditor.order', { code: orderCode }) : null,
    t('quoteEditor.created', { date: formatTimestampDay(quote.createdAt, lang) }),
  ]
    .filter(Boolean)
    .join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────
// Shared header — doctor view
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
  const { t, lang } = useT();
  const milestones = [
    quote.sentAt ? t('quoteUi.review.sentDate', { date: formatTimestampDay(quote.sentAt, lang) }) : null,
    quote.approvedAt
      ? t('quoteUi.review.approvedDate', { date: formatTimestampDay(quote.approvedAt, lang) })
      : null,
    quote.rejectedAt
      ? t('quoteUi.review.rejectedDate', { date: formatTimestampDay(quote.rejectedAt, lang) })
      : null,
  ].filter(Boolean);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight break-words">{patientName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {[quoteContext(quote, orderCode, t, lang), ...milestones].join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <StatusBadge status={quote.status} />
          <Badge variant="outline" className="gap-1 text-xs">
            <Globe className="size-3" />
            {LANG_LABEL[quote.language]}
          </Badge>
          {rightSlot}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Admin: new quote — pack and language in one go
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
  const attach = useAttachPackToQuotation();
  const languageId = useId();
  const [language, setLanguage] = useState<DevisLanguage>(DevisLanguage.FR);
  const [choice, setChoice] = useState<PackChoice | null>(null);
  const resolved = useResolvedPackChoice(choice);
  const pending = create.isPending || attach.isPending;

  const submit = async () => {
    if (!resolved?.price) return;
    try {
      const quote = await create.mutateAsync({
        orderId,
        // VAT stays at the billing-settings default; the pack sets the price.
        dto: { language, currency: defaultCurrency },
      });
      await attach.mutateAsync({
        quotationId: quote.id,
        dto: { packId: resolved.pack.id, archType: resolved.archType },
      });
    } catch {
      /* both hooks toast their own errors */
    }
  };

  return (
    <QuoteStep
      title={t('quoteUi.review.newQuote')}
      description={t('quoteEditor.createDesc')}
    >
      <div className="grid max-w-xl gap-5">
        <PackChoiceFields value={choice} onChange={setChoice} disabled={pending} />
        <div className="grid gap-2 sm:max-w-60">
          <Label htmlFor={languageId}>{t('quoteEditor.pdfLanguage')}</Label>
          <LanguageSelect
            id={languageId}
            value={language}
            onChange={setLanguage}
            disabled={pending}
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end border-t pt-4">
        <Button onClick={submit} disabled={!resolved?.price || pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {t('quoteUi.review.startQuote')}
        </Button>
      </div>
    </QuoteStep>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Admin: quote editor — steps on the left, summary + actions on the right
// ─────────────────────────────────────────────────────────────────────────

/** The quote fields the admin edits directly (the rest comes from the pack). */
interface QuoteForm {
  language: DevisLanguage;
  deliveryFees: number;
  discountAmount: number;
  notes: string;
  adminMessage: string;
}

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
  const [form, setForm] = useState<QuoteForm>(() => ({
    language: quote.language,
    deliveryFees: quote.deliveryFees,
    discountAmount: quote.discountAmount,
    notes: quote.notes ?? '',
    adminMessage: quote.adminMessage ?? '',
  }));
  const patch = (changes: Partial<QuoteForm>) =>
    setForm((current) => ({ ...current, ...changes }));

  const isDraft = quote.status === QuotationStatus.DRAFT;
  const hasPack = !!quote.packId;
  // Only drafts can be saved; once sent, the language picker alone stays
  // live (it re-renders the PDF, it does not edit the quote).
  const totalDirty =
    isDraft &&
    (form.deliveryFees !== quote.deliveryFees ||
      form.discountAmount !== quote.discountAmount);
  const dirty =
    totalDirty ||
    (isDraft &&
      (form.language !== quote.language ||
        form.notes !== (quote.notes ?? '') ||
        form.adminMessage !== (quote.adminMessage ?? '')));

  const saveDraft = async () => {
    if (!dirty) return;
    await update.mutateAsync({
      id: quote.id,
      dto: {
        language: form.language,
        // `treatmentFees` carries the pack-price snapshot; forwarded
        // untouched so the backend recomputes the pack total.
        treatmentFees: quote.treatmentFees,
        fabricationFees: 0,
        deliveryFees: form.deliveryFees,
        discountAmount: form.discountAmount,
        tvaRate: quote.tvaRate,
        currency: quote.currency,
        notes: form.notes,
        adminMessage: form.adminMessage,
      },
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <div className="min-w-0 space-y-4">
        <QuotePackPanel
          quote={quote}
          role={UserRole.ADMIN}
          section="pack"
          patientName={patientName}
          orderCode={orderCode}
        />
        <AdjustmentsStep
          quote={quote}
          form={form}
          onChange={patch}
          totalDirty={totalDirty}
        />
        {hasPack ? (
          <QuotePackPanel
            quote={quote}
            role={UserRole.ADMIN}
            section="plan"
            patientName={patientName}
            orderCode={orderCode}
          />
        ) : (
          <QuoteStep
            step={3}
            title={t('quoteEditor.planStep')}
            description={t('quoteEditor.needsPack')}
          />
        )}
        <NotesStep form={form} onChange={patch} disabled={!isDraft} />
      </div>

      <QuoteSummary
        quote={quote}
        orderId={orderId}
        patientName={patientName}
        orderCode={orderCode}
        form={form}
        onLanguageChange={(language) => patch({ language })}
        dirty={dirty}
        totalDirty={totalDirty}
        saving={update.isPending}
        saveDraft={saveDraft}
      />
    </div>
  );
}

function AdjustmentsStep({
  quote,
  form,
  onChange,
  totalDirty,
}: {
  quote: Quotation;
  form: QuoteForm;
  onChange: (changes: Partial<QuoteForm>) => void;
  totalDirty: boolean;
}) {
  const { t } = useT();
  const hasPack = !!quote.packId;
  const isDraft = quote.status === QuotationStatus.DRAFT;

  return (
    <QuoteStep
      step={2}
      title={t('quoteEditor.adjustStep')}
      optionalLabel={t('quoteEditor.optional')}
      description={hasPack ? t('quoteEditor.adjustStepDesc') : t('quoteEditor.needsPack')}
      done={
        hasPack && !totalDirty && (quote.deliveryFees > 0 || quote.discountAmount > 0)
      }
    >
      {hasPack ? (
        <>
          <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
            <MoneyField
              label={t('quoteEditor.deliveryFees')}
              currency={quote.currency}
              value={form.deliveryFees}
              onChange={(deliveryFees) => onChange({ deliveryFees })}
              disabled={!isDraft}
            />
            <MoneyField
              label={t('quoteEditor.discount')}
              currency={quote.currency}
              value={form.discountAmount}
              onChange={(discountAmount) => onChange({ discountAmount })}
              disabled={!isDraft}
            />
          </div>
          {totalDirty ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
              {quote.paymentMode
                ? t('quoteEditor.adjustWipesPlan')
                : t('quoteEditor.saveBeforePlan')}
            </p>
          ) : null}
        </>
      ) : null}
    </QuoteStep>
  );
}

function MoneyField({
  label,
  currency,
  value,
  onChange,
  disabled,
}: {
  label: string;
  currency: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <DecimalInput
          id={id}
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          className="pr-12 tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {currency}
        </span>
      </div>
    </div>
  );
}

function NotesStep({
  form,
  onChange,
  disabled,
}: {
  form: QuoteForm;
  onChange: (changes: Partial<QuoteForm>) => void;
  disabled: boolean;
}) {
  const { t } = useT();
  const notesId = useId();
  const messageId = useId();
  const hasContent = !!(form.notes || form.adminMessage);
  const [open, setOpen] = useState(hasContent);

  return (
    <QuoteStep
      title={t('quoteEditor.notesTitle')}
      optionalLabel={t('quoteEditor.optional')}
      description={t('quoteEditor.notesDesc')}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open
            ? t('quoteEditor.notesHide')
            : hasContent
              ? t('quoteEditor.change')
              : t('quoteEditor.notesAdd')}
        </Button>
      }
    >
      {open ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={notesId}>{t('quoteUi.review.notesDoctor')}</Label>
            <Textarea
              id={notesId}
              rows={3}
              value={form.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={messageId}>{t('quoteUi.review.adminMessage')}</Label>
            <Textarea
              id={messageId}
              rows={3}
              value={form.adminMessage}
              onChange={(e) => onChange({ adminMessage: e.target.value })}
              disabled={disabled}
            />
          </div>
        </div>
      ) : null}
    </QuoteStep>
  );
}

function QuoteSummary({
  quote,
  orderId,
  patientName,
  orderCode,
  form,
  onLanguageChange,
  dirty,
  totalDirty,
  saving,
  saveDraft,
}: {
  quote: Quotation;
  orderId: string;
  patientName: string;
  orderCode: string;
  form: QuoteForm;
  onLanguageChange: (language: DevisLanguage) => void;
  dirty: boolean;
  totalDirty: boolean;
  saving: boolean;
  saveDraft: () => Promise<void>;
}) {
  const { t, lang } = useT();
  const generate = useGenerateQuotationPdf();
  const send = useSendQuotation();
  const recall = useRevertQuotationToDraft();
  const languageId = useId();
  // Recall pings the doctor, so it takes a second click to confirm.
  const [confirmRecall, setConfirmRecall] = useState(false);

  const isDraft = quote.status === QuotationStatus.DRAFT;
  const hasPack = !!quote.packId;
  const hasPdf = !!quote.pdfFilePath;
  const canCancel = isDraft || quote.status === QuotationStatus.SENT;
  const busy = saving || generate.isPending || send.isPending;

  const money = (amount: number) => formatPrice(amount, quote.currency);
  const net = Math.max(0, quote.treatmentFees + form.deliveryFees - form.discountAmount);
  const arch = quote.archType ?? ArchType.TWO_ARCHES;
  const packLine = hasPack
    ? `${quote.pack ? packName(quote.pack, lang) : (quote.packName ?? '')} · ${archLabel(arch, t)}`
    : t('quoteEditor.noPack');

  // Sending needs a pack and a plan; a pending total change would wipe
  // the plan on save, so it must be saved (and the plan redone) first.
  const sendBlocker = !hasPack
    ? t('quoteEditor.sendNeedsPack')
    : totalDirty && quote.paymentMode
      ? t('quoteEditor.adjustWipesPlan')
      : !quote.paymentMode
        ? t('quoteEditor.sendNeedsPlan')
        : null;

  const statusHint = isDraft
    ? t('quoteUi.review.footerDraft')
    : quote.status === QuotationStatus.SENT
      ? t('quoteUi.review.footerSent')
      : t('quoteUi.review.footerLocked');

  const run = async (action: () => Promise<unknown>) => {
    try {
      if (isDraft) await saveDraft();
      await action();
    } catch {
      /* the mutation hooks toast their own errors */
    }
  };

  const downloadPdf = async () => {
    try {
      await quotationsService.downloadPdf(
        quote.id,
        `${quote.quotationNumber ?? 'quotation'}.pdf`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('quoteUi.review.pdfError'));
    }
  };

  return (
    <aside className="w-full space-y-2 md:ml-auto md:max-w-sm xl:sticky xl:top-4 xl:max-w-none">
      <div className="rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              {quote.quotationNumber ?? t('quoteEditor.quoteLabel')}
            </span>
            <StatusBadge status={quote.status} />
          </div>
          <p className="mt-2 truncate text-base font-semibold">{patientName}</p>
          <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
            {orderCode ? <p>{t('quoteEditor.order', { code: orderCode })}</p> : null}
            <p className="first-letter:uppercase">
              {t('quoteEditor.created', { date: formatTimestampDay(quote.createdAt, lang) })}
            </p>
            {quote.sentAt ? (
              <p>{t('quoteEditor.sentOn', { date: formatTimestampDay(quote.sentAt, lang) })}</p>
            ) : null}
          </div>
        </div>

        <dl className="space-y-2 border-t p-5 text-sm">
          <SummaryRow label={packLine} value={hasPack ? money(quote.treatmentFees) : '—'} />
          {form.deliveryFees > 0 ? (
            <SummaryRow label={t('quoteEditor.deliveryFees')} value={money(form.deliveryFees)} />
          ) : null}
          {form.discountAmount > 0 ? (
            <SummaryRow
              label={t('quoteEditor.discount')}
              value={`− ${money(form.discountAmount)}`}
            />
          ) : null}
          <div className="flex items-baseline justify-between gap-3 border-t pt-3">
            <dt className="font-medium">{t('quoteUi.review.netToBill')}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {hasPack ? money(net) : '—'}
            </dd>
          </div>
        </dl>

        <div className="grid gap-2 border-t p-5">
          <Label htmlFor={languageId}>{t('quoteEditor.pdfLanguage')}</Label>
          <LanguageSelect id={languageId} value={form.language} onChange={onLanguageChange} />
          {!isDraft ? (
            <p className="text-xs text-muted-foreground">
              {t('quoteUi.review.regenHintBefore')}{' '}
              <span className="font-medium text-foreground">
                {t('quoteUi.review.regeneratePdf')}
              </span>{' '}
              {t('quoteUi.review.regenHintAfter')}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2 border-t p-5">
          {isDraft ? (
            <>
              <Button
                onClick={() => run(() => send.mutateAsync(quote.id))}
                disabled={!!sendBlocker || busy}
                className="w-full gap-2"
              >
                {send.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {t('quoteUi.review.sendToDoctor')}
              </Button>
              {sendBlocker ? (
                <p className="text-xs text-muted-foreground">{sendBlocker}</p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => saveDraft().catch(() => undefined)}
                  disabled={!dirty || busy}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  {t('common.save')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    run(() => generate.mutateAsync({ id: quote.id, lang: form.language }))
                  }
                  disabled={busy || !hasPack}
                >
                  {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {hasPdf ? t('quoteUi.review.regeneratePdf') : t('quoteUi.review.generatePdf')}
                </Button>
              </div>
            </>
          ) : (
            <>
              {quote.status === QuotationStatus.SENT ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!confirmRecall) {
                      setConfirmRecall(true);
                      return;
                    }
                    recall.mutate(quote.id, { onSuccess: () => setConfirmRecall(false) });
                  }}
                  onBlur={() => setConfirmRecall(false)}
                  disabled={recall.isPending}
                  className="w-full gap-2"
                >
                  {recall.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  {confirmRecall
                    ? t('quoteUi.review.confirmRecall')
                    : t('quoteUi.review.recallToEdit')}
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => run(() => generate.mutateAsync({ id: quote.id, lang: form.language }))}
                disabled={busy}
                className="w-full gap-2"
              >
                {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {t('quoteUi.review.regeneratePdf')}
              </Button>
            </>
          )}
          {hasPdf ? (
            <Button variant="ghost" onClick={downloadPdf} className="w-full gap-2">
              <Download className="size-4" />
              {t('quoteEditor.downloadPdf')}
            </Button>
          ) : null}
          <p
            className={cn(
              'pt-1 text-xs',
              dirty ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
            )}
          >
            {dirty ? t('quoteEditor.unsaved') : statusHint}
          </p>
        </div>
      </div>

      {canCancel ? <CancelQuoteButton quote={quote} orderId={orderId} /> : null}
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

function CancelQuoteButton({ quote, orderId }: { quote: Quotation; orderId: string }) {
  const { t } = useT();
  const cancel = useCancelQuotation();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={cancel.isPending}
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {t('quoteEditor.cancelQuote')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('quoteEditor.cancelTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('quoteEditor.cancelDesc')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('quoteEditor.keepQuote')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => cancel.mutate({ id: quote.id, orderId })}
          >
            {t('quoteEditor.cancelQuote')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
