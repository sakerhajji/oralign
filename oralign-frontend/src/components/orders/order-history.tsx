'use client';

import {
  Archive,
  ArrowRightLeft,
  CircleDollarSign,
  ClipboardPlus,
  Clock3,
  Eye,
  FileCheck2,
  FileClock,
  FilePenLine,
  Gift,
  History,
  Landmark,
  MessageSquareText,
  PackageCheck,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  XCircle,
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
import { DEFAULT_MERCHANT_CURRENCY, formatPrice } from '@/lib/utils/currency';
import type { OrderHistoryEntry, UserRole } from '@/lib/types';
import {
  NOTE_REASON_ACTIONS,
  actionKeyOf,
  amountOf,
  displaySource,
  distinctCash,
  textOf,
} from './order-history-rules';

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
  treatment_fee_proof_replaced: Upload,
  treatment_fee_proof_removed: Undo2,
  treatment_fee_review_opened: Eye,
  treatment_fee_confirmed: ShieldCheck,
  treatment_fee_rejected: XCircle,
  treatment_plan_created: FilePenLine,
  treatment_plan_updated: RefreshCw,
  treatment_plan_approved: ShieldCheck,
  treatment_plan_rejected: FileClock,
  treatment_message: MessageSquareText,
  treatment_file_added: Upload,
  treatment_result_added: FileCheck2,
  quotation_created: FilePenLine,
  quotation_sent: Send,
  quotation_updated: FilePenLine,
  quotation_approved: ShieldCheck,
  quotation_rejected: FileClock,
  payment_started: Clock3,
  payment_succeeded: CircleDollarSign,
  payment_failed: FileClock,
  payment_rejected: XCircle,
  payment_cancelled: Archive,
  // Bank-transfer transitions journaled since 2026-11-27 (CONTRACT §5).
  payment_transfer_declared: Landmark,
  payment_proof_replaced: Upload,
  payment_transfer_withdrawn: Undo2,
  payment_review_opened: Eye,
  payment_confirmed: ShieldCheck,
  batch_unlocked: PackageCheck,
  batch_delivered: PackageCheck,
  welcome_gift_applied: Gift,
  supplemental_created: FilePenLine,
  supplemental_child_created: FilePenLine,
  supplemental_draft_updated: RefreshCw,
  supplemental_draft_archived: Trash2,
  supplemental_child_archived: Trash2,
  supplemental_submitted: Send,
  supplemental_child_submitted: Send,
  supplemental_reviewed: ShieldCheck,
  supplemental_child_reviewed: ShieldCheck,
  supplemental_converted: ArrowRightLeft,
};

/**
 * Supplemental-request actions the backend may add later still read as
 * one, under a generic label and icon, instead of their raw key.
 */
const SUPPLEMENTAL_ACTION_PREFIX = 'supplemental_';
const SUPPLEMENTAL_FALLBACK_ACTION = 'supplemental_other';

/** Enum-valued fields whose values carry their own dictionary labels. */
const VALUE_LABEL_PREFIXES: Record<string, string> = {
  reviewStatus: 'supplemental.status',
  coverageStatus: 'supplemental.coverage',
};

const POSITIVE_ACTIONS = new Set([
  'treatment_fee_paid',
  'treatment_fee_confirmed',
  'treatment_plan_approved',
  'quotation_approved',
  'payment_succeeded',
  'payment_confirmed',
  'batch_delivered',
  'welcome_gift_applied',
]);

