'use client';

import { Suspense } from 'react';
import { AdminMediaContent } from './admin-media-content';

/**
 * Admin-only Media Management page. The page itself is a thin
 * Suspense shell; all data + interaction lives in the content
 * component so the route paint stays instant.
 */
export default function MediaPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">
          Loading media library…
        </div>
      }
    >
      <AdminMediaContent />
    </Suspense>
  );
}
