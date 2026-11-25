'use client';

/**
 * Pack + payment-plan panel — mounted under the existing quote
 * admin/doctor surface to handle:
 *   • Admin: attach pack, build the installment plan (2/3/N tranches
 *     with explicit step ranges), record cash, deliver unlocked batches.
 *   • Doctor: pay by card through ClicToPay, declare a bank transfer with proof
 *     upload, view installments + batch progress.
 *
 * The component is intentionally self-contained — it reads the quote
 * via the props passed from `QuoteReview` and refetches its own
 * installments/batches via React-Query. State on the existing quote
 * surface is left untouched.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { pickLocalized } from '@/lib/api/blog.service';
import { hasUsableBankTransferDetails } from '@/lib/payments/bank-transfer';
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
  useAttachPackToQuotation,
  useConfigurePaymentPlan,
  useInstallments,
  useStepBatches,
  usePayByCard,
  useDeclareBankTransfer,
  useRecordCash,
  useBillingPublicDefaults,
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
import Link from 'next/link';
import {
  PackChoiceFields,
  useResolvedPackChoice,
  type PackChoice,
} from '@/components/billing/pack-choice';
import { archLabel, packFacts, packName } from '@/components/billing/pack-picker';
import { QuoteStep } from '@/components/orders/quote-step';
// "Marquer livré" goes through the production delivery declaration (D2).
import { BatchDeliveryButton } from '@/components/production/batch-delivery-button';
import {
  isWithholdingChoiceConflict,
  PriceIncludesTaxNote,
  useQuoteTaxRates,
  WithholdingChoice,
  type QuoteTaxRates,
} from '@/components/payments/withholding';
import { previewInstallmentCharges, previewPlanStamps } from '@/lib/billing/tax-split';
import { formatTimestampDay } from '@/lib/utils/calendar-date';
import { formatAmount, formatPrice } from '@/lib/utils/currency';
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
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Hash,
  Landmark,
  Loader2,
  Lock,
  Minus,
  Package,
  Pencil,
  Plus,
  Scale,
  Send,
  ShieldCheck,
  Stethoscope,
  Truck,
  Unlock,
  Upload,
  User as UserIcon,
  Wallet,
  X,
} from 'lucide-react';

const QUOTE_PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.CARD,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CASH,
];

interface Props {
  quote: Quotation;
  role: UserRole;
  /**
   * Which admin slice to render. The admin surface composes the steps
   * in order — Pack → (pricing) → Plan — so it mounts the panel twice:
   * once as `"pack"` and once as `"plan"`, with the pricing controls
   * rendered between them by the parent. `"all"` (the default, used by
   * the doctor view) renders everything in one block.
   */
  section?: 'pack' | 'plan' | 'all';
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
  formatPrice(toDec(s), ccy);

/** Σ of decimal-string amounts, exact to the millime. */
const sumAmounts = (values: Array<string | number | null | undefined>): number =>
  values.reduce<number>((acc, v) => acc + Math.round(toDec(v) * 1000), 0) / 1000;

/** Statuses at which the admin may still edit the quote and its schedule. */
const OPEN_STATUSES: ReadonlySet<QuotationStatus> = new Set([
  QuotationStatus.DRAFT,
  QuotationStatus.SENT,
  QuotationStatus.APPROVED,
]);

/** What the practitioner already settled on this quote (cash + retenue). */
const receivedOf = (quote: Quotation): number =>
  toDec(quote.receivedAmount ?? quote.paidAmount);

/** YYYY-MM-DD of a stored timestamp, for a date input. */
const isoDay = (value: string | null | undefined): string =>
  value ? value.slice(0, 10) : '';

/** Phone-sized tap targets (44 px), the usual compact height from `sm` up. */
const TAP = 'h-11 sm:h-8';

// ─────────────────────────────────────────────────────────────────────