const WARNING_ACTIONS = new Set([
  'treatment_plan_rejected',
  'quotation_rejected',
  'payment_failed',
  'payment_rejected',
  'payment_cancelled',
  'treatment_fee_rejected',
  'archived',
  'file_deleted',
  'supplemental_draft_archived',
  'supplemental_child_archived',
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
  // Unknown supplemental actions still get the supplemental icon.
  const Icon =
    ACTION_ICONS[entry.action] ??
    (isSupplementalAction(entry.action) ? ClipboardPlus : History);
  const metadata = entry.metadata ?? {};
  const changes = Object.entries(entry.changes ?? {});
  const message = typeof metadata.message === 'string' ? metadata.message : null;
  const reason = textOf(metadata.reason);
  const reasonIsNote = NOTE_REASON_ACTIONS.has(entry.action);
  // An admin's override note (confirming without a receipt…): the server
  // sends it to staff only.
  const overrideNote = textOf(metadata.overrideNote);
  const fileNames = Array.isArray(metadata.fileNames)
    ? metadata.fileNames.filter((item): item is string => typeof item === 'string')
    : [];
  const details = metadataDetails(metadata, t, lang);

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
              {actionLabel(actionKeyOf(entry), entry.action, t)}
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
            {t(`orderDetail.history.sources.${displaySource(entry)}`)}
          </Badge>
        </div>

        {reason && reasonIsNote ? (
          <p className="mt-3 rounded-md border-l-2 border-border bg-muted/60 px-3 py-2 text-sm text-foreground/85">
            <span className="font-medium">
              {entry.action === 'batch_unlocked'
                ? t('orderDetail.history.reason')
                : t('orderDetail.history.note')}
              :
            </span>{' '}
            {reason}
          </p>
        ) : reason ? (
          <p className="mt-3 rounded-md border-l-2 border-red-300 bg-red-50/60 px-3 py-2 text-sm text-red-950 dark:bg-red-950/30 dark:text-red-100">
            <span className="font-medium">{t('orderDetail.history.reason')}:</span>{' '}
            {reason}
          </p>
        ) : null}
        {overrideNote ? (
          <p className="mt-3 rounded-md border-l-2 border-amber-300 bg-amber-50/70 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="font-medium">{t('orderDetail.history.overrideNote')}:</span>{' '}
            {overrideNote}
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
                  <ChangeValue field={field} value={change.from} className="text-muted-foreground" />
                  <span aria-hidden="true">→</span>
                  <ChangeValue field={field} value={change.to} className="font-medium" />
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

function ChangeValue({
  field,
  value,
  className,
}: {
  field: string;
  value: unknown;
  className: string;
}) {
  const { t } = useT();
  const text = formatFieldValue(field, value, t);
  return (
    <span className={cn('min-w-0 truncate', className)} title={text}>
      {text}
    </span>
  );
}

function isSupplementalAction(action: string): boolean {
  return action.startsWith(SUPPLEMENTAL_ACTION_PREFIX);
}

/**
 * The label of `key` (an action, or a refinement of it such as
 * `batch_unlocked_manual`), else of the bare `action`, else a readable
 * form of the raw key.
 */
function actionLabel(key: string, action: string, t: Translate) {
  if (key !== action) {
    const refined = `orderDetail.history.actions.${key}`;
    const translatedRefined = t(refined);
    if (translatedRefined !== refined) return translatedRefined;
  }
  const dictKey = `orderDetail.history.actions.${action}`;
  const translated = t(dictKey);
  if (translated !== dictKey) return translated;
  if (isSupplementalAction(action)) {
    return t(`orderDetail.history.actions.${SUPPLEMENTAL_FALLBACK_ACTION}`);
  }
  return action.replaceAll('_', ' ');
}

/** A dictionary label when one exists for `prefix.value`, else null. */
function labelOf(prefix: string, value: unknown, t: Translate): string | null {
  if (typeof value !== 'string' || value === '') return null;
  const key = `${prefix}.${value}`;
  const translated = t(key);
  return translated === key ? null : translated;
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
  // Lists of records (selected teeth, contacts) read item by item.
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item, t)).join(', ') || '—';
  }
  if (typeof value === 'object') {
    return Object.values(value)
      .map((item) => formatValue(item, t))
      .join(' ');
  }
  return String(value).replaceAll('_', ' ');
}

function formatFieldValue(field: string, value: unknown, t: Translate): string {
  const prefix = VALUE_LABEL_PREFIXES[field];
  return (prefix && labelOf(prefix, value, t)) || formatValue(value, t);
}

function metadataDetails(
  metadata: Record<string, unknown>,
  t: Translate,
  lang: 'en' | 'fr',
): Array<{ label: string; value: string }> {
  const details: Array<{ label: string; value: string }> = [];
  const add = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    details.push({
      label: t(`orderDetail.history.details.${key}`),
      value: formatValue(value, t),
    });
  };
  // Journaled rows carry no currency (the merchant's); derived ones do.
  const currency =
    typeof metadata.currency === 'string' && metadata.currency.trim() !== ''
      ? metadata.currency
      : DEFAULT_MERCHANT_CURRENCY;
  const money = (value: unknown): string | null => {
    const amount = amountOf(value);
    return amount === null ? null : formatPrice(amount, currency);
  };

  add('planVersion', metadata.version);
  add('quotationNumber', metadata.number);
  if (metadata.amount !== null && metadata.amount !== undefined) {
    add('amount', money(metadata.amount) ?? metadata.amount);
  } else if (typeof metadata.total === 'number') {
    // welcome_gift_applied carries { treatmentFee, cbctFee, total, currency }.
    add('amount', money(metadata.total));
  }
  // A transfer's cash (stamp added, retenue kept back), when it differs.
  const cash = distinctCash(metadata);
  if (cash !== null) add('cashAmount', money(cash));
  const stamp = amountOf(metadata.stampAmount);
  if (stamp !== null && stamp > 0) {
    details.push({ label: t('withholdingUi.stamp'), value: money(stamp) ?? '—' });
  }
  const withheld = amountOf(metadata.withholdingAmount);
  if (withheld !== null && withheld > 0) {
    const rate = amountOf(metadata.withholdingRate);
    details.push({
      label:
        rate !== null && rate > 0
          ? t('withholdingUi.withheld', {
              rate: rate.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                maximumFractionDigits: 2,
              }),
            })
          : t('withholdingUi.withheldNoRate'),
      value: money(withheld) ?? '—',
    });
  }
  add(
    'paymentMethod',
    labelOf('paymentsDesk.method', metadata.method, t) ?? metadata.method,
  );
  // Whether the transfer came with its receipt (never the file itself).
  if (typeof metadata.hasProof === 'boolean') add('receiptAttached', metadata.hasProof);
  add('installment', metadata.installmentNumber);
  add('batch', metadata.batchNumber);
  if (metadata.fromStep !== undefined || metadata.toStep !== undefined) {
    add('steps', `${formatValue(metadata.fromStep, t)}-${formatValue(metadata.toStep, t)}`);
  }
  add('fileCategory', metadata.category);
  add('fileCount', metadata.count);
  add('instructionCount', metadata.instructionCount);
  add('fileName', metadata.fileName);
  const addLabelled = (key: string, prefix: string, value: unknown) => {
    const label = labelOf(prefix, value, t);
    if (label) add(key, label);
  };
  addLabelled('requestType', 'supplemental.type', metadata.requestType);
  addLabelled('decision', 'supplemental.status', metadata.decision);
  addLabelled('coverageStatus', 'supplemental.coverage', metadata.coverageStatus);
  add('correctionNumber', metadata.correctionNumber);
  add('childOrder', metadata.orderCode ?? metadata.childOrderId);

  return details;
}
