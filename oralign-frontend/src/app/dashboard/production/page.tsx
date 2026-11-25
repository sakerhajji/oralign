'use client';

import { Suspense } from 'react';
import { QueueContent, QueuePageSkeleton } from './queue-content';

// `useSearchParams` (tab, search and page live in the URL) needs a
// Suspense boundary; its fallback mirrors the loaded page.
export default function ProductionQueuePage() {
  return (
    <Suspense fallback={<QueuePageSkeleton />}>
      <QueueContent />
    </Suspense>
  );
}
