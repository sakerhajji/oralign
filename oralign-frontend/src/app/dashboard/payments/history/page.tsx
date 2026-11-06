'use client';

import { Suspense } from 'react';
import { PaymentHistoryContent, PaymentsPageSkeleton } from './history-content';

// `useSearchParams` (the desk's tab, filters and page live in the URL)
// needs a Suspense boundary; its fallback mirrors the loaded page.
export default function PaymentHistoryPage() {
  return (
    <Suspense fallback={<PaymentsPageSkeleton />}>
      <PaymentHistoryContent />
    </Suspense>
  );
}
