'use client';

import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileQuestion,
  FileText,
  Loader2,
  Maximize2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { saveBlobAs } from '@/lib/api/blob-download';
import type { TransferRef } from '@/lib/api/transfer-queue.service';
import { useTransferProof } from '@/lib/hooks/use-transfer-queue';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';
import { receiptDisplayKind, receiptFileName } from './queue-format';

/**
 * A transfer receipt (pack installment or treatment fee), fetched behind
 * the JWT from the authenticated proof stream and shown from a local blob
 * URL: receipts are private, so neither <img> nor <iframe> may point at
 * the API. Images open in the full-screen lightbox; PDFs frame inline
 * (the browser's viewer runs no script of the file on the app's origin)
 * with "open in a tab" for phones, which frame PDFs poorly. Every state
 * says what happened: loading, no receipt, gone (404), failed with retry,
 * a format with no preview.
 *
 * The caller sizes the frame; the viewer fills it and never grows past
 * it (a PDF's frame shrinks to a floor of its own instead), so it can
 * never spill over what the caller lays out below. A phone panel needs
 * about 320 px for a PDF: the actions, the frame's floor and the hint.
 */
export function ReceiptViewer({
  transfer,
  subjectKey,
  hasProof,
  orderCode,
  installmentNumber,
  className,
}: {
  transfer: TransferRef;
  /** The declaration's subject: the cache key of its bytes. */
  subjectKey: string;
  hasProof: boolean;
  orderCode: string;
  installmentNumber: number | null;
  className?: string;
}) {
  const { t } = useT();
  const proof = useTransferProof(transfer, subjectKey, hasProof);
  const [zoomed, setZoomed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  if (!hasProof) {
    return (
      <ViewerMessage
        className={className}
        icon={<FileQuestion className="size-7 text-amber-500" aria-hidden="true" />}
        title={t('pendingDesk.viewer.noneTitle')}
        body={t('pendingDesk.viewer.noneBody')}
      />
    );
  }
  if (proof.isLoading) {
    return (
      <div
        role="status"
        className={cn('flex h-full w-full flex-col items-center justify-center gap-3 p-8', className)}
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t('pendingDesk.viewer.loading')}</p>
      </div>
    );
  }
  if (proof.error || !proof.data) {
    const gone = proof.error?.status === 404;
    return (
      <ViewerMessage
        className={className}
        icon={<AlertTriangle className="size-7 text-red-500" aria-hidden="true" />}
        title={t(gone ? 'pendingDesk.viewer.notFoundTitle' : 'pendingDesk.viewer.errorTitle')}
        body={gone ? t('pendingDesk.viewer.notFoundBody') : (proof.error?.message ?? '')}
        action={
          gone ? undefined : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-coarse:h-12"
              onClick={() => void proof.refetch()}
            >
              <RefreshCw aria-hidden="true" />
              {t('pendingDesk.retry')}
            </Button>
          )
        }
      />
    );
  }

  const { blob, url } = proof.data;
  const kind = imageFailed ? 'other' : receiptDisplayKind(blob.type);
  const fileName = receiptFileName(orderCode, installmentNumber, blob.type);
  const download = () => saveBlobAs(blob, fileName);

  const actions = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {kind === 'image' && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="pointer-coarse:h-12"
          onClick={() => setZoomed(true)}
        >
          <Maximize2 aria-hidden="true" />
          {t('pendingDesk.viewer.zoom')}
        </Button>
      )}
      {kind !== 'other' && (
        <Button asChild size="sm" variant="outline" className="pointer-coarse:h-12">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" />
            {t('pendingDesk.viewer.openTab')}
          </a>
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="pointer-coarse:h-12"
        onClick={download}
      >
        <Download aria-hidden="true" />
        {t('pendingDesk.viewer.download')}
      </Button>
    </div>
  );

  if (kind === 'pdf') {
    return (
      <div className={cn('flex h-full w-full flex-col gap-3', className)}>
        {actions}
        <iframe
          title={t('pendingDesk.viewer.iframeTitle', { code: orderCode })}
          src={`${url}#view=FitH`}
          className="min-h-[160px] w-full flex-1 rounded-lg border bg-white shadow-sm"
        />
        <p className="text-center text-xs text-muted-foreground lg:hidden">
          {t('pendingDesk.viewer.pdfPhoneHint')}
        </p>
      </div>
    );
  }

  if (kind === 'image') {
    return (
      <div className={cn('flex h-full w-full flex-col gap-3', className)}>
        {actions}
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className="group relative flex min-h-0 w-full flex-1 cursor-zoom-in items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={t('pendingDesk.viewer.zoom')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={t('pendingDesk.viewer.imgAlt', { code: orderCode })}
            decoding="async"
            draggable={false}
            onError={() => setImageFailed(true)}
            className="max-h-full max-w-full select-none rounded-lg border bg-white object-contain shadow-sm"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute end-3 top-3 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Maximize2 className="size-3.5" />
          </span>
        </button>
        <ImageLightbox
          open={zoomed}
          onOpenChange={setZoomed}
          src={url}
          alt={t('pendingDesk.viewer.imgAlt', { code: orderCode })}
          caption={t('pendingDesk.viewer.lightboxCaption', { code: orderCode })}
        />
      </div>
    );
  }

  return (
    <ViewerMessage
      className={className}
      icon={<FileText className="size-7 text-muted-foreground" aria-hidden="true" />}
      title={t('pendingDesk.viewer.noPreviewTitle')}
      body={t('pendingDesk.viewer.noPreviewBody')}
      action={actions}
    />
  );
}

function ViewerMessage({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center',
        className,
      )}
    >
      {icon}
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        {body && <p className="max-w-sm text-xs text-muted-foreground">{body}</p>}
      </div>
      {action}
    </div>
  );
}
