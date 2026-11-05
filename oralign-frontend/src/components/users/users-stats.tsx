'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n/lang-context';
import type { UserStats } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * `{count} thing(s)` with the language's plural rule (French uses the
 * singular for 0 and 1). Keys come in pairs: `<base>One` / `<base>Many`.
 */
export function useCountLabel() {
  const { t, lang } = useT();
  return (base: string, count: number) => {
    const one = lang === 'fr' ? count <= 1 : count === 1;
    return t(`${base}${one ? 'One' : 'Many'}`, { count });
  };
}

/**
 * Overview of the whole user base from `GET /users/stats` — never the
 * current page. One surface with hairline dividers (2 × 2 on phones and
 * tablets, one row from lg).
 */
export function UsersStats({
  stats,
  unavailable = false,
}: {
  stats: UserStats | undefined;
  /** The counts could not be loaded: show dashes, not endless skeletons. */
  unavailable?: boolean;
}) {
  const { t } = useT();
  const countLabel = useCountLabel();

  const items: {
    key: string;
    label: string;
    value: number | undefined;
    detail: string | undefined;
    tone?: string;
  }[] = [
    {
      key: 'total',
      label: t('usersDesk.stats.total'),
      value: stats?.total,
      detail: stats
        ? `${countLabel('usersDesk.stats.dentists', stats.dentists)} · ${countLabel('usersDesk.stats.admins', stats.admins)}`
        : undefined,
    },
    {
      key: 'active',
      label: t('usersDesk.stats.active'),
      value: stats?.active,
      detail: stats ? countLabel('usersDesk.stats.blocked', stats.blocked) : undefined,
    },
    {
      key: 'pending',
      label: t('usersDesk.stats.pending'),
      value: stats?.pending,
      detail: stats ? t('usersDesk.stats.pendingDetail') : undefined,
      tone: stats && stats.pending > 0 ? 'text-amber-600 dark:text-amber-400' : undefined,
    },
    {
      key: 'gift',
      label: t('usersDesk.stats.giftAvailable'),
      value: stats?.giftAvailable,
      detail: stats ? countLabel('usersDesk.stats.giftUsed', stats.giftUsed) : undefined,
      tone: stats && stats.giftAvailable > 0 ? 'text-emerald-700 dark:text-emerald-400' : undefined,
    },
  ];

  const placeholder = (shape: string): ReactNode =>
    unavailable ? '—' : <Skeleton className={shape} />;

  return (
    <dl
      aria-label={t('usersDesk.stats.aria')}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-foreground/10 ring-1 ring-foreground/10 lg:grid-cols-4"
    >
      {items.map((item) => (
        <div key={item.key} className="min-w-0 bg-card px-4 py-3">
          <dt className="text-xs leading-4 text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              'mt-1.5 flex h-6 items-center text-xl leading-none font-semibold tabular-nums',
              item.tone,
            )}
          >
            {item.value === undefined ? placeholder('h-5 w-12') : item.value}
          </dd>
          <dd className="mt-1 min-h-4 text-xs leading-4 text-muted-foreground">
            {item.detail ?? (unavailable ? '' : <Skeleton className="h-3 w-24" />)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
