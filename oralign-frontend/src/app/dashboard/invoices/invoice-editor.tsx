'use client';

import * as React from 'react';
import { useDebounce } from 'use-debounce';
import { Loader2Icon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useT } from '@/lib/i18n/lang-context';
import {
  useCreateInvoice,
  useInvoice,
  useInvoiceClientSearch,
  useUpdateInvoice,
} from '@/lib/hooks';
import {
  InvoiceStatus,
  type CreateInvoiceInput,
  type Invoice,
  type InvoiceClientMatch,
  type InvoiceLineInput,
} from '@/lib/types';

const n = (v: unknown): number => Number(v ?? 0);

/** Empty row the "add a line" button appends. */
const blankLine = (): InvoiceLineInput => ({
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
  discountAmount: number;
  stampDuty: number;
  notes: string;
  patientId?: string;
  doctorId?: string;
  orderId?: string;
}

const isoDay = (value: string | null | undefined): string =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

function emptyForm(): FormState {
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
    tvaRate: 19,
    discountAmount: 0,
    stampDuty: 1,
    notes: '',
  };
}

/**
 * Local preview of the totals.
 *
 * Deliberately a MIRROR of InvoiceService.computeTotals, not a source of
 * truth: nothing computed here is ever sent. The DTO carries no totals at
 * all, the server recomputes from the lines and stores its own result —
 * this only spares the admin a round trip while typing.
 */
function previewTotals(
  lines: InvoiceLineInput[],
  tvaRate: number,
  discount: number,
  stamp: number,
) {
  const round = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 1000) / 1000;
  const lineHt = lines.map((l) =>
    round(Math.max(0, l.quantity ?? 1) * Math.max(0, l.unitPrice ?? 0)),
  );
  const grossHt = round(lineHt.reduce((a, b) => a + b, 0));
  const capped = Math.min(Math.max(0, discount), grossHt);
  const subTotalHt = round(grossHt - capped);
  const ratio = grossHt > 0 ? subTotalHt / grossHt : 0;
  let tva = 0;
  lines.forEach((line, i) => {
    const rate = Math.max(0, Math.min(100, line.tvaRate ?? tvaRate));
    tva += (lineHt[i] * ratio * rate) / 100;
  });
  tva = round(tva);
  const stampDuty = round(Math.max(0, stamp));
  return { lineHt, subTotalHt, tvaAmount: tva, totalTtc: round(subTotalHt + tva + stampDuty) };
}

