'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/lang-context';
import { invoicesService } from '@/lib/api/invoices.service';
import { cn } from '@/lib/utils';

type InvoiceLang = 'fr' | 'en';

/**
 * Treatment-fee invoice preview page.
 *
 * Reached from the "Treatment fee payments" history → "View invoice"
 * action. The treatment fee lives inline on the order (there's no
 * Payment row), so the PDF is keyed by orderId. Mirrors the
 * installment-receipt preview: the exact server PDF embedded inline,
 * an FR/EN toggle, and a dedicated Download button.
 */
export default function TreatmentFeeInvoicePreviewPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const { t, lang: dashLang } = useT();

  const [lang, setLang] = useState<InvoiceLang>(dashLang === 'en' ? 'en' : 'fr');

  // Fetch the invoice PDF through React Query (owns loading / error +
  // caching). The treatment-fee number is printed on the PDF itself.
  const pdfQuery = useQuery({
    queryKey: ['treatment-fee-invoice-pdf', orderId, lang],
    queryFn: () => invoicesService.downloadTreatmentFeeInvoice(orderId, lang),
    enabled: !!orderId,
    retry: 1,
  });
  const loading = pdfQuery.isPending || pdfQuery.isFetching;
  const error = pdfQuery.isError
    ? pdfQuery.error instanceof Error
      ? pdfQuery.error.message
      : t('feeInvoicePage.loadError')
    : null;

  // Derive the object URL from the blob; revoke on change / unmount so
  // we never leak (createObjectURL in useMemo, revoke in an effect).
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
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `treatment-fee-${orderId.slice(0, 8)}-${lang}.pdf`;
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
        {t('feeInvoicePage.back')}
      </Link>

      {/* ─── Header card: title + actions ─────────────────────────── */}
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold sm:text-xl">
              {t('feeInvoicePage.title')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('feeInvoicePage.subtitle')}
            </p>
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
            {t('feeInvoicePage.download')}
          </Button>
        </div>
      </div>

      {/* ─── PDF body ─────────────────────────────────────────────── */}
      <Card className="relative flex min-h-[60vh] flex-1 items-center justify-center overflow-hidden p-0">
        {loading ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">
              {t('feeInvoicePage.loading')}
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
              {t('feeInvoicePage.retry')}
            </Button>
          </div>
        ) : pdfUrl ? (
          <iframe
            title={t('feeInvoicePage.previewTitle')}
            src={pdfUrl}
            className="h-full min-h-[70vh] w-full border-0 bg-white"
          />
        ) : null}
      </Card>
    </div>
  );
}
