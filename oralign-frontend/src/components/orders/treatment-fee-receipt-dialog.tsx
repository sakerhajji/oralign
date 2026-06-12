'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  Landmark,
  Loader2,
  Maximize2,
  Stethoscope,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { useConfirmTreatmentFeePayment } from '@/lib/hooks';
import { resolveUploadUrl } from '@/lib/api/company-billing.service';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentMethod } from '@/lib/types';

/**
 * Admin-facing treatment-fee bank-transfer receipt confirmation.
 *
 * Desktop-first design:
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Bank-transfer receipt   [Awaiting confirmation]  X │
 *   │ Order ORD-1234                                       │
 *   ├──────────────────────────┬──────────────────────────┤
 *   │                          │  PATIENT                  │
 *   │    [Receipt photo]       │  Ahlem r9i9              │
 *   │    object-contain on     │                           │
 *   │    a soft backdrop —     │  DOCTOR                   │
 *   │    click → lightbox      │  Dr. Hajji Saker         │
 *   │                          │                           │
 *   │                          │  AMOUNT      350 TND     │
 *   │                          │  METHOD      Bank transfer│
 *   │                          │  SUBMITTED   Jun 7, 2026 │
 *   ├──────────────────────────┴──────────────────────────┤
 *   │                       [Cancel]  [✓ Confirm payment] │
 *   └─────────────────────────────────────────────────────┘
 *
 *   Below md: the two columns stack — receipt on top, details below,
 *   footer still sticky. The image scales down with the viewport so
 *   the dialog always fits without scrolling on phones.
 *
 * The image is rendered with `object-contain` on a light-muted
 * backdrop so the full proof is visible without distortion. Clicking
 * the image opens the global ImageLightbox for true edge-to-edge
 * inspection. No CORS fetch — the URL is passed straight to <img>
 * which works cross-origin thanks to the backend's CORP header.
 */
export interface TreatmentFeeReceiptDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Required for the confirm mutation. */
  orderId: string;
  /** Shown in the header so the admin knows which order they're looking at. */
  orderCode: string;
  /** Backend-stored relative path (e.g. "/uploads/treatment-fee-proofs/abc.pdf"). */
  proofPath: string | null | undefined;
  /** Amount the doctor declared — surfaced in the details column. */
  amount: number | null | undefined;
  /** Currency code, defaults to TND if unset. */
  currency?: string;
  /** Doctor / patient context for the details column. */
  doctorName?: string | null;
  patientName?: string | null;
  /** Payment method — usually `bank_transfer`. Surfaces a labelled chip. */
  method?: PaymentMethod | null;
  /** ISO date string when the doctor uploaded the proof (or recorded intent). */
  submittedAt?: string | null;
  /**
   * When true the modal renders the "Confirm payment" footer button.
   * Drives off the caller's authz check + the order's current status.
   */
  canConfirm: boolean;
  /** Optional success callback (parent closes the dialog + refreshes). */
  onConfirmed?: () => void;
}

