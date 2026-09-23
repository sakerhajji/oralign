'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';
import { InvoiceForm } from '@/components/invoices/invoice-form';
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInvoice } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';

const INVOICES_PATH = '/dashboard/invoices';

/**
 * Create / edit screen for a manual invoice — a full page rather than a
 * dialog: the form has four sections and a running total, which a modal
 * can only show through a scrollbar.
 */
export function InvoiceFormScreen({ invoiceId }: { invoiceId?: string }) {
  const { t } = useT();
  const { user, isAdmin } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (user && !isAdmin) router.replace('/dashboard');
  }, [user, isAdmin, router]);

  const detail = useInvoice(invoiceId);
  const invoice = detail.data ?? null;

  if (user && !isAdmin) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-3 pb-8 sm:gap-5 sm:p-5 lg:p-8">
      <header>
        <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit text-muted-foreground">
          <Link href={INVOICES_PATH}>
            <ArrowLeftIcon className="mr-1.5 size-4" />
            {t('invoiceDesk.backToList')}
          </Link>
        </Button>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {invoiceId
                ? t('invoicesAdmin.editorEditTitle', { number: invoice?.invoiceNumber ?? '…' })
                : t('invoicesAdmin.editorCreateTitle')}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t('invoicesAdmin.editorIntro')}
            </p>
          </div>
          {invoice ? <InvoiceStatusBadge status={invoice.status} /> : null}
        </div>
      </header>

      {invoiceId && detail.isLoading ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : invoiceId && detail.isError ? (
        <Notice
          message={t('invoicesAdmin.error')}
          action={
            <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
              {t('invoiceDesk.retry')}
            </Button>
          }
        />
      ) : invoiceId && !invoice ? (
        <Notice message={t('invoiceDesk.notFound')} action={<BackButton />} />
      ) : invoice?.deletedAt ? (
        <Notice message={t('invoiceDesk.archivedNotice')} action={<BackButton />} />
      ) : (
        <InvoiceForm key={invoice?.id ?? 'new'} invoice={invoice} />
      )}
    </div>
  );
}

function Notice({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-10 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
      <p>{message}</p>
      {action}
    </div>
  );
}

function BackButton() {
  const { t } = useT();
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={INVOICES_PATH}>{t('invoiceDesk.backToList')}</Link>
    </Button>
  );
}
