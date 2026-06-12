'use client';

import { Suspense } from 'react';
import { useT } from '@/lib/i18n/lang-context';
import { PacksPageContent } from './packs-content';

export default function PacksPage() {
  return (
    <Suspense fallback={<PacksFallback />}>
      <PacksPageContent />
    </Suspense>
  );
}

function PacksFallback() {
  const { t } = useT();
  return (
    <div className="p-6 text-sm text-muted-foreground">
      {t('packsAdmin.loading')}
    </div>
  );
}
