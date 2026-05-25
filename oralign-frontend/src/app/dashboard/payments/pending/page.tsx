'use client';

import { Suspense } from 'react';
import { PendingPaymentsContent } from './pending-content';

export default function PendingPaymentsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      }
    >
      <PendingPaymentsContent />
    </Suspense>
  );
}
