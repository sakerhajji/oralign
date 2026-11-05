'use client';

import { Suspense } from 'react';
import { UsersPageContent, UsersPageSkeleton } from './users-content';

// `useSearchParams` (read once, for deep links) needs a Suspense
// boundary; its fallback mirrors the loaded page so nothing jumps.
export default function UsersPage() {
  return (
    <Suspense fallback={<UsersPageSkeleton />}>
      <UsersPageContent />
    </Suspense>
  );
}
