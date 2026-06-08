'use client';

/**
 * Pack + payment-plan panel — mounted under the existing quote
 * admin/doctor surface to handle:
 *   • Admin: attach pack, build the installment plan (2/3/N tranches
 *     with explicit step ranges), record cash, deliver unlocked batches.
 *   • Doctor: pay by card (mock), declare a bank transfer with proof
 *     upload, view installments + batch progress.
 *
 * The component is intentionally self-contained — it reads the quote
 * via the props passed from `QuoteReview` and refetches its own
 * installments/batches via React-Query. State on the existing quote
 * surface is left untouched.
 */

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ArchType,
  BatchStatus,
  InstallmentStatus,
  PaymentMethod,
  PaymentMode,
  QuotationStatus,
  UserRole,
  type Quotation,
  type QuoteInstallment,
  type QuoteStepBatch,
} from '@/lib/types';
import {
  usePacks,
  useAttachPackToQuotation,
  useConfigurePaymentPlan,
  useInstallments,
  useStepBatches,
  useDeliverBatch,
  usePayByCard,
  useDeclareBankTransfer,
  useRecordCash,
} from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Hash,
  Landmark,
  Loader2,
  Lock,
  Package,
  Plus,
  Send,
  Stethoscope,
  Trash2,
  Truck,
  Unlock,
  Upload,
  User as UserIcon,
  Wallet,
  X,
} from 'lucide-react';

interface Props {
  quote: Quotation;
  role: UserRole;
  /**
   * Optional context surfaced inside the doctor's installment-pay
   * dialog. The component still works without these — the right-hand
   * summary just degrades to the data carried on the quote itself.
   */
  patientName?: string | null;
  doctorName?: string | null;
  orderCode?: string | null;
}

// ─── Money helpers ────────────────────────────────────────────────────
// Decimal money lives as strings on the wire so the 3rd-decimal-place
// precision of TND doesn't get clobbered by Number conversion. The
// `toDec` helper still returns Number — but we only use it for display
// + the sum-equality check, which uses a 0.001 tolerance the backend
// also honors.

const toDec = (s: string | number | null | undefined): number =>
  typeof s === 'number' ? s : s ? Number(s) : 0;

const money = (s: string | number | null | undefined, ccy = 'TND'): string =>
  `${toDec(s).toFixed(3)} ${ccy}`;

// ─────────────────────────────────────────────────────────────────────

