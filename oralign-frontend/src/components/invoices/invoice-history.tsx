'use client';

import * as React from 'react';
import { HistoryIcon } from 'lucide-react';
import { useInvoiceStatusLabel } from '@/components/invoices/invoice-status-badge';
import { formatRate } from '@/components/payments/withholding';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { useT } from '@/lib/i18n/lang-context';
import { InvoiceStatus, PaymentMethod, type InvoiceAuditEntry } from '@/lib/types';
import { formatBusinessDay, formatBusinessTime } from '@/lib/utils/business-day';
import { formatTimestampDay } from '@/lib/utils/calendar-date';
import { formatPrice } from '@/lib/utils/currency';

/** Fields printed as money (3 decimals, with the invoice currency). */
const MONEY_FIELDS = new Set([
  'discountAmount',
  'stampDuty',
  'subTotalHt',
  'tvaAmount',
  'totalTtc',
  'withholdingAmount',
  'netPayable',
]);
const RATE_FIELDS = new Set(['tvaRate', 'withholdingRate', 'discountPercent']);
const DATE_FIELDS = new Set(['issueDate', 'dueDate', 'emailedAt']);
/** Links to other records: an id means nothing to a reader, the change does. */
const LINK_FIELDS = new Set(['orderId', 'patientId', 'doctorId']);

const PAYMENT_METHODS = new Set<string>(Object.values(PaymentMethod));
const INVOICE_STATUSES = new Set<string>(Object.values(InvoiceStatus));

/** Entries shown before "Show more": a long-lived invoice can carry 50. */
const FIRST_PAGE = 8;

/**
 * "Historique" of an invoice, on its edit screen: who changed what, when,
 * each field from → to, money in TND with its 3 decimals. The backend
 * keeps the log once an invoice is (or becomes) issued or paid, newest
 * first.
 */
export function InvoiceHistory({
  entries,
  currency,
}: {
  entries: InvoiceAuditEntry[];
  currency: string;
}) {
  const { t, lang } = useT();
  const statusLabel = useInvoiceStatusLabel();
  const [showAll, setShowAll] = React.useState(false);

  /** A dictionary label, or the fallback when the key is unknown. */
  const label = (path: string, fallback: string) => {
    const text = t(path);
    return text === path ? fallback : text;
  };

  const value = (field: string, raw: unknown): string => {
    if (raw === null || raw === undefined || raw === '') return t('invoicesAdmin.historyEmpty');
    if (MONEY_FIELDS.has(field)) return formatPrice(raw as number | string, currency);
    if (RATE_FIELDS.has(field)) return `${formatRate(raw as number | string, lang)} %`;
    if (DATE_FIELDS.has(field) && typeof raw === 'string') return formatTimestampDay(raw, lang);
    if (field === 'status' && typeof raw === 'string' && INVOICE_STATUSES.has(raw)) {
      return statusLabel(raw as InvoiceStatus);
    }
    if (field === 'paymentMethod' && typeof raw === 'string' && PAYMENT_METHODS.has(raw)) {
      return t(`paymentsDesk.methodLong.${raw}`);
    }
    if (field === 'language' && (raw === 'fr' || raw === 'en')) {
      return raw === 'fr' ? 'Français' : 'English';
    }
    if (typeof raw === 'boolean') return t(raw ? 'invoicesAdmin.historyYes' : 'invoicesAdmin.historyNo');
    return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : JSON.stringify(raw);
  };

  const visible = showAll ? entries : entries.slice(0, FIRST_PAGE);

  return (
    <SectionCard title={t('invoicesAdmin.historyTitle')} description={t('invoicesAdmin.historyDesc')}>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('invoicesAdmin.auditEmpty')}</p>
      ) : (
        <ol className="space-y-3">
          {visible.map((entry) => {
            const changes = Object.entries(entry.changes ?? {});
            return (
              <li key={entry.id} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                >
                  <HistoryIcon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">
                      {label(`invoicesAdmin.historyAction.${entry.action}`, entry.action)}
                    </span>{' '}
                    <span className="text-muted-foreground">
                      · {formatBusinessDay(entry.createdAt, lang)}{' '}
                      {formatBusinessTime(entry.createdAt, lang)} · {t('invoicesAdmin.auditBy', {
                        actor: entry.actorName ?? t('invoicesAdmin.historySystem'),
                      })}
                    </span>
                  </p>
                  {changes.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {changes.map(([field, change]) => (
                        <li key={field} className="break-words">
                          <span className="font-medium text-foreground">
                            {label(`invoicesAdmin.historyField.${field}`, field)}
                          </span>
                          {' : '}
                          {field === 'lines' ? (
                            t('invoicesAdmin.historyLinesReplaced')
                          ) : LINK_FIELDS.has(field) ? (
                            t('invoicesAdmin.historyChanged')
                          ) : (
                            <>
                              <span className="line-through decoration-muted-foreground/60">
                                {value(field, change?.from)}
                              </span>
                              {' → '}
                              <span className="text-foreground">{value(field, change?.to)}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {!showAll && entries.length > FIRST_PAGE ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3 max-sm:h-11"
          onClick={() => setShowAll(true)}
        >
          {t('invoicesAdmin.historyShowMore', { count: entries.length - FIRST_PAGE })}
        </Button>
      ) : null}
    </SectionCard>
  );
}
