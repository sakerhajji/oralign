'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  ReceiptText,
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
import { useConfirmTreatmentFeePayment } from '@/lib/hooks';
import { resolveUploadUrl } from '@/lib/api/company-billing.service';

/**
 * Admin-facing receipt viewer for a treatment-fee bank transfer.
 *
 * Why direct <img>/<iframe> instead of blob-fetching the proof:
 * the backend serves /uploads/* publicly with
 * Cross-Origin-Resource-Policy: cross-origin set, which is exactly
 * what <img>/<iframe> need to embed cross-origin assets. The native
 * tags don't require Access-Control-Allow-Origin (that header is only
 * checked for `fetch`/XHR). Going through axios + blob would force us
 * to add CORS to the static file route — extra surface area for zero
 * benefit, since the URL is already public anyway.
 *
 * UX:
 *   1. The header carries the order code + doctor / patient byline,
 *      declared amount, and the status badge — admin reads the
 *      context once and dives into the proof.
 *   2. The viewport renders images inline OR PDFs in an iframe; non-
 *      previewable formats degrade to a download tile so the admin
 *      can still inspect the file out-of-band.
 *   3. The footer pins three actions: open in new tab (full-screen
 *      review), close, and the embedded Confirm payment button —
 *      admin reviews and approves in one place.
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
  /** Amount the doctor declared — surfaced in the header strip. */
  amount: number | null | undefined;
  /** Currency code, defaults to TND if unset. */
  currency?: string;
  /** Doctor / patient context for the header byline. */
  doctorName?: string | null;
  patientName?: string | null;
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
  canConfirm,
  onConfirmed,
}: TreatmentFeeReceiptDialogProps) {
  // Resolve once per (re-)mount of the dialog. resolveUploadUrl
  // canonicalises any stored path shape into the absolute backend URL.
  const fileUrl = useMemo(() => resolveUploadUrl(proofPath), [proofPath]);
  const fileName = extractFilename(proofPath) ?? `receipt-${orderCode}`;
  const proofKind = classifyProof(proofPath);

  const confirm = useConfirmTreatmentFeePayment();

  const byline = [
    doctorName ? `Dr. ${doctorName}` : null,
    patientName ? `patient ${patientName}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (confirm.isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:h-auto">
        {/* ─── Header ─────────────────────────────────────────────── */}
        <DialogHeader className="space-y-3 border-b bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <ReceiptText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base">
                  Bank-transfer receipt
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs">
                  Order{' '}
                  <span className="font-medium text-foreground">
                    {orderCode}
                  </span>
                  {byline ? <> · {byline}</> : null}
                </DialogDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 gap-1 border-blue-200 bg-blue-50 text-blue-700"
            >
              <Clock className="h-3 w-3" />
              Awaiting confirmation
            </Badge>
          </div>

          {/* Amount + file strip — separates context from preview */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Declared
              </span>
              <span className="text-base font-bold tabular-nums">
                {amount ?? 0} {currency}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate font-mono" title={fileName}>
                {fileName}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* ─── Viewport ───────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 items-stretch overflow-auto bg-muted/30">
          <ReceiptViewport
            fileUrl={fileUrl}
            kind={proofKind}
            fileName={fileName}
          />
        </div>

        {/* ─── Footer ─────────────────────────────────────────────── */}
        <div className="flex flex-row flex-wrap items-center justify-between gap-2 border-t bg-card px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {fileUrl && (
              <Button
                asChild
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={fileName}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in new tab
                </a>
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={confirm.isPending}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {canConfirm && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
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
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Confirm payment
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Internals
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
 * The actual receipt surface. Renders directly from the public URL —
 * no blob fetch, no auth dance. Native `<img>` / `<iframe>` cross-
 * origin embedding works because the backend serves /uploads/* with
 * Cross-Origin-Resource-Policy: cross-origin.
 *
 * Tracks an internal `imgError` state so a failed image load (e.g.
 * the file was deleted on the server) falls through to the friendly
 * download fallback instead of leaving a broken icon.
 */
function ReceiptViewport({
  fileUrl,
  kind,
  fileName,
}: {
  fileUrl: string | null;
  kind: ProofKind;
  fileName: string;
}) {
  const [imgError, setImgError] = useState(false);

  if (kind === 'missing' || !fileUrl) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-7 w-7 text-amber-500" />}
        title="No receipt attached"
        message="The doctor recorded a bank-transfer intent but did not upload a proof file."
      />
    );
  }

  if (kind === 'pdf') {
    return (
      <iframe
        title={`Receipt — ${fileName}`}
        src={fileUrl}
        className="h-full min-h-[420px] w-full border-0 bg-white"
      />
    );
  }

  if (kind === 'image' && !imgError) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileUrl}
          alt={`Bank-transfer receipt ${fileName}`}
          loading="eager"
          decoding="async"
          onError={() => setImgError(true)}
          className="max-h-[70vh] max-w-full rounded-md border bg-white object-contain shadow-sm"
        />
      </div>
    );
  }

  // Image failed to load (404, dead link, etc.) or unknown file type
  // (e.g. .docx). Either way, give the admin a clear download path.
  return (
    <EmptyState
      icon={
        imgError ? (
          <AlertTriangle className="h-7 w-7 text-red-500" />
        ) : (
          <FileText className="h-7 w-7 text-muted-foreground" />
        )
      }
      title={imgError ? "Couldn't load the receipt" : 'Preview not available'}
      message={
        imgError
          ? "The image couldn't be loaded inline. Open it in a new tab or download it to inspect the proof."
          : `This file format (${fileName}) can't be previewed in the browser. Download to inspect it.`
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
            Download receipt
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
    <div className="flex h-full min-h-[300px] w-full flex-col items-center justify-center gap-3 p-8 text-center">
      {icon}
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      </div>
      {action}
    </div>
  );
}
