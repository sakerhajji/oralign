'use client';

import {
  Archive,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileClock,
  FilePenLine,
  History,
  MessageSquareText,
  PackageCheck,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
  UserRound,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrderHistory } from '@/lib/hooks/use-orders';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';
import type { OrderHistoryEntry, UserRole } from '@/lib/types';

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

const ACTION_ICONS: Record<string, typeof History> = {
  created: UserRound,
  updated: FilePenLine,
  submitted: Send,
  status_changed: RefreshCw,
  archived: Archive,
  restored: RefreshCw,
  files_uploaded: Upload,
  file_deleted: Archive,
  tooth_instructions_updated: FilePenLine,
  treatment_fee_declared: FileClock,
  treatment_fee_paid: CircleDollarSign,
  treatment_fee_proof_uploaded: Upload,
  treatment_fee_confirmed: ShieldCheck,
  treatment_plan_created: FilePenLine,
  treatment_plan_updated: RefreshCw,
  treatment_plan_approved: ShieldCheck,
  treatment_plan_rejected: FileClock,
  treatment_message: MessageSquareText,
  treatment_file_added: Upload,
  treatment_result_added: FileCheck2,
  quotation_created: FilePenLine,
  quotation_sent: Send,
  quotation_approved: ShieldCheck,
  quotation_rejected: FileClock,
  payment_started: Clock3,
  payment_succeeded: CircleDollarSign,
  payment_failed: FileClock,
  payment_rejected: FileClock,
  payment_cancelled: Archive,
  batch_unlocked: PackageCheck,
  batch_delivered: PackageCheck,
};

const POSITIVE_ACTIONS = new Set([
  'treatment_fee_paid',
  'treatment_fee_confirmed',
  'treatment_plan_approved',
  'quotation_approved',
  'payment_succeeded',
  'batch_delivered',
]);

const WARNING_ACTIONS = new Set([
  'treatment_plan_rejected',
  'quotation_rejected',
  'payment_failed',
  'payment_rejected',
  'payment_cancelled',
  'archived',
  'file_deleted',
]);

