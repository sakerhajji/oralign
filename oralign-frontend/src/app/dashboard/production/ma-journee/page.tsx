'use client';

import { Suspense } from 'react';
import { MyDayContent, MyDaySkeleton } from './my-day-content';

// `useSearchParams` (?day=yesterday) needs a Suspense boundary.
export default function ProductionMyDayPage() {
  return (
    <Suspense fallback={<MyDaySkeleton />}>
      <MyDayContent />
    </Suspense>
  );
}
