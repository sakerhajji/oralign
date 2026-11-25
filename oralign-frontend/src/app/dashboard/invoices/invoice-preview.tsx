'use client';

import * as React from 'react';
import { DownloadIcon, Loader2Icon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatRate } from '@/components/payments/withholding';
import { adminInvoicesService } from '@/lib/api/admin-invoices.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import { useDownloadInvoicePdf } from '@/lib/hooks';
import type { Invoice } from '@/lib/types';

/** Prisma Decimal arrives as a string over the wire. */
const n = (value: unknown): number => Number(value ?? 0);
/** The amounts as this dialog always printed them: 3 decimals and the currency. */
const amount = (value: unknown, currency: string) => `${n(value).toFixed(3)} ${currency}`;

/**
 * Read the invoice PDF without leaving the list.
 *
 * The file is auth-gated, so it cannot be pointed at with a plain
 * `<iframe src>` — the request would arrive without the Authorization
 * header. It is fetched through the authenticated client and shown from
 * an object URL, which is revoked on close so a long admin session does
 * not leak one blob per invoice opened.
 */
export function InvoicePreviewDialog({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT();
  const download = useDownloadInvoicePdf();
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!invoice) return;
    let revoked = false;
    let objectUrl: string | null = null;

    setLoading(true);
    setError(null);
    adminInvoicesService
      .fetchPdfBlob(invoice.id)
      .then((blob) => {
        // The dialog may have closed while the render was in flight.
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err: unknown) => {
        if (!revoked) setError(extractApiErrorMessage(err));
      })
      .finally(() => {
        if (!revoked) setLoading(false);
      });

    return () => {
      revoked = true;
      setUrl(null);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [invoice]);

  return (
    <Dialog open={Boolean(invoice)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{invoice?.invoiceNumber ?? ''}</DialogTitle>
          <DialogDescription>
            {invoice
              ? `${invoice.clientName} · ${amount(invoice.totalTtc, invoice.currency)}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {/* What the PDF says about the money, readable before it loads:
            the method, the retenue à la source and the net to pay. */}
        {invoice ? <PaymentFacts invoice={invoice} /> : null}

        <div className="min-h-[60svh] overflow-hidden rounded-lg border bg-muted/20">
          {loading ? (
            <div className="flex min-h-[60svh] items-center justify-center text-sm text-muted-foreground">
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              {t('invoicesAdmin.loading')}
            </div>
          ) : error ? (
            <div className="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : url ? (
            <iframe
              src={url}
              title={invoice?.invoiceNumber ?? 'invoice'}
              className="h-[60svh] w-full"
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('invoicesAdmin.cancel')}
          </Button>
          <Button
            disabled={!invoice || download.isPending}
            onClick={() => {
              if (!invoice) return;
              download.mutate({
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
              });
            }}
          >
            {download.isPending ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : (
              <DownloadIcon className="mr-2 size-4" />
            )}
            {t('invoicesAdmin.downloadPdf')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentFacts({ invoice }: { invoice: Invoice }) {
  const { t, lang } = useT();
  const withheld = n(invoice.withholdingAmount);
  const facts = [
    invoice.paymentMethod
      ? t('invoicesAdmin.previewMethod', {
          method: t(`paymentsDesk.methodLong.${invoice.paymentMethod}`),
        })
      : null,
    invoice.paymentReference
      ? t('invoicesAdmin.previewReference', { reference: invoice.paymentReference })
      : null,
    withheld > 0
      ? `${t('invoicesAdmin.previewWithholding', {
          rate: formatRate(invoice.withholdingRate, lang),
        })} − ${amount(withheld, invoice.currency)}`
      : null,
    withheld > 0
      ? `${t('invoicesAdmin.previewNetPayable')} ${amount(invoice.netPayable, invoice.currency)}`
      : null,
  ].filter((fact): fact is string => Boolean(fact));
  if (facts.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {facts.map((fact) => (
        <li key={fact} className="tabular-nums">
          {fact}
        </li>
      ))}
    </ul>
  );
}
