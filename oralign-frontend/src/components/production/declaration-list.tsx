'use client';

import Link from 'next/link';
import { Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Lang } from '@/lib/i18n/dict';
import { useT } from '@/lib/i18n/lang-context';
import type { ProductionEventView, ProductionEventWithOrder } from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { formatBusinessDay, formatBusinessTime } from '@/lib/utils/business-day';
import {
  groupArchChoice,
  stepsText,
  warningsOf,
  type DeclarationGroup,
  type Translate,
} from './production-format';
import { productionCaseHref } from './queue-list';

// An entry typed more than this after the act shows when it was typed.
const LATE_ENTRY_MS = 10 * 60_000;

interface Cancellation {
  key: string;
  at: string;
  by: string | null;
  reason: string | null;
  rows: ProductionEventView[];
}

/** Rows cancelled by the same request (same instant, author and reason) read as one line. */
function cancellationsOf(rows: readonly ProductionEventView[]): Cancellation[] {
  const byRequest = new Map<string, Cancellation>();
  for (const row of rows) {
    if (!row.cancelledAt) continue;
    const key = `${row.cancelledAt}|${row.cancelledById ?? ''}|${row.cancelReason ?? ''}`;
    const found = byRequest.get(key);
    if (found) found.rows.push(row);
    else {
      byRequest.set(key, {
        key,
        at: row.cancelledAt,
        by: row.cancelledByName,
        reason: row.cancelReason,
        rows: [row],
      });
    }
  }
  return [...byRequest.values()];
}

function when(t: Translate, iso: string, lang: Lang): string {
  return t('production.history.performed', {
    date: formatBusinessDay(iso, lang),
    time: formatBusinessTime(iso, lang),
  });
}

function authorOf(t: Translate, event: ProductionEventView): string {
  if (event.origin === 'legacy_batch') return t('production.history.legacy');
  const name = event.createdByName ?? t('production.history.unknownAuthor');
  const role = event.createdByRole ? t(`production.history.roles.${event.createdByRole}`) : null;
  return t('production.history.by', { name: role ? `${name} (${role})` : name });
}

/**
 * The declarations of a case (or of a day), newest first, one item per
 * declaration with its arches. A cancelled entry stays, struck through,
 * with who cancelled it and why (staff only: the practitioner never sees
 * the reason). "Annuler" shows where the server says it is allowed.
 */
export function DeclarationList<E extends ProductionEventView>({
  groups,
  onCancel,
  showOrder = false,
}: {
  groups: DeclarationGroup<E>[];
  onCancel: (group: DeclarationGroup<E>) => void;
  /** "Ma journée": each entry links to its case. */
  showOrder?: boolean;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      {groups.map((group) => (
        <DeclarationItem
          key={group.declarationId}
          group={group}
          onCancel={onCancel}
          showOrder={showOrder}
        />
      ))}
    </ul>
  );
}

function DeclarationItem<E extends ProductionEventView>({
  group,
  onCancel,
  showOrder,
}: {
  group: DeclarationGroup<E>;
  onCancel: (group: DeclarationGroup<E>) => void;
  showOrder: boolean;
}) {
  const { t, lang } = useT();
  const { lead, rows } = group;
  const live = rows.filter((row) => !row.cancelledAt);
  const allCancelled = live.length === 0;
  const canCancel = rows.some((row) => !row.cancelledAt && row.canCancel);
  const warnings = warningsOf(rows);
  const order = showOrder && 'order' in lead ? (lead as ProductionEventWithOrder).order : null;
  // An imported row's createdAt is the import, not an entry: never "saisi le".
  const late =
    lead.origin === 'declared' &&
    Math.abs(new Date(lead.createdAt).getTime() - new Date(lead.performedAt).getTime()) > LATE_ENTRY_MS;
  const steps = stepsText(t, lead.stepFrom, lead.stepTo);
  const summary = t('production.form.summary', {
    act: t(`production.acts.${lead.type}`),
    arch: t(`production.archesShort.${groupArchChoice(rows)}`),
    steps,
  });
  const recipient = lead.deliveredTo
    ? lead.deliveredToName
      ? t('production.history.recipientNamed', {
          recipient: t(`production.recipients.${lead.deliveredTo}`),
          name: lead.deliveredToName,
        })
      : t(`production.recipients.${lead.deliveredTo}`)
    : null;

  return (
    <li className={cn('flex gap-3 px-4 py-3.5', allCancelled && 'bg-muted/30')}>
      <div className="min-w-0 flex-1">
        {order && (
          <Link
            href={productionCaseHref(order.orderId)}
            className="inline-flex min-h-12 max-w-full items-center gap-1 truncate rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none pointer-fine:md:mb-1 pointer-fine:md:min-h-0"
          >
            <span className="tabular-nums">{order.orderCode}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{order.patientName}</span>
          </Link>
        )}
        <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', allCancelled && 'text-muted-foreground')}>
          <span className={cn('font-medium', allCancelled && 'line-through')}>
            {t(`production.acts.${lead.type}`)}
          </span>
          <span className="text-sm text-muted-foreground">
            {t(`production.archesShort.${groupArchChoice(rows)}`)}
          </span>
          {allCancelled && (
            <Badge variant="outline" className="text-muted-foreground">
              {t('production.history.cancelled')}
            </Badge>
          )}
        </p>
        <p className={cn('mt-0.5 text-sm tabular-nums', allCancelled && 'text-muted-foreground line-through')}>
          {steps}
          {' · '}
          {t(rows.length > 1 ? 'production.history.quantity' : 'production.history.quantityOne', {
            count: lead.quantity,
          })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {when(t, lead.performedAt, lang)} · {authorOf(t, lead)}
          {late &&
            ` · ${t('production.history.recordedLater', {
              date: formatBusinessDay(lead.createdAt, lang),
              time: formatBusinessTime(lead.createdAt, lang),
            })}`}
        </p>
        {recipient && (
          <p className="mt-1 text-xs">{t('production.history.recipient', { recipient })}</p>
        )}
        {lead.note && (
          <p className="mt-1.5 text-sm whitespace-pre-wrap wrap-anywhere text-foreground/90">{lead.note}</p>
        )}
        {warnings.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {warnings.map((code) => (
              <li key={code}>
                <Badge
                  variant="secondary"
                  className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                >
                  {t(`production.warnings.${code}.title`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {cancellationsOf(rows).map((cancellation) => {
          const name = cancellation.by ?? t('production.history.unknownAuthor');
          const date = formatBusinessDay(cancellation.at, lang);
          return (
            <p key={cancellation.key} className="mt-1.5 text-xs text-muted-foreground">
              {cancellation.rows.length === rows.length
                ? t('production.history.cancelledBy', {
                    date,
                    time: formatBusinessTime(cancellation.at, lang),
                    name,
                  })
                : t('production.history.cancelledArch', {
                    arch: cancellation.rows.map((row) => t(`production.arches.${row.arch}`)).join(', '),
                    date,
                    name,
                  })}
              {cancellation.reason && ` — ${t('production.history.reason', { reason: cancellation.reason })}`}
            </p>
          );
        })}
      </div>
      {canCancel && (
        <Button
          variant="outline"
          className="h-12 shrink-0 self-start px-3 pointer-fine:md:h-8"
          onClick={() => onCancel(group)}
          aria-label={t('production.history.cancelAria', { summary })}
        >
          <Undo2 aria-hidden="true" />
          {t('production.history.cancel')}
        </Button>
      )}
    </li>
  );
}

export function DeclarationListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="space-y-1.5 px-4 py-3.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-56" />
        </li>
      ))}
    </ul>
  );
}