export function QuotePackPanel({
  quote,
  role,
  patientName,
  doctorName,
  orderCode,
}: Props) {
  const isAdmin = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  const isDoctor = role === UserRole.DENTIST;

  const hasPack = !!quote.packId;
  // Fetch installments + batches in parallel; both queries are
  // cheap and the admin/doctor views read the same data.
  const installmentsQ = useInstallments(quote.id, hasPack);
  const batchesQ = useStepBatches(quote.id, hasPack);

  if (!isAdmin && !isDoctor) return null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {isAdmin ? (
        <>
          {!hasPack ? (
            <AttachPackCard quote={quote} />
          ) : (
            <PackSnapshotCard quote={quote} />
          )}
          {hasPack ? (
            (installmentsQ.data?.length ?? 0) === 0 ? (
              <PlanBuilderCard quote={quote} />
            ) : (
              <AdminPlanView
                quote={quote}
                installments={installmentsQ.data ?? []}
                batches={batchesQ.data ?? []}
              />
            )
          ) : null}
        </>
      ) : (
        hasPack && (
          <DoctorPlanView
            quote={quote}
            installments={installmentsQ.data ?? []}
            batches={batchesQ.data ?? []}
            patientName={patientName}
            doctorName={doctorName}
            orderCode={orderCode}
          />
        )
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Admin — Attach pack
// ═══════════════════════════════════════════════════════════════════════

function AttachPackCard({ quote }: { quote: Quotation }) {
  const packsQ = usePacks({ limit: 100 });
  const attach = useAttachPackToQuotation();
  const [packId, setPackId] = useState<string>('');

  const activePacks = (packsQ.data?.data ?? []).filter((p) => p.isActive);
  const selectedPack = activePacks.find((p) => p.id === packId);

  // Single-price-per-pack model — every pack has ONE active price
  // (archType=two_arches as the canonical pricing unit on the
  // backend). The admin doesn't pick arch here anymore; the
  // catalogue exposes one price per pack and that's what we
  // snapshot.
  const activePrices = (selectedPack?.prices ?? []).filter((p) => p.isActive);
  const activePrice =
    activePrices.find((p) => p.archType === ArchType.TWO_ARCHES) ??
    activePrices[0] ??
    null;

  const submit = () => {
    if (!packId) return;
    // Always send `archType: TWO_ARCHES` explicitly — even though the
    // refactored backend defaults to two_arches when omitted, the
    // running container may still be the older build that REQUIRES
    // a value. Passing the canonical pricing unit keeps the call
    // working in both versions without a forced redeploy. The
    // catalogue is single-price-per-pack now, so two_arches is the
    // only valid value the admin would pick anyway.
    attach.mutate({
      quotationId: quote.id,
      dto: { packId, archType: ArchType.TWO_ARCHES },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-primary" />
          Attach a pack to this quotation
        </CardTitle>
        <CardDescription>
          Pick the commercial pack — the total price is snapshotted
          onto the quote so later catalogue edits don&apos;t affect this
          quotation.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-2 md:col-span-2">
          <Label>Pack</Label>
          <Select value={packId} onValueChange={setPackId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a pack…" />
            </SelectTrigger>
            <SelectContent>
              {activePacks.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No active pack — create one in /dashboard/packs first.
                </div>
              ) : (
                activePacks.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Active price</Label>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {selectedPack ? (
              activePrice ? (
                <strong>{money(activePrice.price, activePrice.currency)}</strong>
              ) : (
                <span className="text-destructive">
                  No active price configured
                </span>
              )
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </div>
        <div className="md:col-span-3 flex justify-end">
          <Button
            onClick={submit}
            disabled={!packId || !activePrice || attach.isPending}
          >
            Attach pack
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Admin — Pack snapshot summary (read-only header above the plan)
// ═══════════════════════════════════════════════════════════════════════

function PackSnapshotCard({ quote }: { quote: Quotation }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-primary" />
            {quote.packName ?? 'Pack'}
            {/* Arch badge only surfaces on legacy single-arch quotes
                — the consolidated model only uses two_arches and the
                badge is redundant there. Kept for historical
                quotations that were attached when the picker still
                existed. */}
            {quote.archType && quote.archType !== ArchType.TWO_ARCHES ? (
              <Badge variant="secondary" className="font-normal">
                Single arch
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            {quote.isUnlimitedSteps
              ? 'Unlimited steps'
              : `Max ${quote.maxStepsPerArch ?? 0} steps`}
            {' · '}
            {quote.isUnlimitedCorrections
              ? 'unlimited corrections'
              : `${quote.includedCorrections ?? 0} corrections`}
          </CardDescription>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Total price</div>
          <div className="text-lg font-semibold">
            {money(quote.totalPrice, quote.currency)}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Admin — Plan builder (full_payment OR installments with N tranches)
// ═══════════════════════════════════════════════════════════════════════

interface DraftRow {
  amount: string;        // string while editing — parsed at submit
  fromStep: string;
  toStep: string;
  availableFrom: string; // YYYY-MM-DD
  dueDate: string;       // YYYY-MM-DD or ''
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function emptyRow(fromStep = 1, toStep = 1, amount = '0'): DraftRow {
  return {
    amount,
    fromStep: String(fromStep),
    toStep: String(toStep),
    availableFrom: todayISO(),
    dueDate: '',
  };
}

function PlanBuilderCard({ quote }: { quote: Quotation }) {
  const total = toDec(quote.totalPrice);
  const maxSteps = quote.maxStepsPerArch ?? 0;
  const isUnlimited = !!quote.isUnlimitedSteps;
  const configure = useConfigurePaymentPlan();

  const [mode, setMode] = useState<PaymentMode>(PaymentMode.INSTALLMENTS);
  const [rows, setRows] = useState<DraftRow[]>(() => [
    emptyRow(1, isUnlimited ? 1 : Math.max(1, maxSteps), total.toFixed(3)),
  ]);

  // Switching modes resets the draft so the admin never accidentally
  // submits a 3-tranche plan still labelled "full_payment".
  const setModeWithReset = (next: PaymentMode) => {
    setMode(next);
    if (next === PaymentMode.FULL_PAYMENT) {
      setRows([
        emptyRow(
          1,
          isUnlimited ? 1 : Math.max(1, maxSteps),
          total.toFixed(3),
        ),
      ]);
    } else {
      // Default to two tranches halving the total + step range.
      const half = (total / 2).toFixed(3);
      const mid = isUnlimited ? 1 : Math.max(1, Math.floor(maxSteps / 2));
      setRows([
        emptyRow(1, mid, half),
        emptyRow(mid + 1, isUnlimited ? mid + 1 : maxSteps, half),
      ]);
    }
  };

  const updateRow = (i: number, patch: Partial<DraftRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((rs) => {
      const last = rs[rs.length - 1];
      const nextFrom = last ? Number(last.toStep) + 1 : 1;
      return [
        ...rs,
        emptyRow(nextFrom, isUnlimited ? nextFrom : maxSteps, '0'),
      ];
    });

  const removeRow = (i: number) =>
    setRows((rs) => rs.filter((_, idx) => idx !== i));

  // Live validation — sum vs total, overlap, range bounds. Errors are
  // printed inline so the admin can fix them before submitting.
  const validation = useMemo(() => {
    const errors: string[] = [];
    const numeric = rows.map((r) => ({
      amount: Number(r.amount),
      from: Number(r.fromStep),
      to: Number(r.toStep),
    }));
    const sum = numeric.reduce((acc, r) => acc + (isFinite(r.amount) ? r.amount : 0), 0);
    if (Math.abs(sum - total) > 0.001) {
      errors.push(
        `Σ amounts (${sum.toFixed(3)}) must equal total (${total.toFixed(3)}).`,
      );
    }
    for (let i = 0; i < numeric.length; i++) {
      const r = numeric[i]!;
      if (!isFinite(r.amount) || r.amount <= 0) {
        errors.push(`Tranche ${i + 1}: amount must be positive.`);
      }
      if (!isFinite(r.from) || !isFinite(r.to) || r.from > r.to) {
        errors.push(`Tranche ${i + 1}: from-step must be ≤ to-step.`);
      }
      if (!isUnlimited && r.to > maxSteps) {
        errors.push(
          `Tranche ${i + 1}: to-step exceeds pack max (${maxSteps}).`,
        );
      }
    }
    const sorted = [...numeric].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.from <= sorted[i - 1]!.to) {
        errors.push(`Step ranges overlap.`);
        break;
      }
    }
    if (mode === PaymentMode.FULL_PAYMENT && rows.length !== 1) {
      errors.push('Full payment requires exactly one tranche.');
    }
    if (mode === PaymentMode.INSTALLMENTS && rows.length < 2) {
      errors.push('Installments mode requires at least two tranches.');
    }
    return { errors, sum };
  }, [rows, total, mode, maxSteps, isUnlimited]);

  const submit = () => {
    if (validation.errors.length > 0) {
      toast.error(validation.errors[0]);
      return;
    }
    configure.mutate({
      quotationId: quote.id,
      dto: {
        paymentMode: mode,
        installments: rows.map((r) => ({
          amount: Number(r.amount),
          availableFrom: r.availableFrom
            ? new Date(r.availableFrom).toISOString()
            : undefined,
          dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : undefined,
          batch: {
            fromStep: Number(r.fromStep),
            toStep: Number(r.toStep),
          },
        })),
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment & delivery plan</CardTitle>
        <CardDescription>
          Split the {money(quote.totalPrice, quote.currency)} total into as
          many tranches as you need. Each tranche unlocks a step range
          when paid (or admin-confirmed for cash/transfer). Locked steps
          can never be delivered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label>Mode:</Label>
          <Button
            size="sm"
            variant={mode === PaymentMode.FULL_PAYMENT ? 'default' : 'outline'}
            onClick={() => setModeWithReset(PaymentMode.FULL_PAYMENT)}
          >
            Full payment
          </Button>
          <Button
            size="sm"
            variant={mode === PaymentMode.INSTALLMENTS ? 'default' : 'outline'}
            onClick={() => setModeWithReset(PaymentMode.INSTALLMENTS)}
          >
            Installments
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>From step</TableHead>
                <TableHead>To step</TableHead>
                <TableHead>Available from</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{i + 1}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.001"
                      min={0.001}
                      value={row.amount}
                      onChange={(e) =>
                        updateRow(i, { amount: e.target.value })
                      }
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={row.fromStep}
                      onChange={(e) =>
                        updateRow(i, { fromStep: e.target.value })
                      }
                      className="w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={row.toStep}
                      onChange={(e) =>
                        updateRow(i, { toStep: e.target.value })
                      }
                      className="w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      value={row.availableFrom}
                      onChange={(e) =>
                        updateRow(i, { availableFrom: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      value={row.dueDate}
                      onChange={(e) =>
                        updateRow(i, { dueDate: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {mode === PaymentMode.INSTALLMENTS && rows.length > 1 ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeRow(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="text-muted-foreground">
            Σ tranches: <strong>{validation.sum.toFixed(3)}</strong> ·
            target: <strong>{total.toFixed(3)}</strong>{' '}
            {Math.abs(validation.sum - total) <= 0.001 ? (
              <CheckCircle2 className="ml-1 inline h-3 w-3 text-emerald-600" />
            ) : null}
          </div>
          {mode === PaymentMode.INSTALLMENTS ? (
            <Button size="sm" variant="outline" onClick={addRow}>
              <Plus className="mr-1 h-4 w-4" />
              Add tranche
            </Button>
          ) : null}
        </div>

        {validation.errors.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {validation.errors.map((err, i) => (
              <li key={i}>• {err}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex justify-end">
          <Button
            onClick={submit}
            disabled={configure.isPending || validation.errors.length > 0}
          >
            Save plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Admin — Plan view (installments, batches, record-cash, deliver)
// ═══════════════════════════════════════════════════════════════════════

function statusBadge(status: InstallmentStatus): React.ReactNode {
  switch (status) {
    case InstallmentStatus.PAID:
      return <Badge className="bg-emerald-600">Paid</Badge>;
    case InstallmentStatus.OVERDUE:
      return <Badge variant="destructive">Overdue</Badge>;
    case InstallmentStatus.CANCELLED:
      return <Badge variant="outline">Cancelled</Badge>;
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}

function batchBadge(status: BatchStatus): React.ReactNode {
  switch (status) {
    case BatchStatus.DELIVERED:
      return (
        <Badge className="bg-emerald-600">
          <Truck className="mr-1 h-3 w-3" />
          Delivered
        </Badge>
      );
    case BatchStatus.UNLOCKED:
      return (
        <Badge className="bg-amber-500">
          <Unlock className="mr-1 h-3 w-3" />
          Unlocked
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <Lock className="mr-1 h-3 w-3" />
          Locked
        </Badge>
      );
  }
}

function AdminPlanView({
  quote,
  installments,
  batches,
}: {
  quote: Quotation;
  installments: QuoteInstallment[];
  batches: QuoteStepBatch[];
}) {
  const deliver = useDeliverBatch();
  const [cashTarget, setCashTarget] = useState<QuoteInstallment | null>(null);

  // Index batches by installment id so each row can show its linked
  // delivery range without an O(n²) lookup.
  const batchByInstallment = useMemo(() => {
    const m = new Map<string, QuoteStepBatch>();
    batches.forEach((b) => m.set(b.installmentId, b));
    return m;
  }, [batches]);

  return (
    <>
      <PackSnapshotCard quote={quote} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tranches & deliveries</CardTitle>
          <CardDescription>
            Confirm cash payments inline; unlocked batches get a
            &quot;Mark delivered&quot; button. Bank transfers come in
            through the <strong>/dashboard/payments/pending</strong>{' '}
            queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {installments.map((inst) => {
                const batch = batchByInstallment.get(inst.id);
                const isPayable =
                  inst.status === InstallmentStatus.PENDING ||
                  inst.status === InstallmentStatus.OVERDUE;
                return (
                  <TableRow key={inst.id}>
                    <TableCell>{inst.installmentNumber}</TableCell>
                    <TableCell className="font-mono">
                      {money(inst.amount, quote.currency)}
                    </TableCell>
                    <TableCell>{statusBadge(inst.status)}</TableCell>
                    <TableCell className="text-xs">
                      {batch
                        ? `${batch.fromStep} → ${batch.toStep}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {batch ? batchBadge(batch.status) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(inst.availableFrom).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {inst.dueDate
                        ? new Date(inst.dueDate).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {isPayable ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCashTarget(inst)}
                          >
                            <Wallet className="mr-1 h-3 w-3" />
                            Record cash
                          </Button>
                        ) : null}
                        {batch?.status === BatchStatus.UNLOCKED ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              deliver.mutate({
                                quotationId: quote.id,
                                orderId: quote.orderId,
                                batchId: batch.id,
                              })
                            }
                            disabled={deliver.isPending}
                          >
                            <Truck className="mr-1 h-3 w-3" />
                            Mark delivered
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RecordCashDialog
        key={cashTarget?.id ?? 'closed'}
        target={cashTarget}
        quote={quote}
        onClose={() => setCashTarget(null)}
      />
    </>
  );
}

function RecordCashDialog({
  target,
  quote,
  onClose,
}: {
  target: QuoteInstallment | null;
  quote: Quotation;
  onClose: () => void;
}) {
  const record = useRecordCash();
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record cash payment</DialogTitle>
          <DialogDescription>
            Mark installment #{target?.installmentNumber} (
            {money(target?.amount, quote.currency)}) as paid in cash.
            The linked step batch will unlock immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="receipt">Receipt number</Label>
            <Input
              id="receipt"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={record.isPending}
            onClick={() => {
              if (!target) return;
              record.mutate(
                {
                  quotationId: quote.id,
                  installmentId: target.id,
                  orderId: quote.orderId,
                  dto: {
                    receiptNumber: receiptNumber.trim() || undefined,
                    notes: notes.trim() || undefined,
                  },
                },
                { onSuccess: onClose },
              );
            }}
          >
            Record cash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Doctor — timeline + pay-by-card + declare-bank-transfer
// ═══════════════════════════════════════════════════════════════════════

function DoctorPlanView({
  quote,
  installments,
  batches,
  patientName,
  doctorName,
  orderCode,
}: {
  quote: Quotation;
  installments: QuoteInstallment[];
  batches: QuoteStepBatch[];
  /** Optional context forwarded to the inner pay dialog summary. */
  patientName?: string | null;
  doctorName?: string | null;
  orderCode?: string | null;
}) {
  // Pay buttons used to be gated on `quote.status === APPROVED`, but
  // the doctor's review now skips an explicit Approve step — paying
  // the first installment IS the approval (backend auto-transitions
  // sent → approved on first payment). So treat SENT quotes the same
  // as APPROVED for Pay-button visibility on the doctor's side.
  const isApproved =
    quote.status === QuotationStatus.APPROVED ||
    quote.status === QuotationStatus.SENT;
  const batchByInstallment = useMemo(() => {
    const m = new Map<string, QuoteStepBatch>();
    batches.forEach((b) => m.set(b.installmentId, b));
    return m;
  }, [batches]);

  // All currently-payable rows (pending/overdue and the available-from
  // date has arrived). The first one drives the per-row "Pay now"
  // button; the full list drives the "Pay all" affordance + the
  // dialog's scope toggle. The backend still enforces availableFrom
  // and the sequential-pay rule, so the UI just filters proactively.
  const [now] = useState(() => Date.now());
  const payable = useMemo(
    () =>
      installments.filter(
        (i) =>
          (i.status === InstallmentStatus.PENDING ||
            i.status === InstallmentStatus.OVERDUE) &&
          new Date(i.availableFrom).getTime() <= now,
      ),
    [installments, now],
  );
  const nextPayable = payable[0];

  // Sum of every payable row — shown both on the timeline header and
  // inside the dialog when the doctor toggles "all remaining".
  const payableSum = useMemo(
    () => payable.reduce((acc, r) => acc + toDec(r.amount), 0),
    [payable],
  );

  return (
    <>
      <PackSnapshotCard quote={quote} />

      {isApproved && payable.length > 1 ? (
        <Card className="border-emerald-200/60 bg-emerald-50/40">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900/70">
                Pay everything at once
              </div>
              <p className="mt-0.5 text-sm text-emerald-900">
                You have <strong>{payable.length}</strong> tranches available —{' '}
                <strong>{payableSum.toFixed(3)} {quote.currency}</strong> in
                total. Pay them tranche by tranche, or in one go.
              </p>
            </div>
            <DoctorPayActions
              quote={quote}
              installment={nextPayable!}
              payable={payable}
              defaultScope="all"
              label="Pay all now"
              patientName={patientName}
              doctorName={doctorName}
              orderCode={orderCode}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment timeline</CardTitle>
          <CardDescription>
            {isApproved
              ? 'Pay each tranche when it becomes available. Steps unlock automatically once the payment is confirmed.'
              : 'Approve the quotation first to start paying.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Available</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {installments.map((inst) => {
                const batch = batchByInstallment.get(inst.id);
                const available =
                  new Date(inst.availableFrom).getTime() <= now;
                const isNext = nextPayable?.id === inst.id;
                return (
                  <TableRow key={inst.id}>
                    <TableCell>{inst.installmentNumber}</TableCell>
                    <TableCell className="font-mono">
                      {money(inst.amount, quote.currency)}
                    </TableCell>
                    <TableCell className="space-y-1">
                      {statusBadge(inst.status)}
                      {batch ? (
                        <div className="text-xs">{batchBadge(batch.status)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {batch
                        ? `${batch.fromStep} → ${batch.toStep}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(inst.availableFrom).toLocaleDateString()}
                      {!available ? (
                        <div className="text-muted-foreground">
                          locked until then
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {isApproved && isNext && available ? (
                        <DoctorPayActions
                          quote={quote}
                          installment={inst}
                          payable={payable}
                          patientName={patientName}
                          doctorName={doctorName}
                          orderCode={orderCode}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function DoctorPayActions({
  quote,
  installment,
  payable,
  defaultScope = 'single',
  label = 'Pay now',
  patientName,
  doctorName,
  orderCode,
}: {
  quote: Quotation;
  installment: QuoteInstallment;
  /** Every currently-payable installment, including `installment`. */
  payable: QuoteInstallment[];
  /** Which mode the dialog opens in. */
  defaultScope?: 'single' | 'all';
  label?: string;
  /** Optional context surfaced in the dialog's right-hand summary. */
  patientName?: string | null;
  doctorName?: string | null;
  orderCode?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <CreditCard className="mr-1 h-3 w-3" />
        {label}
      </Button>
      <PaymentMethodDialog
        open={open}
        onClose={() => setOpen(false)}
        quote={quote}
        installment={installment}
        payable={payable}
        defaultScope={defaultScope}
        patientName={patientName}
        doctorName={doctorName}
        orderCode={orderCode}
      />
    </>
  );
}

type PayScope = 'single' | 'all';

function PaymentMethodDialog({
  open,
  onClose,
  quote,
  installment,
  payable,
  defaultScope,
  patientName,
  doctorName,
  orderCode,
}: {
  open: boolean;
  onClose: () => void;
  quote: Quotation;
  installment: QuoteInstallment;
  payable: QuoteInstallment[];
  defaultScope: PayScope;
  patientName?: string | null;
  doctorName?: string | null;
  orderCode?: string | null;
}) {
  // Backend currently allows all three methods. If the project later
  // adds `allowedPaymentMethods` on the quote, swap this constant for
  // `quote.allowedPaymentMethods ?? METHODS`.
  const METHODS: PaymentMethod[] = [
    PaymentMethod.CARD,
    PaymentMethod.BANK_TRANSFER,
    PaymentMethod.CASH,
  ];
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CARD);
  const [scope, setScope] = useState<PayScope>(defaultScope);

  const payCard = usePayByCard();
  const declareBT = useDeclareBankTransfer();
  const [bankReference, setBankReference] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const proofPreview = useMemo(
    () => (proofFile ? URL.createObjectURL(proofFile) : null),
    [proofFile],
  );
  useEffect(() => {
    if (!proofPreview) return;
    return () => URL.revokeObjectURL(proofPreview);
  }, [proofPreview]);

  // The "all" path fires one request per installment — we surface
  // progress to the doctor so it doesn't look frozen on the 2nd of N.
  const [progress, setProgress] = useState<
    { done: number; total: number } | null
  >(null);

  const canPickAll = payable.length > 1;
  const targets = scope === 'all' ? payable : [installment];
  const total = targets.reduce((acc, t) => acc + toDec(t.amount), 0);

  const close = () => {
    setProgress(null);
    setBankReference('');
    setProofFile(null);
    setMethod(PaymentMethod.CARD);
    setScope(defaultScope);
    onClose();
  };

  const submit = async () => {
    if (method === PaymentMethod.CASH) {
      // Cash is admin-recorded. No doctor endpoint either way.
      toast.info(
        'Cash payments are recorded by the clinic admin once they receive the funds.',
      );
      close();
      return;
    }

    // Sequential loop — per-installment idempotency keys so a retry on
    // the same row never double-charges, and we surface partial
    // progress to the doctor in case one tranche fails mid-way.
    setProgress({ done: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]!;
        if (method === PaymentMethod.CARD) {
          const idempotencyKey =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `${quote.id}-${t.id}-${i}`;
          await payCard.mutateAsync({
            quotationId: quote.id,
            installmentId: t.id,
            idempotencyKey,
            orderId: quote.orderId,
            mockOutcome: 'success',
          });
        } else {
          // BANK_TRANSFER — one declaration per installment, same
          // reference + proof so the admin can match them to the
          // doctor's single bank wire.
          await declareBT.mutateAsync({
            quotationId: quote.id,
            installmentId: t.id,
            orderId: quote.orderId,
            bankReference: bankReference.trim() || undefined,
            proofFile,
          });
        }
        setProgress({ done: i + 1, total: targets.length });
      }
      close();
    } catch {
      // Per-mutation hook has already raised a toast; surface progress
      // so the doctor sees what landed.
      setProgress((p) => (p ? { ...p } : null));
    }
  };

  const isPending = payCard.isPending || declareBT.isPending;

  // Right-column status pill: changes tone with the chosen scope —
  // single tranche reads as a focused action; "all remaining" reads as
  // a heavier multi-payment commitment. Both hint at the scope without
  // forcing the doctor to re-read the header.
  const scopeLabel =
    scope === 'all'
      ? `${payable.length} remaining tranches`
      : `Tranche #${installment.installmentNumber}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        if (!next) close();
      }}
    >
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[900px] w-full flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:h-[90dvh] sm:max-w-[600px] lg:h-[82dvh] lg:max-w-[920px]">
        {/* ─── Header ─────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 space-y-1 border-b bg-card py-4 pl-5 pr-14 text-left sm:py-5 sm:pl-8 sm:pr-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold sm:text-xl">
                Pay {total.toFixed(3)} {quote.currency}
              </DialogTitle>
              <DialogDescription>
                {scope === 'all'
                  ? `Settle all ${payable.length} remaining tranches in one flow.`
                  : `Settle installment #${installment.installmentNumber} of your treatment plan.`}
              </DialogDescription>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 gap-1.5 border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
            >
              <Clock className="h-3 w-3" />
              Payment due
            </Badge>
          </div>
        </DialogHeader>

        {/*
          One natural body scroller below lg prevents nested-scroll
          traps on phones. At desktop size the summary remains visible
          while only the payment workspace scrolls.
         */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] lg:grid lg:grid-cols-[38%_minmax(0,1fr)] lg:overflow-hidden">
          {/* Amount and order context */}
          <aside className="flex flex-col border-b bg-muted/30 p-5 sm:p-6 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount due
            </p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
              {total.toFixed(3)} {quote.currency}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {scope === 'all'
                ? `Complete all ${payable.length} remaining installments in this payment flow.`
                : `Settle installment #${installment.installmentNumber} to keep the treatment plan moving.`}
            </p>

            <h3 className="mb-4 mt-7 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Payment summary
            </h3>
            <dl className="space-y-4">
              <DetailRow
                icon={<Hash className="h-3.5 w-3.5" />}
                label="Scope"
                value={scopeLabel}
              />
              {scope === 'single' && installment.dueDate ? (
                <DetailRow
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label="Due date"
                  value={format(new Date(installment.dueDate), 'MMM d, yyyy')}
                />
              ) : null}
              {quote.packName ? (
                <DetailRow
                  icon={<Package className="h-3.5 w-3.5" />}
                  label="Pack"
                  value={quote.packName}
                />
              ) : null}
              {patientName ? (
                <DetailRow
                  icon={<UserIcon className="h-3.5 w-3.5" />}
                  label="Patient"
                  value={patientName}
                />
              ) : null}
              {doctorName ? (
                <DetailRow
                  icon={<Stethoscope className="h-3.5 w-3.5" />}
                  label="Doctor"
                  value={`Dr. ${doctorName}`}
                />
              ) : null}
              {orderCode ? (
                <DetailRow
                  icon={<FileText className="h-3.5 w-3.5" />}
                  label="Order"
                  value={
                    <span
                      className="block truncate font-mono text-[11px]"
                      title={orderCode}
                    >
                      {orderCode}
                    </span>
                  }
                />
              ) : null}
            </dl>

            <div className="mt-auto pt-6">
              <p className="rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
                {method === PaymentMethod.CARD
                  ? 'Card payments are processed immediately. The next batch of treatment steps unlocks once the payment is confirmed.'
                  : method === PaymentMethod.BANK_TRANSFER
                    ? 'After you submit, the clinic admin verifies the wire and confirms the payment. You will be notified once it lands.'
                  : 'Cash payments are recorded by the clinic admin when they physically receive the funds.'}
              </p>
            </div>
          </aside>

          {/* Payment workspace */}
          <section
            aria-label="Installment payment details"
            tabIndex={0}
            className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]"
          >
            <div className="space-y-5 p-5 sm:p-6 lg:p-7">
              {canPickAll ? (
                <div>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment scope
                  </h3>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-1">
                    <button
                      type="button"
                      aria-pressed={scope === 'single'}
                      onClick={() => setScope('single')}
                      disabled={isPending}
                      className={cn(
                        'min-w-0 rounded-md px-3 py-2.5 text-left text-xs transition',
                        scope === 'single'
                          ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                          : 'text-muted-foreground hover:bg-card/60',
                      )}
                    >
                      <span className="block font-semibold">This installment</span>
                      <span className="mt-0.5 block truncate text-[11px] opacity-80">
                        #{installment.installmentNumber} ·{' '}
                        {money(installment.amount, quote.currency)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={scope === 'all'}
                      onClick={() => setScope('all')}
                      disabled={isPending}
                      className={cn(
                        'min-w-0 rounded-md px-3 py-2.5 text-left text-xs transition',
                        scope === 'all'
                          ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                          : 'text-muted-foreground hover:bg-card/60',
                      )}
                    >
                      <span className="block font-semibold">All remaining</span>
                      <span className="mt-0.5 block truncate text-[11px] opacity-80">
                        {payable.length} installments ·{' '}
                        {payable
                          .reduce((acc, t) => acc + toDec(t.amount), 0)
                          .toFixed(3)}{' '}
                        {quote.currency}
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              <div>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment method
                </h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  {METHODS.map((m) => {
                    const isSelected = method === m;
                    const Icon =
                      m === PaymentMethod.CARD
                        ? CreditCard
                        : m === PaymentMethod.BANK_TRANSFER
                          ? Landmark
                          : Wallet;
                    const description =
                      m === PaymentMethod.CARD
                        ? 'Instant confirmation'
                        : m === PaymentMethod.BANK_TRANSFER
                          ? 'Upload your receipt'
                          : 'Recorded by the clinic';
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setMethod(m)}
                        disabled={isPending}
                        className={cn(
                          'flex min-h-16 items-center gap-3 rounded-lg border bg-card p-3 text-left transition',
                          isSelected
                            ? 'border-primary shadow-sm ring-2 ring-primary/10'
                            : 'hover:border-primary/40 hover:bg-muted/20',
                        )}
                      >
                        <span
                          className={cn(
                            'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground',
                            isSelected && 'bg-primary text-primary-foreground',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold capitalize">
                            {m.replace('_', ' ')}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                            {description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {method === PaymentMethod.CARD ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                    <div>
                      <p className="text-sm font-semibold text-blue-950">
                        Secure card payment
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-blue-900/80">
                        {scope === 'all'
                          ? 'The remaining installments are processed securely in sequence. If one fails, completed payments remain recorded.'
                          : 'This installment is confirmed immediately after the payment succeeds.'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : method === PaymentMethod.BANK_TRANSFER ? (
                <Card id="installment-bank-transfer" className="scroll-mt-4">
                  <CardContent className="space-y-4 pt-5">
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Landmark className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          Bank-transfer declaration
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          Add the bank reference and receipt so the clinic can
                          identify and confirm your transfer.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-1.5">
                      <Label
                        htmlFor="installment-bank-reference"
                        className="text-xs font-medium"
                      >
                        Bank reference{' '}
                        <span className="font-normal text-muted-foreground">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        id="installment-bank-reference"
                        value={bankReference}
                        onChange={(e) => setBankReference(e.target.value)}
                        placeholder="SWIFT, transfer reference, or memo"
                        disabled={isPending}
                      />
                    </div>

                    <div className="space-y-2">
                      <div>
                        <p className="text-xs font-medium">
                          Upload bank-transfer receipt
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          PDF, PNG, JPG, WEBP or HEIC · maximum 5 MB
                        </p>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-2">
                        <label
                          htmlFor="installment-proof"
                          className={cn(
                            'flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md p-1',
                            isPending && 'cursor-not-allowed opacity-60',
                          )}
                        >
                          <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm">
                            {proofFile
                              ? proofFile.name
                              : 'Click to choose a receipt'}
                          </span>
                        </label>
                        {proofFile ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove receipt"
                            disabled={isPending}
                            onClick={() => setProofFile(null)}
                            className="h-8 w-8 shrink-0"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        <input
                          id="installment-proof"
                          type="file"
                          className="sr-only"
                          accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
                          onChange={(e) =>
                            setProofFile(e.target.files?.[0] ?? null)
                          }
                          disabled={isPending}
                        />
                      </div>
                    </div>

                    {proofFile ? (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Receipt preview
                        </p>
                        {proofPreview &&
                        ['image/png', 'image/jpeg', 'image/webp'].includes(
                          proofFile.type,
                        ) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={proofPreview}
                            alt="Selected bank-transfer receipt"
                            className="max-h-[280px] w-full rounded-lg border bg-muted/30 object-contain"
                          />
                        ) : proofPreview &&
                          proofFile.type === 'application/pdf' ? (
                          <iframe
                            title="Selected bank-transfer receipt"
                            src={proofPreview}
                            className="h-[320px] w-full rounded-lg border bg-white"
                          />
                        ) : (
                          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="truncate">{proofFile.name}</span>
                          </div>
                        )}
                      </div>
                    ) : null}

                    <p className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs leading-relaxed text-blue-900/85">
                      {scope === 'all'
                        ? `The same reference and receipt will be attached to all ${payable.length} installment declarations.`
                        : 'The clinic admin will review the receipt before confirming this installment.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-sm font-semibold text-amber-950">
                        Pay at the clinic
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                        Give the payment directly to the clinic. An admin will
                        record it and unlock the related treatment steps.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {progress ? (
                <div
                  role="status"
                  className="flex items-center gap-2 rounded-lg border bg-card p-3 text-xs"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Processing installment {progress.done}/{progress.total}…
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {/* ─── Footer ─────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-card px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-8 sm:py-4">
          <Button
            variant="outline"
            onClick={close}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={isPending}
            className="w-full gap-1.5 font-medium shadow-sm sm:min-w-[180px] sm:w-auto"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : method === PaymentMethod.CARD ? (
              <CreditCard className="h-4 w-4" />
            ) : method === PaymentMethod.BANK_TRANSFER ? (
              <Send className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {method === PaymentMethod.CARD
              ? scope === 'all'
                ? `Pay ${payable.length} tranches`
                : 'Pay by card'
              : method === PaymentMethod.BANK_TRANSFER
                ? scope === 'all'
                  ? `Submit ${payable.length} declarations`
                  : 'Submit declaration'
                : 'Got it'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Compact label / value row used in the dialog's right-hand summary.
 * Mirrors the DetailRow in TreatmentFeeReceiptDialog so the two
 * dialogs feel visually identical.
 */
function DetailRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[16px_1fr] items-start gap-x-2.5 gap-y-0.5',
        highlight && '-mx-2 rounded-md bg-emerald-50/60 p-2',
      )}
    >
      <div
        className={cn(
          'mt-0.5 text-muted-foreground',
          highlight && 'text-emerald-700',
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            'text-[10px] font-semibold uppercase tracking-wide text-muted-foreground',
            highlight && 'text-emerald-700',
          )}
        >
          {label}
        </p>
        <div
          className={cn(
            'text-sm text-foreground',
            highlight && 'text-emerald-900',
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
