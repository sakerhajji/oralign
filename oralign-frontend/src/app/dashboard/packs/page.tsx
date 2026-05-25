'use client';

import { Suspense } from 'react';
import { PacksPageContent } from './packs-content';

export default function PacksPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading packs…</div>}>
      <PacksPageContent />
    </Suspense>
  );
}
