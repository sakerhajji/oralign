'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  FilePen,
  FileText,
  Landmark,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  isWithholdingChoiceConflict,
  PriceIncludesTaxNote,
  WithholdingChoice,
} from '@/components/payments/withholding';
import { previewPaymentCharge } from '@/lib/billing/tax-split';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';
import { useT } from '@/lib/i18n/lang-context';
import { hasUsableBankTransferDetails } from '@/lib/payments/bank-transfer';
import {
  BankTransferInstructions,
  transferBeneficiary,
} from '@/components/payments/bank-transfer-instructions';
import {
  useBillingPublicDefaults,
  useCreateTreatmentFeeCardSession,
  usePayTreatmentFee,
  useUploadTreatmentFeeProof,
} from '@/lib/hooks';
import type { DentalOrder } from '@/lib/types';

type MethodKey = 'card' | 'bank_transfer' | 'cash' | 'cheque';

interface MethodConfig {
  key: MethodKey;
  icon: typeof CreditCard;
  adminOnly?: boolean;
}

/**
 * The options visible inside the dialog. Order matches the user
 * spec: Bank transfer → Card → Cash → Cheque. Cash and cheque are
 * admin-only and are filtered out for the doctor view because they are
 * collected in-clinic and recorded by the admin.
 *
 * Labels + descriptions live in the dictionary under
 * `feeUi.methods.<key>` and are resolved with t() at render time
 * (module scope can't call hooks).
 */
const METHODS: MethodConfig[] = [
  { key: 'bank_transfer', icon: Landmark },
  { key: 'card', icon: CreditCard },
  { key: 'cash', icon: Banknote, adminOnly: true },
  { key: 'cheque', icon: FilePen, adminOnly: true },
];

