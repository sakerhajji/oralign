'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n/lang-context';
import { choiceOf } from '@/lib/production/arches';
import { warningsOf } from '@/lib/production/warnings';
import type { ProductionEventWithOrder } from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { formatBusinessDay, formatBusinessTime } from '@/lib/utils/business-day';
import { formatCount, groupDeclarations, stepsText, type DeclarationGroup } from './format';
import { AuthorLabel, caseSheetHref, WarningTags } from './parts';

/**
 * Entries as two-line rows: when, the act on which arch and steps, how
 * many on the right; then the case, who entered it, the recipient of a
 * delivery, the confirmed warnings and the note. A both-arch declaration
 * reads once. `cancelled` rows add who cancelled them, when and why (the
 * reason is for the lab only: the practitioner never sees it, D8).
 */
export function EventList({
  events,
  cancelled = false,
}: {
  events: ProductionEventWithOrder[];
  cancelled?: boolean;
}) {
  const groups = groupDeclarations(events);
  return (
    <ol className="divide-y">
      {groups.map((group) => (
        <EventRow key={group.key} group={group} cancelled={cancelled} />
      ))}
    </ol>
  );
}

function EventRow({ group, cancelled }: { group: DeclarationGroup; cancelled: boolean }) {
  const { t, lang } = useT();
  const { head } = group;
  const arch = choiceOf(group.arches);
  const recipient = head.deliveredTo ? t(`production.recipients.${head.deliveredTo}`) : null;

  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)_auto] gap-x-3 px-4 py-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
      <time
        dateTime={head.performedAt}
        className={cn('pt-px text-sm tabular-nums', cancelled && 'text-muted-foreground')}
      >
        {formatBusinessTime(head.performedAt, lang)}
      </time>

      <div className="min-w-0 space-y-1">
        <p className={cn('text-sm', cancelled && 'text-muted-foreground line-through')}>
          <span className="font-medium">{t(`production.acts.${head.type}`)}</span>
          <span className="text-muted-foreground"> · </span>
          {t(`production.arches.${arch}`)}
          <span className="text-muted-foreground"> · </span>
          <span className="tabular-nums">{stepsText(head.stepFrom, head.stepTo, t)}</span>
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <Link
            href={caseSheetHref(head.order.orderId)}
            className="rounded-sm font-medium text-foreground tabular-nums underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={t('productionAdmin.rows.openSheet', { code: head.order.orderCode })}
          >
            {head.order.orderCode}
          </Link>
          <span className="max-w-full truncate">{head.order.patientName}</span>
          <span aria-hidden="true">·</span>
          {head.origin === 'legacy_batch' ? (
            <span>{t('productionAdmin.rows.legacy')}</span>
          ) : (
            <AuthorLabel name={head.createdByName} role={head.createdByRole} />
          )}
          {recipient ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {head.deliveredToName
                  ? t('productionAdmin.rows.deliveredToNamed', {
                      recipient,
                      name: head.deliveredToName,
                    })
                  : t('productionAdmin.rows.deliveredTo', { recipient })}
              </span>
            </>
          ) : null}
        </p>
        {/* Each arch row keeps its own warnings: show them all, not the upper row's. */}
        <WarningTags warnings={warningsOf(group.rows)} />
        {head.note ? (
          <p className="text-xs break-words text-muted-foreground">
            {t('productionAdmin.rows.note', { note: head.note })}
          </p>
        ) : null}
        {cancelled && head.cancelledAt ? (
          <p className="text-xs break-words">
            {t('productionAdmin.rows.cancelledBy', {
              date: formatBusinessDay(head.cancelledAt, lang),
              time: formatBusinessTime(head.cancelledAt, lang),
              name: head.cancelledByName ?? t('productionAdmin.rows.deletedAccount'),
            })}
            {head.cancelReason ? (
              <span className="text-muted-foreground">
                {' · '}
                {t('productionAdmin.rows.reason', { reason: head.cancelReason })}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <span
        className={cn(
          'pt-px text-right text-sm font-semibold tabular-nums',
          cancelled && 'font-normal text-muted-foreground line-through',
        )}
      >
        <span className="sr-only">{t('productionAdmin.cols.quantity')} </span>
        {formatCount(group.quantity, lang)}
      </span>
    </li>
  );
}
