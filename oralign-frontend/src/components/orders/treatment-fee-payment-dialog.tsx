'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  FileText,
  Landmark,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';
import { useT } from '@/lib/i18n/lang-context';
import {
  useBillingPublicDefaults,
  usePayTreatmentFee,
  useUploadTreatmentFeeProof,
} from '@/lib/hooks';
import type { BankDetails, DentalOrder } from '@/lib/types';

type MethodKey = 'card' | 'bank_transfer' | 'cash';

interface MethodConfig {
  key: MethodKey;
  icon: typeof CreditCard;
  adminOnly?: boolean;
}

/**
 * The three options visible inside the dialog. Order matches the user
 * spec: Bank transfer → Card → Cash. Cash is admin-only and is
 * filtered out for the doctor view because cash collection happens
 * in-clinic and gets recorded by the admin.
 *
 * Labels + descriptions live in the dictionary under
 * `feeUi.methods.<key>` and are resolved with t() at render time
 * (module scope can't call hooks).
 */
const METHODS: MethodConfig[] = [
  { key: 'bank_transfer', icon: Landmark },
  { key: 'card', icon: CreditCard },
  { key: 'cash', icon: Banknote, adminOnly: true },
];

/**
 * Treatment-fee payment dialog.
 *
 * UX flow:
 *  1. Order is submitted → parent surfaces this dialog
 *  2. User picks one of the three method tiles
 *  3a. Card / Cash → single "Confirm" button → backend stamps paidAt
 *  3b. Bank transfer → step 2 of the dialog asks for the receipt file,
 *     uploading flips the status to `awaiting_confirmation`. Admin
 *     confirms separately via the order detail page banner.
 *
 * Closing rules:
 *  • Card / Cash success → dialog closes automatically.
 *  • Bank transfer receipt upload → dialog closes; the order banner
 *    keeps the user informed that admin confirmation is pending.
 *  • Esc / overlay click → closes only when no request is in flight.
 */
