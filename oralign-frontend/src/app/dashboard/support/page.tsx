'use client';

import { Suspense } from 'react';
import { useT } from '@/lib/i18n/lang-context';
import { AdminSupportContent } from './admin-support-content';

/**
 * Admin support inbox — Messenger-style two-column layout. The page
 * itself is purely a Suspense shell; all logic lives in the content
 * component so React Query + sockets don't block the route paint.
 */
export default function AdminSupportPage() {
  return (
    <Suspense fallback={<SupportFallback />}>
      <AdminSupportContent />
    </Suspense>
  );
}

function SupportFallback() {
  const { t } = useT();
  return (
    <div className="p-6 text-sm text-muted-foreground">
      {t('supportAdmin.loading')}
    </div>
  );
}
