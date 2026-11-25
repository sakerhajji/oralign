'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useDebounce } from 'use-debounce';
import { toast } from '@/lib/toast';
import { Loader2Icon, PackageIcon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from 'lucide-react';
import { PackPicker, type PackSelection } from '@/components/billing/pack-picker';
import {
  DiscountField,
  discountLabel,
  type DiscountMode,
} from '@/components/billing/discount-field';
import { InvoiceHistory } from '@/components/invoices/invoice-history';
import { formatRate } from '@/components/payments/withholding';
import { Button } from '@/components/ui/button';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionCard } from '@/components/ui/section-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { pickLocalized } from '@/lib/api/blog.service';
import {
  previewInclusiveInvoice,
  previewPercentOf,
  previewWithholding,
} from '@/lib/billing/tax-split';
import {
  useCompanyBilling,
  useCreateInvoice,
  useInvoiceClientSearch,
  useUpdateInvoice,
} from '@/lib/hooks';
import { translate } from '@/lib/i18n/dict';
import { useT } from '@/lib/i18n/lang-context';
import {
  ArchType,
  InvoiceStatus,
  PaymentMethod,
  type CreateInvoiceInput,
  type Invoice,
  type InvoiceClientMatch,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';

const INVOICES_PATH = '/dashboard/invoices';

/** Prisma Decimal arrives as a string over the wire. */
const n = (value: unknown): number => Number(value ?? 0);
const round3 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
const isoDay = (value: string | null | undefined): string =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

/** A line while it is being edited — `key` keeps React on the right row. */
interface EditableLine {
  key: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Empty means "use the invoice rate". */
  tvaRate?: number;
}

let lineCounter = 0;
const blankLine = (): EditableLine => ({
  key: `line-${(lineCounter += 1)}`,
  description: '',
  quantity: 1,
  unitPrice: 0,
});

interface FormState {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  clientCity: string;
  clientCountry: string;
  clientTaxId: string;
  issueDate: string;
  dueDate: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  language: 'fr' | 'en';
  tvaRate: number;
  /** The remise as typed in amount mode (TTC or HT, as the lines). */
  discountAmount: number;
  /** How the admin types the remise: an amount, or a % of the lines' gross. */
  discountMode: DiscountMode;
  discountPercent: number;
  stampDuty: number;
  /** Lines typed TTC, the stamp added on top (new invoices); HT otherwise. */
  pricesIncludeTax: boolean;
  paymentMethod: PaymentMethod | typeof NO_METHOD;
  paymentReference: string;
  /** Retenue à la source (%); 0 = none. */
  withholdingRate: number;
  notes: string;
  patientId?: string;
  doctorId?: string;
  orderId?: string;
}

/** The payment-method select's "not specified" (Radix items need a value). */
const NO_METHOD = 'none';

/** Ordered as the practice is paid most often. */
const METHOD_OPTIONS: PaymentMethod[] = [
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CARD,
  PaymentMethod.CASH,
  PaymentMethod.CHEQUE,
];

/** The DTO caps the retenue below 100 %. */
const MAX_WITHHOLDING = 99.99;

type DoctorOrder = InvoiceClientMatch['orders'][number];

interface TotalsPreview {
  /** Per line, as the line column shows it: TTC in TTC mode, HT otherwise. */
  lineAmounts: number[];
  /** Sum of the lines before the discount (TTC or HT, as above). */
  linesGross: number;
  discountApplied: number;
  subTotalHt: number;
  tvaAmount: number;
  stampDuty: number;
  totalTtc: number;
  withholdingAmount: number;
  netPayable: number;
}

/**
 * Local preview of the totals.
 *
 * Deliberately a MIRROR of InvoiceService.computeTotals, not a source of
 * truth: nothing computed here is ever sent. The DTO carries no totals at
 * all — the server recomputes them from the lines.
 *
 * TTC mode (prices typed TVA included, the stamp added on top) goes
 * through the shared lib/billing/tax-split mirror; HT mode keeps the
 * forward maths (TVA and stamp added on top). In both the retenue is
 * taken on the total TTC WITHOUT the stamp, and net = total - retenue.
 */
function previewTotals(
  lines: EditableLine[],
  tvaRate: number,
  discount: number,
  stamp: number,
  withholdingRate: number,
  pricesIncludeTax: boolean,
): TotalsPreview {
  if (pricesIncludeTax) {
    const r = previewInclusiveInvoice(
      lines.map((l) => ({ quantity: l.quantity, unitPriceTtc: l.unitPrice, tvaRate: l.tvaRate })),
      tvaRate,
      discount,
      stamp,
      withholdingRate,
    );
    return {
      lineAmounts: r.lineTtc,
      linesGross: r.grossTtc,
      discountApplied: r.discountApplied,
      subTotalHt: r.subTotalHt,
      tvaAmount: r.tvaAmount,
      stampDuty: r.stamp,
      totalTtc: r.totalTtc,
      withholdingAmount: r.withholdingAmount,
      netPayable: r.netPayable,
    };
  }
  const lineHt = lines.map((l) => round3(Math.max(0, l.quantity) * Math.max(0, l.unitPrice)));
  const grossHt = round3(lineHt.reduce((a, b) => a + b, 0));
  const discountApplied = Math.min(Math.max(0, discount), grossHt);
  const subTotalHt = round3(grossHt - discountApplied);
  const ratio = grossHt > 0 ? subTotalHt / grossHt : 0;
  let tva = 0;
  lines.forEach((line, i) => {
    const rate = Math.max(0, Math.min(100, line.tvaRate ?? tvaRate));
    tva += (lineHt[i] * ratio * rate) / 100;
  });
  tva = round3(tva);
  const stampDuty = round3(Math.max(0, stamp));
  const totalTtc = round3(subTotalHt + tva + stampDuty);
  // The retenue's base is the TTC without the stamp; the net still pays it.
  const withholding = previewWithholding(round3(totalTtc - stampDuty), withholdingRate);
  return {
    lineAmounts: lineHt,
    linesGross: grossHt,
    discountApplied: round3(discountApplied),
    subTotalHt,
    tvaAmount: tva,
    stampDuty,
    totalTtc,
    withholdingAmount: withholding.amount,
    netPayable: round3(totalTtc - withholding.amount),
  };
}

/**
 * The server's rule for an automatic invoice whose rate is unchanged
 * (InvoiceService.update): the retenue stays the stored amount, never
 * above the new TTC without the stamp (its base), and the net is what the
 * total (stamp included) leaves after it.
 */
function withStoredWithholding(totals: TotalsPreview, stored: number): TotalsPreview {
  const base = Math.max(0, round3(totals.totalTtc - totals.stampDuty));
  const kept = round3(Math.min(Math.max(0, stored), base));
  return { ...totals, withholdingAmount: kept, netPayable: round3(totals.totalTtc - kept) };
}

/**
 * Manual invoice form — the whole create / edit surface.
 *
 * Sections on the left (client, invoice, lines, notes), a sticky summary
 * on the right holding the VAT / discount / stamp inputs, the live totals
 * and the save actions. Nothing here computes a total that travels: the
 * payload carries the intent (lines, rates) and the server owns the money.
 */
export function InvoiceForm({ invoice }: { invoice?: Invoice | null }) {
  const { t, lang } = useT();
  const router = useRouter();
  const pricesToggleId = React.useId();
  const isEdit = Boolean(invoice);

  const settings = useCompanyBilling();
  const create = useCreateInvoice();
  const update = useUpdateInvoice();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = React.useState<FormState>(() => initialForm(invoice, settings.data));
  const [lines, setLines] = React.useState<EditableLine[]>(() => initialLines(invoice));
  const [showErrors, setShowErrors] = React.useState(false);
  const [clientQuery, setClientQuery] = React.useState('');
  const [debouncedQuery] = useDebounce(clientQuery, 300);
  const [picked, setPicked] = React.useState<InvoiceClientMatch | null>(null);
  const clientNameRef = React.useRef<HTMLInputElement>(null);
  const linesRef = React.useRef<HTMLDivElement>(null);

  const matches = useInvoiceClientSearch(debouncedQuery);

  // A new invoice inherits the practice's VAT rate and stamp duty as soon
  // as the settings land — the same values the server would apply.
  const settingsApplied = React.useRef(isEdit);
  React.useEffect(() => {
    if (settingsApplied.current || !settings.data) return;
    settingsApplied.current = true;
    setForm((prev) => ({
      ...prev,
      tvaRate: settings.data?.defaultTvaRate ?? prev.tvaRate,
      stampDuty: settings.data?.stampDuty ?? prev.stampDuty,
    }));
  }, [settings.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setLine = (key: string, changes: Partial<EditableLine>) =>
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...changes } : line)));

  const addLine = () => setLines((prev) => [...prev, blankLine()]);
  const removeLine = (key: string) => setLines((prev) => prev.filter((line) => line.key !== key));

  /**
   * The customer is the practitioner ("Docteur"): picking one fills the
   * block from their account and practice — the practice's e-mail and
   * phone first, as on the automatic invoices.
   */
  const pickClient = (match: InvoiceClientMatch) => {
    setPicked(match);
    setForm((prev) => ({
      ...prev,
      clientName: match.fullName,
      clientEmail: match.clinicEmail ?? match.email ?? '',
      clientPhone: match.clinicPhone ?? match.phone ?? '',
      clientAddress: match.clinicAddress ?? '',
      clientCity: match.city ?? '',
      clientCountry: match.country ?? '',
      clientTaxId: match.taxId ?? '',
      doctorId: match.id,
      // An order line links the patient and the order.
      patientId: undefined,
      orderId: undefined,
    }));
    setClientQuery('');
  };

  const detachClient = () => {
    setPicked(null);
    setForm((prev) => ({
      ...prev,
      patientId: undefined,
      doctorId: undefined,
      orderId: undefined,
    }));
  };

  /**
   * Prices quoted to a practitioner are TTC. In TTC mode a line takes the
   * price as is; in HT mode (older invoices) the net unit price is derived
   * backwards at the invoice rate, as before.
   */
  const netFromGross = (gross: number) => {
    const rate = Number.isFinite(form.tvaRate) ? Math.max(0, Math.min(100, form.tvaRate)) : 0;
    return round3(gross / (1 + rate / 100));
  };
  const unitFromGross = (gross: number) =>
    form.pricesIncludeTax ? round3(gross) : netFromGross(gross);

  const appendLine = (line: Omit<EditableLine, 'key'>) =>
    setLines((prev) => [...prev.filter((l) => l.description.trim() !== ''), { ...blankLine(), ...line }]);

  /** Append a line for a catalogue pack, labelled in the invoice language. */
  const addPackLine = ({ pack, price }: PackSelection) => {
    const docLang = form.language;
    const name = pickLocalized(pack.nameI18n ?? pack.name, docLang) || pack.name;
    const arch = translate(
      price.archType === ArchType.ONE_ARCH
        ? 'quoteUi.attachPack.singleArch'
        : 'quoteUi.attachPack.twoArches',
      docLang,
    );
    const gross = n(price.price);
    appendLine({
      description: translate('packPicker.invoiceLine', docLang, { name, arch }),
      quantity: 1,
      unitPrice: unitFromGross(gross),
    });
    toast.success(t('packPicker.packAdded'), {
      description: form.pricesIncludeTax
        ? t('invoicesAdmin.packAddedTtcHint', { price: formatPrice(gross, price.currency) })
        : t('packPicker.packAddedHint', {
            price: formatPrice(gross, price.currency),
            rate: form.tvaRate,
          }),
    });
  };

  /** Link the invoice to one of the doctor's orders (and its patient). */
  const linkOrder = (order: DoctorOrder) =>
    setForm((prev) => ({ ...prev, orderId: order.id, patientId: order.patientId ?? undefined }));

  /** "Pack X — ORD-12 · Patient": what the doctor reads on the invoice. */
  const orderLabel = (order: DoctorOrder, head: string) =>
    order.patientName ? `${head} · ${order.patientName}` : head;

  /**
   * Bill the order's quote: the line takes what is still to invoice (quote
   * TTC minus what the order's other invoices already carry for the
   * quote), with a warning when part or all of it was invoiced before.
   * The treatment-fee facture also points at the order but is not part of
   * the quote, so it is never subtracted here.
   */
  const addOrderLine = (order: DoctorOrder) => {
    const total = n(order.quotation?.totalTtc);
    const invoiced = n(order.quoteInvoicedTotal);
    const remaining = Math.max(0, round3(total - invoiced));
    linkOrder(order);
    appendLine({
      description: orderLabel(
        order,
        order.quotation?.packName
          ? `${order.quotation.packName} — ${order.orderCode}`
          : order.orderCode,
      ),
      quantity: 1,
      unitPrice: unitFromGross(remaining),
    });
    if (invoiced > 0 && total > 0) {
      const vars = { invoiced: money(invoiced), total: money(total), remaining: money(remaining) };
      if (remaining <= 0) {
        toast.warning(t('invoicesAdmin.orderFullyInvoiced'), {
          description: t('invoicesAdmin.orderFullyInvoicedBody', vars),
        });
      } else {
        toast.warning(t('invoicesAdmin.orderPartlyInvoiced'), {
          description: t('invoicesAdmin.orderPartlyInvoicedBody', vars),
        });
      }
      return;
    }
    toast.success(t('invoiceDesk.lineAdded'), {
      description: form.pricesIncludeTax
        ? t('invoicesAdmin.orderLineTtcHint')
        : t('invoiceDesk.orderLineHint', { rate: form.tvaRate }),
    });
  };

  /**
   * Bill the order's treatment fee (+ CBCT): the fee due, retenue
   * included. A paid fee usually has its automatic facture already: the
   * line then takes only what that facture leaves (0 for a whole fee),
   * with a warning, so the fee is not invoiced twice by mistake.
   */
  const addFeeLine = (order: DoctorOrder) => {
    const fee = n(order.treatmentFeeDue);
    const invoiced = n(order.feeInvoicedTotal);
    const remaining = Math.max(0, round3(fee - invoiced));
    linkOrder(order);
    appendLine({
      description: orderLabel(
        order,
        translate('invoicesAdmin.feeLine', form.language, { code: order.orderCode }),
      ),
      quantity: 1,
      unitPrice: unitFromGross(remaining),
    });
    if (invoiced > 0) {
      toast.warning(t('invoicesAdmin.feeAlreadyInvoiced'), {
        description: t('invoicesAdmin.feeAlreadyInvoicedBody', {
          invoiced: money(invoiced),
          total: money(fee),
          remaining: money(remaining),
        }),
      });
      return;
    }
    toast.success(t('invoiceDesk.lineAdded'), {
      description: form.pricesIncludeTax
        ? t('invoicesAdmin.feeLineTtcHint')
        : t('invoiceDesk.orderLineHint', { rate: form.tvaRate }),
    });
  };

  // The lines' gross a percentage applies to (TTC or HT, as typed), and the
  // remise it stands for, with the server's rounding.
  const linesGross =
    lines.reduce(
      (acc, l) => acc + Math.round(Math.max(0, l.quantity) * Math.max(0, l.unitPrice) * 1000),
      0,
    ) / 1000;
  const effectiveDiscount =
    form.discountMode === 'percent'
      ? previewPercentOf(linesGross, form.discountPercent)
      : form.discountAmount;
  // Switching keeps the remise: the amount becomes its percentage of the
  // gross (2 decimals), and back.
  const switchDiscountMode = (mode: DiscountMode) => {
    if (mode === form.discountMode) return;
    setForm((prev) =>
      mode === 'percent'
        ? {
            ...prev,
            discountMode: 'percent',
            discountPercent:
              linesGross > 0
                ? Math.min(100, Math.round((prev.discountAmount / linesGross) * 10000) / 100)
                : 0,
          }
        : { ...prev, discountMode: 'amount', discountAmount: effectiveDiscount },
    );
  };

  const computedTotals = previewTotals(
    lines,
    form.tvaRate,
    effectiveDiscount,
    form.stampDuty,
    form.withholdingRate,
    form.pricesIncludeTax,
  );
  // An automatic invoice (a payment's or a treatment fee's) states what
  // the practitioner really withheld: while the admin leaves its rate
  // alone, the server keeps the stored retenue (capped at the new total)
  // instead of recomputing it, so the preview does the same. A changed
  // rate is recomputed on the total, as above.
  const keepsStoredWithholding =
    !!invoice &&
    Boolean(invoice.paymentId || invoice.treatmentFeeOrderId) &&
    form.withholdingRate === n(invoice.withholdingRate);
  const totals = keepsStoredWithholding
    ? withStoredWithholding(computedTotals, n(invoice?.withholdingAmount))
    : computedTotals;
  const currency = invoice?.currency ?? settings.data?.defaultCurrency ?? 'TND';
  const money = (value: number) => formatPrice(value, currency);
  const companyWithholdingRate = n(settings.data?.withholdingRate);
  // "TVA (19 %)" while every line uses the invoice rate; plain "TVA" otherwise.
  const singleRate = lines.every((l) => l.tvaRate === undefined || l.tvaRate === form.tvaRate);
  const tvaLabel = singleRate
    ? t('invoicesAdmin.previewTvaRate', { rate: formatRate(form.tvaRate, lang) })
    : t('invoicesAdmin.previewTva');

  const validLines = lines.filter((l) => l.description.trim() !== '');
  const errors = {
    clientName: form.clientName.trim() === '' ? t('invoicesAdmin.errDoctorName') : null,
    lines: validLines.length === 0 ? t('invoicesAdmin.noLines') : null,
  };
  const firstError = errors.clientName ?? errors.lines;

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (firstError) {
      setShowErrors(true);
      if (errors.clientName) clientNameRef.current?.focus();
      else linesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Only the intent travels — never a total.
    const payload: CreateInvoiceInput = {
      clientName: form.clientName.trim(),
      clientEmail: form.clientEmail.trim() || undefined,
      clientPhone: form.clientPhone.trim() || undefined,
      clientAddress: form.clientAddress.trim() || undefined,
      clientCity: form.clientCity.trim() || undefined,
      clientCountry: form.clientCountry.trim() || undefined,
      clientTaxId: form.clientTaxId.trim() || undefined,
      issueDate: form.issueDate || undefined,
      dueDate: form.dueDate || undefined,
      status: form.status,
      language: form.language,
      tvaRate: form.tvaRate,
      // A percentage travels as such (the server derives the amount and the
      // PDF prints "Remise (10 %)"); an amount clears any percentage.
      ...(form.discountMode === 'percent'
        ? { discountPercent: form.discountPercent }
        : { discountAmount: form.discountAmount, discountPercent: null }),
      stampDuty: form.stampDuty,
      pricesIncludeTax: form.pricesIncludeTax,
      // null clears a stored value on edit; a new invoice just omits it.
      paymentMethod:
        form.paymentMethod === NO_METHOD ? (isEdit ? null : undefined) : form.paymentMethod,
      paymentReference: form.paymentReference.trim() || (isEdit ? null : undefined),
      withholdingRate: form.withholdingRate,
      notes: form.notes.trim() || undefined,
      patientId: form.patientId,
      doctorId: form.doctorId,
      orderId: form.orderId,
      // unitPrice is TTC (TVA included, stamp not) when pricesIncludeTax, HT otherwise.
      lines: validLines.map((line) => ({
        description: line.description.trim(),
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        tvaRate: line.tvaRate,
      })),
    };

    if (isEdit && invoice) {
      // The number is only sent when the admin actually changed it —
      // resending the same value would trip the uniqueness check.
      const patch: CreateInvoiceInput = { ...payload };
      const typedNumber = form.invoiceNumber.trim();
      if (typedNumber && typedNumber !== invoice.invoiceNumber) patch.invoiceNumber = typedNumber;
      update.mutate(
        { id: invoice.id, input: patch },
        { onSuccess: () => router.push(INVOICES_PATH) },
      );
      return;
    }

    if (form.invoiceNumber.trim()) payload.invoiceNumber = form.invoiceNumber.trim();
    create.mutate(payload, { onSuccess: () => router.push(INVOICES_PATH) });
  };

  const saveLabel = isEdit ? t('invoiceDesk.saveExisting') : t('invoiceDesk.saveNew');
  const unitPriceLabel = form.pricesIncludeTax
    ? t('invoicesAdmin.lineUnitPriceTtc')
    : t('invoicesAdmin.lineUnitPriceHt');
  const lineTotalLabel = form.pricesIncludeTax
    ? t('invoicesAdmin.lineTotalTtc')
    : t('invoicesAdmin.lineTotal');

  return (
    <form
      onSubmit={submit}
      className="grid gap-6 pb-20 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:pb-0"
    >
      <div className="min-w-0 space-y-4">
        {/* ── Client ── */}
        <SectionCard
          title={t('invoicesAdmin.clientSection')}
          description={t('invoicesAdmin.clientSectionDesc')}
        >
          <div className="space-y-4">
            {picked ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium">
                    {t('invoiceDesk.linkedTo', { name: picked.fullName })}
                    {picked.clinicName ? (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        · {picked.clinicName}
                      </span>
                    ) : null}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="max-sm:h-11"
                    onClick={detachClient}
                  >
                    <XIcon className="mr-1 size-3.5" />
                    {t('invoicesAdmin.clientClear')}
                  </Button>
                </div>
                {picked.orders.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('invoicesAdmin.noOrders')}
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t('invoicesAdmin.ordersOf', { name: picked.fullName })}
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {picked.orders.map((order) => (
                        <DoctorOrderRow
                          key={order.id}
                          order={order}
                          linked={form.orderId === order.id}
                          money={money}
                          onBillQuote={() => addOrderLine(order)}
                          onBillFee={() => addFeeLine(order)}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    placeholder={t('invoicesAdmin.clientSearch')}
                    aria-label={t('invoicesAdmin.clientSearch')}
                    className="pl-9"
                  />
                </div>
                {debouncedQuery.trim().length >= 2 ? (
                  <div className="rounded-lg border">
                    {matches.isLoading ? (
                      <p className="p-3 text-sm text-muted-foreground">
                        {t('invoicesAdmin.clientSearching')}
                      </p>
                    ) : (matches.data?.length ?? 0) === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">
                        {t('invoicesAdmin.clientNoMatch')}
                      </p>
                    ) : (
                      <ul className="divide-y">
                        {matches.data?.map((match) => (
                          <li key={match.id}>
                            <button
                              type="button"
                              onClick={() => pickClient(match)}
                              className="flex min-h-11 w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/50"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {match.fullName}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {[match.clinicName, match.email, match.phone]
                                    .filter(Boolean)
                                    .join(' · ') || '—'}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {t('invoicesAdmin.ordersCount', { count: match.orders.length })}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('invoicesAdmin.clientSearchHint')}
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField
                label={t('invoicesAdmin.fieldClientName')}
                required
                error={showErrors ? errors.clientName : null}
                inputRef={clientNameRef}
                value={form.clientName}
                onChange={(v) => set('clientName', v)}
                autoComplete="organization"
              />
              <TextField
                label={t('invoicesAdmin.fieldEmail')}
                type="email"
                value={form.clientEmail}
                onChange={(v) => set('clientEmail', v)}
                autoComplete="email"
              />
              <TextField
                label={t('invoicesAdmin.fieldPhone')}
                type="tel"
                value={form.clientPhone}
                onChange={(v) => set('clientPhone', v)}
                autoComplete="tel"
              />
              <TextField
                label={t('invoicesAdmin.fieldAddress')}
                className="sm:col-span-2"
                value={form.clientAddress}
                onChange={(v) => set('clientAddress', v)}
                autoComplete="street-address"
              />
              <TextField
                label={t('invoicesAdmin.fieldCity')}
                value={form.clientCity}
                onChange={(v) => set('clientCity', v)}
                autoComplete="address-level2"
              />
              <TextField
                label={t('invoicesAdmin.fieldCountry')}
                value={form.clientCountry}
                onChange={(v) => set('clientCountry', v)}
                autoComplete="country-name"
              />
              <TextField
                label={t('invoicesAdmin.fieldTaxId')}
                value={form.clientTaxId}
                onChange={(v) => set('clientTaxId', v)}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── Invoice header ── */}
        <SectionCard
          title={t('invoiceDesk.invoiceSection')}
          description={t('invoiceDesk.invoiceSectionDesc')}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField
              label={t('invoicesAdmin.fieldIssueDate')}
              type="date"
              value={form.issueDate}
              onChange={(v) => set('issueDate', v)}
            />
            <TextField
              label={t('invoicesAdmin.fieldDueDate')}
              type="date"
              value={form.dueDate}
              onChange={(v) => set('dueDate', v)}
            />
            <SelectField
              label={t('invoicesAdmin.fieldStatus')}
              value={form.status}
              onChange={(v) => set('status', v as InvoiceStatus)}
              options={[
                { value: InvoiceStatus.DRAFT, label: t('invoicesAdmin.statusDraft') },
                { value: InvoiceStatus.ISSUED, label: t('invoicesAdmin.statusIssued') },
                { value: InvoiceStatus.PAID, label: t('invoicesAdmin.statusPaid') },
                { value: InvoiceStatus.CANCELLED, label: t('invoicesAdmin.statusCancelled') },
              ]}
            />
            <SelectField
              label={t('invoicesAdmin.fieldPaymentMethod')}
              value={form.paymentMethod}
              onChange={(v) => set('paymentMethod', v as FormState['paymentMethod'])}
              hint={
                form.status === InvoiceStatus.PAID && form.paymentMethod === NO_METHOD
                  ? t('invoicesAdmin.paymentMethodPaidHint')
                  : undefined
              }
              options={[
                { value: NO_METHOD, label: t('invoicesAdmin.paymentMethodNone') },
                ...METHOD_OPTIONS.map((method) => ({
                  value: method,
                  label: t(`paymentsDesk.methodLong.${method}`),
                })),
              ]}
            />
            <TextField
              label={t('invoicesAdmin.fieldPaymentReference')}
              placeholder={t('invoicesAdmin.paymentReferencePh')}
              value={form.paymentReference}
              maxLength={120}
              onChange={(v) => set('paymentReference', v)}
            />
            <TextField
              label={t('invoicesAdmin.fieldNumber')}
              hint={t('invoicesAdmin.fieldNumberHint')}
              placeholder="FAC-000123"
              value={form.invoiceNumber}
              onChange={(v) => set('invoiceNumber', v)}
            />
            <SelectField
              label={t('invoicesAdmin.fieldLanguage')}
              value={form.language}
              onChange={(v) => set('language', v as 'fr' | 'en')}
              options={[
                { value: 'fr', label: 'Français' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>
        </SectionCard>

        {/* ── Lines ── */}
        <SectionCard
          title={t('invoicesAdmin.linesSection')}
          description={t('invoiceDesk.linesSectionDesc')}
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <PackPicker
                align="end"
                onSelect={addPackLine}
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    <PackageIcon className="mr-2 size-4" />
                    {t('packPicker.addPack')}
                  </Button>
                }
              />
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <PlusIcon className="mr-2 size-4" />
                {t('invoicesAdmin.addLine')}
              </Button>
            </div>
          }
        >
          <div ref={linesRef} className="space-y-2">
            {/* Prices are TTC by default (TVA inside), the stamp is added to
                the total. Older invoices keep their HT lines. */}
            <div className="flex min-h-11 items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
              <label htmlFor={pricesToggleId} className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-sm font-medium">
                  {t('invoicesAdmin.pricesIncludeTax')}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {form.pricesIncludeTax
                    ? t('invoicesAdmin.pricesIncludeTaxOn')
                    : t('invoicesAdmin.pricesIncludeTaxOff')}
                </span>
              </label>
              <Switch
                id={pricesToggleId}
                checked={form.pricesIncludeTax}
                onCheckedChange={(checked) => set('pricesIncludeTax', checked)}
                className="mt-1"
              />
            </div>
            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">{t('invoiceDesk.emptyLines')}</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addLine}>
                  <PlusIcon className="mr-2 size-4" />
                  {t('invoicesAdmin.addLine')}
                </Button>
              </div>
            ) : (
              <>
                {/* Column headers — desktop only; each field keeps its own
                    label on small screens. */}
                <div className="hidden gap-3 px-1 text-xs text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_5rem_8rem_6rem_7rem_2.25rem]">
                  <span>{t('invoicesAdmin.lineDescription')}</span>
                  <span>{t('invoicesAdmin.lineQuantity')}</span>
                  <span>{unitPriceLabel}</span>
                  <span>{t('invoicesAdmin.lineTva')}</span>
                  <span className="text-right">{lineTotalLabel}</span>
                  <span className="sr-only">{t('invoicesAdmin.colActions')}</span>
                </div>

                {lines.map((line, index) => (
                  <div
                    key={line.key}
                    className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_5rem_8rem_6rem_7rem_2.25rem] lg:items-center lg:rounded-none lg:border-0 lg:border-b lg:px-1 lg:py-2 lg:last:border-b-0"
                  >
                    <LineField label={t('invoicesAdmin.lineDescription')}>
                      <Input
                        value={line.description}
                        onChange={(e) => setLine(line.key, { description: e.target.value })}
                        aria-label={`${t('invoicesAdmin.lineDescription')} ${index + 1}`}
                      />
                    </LineField>
                    <div className="grid grid-cols-2 gap-3 lg:contents">
                      <LineField label={t('invoicesAdmin.lineQuantity')}>
                        <DecimalInput
                          value={line.quantity}
                          onValueChange={(v) => setLine(line.key, { quantity: v })}
                          className="tabular-nums"
                          aria-label={`${t('invoicesAdmin.lineQuantity')} ${index + 1}`}
                        />
                      </LineField>
                      <LineField label={unitPriceLabel}>
                        <DecimalInput
                          value={line.unitPrice}
                          onValueChange={(v) => setLine(line.key, { unitPrice: v })}
                          className="tabular-nums"
                          aria-label={`${unitPriceLabel} ${index + 1}`}
                        />
                      </LineField>
                      <LineField label={t('invoicesAdmin.lineTva')}>
                        <Input
                          inputMode="decimal"
                          value={line.tvaRate ?? ''}
                          placeholder={String(form.tvaRate)}
                          onChange={(e) => {
                            const raw = e.target.value.replace(',', '.');
                            if (raw !== '' && !/^\d*\.?\d{0,2}$/.test(raw)) return;
                            setLine(line.key, {
                              tvaRate: raw === '' ? undefined : Math.min(100, Number(raw)),
                            });
                          }}
                          className="tabular-nums"
                          aria-label={`${t('invoicesAdmin.lineTva')} ${index + 1}`}
                        />
                      </LineField>
                      <LineField label={lineTotalLabel} className="lg:text-right">
                        <p className="flex h-9 items-center justify-end text-sm font-medium tabular-nums lg:justify-end">
                          {money(totals.lineAmounts[index] ?? 0)}
                        </p>
                      </LineField>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="justify-self-end text-muted-foreground hover:text-destructive"
                      aria-label={`${t('invoicesAdmin.removeLine')} ${index + 1}`}
                      onClick={() => removeLine(line.key)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                ))}
              </>
            )}
            {showErrors && errors.lines ? (
              <p className="text-xs text-destructive">{errors.lines}</p>
            ) : null}
          </div>
        </SectionCard>

        {/* ── Notes ── */}
        <SectionCard title={t('invoicesAdmin.fieldNotes')}>
          <Textarea
            rows={3}
            value={form.notes}
            maxLength={2000}
            onChange={(e) => set('notes', e.target.value)}
            aria-label={t('invoicesAdmin.fieldNotes')}
          />
        </SectionCard>

        {/* ── History (edit only) ── */}
        {invoice ? (
          <InvoiceHistory entries={invoice.auditLogs ?? []} currency={currency} />
        ) : null}
      </div>

      {/* ── Summary + actions ── */}
      <aside className="w-full space-y-2 md:ml-auto md:max-w-sm xl:sticky xl:top-4 xl:max-w-none">
        <div className="rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10">
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-1">
            <NumberField
              label={t('invoicesAdmin.fieldTvaRate')}
              value={form.tvaRate}
              onChange={(v) => set('tvaRate', Math.min(100, v))}
              suffix="%"
              fractionDigits={2}
            />
            <DiscountField
              label={
                form.pricesIncludeTax
                  ? t('invoicesAdmin.fieldDiscountTtc')
                  : t('invoicesAdmin.fieldDiscount')
              }
              currency={currency}
              mode={form.discountMode}
              amount={form.discountAmount}
              percent={form.discountPercent}
              percentAmount={effectiveDiscount}
              onModeChange={switchDiscountMode}
              onAmountChange={(v) => set('discountAmount', v)}
              onPercentChange={(v) => set('discountPercent', v)}
            />
            <NumberField
              label={t('invoicesAdmin.fieldStampDuty')}
              value={form.stampDuty}
              onChange={(v) => set('stampDuty', v)}
              suffix={currency}
            />
            <div className="grid gap-1.5">
              <NumberField
                label={t('invoicesAdmin.fieldWithholdingRate')}
                value={form.withholdingRate}
                onChange={(v) => set('withholdingRate', Math.min(MAX_WITHHOLDING, v))}
                suffix="%"
                fractionDigits={2}
                hint={t('invoicesAdmin.withholdingHint')}
              />
              {/* One click to the company rate; always there (disabled once
                  applied) so the column never jumps. */}
              {companyWithholdingRate > 0 ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto justify-self-start px-0 max-sm:min-h-11"
                  disabled={form.withholdingRate === companyWithholdingRate}
                  onClick={() => set('withholdingRate', companyWithholdingRate)}
                >
                  {t('invoicesAdmin.applyWithholdingRate', {
                    rate: formatRate(companyWithholdingRate, lang),
                  })}
                </Button>
              ) : null}
            </div>
          </div>

          <dl className="space-y-2 border-t p-5 text-sm">
            {totals.discountApplied > 0 ? (
              <>
                <TotalRow
                  label={
                    form.pricesIncludeTax
                      ? t('invoicesAdmin.previewLinesTtc')
                      : t('invoicesAdmin.previewLinesHt')
                  }
                  value={money(totals.linesGross)}
                />
                <TotalRow
                  label={discountLabel(
                    form.pricesIncludeTax
                      ? t('invoicesAdmin.fieldDiscountTtc')
                      : t('invoicesAdmin.fieldDiscount'),
                    form.discountMode,
                    form.discountPercent,
                    lang,
                  )}
                  value={`− ${money(totals.discountApplied)}`}
                />
              </>
            ) : null}
            <TotalRow label={t('invoicesAdmin.previewHt')} value={money(totals.subTotalHt)} />
            <TotalRow label={tvaLabel} value={money(totals.tvaAmount)} />
            <TotalRow label={t('invoicesAdmin.fieldStampDuty')} value={money(totals.stampDuty)} />
            <div className="flex items-baseline justify-between gap-3 border-t pt-2">
              <dt className="font-medium">{t('invoicesAdmin.previewTtc')}</dt>
              <dd className="font-medium tabular-nums">{money(totals.totalTtc)}</dd>
            </div>
            <TotalRow
              label={t('invoicesAdmin.previewWithholding', {
                rate: formatRate(form.withholdingRate, lang),
              })}
              value={
                totals.withholdingAmount > 0
                  ? `− ${money(totals.withholdingAmount)}`
                  : money(0)
              }
            />
            <div className="flex items-baseline justify-between gap-3 border-t pt-3">
              <dt className="font-medium">{t('invoicesAdmin.previewNetPayable')}</dt>
              <dd className="text-lg font-semibold tabular-nums">{money(totals.netPayable)}</dd>
            </div>
          </dl>

          <div className="hidden gap-2 border-t p-5 xl:grid">
            <Button type="submit" disabled={pending} className="w-full gap-2">
              {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {saveLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => router.push(INVOICES_PATH)}
              className="w-full"
            >
              {t('invoicesAdmin.cancel')}
            </Button>
            {showErrors && firstError ? (
              <p className="text-xs text-destructive">{firstError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('invoiceDesk.settingsHint')}</p>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile / laptop action bar — the total and the primary action stay
          reachable without scrolling back to the summary. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t bg-background/95 px-3 py-2 backdrop-blur sm:px-5 xl:hidden">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">
            {t('invoicesAdmin.previewNetPayable')}
          </p>
          <p className="truncate text-sm font-semibold tabular-nums">{money(totals.netPayable)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => router.push(INVOICES_PATH)}
          >
            {t('invoicesAdmin.cancel')}
          </Button>
          <Button type="submit" disabled={pending} className="gap-2">
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {t('invoicesAdmin.save')}
          </Button>
        </div>
      </div>
    </form>
  );
}

function initialForm(invoice: Invoice | null | undefined, settings?: { defaultTvaRate: number; stampDuty: number } | null): FormState {
  if (invoice) {
    return {
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail ?? '',
      clientPhone: invoice.clientPhone ?? '',
      clientAddress: invoice.clientAddress ?? '',
      clientCity: invoice.clientCity ?? '',
      clientCountry: invoice.clientCountry ?? '',
      clientTaxId: invoice.clientTaxId ?? '',
      issueDate: isoDay(invoice.issueDate),
      dueDate: isoDay(invoice.dueDate),
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      language: invoice.language,
      tvaRate: n(invoice.tvaRate),
      discountAmount: n(invoice.discountAmount),
      discountMode: n(invoice.discountPercent) > 0 ? 'percent' : 'amount',
      discountPercent: n(invoice.discountPercent),
      stampDuty: n(invoice.stampDuty),
      // Older invoices carry no flag: they were typed HT.
      pricesIncludeTax: invoice.pricesIncludeTax ?? false,
      paymentMethod: invoice.paymentMethod ?? NO_METHOD,
      paymentReference: invoice.paymentReference ?? '',
      withholdingRate: n(invoice.withholdingRate),
      notes: invoice.notes ?? '',
      patientId: invoice.patientId ?? undefined,
      doctorId: invoice.doctorId ?? undefined,
      orderId: invoice.orderId ?? undefined,
    };
  }
  return {
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    clientAddress: '',
    clientCity: '',
    clientCountry: '',
    clientTaxId: '',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    invoiceNumber: '',
    status: InvoiceStatus.DRAFT,
    language: 'fr',
    tvaRate: settings?.defaultTvaRate ?? 19,
    discountAmount: 0,
    discountMode: 'amount',
    discountPercent: 0,
    stampDuty: settings?.stampDuty ?? 1,
    // Owner decision: prices are TTC (TVA included), the stamp added on top.
    pricesIncludeTax: true,
    paymentMethod: NO_METHOD,
    paymentReference: '',
    withholdingRate: 0,
    notes: '',
  };
}

function initialLines(invoice: Invoice | null | undefined): EditableLine[] {
  if (!invoice || invoice.lines.length === 0) return [blankLine()];
  // A TTC-priced invoice is edited in the prices as typed (unitPriceTtc).
  const ttc = invoice.pricesIncludeTax === true;
  return invoice.lines.map((line) => ({
    ...blankLine(),
    description: line.description,
    quantity: n(line.quantity),
    unitPrice: n(ttc ? (line.unitPriceTtc ?? line.unitPrice) : line.unitPrice),
    tvaRate: line.tvaRate ?? undefined,
  }));
}

// ─── Field primitives ─────────────────────────────────────────────────

function TextField({
  label,
  hint,
  error,
  required,
  className,
  inputRef,
  value,
  onChange,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'ref'>) {
  const id = React.useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      <Input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  const id = React.useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          className="w-full"
          aria-describedby={hint ? `${id}-hint` : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-amber-700 dark:text-amber-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  fractionDigits,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  fractionDigits?: number;
  hint?: string;
}) {
  const id = React.useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <DecimalInput
          id={id}
          value={value}
          onValueChange={onChange}
          fractionDigits={fractionDigits}
          className="pr-12 tabular-nums"
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One of the picked doctor's orders: the patient and the order code, what
 * the quote and the fee come to, what was already invoiced, and the two
 * ways to bill it.
 */
function DoctorOrderRow({
  order,
  linked,
  money,
  onBillQuote,
  onBillFee,
}: {
  order: DoctorOrder;
  /** The invoice is already linked to this order. */
  linked: boolean;
  money: (value: number) => string;
  onBillQuote: () => void;
  onBillFee: () => void;
}) {
  const { t } = useT();
  const quoteTtc = n(order.quotation?.totalTtc);
  const feeDue = n(order.treatmentFeeDue);
  const amounts = [
    quoteTtc > 0 ? t('invoicesAdmin.orderQuote', { amount: money(quoteTtc) }) : null,
    feeDue > 0 ? t('invoicesAdmin.orderFee', { amount: money(feeDue) }) : null,
  ].filter(Boolean);
  // The quote and the fee are billed apart, so what is already on paper
  // is told apart too: one figure per button.
  const quoteInvoiced = n(order.quoteInvoicedTotal);
  const feeInvoiced = n(order.feeInvoicedTotal);
  const invoiced = [
    quoteInvoiced > 0
      ? t('invoicesAdmin.orderQuoteInvoiced', { amount: money(quoteInvoiced) })
      : null,
    feeInvoiced > 0
      ? t('invoicesAdmin.orderFeeInvoiced', { amount: money(feeInvoiced) })
      : null,
  ].filter(Boolean);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background px-2.5 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{order.patientName ?? '—'}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {order.orderCode}
          {order.quotation?.packName ? ` · ${order.quotation.packName}` : ''}
        </span>
        {amounts.length > 0 ? (
          <span className="block text-xs text-muted-foreground tabular-nums">
            {amounts.join(' · ')}
          </span>
        ) : null}
        {invoiced.length > 0 ? (
          <span className="block text-xs text-amber-700 tabular-nums dark:text-amber-400">
            {invoiced.join(' · ')}
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {order.quotation || feeDue <= 0 ? (
          <Button
            type="button"
            variant={linked ? 'secondary' : 'outline'}
            size="sm"
            className="max-sm:h-11"
            onClick={onBillQuote}
          >
            {order.quotation ? t('invoicesAdmin.billQuote') : t('invoiceDesk.lineFromOrder')}
          </Button>
        ) : null}
        {feeDue > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-sm:h-11"
            onClick={onBillFee}
          >
            {t('invoicesAdmin.billFee')}
          </Button>
        ) : null}
      </span>
    </li>
  );
}

/** A line cell: label above the control below `lg`, control only above. */
function LineField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <span className="text-xs text-muted-foreground lg:hidden">{label}</span>
      {children}
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}