export function TreatmentFeePaymentDialog({
  open,
  onOpenChange,
  order,
  isAdmin,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  order: DentalOrder;
  /** Drives whether the Cash tile is shown — it's admin-only. */
  isAdmin: boolean;
  /** Fired after a terminal success so the parent can navigate. */
  onPaid?: () => void;
}) {
  const { t } = useT();
  // Doctor-safe defaults endpoint. The previous version called
  // `useCompanyBilling()` which hits `/admin/company-billing-settings`
  // and returned 403 for dentists, so the modal silently showed 0
  // TND. The dedicated `/company-billing-settings/public-defaults`
  // route returns only the two fields we need (fee + currency) and
  // is callable by dentist + admin.
  const { data: defaults } = useBillingPublicDefaults();
  const pay = usePayTreatmentFee();
  const uploadProof = useUploadTreatmentFeeProof();

  // Settings-driven amount + currency so the doctor sees what the
  // admin set under /account/billing-settings, not a stale hard-coded
  // value. We fall back to a snapshot already stamped on the order
  // (e.g. for an order created when the fee was different) and then
  // to zero.
  const amount =
    defaults?.defaultTreatmentFee ?? order.treatmentFeeAmount ?? 0;
  const currency = defaults?.defaultCurrency ?? 'TND';
  const bankDetails = defaults?.bankDetails ?? null;
  const beneficiary = defaults?.companyName ?? null;
  // City + address rolled into a single beneficiary-address line so
  // we don't render an empty row when only one of the two is filled.
  const beneficiaryAddress =
    [defaults?.companyAddress, defaults?.companyCity]
      .filter((v): v is string => !!v && v.trim().length > 0)
      .join(', ') || null;

  // Filter methods by role (doctor doesn't see Cash).
  const methods = useMemo(
    () => METHODS.filter((m) => !m.adminOnly || isAdmin),
    [isAdmin],
  );

  const [selected, setSelected] = useState<MethodKey | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  // Object-URL preview so the doctor can eyeball the receipt before
  // submitting. Derived from the file (not effect-driven state, which
  // would cascade renders); the effect below only revokes it when the
  // file changes or the dialog unmounts so we never leak blob URLs.
  const proofPreview = useMemo(
    () => (proofFile ? URL.createObjectURL(proofFile) : null),
    [proofFile],
  );
  useEffect(() => {
    if (!proofPreview) return;
    return () => URL.revokeObjectURL(proofPreview);
  }, [proofPreview]);

  const busy = pay.isPending || uploadProof.isPending;

  // Card / Cash → single backend call, stamps paidAt and closes.
  const handleInstantPay = () => {
    if (!selected || selected === 'bank_transfer') return;
    pay.mutate(
      { id: order.id, method: selected, amount },
      {
        onSuccess: () => {
          onPaid?.();
          onOpenChange(false);
        },
      },
    );
  };

  // Bank transfer → two-step. Step 1: record intent (backend logs
  // `awaiting_confirmation`). Step 2: upload proof file.
  const handleBankTransferUpload = () => {
    if (!proofFile) return;
    uploadProof.mutate(
      { id: order.id, proof: proofFile, amount },
      {
        onSuccess: () => {
          onPaid?.();
          onOpenChange(false);
        },
      },
    );
  };

  const isBankTransferSelected = selected === 'bank_transfer';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return; // Prevent close while a request is in flight
        if (!next) {
          setSelected(null);
          setProofFile(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[900px] w-full flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:h-[90dvh] sm:max-w-[600px] lg:h-[82dvh] lg:max-w-[920px]">
        {/* ─── Header ─────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 space-y-1 border-b bg-card px-6 py-5 text-left sm:px-8">
          <DialogTitle className="text-lg font-semibold sm:text-xl">
            {t('feeUi.payDialog.title')}
          </DialogTitle>
          <DialogDescription className="truncate font-mono text-xs text-muted-foreground">
            {t('feeUi.payDialog.orderCode', { code: order.orderCode })}
          </DialogDescription>
        </DialogHeader>

        {/*
          ─── Body: summary rail (left) + payment flow (right) ───
          A CSS grid whose tracks use minmax(0,1fr): the 0 floor lets
          each column shrink below its content, so the flow column
          scrolls on its own when the bank details + receipt upload run
          long (a plain flex child would grow past the frame and get
          clipped instead of scrolling). Below lg the rail stacks on top
          of the flow.
         */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] lg:grid lg:grid-cols-[38%_minmax(0,1fr)] lg:overflow-hidden">
          {/* Summary rail — stable context, fixed 38% on desktop */}
          <aside className="flex flex-col border-b bg-muted/30 p-5 sm:p-6 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('feeUi.payDialog.amountDue')}
            </p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
              {formatPrice(amount, currency)}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t('feeUi.payDialog.feeIntro')}
            </p>

            {/* Secure-payment reassurance — visible next to the amount so
                the payer sees it before choosing a method. */}
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('feeUi.payDialog.secureNote')}</span>
            </div>

            <div className="mt-auto pt-6">
              <p className="rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
                {isBankTransferSelected
                  ? t('feeUi.payDialog.footnoteBank')
                  : t('feeUi.payDialog.footnoteDefault')}
              </p>
            </div>
          </aside>

          {/* Payment flow — method picker → bank details → receipt */}
          <div
            role="region"
            aria-label={t('feeUi.payDialog.regionAria')}
            tabIndex={0}
            className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]"
          >
            {/*
              Keep the payment steps in normal document flow. Making this
              wrapper a flex column allows its cards to shrink to the
              viewport height, which clips the receipt uploader without
              producing any scrollable overflow.
             */}
            <div className="space-y-4 p-5 sm:p-6 lg:p-7">
              {/*
                Step 1 — payment method. No selection → full description
                tiles so the doctor learns what each method does; a method
                picked → a compact strip with a Change button so the steps
                below get the room they need.
               */}
              {selected ? (
                <SelectedMethodStrip
                  method={METHODS.find((m) => m.key === selected)!}
                  disabled={busy}
                  onChange={() => setSelected(null)}
                />
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {t('feeUi.payDialog.methodHeading')}
                  </p>
                  <div className="grid gap-2">
                    {methods.map((m) => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          disabled={busy}
                          onClick={() => setSelected(m.key)}
                          className={cn(
                            'flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition',
                            'hover:border-primary/70',
                            'disabled:cursor-not-allowed disabled:opacity-60',
                          )}
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-foreground">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">
                              {t(`feeUi.methods.${m.key}.label`)}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {t(`feeUi.methods.${m.key}.description`)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/*
                Step 2 (bank transfer only) — the clinic's bank details
                come BEFORE the receipt upload: the doctor needs the
                IBAN/SWIFT to wire first; the receipt only exists after.
               */}
              {isBankTransferSelected && (
                <BankTransferInstructions
                  bankDetails={bankDetails}
                  beneficiary={beneficiary}
                  beneficiaryAddress={beneficiaryAddress}
                  amount={amount}
                  currency={currency}
                  paymentReference={order.orderCode}
                />
              )}

              {isBankTransferSelected && (
                <Card id="bank-transfer-receipt" className="scroll-mt-4">
                  <CardContent className="space-y-3 pt-4">
                    <div>
                      <p className="text-sm font-medium">
                        {t('feeUi.payDialog.uploadReceiptTitle')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('feeUi.payDialog.uploadReceiptHint')}
                      </p>
                    </div>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-muted/30 p-3',
                        'hover:bg-muted/50',
                        busy && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate text-sm">
                        {proofFile
                          ? proofFile.name
                          : t('feeUi.payDialog.pickFile')}
                      </span>
                      {proofFile && (
                        <button
                          type="button"
                          aria-label={t('feeUi.payDialog.removeFileAria')}
                          onClick={(e) => {
                            e.preventDefault();
                            setProofFile(null);
                          }}
                          className="rounded p-1 hover:bg-muted"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        disabled={busy}
                        onChange={(e) =>
                          setProofFile(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>

                    {/*
                      Receipt preview — let the doctor verify they picked
                      the right file before it's submitted. Image → inline
                      thumbnail; PDF → inline frame; anything else → a
                      filename tile.
                     */}
                    {proofFile && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('feeUi.payDialog.previewConfirm')}
                        </p>
                        {proofPreview && proofFile.type.startsWith('image/') ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={proofPreview}
                            alt={t('feeUi.payDialog.previewAlt')}
                            className="max-h-[320px] w-full rounded-lg border bg-muted/30 object-contain"
                          />
                        ) : proofPreview &&
                          proofFile.type === 'application/pdf' ? (
                          <iframe
                            title={t('feeUi.payDialog.previewAlt')}
                            src={proofPreview}
                            className="h-[360px] w-full rounded-lg border bg-white"
                          />
                        ) : (
                          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="truncate">{proofFile.name}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>

        {/* ─── Footer ─────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-2.5 border-t bg-card px-6 py-4 sm:px-8">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          {isBankTransferSelected ? (
            <Button
              type="button"
              disabled={busy || !proofFile}
              onClick={handleBankTransferUpload}
              className="gap-2"
            >
              {uploadProof.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('feeUi.payDialog.uploadReceiptBtn')}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || !selected}
              onClick={handleInstantPay}
              className="gap-2"
            >
              {pay.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {selected === 'cash'
                ? t('feeUi.payDialog.recordCashBtn')
                : t('feeUi.payDialog.payAmountBtn', {
                    amount: `${amount} ${currency}`,
                  })}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Bank-transfer sub-components
// ─────────────────────────────────────────────────────────────────────

/**
 * "Where to send the money" panel. Renders the company's bank-transfer
 * destination — beneficiary, bank name, IBAN, RIB, SWIFT — each row
 * carrying a copy-to-clipboard button because the doctor will paste
 * these values into their bank app. Also surfaces the order code as
 * the payment reference so the admin can match the wire to the order.
 *
 * Falls back to an amber alert when the admin hasn't filled in the
 * bank details yet, so the user gets a clear next step instead of an
 * empty card.
 */
function BankTransferInstructions({
  bankDetails,
  beneficiary,
  beneficiaryAddress,
  amount,
  currency,
  paymentReference,
}: {
  bankDetails: BankDetails | null;
  beneficiary: string | null;
  beneficiaryAddress: string | null;
  amount: number;
  currency: string;
  paymentReference: string;
}) {
  const { t } = useT();
  // Empty-state — admin hasn't configured the bank account yet. We
  // surface this as a warning rather than silently rendering an empty
  // card so the doctor knows to contact support before wiring blind.
  if (!bankDetails) {
    return (
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="flex items-start gap-3 pt-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="font-medium text-amber-900">
              {t('feeUi.bank.notConfiguredTitle')}
            </p>
            <p className="text-xs text-amber-800/90">
              {t('feeUi.bank.notConfiguredBefore')}{' '}
              <span className="font-medium">
                {t('feeUi.bank.notConfiguredPath')}
              </span>{' '}
              {t('feeUi.bank.notConfiguredAfter')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start gap-2">
          <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {t('feeUi.bank.whereTitle')}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('feeUi.bank.whereDesc')}
            </p>
          </div>
        </div>

        {/*
          Bank-account block. Each row is a self-contained
          label/value/copy unit that lays out flat when the value is
          short and stacks the value below the label when the value
          is long (IBAN / RIB / SWIFT). `break-all` keeps long mono
          strings inside the card no matter the dialog width.
         */}
        <div className="divide-y rounded-lg border bg-muted/30">
          {beneficiary && (
            <CopyableRow label={t('feeUi.bank.beneficiary')} value={beneficiary} />
          )}
          {beneficiaryAddress && (
            <CopyableRow label={t('feeUi.bank.address')} value={beneficiaryAddress} />
          )}
          {bankDetails.bankName && (
            <CopyableRow label={t('feeUi.bank.bankName')} value={bankDetails.bankName} />
          )}
          {bankDetails.accountName && (
            <CopyableRow
              label={t('feeUi.bank.accountHolder')}
              value={bankDetails.accountName}
            />
          )}
          {bankDetails.iban && (
            <CopyableRow label={t('feeUi.bank.iban')} value={bankDetails.iban} mono />
          )}
          {bankDetails.rib && (
            <CopyableRow label={t('feeUi.bank.rib')} value={bankDetails.rib} mono />
          )}
          {bankDetails.swift && (
            <CopyableRow
              label={t('feeUi.bank.swift')}
              value={bankDetails.swift}
              mono
            />
          )}
        </div>

        {/*
          The two fields most commonly fat-fingered: amount + order
          code as wire reference. We give them their own primary-tinted
          panel with the copy button on the SAME LINE as the label, and
          the value on its own row beneath at full card width — that
          way a long order code (e.g. "Ahlem_r9i9_20260607-02") wraps
          cleanly instead of overflowing the cell.
         */}
        <div className="grid gap-2 sm:grid-cols-2">
          <HighlightCard
            label={t('feeUi.bank.amountToTransfer')}
            value={`${amount} ${currency}`}
            // Money goes one step bigger than the reference — eyes
            // should land here first when scanning the panel.
            valueClassName="text-base tabular-nums"
          />
          <HighlightCard
            label={t('feeUi.bank.paymentReference')}
            value={paymentReference}
            valueClassName="font-mono break-all"
            copyable
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact "selected method" strip. Replaces the full picker once the
 * user has chosen a method so the dialog body can give vertical real
 * estate to the bank-instructions + receipt-upload steps. Hitting
 * Change re-renders the full picker.
 */
function SelectedMethodStrip({
  method,
  disabled,
  onChange,
}: {
  method: MethodConfig;
  disabled?: boolean;
  onChange: () => void;
}) {
  const { t } = useT();
  const Icon = method.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 px-3 py-2 ring-2 ring-primary/10">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-white">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {t(`feeUi.methods.${method.key}.label`)}
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {t(`feeUi.methods.${method.key}.description`)}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={onChange}
        className="shrink-0 text-xs"
      >
        {t('feeUi.payDialog.changeBtn')}
      </Button>
    </div>
  );
}

/**
 * Primary-tinted call-out card for the two critical fields (amount +
 * payment reference). The label sits on its own row with an optional
 * copy button beside it, and the value lives on a second row at full
 * card width — long values get `break-all` so they wrap inside the
 * card instead of overflowing.
 */
function HighlightCard({
  label,
  value,
  valueClassName,
  copyable,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  copyable?: boolean;
}) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
          {label}
        </p>
        {copyable && <CopyButton value={value} label={label} />}
      </div>
      <p
        className={cn(
          'mt-1 text-sm font-bold leading-snug text-primary',
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * One row inside the bank-details block.
 *
 * Layout shape — never overflows, regardless of value length:
 *   ┌────────────────────────────────┬──────┐
 *   │ LABEL (uppercase, muted)       │  📋  │
 *   │ Value (full width, break-all)  │      │
 *   └────────────────────────────────┴──────┘
 *
 * The label + copy sit on the top line so the copy target stays
 * reachable even when the value wraps onto multiple lines. `mono`
 * switches the value to a monospaced font so digits in IBAN / RIB /
 * SWIFT line up.
 */
function CopyableRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            // `break-all` is the right call for IBAN/RIB/SWIFT: those
            // are atomic strings (no spaces) that would otherwise
            // overflow the parent. For regular labelled values
            // (Beneficiary, Address) the same rule is harmless —
            // browsers only break when the line genuinely can't fit.
            'mt-0.5 break-all text-sm leading-snug text-foreground',
            mono && 'font-mono tracking-tight',
          )}
          title={value}
        >
          {value}
        </p>
      </div>
      <CopyButton value={value} label={label} />
    </div>
  );
}

/**
 * One-shot copy-to-clipboard button. Shows a checkmark for 1.5 s after
 * a successful copy so the user gets immediate visual confirmation in
 * addition to the toast. Falls back to a manual `execCommand` shim on
 * insecure contexts (older browsers / non-HTTPS dev hosts) since the
 * Clipboard API is gated behind a secure context.
 */
function CopyButton({
  value,
  label,
  size = 'icon',
}: {
  value: string;
  /** Field name (already translated) — used in the toast + aria-label. */
  label: string;
  size?: 'icon' | 'sm';
}) {
  const { t } = useT();
  const [justCopied, setJustCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(value);
      } else {
        // Legacy fallback for non-HTTPS dev origins. Creates a
        // hidden textarea, selects it, and triggers the deprecated
        // execCommand('copy'). Older browsers / Cypress / etc.
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setJustCopied(true);
      toast.success(t('feeUi.bank.copiedToast', { label }));
      window.setTimeout(() => setJustCopied(false), 1500);
    } catch {
      toast.error(t('feeUi.bank.copyError'));
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={size === 'icon' ? 'icon' : 'sm'}
      // Sized for touch: icon = 36 × 36 px (square, hits the iOS
      // minimum at the corners and is comfortable on Android too).
      // Text + icon variant stays slim so it fits next to a label
      // inside the highlight cards.
      className={cn(
        'shrink-0',
        size === 'icon' && 'h-9 w-9',
        size === 'sm' && 'h-8 gap-1 px-2',
      )}
      onClick={handleCopy}
      aria-label={t('feeUi.bank.copyAria', { label })}
    >
      {justCopied ? (
        <Check className="h-4 w-4 text-emerald-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {size === 'sm' && (
        <span className="text-xs">
          {justCopied ? t('feeUi.bank.copied') : t('feeUi.bank.copy')}
        </span>
      )}
    </Button>
  );
}
