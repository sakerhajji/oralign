'use client';

import { Suspense } from 'react';
import { NotificationsPageContent } from './notifications-content';

/**
 * Full notifications inbox — the destination of the bell's "View all"
 * link. Surfaces every notification the recipient has received,
 * read or unread, with filters + pagination. Role-aware on the
 * backend (each user only ever sees their own rows).
 */
export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">
          Loading notifications…
        </div>
      }
    >
      <NotificationsPageContent />
    </Suspense>
  );
}
