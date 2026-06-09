'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/providers/auth-provider';
import { useT } from '@/lib/i18n/lang-context';
import { useAdminPayment } from '@/lib/hooks/use-payments';
import { invoicesService } from '@/lib/api/invoices.service';
import { InvoiceNumberEditor } from '@/components/payments/invoice-number-editor';
import { cn } from '@/lib/utils';

type InvoiceLang = 'fr' | 'en';

/**
 * Dedicated invoice / payment-receipt preview page.
 *
 * Reached from the payment-history "View invoice" action (which now
 * navigates here instead of force-downloading). The exact server PDF is
 * embedded inline; admins can rename the receipt and everyone gets a
 * dedicated Download button + FR/EN toggle.
 */
export default function InvoicePreviewPage() {
  const params = useParams<{ paymentId: string }>();
  const paymentId = params.paymentId;
  const { isAdmin } = useAuth();
  const { lang: dashLang } = useT();
  const fr = dashLang === 'fr';

  const [lang, setLang] = useState<InvoiceLang>(dashLang === 'en' ? 'en' : 'fr');

  // Admin loads the payment row so the header shows the latest editable
  // number. Doctors skip it (admin-only endpoint) and read the number
  // off the embedded PDF instead.
  const payment = useAdminPayment(paymentId, isAdmin);
  const invoiceNumber = payment.data?.invoiceNumber ?? null;

  // Fetch the receipt PDF through React Query (it owns loading / error +
  // caching). `invoiceNumber` in the key re-fetches after an admin
  // renumbers the receipt — the number is printed on the PDF.
  const pdfQuery = useQuery({
    queryKey: ['invoice-pdf', paymentId, lang, invoiceNumber],
    queryFn: () => invoicesService.downloadInvoice(paymentId, lang),
    enabled: !!paymentId,
    retry: 1,
  });
  const loading = pdfQuery.isPending || pdfQuery.isFetching;
  const error = pdfQuery.isError
    ? pdfQuery.error instanceof Error
      ? pdfQuery.error.message
      : 'Could not load the invoice PDF.'
    : null;

  // Derive the object URL from the blob; revoke on change / unmount so
  // we never leak (createObjectURL in useMemo, revoke in an effect —
  // the lint-clean pattern the receipt-dialog preview uses).
  const pdfUrl = useMemo(
    () => (pdfQuery.data ? URL.createObjectURL(pdfQuery.data) : null),
    [pdfQuery.data],
  );
  useEffect(() => {
    if (!pdfUrl) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const download = () => {
    if (!pdfUrl) return;
    const base = invoiceNumber ?? `invoice-${paymentId.slice(0, 8)}`;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `${base}-${lang}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const langButton = (code: InvoiceLang) => (
    <button
      type="button"
      onClick={() => setLang(code)}
      aria-pressed={lang === code}
      className={cn(
        'px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors',
        lang === code
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {code}
    </button>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <Link
        href="/dashboard/payments/history"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {fr ? 'Retour aux paiements' : 'Back to payments'}
      </Link>

      {/* ─── Header card: title + editable number + actions ───────── */}
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold sm:text-xl">
              {fr ? 'Facture' : 'Invoice'}
            </h1>
            {isAdmin ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {fr ? 'N°' : 'No.'}
                </span>
                <InvoiceNumberEditor
                  paymentId={paymentId}
                  value={invoiceNumber}
                  canEdit
                  size="lg"
                />
              </div>
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {fr ? 'Aperçu du reçu de paiement.' : 'Payment receipt preview.'}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border">
            {langButton('fr')}
            {langButton('en')}
          </div>
          <Button
            type="button"
            onClick={download}
            disabled={!pdfUrl || loading}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            {fr ? 'Télécharger le PDF' : 'Download PDF'}
          </Button>
        </div>
      </div>

      {/* ─── PDF body ─────────────────────────────────────────────── */}
      <Card className="relative flex min-h-[60vh] flex-1 items-center justify-center overflow-hidden p-0">
        {loading ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">
              {fr ? 'Chargement de la facture…' : 'Loading invoice…'}
            </p>
          </div>
        ) : error ? (
          <div className="flex max-w-md flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm font-medium text-destructive">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void pdfQuery.refetch();
              }}
            >
              {fr ? 'Réessayer' : 'Retry'}
            </Button>
          </div>
        ) : pdfUrl ? (
          <iframe
            title={fr ? 'Aperçu de la facture' : 'Invoice preview'}
            src={pdfUrl}
            className="h-full min-h-[70vh] w-full border-0 bg-white"
          />
        ) : null}
      </Card>
    </div>
  );
}
