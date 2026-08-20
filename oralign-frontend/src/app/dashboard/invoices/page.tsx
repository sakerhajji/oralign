'use client';

import { Suspense } from 'react';
import { useT } from '@/lib/i18n/lang-context';
import { InvoicesContent } from './invoices-content';

export default function InvoicesPage() {
  return (
    <Suspense fallback={<InvoicesFallback />}>
      <InvoicesContent />
    </Suspense>
  );
}

function InvoicesFallback() {
  const { t } = useT();
  return (
    <div className="p-6 text-sm text-muted-foreground">
      {t('invoicesAdmin.loading')}
    </div>
  );
}
