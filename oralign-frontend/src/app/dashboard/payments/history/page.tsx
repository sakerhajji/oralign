'use client';

import { Suspense } from 'react';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentHistoryContent } from './history-content';

function PaymentHistoryFallback() {
  const { t } = useT();
  return (
    <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
  );
}

export default function PaymentHistoryPage() {
  return (
    <Suspense fallback={<PaymentHistoryFallback />}>
      <PaymentHistoryContent />
    </Suspense>
  );
}
