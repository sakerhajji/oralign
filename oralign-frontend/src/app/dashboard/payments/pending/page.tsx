'use client';

import { Suspense } from 'react';
import { useT } from '@/lib/i18n/lang-context';
import { PendingPaymentsContent } from './pending-content';

function PendingPaymentsFallback() {
  const { t } = useT();
  return (
    <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
  );
}

export default function PendingPaymentsPage() {
  return (
    <Suspense fallback={<PendingPaymentsFallback />}>
      <PendingPaymentsContent />
    </Suspense>
  );
}