/** a + b - c in millimes, so 99.9 + 1.1 never prints 100.99999. */
const addMoney = (a: number, b: number, minus = 0) =>
  (Math.round(a * 1000) + Math.round(b * 1000) - Math.round(minus * 1000)) / 1000;

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
  const { t, lang } = useT();
  // Doctor-safe defaults endpoint. The previous version called
  // `useCompanyBilling()` which hits `/admin/company-billing-settings`
  // and returned 403 for dentists, so the modal silently showed 0
  // TND. The dedicated `/company-billing-settings/public-defaults`
  // route returns only the two fields we need (fee + currency) and
  // is callable by dentist + admin.
  const { data: defaults, isLoading: defaultsLoading } =
    useBillingPublicDefaults();
  const pay = usePayTreatmentFee();
  const cardSession = useCreateTreatmentFeeCardSession();
  const uploadProof = useUploadTreatmentFeeProof();

  // Settings-driven amount + currency so the doctor sees what the
  // admin set under /account/billing-settings, not a stale hard-coded
  // value. The CBCT supplement snapshotted on the ORDER (server-side,
  // at request time) is added on top. An amount already recorded on the
  // order (paid / awaiting confirmation) always wins — it's the
  // authoritative total for that order. That figure is the CASH (fee due
  // + droit de timbre - retenue à la source), so the amount due adds the
  // retenue back and takes the stamp off.
  const baseFee = defaults?.defaultTreatmentFee ?? 0;
  const cbctFee = order.cbctFeeAmount ?? 0;
  // Defensive: fees waived by the welcome gift leave nothing
  // due — the dialog falls into its existing "no amount" state (the
  // backend refuses any payment on such an order anyway).
  const waivedByGift = !!order.welcomeGift;
  const amount = waivedByGift
    ? 0
    : order.treatmentFeeAmount != null
      ? addMoney(
          Number(order.treatmentFeeAmount),
          Number(order.treatmentFeeWithholdingAmount ?? 0),
          Number(order.treatmentFeeStampAmount ?? 0),
        )
      : addMoney(baseFee, cbctFee);
  const currency =
    order.cbctFeeCurrency ?? defaults?.defaultCurrency ?? 'TND';
  const bankDetails = defaults?.bankDetails ?? null;
  const { beneficiary, beneficiaryAddress } = transferBeneficiary(defaults);
  const isResolvingAmount =
    !waivedByGift && defaultsLoading && order.treatmentFeeAmount == null;
  const hasAmountDue = amount > 0;
  const hasBankTransfer = hasUsableBankTransferDetails(bankDetails);

  // Filter methods by role and payment availability.
  const methods = useMemo(
    () =>
      !isResolvingAmount && hasAmountDue
        ? METHODS.filter((m) => !m.adminOnly || isAdmin).filter(
            (m) => m.key !== 'bank_transfer' || hasBankTransfer,
          )
        : [],
    [hasAmountDue, hasBankTransfer, isAdmin, isResolvingAmount],
  );

  const [selected, setSelected] = useState<MethodKey | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  // Retenue à la source: offered when the company rate is above 0. A
  // practitioner who already declared with it finds it ticked again.
  // Display only — the server computes the retenue from the choice.
  const withholdingRate = defaults?.withholdingRate ?? 0;
  const [applyWithholding, setApplyWithholding] = useState(
    () => Number(order.treatmentFeeWithholdingAmount ?? 0) > 0,
  );
  const wantsWithholding = applyWithholding && withholdingRate > 0;
  // The fee's facture carries its own droit de timbre, added on top; the
  // retenue is taken on the fee TTC (stamp excluded). A new payment
  // snapshots the current stamp, as the server does.
  const stampDuty = Math.max(0, Number(defaults?.stampDuty ?? 0) || 0);
  const charge = previewPaymentCharge(amount, stampDuty, withholdingRate, wantsWithholding);
  // What actually changes hands: the fee + the stamp - the retenue.
  const toPay = charge.cash;
  // Only the retenue-choice conflict gets the inline explanation; any
  // other refusal (a transfer awaiting confirmation…) is the toast's.
  const attemptConflict =
    cardSession.isError && isWithholdingChoiceConflict(cardSession.error);
  const selectedMethod =
    selected && methods.some((m) => m.key === selected) ? selected : null;
  const selectedMethodConfig = selectedMethod
    ? METHODS.find((m) => m.key === selectedMethod)
    : null;

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

  const busy = pay.isPending || cardSession.isPending || uploadProof.isPending;

  // Card / Cash → single backend call, stamps paidAt and closes.
  const handleInstantPay = () => {
    if (!selectedMethod || selectedMethod === 'bank_transfer') return;
    if (selectedMethod === 'card') {
      const idempotencyKey =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
          : `${order.id}-treatment-fee`;
      cardSession.mutate(
        {
          orderId: order.id,
          idempotencyKey,
          language: lang === 'en' ? 'en' : 'fr',
          applyWithholding: wantsWithholding,
        },
        {
          onSuccess: (session) => {
            const verificationUrl = `/payment/return?paymentId=${encodeURIComponent(
              session.paymentId,
            )}`;
            window.location.assign(session.paymentUrl ?? verificationUrl);
          },
        },
      );
      return;
    }
    // Cash or cheque, recorded by an admin with the practitioner's choice.
    pay.mutate(
      {
        id: order.id,
        method: selectedMethod,
        amount: toPay,
        applyWithholding: wantsWithholding,
      },
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
      {
        id: order.id,
        proof: proofFile,
        amount: toPay,
        applyWithholding: wantsWithholding,
      },
      {
        onSuccess: () => {
          onPaid?.();
          onOpenChange(false);
        },
      },
    );
  };

  const isBankTransferSelected = selectedMethod === 'bank_transfer';

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
            {/* The headline is what changes hands: fee + stamp - retenue. */}
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('feeUi.payDialog.amountToPay')}
            </p>
            <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
              {formatPrice(toPay, currency)}
            </p>
            {hasAmountDue && (
              <PriceIncludesTaxNote
                tvaRate={defaults?.defaultTvaRate ?? 19}
                stamp={stampDuty}
                currency={currency}
                className="mt-1"
              />
            )}
            {/* The breakdown: fee TTC (with its CBCT supplement on its own
                line when the order carries one), the droit de timbre, the
                retenue when ticked, and what to pay / wire / collect. The
                retenue checkbox shows when the company rate is above 0. */}
            {hasAmountDue && !isResolvingAmount && (
              <WithholdingChoice
                className="mt-3"
                charge={charge}
                kind="fee"
                dueLines={
                  !waivedByGift && cbctFee > 0 && order.treatmentFeeAmount == null
                    ? [
                        { label: t('feeUi.payDialog.breakdownBase'), amount: baseFee },
                        { label: t('feeUi.payDialog.breakdownCbct'), amount: cbctFee },
                      ]
                    : undefined
                }
                rate={withholdingRate}
                currency={currency}
                checked={applyWithholding}
                onCheckedChange={(next) => {
                  setApplyWithholding(next);
                  // A refused card session was about the other choice.
                  if (cardSession.isError) cardSession.reset();
                }}
                disabled={busy}
                audience={isAdmin ? 'admin' : 'payer'}
                netLabel={
                  isBankTransferSelected
                    ? t('withholdingUi.toTransfer')
                    : selectedMethod === 'cash' || selectedMethod === 'cheque'
                      ? t('withholdingUi.toCollect')
                      : undefined
                }
              />
            )}
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
                {/* Every payment produces an invoice, e-mailed to the
                    practitioner. */}
                {!isAdmin && (
                  <span className="mt-1 block">{t('feeUi.payDialog.invoiceNote')}</span>
                )}
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
              {selectedMethodConfig ? (
                <SelectedMethodStrip
                  method={selectedMethodConfig}
                  disabled={busy}
                  onChange={() => setSelected(null)}
                />
              ) : methods.length === 0 ? (
                <PaymentUnavailableNotice
                  hasAmountDue={hasAmountDue}
                  isLoading={isResolvingAmount}
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

              {/* The card session was refused: an open card payment carries
                  the other retenue choice. */}
              {attemptConflict && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t('withholdingUi.choiceConflict')}</span>
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
                  amount={toPay}
                  amountNote={
                    charge.withholding > 0
                      ? t(
                          charge.stamp > 0
                            ? 'feeUi.bank.amountStampNetNote'
                            : 'feeUi.bank.amountNetNote',
                          {
                            due: formatPrice(charge.due, currency),
                            stamp: formatPrice(charge.stamp, currency),
                            withheld: formatPrice(charge.withholding, currency),
                          },
                        )
                      : charge.stamp > 0
                        ? t('feeUi.bank.amountStampNote', {
                            due: formatPrice(charge.due, currency),
                            stamp: formatPrice(charge.stamp, currency),
                          })
                        : undefined
                  }
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
            {methods.length === 0 ? t('common.close') : t('common.cancel')}
          </Button>
          {methods.length > 0 && isBankTransferSelected ? (
            <Button
              type="button"
              disabled={busy || !proofFile}
              onClick={handleBankTransferUpload}
              className="gap-2"
            >
              {uploadProof.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('feeUi.payDialog.uploadReceiptBtn')}
            </Button>
          ) : methods.length > 0 ? (
            <Button
              type="button"
              disabled={busy || !selectedMethod}
              onClick={handleInstantPay}
              className="gap-2"
            >
              {(pay.isPending || cardSession.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {selectedMethod === 'cash'
                ? t('feeUi.payDialog.recordCashBtn')
                : selectedMethod === 'cheque'
                  ? t('feeUi.payDialog.recordChequeBtn')
                  : t('feeUi.payDialog.payAmountBtn', {
                      // The net: what the card is charged.
                      amount: formatPrice(toPay, currency),
                    })}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaymentUnavailableNotice({
  hasAmountDue,
  isLoading,
}: {
  hasAmountDue: boolean;
  isLoading: boolean;
}) {
  const { t } = useT();
  return (
    <Card
      className={
        isLoading
          ? 'border-border bg-muted/30'
          : hasAmountDue
          ? 'border-amber-200 bg-amber-50/50'
          : 'border-emerald-200 bg-emerald-50/50'
      }
    >
      <CardContent className="flex items-start gap-3 pt-4 text-sm">
        {isLoading ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : hasAmountDue ? (
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
                : hasAmountDue
                  ? 'text-amber-900'
                  : 'text-emerald-900',
            )}
          >
            {isLoading
              ? t('common.loading')
              : hasAmountDue
                ? t('feeUi.payDialog.noAvailableMethodsTitle')
                : t('feeUi.payDialog.noAmountTitle')}
          </p>
          <p
            className={cn(
              'text-xs',
              isLoading
                ? 'text-muted-foreground'
                : hasAmountDue
                  ? 'text-amber-800/90'
                  : 'text-emerald-800/90',
            )}
          >
            {isLoading
              ? t('feeUi.payDialog.loadingDefaultsDesc')
              : hasAmountDue
                ? t('feeUi.payDialog.noAvailableMethodsDesc')
                : t('feeUi.payDialog.noAmountDesc')}
          </p>
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
