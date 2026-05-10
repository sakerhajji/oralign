'use client';

import { Suspense } from 'react';
import { UsersPageContent } from './users-content';

export default function UsersPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UsersPageContent />
    </Suspense>
  );
}