export function TreatmentFeeReceiptDialog({
  open,
  onOpenChange,
  orderId,
  orderCode,
  proofPath,
  amount,
  currency = 'TND',
  doctorName,
  patientName,
  method,
  submittedAt,
  canConfirm,
  onConfirmed,
}: TreatmentFeeReceiptDialogProps) {
  const { t } = useT();
  const fileUrl = useMemo(() => resolveUploadUrl(proofPath), [proofPath]);
  const fileName = extractFilename(proofPath) ?? `receipt-${orderCode}`;
  const proofKind = classifyProof(proofPath);

  const confirm = useConfirmTreatmentFeePayment();

  // Click-to-zoom lightbox — same component the clinical photos use,
  // so the admin gets a familiar full-screen viewer when they need to
  // inspect a receipt at high resolution. Lives outside the modal so
  // closing the lightbox returns to the review surface.
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (confirm.isPending) return;
          onOpenChange(next);
        }}
      >
        {/*
          Desktop comfort: an explicit ~920 px / 82vh shell gives the
          two-column split real room. The shared DialogContent caps
          width at `sm:max-w-sm`, so we override the sm/lg max-width
          here — otherwise the modal renders as a ~384 px card on
          desktop. Below lg the columns stack and the body scrolls
          internally while the header / footer stay pinned.
         */}
        <DialogContent className="flex h-auto max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[600px] lg:h-[82vh] lg:max-w-[920px]">
          {/* ─── Header ─────────────────────────────────────────── */}
          <DialogHeader className="space-y-1 border-b bg-card px-6 py-5 text-left sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-lg font-semibold sm:text-xl">
                  {t('feeUi.receiptDialog.title')}
                </DialogTitle>
                <DialogDescription className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {t('feeUi.receiptDialog.orderCode', { code: orderCode })}
                </DialogDescription>
              </div>
              <Badge
                variant="outline"
                className="shrink-0 gap-1.5 border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700"
              >
                <Clock className="h-3 w-3" />
                {t('paymentsCommon.status.awaiting_confirmation')}
              </Badge>
            </div>
          </DialogHeader>

          {/*
            ─── Body: two-column on desktop (lg+), stacked below ───
            The min-h-0 + flex-1 combo lets the body claim the
            leftover vertical space and lets the columns scroll
            independently when content overflows.
           */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
            {/* Receipt column — grows to ~58% on desktop, full-width below lg */}
            <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden border-b bg-muted/40 p-4 lg:min-h-0 lg:flex-1 lg:border-b-0 lg:border-r lg:p-8">
              <ReceiptViewport
                fileUrl={fileUrl}
                kind={proofKind}
                fileName={fileName}
                onImageClick={() => setLightboxOpen(true)}
              />
            </div>

            {/* Summary column — fixed 42% on desktop */}
            <div className="flex min-h-0 flex-col overflow-y-auto bg-card p-6 lg:w-[42%] lg:flex-shrink-0 lg:p-7">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('feeUi.receiptDialog.summary')}
              </h3>
              <dl className="space-y-4">
                <DetailRow
                  icon={<User className="h-3.5 w-3.5" />}
                  label={t('feeUi.receiptDialog.patient')}
                  value={patientName ?? '—'}
                />
                <DetailRow
                  icon={<Stethoscope className="h-3.5 w-3.5" />}
                  label={t('feeUi.receiptDialog.doctor')}
                  value={doctorName ? `Dr. ${doctorName}` : '—'}
                />
                <Divider />
                <DetailRow
                  icon={<Banknote className="h-3.5 w-3.5" />}
                  label={t('feeUi.receiptDialog.amount')}
                  value={
                    <span className="text-lg font-bold tabular-nums">
                      {amount ?? 0} {currency}
                    </span>
                  }
                  highlight
                />
                <DetailRow
                  icon={<MethodIcon method={method} />}
                  label={t('feeUi.receiptDialog.method')}
                  value={t(
                    `paymentsCommon.method.${method ?? PaymentMethod.BANK_TRANSFER}`,
                  )}
                />
                {submittedAt && (
                  <DetailRow
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    label={t('feeUi.receiptDialog.submitted')}
                    value={format(new Date(submittedAt), 'MMM d, yyyy')}
                  />
                )}
                <DetailRow
                  icon={<FileText className="h-3.5 w-3.5" />}
                  label={t('feeUi.receiptDialog.receipt')}
                  value={
                    <span
                      className="block truncate font-mono text-[11px] text-muted-foreground"
                      title={fileName}
                    >
                      {fileName}
                    </span>
                  }
                />
              </dl>

              {/*
                Verification hint — explains what Confirm will do in
                plain language so the admin understands they're moving
                the order forward, not just closing the dialog.
               */}
              <div className="mt-auto pt-6">
                <p className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-900/80">
                  {t('feeUi.receiptDialog.confirmHint')}
                </p>
              </div>
            </div>
          </div>

          {/* ─── Footer ─────────────────────────────────────────── */}
          <div className="flex flex-row flex-wrap items-center justify-end gap-2.5 border-t bg-card px-6 py-4 sm:px-8">
            <Button
              type="button"
              variant="ghost"
              disabled={confirm.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            {canConfirm && (
              <Button
                type="button"
                className={cn(
                  'gap-1.5 bg-emerald-600 font-medium text-white shadow-sm hover:bg-emerald-700',
                  'min-w-[180px]',
                )}
                disabled={confirm.isPending}
                onClick={() => {
                  confirm.mutate(orderId, {
                    onSuccess: () => {
                      onConfirmed?.();
                      onOpenChange(false);
                    },
                  });
                }}
              >
                {confirm.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {t('feeUi.receiptDialog.confirmBtn')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/*
        Click-to-zoom lightbox — only mounted for image proofs. PDFs
        already render full-bleed in the iframe so opening them in the
        image-lightbox would be wrong.
       */}
      {proofKind === 'image' && (
        <ImageLightbox
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          src={fileUrl}
          alt={t('feeUi.receiptDialog.lightboxAlt', { code: orderCode })}
          caption={t('feeUi.receiptDialog.lightboxCaption', {
            code: orderCode,
          })}
          subCaption={fileName}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

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
        highlight && 'rounded-md bg-emerald-50/60 p-2 -mx-2',
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
            'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
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

function Divider() {
  return <div className="my-1 h-px bg-border" />;
}

function MethodIcon({ method }: { method?: PaymentMethod | null }) {
  if (method === PaymentMethod.CARD)
    return <CreditCard className="h-3.5 w-3.5" />;
  if (method === PaymentMethod.CASH)
    return <Banknote className="h-3.5 w-3.5" />;
  return <Landmark className="h-3.5 w-3.5" />;
}

// Method display labels come from `paymentsCommon.method.*` via t()
// at the call site (the previous module-level `methodLabel` helper
// couldn't access the translation hook).

// ─────────────────────────────────────────────────────────────────────
// Receipt viewport
// ─────────────────────────────────────────────────────────────────────

type ProofKind = 'pdf' | 'image' | 'other' | 'missing';

function classifyProof(path: string | null | undefined): ProofKind {
  if (!path) return 'missing';
  if (/\.pdf($|\?)/i.test(path)) return 'pdf';
  if (/\.(png|jpe?g|gif|webp|bmp|svg)($|\?)/i.test(path)) return 'image';
  return 'other';
}

function extractFilename(path: string | null | undefined): string | null {
  if (!path) return null;
  const tail = path.split(/[\\/]/).pop();
  return tail && tail.length > 0 ? tail : null;
}

/**
 * Renders the receipt directly from the public URL — no blob fetch,
 * no auth dance. Falls through to a friendly download tile when the
 * proof is missing, fails to load, or is a non-previewable format.
 */
function ReceiptViewport({
  fileUrl,
  kind,
  fileName,
  onImageClick,
}: {
  fileUrl: string | null;
  kind: ProofKind;
  fileName: string;
  onImageClick: () => void;
}) {
  const { t } = useT();
  const [imgError, setImgError] = useState(false);

  if (kind === 'missing' || !fileUrl) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-7 w-7 text-amber-500" />}
        title={t('feeUi.receiptDialog.noReceiptTitle')}
        message={t('feeUi.receiptDialog.noReceiptDesc')}
      />
    );
  }

  if (kind === 'pdf') {
    return (
      <iframe
        title={t('feeUi.receiptDialog.iframeTitle', { name: fileName })}
        src={fileUrl}
        className="h-full min-h-[420px] w-full rounded-lg border bg-white shadow-sm"
      />
    );
  }

  if (kind === 'image' && !imgError) {
    return (
      <button
        type="button"
        onClick={onImageClick}
        // Light backdrop + cursor-zoom-in + maximize affordance
        // advertises that clicking expands to the full lightbox.
        // The image preserves its aspect ratio inside the container.
        className="group relative flex h-full w-full cursor-zoom-in items-center justify-center"
        aria-label={t('feeUi.receiptDialog.openFullAria')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileUrl}
          alt={t('feeUi.receiptDialog.receiptImgAlt', { name: fileName })}
          loading="eager"
          decoding="async"
          onError={() => setImgError(true)}
          className="max-h-full max-w-full select-none rounded-lg border bg-white object-contain shadow-sm transition-transform group-hover:scale-[1.01]"
          draggable={false}
        />
        {/* Subtle "tap to zoom" affordance — only on hover so it
            doesn't add visual noise to the default view. */}
        <span className="pointer-events-none absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
      </button>
    );
  }

  // Image failed to load or unknown format — offer a download.
  return (
    <EmptyState
      icon={
        imgError ? (
          <AlertTriangle className="h-7 w-7 text-red-500" />
        ) : (
          <FileText className="h-7 w-7 text-muted-foreground" />
        )
      }
      title={
        imgError
          ? t('feeUi.receiptDialog.loadErrorTitle')
          : t('feeUi.receiptDialog.noPreviewTitle')
      }
      message={
        imgError
          ? t('feeUi.receiptDialog.loadErrorDesc')
          : t('feeUi.receiptDialog.noPreviewDesc')
      }
      action={
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={fileName}
          >
            <Download className="h-3.5 w-3.5" />
            {t('feeUi.receiptDialog.downloadReceipt')}
          </a>
        </Button>
      }
    />
  );
}

function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
      {icon}
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      </div>
      {action}
    </div>
  );
}
