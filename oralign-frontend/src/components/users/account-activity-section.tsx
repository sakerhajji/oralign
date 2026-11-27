'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Loader2,
  Moon,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Unlock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { extractApiError } from '@/lib/api';
import {
  activityEventLabelKey,
  activityStatusLabelKey,
  daysUntil,
  formatActivityDateTime,
  formatActivityDay,
  reactivationReasonOf,
  REACTIVATION_REASON_MAX,
  REACTIVATION_REASON_MIN,
} from '@/lib/account-activity/account-activity';
import { useAccountActivityEvents, useReactivateDoctor } from '@/lib/hooks/use-users';
import { useT } from '@/lib/i18n/lang-context';
import {
  ACCOUNT_ACTIVITY_ERROR,
  UserRole,
  type AccountActivityEvent,
  type AccountActivityEventKind,
  type DoctorActivitySummary,
  type User,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { DORMANT_BADGE, WARNED_BADGE } from './activity-badge';

const JOURNAL_PAGE_SIZE = 5;

/**
 * User sheet → Account → « Activité » (dentists only, doctor inactivity
 * spec §5): the activity status, the last submitted order, the deadline
 * of the current period, « Réactiver » for a dormant account (reason
 * required, in a dialog), and the account history (warnings,
 * deactivation, reactivations, block / unblock), newest first.
 *
 * Dormancy is not « Bloqué »: the section says what the doctor keeps.
 * Every day shown is an Africa/Tunis day.
 */
export function AccountActivitySection({ user }: { user: User }) {
  const { t } = useT();
  const titleId = useId();
  const [reactivateOpen, setReactivateOpen] = useState(false);

  // Dentists only; a payload without the block (older backend) hides it.
  const activity = user.activity;
  if (user.role !== UserRole.DENTIST || !activity) return null;
  const dormant = Boolean(user.inactiveSince ?? activity.inactiveSince);

  return (
    <section aria-labelledby={titleId}>
      <h3
        id={titleId}
        className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {t('accountActivity.section.title')}
      </h3>

      <div className="rounded-lg border">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-muted-foreground">
              {t('accountActivity.section.statusLabel')}
            </p>
            <StatusBadge status={dormant ? 'inactive' : activity.status} />
          </div>
          {dormant && (
            <Button
              type="button"
              className="w-full sm:w-auto pointer-coarse:min-h-12"
              onClick={() => setReactivateOpen(true)}
            >
              <ShieldCheck aria-hidden="true" />
              {t('accountActivity.section.reactivate')}
            </Button>
          )}
        </div>

        <ActivityFacts activity={activity} dormant={dormant} inactiveSince={user.inactiveSince ?? null} />

        <p className="border-t bg-muted/30 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          {t(explanationKey(activity, dormant))}
        </p>
      </div>

      <ActivityJournal userId={user.id} />

      {/* Stays mounted when the account turns active: the success
          callback that closes it must still run. */}
      <ReactivateDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        userId={user.id}
        fullName={user.fullName}
      />
    </section>
  );
}

/**
 * The explanation under the facts: what dormancy keeps, why no deadline
 * runs (rule off, account not concerned), or what the deadline means.
 */
function explanationKey(activity: DoctorActivitySummary, dormant: boolean): string {
  if (dormant) return 'accountActivity.section.dormantExplain';
  if (!activity.ruleEnabled) return 'accountActivity.section.ruleOff';
  if (!activity.deadlineAt) return 'accountActivity.section.notConcerned';
  return 'accountActivity.section.warnedExplain';
}

function StatusBadge({ status }: { status: DoctorActivitySummary['status'] }) {
  const { t } = useT();
  if (status === 'inactive') {
    return (
      <Badge className={DORMANT_BADGE}>
        <Moon aria-hidden="true" />
        {t(activityStatusLabelKey(status))}
      </Badge>
    );
  }
  if (status === 'warned') {
    return (
      <Badge className={WARNED_BADGE}>
        <Hourglass aria-hidden="true" />
        {t(activityStatusLabelKey(status))}
      </Badge>
    );
  }
  return (
    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
      <CheckCircle2 aria-hidden="true" />
      {t(activityStatusLabelKey(status))}
    </Badge>
  );
}

function ActivityFacts({
  activity,
  dormant,
  inactiveSince,
}: {
  activity: DoctorActivitySummary;
  dormant: boolean;
  inactiveSince: string | null;
}) {
  const { t, lang } = useT();
  const day = (iso: string) => formatActivityDay(iso, lang);
  const facts: { key: string; label: string; value: ReactNode }[] = [
    {
      key: 'last',
      label: t('accountActivity.section.lastOrder'),
      value: activity.lastSubmittedOrderAt
        ? day(activity.lastSubmittedOrderAt)
        : t('accountActivity.section.noOrder'),
    },
  ];
  const since = inactiveSince ?? activity.inactiveSince;
  if (dormant && since) {
    facts.push({
      key: 'since',
      label: t('accountActivity.section.inactiveSince'),
      value: day(since),
    });
  } else {
    facts.push({
      key: 'anchor',
      label: t('accountActivity.section.anchor'),
      value: day(activity.anchorAt),
    });
    if (activity.deadlineAt) {
      const days = daysUntil(activity.deadlineAt);
      const one = lang === 'fr' ? days <= 1 : days === 1;
      facts.push({
        key: 'deadline',
        label: t('accountActivity.section.deadline'),
        value: (
          <span
            className={cn(activity.status === 'warned' && 'text-amber-700 dark:text-amber-300')}
          >
            {day(activity.deadlineAt)}{' '}
            <span className="font-normal text-muted-foreground">
              ({t(one ? 'accountActivity.section.deadlineInOne' : 'accountActivity.section.deadlineInMany', { count: days })})
            </span>
          </span>
        ),
      });
    }
  }
  if (activity.activityResetAt) {
    facts.push({
      key: 'reset',
      label: t('accountActivity.section.reactivatedAt'),
      value: day(activity.activityResetAt),
    });
  }

  return (
    <dl className="grid grid-cols-1 gap-px border-t bg-border sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={fact.key} className="min-w-0 bg-background px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Journal ─────────────────────────────────────────────────────────────────

const EVENT_ICON: Record<AccountActivityEventKind, typeof Moon> = {
  warning_30d: Hourglass,
  warning_7d: TriangleAlert,
  deactivated: Moon,
  reactivated: RotateCcw,
  blocked: Ban,
  unblocked: Unlock,
};

function ActivityJournal({ userId }: { userId: string }) {
  const { t } = useT();
  const [page, setPage] = useState(1);
  const query = useAccountActivityEvents(userId, { page, limit: JOURNAL_PAGE_SIZE });
  const rows = query.data?.data ?? [];
  const totalPages = Math.max(1, query.data?.totalPages ?? 1);

  return (
    <div className="mt-4">
      <h4 className="mb-2 text-sm font-medium">{t('accountActivity.journal.title')}</h4>
      {query.isLoading ? (
        <ul className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex gap-3 rounded-lg border p-3">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : query.isError && !query.data ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">{t('accountActivity.journal.loadError')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            <RefreshCw aria-hidden="true" />
            {t('accountActivity.journal.retry')}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {t('accountActivity.journal.empty')}
        </p>
      ) : (
        <>
          <ol
            aria-label={t('accountActivity.journal.aria')}
            aria-busy={query.isPlaceholderData}
            className={cn(
              'divide-y rounded-lg border transition-opacity',
              query.isPlaceholderData && 'opacity-60',
            )}
          >
            {rows.map((event) => (
              <JournalRow key={event.id} event={event} />
            ))}
          </ol>
          {totalPages > 1 && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pointer-coarse:min-h-12"
                disabled={page <= 1 || query.isPlaceholderData}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft aria-hidden="true" />
                {t('accountActivity.journal.newer')}
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                {t('accountActivity.journal.page', { page, total: totalPages })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pointer-coarse:min-h-12"
                disabled={page >= totalPages || query.isPlaceholderData}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                {t('accountActivity.journal.older')}
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function JournalRow({ event }: { event: AccountActivityEvent }) {
  const { t, lang } = useT();
  const Icon = EVENT_ICON[event.kind] ?? Hourglass;
  const warning = event.kind === 'warning_30d' || event.kind === 'warning_7d';
  return (
    <li className="flex gap-3 p-3">
      <span
        aria-hidden="true"
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground',
          event.kind === 'deactivated' && 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
          warning && 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
          event.kind === 'reactivated' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
          event.kind === 'blocked' && 'bg-destructive/10 text-destructive',
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-medium">{t(activityEventLabelKey(event.kind))}</p>
          <time
            dateTime={event.createdAt}
            className="text-xs text-muted-foreground tabular-nums"
          >
            {formatActivityDateTime(event.createdAt, lang)}
          </time>
        </div>
        <p className="text-xs text-muted-foreground">
          {event.actor
            ? t('accountActivity.journal.by', { name: event.actor.name })
            : t('accountActivity.journal.system')}
        </p>
        {warning && (
          <p className="text-xs text-muted-foreground">
            {t('accountActivity.journal.announced', {
              date: formatActivityDay(event.deadlineAt, lang),
            })}
          </p>
        )}
        {event.reason && (
          <p className="text-sm break-words whitespace-pre-line">
            {t('accountActivity.journal.reason', { reason: event.reason })}
          </p>
        )}
      </div>
    </li>
  );
}

// ─── Reactivation dialog ─────────────────────────────────────────────────────

function ReactivateDialog({
  open,
  onOpenChange,
  userId,
  fullName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  fullName: string;
}) {
  const { t } = useT();
  const fieldId = useId();
  const reactivate = useReactivateDoctor();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmedLength = reason.trim().length;
  const valid = reactivationReasonOf(reason) !== null;
  const tooLong = trimmedLength > REACTIVATION_REASON_MAX;
  const localError =
    touched && !valid
      ? tooLong
        ? t('accountActivity.reactivate.tooLong', { max: REACTIVATION_REASON_MAX })
        : t('accountActivity.reactivate.tooShort', { min: REACTIVATION_REASON_MIN })
      : null;
  const apiError = reactivate.error ? apiErrorText(reactivate.error, t) : null;
  const error = localError ?? apiError;

  const close = (next: boolean) => {
    if (reactivate.isPending) return;
    onOpenChange(next);
    if (!next) {
      setReason('');
      setTouched(false);
      reactivate.reset();
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    const value = reactivationReasonOf(reason);
    if (!value || reactivate.isPending) return;
    reactivate.mutate(
      { id: userId, reason: value },
      { onSuccess: () => close(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t('accountActivity.reactivate.title', { name: fullName })}</DialogTitle>
            <DialogDescription>{t('accountActivity.reactivate.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={fieldId}>{t('accountActivity.reactivate.reasonLabel')}</Label>
            <Textarea
              id={fieldId}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reactivate.error) reactivate.reset();
              }}
              onBlur={() => setTouched(true)}
              rows={4}
              maxLength={REACTIVATION_REASON_MAX + 50}
              placeholder={t('accountActivity.reactivate.reasonPlaceholder')}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${fieldId}-hint${error ? ` ${fieldId}-error` : ''}`}
              disabled={reactivate.isPending}
              className="min-h-24 resize-y text-base sm:text-sm"
            />
            <div className="flex items-start justify-between gap-3 text-xs">
              <p id={`${fieldId}-hint`} className="text-muted-foreground">
                {t('accountActivity.reactivate.reasonHint')}
              </p>
              <span
                className={cn(
                  'shrink-0 tabular-nums text-muted-foreground',
                  tooLong && 'text-destructive',
                )}
              >
                {t('accountActivity.reactivate.counter', {
                  count: trimmedLength,
                  max: REACTIVATION_REASON_MAX,
                })}
              </span>
            </div>
            {error && (
              <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:min-h-12"
              disabled={reactivate.isPending}
              onClick={() => close(false)}
            >
              {t('accountActivity.reactivate.cancel')}
            </Button>
            <Button
              type="submit"
              className="pointer-coarse:min-h-12"
              disabled={reactivate.isPending}
              aria-busy={reactivate.isPending}
            >
              {reactivate.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              {reactivate.isPending
                ? t('accountActivity.reactivate.pending')
                : t('accountActivity.reactivate.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The reactivation failure, in the reader's language for the known codes. */
function apiErrorText(error: unknown, t: ReturnType<typeof useT>['t']): string {
  const info = extractApiError(error);
  if (info.errorCode === ACCOUNT_ACTIVITY_ERROR.REACTIVATION_REASON_REQUIRED) {
    return t('accountActivity.reactivate.tooShort', { min: REACTIVATION_REASON_MIN });
  }
  return info.message;
}
