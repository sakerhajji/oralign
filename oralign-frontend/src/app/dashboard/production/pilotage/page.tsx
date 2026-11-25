'use client';

import { Suspense } from 'react';
import { PilotageContent, PilotageSkeleton } from './pilotage-content';

// `useSearchParams` (the view, the day, the period and the filters live in
// the URL) needs a Suspense boundary; its fallback mirrors the loaded page.
export default function ProductionPilotagePage() {
  return (
    <Suspense fallback={<PilotageSkeleton />}>
      <PilotageContent />
    </Suspense>
  );
}
