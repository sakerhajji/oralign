'use client';

/**
 * "Where to send the money" for a bank transfer: the company's bank
 * details from the billing settings (beneficiary, bank, IBAN, RIB, SWIFT),
 * the amount to wire and the payment reference, each with a copy button.
 * One component for every bank transfer the practitioner makes (treatment
 * fee, pack installments), so both always show the same account.
 */

import { useState } from 'react';
import { AlertTriangle, Check, Copy, Landmark } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';
import { useT } from '@/lib/i18n/lang-context';
import type { BillingPublicDefaults } from '@/lib/api/company-billing.service';
import type { BankDetails } from '@/lib/types';

/** Beneficiary and its address line, from the public billing defaults. */
export function transferBeneficiary(
  defaults: Pick<BillingPublicDefaults, 'companyName' | 'companyAddress' | 'companyCity'> | null | undefined,
): { beneficiary: string | null; beneficiaryAddress: string | null } {
  // City + address in one line, so an empty row never shows when only
  // one of the two is filled.
  const beneficiaryAddress =
    [defaults?.companyAddress, defaults?.companyCity]
      .filter((v): v is string => !!v && v.trim().length > 0)
      .join(', ') || null;
  return { beneficiary: defaults?.companyName ?? null, beneficiaryAddress };
}


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
export function BankTransferInstructions({
  bankDetails,
  beneficiary,
  beneficiaryAddress,
  amount,
  amountNote,
  currency,
  paymentReference,
}: {
  bankDetails: BankDetails | null;
  beneficiary: string | null;
  beneficiaryAddress: string | null;
  /** What to transfer: the amount due + the stamp - any retenue. */
  amount: number;
  /** "1 000,000 TND dus + 1,000 TND de timbre − 10,000 TND de retenue". */
  amountNote?: string;
  currency: string;
  /** Written on the wire so the admin can match it; hidden when unknown. */
  paymentReference?: string | null;
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
        <div className={cn('grid gap-2', paymentReference && 'sm:grid-cols-2')}>
          <HighlightCard
            label={t('feeUi.bank.amountToTransfer')}
            value={formatPrice(amount, currency)}
            note={amountNote}
            // Money goes one step bigger than the reference — eyes
            // should land here first when scanning the panel.
            valueClassName="text-base tabular-nums"
          />
          {paymentReference ? (
            <HighlightCard
              label={t('feeUi.bank.paymentReference')}
              value={paymentReference}
              valueClassName="font-mono break-all"
              copyable
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
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
  note,
  valueClassName,
  copyable,
}: {
  label: string;
  value: string;
  /** One muted line under the value. */
  note?: string;
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
      {note && <p className="mt-0.5 text-[11px] leading-snug text-primary/80">{note}</p>}
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
