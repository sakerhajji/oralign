'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Download, ExternalLink, FileText, Loader2, Maximize2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import {
  RecordedPaymentBreakdown,
  type RecordedSplit,
} from '@/components/payments/withholding';
import { PaymentStatusBadge } from '@/components/payments/payment-status-badge';
import { TransferStateBadge } from '@/components/payments/transfer-state-badge';
import { inertBlob, keepsDisplayType, saveBlobAs } from '@/lib/api/blob-download';
import { useTransferReceipt, type TransferReceiptSource } from '@/lib/hooks/use-payments';
import { useT } from '@/lib/i18n/lang-context';
import { refusalReasonOf, type TransferAudience } from '@/lib/payments/transfer-state';
import type { PaymentRecordStatus, TransferState } from '@/lib/types';
import { formatBusinessDay, formatBusinessTime } from '@/lib/utils/business-day';
import { formatPrice } from '@/lib/utils/currency';

/** The stored statuses a transfer state tells better (sent / checked, paid, refused). */
const TRANSFER_STATUSES: ReadonlySet<string> = new Set([
  'awaiting_confirmation',
  'success',
  'rejected',
]);

/**
 * The summary column of the viewer: the transfer's state, its refusal
 * reason, what was wired (with the stamp and the retenue when they apply)
 * and when it was sent, in Tunis time.
 */
export function ReceiptSummary({
  state,
  status,
  audience = 'doctor',
  cash,
  split,
  currency,
  kind = 'installment',
  sentAt,
  rejectionReason,
  patientName,
}: {
  state: TransferState | null;
  /**
   * The row's stored status, when it is a history row: a withdrawn or
   * superseded declaration (cancelled) reads as such, not as « En attente
   * du reçu ».
   */
  status?: PaymentRecordStatus | null;
  audience?: TransferAudience;
  /** The cash wired (due + stamp - retenue). */
  cash: number | string | null | undefined;
  split: RecordedSplit | null;
  currency: string;
  kind?: 'installment' | 'fee';
  sentAt?: string | null;
  rejectionReason?: string | null;
  patientName?: string | null;
}) {
  const { t, lang } = useT();
  const reason = refusalReasonOf(rejectionReason);
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">{t('transfers.viewer.summary')}</h3>
      <dl className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{t('transfers.viewer.stateLabel')}</dt>
          <dd>
            {status && !TRANSFER_STATUSES.has(status) ? (
              <PaymentStatusBadge status={status} />
            ) : (
              <TransferStateBadge state={state} audience={audience} />
            )}
          </dd>
        </div>
        {patientName ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t('transfers.viewer.patient')}</dt>
            <dd className="min-w-0 truncate text-right font-medium">{patientName}</dd>
          </div>
        ) : null}
        {sentAt ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t('transfers.viewer.sentAt')}</dt>
            <dd className="text-right tabular-nums">
              {formatBusinessDay(sentAt, lang)} · {formatBusinessTime(sentAt, lang)}
            </dd>
          </div>
        ) : null}
        {!split && cash !== null && cash !== undefined ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t('transfers.viewer.amount')}</dt>
            <dd className="text-right font-semibold tabular-nums">{formatPrice(cash, currency)}</dd>
          </div>
        ) : null}
      </dl>
      {split ? (
        <RecordedPaymentBreakdown
          split={split}
          currency={currency}
          kind={kind}
          cashLabel={t('transfers.viewer.amount')}
        />
      ) : null}
      {state === 'refused' ? (
        <p className="rounded-md border-l-2 border-red-300 bg-red-50/70 px-3 py-2 text-sm text-red-950 dark:bg-red-950/30 dark:text-red-100">
          <span className="font-medium">{t('transfers.refused.reasonLabel')} :</span>{' '}
          {reason ?? t('transfers.refused.noReason')}
        </p>
      ) : null}
    </div>
  );
}

/** What the bytes are: a picture shown inline, a PDF framed, or anything else downloaded. */
type ReceiptDisplay = 'image' | 'pdf' | 'other';

function displayOf(type: string): ReceiptDisplay {
  const essence = type.split(';', 1)[0].trim().toLowerCase();
  if (essence === 'application/pdf') return 'pdf';
  if (keepsDisplayType(essence, 'image')) return 'image';
  return 'other';
}

const EXTENSION: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface ReceiptViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which receipt: a pack-installment payment, or an order's treatment fee. */
  source: TransferReceiptSource;
  /** The declaration instant: a replaced receipt is fetched again. */
  version?: string | null;
  /** Under the title, e.g. « Échéance n° 2 · ORD-1234 ». */
  description: string;
  /** Name of a downloaded copy, without extension (e.g. the order code). */
  fileBaseName: string;
  /** The transfer's summary column (amounts, state, reason). */
  details?: ReactNode;
  /** Another action beside Close, e.g. the way to the admin queue. */
  footerAction?: ReactNode;
}

