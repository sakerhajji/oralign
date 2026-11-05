'use client';

import { Suspense } from 'react';
import { PatientsPageContent, PatientsPageSkeleton } from './patients-content';

// `useSearchParams` (the list state and the open patient live in the URL)
// needs a Suspense boundary; its fallback mirrors the loaded page.
export default function PatientsPage() {
  return (
    <Suspense fallback={<PatientsPageSkeleton />}>
      <PatientsPageContent />
    </Suspense>
  );
}