export function InvoiceEditorDialog({
  open,
  invoice,
  onOpenChange,
}: {
  open: boolean;
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT();
  const isEdit = Boolean(invoice);

  // The row in the list has no audit log; refetch the full record when
  // the editor opens on an existing invoice.
  const detail = useInvoice(invoice?.id);
  const full = detail.data ?? invoice;

  const create = useCreateInvoice();
  const update = useUpdateInvoice();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [lines, setLines] = React.useState<InvoiceLineInput[]>([blankLine()]);
  const [clientQuery, setClientQuery] = React.useState('');
  const [debouncedQuery] = useDebounce(clientQuery, 300);
  const [picked, setPicked] = React.useState<InvoiceClientMatch | null>(null);

  const matches = useInvoiceClientSearch(debouncedQuery);

  // Reload the form whenever the dialog opens (or the target changes).
  React.useEffect(() => {
    if (!open) return;
    setClientQuery('');
    setPicked(null);
    if (full) {
      setForm({
        clientName: full.clientName,
        clientEmail: full.clientEmail ?? '',
        clientPhone: full.clientPhone ?? '',
        clientAddress: full.clientAddress ?? '',
        clientCity: full.clientCity ?? '',
        clientCountry: full.clientCountry ?? '',
        clientTaxId: full.clientTaxId ?? '',
        issueDate: isoDay(full.issueDate),
        dueDate: isoDay(full.dueDate),
        invoiceNumber: full.invoiceNumber,
        status: full.status,
        language: full.language,
        tvaRate: n(full.tvaRate),
        discountAmount: n(full.discountAmount),
        stampDuty: n(full.stampDuty),
        notes: full.notes ?? '',
        patientId: full.patientId ?? undefined,
        doctorId: full.doctorId ?? undefined,
        orderId: full.orderId ?? undefined,
      });
      setLines(
        full.lines.length > 0
          ? full.lines.map((l) => ({
              description: l.description,
              quantity: n(l.quantity),
              unitPrice: n(l.unitPrice),
              tvaRate: l.tvaRate ?? undefined,
            }))
          : [blankLine()],
      );
    } else {
      setForm(emptyForm());
      setLines([blankLine()]);
    }
  }, [open, full]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setLine = <K extends keyof InvoiceLineInput>(
    index: number,
    key: K,
    value: InvoiceLineInput[K],
  ) =>
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, [key]: value } : line)),
    );

  /** Prefill the client block from an existing patient. */
  const pickClient = (match: InvoiceClientMatch) => {
    setPicked(match);
    const clinic = match.doctor?.dentistProfile;
    setForm((prev) => ({
      ...prev,
      clientName: match.fullName,
      clientEmail: match.email ?? '',
      clientPhone: match.phone ?? '',
      clientAddress: match.address ?? clinic?.clinicAddress ?? '',
      clientCity: clinic?.city ?? '',
      clientCountry: clinic?.country ?? '',
      clientTaxId: clinic?.taxId ?? '',
      patientId: match.id,
      doctorId: match.doctor?.id,
    }));
    setClientQuery('');
  };

  /** Prefill a line from one of the patient's orders. */
  const prefillFromOrder = (order: InvoiceClientMatch['orders'][number]) => {
    const amount = n(order.quotation?.totalTtc ?? order.treatmentFeeAmount);
    setForm((prev) => ({ ...prev, orderId: order.id }));
    setLines((prev) => {
      const next = prev.filter((l) => l.description.trim() !== '');
      next.push({
        description: order.quotation?.packName
          ? `${order.quotation.packName} — ${order.orderCode}`
          : order.orderCode,
        quantity: 1,
        unitPrice: amount,
      });
      return next.length > 0 ? next : [blankLine()];
    });
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

  const totals = previewTotals(lines, form.tvaRate, form.discountAmount, form.stampDuty);
  const validLines = lines.filter((l) => l.description.trim() !== '');
  const canSave = form.clientName.trim() !== '' && validLines.length > 0 && !pending;

  const submit = () => {
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
      discountAmount: form.discountAmount,
      stampDuty: form.stampDuty,
      notes: form.notes.trim() || undefined,
      patientId: form.patientId,
      doctorId: form.doctorId,
      orderId: form.orderId,
      lines: validLines.map((l) => ({
        description: l.description.trim(),
        quantity: l.quantity ?? 1,
        unitPrice: l.unitPrice ?? 0,
        tvaRate: l.tvaRate,
      })),
    };

    if (isEdit && full) {
      // The number is only sent when the admin actually changed it —
      // resending the same value would trip the uniqueness check.
      const patch = { ...payload } as CreateInvoiceInput & { invoiceNumber?: string };
      if (form.invoiceNumber.trim() && form.invoiceNumber.trim() !== full.invoiceNumber) {
        patch.invoiceNumber = form.invoiceNumber.trim();
      }
      update.mutate(
        { id: full.id, input: patch },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }

    if (form.invoiceNumber.trim()) payload.invoiceNumber = form.invoiceNumber.trim();
    create.mutate(payload, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      {/* DialogContent caps at sm:max-w-sm — widen it explicitly. */}
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('invoicesAdmin.editorEditTitle', { number: full?.invoiceNumber ?? '' })
              : t('invoicesAdmin.editorCreateTitle')}
          </DialogTitle>
          <DialogDescription>{t('invoicesAdmin.editorIntro')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* ── Client ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t('invoicesAdmin.clientSection')}</h3>

            {!isEdit ? (
              <div className="space-y-2">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    placeholder={t('invoicesAdmin.clientSearch')}
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('invoicesAdmin.clientSearchHint')}
                </p>

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
                              className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/50"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {match.fullName}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {[match.email, match.phone].filter(Boolean).join(' · ') || '—'}
                                </span>
                              </span>
                              <Badge variant="secondary">
                                {match.orders.length}
                              </Badge>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Orders of the picked patient — the prefill source. */}
            {picked ? (
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {t('invoicesAdmin.ordersOf', { name: picked.fullName })}
                  </p>
                  <Button variant="ghost" size="sm" onClick={detachClient}>
                    <XIcon className="mr-1 size-3.5" />
                    {t('invoicesAdmin.clientClear')}
                  </Button>
                </div>
                {picked.orders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t('invoicesAdmin.noOrders')}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {picked.orders.map((order) => (
                      <li
                        key={order.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background px-2.5 py-2 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{order.orderCode}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {order.quotation?.packName ?? order.status}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {n(order.quotation?.totalTtc ?? order.treatmentFeeAmount).toFixed(3)}
                          </span>
                          <Button
                            variant={form.orderId === order.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => prefillFromOrder(order)}
                          >
                            {t('invoicesAdmin.prefillFromOrder')}
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t('invoicesAdmin.fieldClientName')}>
                <Input
                  value={form.clientName}
                  onChange={(e) => set('clientName', e.target.value)}
                />
              </Field>
              <Field label={t('invoicesAdmin.fieldEmail')}>
                <Input
                  value={form.clientEmail}
                  onChange={(e) => set('clientEmail', e.target.value)}
                />
              </Field>
              <Field label={t('invoicesAdmin.fieldPhone')}>
                <Input
                  value={form.clientPhone}
                  onChange={(e) => set('clientPhone', e.target.value)}
                />
              </Field>
              <Field label={t('invoicesAdmin.fieldAddress')} className="lg:col-span-2">
                <Input
                  value={form.clientAddress}
                  onChange={(e) => set('clientAddress', e.target.value)}
                />
              </Field>
              <Field label={t('invoicesAdmin.fieldCity')}>
                <Input value={form.clientCity} onChange={(e) => set('clientCity', e.target.value)} />
              </Field>
              <Field label={t('invoicesAdmin.fieldCountry')}>
                <Input
                  value={form.clientCountry}
                  onChange={(e) => set('clientCountry', e.target.value)}
                />
              </Field>
              <Field label={t('invoicesAdmin.fieldTaxId')}>
                <Input
                  value={form.clientTaxId}
                  onChange={(e) => set('clientTaxId', e.target.value)}
                />
              </Field>
            </div>
          </section>

          {/* ── En-tête ── */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t('invoicesAdmin.fieldIssueDate')}>
              <Input
                type="date"
                value={form.issueDate}
                onChange={(e) => set('issueDate', e.target.value)}
              />
            </Field>
            <Field label={t('invoicesAdmin.fieldDueDate')}>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
              />
            </Field>
            <Field label={t('invoicesAdmin.fieldStatus')}>
              <Select
                value={form.status}
                onValueChange={(v) => set('status', v as InvoiceStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={InvoiceStatus.DRAFT}>{t('invoicesAdmin.statusDraft')}</SelectItem>
                  <SelectItem value={InvoiceStatus.ISSUED}>{t('invoicesAdmin.statusIssued')}</SelectItem>
                  <SelectItem value={InvoiceStatus.PAID}>{t('invoicesAdmin.statusPaid')}</SelectItem>
                  <SelectItem value={InvoiceStatus.CANCELLED}>
                    {t('invoicesAdmin.statusCancelled')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('invoicesAdmin.fieldNumber')} hint={t('invoicesAdmin.fieldNumberHint')}>
              <Input
                value={form.invoiceNumber}
                onChange={(e) => set('invoiceNumber', e.target.value)}
                placeholder="FAC-000123"
              />
            </Field>
            <Field label={t('invoicesAdmin.fieldLanguage')}>
              <Select
                value={form.language}
                onValueChange={(v) => set('language', v as 'fr' | 'en')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </section>

          {/* ── Lignes ── */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t('invoicesAdmin.linesSection')}</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLines((prev) => [...prev, blankLine()])}
              >
                <PlusIcon className="mr-2 size-4" />
                {t('invoicesAdmin.addLine')}
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="grid items-end gap-2 rounded-lg border p-2 sm:grid-cols-[minmax(0,1fr)_80px_110px_80px_100px_40px]"
                >
                  <Field label={index === 0 ? t('invoicesAdmin.lineDescription') : undefined}>
                    <Input
                      value={line.description}
                      onChange={(e) => setLine(index, 'description', e.target.value)}
                    />
                  </Field>
                  <Field label={index === 0 ? t('invoicesAdmin.lineQuantity') : undefined}>
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      value={line.quantity ?? 1}
                      onChange={(e) => setLine(index, 'quantity', Number(e.target.value))}
                    />
                  </Field>
                  <Field label={index === 0 ? t('invoicesAdmin.lineUnitPrice') : undefined}>
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      value={line.unitPrice ?? 0}
                      onChange={(e) => setLine(index, 'unitPrice', Number(e.target.value))}
                    />
                  </Field>
                  <Field label={index === 0 ? t('invoicesAdmin.lineTva') : undefined}>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={line.tvaRate ?? ''}
                      placeholder={String(form.tvaRate)}
                      onChange={(e) =>
                        setLine(
                          index,
                          'tvaRate',
                          e.target.value === '' ? undefined : Number(e.target.value),
                        )
                      }
                    />
                  </Field>
                  <Field label={index === 0 ? t('invoicesAdmin.lineTotal') : undefined}>
                    <div className="flex h-9 items-center justify-end rounded-md border bg-muted/40 px-2 text-sm tabular-nums">
                      {totals.lineHt[index]?.toFixed(3) ?? '0.000'}
                    </div>
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('invoicesAdmin.removeLine')}
                    onClick={() =>
                      setLines((prev) =>
                        prev.length === 1 ? [blankLine()] : prev.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2Icon className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            {validLines.length === 0 ? (
              <p className="text-xs text-destructive">{t('invoicesAdmin.noLines')}</p>
            ) : null}
          </section>

          {/* ── Totaux ── */}
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('invoicesAdmin.fieldTvaRate')}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={form.tvaRate}
                  onChange={(e) => set('tvaRate', Number(e.target.value))}
                />
              </Field>
              <Field label={t('invoicesAdmin.fieldDiscount')}>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={form.discountAmount}
                  onChange={(e) => set('discountAmount', Number(e.target.value))}
                />
              </Field>
              <Field label={t('invoicesAdmin.fieldStampDuty')}>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={form.stampDuty}
                  onChange={(e) => set('stampDuty', Number(e.target.value))}
                />
              </Field>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <Row label={t('invoicesAdmin.previewHt')} value={totals.subTotalHt} />
              <Row label={t('invoicesAdmin.previewTva')} value={totals.tvaAmount} />
              <Row label={t('invoicesAdmin.previewTtc')} value={totals.totalTtc} strong />
              <p className="mt-2 text-xs text-muted-foreground">
                {t('invoicesAdmin.previewHint')}
              </p>
            </div>
          </section>

          <Field label={t('invoicesAdmin.fieldNotes')}>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              maxLength={2000}
            />
          </Field>

          {/* ── Journal d'audit (édition seulement) ── */}
          {isEdit ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{t('invoicesAdmin.auditSection')}</h3>
              {(full?.auditLogs?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">{t('invoicesAdmin.auditEmpty')}</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {full?.auditLogs?.map((entry) => (
                    <li key={entry.id} className="rounded-md border bg-muted/20 px-2.5 py-2">
                      <span className="font-medium">{entry.action}</span>{' '}
                      <span className="text-muted-foreground">
                        {t('invoicesAdmin.auditBy', { actor: entry.actorName ?? '—' })} ·{' '}
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                      {entry.changes ? (
                        <span className="mt-1 block truncate text-muted-foreground">
                          {Object.keys(entry.changes).join(', ')}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('invoicesAdmin.cancel')}
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            {pending ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                {t('invoicesAdmin.saving')}
              </>
            ) : (
              t('invoicesAdmin.save')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      {label ? <Label className="text-xs">{label}</Label> : null}
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between py-1 text-sm ${
        strong ? 'border-t pt-2 font-semibold' : ''
      }`}
    >
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value.toFixed(3)}</span>
    </div>
  );
}
