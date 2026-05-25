'use client';

import { Suspense } from 'react';
import { PaymentHistoryContent } from './history-content';

export default function PaymentHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <PaymentHistoryContent />
    </Suspense>
  );
}
