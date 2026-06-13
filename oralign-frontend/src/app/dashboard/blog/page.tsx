'use client';

import { Suspense } from 'react';
import { useT } from '@/lib/i18n/lang-context';
import { BlogPageContent } from './blog-content';

export default function BlogPage() {
  return (
    <Suspense fallback={<BlogFallback />}>
      <BlogPageContent />
    </Suspense>
  );
}

function BlogFallback() {
  const { t } = useT();
  return (
    <div className="p-6 text-sm text-muted-foreground">
      {t('blogAdmin.loading')}
    </div>
  );
}
