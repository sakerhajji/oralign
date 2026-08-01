'use client';

import { Suspense } from 'react';
import { useT } from '@/lib/i18n/lang-context';
import { AdminCommunityContent } from './admin-community-content';

export default function CommunityPage() {
  return (
    <Suspense fallback={<CommunityFallback />}>
      <AdminCommunityContent />
    </Suspense>
  );
}

function CommunityFallback() {
  const { t } = useT();
  return <div className="p-6 text-sm text-muted-foreground">{t('communityAdmin.loading')}</div>;
}
