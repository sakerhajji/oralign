'use client';

import { Suspense } from 'react';
import { useT } from '@/lib/i18n/lang-context';
import { AdminMediaContent } from './admin-media-content';

/**
 * Admin-only Media Management page. The page itself is a thin
 * Suspense shell; all data + interaction lives in the content
 * component so the route paint stays instant.
 */
export default function MediaPage() {
  return (
    <Suspense fallback={<MediaFallback />}>
      <AdminMediaContent />
    </Suspense>
  );
}

function MediaFallback() {
  const { t } = useT();
  return (
    <div className="p-6 text-sm text-muted-foreground">
      {t('mediaAdmin.loading')}
    </div>
  );
}