/**
 * A transfer receipt, read through the authenticated stream (CONTRACT §2.1 /
 * §2.2: the uploads folder is private, a plain URL would 404). The bytes
 * become an object URL that keeps its type only when it cannot run script on
 * the app's origin (inertBlob 'viewer': pictures, PDFs); anything else is
 * offered as a download. Read-only: confirming and refusing are the lab's,
 * in the pending desk.
 *
 * Wide dialog (sm:/lg: overrides of the DialogContent cap): the receipt on
 * the left, the summary on the right from lg, stacked below.
 */
export function ReceiptViewerDialog({
  open,
  onOpenChange,
  source,
  version,
  description,
  fileBaseName,
  details,
  footerAction,
}: ReceiptViewerDialogProps) {
  const { t } = useT();
  const receipt = useTransferReceipt(source, { enabled: open, version });
  const blob = receipt.data ?? null;
  const display = blob ? displayOf(blob.type) : null;

  const objectUrl = useMemo(
    () => (blob ? URL.createObjectURL(inertBlob(blob, 'viewer')) : null),
    [blob],
  );
  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const [zoomed, setZoomed] = useState(false);
  const downloadName = `${t('transfers.viewer.fileName')}-${fileBaseName}.${
    (blob && EXTENSION[blob.type.split(';', 1)[0].trim().toLowerCase()]) || 'bin'
  }`;
  const notFound = receipt.error?.status === 404 || receipt.error?.status === 403;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-full flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[640px] lg:h-[82dvh] lg:max-w-[960px]">
          <DialogHeader className="shrink-0 border-b bg-card py-4 pr-14 pl-5 text-left sm:pl-6">
            <DialogTitle className="text-lg font-semibold">{t('transfers.viewer.title')}</DialogTitle>
            <DialogDescription className="truncate font-mono text-xs">{description}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:flex lg:overflow-hidden">
            <div className="relative flex min-h-[260px] items-center justify-center border-b bg-muted/40 p-4 lg:min-h-0 lg:flex-1 lg:border-r lg:border-b-0 lg:p-6">
              {receipt.isPending ? (
                <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  {t('transfers.viewer.loading')}
                </p>
              ) : receipt.isError || !objectUrl ? (
                <div role="alert" className="flex flex-col items-center gap-3 text-center">
                  <FileText aria-hidden="true" className="size-8 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {notFound ? t('transfers.viewer.notFound') : t('transfers.viewer.error')}
                  </p>
                  {!notFound ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="pointer-coarse:h-12"
                      onClick={() => void receipt.refetch()}
                    >
                      <RotateCcw aria-hidden="true" />
                      {t('transfers.viewer.retry')}
                    </Button>
                  ) : null}
                </div>
              ) : display === 'image' ? (
                <button
                  type="button"
                  onClick={() => setZoomed(true)}
                  className="group relative block max-h-full rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={t('transfers.viewer.zoom')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- an authenticated blob */}
                  <img
                    src={objectUrl}
                    alt={t('transfers.picker.previewAlt')}
                    className="max-h-[60dvh] w-auto max-w-full rounded-lg bg-white object-contain shadow-sm lg:max-h-[calc(82dvh-12rem)]"
                  />
                  <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-background/90 text-foreground shadow-sm">
                    <Maximize2 aria-hidden="true" className="size-4" />
                  </span>
                </button>
              ) : display === 'pdf' ? (
                <>
                  {/* Phones frame PDFs poorly: a tile that opens it instead. */}
                  <div className="flex flex-col items-center gap-3 text-center sm:hidden">
                    <FileText aria-hidden="true" className="size-10 text-muted-foreground" />
                    <p className="text-sm">{t('transfers.viewer.pdfHint')}</p>
                  </div>
                  <iframe
                    title={t('transfers.viewer.title')}
                    src={objectUrl}
                    className="hidden h-[60dvh] w-full rounded-lg border bg-white sm:block lg:h-full"
                  />
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <FileText aria-hidden="true" className="size-10 text-muted-foreground" />
                  <p className="text-sm">{t('transfers.viewer.error')}</p>
                </div>
              )}
            </div>

            {details ? (
              <div className="bg-card p-5 sm:p-6 lg:w-[38%] lg:shrink-0 lg:overflow-y-auto">
                {details}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-card px-5 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:px-6">
            {blob && objectUrl ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 sm:h-9 pointer-coarse:h-12"
                  onClick={() => saveBlobAs(inertBlob(blob, 'viewer'), downloadName)}
                >
                  <Download aria-hidden="true" />
                  {t('transfers.viewer.download')}
                </Button>
                {display !== 'other' ? (
                  <Button asChild variant="ghost" className="h-11 sm:h-9 pointer-coarse:h-12">
                    <a href={objectUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden="true" />
                      {t('transfers.viewer.open')}
                    </a>
                  </Button>
                ) : null}
              </>
            ) : null}
            {footerAction}
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-9 pointer-coarse:h-12"
              onClick={() => onOpenChange(false)}
            >
              {t('transfers.viewer.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {display === 'image' && objectUrl ? (
        <ImageLightbox
          open={zoomed}
          onOpenChange={setZoomed}
          src={objectUrl}
          alt={t('transfers.picker.previewAlt')}
          caption={t('transfers.viewer.title')}
          subCaption={description}
        />
      ) : null}
    </>
  );
}
