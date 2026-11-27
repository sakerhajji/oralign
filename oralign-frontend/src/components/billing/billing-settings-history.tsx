'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useBillingRuleFormat } from '@/components/billing/billing-rule-format';
import { useBillingSettingsHistory } from '@/lib/hooks/use-company-billing';
import { useT } from '@/lib/i18n/lang-context';
import { formatBusinessDay, formatBusinessTime } from '@/lib/utils/business-day';

/** Rows per page: one save of the rules writes up to 7. */
export const BILLING_HISTORY_PAGE_SIZE = 10;

/**
 * "Historique des règles fiscales": every change of the retenue (switch,
 * rate, threshold), the stamp, the TVA rate and the inactivity rule, from →
 * to, with the admin and the Tunis date, newest first. Paged on the
 * server; loading, empty and error (with retry) states.
 */
export function BillingSettingsHistory({ currency }: { currency: string }) {
  const { t, lang } = useT();
  const [page, setPage] = useState(1);
  const history = useBillingSettingsHistory(page, BILLING_HISTORY_PAGE_SIZE);
  const { fieldLabel, valueLabel } = useBillingRuleFormat(currency);
  const data = history.data;
  const totalPages = data?.totalPages ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" aria-hidden />
          {t('withholdingRules.history.title')}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t('withholdingRules.history.description')}</p>
      </CardHeader>
      <CardContent>
        {history.isPending ? (
          <div className="space-y-3" aria-busy>
            {[0, 1, 2].map((key) => (
              <div key={key} className="flex gap-3">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : history.isError && !data ? (
          <div className="flex flex-col items-start gap-2" role="alert">
            <p className="text-sm text-muted-foreground">{t('withholdingRules.history.loadFailed')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void history.refetch()}
              disabled={history.isFetching}
              className="gap-2 pointer-coarse:h-12"
            >
              {history.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t('withholdingRules.history.retry')}
            </Button>
          </div>
        ) : !data || data.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('withholdingRules.history.empty')}</p>
        ) : (
          <>
            <ol className="space-y-3" aria-busy={history.isPlaceholderData || undefined}>
              {data.data.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                  >
                    <History className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm break-words">
                      <span className="font-medium">{fieldLabel(entry.field)}</span>
                      {' : '}
                      {entry.before === null ? (
                        <>
                          <span className="tabular-nums">{valueLabel(entry.field, entry.after)}</span>{' '}
                          <span className="text-muted-foreground">
                            ({t('withholdingRules.history.initial')})
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-muted-foreground tabular-nums line-through decoration-muted-foreground/60">
                            {valueLabel(entry.field, entry.before)}
                          </span>
                          <span aria-hidden> → </span>
                          <span className="sr-only">, </span>
                          <span className="tabular-nums">{valueLabel(entry.field, entry.after)}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <time dateTime={entry.createdAt}>
                        {formatBusinessDay(entry.createdAt, lang)}{' '}
                        {formatBusinessTime(entry.createdAt, lang)}
                      </time>
                      {' · '}
                      {t('withholdingRules.history.by', {
                        actor: entry.actorName ?? t('withholdingRules.history.system'),
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {totalPages > 1 ? (
              <nav
                className="mt-4 flex items-center justify-between gap-2 border-t pt-3"
                aria-label={t('withholdingRules.history.title')}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || history.isFetching}
                  className="gap-1 pointer-coarse:h-12 pointer-coarse:min-w-12"
                >
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
                  <span className="max-sm:sr-only">{t('withholdingRules.history.newer')}</span>
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                  {t('withholdingRules.history.pageOf', { page, pages: totalPages })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages || history.isFetching}
                  className="gap-1 pointer-coarse:h-12 pointer-coarse:min-w-12"
                >
                  <span className="max-sm:sr-only">{t('withholdingRules.history.older')}</span>
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
