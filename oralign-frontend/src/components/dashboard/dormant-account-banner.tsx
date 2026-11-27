'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Hourglass, MessageCircle, Moon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  activityBannerOf,
  formatActivityDay,
} from '@/lib/account-activity/account-activity';
import { useT } from '@/lib/i18n/lang-context';
import { useRecheckAccountOnMount } from '@/lib/hooks/use-can-order';
import { useAuth } from '@/lib/providers/auth-provider';
import { UserRole } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Doctor dashboard notice of the inactivity rule (spec §5), from the
 * /users/me payload:
 * - dormant (`inactiveSince` set): ordering is suspended, what stays
 *   available, and how to get the account reactivated (support);
 * - warned (the deadline is within 30 days while the rule runs): the
 *   date, and "Create an order" to keep the account active.
 * Renders nothing otherwise, and for every other role.
 */
export function DormantAccountBanner({ className }: { className?: string }) {
  const { t, lang } = useT();
  const { user } = useAuth();
  const titleId = useId();
  const banner = user?.role === UserRole.DENTIST ? activityBannerOf(user) : null;
  // The dashboard is where a reactivated doctor comes back: re-read
  // /users/me so a stale dormant notice clears itself.
  useRecheckAccountOnMount(banner?.kind === 'dormant');
  if (!banner) return null;

  if (banner.kind === 'dormant') {
    return (
      <section
        aria-labelledby={titleId}
        className={cn(
          'flex flex-col gap-4 rounded-xl border border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5 dark:border-slate-700 dark:bg-slate-900/50',
          className,
        )}
      >
        <div className="flex min-w-0 gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Moon className="size-4" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('accountActivity.banner.dormantTitle')}
            </h2>
            <p className="max-w-[68ch] text-sm leading-6 text-slate-700 dark:text-slate-300">
              {t('accountActivity.banner.dormantBody')}
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="tabular-nums">
                {t('accountActivity.banner.dormantSince', {
                  date: formatActivityDay(banner.since, lang),
                })}
              </span>{' '}
              {t('accountActivity.banner.dormantHow')}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="shrink-0 bg-background pointer-coarse:h-12">
          <Link href="/dashboard/support">
            <MessageCircle aria-hidden="true" />
            {t('accountActivity.banner.contact')}
          </Link>
        </Button>
      </section>
    );
  }

  return <WarnedBanner titleId={titleId} deadlineAt={banner.deadlineAt} className={className} />;
}

function WarnedBanner({
  titleId,
  deadlineAt,
  className,
}: {
  titleId: string;
  deadlineAt: string;
  className?: string;
}) {
  const { t, lang } = useT();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5 dark:border-amber-900/60 dark:bg-amber-950/30',
        className,
      )}
    >
      <div className="flex min-w-0 gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
        >
          <Hourglass className="size-4" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <h2 id={titleId} className="text-base font-semibold text-amber-950 dark:text-amber-100">
            {t('accountActivity.banner.warnedTitle', {
              date: formatActivityDay(deadlineAt, lang),
            })}
          </h2>
          <p className="max-w-[68ch] text-sm leading-6 text-amber-900 dark:text-amber-200">
            {t('accountActivity.banner.warnedBody')}
          </p>
        </div>
      </div>
      <Button asChild className="shrink-0 pointer-coarse:h-12">
        <Link href="/dashboard/orders/new">
          <Plus aria-hidden="true" />
          {t('accountActivity.banner.newOrder')}
        </Link>
      </Button>
    </section>
  );
}

/**
 * /dashboard/orders/new for a dormant doctor: the wizard would only end
 * on 403 ACCOUNT_DORMANT, so the page explains instead, says what stays
 * available, and offers support and the way back. Mounting it re-reads
 * /users/me, so the gate lifts as soon as the account is active again.
 */
export function DormantOrderGate() {
  const { t } = useT();
  const titleId = useId();
  // The « compte réactivé » notice links here: re-read /users/me so a
  // reactivated doctor gets the wizard at once instead of this page.
  useRecheckAccountOnMount();
  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-xl bg-card px-5 py-10 text-center ring-1 ring-foreground/10 sm:px-8"
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        <Moon className="size-5" />
      </span>
      <div className="space-y-2">
        <h1 id={titleId} className="text-xl font-semibold tracking-tight">
          {t('accountActivity.gate.title')}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">{t('accountActivity.gate.body')}</p>
        <p className="text-sm leading-6 text-muted-foreground">{t('accountActivity.gate.keeps')}</p>
      </div>
      <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
        <Button asChild variant="outline" className="pointer-coarse:h-12">
          <Link href="/dashboard">{t('accountActivity.gate.back')}</Link>
        </Button>
        <Button asChild className="pointer-coarse:h-12">
          <Link href="/dashboard/support">
            <MessageCircle aria-hidden="true" />
            {t('accountActivity.gate.contact')}
          </Link>
        </Button>
      </div>
    </section>
  );
}
