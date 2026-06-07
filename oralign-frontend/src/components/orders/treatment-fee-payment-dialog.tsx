'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Landmark,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  useBillingPublicDefaults,
  usePayTreatmentFee,
  useUploadTreatmentFeeProof,
} from '@/lib/hooks';
import type { BankDetails, DentalOrder } from '@/lib/types';

type MethodKey = 'card' | 'bank_transfer' | 'cash';

interface MethodConfig {
  key: MethodKey;
  label: string;
  description: string;
  icon: typeof CreditCard;
  adminOnly?: boolean;
}

/**
 * The three options visible inside the dialog. Order matches the user
 * spec: Bank transfer → Card → Cash. Cash is admin-only and is
 * filtered out for the doctor view because cash collection happens
 * in-clinic and gets recorded by the admin.
 */
const METHODS: MethodConfig[] = [
  {
    key: 'bank_transfer',
    label: 'Bank transfer',
    description:
      'Transfer to the clinic account, then upload your receipt. An admin will confirm once the funds land.',
    icon: Landmark,
  },
  {
    key: 'card',
    label: 'Card payment',
    description:
      'Pay online instantly. We currently use a mock collector — the order is marked paid immediately on success.',
    icon: CreditCard,
  },
  {
    key: 'cash',
    label: 'Cash (admin)',
    description:
      'Recorded in-clinic by an admin. Stamps the fee as paid right away.',
    icon: Banknote,
    adminOnly: true,
  },
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
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pay treatment fee</DialogTitle>
          <DialogDescription>
            Order <span className="font-medium">{order.orderCode}</span> needs
            the professional fee settled before the treatment plan can be
            prepared.
          </DialogDescription>
        </DialogHeader>

        {/* Amount strip */}
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
          <span className="text-sm text-muted-foreground">Amount due</span>
          <span className="text-xl font-bold tabular-nums">
            {amount} {currency}
          </span>
        </div>

        {/*
          Step 1 — payment method.

          Two states:
          • No selection → full description tiles so the doctor learns
            what each method does (most users only pick once).
          • A method picked → collapse to a compact strip ("Bank
            transfer ✓  [Change]") so the bank-instructions + receipt
            upload below get the vertical real estate they need on
            mobile. Hitting Change re-renders the full picker.
         */}
        {selected ? (
          <SelectedMethodStrip
            method={METHODS.find((m) => m.key === selected)!}
            disabled={busy}
            onChange={() => setSelected(null)}
          />
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">Payment method</p>
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
                      <p className="text-sm font-semibold">{m.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {m.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/*
          Step 2 (bank transfer only) — show the clinic's bank account
          details so the doctor knows where to wire the money. This is
          the same data the admin enters under /account/billing-settings;
          we read it through the doctor-safe public-defaults endpoint so
          it stays in lockstep with the admin form.

          UX rationale: bank instructions come BEFORE the receipt upload
          because the doctor needs the IBAN/SWIFT to execute the transfer
          first; the receipt only exists after that.
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

        {/* Step 2 (bank transfer only) — receipt upload affordance */}
        {isBankTransferSelected && (
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div>
                <p className="text-sm font-medium">
                  Upload bank-transfer receipt
                </p>
                <p className="text-xs text-muted-foreground">
                  Once the wire is sent, upload the bank&apos;s receipt /
                  proof. Accepted: PDF, JPG, PNG · max 10 MB.
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
                  {proofFile ? proofFile.name : 'Click to pick a file'}
                </span>
                {proofFile && (
                  <button
                    type="button"
                    aria-label="Remove file"
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
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </CardContent>
          </Card>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {isBankTransferSelected ? (
            <Button
              type="button"
              disabled={busy || !proofFile}
              onClick={handleBankTransferUpload}
              className="gap-2"
            >
              {uploadProof.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Upload receipt
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || !selected}
              onClick={handleInstantPay}
              className="gap-2"
            >
              {pay.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {selected === 'cash' ? 'Record cash payment' : `Pay ${amount} ${currency}`}
            </Button>
          )}
        </DialogFooter>
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
              Bank account not configured yet
            </p>
            <p className="text-xs text-amber-800/90">
              The clinic admin needs to fill in the bank details under{' '}
              <span className="font-medium">
                Account → Billing settings
              </span>{' '}
              before bank transfers can be paid this way. Please contact
              support — or pick Card / Cash instead.
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
              Where to send the money
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Copy each field into your bank app. Include the payment
              reference so we can match the wire to your order.
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
            <CopyableRow label="Beneficiary" value={beneficiary} />
          )}
          {beneficiaryAddress && (
            <CopyableRow label="Address" value={beneficiaryAddress} />
          )}
          {bankDetails.bankName && (
            <CopyableRow label="Bank" value={bankDetails.bankName} />
          )}
          {bankDetails.accountName && (
            <CopyableRow
              label="Account holder"
              value={bankDetails.accountName}
            />
          )}
          {bankDetails.iban && (
            <CopyableRow label="IBAN" value={bankDetails.iban} mono />
          )}
          {bankDetails.rib && (
            <CopyableRow label="RIB" value={bankDetails.rib} mono />
          )}
          {bankDetails.swift && (
            <CopyableRow
              label="SWIFT / BIC"
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
            label="Amount to transfer"
            value={`${amount} ${currency}`}
            // Money goes one step bigger than the reference — eyes
            // should land here first when scanning the panel.
            valueClassName="text-base tabular-nums"
          />
          <HighlightCard
            label="Payment reference"
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
  const Icon = method.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 px-3 py-2 ring-2 ring-primary/10">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-white">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {method.label}
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {method.description}
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
        Change
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
        {copyable && (
          <CopyButton value={value} successLabel={`${label} copied`} />
        )}
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
      <CopyButton value={value} successLabel={`${label} copied`} />
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
  successLabel,
  size = 'icon',
}: {
  value: string;
  successLabel: string;
  size?: 'icon' | 'sm';
}) {
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
      toast.success(successLabel);
      window.setTimeout(() => setJustCopied(false), 1500);
    } catch {
      toast.error('Could not copy — please copy manually.');
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
      aria-label={`Copy ${successLabel.replace(' copied', '')}`}
    >
      {justCopied ? (
        <Check className="h-4 w-4 text-emerald-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {size === 'sm' && (
        <span className="text-xs">
          {justCopied ? 'Copied' : 'Copy'}
        </span>
      )}
    </Button>
  );
}
