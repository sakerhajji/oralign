'use client';

import { Hourglass, Moon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatActivityDay } from '@/lib/account-activity/account-activity';
import { useT } from '@/lib/i18n/lang-context';
import { UserRole, type User } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Dormant: a calm slate tone, never the red of « Bloqué ». */
export const DORMANT_BADGE =
  'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200';
export const WARNED_BADGE =
  'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300';

/**
 * Doctor inactivity badge (spec §5), dentists only: « Inactif » while the
 * account is dormant (ordering closed), « Inactif le … » while the
 * deadline is within 30 days, nothing otherwise (an active account needs
 * no badge). Light on purpose: the users list renders it per row.
 */
export function ActivityBadge({
  user,
  className,
}: {
  user: Pick<User, 'role' | 'inactiveSince' | 'activity'>;
  className?: string;
}) {
  const { t, lang } = useT();
  if (user.role !== UserRole.DENTIST) return null;

  if (user.inactiveSince) {
    return (
      <Badge
        className={cn('max-w-full', DORMANT_BADGE, className)}
        title={t('accountActivity.badge.inactiveTitle')}
      >
        <Moon aria-hidden="true" />
        <span className="truncate">{t('accountActivity.badge.inactive')}</span>
      </Badge>
    );
  }

  const activity = user.activity;
  if (activity?.status === 'warned' && activity.deadlineAt) {
    const date = formatActivityDay(activity.deadlineAt, lang);
    return (
      <Badge
        className={cn('max-w-full', WARNED_BADGE, className)}
        title={t('accountActivity.badge.warnedTitle', { date })}
      >
        <Hourglass aria-hidden="true" />
        <span className="truncate">{t('accountActivity.badge.warned', { date })}</span>
      </Badge>
    );
  }
  return null;
}
