'use client';

import { Suspense } from 'react';
import { PendingDeskSkeleton, PendingPaymentsContent } from './pending-content';

// The desk reads its tab from the address (useSearchParams): the boundary
// shows the desk's own skeleton until it can.
export default function PendingPaymentsPage() {
  return (
    <Suspense fallback={<PendingDeskSkeleton />}>
      <PendingPaymentsContent />
    </Suspense>
  );
}
