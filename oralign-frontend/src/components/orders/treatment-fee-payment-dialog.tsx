'use client';

import { useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Landmark,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
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
  useCompanyBilling,
  usePayTreatmentFee,
  useUploadTreatmentFeeProof,
} from '@/lib/hooks';
import type { DentalOrder } from '@/lib/types';

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
  const { data: settings } = useCompanyBilling();
  const pay = usePayTreatmentFee();
  const uploadProof = useUploadTreatmentFeeProof();

  // Settings-driven amount + currency so the doctor sees what the
  // admin actually set, not a stale hard-coded value.
  const amount = settings?.defaultTreatmentFee ?? order.treatmentFeeAmount ?? 0;
  const currency = settings?.defaultCurrency ?? 'TND';

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
      <DialogContent className="max-w-lg">
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

        {/* Step 1 — method picker */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Payment method</p>
          <div className="grid gap-2">
            {methods.map((m) => {
              const Icon = m.icon;
              const isSelected = selected === m.key;
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
                    isSelected && 'border-primary bg-primary/5 ring-2 ring-primary/20',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                      isSelected ? 'bg-primary text-white' : 'bg-muted text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {m.description}
                    </p>
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2 (bank transfer only) — receipt upload affordance */}
        {isBankTransferSelected && (
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div>
                <p className="text-sm font-medium">Upload bank-transfer receipt</p>
                <p className="text-xs text-muted-foreground">
                  Accepted: PDF, JPG, PNG · max 10 MB.
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
