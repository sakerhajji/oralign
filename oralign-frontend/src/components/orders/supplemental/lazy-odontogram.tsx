'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The odontogram pulls a large anatomical sprite: load its chunk only when
 * a step that shows a chart is opened (same choice as the order wizard).
 */
export const LazyOdontogram = dynamic(
  () =>
    import('@/components/orders/odontogram-selector').then((module) => ({
      default: module.OdontogramSelector,
    })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full rounded-lg" />,
  },
);