export function QuotePackPanel({
  quote,
  role,
  section = 'all',
  patientName,
  doctorName,
  orderCode,
}: Props) {
  const isAdmin = role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  const isDoctor = role === UserRole.DENTIST;

  const hasPack = !!quote.packId;
  const showPack = section === 'all' || section === 'pack';
  const showPlan = section === 'all' || section === 'plan';
  const needsPlanData = hasPack && (showPlan || isDoctor);
  // Fetch installments + batches in parallel; both queries are
  // cheap and the admin/doctor views read the same data. Sectioned admin
  // renders mount this panel twice; only the plan section needs the data.
  const installmentsQ = useInstallments(quote.id, needsPlanData);
  const batchesQ = useStepBatches(quote.id, needsPlanData);
  // Lets the admin re-open the pack picker on an already-attached quote to
  // swap the pack / arcade mode. Offered while nothing was received and no
  // payment is in progress (attaching replaces the payment plan).
  const [editingPack, setEditingPack] = useState(false);

  if (!isAdmin && !isDoctor) return null;


  return (
    <div className="flex flex-col gap-4">
      {isAdmin ? (
        <>
          {showPack ? (
            <PackStep
              quote={quote}
              editing={editingPack}
              onEdit={() => setEditingPack(true)}
              onClose={() => setEditingPack(false)}
            />
          ) : null}
          {showPlan && hasPack ? (
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
// Admin — Step 1: pack
// ═══════════════════════════════════════════════════════════════════════

function PackStep({
  quote,
  editing,
  onEdit,
  onClose,
}: {
  quote: Quotation;
  /** True while an attached pack is being swapped. */
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const hasPack = !!quote.packId;
  // A pack swap replaces the plan, so it is offered only while nothing was
  // received and no payment is in progress (the server checks it too).
  const canChange =
    OPEN_STATUSES.has(quote.status) &&
    receivedOf(quote) <= 0 &&
    !quote.hasPaymentInFlight;
  const showForm = !hasPack || editing;

  return (
    <QuoteStep
      step={1}
      title={t('quoteEditor.packStep')}
      description={showForm ? t('quoteEditor.packStepDesc') : undefined}
      done={hasPack && !editing}
      action={
        hasPack && !editing && canChange ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className={cn('gap-1.5 text-muted-foreground', TAP)}
          >
            <Pencil className="size-3.5" />
            {t('quoteEditor.change')}
          </Button>
        ) : null
      }
    >
      {showForm ? (
        <PackForm
          quote={quote}
          onCancel={hasPack ? onClose : undefined}
          onAttached={onClose}
        />
      ) : (
        <PackSummary quote={quote} />
      )}
    </QuoteStep>
  );
}

function PackForm({
  quote,
  onCancel,
  onAttached,
}: {
  quote: Quotation;
  onCancel?: () => void;
  onAttached: () => void;
}) {
  const { t } = useT();
  const attach = useAttachPackToQuotation();
  const isChange = !!quote.packId;
  // Prefilled when changing the pack, so the admin sees what they change
  // from. A first attach starts empty: the pack sets the price.
  const [choice, setChoice] = useState<PackChoice | null>(
    quote.packId
      ? { packId: quote.packId, archType: quote.archType ?? ArchType.TWO_ARCHES }
      : null,
  );
  const resolved = useResolvedPackChoice(choice);
  const unchanged =
    isChange &&
    resolved?.pack.id === quote.packId &&
    resolved?.archType === quote.archType;

  const submit = () => {
    if (!resolved?.price) return;
    attach.mutate(
      {
        quotationId: quote.id,
        dto: { packId: resolved.pack.id, archType: resolved.archType },
      },
      { onSuccess: onAttached },
    );
  };

  return (
    <div className="grid gap-5">
      <PackChoiceFields
        value={choice}
        onChange={setChoice}
        disabled={attach.isPending}
        hidePackLabel
      />
      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isChange && quote.paymentMode ? t('quoteEditor.changeWipesPlan') : null}
        </p>
        <div className="flex gap-2 sm:justify-end">
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={attach.isPending}
            >
              {t('common.cancel')}
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={submit}
            disabled={!resolved?.price || unchanged || attach.isPending}
            className="gap-2"
          >
            {attach.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {isChange
              ? t('quoteUi.attachPack.updateBtn')
              : t('quoteUi.attachPack.attachBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PackSummary({
  quote,
  price = quote.treatmentFees,
}: {
  quote: Quotation;
  /** Catalogue price by default; the doctor sees the net total. */
  price?: string | number | null;
}) {
  const { t, lang } = useT();
  // The live pack gives the localized name and labels; the aligner and
  // refinement counts come from the quote's own snapshot.
  const name = quote.pack
    ? packName(quote.pack, lang)
    : (quote.packName ?? t('quoteUi.snapshot.packFallback'));
  const facts = packFacts(
    {
      ...(quote.pack ?? {}),
      isUnlimitedSteps: quote.isUnlimitedSteps,
      maxStepsPerArch: quote.maxStepsPerArch,
      isUnlimitedCorrections: quote.isUnlimitedCorrections,
      includedCorrections: quote.includedCorrections,
    },
    t,
    lang,
  );
  const arch = quote.archType ?? ArchType.TWO_ARCHES;

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {name}{' '}
          <span className="font-normal text-muted-foreground">
            · {archLabel(arch, t)}
          </span>
        </p>
        {facts.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{facts.join(' · ')}</p>
        ) : null}
      </div>
      <p className="text-sm font-medium tabular-nums">
        {money(price, quote.currency)}
      </p>
    </div>
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

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Split `total` into `n` parts that sum EXACTLY to it at TND's 3-decimal
 * precision: every part is the floored even share and the last absorbs
 * the rounding remainder, so Σ === total with no drift.
 */
function splitAmounts(total: number, n: number): number[] {
  if (n <= 1) return [round3(total)];
  const base = Math.floor((total / n) * 1000) / 1000;
  const parts = Array<number>(n).fill(base);
  parts[n - 1] = round3(total - base * (n - 1));
  return parts;
}

type StepRange = { from: number; to: number };

/**
 * The installments a re-plan keeps. Paid rows are frozen, and so are
 * cancelled ones: a total edit cancels an installment once nothing more
 * is owed for it and releases its aligners, so its batch may already be
 * unlocked or delivered. The server keeps both kinds, batches included
 * (configurePaymentPlan), and replaces only the pending / overdue rows.
 */
const isKeptInstallment = (inst: QuoteInstallment): boolean =>
  inst.status === InstallmentStatus.PAID || inst.status === InstallmentStatus.CANCELLED;

/** Above this many tranches the stepper stops, for packs without a step count. */
const STEPLESS_MAX_TRANCHES = 12;

/**
 * What the kept installments leave to a re-plan: their rows, their step
 * ranges, their sum (cancelled rows are at 0), the free step segments of
 * the pack and how many steps those hold, and the highest kept number
 * (new rows are numbered after it, as the server numbers them).
 *
 * Kept ranges are not always the head of the pack: a remainder too small
 * to spread goes on the first open row and cancels the later ones, so a
 * free segment can sit between two kept batches.
 */
function keptPlanOf(
  quote: Quotation,
  installments: QuoteInstallment[],
  batchByInstallment: ReadonlyMap<string, QuoteStepBatch>,
) {
  const maxSteps = quote.maxStepsPerArch ?? 0;
  // Unlimited packs (or a missing step count) have no step ceiling.
  const stepless = !!quote.isUnlimitedSteps || maxSteps <= 0;
  const rows = installments.filter(isKeptInstallment);
  const ranges: StepRange[] = rows
    .map((inst) => batchByInstallment.get(inst.id))
    .filter((b): b is QuoteStepBatch => !!b)
    .map((b) => ({ from: b.fromStep, to: b.toStep }))
    .sort((a, b) => a.from - b.from);
  const free = stepless ? [] : freeSegments(ranges, maxSteps);
  return {
    rows,
    ranges,
    sum: sumAmounts(rows.map((inst) => inst.amount)),
    stepless,
    free,
    freeSteps: stepless
      ? STEPLESS_MAX_TRANCHES
      : free.reduce((acc, s) => acc + s.to - s.from + 1, 0),
    lastNumber: rows.reduce((acc, inst) => Math.max(acc, inst.installmentNumber), 0),
  };
}

/** Steps 1..maxSteps that no kept range covers, as contiguous segments. */
function freeSegments(kept: StepRange[], maxSteps: number): StepRange[] {
  const out: StepRange[] = [];
  let cursor = 1;
  for (const r of kept) {
    if (r.from > cursor) out.push({ from: cursor, to: Math.min(r.from - 1, maxSteps) });
    cursor = Math.max(cursor, r.to + 1);
  }
  if (cursor <= maxSteps) out.push({ from: cursor, to: maxSteps });
  return out.filter((s) => s.from <= s.to);
}

/**
 * Split the free steps into `n` contiguous, non-overlapping ranges, one
 * per tranche, none crossing a kept batch. A limited pack spreads its
 * free segments evenly (a new plan has one segment, 1..maxSteps; the
 * last tranche of a segment runs to its end); packs without a step
 * ceiling give each tranche the next free step, so the batches stay
 * distinct. Callers cap `n` at the free steps of a limited pack.
 */
function splitSteps(
  plan: Pick<ReturnType<typeof keptPlanOf>, 'ranges' | 'free' | 'stepless'>,
  n: number,
): StepRange[] {
  if (plan.stepless) {
    const out: StepRange[] = [];
    for (let step = 1; out.length < n; step++) {
      if (!plan.ranges.some((r) => step >= r.from && step <= r.to)) {
        out.push({ from: step, to: step });
      }
    }
    return out;
  }
  const ranges: StepRange[] = [];
  const segments = plan.free;
  let seg = 0;
  let start = segments[0]?.from ?? 1;
  for (let i = 0; i < n && seg < segments.length; i++) {
    const segEnd = segments[seg]!.to;
    const remainingSteps =
      segEnd -
      start +
      1 +
      segments.slice(seg + 1).reduce((acc, s) => acc + s.to - s.from + 1, 0);
    const remainingTranches = n - i;
    const size = Math.max(1, Math.round(remainingSteps / remainingTranches));
    const end = i === n - 1 ? segEnd : Math.min(segEnd, start + size - 1);
    ranges.push({ from: start, to: end });
    start = end + 1;
    if (start > segEnd) {
      seg += 1;
      start = segments[seg]?.from ?? start;
    }
  }
  return ranges;
}

/** Auto-distribute the total + step ranges across `n` tranches. */
function buildRows(
  total: number,
  n: number,
  plan: Pick<ReturnType<typeof keptPlanOf>, 'ranges' | 'free' | 'stepless'>,
): DraftRow[] {
  const amounts = splitAmounts(total, n);
  const steps = splitSteps(plan, n);
  return amounts.map((amt, i) => ({
    amount: amt.toFixed(3),
    // No step left for this tranche: empty, and the validation says so.
    fromStep: steps[i] ? String(steps[i].from) : '',
    toStep: steps[i] ? String(steps[i].to) : '',
    availableFrom: todayISO(),
    dueDate: '',
  }));
}

/**
 * The plan editor. Without `installments` it builds the first plan over
 * the whole total. With them (the admin's "Modifier l'échéancier"), the
 * kept installments (paid or cancelled) stay read-only, the editor is
 * seeded with the open rows, its target is `totalPrice − Σ kept`, and
 * only the new rows are sent: the server keeps the others and their
 * batches, so the new ranges must stay clear of those batches.
 */
function PlanBuilderCard({
  quote,
  installments = [],
  batches = [],
  onClose,
}: {
  quote: Quotation;
  /** Current plan, when re-planning. */
  installments?: QuoteInstallment[];
  batches?: QuoteStepBatch[];
  /** Re-planning only: leaves the editor (after a save or on Cancel). */
  onClose?: () => void;
}) {
  const { t } = useT();
  const maxSteps = quote.maxStepsPerArch ?? 0;
  const isUnlimited = !!quote.isUnlimitedSteps;
  const configure = useConfigurePaymentPlan();

  const batchByInstallment = useMemo(() => {
    const m = new Map<string, QuoteStepBatch>();
    batches.forEach((b) => m.set(b.installmentId, b));
    return m;
  }, [batches]);
  const kept = useMemo(
    () => keptPlanOf(quote, installments, batchByInstallment),
    [quote, installments, batchByInstallment],
  );
  const keptRows = kept.rows;
  const keptRanges = kept.ranges;
  const hasKept = keptRows.length > 0;
  // What the new rows must add up to.
  const total = Math.max(
    0,
    (Math.round(toDec(quote.totalPrice) * 1000) - Math.round(kept.sum * 1000)) / 1000,
  );

  // A tranche maps to a distinct step batch, so a limited pack can't have
  // more tranches than (free) steps. Unlimited packs get a sane upper bound
  // so the stepper can't run away.
  const maxTranches = isUnlimited
    ? STEPLESS_MAX_TRANCHES
    : hasKept
      ? Math.max(1, kept.freeSteps)
      : Math.max(2, maxSteps);
  const canSplit = maxTranches >= 2;

  // Seeded with the open rows when re-planning, else one row.
  const [rows, setRows] = useState<DraftRow[]>(() => {
    const open = installments.filter((i) => !isKeptInstallment(i));
    if (open.length === 0) {
      return buildRows(total, 1, kept);
    }
    // The extra installment a total raise adds on a settled plan carries
    // no batch (it is then the only open row); the server wants one per
    // new row, so it takes the free steps, as "split evenly" would. Next
    // to rows that have batches it stays empty for the admin to fill.
    const batchless = open.filter((inst) => !batchByInstallment.has(inst.id));
    const freeRanges =
      batchless.length === open.length ? splitSteps(kept, batchless.length) : [];
    return open.map((inst) => {
      const batch = batchByInstallment.get(inst.id);
      const range = batch
        ? { from: batch.fromStep, to: batch.toStep }
        : freeRanges[batchless.indexOf(inst)];
      return {
        amount: toDec(inst.amount).toFixed(3),
        fromStep: range ? String(range.from) : '',
        toStep: range ? String(range.to) : '',
        availableFrom: isoDay(inst.availableFrom) || todayISO(),
        dueDate: isoDay(inst.dueDate),
      };
    });
  });
  const [mode, setMode] = useState<PaymentMode>(() =>
    rows.length > 1 ? PaymentMode.INSTALLMENTS : PaymentMode.FULL_PAYMENT,
  );

  const applyMode = (next: PaymentMode) => {
    setMode(next);
    setRows(
      buildRows(
        total,
        next === PaymentMode.FULL_PAYMENT ? 1 : Math.min(2, maxTranches),
        kept,
      ),
    );
  };

  const setCount = (n: number) => {
    const clamped = Math.min(maxTranches, Math.max(2, n));
    setRows(buildRows(total, clamped, kept));
  };

  const splitEvenly = () => setRows((rs) => buildRows(total, rs.length, kept));

  const updateRow = (i: number, patch: Partial<DraftRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const count = rows.length;
  // Display number of a new row: after the highest kept installment, as
  // the server numbers it (a cancelled row keeps its number).
  const rowNumber = (i: number) => kept.lastNumber + i + 1;

  // Live validation — sum vs target, overlap (between new rows and with
  // the kept batches), range bounds. Auto-built rows are valid by
  // construction; this guards manual edits.
  const validation = useMemo(() => {
    const errors: string[] = [];
    const numeric = rows.map((r) => ({
      amount: Number(r.amount),
      from: Number(r.fromStep),
      to: Number(r.toStep),
    }));
    const sum = sumAmounts(numeric.map((r) => (isFinite(r.amount) ? r.amount : 0)));
    if (Math.abs(sum - total) > 0.001) {
      errors.push(
        t('quoteUi.plan.errSum', {
          sum: sum.toFixed(3),
          total: total.toFixed(3),
        }),
      );
    }
    for (let i = 0; i < numeric.length; i++) {
      const r = numeric[i]!;
      const n = kept.lastNumber + i + 1;
      if (!isFinite(r.amount) || r.amount <= 0) {
        errors.push(t('quoteUi.plan.errPositive', { n }));
      }
      if (!isFinite(r.from) || !isFinite(r.to) || r.from < 1 || r.from > r.to) {
        errors.push(t('quoteUi.plan.errRange', { n }));
      }
      if (!isUnlimited && r.to > maxSteps) {
        errors.push(t('quoteUi.plan.errMax', { n, max: maxSteps }));
      }
      if (keptRanges.some((p) => r.from <= p.to && r.to >= p.from)) {
        errors.push(t('quoteUi.plan.errPaidOverlap', { n }));
      }
    }
    const sorted = [...numeric].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.from <= sorted[i - 1]!.to) {
        errors.push(t('quoteUi.plan.errOverlap'));
        break;
      }
    }
    if (mode === PaymentMode.INSTALLMENTS && rows.length < 2) {
      errors.push(t('quoteUi.plan.errMinTwo'));
    }
    return { errors, sum };
  }, [rows, total, mode, maxSteps, isUnlimited, kept.lastNumber, keptRanges, t]);

  const balanced = Math.abs(validation.sum - total) <= 0.001;

  const submit = () => {
    if (validation.errors.length > 0) {
      toast.error(validation.errors[0]);
      return;
    }
    configure.mutate(
      {
        quotationId: quote.id,
        dto: {
          // With installments kept (paid or cancelled), the quote stays an
          // installment plan even when the rest is one new row (the server
          // accepts one or more new rows in that case).
          paymentMode: hasKept ? PaymentMode.INSTALLMENTS : mode,
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
      },
      { onSuccess: () => onClose?.() },
    );
  };

  return (
    <QuoteStep
      step={3}
      title={onClose ? t('quoteEditor.editPlan') : t('quoteEditor.planStep')}
      description={
        hasKept
          ? t('quoteEditor.planEditDesc', { remaining: money(total, quote.currency) })
          : t('quoteEditor.planStepDesc', { total: money(total, quote.currency) })
      }
    >
      <div className="space-y-5">
        {hasKept ? (
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('quoteUi.plan.keptRowsTitle')}
            </h3>
            <ul className="divide-y rounded-lg border bg-muted/30">
              {keptRows.map((inst) => {
                const batch = batchByInstallment.get(inst.id);
                return (
                  <li
                    key={inst.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
                  >
                    <Lock
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="font-medium text-muted-foreground">
                      #{inst.installmentNumber}
                    </span>
                    <span className="font-medium tabular-nums">
                      {money(inst.amount, quote.currency)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('quoteUi.adminPlan.colSteps')}{' '}
                      {batch ? `${batch.fromStep} → ${batch.toStep}` : '—'}
                    </span>
                    <span className="ml-auto">
                      <InstallmentStatusBadge status={inst.status} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* Mode — pay in full or split into tranches */}
        <div className="inline-flex max-w-full flex-wrap rounded-lg border bg-muted/40 p-1">
          {[
            {
              m: PaymentMode.FULL_PAYMENT,
              label: hasKept ? t('quoteUi.plan.restInOne') : t('quoteUi.plan.payInFull'),
              disabled: false,
            },
            {
              m: PaymentMode.INSTALLMENTS,
              label: hasKept ? t('quoteUi.plan.restSplit') : t('quoteUi.plan.splitTranches'),
              disabled: !canSplit,
            },
          ].map(({ m, label, disabled }) => (
            <button
              key={m}
              type="button"
              onClick={() => applyMode(m)}
              aria-pressed={mode === m}
              disabled={disabled || configure.isPending}
              className={cn(
                'min-h-11 rounded-md px-4 py-1.5 text-sm font-medium transition disabled:opacity-50 sm:min-h-0',
                mode === m
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tranche count — drives the auto-distribution */}
        {mode === PaymentMode.INSTALLMENTS ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">
                {t('quoteUi.plan.trancheCount')}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 sm:h-8 sm:w-8"
                  onClick={() => setCount(count - 1)}
                  disabled={count <= 2}
                  aria-label={t('quoteUi.plan.oneFewerAria')}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-9 text-center text-lg font-semibold tabular-nums">
                  {count}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 sm:h-8 sm:w-8"
                  onClick={() => setCount(count + 1)}
                  disabled={count >= maxTranches}
                  aria-label={t('quoteUi.plan.oneMoreAria')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="hidden items-center gap-1 sm:flex">
                {[2, 3, 4].filter((n) => n <= maxTranches).map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={count === n ? 'default' : 'outline'}
                    className="h-8 w-9 px-0"
                    onClick={() => setCount(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={splitEvenly}
            >
              <Scale className="h-4 w-4" />
              {t('quoteUi.plan.splitEvenly')}
            </Button>
          </div>
        ) : null}

        <div className="hidden overflow-hidden rounded-lg border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>
                  {t('quoteUi.plan.colAmount', { currency: quote.currency })}
                </TableHead>
                <TableHead>{t('quoteUi.plan.colSteps')}</TableHead>
                <TableHead>{t('quoteUi.plan.colAvailableFrom')}</TableHead>
                <TableHead>{t('quoteUi.plan.colDueDate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-muted-foreground">
                    {rowNumber(i)}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.001"
                      min={0.001}
                      value={row.amount}
                      onChange={(e) => updateRow(i, { amount: e.target.value })}
                      className="w-32 font-medium tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        value={row.fromStep}
                        onChange={(e) =>
                          updateRow(i, { fromStep: e.target.value })
                        }
                        className="w-16"
                        aria-label={t('quoteUi.plan.firstStepAria', { n: rowNumber(i) })}
                      />
                      <span className="text-muted-foreground">→</span>
                      <Input
                        type="number"
                        min={1}
                        value={row.toStep}
                        onChange={(e) =>
                          updateRow(i, { toStep: e.target.value })
                        }
                        className="w-16"
                        aria-label={t('quoteUi.plan.lastStepAria', { n: rowNumber(i) })}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      value={row.availableFrom}
                      onChange={(e) =>
                        updateRow(i, { availableFrom: e.target.value })
                      }
                      className="w-40"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      value={row.dueDate}
                      onChange={(e) => updateRow(i, { dueDate: e.target.value })}
                      className="w-40"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 md:hidden">
          {rows.map((row, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('quoteUi.plan.trancheCount')} #{rowNumber(i)}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {t('quoteUi.plan.colAmount', { currency: quote.currency })}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  #{rowNumber(i)}
                </Badge>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor={`plan-amount-${i}`} className="text-xs">
                    {t('quoteUi.plan.colAmount', { currency: quote.currency })}
                  </Label>
                  <Input
                    id={`plan-amount-${i}`}
                    type="number"
                    step="0.001"
                    min={0.001}
                    value={row.amount}
                    onChange={(e) => updateRow(i, { amount: e.target.value })}
                    className="h-11 font-medium tabular-nums"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs">{t('quoteUi.plan.colSteps')}</Label>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={row.fromStep}
                      onChange={(e) =>
                        updateRow(i, { fromStep: e.target.value })
                      }
                      className="h-11"
                      aria-label={t('quoteUi.plan.firstStepAria', { n: rowNumber(i) })}
                    />
                    <span className="text-muted-foreground">→</span>
                    <Input
                      type="number"
                      min={1}
                      value={row.toStep}
                      onChange={(e) => updateRow(i, { toStep: e.target.value })}
                      className="h-11"
                      aria-label={t('quoteUi.plan.lastStepAria', { n: rowNumber(i) })}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`plan-available-${i}`} className="text-xs">
                      {t('quoteUi.plan.colAvailableFrom')}
                    </Label>
                    <Input
                      id={`plan-available-${i}`}
                      type="date"
                      value={row.availableFrom}
                      onChange={(e) =>
                        updateRow(i, { availableFrom: e.target.value })
                      }
                      className="h-11"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`plan-due-${i}`} className="text-xs">
                      {t('quoteUi.plan.colDueDate')}
                    </Label>
                    <Input
                      id={`plan-due-${i}`}
                      type="date"
                      value={row.dueDate}
                      onChange={(e) => updateRow(i, { dueDate: e.target.value })}
                      className="h-11"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Balance indicator — green when Σ matches the target. */}
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm',
            balanced
              ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
              : 'border-amber-200 bg-amber-50/70 text-amber-900',
          )}
        >
          <span className="flex items-center gap-2">
            {balanced ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <span>
              {hasKept
                ? t('quoteUi.plan.newTranchesTotal')
                : t('quoteUi.plan.tranchesTotal')}{' '}
              <strong className="tabular-nums">
                {money(validation.sum, quote.currency)}
              </strong>{' '}
              / {money(total, quote.currency)}
            </span>
          </span>
          {!balanced ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={splitEvenly}
            >
              <Scale className="h-3.5 w-3.5" />
              {t('quoteUi.plan.rebalance')}
            </Button>
          ) : null}
        </div>

        {validation.errors.length > 0 ? (
          <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {validation.errors.map((err, i) => (
              <li key={i}>• {err}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onClose ? (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={configure.isPending}
              className="h-11 w-full sm:h-10 sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
          ) : null}
          <Button
            onClick={submit}
            disabled={configure.isPending || validation.errors.length > 0}
            className="h-11 w-full gap-2 sm:h-10 sm:w-auto"
          >
            {configure.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {t('quoteUi.plan.saveBtn')}
          </Button>
        </div>
      </div>
    </QuoteStep>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Admin — Plan view (installments, batches, record-cash, deliver)
// ═══════════════════════════════════════════════════════════════════════

function InstallmentStatusBadge({ status }: { status: InstallmentStatus }) {
  const { t } = useT();
  // Enum value → quoteUi.installmentStatus.* key-map (all four
  // lifecycle values are covered in the dictionary).
  const label = t(`quoteUi.installmentStatus.${status}`);
  switch (status) {
    case InstallmentStatus.PAID:
      return <Badge className="bg-emerald-600">{label}</Badge>;
    case InstallmentStatus.OVERDUE:
      return <Badge variant="destructive">{label}</Badge>;
    case InstallmentStatus.CANCELLED:
      return <Badge variant="outline">{label}</Badge>;
    default:
      return <Badge variant="secondary">{label}</Badge>;
  }
}

function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const { t } = useT();
  const label = t(`quoteUi.batchStatus.${status}`);
  switch (status) {
    case BatchStatus.DELIVERED:
      return (
        <Badge className="bg-emerald-600">
          <Truck className="mr-1 h-3 w-3" />
          {label}
        </Badge>
      );
    case BatchStatus.UNLOCKED:
      return (
        <Badge className="bg-amber-500">
          <Unlock className="mr-1 h-3 w-3" />
          {label}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <Lock className="mr-1 h-3 w-3" />
          {label}
        </Badge>
      );
  }
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium">{value}</span>
    </div>
  );
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
  const { t, lang } = useT();
  const [cashTarget, setCashTarget] = useState<QuoteInstallment | null>(null);
  const [cardTarget, setCardTarget] = useState<QuoteInstallment | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [now] = useState(() => Date.now());
  // Loaded with the plan so the payment dialogs open with the retenue
  // option already known (no jump once they are open).
  const rates = useQuoteTaxRates(quote);
  const quoteIsPayable =
    quote.status === QuotationStatus.SENT ||
    quote.status === QuotationStatus.APPROVED;

  // Index batches by installment id so each row can show its linked
  // delivery range without an O(n²) lookup.
  const batchByInstallment = useMemo(() => {
    const m = new Map<string, QuoteStepBatch>();
    batches.forEach((b) => m.set(b.installmentId, b));
    return m;
  }, [batches]);

  // "Modifier l'échéancier": the open rows are re-planned, the kept ones
  // (paid or cancelled, batches included) stay. Offered while something
  // is left to pay (the server refuses a re-plan with nothing left) and a
  // step is left to give it, not while a payment is in flight: that
  // attempt is tied to an open row. The server says whether a step is
  // free; an older payload falls back to the kept batches of a limited
  // pack. Without a free step, an extra installment (no batch) is simply
  // paid as it is.
  const kept = keptPlanOf(quote, installments, batchByInstallment);
  const leftToPlan =
    (Math.round(toDec(quote.totalPrice) * 1000) - Math.round(kept.sum * 1000)) / 1000;
  const hasFreeStep = quote.freeStepsForReplan ?? (kept.stepless || kept.freeSteps > 0);
  const hasSomethingToPlan = leftToPlan > 0 && hasFreeStep;
  const canEditPlan =
    OPEN_STATUSES.has(quote.status) && hasSomethingToPlan && !quote.hasPaymentInFlight;

  if (editingPlan) {
    return (
      <PlanBuilderCard
        quote={quote}
        installments={installments}
        batches={batches}
        onClose={() => setEditingPlan(false)}
      />
    );
  }

  return (
    <>
      <QuoteStep
        step={3}
        done
        flush
        title={t('quoteEditor.planStep')}
        action={
          canEditPlan ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditingPlan(true)}
              className={cn('gap-1.5 text-muted-foreground', TAP)}
            >
              <Pencil className="size-3.5" />
              {t('quoteEditor.editPlan')}
            </Button>
          ) : null
        }
        description={
          <>
            {t('quoteEditor.planViewDesc')}{' '}
            <Link
              href="/dashboard/payments/pending"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t('quoteEditor.pendingTransfers')}
            </Link>
            .
            {quote.hasPaymentInFlight &&
            OPEN_STATUSES.has(quote.status) &&
            hasSomethingToPlan ? (
              <span className="mt-1 block text-amber-700 dark:text-amber-400">
                {t('quoteEditor.planInFlight')}
              </span>
            ) : null}
          </>
        }
      >
          <div className="hidden border-t md:block [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t('quoteUi.adminPlan.colAmount')}</TableHead>
                <TableHead>{t('quoteUi.adminPlan.colStatus')}</TableHead>
                <TableHead>{t('quoteUi.adminPlan.colSteps')}</TableHead>
                <TableHead>{t('quoteUi.adminPlan.colBatch')}</TableHead>
                <TableHead>{t('quoteUi.adminPlan.colAvailable')}</TableHead>
                <TableHead>{t('quoteUi.adminPlan.colDue')}</TableHead>
                <TableHead className="text-right">
                  {t('common.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {installments.map((inst) => {
                const batch = batchByInstallment.get(inst.id);
                const isPayable =
                  quoteIsPayable &&
                  (inst.status === InstallmentStatus.PENDING ||
                    inst.status === InstallmentStatus.OVERDUE) &&
                  new Date(inst.availableFrom).getTime() <= now;
                return (
                  <TableRow key={inst.id}>
                    <TableCell>{inst.installmentNumber}</TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {money(inst.amount, quote.currency)}
                      {isOpenInstallment(inst) ? <StampHint stamp={rates.stampDuty} /> : null}
                    </TableCell>
                    <TableCell>
                      <InstallmentStatusBadge status={inst.status} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {batch
                        ? `${batch.fromStep} → ${batch.toStep}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {batch ? <BatchStatusBadge status={batch.status} /> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatTimestampDay(inst.availableFrom, lang)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {inst.dueDate
                        ? formatTimestampDay(inst.dueDate, lang)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {isPayable ? (
                          <AdminInstallmentActions
                            onRecordCash={() => setCashTarget(inst)}
                            onPayByCard={() => setCardTarget(inst)}
                          />
                        ) : null}
                        {batch?.status === BatchStatus.UNLOCKED ? (
                          <BatchDeliveryButton
                            quote={quote}
                            batch={batch}
                            label={t('quoteUi.adminPlan.markDelivered')}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          <div className="grid gap-3 p-3 md:hidden">
            {installments.map((inst) => {
              const batch = batchByInstallment.get(inst.id);
              const isPayable =
                quoteIsPayable &&
                (inst.status === InstallmentStatus.PENDING ||
                  inst.status === InstallmentStatus.OVERDUE) &&
                new Date(inst.availableFrom).getTime() <= now;
              return (
                <div
                  key={inst.id}
                  className="rounded-xl border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        #{inst.installmentNumber}
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {money(inst.amount, quote.currency)}
                      </p>
                      {isOpenInstallment(inst) ? <StampHint stamp={rates.stampDuty} /> : null}
                    </div>
                    <InstallmentStatusBadge status={inst.status} />
                  </div>
                  <div className="mt-4 grid gap-2 text-sm">
                    <InfoLine
                      label={t('quoteUi.adminPlan.colSteps')}
                      value={batch ? `${batch.fromStep} → ${batch.toStep}` : '—'}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {t('quoteUi.adminPlan.colBatch')}
                      </span>
                      <span>{batch ? <BatchStatusBadge status={batch.status} /> : '—'}</span>
                    </div>
                    <InfoLine
                      label={t('quoteUi.adminPlan.colAvailable')}
                      value={formatTimestampDay(inst.availableFrom, lang)}
                    />
                    <InfoLine
                      label={t('quoteUi.adminPlan.colDue')}
                      value={
                        inst.dueDate
                          ? formatTimestampDay(inst.dueDate, lang)
                          : '—'
                      }
                    />
                  </div>
                  {(isPayable || batch?.status === BatchStatus.UNLOCKED) && (
                    <div className="mt-4 grid gap-2">
                      {isPayable ? (
                        <AdminInstallmentActions
                          onRecordCash={() => setCashTarget(inst)}
                          onPayByCard={() => setCardTarget(inst)}
                          fullWidth
                        />
                      ) : null}
                      {batch?.status === BatchStatus.UNLOCKED ? (
                        <BatchDeliveryButton
                          quote={quote}
                          batch={batch}
                          label={t('quoteUi.adminPlan.markDelivered')}
                          className="h-10 w-full justify-center"
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
      </QuoteStep>

      <RecordCashDialog
        key={cashTarget?.id ?? 'closed'}
        target={cashTarget}
        quote={quote}
        rates={rates}
        onClose={() => setCashTarget(null)}
      />
      <AdminCardDialog
        key={cardTarget ? `card-${cardTarget.id}` : 'card-closed'}
        target={cardTarget}
        quote={quote}
        rates={rates}
        onClose={() => setCardTarget(null)}
      />
    </>
  );
}

function AdminInstallmentActions({
  onRecordCash,
  onPayByCard,
  fullWidth = false,
}: {
  onRecordCash: () => void;
  onPayByCard: () => void;
  fullWidth?: boolean;
}) {
  const { t } = useT();
  return (
    <div
      className={cn(
        'flex flex-wrap justify-end gap-2',
        fullWidth && 'grid w-full grid-cols-1 sm:grid-cols-2',
      )}
    >
      <Button
        size="sm"
        className={cn('min-h-11 sm:min-h-10', fullWidth && 'w-full justify-center')}
        onClick={onPayByCard}
      >
        <CreditCard className="mr-2 h-4 w-4 shrink-0" />
        {t('quoteUi.adminPlan.payByCard')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={cn('min-h-11 sm:min-h-10', fullWidth && 'w-full justify-center')}
        onClick={onRecordCash}
      >
        <Wallet className="mr-2 h-4 w-4 shrink-0" />
        {t('quoteUi.adminPlan.recordCash')}
      </Button>
    </div>
  );
}

/** An installment still to pay: its payment will carry the stamp. */
const isOpenInstallment = (inst: QuoteInstallment): boolean =>
  inst.status === InstallmentStatus.PENDING || inst.status === InstallmentStatus.OVERDUE;

/** The installments that are (or will be) a payment: every one but the cancelled. */
const paymentCountOf = (installments: QuoteInstallment[]): number =>
  installments.filter((inst) => inst.status !== InstallmentStatus.CANCELLED).length;

/** "+ 1,000 de timbre" under an open installment's amount. */
function StampHint({ stamp, className }: { stamp: number; className?: string }) {
  const { t } = useT();
  if (!(stamp > 0)) return null;
  return (
    <span className={cn('block text-[11px] font-normal text-muted-foreground', className)}>
      {t('withholdingUi.stampHint', { stamp: formatAmount(stamp) })}
    </span>
  );
}

/**
 * Admin "Payer par carte" for an installment: the practitioner's retenue
 * choice first, then the ClicToPay page for the amount charged (the
 * installment + the stamp - the retenue).
 */
function AdminCardDialog({
  target,
  quote,
  rates,
  onClose,
}: {
  target: QuoteInstallment | null;
  quote: Quotation;
  rates: QuoteTaxRates;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const payCard = usePayByCard();
  const [applyWithholding, setApplyWithholding] = useState(false);
  const [attemptConflict, setAttemptConflict] = useState(false);
  const apply = rates.withholdingRate > 0 && applyWithholding;
  const charge = previewInstallmentCharges(
    [target?.amount],
    rates.stampDuty,
    rates.withholdingRate,
    apply,
  );

  const start = async () => {
    if (!target) return;
    setAttemptConflict(false);
    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${quote.id}-${target.id}-${Date.now()}`;
    try {
      const session = await payCard.mutateAsync({
        quotationId: quote.id,
        installmentId: target.id,
        idempotencyKey,
        orderId: quote.orderId,
        language: lang === 'en' ? 'en' : 'fr',
        applyWithholding: apply,
      });
      const verificationUrl = `/payment/return?paymentId=${encodeURIComponent(
        session.paymentId,
      )}`;
      window.location.assign(session.paymentUrl ?? verificationUrl);
    } catch (err) {
      // The mutation hook toasts the API error; an open attempt with the
      // other retenue choice also gets a plain explanation here. Any other
      // refusal (a transfer awaiting confirmation…) is the toast's.
      if (isWithholdingChoiceConflict(err)) setAttemptConflict(true);
    }
  };

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o && !payCard.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('quoteUi.adminCard.title')}</DialogTitle>
          <DialogDescription>
            {t('quoteUi.adminCard.desc', { n: target?.installmentNumber ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-2">
          <WithholdingChoice
            rate={rates.withholdingRate}
            checked={applyWithholding}
            onCheckedChange={(checked) => {
              setApplyWithholding(checked);
              setAttemptConflict(false);
            }}
            charge={charge}
            currency={quote.currency}
            disabled={payCard.isPending}
          />
          <PriceIncludesTaxNote
            tvaRate={rates.tvaRate}
            stamp={rates.stampDuty}
            currency={quote.currency}
          />
          {attemptConflict ? (
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"
            >
              {t('withholdingUi.choiceConflict')}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={payCard.isPending}
            className={TAP}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={start}
            disabled={payCard.isPending || !rates.ready}
            className={cn('gap-2', TAP)}
          >
            {payCard.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            {t('quoteUi.adminCard.continue', { amount: money(charge.cash, quote.currency) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ReceivedMethod = PaymentMethod.CASH | PaymentMethod.CHEQUE;

/**
 * Admin records money handed over at the clinic: cash or cheque, and
 * whether the practitioner kept the retenue à la source back.
 */
function RecordCashDialog({
  target,
  quote,
  rates,
  onClose,
}: {
  target: QuoteInstallment | null;
  quote: Quotation;
  rates: QuoteTaxRates;
  onClose: () => void;
}) {
  const { t } = useT();
  const record = useRecordCash();
  const [method, setMethod] = useState<ReceivedMethod>(PaymentMethod.CASH);
  const [applyWithholding, setApplyWithholding] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [notes, setNotes] = useState('');
  const apply = rates.withholdingRate > 0 && applyWithholding;
  const charge = previewInstallmentCharges(
    [target?.amount],
    rates.stampDuty,
    rates.withholdingRate,
    apply,
  );

  const methods: Array<{ value: ReceivedMethod; label: string; icon: typeof Wallet }> = [
    { value: PaymentMethod.CASH, label: t('quoteUi.recordCash.cash'), icon: Wallet },
    { value: PaymentMethod.CHEQUE, label: t('quoteUi.recordCash.cheque'), icon: FileText },
  ];

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o && !record.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('quoteUi.recordCash.title')}</DialogTitle>
          <DialogDescription>
            {t('quoteUi.recordCash.desc', {
              n: target?.installmentNumber ?? '',
              amount: money(target?.amount, quote.currency),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-4">
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">{t('quoteUi.recordCash.methodLabel')}</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-1">
              {methods.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={method === value}
                  onClick={() => setMethod(value)}
                  disabled={record.isPending}
                  className={cn(
                    'flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition disabled:opacity-50 sm:min-h-9',
                    method === value
                      ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-card/60',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <WithholdingChoice
              rate={rates.withholdingRate}
              checked={applyWithholding}
              onCheckedChange={setApplyWithholding}
              charge={charge}
              currency={quote.currency}
              disabled={record.isPending}
              audience="admin"
              netLabel={t('withholdingUi.toCollect')}
            />
            <PriceIncludesTaxNote
              tvaRate={rates.tvaRate}
              stamp={rates.stampDuty}
              currency={quote.currency}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="receipt">
              {method === PaymentMethod.CHEQUE
                ? t('quoteUi.recordCash.chequeNumber')
                : t('quoteUi.recordCash.receiptNumber')}
            </Label>
            <Input
              id="receipt"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
              placeholder={t('common.optional')}
              className="h-11 sm:h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes">{t('quoteUi.recordCash.notes')}</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={record.isPending}
            className={TAP}
          >
            {t('common.cancel')}
          </Button>
          <Button
            disabled={record.isPending || !rates.ready}
            className={cn('gap-2', TAP)}
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
                    method,
                    applyWithholding: apply,
                  },
                },
                { onSuccess: onClose },
              );
            }}
          >
            {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('quoteUi.recordCash.submit', { amount: money(charge.cash, quote.currency) })}
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
  const { t } = useT();
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

  // Price wording and the stamp, and warms the cache the pay dialog reads
  // its retenue rate from.
  const rates = useQuoteTaxRates(quote);
  // What every payable row costs paid now, one stamp each (the retenue,
  // the practitioner's choice, comes off in the dialog).
  const payableCharge = previewInstallmentCharges(
    payable.map((r) => r.amount),
    rates.stampDuty,
    0,
    false,
  );
  // The whole plan: the pack total plus one stamp per payment.
  const plan = previewPlanStamps(quote.totalPrice, paymentCountOf(installments), rates.stampDuty);

  return (
    <>
      <Card size="sm">
        <CardContent>
          <PackSummary quote={quote} price={quote.totalPrice} />
          {plan.count > 0 && plan.stamps > 0 ? (
            <dl className="mt-2 space-y-1 border-t pt-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="min-w-0 text-muted-foreground">
                  {plan.count > 1
                    ? t('withholdingUi.stampTimes', {
                        count: plan.count,
                        stamp: formatAmount(plan.stampEach),
                      })
                    : t('withholdingUi.stamp')}
                </dt>
                <dd className="shrink-0 tabular-nums">+ {money(plan.stamps, quote.currency)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 font-medium">
                <dt className="min-w-0">{t('withholdingUi.totalWithStamps')}</dt>
                <dd className="shrink-0 tabular-nums">{money(plan.total, quote.currency)}</dd>
              </div>
            </dl>
          ) : null}
          <PriceIncludesTaxNote
            className="mt-1 sm:text-right"
            tvaRate={rates.tvaRate}
            stamp={rates.stampDuty}
            currency={quote.currency}
          />
        </CardContent>
      </Card>

      {isApproved && payable.length > 1 ? (
        <Card className="border-emerald-200/60 bg-emerald-50/40">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900/70">
                {t('quoteUi.doctor.payAllTitle')}
              </div>
              <p className="mt-0.5 text-sm text-emerald-900">
                {t('quoteUi.doctor.payAllBefore')}{' '}
                <strong>{payable.length}</strong>{' '}
                {t('quoteUi.doctor.payAllMiddle')}{' '}
                <strong>{money(payableCharge.cash, quote.currency)}</strong>{' '}
                {payableCharge.stamp > 0
                  ? t('quoteUi.doctor.payAllAfterStamps')
                  : t('quoteUi.doctor.payAllAfter')}
              </p>
            </div>
            <DoctorPayActions
              quote={quote}
              installment={nextPayable!}
              payable={payable}
              defaultScope="all"
              label={t('quoteUi.doctor.payAllBtn')}
              patientName={patientName}
              doctorName={doctorName}
              orderCode={orderCode}
              fullWidth
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('quoteUi.doctor.timelineTitle')}
          </CardTitle>
          <CardDescription>
            {isApproved
              ? t('quoteUi.doctor.timelineDescApproved')
              : t('quoteUi.doctor.timelineDescNotApproved')}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t('quoteUi.adminPlan.colAmount')}</TableHead>
                <TableHead>{t('quoteUi.adminPlan.colStatus')}</TableHead>
                <TableHead>{t('quoteUi.adminPlan.colSteps')}</TableHead>
                <TableHead>{t('quoteUi.adminPlan.colAvailable')}</TableHead>
                <TableHead className="text-right">
                  {t('common.actions')}
                </TableHead>
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
                      {isOpenInstallment(inst) ? (
                        <StampHint stamp={rates.stampDuty} className="font-sans" />
                      ) : null}
                    </TableCell>
                    <TableCell className="space-y-1">
                      <InstallmentStatusBadge status={inst.status} />
                      {batch ? (
                        <div className="text-xs">
                          <BatchStatusBadge status={batch.status} />
                        </div>
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
                          {t('quoteUi.doctor.lockedUntil')}
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
          </div>
          <div className="grid gap-3 p-3 md:hidden">
            {installments.map((inst) => {
              const batch = batchByInstallment.get(inst.id);
              const available = new Date(inst.availableFrom).getTime() <= now;
              const isNext = nextPayable?.id === inst.id;
              return (
                <div
                  key={inst.id}
                  className={cn(
                    'rounded-xl border bg-card p-4 shadow-sm',
                    isNext && available && 'border-primary/40 bg-primary/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        #{inst.installmentNumber}
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {money(inst.amount, quote.currency)}
                      </p>
                      {isOpenInstallment(inst) ? <StampHint stamp={rates.stampDuty} /> : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <InstallmentStatusBadge status={inst.status} />
                      {batch ? <BatchStatusBadge status={batch.status} /> : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm">
                    <InfoLine
                      label={t('quoteUi.adminPlan.colSteps')}
                      value={batch ? `${batch.fromStep} → ${batch.toStep}` : '—'}
                    />
                    <InfoLine
                      label={t('quoteUi.adminPlan.colAvailable')}
                      value={new Date(inst.availableFrom).toLocaleDateString()}
                    />
                    {!available ? (
                      <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                        {t('quoteUi.doctor.lockedUntil')}
                      </p>
                    ) : null}
                  </div>
                  {isApproved && isNext && available ? (
                    <div className="mt-4">
                      <DoctorPayActions
                        quote={quote}
                        installment={inst}
                        payable={payable}
                        patientName={patientName}
                        doctorName={doctorName}
                        orderCode={orderCode}
                        fullWidth
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
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
  label,
  patientName,
  doctorName,
  orderCode,
  fullWidth = false,
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
  fullWidth?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(fullWidth && 'h-10 w-full justify-center sm:w-auto')}
      >
        <CreditCard className="mr-1 h-4 w-4" />
        {label ?? t('quoteUi.doctor.payNow')}
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
  const { t, lang } = useT();
  const { data: billingDefaults, isLoading: billingDefaultsLoading } =
    useBillingPublicDefaults(open);
  const rates = useQuoteTaxRates(quote, open);
  // Retenue à la source: one choice for the whole payment, applied to each
  // installment separately (each one is its own invoice).
  const [applyWithholding, setApplyWithholding] = useState(false);
  // A card session refused because one is already open with the other choice.
  const [attemptConflict, setAttemptConflict] = useState(false);
  // Backend currently allows all three methods. If the project later
  // adds `allowedPaymentMethods` on the quote, swap this constant for
  // `quote.allowedPaymentMethods ?? QUOTE_PAYMENT_METHODS`.
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CARD);
  const [scope, setScope] = useState<PayScope>(
    defaultScope === 'all' ? 'single' : defaultScope,
  );

  const payCard = usePayByCard();
  const declareBT = useDeclareBankTransfer();
  const [bankReference, setBankReference] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const bankTransferRef = useRef<HTMLDivElement | null>(null);
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
  const isResolvingPaymentOptions = billingDefaultsLoading && open;
  const hasBalanceDue = total > 0;
  const hasBankTransfer = hasUsableBankTransferDetails(
    billingDefaults?.bankDetails,
  );
  const methods = useMemo(
    () =>
      !isResolvingPaymentOptions && hasBalanceDue
        ? QUOTE_PAYMENT_METHODS.filter(
            (m) => m !== PaymentMethod.BANK_TRANSFER || hasBankTransfer,
          )
        : [],
    [hasBalanceDue, hasBankTransfer, isResolvingPaymentOptions],
  );
  const activeMethod = methods.includes(method) ? method : methods[0] ?? null;
  // The practitioner applies the retenue on what they pay themselves; cash
  // is recorded by the clinic, which enters the choice there.
  const offersWithholding =
    rates.withholdingRate > 0 &&
    (activeMethod === PaymentMethod.CARD ||
      activeMethod === PaymentMethod.BANK_TRANSFER);
  const withholdingApplied = offersWithholding && applyWithholding;
  // Each installment is its own payment and facture: its own stamp, its
  // own retenue. `cash` is what the card is charged / what to wire.
  const charge = previewInstallmentCharges(
    targets.map((r) => r.amount),
    rates.stampDuty,
    rates.withholdingRate,
    withholdingApplied,
  );

  useEffect(() => {
    if (!open || activeMethod !== PaymentMethod.BANK_TRANSFER) return;

    const timer = window.setTimeout(() => {
      bankTransferRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeMethod, open]);

  const close = () => {
    setProgress(null);
    setBankReference('');
    setProofFile(null);
    setMethod(PaymentMethod.CARD);
    setScope(defaultScope === 'all' ? 'single' : defaultScope);
    setApplyWithholding(false);
    setAttemptConflict(false);
    onClose();
  };

  const submit = async () => {
    if (!activeMethod) return;

    if (activeMethod === PaymentMethod.CASH) {
      // Cash is admin-recorded. No doctor endpoint either way.
      toast.info(t('quoteUi.payDialog.cashToast'));
      close();
      return;
    }

    if (activeMethod === PaymentMethod.CARD) {
      setProgress({ done: 0, total: 1 });
      setAttemptConflict(false);
      try {
        const idempotencyKey =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${quote.id}-${installment.id}`;
        const session = await payCard.mutateAsync({
          quotationId: quote.id,
          installmentId: installment.id,
          idempotencyKey,
          orderId: quote.orderId,
          language: lang === 'en' ? 'en' : 'fr',
          applyWithholding: withholdingApplied,
        });
        setProgress({ done: 1, total: 1 });
        const verificationUrl = `/payment/return?paymentId=${encodeURIComponent(
          session.paymentId,
        )}`;
        window.location.assign(session.paymentUrl ?? verificationUrl);
      } catch (err) {
        setProgress(null);
        // The hook toasts the API error; an open attempt with the other
        // retenue choice also gets a plain explanation in the dialog. Any
        // other refusal (a transfer awaiting confirmation…) is the toast's.
        if (isWithholdingChoiceConflict(err)) setAttemptConflict(true);
      }
      return;
    }

    // Sequential loop — per-installment declarations so a retry on
    // the same row never double-charges, and we surface partial
    // progress to the doctor in case one tranche fails mid-way.
    setProgress({ done: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]!;
        // BANK_TRANSFER — one declaration per installment, same
        // reference + proof so the admin can match them to the
        // doctor's single bank wire.
        await declareBT.mutateAsync({
          quotationId: quote.id,
          installmentId: t.id,
          orderId: quote.orderId,
          bankReference: bankReference.trim() || undefined,
          proofFile,
          applyWithholding: withholdingApplied,
        });
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
      ? t('quoteUi.payDialog.scopeAllLabel', { count: payable.length })
      : t('quoteUi.payDialog.scopeSingleLabel', {
          n: installment.installmentNumber,
        });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        if (!next) close();
      }}
    >
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[900px] w-full max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:h-[90dvh] sm:max-w-[600px] lg:h-[82dvh] lg:max-w-[920px]">
        {/* ─── Header ─────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 space-y-1 border-b bg-card py-4 pl-5 pr-14 text-left sm:py-5 sm:pl-8 sm:pr-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold sm:text-xl">
                {t('quoteUi.payDialog.title', {
                  amount: money(charge.cash, quote.currency),
                })}
              </DialogTitle>
              <DialogDescription>
                {scope === 'all'
                  ? t('quoteUi.payDialog.descAll', { count: payable.length })
                  : t('quoteUi.payDialog.descSingle', {
                      n: installment.installmentNumber,
                    })}
              </DialogDescription>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 gap-1.5 border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
            >
              <Clock className="h-3 w-3" />
              {t('quoteUi.payDialog.dueBadge')}
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
            {/* What changes hands: the installment(s) + one stamp each -
                the retenue when ticked. The breakdown sits by the method. */}
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('quoteUi.payDialog.amountToPay')}
            </p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
              {money(charge.cash, quote.currency)}
            </p>
            <PriceIncludesTaxNote
              className="mt-1.5"
              tvaRate={rates.tvaRate}
              stamp={rates.stampDuty}
              currency={quote.currency}
            />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {scope === 'all'
                ? t('quoteUi.payDialog.asideAll', { count: payable.length })
                : t('quoteUi.payDialog.asideSingle', {
                    n: installment.installmentNumber,
                  })}
            </p>

            <h3 className="mb-4 mt-7 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('quoteUi.payDialog.summary')}
            </h3>
            <dl className="space-y-4">
              <DetailRow
                icon={<Hash className="h-3.5 w-3.5" />}
                label={t('quoteUi.payDialog.scope')}
                value={scopeLabel}
              />
              {scope === 'single' && installment.dueDate ? (
                <DetailRow
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label={t('quoteUi.payDialog.dueDate')}
                  value={format(new Date(installment.dueDate), 'MMM d, yyyy')}
                />
              ) : null}
              {quote.pack || quote.packName ? (
                <DetailRow
                  icon={<Package className="h-3.5 w-3.5" />}
                  label={t('quoteUi.payDialog.pack')}
                  value={
                    quote.pack
                      ? pickLocalized(
                          quote.pack.nameI18n ?? quote.pack.name,
                          lang,
                        ) || quote.pack.name
                      : (quote.packName as string)
                  }
                />
              ) : null}
              {patientName ? (
                <DetailRow
                  icon={<UserIcon className="h-3.5 w-3.5" />}
                  label={t('quoteUi.payDialog.patient')}
                  value={patientName}
                />
              ) : null}
              {doctorName ? (
                <DetailRow
                  icon={<Stethoscope className="h-3.5 w-3.5" />}
                  label={t('quoteUi.payDialog.doctor')}
                  value={`Dr. ${doctorName}`}
                />
              ) : null}
              {orderCode ? (
                <DetailRow
                  icon={<FileText className="h-3.5 w-3.5" />}
                  label={t('quoteUi.payDialog.order')}
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

            {/* Secure-payment reassurance — visible in the summary rail
                before the doctor picks a method / confirms. */}
            <div className="mt-6 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('quoteUi.payDialog.secureNote')}</span>
            </div>

            <div className="mt-auto pt-6">
              <p className="rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
                {activeMethod === PaymentMethod.CARD
                  ? t('quoteUi.payDialog.footCard')
                  : activeMethod === PaymentMethod.BANK_TRANSFER
                    ? t('quoteUi.payDialog.footBank')
                    : activeMethod === PaymentMethod.CASH
                      ? t('quoteUi.payDialog.footCash')
                      : t('quoteUi.payDialog.footDefault')}
              </p>
            </div>
          </aside>

          {/* Payment workspace */}
          <section
            aria-label={t('quoteUi.payDialog.sectionAria')}
            tabIndex={0}
            className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]"
          >
            <div className="space-y-5 p-5 sm:p-6 lg:p-7">
              {canPickAll ? (
                <div>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('quoteUi.payDialog.scopeHeading')}
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
                      <span className="block font-semibold">
                        {t('quoteUi.payDialog.thisInstallment')}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] opacity-80">
                        #{installment.installmentNumber} ·{' '}
                        {money(installment.amount, quote.currency)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={scope === 'all'}
                      onClick={() => setScope('all')}
                      disabled={
                        isPending || activeMethod === PaymentMethod.CARD
                      }
                      className={cn(
                        'min-w-0 rounded-md px-3 py-2.5 text-left text-xs transition',
                        scope === 'all'
                          ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                          : 'text-muted-foreground hover:bg-card/60',
                      )}
                    >
                      <span className="block font-semibold">
                        {t('quoteUi.payDialog.allRemaining')}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] opacity-80">
                        {t('quoteUi.payDialog.installmentsCount', {
                          count: payable.length,
                        })}{' '}
                        ·{' '}
                        {money(
                          sumAmounts(payable.map((r) => r.amount)),
                          quote.currency,
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              {methods.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('quoteUi.payDialog.methodHeading')}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {methods.map((m) => {
                      const isSelected = activeMethod === m;
                      const Icon =
                        m === PaymentMethod.CARD
                          ? CreditCard
                          : m === PaymentMethod.BANK_TRANSFER
                            ? Landmark
                            : Wallet;
                      const description =
                        m === PaymentMethod.CARD
                          ? t('quoteUi.payDialog.methodCardDesc')
                          : m === PaymentMethod.BANK_TRANSFER
                            ? t('quoteUi.payDialog.methodBankDesc')
                            : t('quoteUi.payDialog.methodCashDesc');
                      return (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            setMethod(m);
                            if (m === PaymentMethod.CARD) setScope('single');
                          }}
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
                              isSelected &&
                                'bg-primary text-primary-foreground',
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold">
                              {t(`paymentsCommon.method.${m}`)}
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
              ) : null}

              {/* The breakdown: installment(s) TTC, one stamp each, the
                  retenue when ticked (card and transfer only: cash is
                  recorded by the clinic with the choice made there). */}
              {activeMethod && !isResolvingPaymentOptions ? (
                <WithholdingChoice
                  rate={rates.withholdingRate}
                  offer={offersWithholding}
                  checked={applyWithholding}
                  onCheckedChange={(checked) => {
                    setApplyWithholding(checked);
                    setAttemptConflict(false);
                  }}
                  charge={charge}
                  kind={scope === 'all' ? 'installments' : 'installment'}
                  currency={quote.currency}
                  disabled={isPending}
                  netLabel={
                    activeMethod === PaymentMethod.BANK_TRANSFER
                      ? t('withholdingUi.toTransfer')
                      : undefined
                  }
                />
              ) : null}

              {isResolvingPaymentOptions || methods.length === 0 ? (
                <PaymentOptionNotice
                  hasBalanceDue={hasBalanceDue}
                  isLoading={isResolvingPaymentOptions}
                />
              ) : activeMethod === PaymentMethod.CARD ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                    <div>
                      <p className="text-sm font-semibold text-blue-950">
                        {t('quoteUi.payDialog.cardTitle')}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-blue-900/80">
                        {scope === 'all'
                          ? t('quoteUi.payDialog.cardAllDesc')
                          : t('quoteUi.payDialog.cardSingleDesc')}
                      </p>
                    </div>
                  </div>
                </div>
              ) : activeMethod === PaymentMethod.BANK_TRANSFER ? (
                <div ref={bankTransferRef} className="scroll-mt-4">
                <Card id="installment-bank-transfer">
                  <CardContent className="space-y-4 pt-5">
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Landmark className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          {t('quoteUi.payDialog.btTitle')}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {t('quoteUi.payDialog.btDesc')}
                        </p>
                      </div>
                    </div>

                    {/* The amount to wire: stamps included, net of the
                        retenue when applied. */}
                    <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('quoteUi.payDialog.btAmountLabel')}
                        </span>
                        <span className="text-base font-semibold tabular-nums">
                          {money(charge.cash, quote.currency)}
                        </span>
                      </div>
                      {charge.stamp > 0 || charge.withholding > 0 ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {charge.stamp > 0 && charge.withholding > 0
                            ? t('quoteUi.payDialog.btAmountStampWithholding', {
                                stamp: money(charge.stamp, quote.currency),
                                amount: money(charge.withholding, quote.currency),
                              })
                            : charge.stamp > 0
                              ? t('quoteUi.payDialog.btAmountStamp', {
                                  stamp: money(charge.stamp, quote.currency),
                                })
                              : t('quoteUi.payDialog.btAmountWithholding', {
                                  amount: money(charge.withholding, quote.currency),
                                })}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid gap-1.5">
                      <Label
                        htmlFor="installment-bank-reference"
                        className="text-xs font-medium"
                      >
                        {t('quoteUi.payDialog.bankRefLabel')}{' '}
                        <span className="font-normal text-muted-foreground">
                          {t('quoteUi.payDialog.optionalSuffix')}
                        </span>
                      </Label>
                      <Input
                        id="installment-bank-reference"
                        value={bankReference}
                        onChange={(e) => setBankReference(e.target.value)}
                        placeholder={t('quoteUi.payDialog.bankRefPlaceholder')}
                        disabled={isPending}
                      />
                    </div>

                    <div className="space-y-2">
                      <div>
                        <p className="text-xs font-medium">
                          {t('quoteUi.payDialog.uploadReceiptTitle')}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t('quoteUi.payDialog.uploadReceiptHint')}
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
                              : t('quoteUi.payDialog.chooseReceipt')}
                          </span>
                        </label>
                        {proofFile ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t('quoteUi.payDialog.removeReceiptAria')}
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
                          {t('quoteUi.payDialog.receiptPreview')}
                        </p>
                        {proofPreview &&
                        ['image/png', 'image/jpeg', 'image/webp'].includes(
                          proofFile.type,
                        ) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={proofPreview}
                            alt={t('quoteUi.payDialog.receiptAlt')}
                            className="max-h-[280px] w-full rounded-lg border bg-muted/30 object-contain"
                          />
                        ) : proofPreview &&
                          proofFile.type === 'application/pdf' ? (
                          <iframe
                            title={t('quoteUi.payDialog.receiptAlt')}
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
                        ? t('quoteUi.payDialog.btNoteAll', {
                            count: payable.length,
                          })
                        : t('quoteUi.payDialog.btNoteSingle')}
                    </p>
                  </CardContent>
                </Card>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-sm font-semibold text-amber-950">
                        {t('quoteUi.payDialog.cashTitle')}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                        {t('quoteUi.payDialog.cashDesc')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {attemptConflict ? (
                <p
                  role="alert"
                  className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"
                >
                  {t('withholdingUi.choiceConflict')}
                </p>
              ) : null}

              {progress ? (
                <div
                  role="status"
                  className="flex items-center gap-2 rounded-lg border bg-card p-3 text-xs"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  {t('quoteUi.payDialog.progress', {
                    done: progress.done,
                    total: progress.total,
                  })}
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
            className="h-11 w-full sm:h-9 sm:w-auto"
          >
            {activeMethod ? t('common.cancel') : t('common.close')}
          </Button>
          {activeMethod ? (
            <Button
              onClick={submit}
              disabled={isPending}
              className="h-11 w-full gap-1.5 font-medium shadow-sm sm:h-9 sm:min-w-[180px] sm:w-auto"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : activeMethod === PaymentMethod.CARD ? (
                <CreditCard className="h-4 w-4" />
              ) : activeMethod === PaymentMethod.BANK_TRANSFER ? (
                <Send className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {activeMethod === PaymentMethod.CARD
                ? scope === 'all'
                  ? t('quoteUi.payDialog.payTranches', {
                      count: payable.length,
                    })
                  : t('quoteUi.payDialog.payByCard', {
                      amount: money(charge.cash, quote.currency),
                    })
                : activeMethod === PaymentMethod.BANK_TRANSFER
                  ? scope === 'all'
                    ? t('quoteUi.payDialog.submitDeclarations', {
                        count: payable.length,
                      })
                    : t('quoteUi.payDialog.submitDeclaration')
                  : t('quoteUi.payDialog.gotIt')}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaymentOptionNotice({
  hasBalanceDue,
  isLoading,
}: {
  hasBalanceDue: boolean;
  isLoading: boolean;
}) {
  const { t } = useT();
  return (
    <Card
      className={
        isLoading
          ? 'border-border bg-muted/30'
          : hasBalanceDue
            ? 'border-amber-200 bg-amber-50/50'
            : 'border-emerald-200 bg-emerald-50/50'
      }
    >
      <CardContent className="flex items-start gap-3 pt-4 text-sm">
        {isLoading ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : hasBalanceDue ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        )}
        <div className="space-y-1">
          <p
            className={cn(
              'font-medium',
              isLoading
                ? 'text-foreground'
                : hasBalanceDue
                  ? 'text-amber-900'
                  : 'text-emerald-900',
            )}
          >
            {isLoading
              ? t('common.loading')
              : hasBalanceDue
                ? t('quoteUi.payDialog.noAvailableMethodsTitle')
                : t('quoteUi.payDialog.noBalanceTitle')}
          </p>
          <p
            className={cn(
              'text-xs',
              isLoading
                ? 'text-muted-foreground'
                : hasBalanceDue
                  ? 'text-amber-800/90'
                  : 'text-emerald-800/90',
            )}
          >
            {isLoading
              ? t('quoteUi.payDialog.loadingOptionsDesc')
              : hasBalanceDue
                ? t('quoteUi.payDialog.noAvailableMethodsDesc')
                : t('quoteUi.payDialog.noBalanceDesc')}
          </p>
        </div>
      </CardContent>
    </Card>
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
