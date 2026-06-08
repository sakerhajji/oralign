'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
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

/**
 * Admin-facing receipt viewer for a treatment-fee bank transfer.
 *
 * The modal is intentionally PORTRAIT-shaped (`max-w-md`) — most
 * receipts and bank screenshots are taken on a phone in portrait, so
 * a portrait viewport matches the source aspect ratio. Landscape PDFs
 * still get the full-bleed iframe, just constrained to the same
 * portrait frame.
 *
 * Click the image to open it in the global ImageLightbox — same UX
 * the clinical-order photos use, with solid black backdrop and a
 * click-outside-to-close affordance. The embedded "Confirm payment"
 * action lives in the footer so the admin verifies-then-approves
 * without leaving the modal.
 *
 * URLs are passed straight to <img>/<iframe>. The backend serves
 * /uploads/* with Cross-Origin-Resource-Policy: cross-origin which is
 * exactly what the embed tags need; we don't blob-fetch and we don't
 * fight CORS.
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
  /** Amount the doctor declared — surfaced in the header byline. */
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
  const fileUrl = useMemo(() => resolveUploadUrl(proofPath), [proofPath]);
  const fileName = extractFilename(proofPath) ?? `receipt-${orderCode}`;
  const proofKind = classifyProof(proofPath);

  const confirm = useConfirmTreatmentFeePayment();

  // Lightbox state — opening the click-to-zoom view from the image
  // inside this modal. We don't close the modal underneath; the
  // lightbox just stacks above it so dismissing the lightbox returns
  // the admin to the same review surface.
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const byline = [
    doctorName ? `Dr. ${doctorName}` : null,
    patientName ? `patient ${patientName}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
          Portrait-shaped surface. max-w-md (~28rem / 448 px) matches
          the rough aspect of a phone-camera photo. The height is
          fixed so the image viewport always has room to render the
          proof full-bleed instead of collapsing to its intrinsic
          height.
         */}
        <DialogContent className="flex h-[92vh] max-h-[92vh] w-full max-w-md flex-col gap-0 overflow-hidden border-0 p-0 shadow-2xl">
          {/* ─── Header ─────────────────────────────────────────── */}
          <DialogHeader className="space-y-1 border-b bg-card px-4 py-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="truncate font-mono text-xs font-semibold tracking-tight">
                {orderCode}
              </DialogTitle>
              <Badge
                variant="outline"
                className="shrink-0 border-blue-200 bg-blue-50 text-[10px] font-medium uppercase tracking-wide text-blue-700"
              >
                Awaiting confirmation
              </Badge>
            </div>
            <DialogDescription className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              {byline ? <span className="truncate">{byline}</span> : null}
              <span className="text-foreground">·</span>
              <span className="font-semibold text-foreground tabular-nums">
                {amount ?? 0} {currency}
              </span>
            </DialogDescription>
          </DialogHeader>

          {/* ─── Viewport ───────────────────────────────────────── */}
          <div className="relative flex min-h-0 flex-1 items-stretch overflow-hidden bg-black">
            <ReceiptViewport
              fileUrl={fileUrl}
              kind={proofKind}
              fileName={fileName}
              onImageClick={() => setLightboxOpen(true)}
            />
          </div>

          {/* ─── Footer ─────────────────────────────────────────── */}
          <div className="flex flex-row items-center justify-end gap-2 border-t bg-card px-4 py-3">
            {canConfirm && (
              <Button
                type="button"
                className={cn(
                  'h-10 w-full gap-1.5 bg-emerald-600 font-medium text-white hover:bg-emerald-700',
                  'shadow-sm',
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
                Confirm payment
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/*
        Click-to-zoom lightbox — only mounted when the receipt is an
        image. PDFs already render at full size in the iframe; opening
        them in the image lightbox would be wrong.
       */}
      {proofKind === 'image' && (
        <ImageLightbox
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          src={fileUrl}
          alt={`Bank-transfer receipt for ${orderCode}`}
          caption={`${orderCode} — bank-transfer receipt`}
          subCaption={fileName}
        />
      )}
    </>
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
 * no blob fetch, no auth dance. Native <img> / <iframe> cross-origin
 * embedding works because the backend serves /uploads/* with
 * Cross-Origin-Resource-Policy: cross-origin.
 *
 * Failed image loads (404 / dead link) fall through to a friendly
 * download tile instead of a broken-image glyph.
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
  const [imgError, setImgError] = useState(false);

  if (kind === 'missing' || !fileUrl) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8 text-amber-400" />}
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
        className="h-full w-full border-0 bg-white"
      />
    );
  }

  if (kind === 'image' && !imgError) {
    return (
      <button
        type="button"
        onClick={onImageClick}
        // Black backdrop + cursor-zoom-in advertises that the user
        // can click to expand. The image fills the entire viewport
        // while preserving aspect ratio.
        className="group flex h-full w-full cursor-zoom-in items-center justify-center bg-black p-0"
        aria-label="Open receipt in full view"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileUrl}
          alt={`Bank-transfer receipt ${fileName}`}
          loading="eager"
          decoding="async"
          onError={() => setImgError(true)}
          className="h-full w-full select-none object-contain transition-transform group-hover:scale-[1.01]"
          draggable={false}
        />
      </button>
    );
  }

  // Image failed to load or unknown file type — surface a download path.
  return (
    <EmptyState
      icon={
        imgError ? (
          <AlertTriangle className="h-8 w-8 text-red-400" />
        ) : (
          <FileText className="h-8 w-8 text-white/70" />
        )
      }
      title={imgError ? "Couldn't load the receipt" : 'Preview not available'}
      message={
        imgError
          ? "The image couldn't be loaded inline. Download to inspect the proof."
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
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-black p-8 text-center text-white">
      {icon}
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="max-w-md text-xs text-white/70">{message}</p>
      </div>
      {action}
    </div>
  );
}