export function OrderHistory({ orderId }: { orderId: string }) {
  const { t, lang } = useT();
  const history = useOrderHistory(orderId);

  if (history.isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-44" />
        </CardHeader>
        <CardContent className="space-y-5">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex gap-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full max-w-lg" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (history.isError) {
    return (
      <Card>
        <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center">
          <History className="h-9 w-9 text-muted-foreground" />
          <p className="font-medium">{t('orderDetail.history.loadError')}</p>
          <Button variant="outline" onClick={() => history.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('orderDetail.history.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const entries = history.data ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-5 w-5" />
              {t('orderDetail.history.title')}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('orderDetail.history.description')}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 bg-background">
            {t('orderDetail.history.eventCount', { count: entries.length })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 p-6 text-center">
            <History className="h-9 w-9 text-muted-foreground" />
            <p className="font-medium">{t('orderDetail.history.empty')}</p>
          </div>
        ) : (
          <ol className="divide-y">
            {entries.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} lang={lang} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryRow({
  entry,
  lang,
}: {
  entry: OrderHistoryEntry;
  lang: 'en' | 'fr';
}) {
  const { t } = useT();
  const Icon = ACTION_ICONS[entry.action] ?? History;
  const metadata = entry.metadata ?? {};
  const changes = Object.entries(entry.changes ?? {});
  const message = typeof metadata.message === 'string' ? metadata.message : null;
  const reason = typeof metadata.reason === 'string' ? metadata.reason : null;
  const fileNames = Array.isArray(metadata.fileNames)
    ? metadata.fileNames.filter((item): item is string => typeof item === 'string')
    : [];
  const details = metadataDetails(metadata, t);

  return (
    <li className="relative flex gap-3 p-4 sm:gap-4 sm:p-5">
      <div
        className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-muted text-muted-foreground',
          POSITIVE_ACTIONS.has(entry.action) &&
            'border-emerald-200 bg-emerald-50 text-emerald-700',
          WARNING_ACTIONS.has(entry.action) &&
            'border-red-200 bg-red-50 text-red-700',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">
              {actionLabel(entry.action, t)}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {entry.actor?.name ?? t('orderDetail.history.system')}
              </span>
              {entry.actor?.role ? <RoleBadge role={entry.actor.role} /> : null}
              <span aria-hidden="true">·</span>
              <span>
                {format(new Date(entry.createdAt), 'PPp', {
                  locale: lang === 'fr' ? fr : enUS,
                })}
              </span>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit shrink-0 text-[10px]">
            {t(`orderDetail.history.sources.${entry.source}`)}
          </Badge>
        </div>

        {reason ? (
          <p className="mt-3 rounded-md border-l-2 border-red-300 bg-red-50/60 px-3 py-2 text-sm text-red-950">
            <span className="font-medium">{t('orderDetail.history.reason')}:</span>{' '}
            {reason}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground/85">
            {message}
          </p>
        ) : null}
        {fileNames.length > 0 ? (
          <p className="mt-3 break-words text-sm text-muted-foreground">
            {fileNames.join(', ')}
          </p>
        ) : null}
        {details.length > 0 ? (
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
            {details.map((detail) => (
              <div key={detail.label} className="flex min-w-0 gap-1.5">
                <dt className="shrink-0 text-muted-foreground">
                  {detail.label}:
                </dt>
                <dd className="break-words font-medium text-foreground/85">
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {changes.length > 0 ? (
          <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {changes.map(([field, change]) => (
              <div key={field} className="min-w-0 rounded-md border bg-background px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase text-muted-foreground">
                  {fieldLabel(field, t)}
                </dt>
                <dd className="mt-1 flex min-w-0 items-center gap-2 text-xs">
                  <span className="min-w-0 truncate text-muted-foreground" title={formatValue(change.from, t)}>
                    {formatValue(change.from, t)}
                  </span>
                  <span aria-hidden="true">→</span>
                  <span className="min-w-0 truncate font-medium" title={formatValue(change.to, t)}>
                    {formatValue(change.to, t)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </li>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const { t } = useT();
  return (
    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
      {t(`orderDetail.history.roles.${role}`)}
    </Badge>
  );
}

function actionLabel(action: string, t: Translate) {
  const key = `orderDetail.history.actions.${action}`;
  const translated = t(key);
  return translated === key ? action.replaceAll('_', ' ') : translated;
}

function fieldLabel(field: string, t: Translate) {
  const key = `orderDetail.history.fields.${field}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return field.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function formatValue(
  value: unknown,
  t: Translate,
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') {
    return value ? t('common.yes') : t('common.no');
  }
  if (Array.isArray(value)) return value.map(String).join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replaceAll('_', ' ');
}

function metadataDetails(
  metadata: Record<string, unknown>,
  t: Translate,
): Array<{ label: string; value: string }> {
  const details: Array<{ label: string; value: string }> = [];
  const add = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    details.push({
      label: t(`orderDetail.history.details.${key}`),
      value: formatValue(value, t),
    });
  };

  add('planVersion', metadata.version);
  add('quotationNumber', metadata.number);
  if (metadata.amount !== null && metadata.amount !== undefined) {
    add(
      'amount',
      [metadata.amount, metadata.currency].filter(Boolean).join(' '),
    );
  }
  add('paymentMethod', metadata.method);
  add('installment', metadata.installmentNumber);
  add('batch', metadata.batchNumber);
  if (metadata.fromStep !== undefined || metadata.toStep !== undefined) {
    add('steps', `${formatValue(metadata.fromStep, t)}-${formatValue(metadata.toStep, t)}`);
  }
  add('fileCategory', metadata.category);
  add('fileCount', metadata.count);
  add('instructionCount', metadata.instructionCount);
  add('fileName', metadata.fileName);

  return details;
}
