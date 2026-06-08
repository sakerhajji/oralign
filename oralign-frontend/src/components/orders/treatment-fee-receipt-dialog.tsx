'use client';

import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthedImage, useConfirmTreatmentFeePayment } from '@/lib/hooks';
import { resolveUploadUrl } from '@/lib/api/company-billing.service';

/**
 * Admin-facing receipt viewer for a treatment-fee bank transfer.
 *
 * Replaces the previous "open in new tab" link, which 404'd because
 * `treatmentFeeProofPath` is stored as `/uploads/...` relative to the
 * BACKEND origin, but the link was rendered against the FRONTEND origin.
 *
 * Behaviour:
 *   • Loads the proof via authed axios → blob URL (works for both PDFs
 *     and images; CDN migration later still flows through this hook).
 *   • Renders images in an <img>, PDFs in an <iframe>; non-renderable
 *     formats fall back to a download tile.
 *   • Embeds the "Confirm payment" action inside the modal when the
 *     viewer is admin-facing AND there's something to confirm, so the
 *     admin can verify → approve in one flow.
 *   • An "Open in new tab" fallback stays available — the file path is
 *     a public URL (no auth on /uploads), so the new tab works for
 *     printing / saving without re-uploading.
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
  // Absolute URL the browser can fetch. Memoised so the blob hook's
  // cache key stays stable across re-renders of the parent.
  const absoluteUrl = useMemo(
    () => resolveUploadUrl(proofPath),
    [proofPath],
  );
  const { src: blobUrl, loading, error } = useAuthedImage(absoluteUrl);

  const confirm = useConfirmTreatmentFeePayment();

  // Classify the proof by extension. PDFs render in an iframe; images
  // in an <img>; everything else falls back to a download tile.
  const proofKind = classifyProof(proofPath);

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
      <DialogContent className="flex max-h-[92vh] w-full max-w-3xl flex-col gap-3 p-0">
        <DialogHeader className="border-b px-5 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" />
            Bank-transfer receipt
          </DialogTitle>
          <DialogDescription className="text-xs">
            Order <span className="font-medium">{orderCode}</span>
            {byline ? <> · {byline}</> : null}
          </DialogDescription>
          {/* Amount strip + status badge */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pb-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Declared:</span>
              <span className="text-base font-semibold tabular-nums">
                {amount ?? 0} {currency}
              </span>
            </div>
            <Badge
              variant="outline"
              className="border-blue-200 bg-blue-50 text-blue-700"
            >
              Awaiting confirmation
            </Badge>
          </div>
        </DialogHeader>

        {/* Receipt viewport — image / PDF / fallback */}
        <div className="min-h-[300px] flex-1 overflow-auto bg-muted/30 p-4">
          <ReceiptViewport
            blobUrl={blobUrl}
            absoluteUrl={absoluteUrl}
            loading={loading}
            error={error}
            kind={proofKind}
            fileName={extractFilename(proofPath) ?? `receipt-${orderCode}`}
          />
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 border-t bg-card px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {absoluteUrl && (
              <Button
                asChild
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                <a
                  href={absoluteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={extractFilename(proofPath) ?? undefined}
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
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
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
        </DialogFooter>
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

function ReceiptViewport({
  blobUrl,
  absoluteUrl,
  loading,
  error,
  kind,
  fileName,
}: {
  blobUrl: string | null;
  absoluteUrl: string | null;
  loading: boolean;
  error: Error | null;
  kind: ProofKind;
  fileName: string;
}) {
  if (kind === 'missing') {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-6 w-6 text-amber-500" />}
        title="No receipt attached"
        message="The doctor recorded a bank-transfer intent but did not upload a proof file."
      />
    );
  }

  if (loading && !blobUrl) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center">
        <div className="space-y-2">
          <Skeleton className="h-[300px] w-[420px] max-w-full" />
          <p className="text-center text-xs text-muted-foreground">
            Loading receipt…
          </p>
        </div>
      </div>
    );
  }

  if (error || !blobUrl) {
    // Fall back to the public direct URL so the admin can still see
    // the receipt even if the in-page fetch had a CORS hiccup.
    return (
      <EmptyState
        icon={<AlertTriangle className="h-6 w-6 text-red-500" />}
        title="Couldn't load the receipt in the dialog"
        message={
          error?.message ??
          "We couldn't render the file inline. Open it in a new tab to view or download."
        }
        action={
          absoluteUrl ? (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a
                href={absoluteUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={fileName}
              >
                <Download className="h-3.5 w-3.5" />
                Download receipt
              </a>
            </Button>
          ) : null
        }
      />
    );
  }

  if (kind === 'pdf') {
    // Native browser PDF viewer in an iframe. Works without pdfjs and
    // keeps the page weight small. `title` is required for a11y.
    return (
      <iframe
        title={`Receipt — ${fileName}`}
        src={blobUrl}
        className="h-[60vh] w-full rounded-md border bg-white"
      />
    );
  }

  if (kind === 'image') {
    return (
      <div className="flex h-full items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={blobUrl}
          alt={`Bank-transfer receipt ${fileName}`}
          className="max-h-[60vh] max-w-full rounded-md border bg-white object-contain shadow-sm"
        />
      </div>
    );
  }

  // 'other' — the doctor uploaded e.g. a .docx. Offer download.
  return (
    <EmptyState
      icon={<FileText className="h-6 w-6 text-muted-foreground" />}
      title="Preview not available"
      message={`This file format (${fileName}) can't be previewed inline. Download to inspect it.`}
      action={
        absoluteUrl ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <a
              href={absoluteUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={fileName}
            >
              <Download className="h-3.5 w-3.5" />
              Download receipt
            </a>
          </Button>
        ) : null
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
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 text-center">
      {icon}
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      </div>
      {action}
    </div>
  );
}
