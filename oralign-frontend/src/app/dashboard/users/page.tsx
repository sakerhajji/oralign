'use client';

import { Suspense } from 'react';
import { useT } from '@/lib/i18n/lang-context';
import { UsersPageContent } from './users-content';

export default function UsersPage() {
  return (
    <Suspense fallback={<UsersFallback />}>
      <UsersPageContent />
    </Suspense>
  );
}

function UsersFallback() {
  const { t } = useT();
  return (
    <div className="p-6 text-sm text-muted-foreground">
      {t('usersAdmin.loadingFallback')}
    </div>
  );
}
