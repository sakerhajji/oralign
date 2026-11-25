'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDebounce } from 'use-debounce';
import {
  ArchiveIcon,
  BanknoteIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  Loader2Icon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SendIcon,
  Trash2Icon,
  UserRoundIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Figure, FigureRow } from '@/components/ui/figure-row';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge';
import type { DayRange } from '@/components/invoices/accounting/period';
import { PermanentDeleteDialog } from '@/components/shared/permanent-delete-dialog';
import { adminInvoicesService } from '@/lib/api/admin-invoices.service';
import { toastMutationError } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import {
  useArchiveInvoice,
  useBulkArchiveInvoices,
  useDownloadInvoicePdf,
  useEmailInvoice,
  useExportInvoicesZip,
  useInvoices,
  useInvoiceSummary,
  usePermanentDeleteInvoice,
  useRestoreInvoice,
  useUpdateInvoice,
} from '@/lib/hooks';
import { InvoiceStatus, type Invoice, type InvoiceFilters } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatTimestampDay } from '@/lib/utils/calendar-date';
import { formatPrice } from '@/lib/utils/currency';
import { InvoicePreviewDialog } from './invoice-preview';

const PAGE_SIZE = 25;
export const NEW_INVOICE_PATH = '/dashboard/invoices/new';
const editPath = (id: string) => `/dashboard/invoices/${id}/edit`;

/** Prisma Decimal arrives as a string over the wire. */
const n = (value: unknown): number => Number(value ?? 0);

/** Generated from a payment: an installment (paymentId) or a treatment fee. */
const isAutomatic = (invoice: Invoice) =>
  Boolean(invoice.paymentId || invoice.treatmentFeeOrderId);

/** Only a draft never issued can be erased; issued and paid ones are cancelled. */
const isErasable = (invoice: Invoice) =>
  invoice.status === InvoiceStatus.DRAFT && !invoice.issuedAt;

/**
 * A practitioner opened from the récapitulatif. `nonce` changes on every
 * pick, so picking the same docteur twice still refocuses the list.
 */
export interface DoctorFocus {
  /** null: the invoices carry no practitioner account, matched by name. */
  id: string | null;
  name: string;
  nonce: number;
}

/**
 * Admin invoicing desk — the list.
 *
 * Status tabs with live counts → search → totals of the whole filter →
 * table (≥lg) or stacked cards (<lg) → pagination. The period comes from
 * the page's period bar. Every row action that changes state lives in
 * one "…" menu so a row stays readable; only the invoice number is a
 * direct link (it opens the PDF preview).
 */
export function InvoiceListView({
  range,
  showArchived,
  onShowArchivedChange,
  doctorFocus,
  onClearDoctor,
  onAllDates,
}: {
  /** The page's period (Tunis days, inclusive). */
  range: DayRange;
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  doctorFocus: DoctorFocus | null;
  onClearDoctor: () => void;
  /** Widen the page's period to every date (an empty list's way out). */
  onAllDates: () => void;
}) {
  const { t, lang } = useT();
  const router = useRouter();

  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch] = useDebounce(searchInput, 300);
  const [status, setStatus] = React.useState<'all' | InvoiceStatus>('all');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const [purgeTarget, setPurgeTarget] = React.useState<Invoice | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<Invoice | null>(null);
  const [previewTarget, setPreviewTarget] = React.useState<Invoice | null>(null);
  // One clock for the whole render pass — an overdue badge must not flip
  // between two rows of the same table.
  const [now] = React.useState(() => Date.now());

  // Any filter change resets both the page and the selection: acting on
  // rows that are no longer on screen is the classic bulk-action trap.
  // The period and the trash belong to the page, so they are watched here.
  const viewKey = `${range.from ?? ''}|${range.to ?? ''}|${showArchived}`;
  const [seenViewKey, setSeenViewKey] = React.useState(viewKey);
  if (seenViewKey !== viewKey) {
    setSeenViewKey(viewKey);
    setPage(1);
    setSelected(new Set());
  }

  // A docteur opened from the récapitulatif: his invoices, every status.
  // Without an account id the name goes into the search box instead.
  const [seenFocus, setSeenFocus] = React.useState<DoctorFocus | null>(null);
  if (doctorFocus !== seenFocus) {
    setSeenFocus(doctorFocus);
    if (doctorFocus && doctorFocus.nonce !== seenFocus?.nonce) {
      setSearchInput(doctorFocus.id ? '' : doctorFocus.name);
      setStatus('all');
      setPage(1);
      setSelected(new Set());
    }
  }
  const doctorId = doctorFocus?.id ?? null;

  const filters = React.useMemo<InvoiceFilters>(() => {
    const next: InvoiceFilters = { page, limit: PAGE_SIZE };
    if (debouncedSearch.trim()) next.search = debouncedSearch.trim();
    if (status !== 'all') next.statuses = [status];
    if (range.from) next.issuedFrom = range.from;
    if (range.to) next.issuedTo = range.to;
    if (doctorId) next.doctorId = doctorId;
    if (showArchived) next.includeDeleted = true;
    return next;
  }, [page, debouncedSearch, status, range.from, range.to, doctorId, showArchived]);

  const list = useInvoices(filters);
  const summary = useInvoiceSummary(filters);

  const archive = useArchiveInvoice();
  const restore = useRestoreInvoice();
  const purge = usePermanentDeleteInvoice();
  const bulkArchive = useBulkArchiveInvoices();
  const update = useUpdateInvoice();
  const emailInvoice = useEmailInvoice();
  const downloadPdf = useDownloadInvoicePdf();
  // Archiving before the purge (the API erases archived drafts only).
  const [purgeArchiving, setPurgeArchiving] = React.useState(false);
  const exportZip = useExportInvoicesZip();

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = list.data?.totalPages ?? 1;
  const busy =
    archive.isPending || restore.isPending || bulkArchive.isPending || update.isPending;

  /**
   * Erase a draft: the API purges archived drafts only, so an active one
   * is archived first (quietly — the purge toast says what happened).
   */
  const purgeDraft = async (invoice: Invoice) => {
    if (!invoice.deletedAt) {
      setPurgeArchiving(true);
      try {
        await adminInvoicesService.archive(invoice.id);
      } catch (err) {
        toastMutationError(err);
        return;
      } finally {
        setPurgeArchiving(false);
      }
    }
    purge.mutate(invoice.id, {
      onSuccess: () => setPurgeTarget(null),
      // Archived but not erased: show where it went.
      onError: () => void list.refetch(),
    });
  };

  const resetView = React.useCallback(() => {
    setPage(1);
    setSelected(new Set());
  }, []);

  const clearFilters = () => {
    setSearchInput('');
    setStatus('all');
    onShowArchivedChange(false);
    onClearDoctor();
    resetView();
  };

  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((row) => row.id)),
    );

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setStatusOf = (invoice: Invoice, next: InvoiceStatus) =>
    update.mutate({ id: invoice.id, input: { status: next } });

  const hasFilters =
    Boolean(debouncedSearch || doctorId) || status !== 'all' || showArchived;
  const periodBound = Boolean(range.from || range.to);

  const byStatus = summary.data?.byStatus ?? {};
  const statusTabs: { key: 'all' | InvoiceStatus; label: string; count: number }[] = [
    {
      key: 'all',
      label: t('invoicesAdmin.tabAll'),
      count: summary.data?.totalAllStatuses ?? 0,
    },
    {
      key: InvoiceStatus.DRAFT,
      label: t('invoicesAdmin.statusDraft'),
      count: byStatus[InvoiceStatus.DRAFT] ?? 0,
    },
    {
      key: InvoiceStatus.ISSUED,
      label: t('invoicesAdmin.statusIssued'),
      count: byStatus[InvoiceStatus.ISSUED] ?? 0,
    },
    {
      key: InvoiceStatus.PAID,
      label: t('invoicesAdmin.statusPaid'),
      count: byStatus[InvoiceStatus.PAID] ?? 0,
    },
    {
      key: InvoiceStatus.CANCELLED,
      label: t('invoicesAdmin.statusCancelled'),
      count: byStatus[InvoiceStatus.CANCELLED] ?? 0,
    },
  ];

  const rowActions = (invoice: Invoice) => ({
    invoice,
    busy,
    onPreview: () => setPreviewTarget(invoice),
    onDownload: () =>
      downloadPdf.mutate({ id: invoice.id, invoiceNumber: invoice.invoiceNumber }),
    onEdit: () => router.push(editPath(invoice.id)),
    onEmail: () => emailInvoice.mutate(invoice.id),
    emailing: emailInvoice.isPending && emailInvoice.variables === invoice.id,
    onStatus: (next: InvoiceStatus) => setStatusOf(invoice, next),
    onCancelInvoice: () => setCancelTarget(invoice),
    onArchive: () => archive.mutate(invoice.id),
    onRestore: () => restore.mutate(invoice.id),
    onPurge: () => setPurgeTarget(invoice),
  });

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
      {/* ── Status tabs (counts ignore the status filter itself) ── */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div
          role="group"
          aria-label={t('invoicesAdmin.colStatus')}
          className="inline-flex min-w-max gap-1 rounded-lg bg-muted p-1"
        >
          {statusTabs.map((tab) => {
            const active = status === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setStatus(tab.key);
                  resetView();
                }}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors sm:min-h-0',
                  active
                    ? 'bg-background font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                <span className="text-xs text-muted-foreground tabular-nums">{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Search + the docteur picked from the récapitulatif ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[13rem] flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              resetView();
            }}
            placeholder={t('invoicesAdmin.searchPlaceholder')}
            aria-label={t('invoicesAdmin.searchPlaceholder')}
            className="h-11 pl-9 sm:h-8"
          />
        </div>
        {doctorFocus?.id ? (
          <button
            type="button"
            onClick={() => {
              onClearDoctor();
              resetView();
            }}
            aria-label={t('invoiceDesk.accounting.list.clearDoctor', { name: doctorFocus.name })}
            className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-muted px-3 text-sm sm:min-h-8"
          >
            <UserRoundIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">
              {t('invoiceDesk.accounting.list.doctorChip', { name: doctorFocus.name })}
            </span>
            <XIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ) : null}
        {hasFilters ? (
          <Button variant="ghost" className="h-11 sm:h-7" size="sm" onClick={clearFilters}>
            {t('invoicesAdmin.clearFilters')}
          </Button>
        ) : null}
      </div>

      {showArchived ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <ArchiveIcon className="size-4" />
            {t('invoicesAdmin.trash')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 sm:h-7"
            onClick={() => onShowArchivedChange(false)}
          >
            {t('invoiceDesk.backToList')}
          </Button>
        </div>
      ) : null}

      {/* ── Totals of the whole filter, never of the page ── */}
      <FigureRow className="sm:grid-cols-4">
        <Figure
          label={t('invoicesAdmin.kpiCount')}
          value={summary.isLoading ? null : String(summary.data?.count ?? 0)}
        />
        <Figure
          label={t('invoicesAdmin.kpiHt')}
          value={summary.isLoading ? null : formatPrice(summary.data?.subTotalHt ?? 0)}
        />
        <Figure
          label={t('invoicesAdmin.kpiTva')}
          value={summary.isLoading ? null : formatPrice(summary.data?.tvaAmount ?? 0)}
        />
        <Figure
          label={t('invoicesAdmin.kpiTtc')}
          value={summary.isLoading ? null : formatPrice(summary.data?.totalTtc ?? 0)}
          hint={t('invoicesAdmin.kpiBillableHint')}
          strong
        />
      </FigureRow>

      {/* ── Selection ── */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2">
          <span className="text-sm font-medium">
            {t('invoicesAdmin.selected', { count: selected.size })}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-7"
              onClick={() => exportZip.mutate(Array.from(selected))}
              disabled={exportZip.isPending}
            >
              {exportZip.isPending ? (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              ) : (
                <DownloadIcon className="mr-2 size-4" />
              )}
              {t('invoicesAdmin.exportZip')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-7"
              onClick={() =>
                bulkArchive.mutate(Array.from(selected), {
                  onSuccess: () => setSelected(new Set()),
                })
              }
              disabled={bulkArchive.isPending}
            >
              <ArchiveIcon className="mr-2 size-4" />
              {t('invoicesAdmin.bulkArchive')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-11 sm:h-7"
              onClick={() => setSelected(new Set())}
            >
              {t('invoicesAdmin.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── Rows ── */}
      {list.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState
          title={t('invoicesAdmin.error')}
          action={
            <Button variant="outline" size="sm" className="h-11 sm:h-7" onClick={() => void list.refetch()}>
              {t('invoiceDesk.retry')}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            showArchived
              ? t('invoiceDesk.emptyTrash')
              : hasFilters
                ? t('invoicesAdmin.emptyFiltered')
                : periodBound
                  ? t('invoiceDesk.accounting.list.emptyPeriod')
                  : t('invoicesAdmin.empty')
          }
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" className="h-11 sm:h-7" onClick={clearFilters}>
                {t('invoicesAdmin.clearFilters')}
              </Button>
            ) : periodBound ? (
              <Button variant="outline" size="sm" className="h-11 sm:h-7" onClick={onAllDates}>
                {t('invoiceDesk.accounting.list.allDates')}
              </Button>
            ) : (
              <Button asChild size="sm" className="h-11 sm:h-7">
                <Link href={NEW_INVOICE_PATH}>
                  <PlusIcon className="mr-2 size-4" />
                  {t('invoiceDesk.emptyCta')}
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Table ≥ lg. The wrapper scrolls, never the page body. */}
          <div className="hidden min-w-0 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 pl-4">
                      <Checkbox
                        checked={selected.size === rows.length && rows.length > 0}
                        onCheckedChange={toggleAll}
                        aria-label={t('invoiceDesk.selectAll')}
                      />
                    </TableHead>
                    <TableHead>{t('invoicesAdmin.colNumber')}</TableHead>
                    <TableHead>{t('invoicesAdmin.colClient')}</TableHead>
                    <TableHead>{t('invoicesAdmin.colDate')}</TableHead>
                    <TableHead>{t('invoicesAdmin.colStatus')}</TableHead>
                    <TableHead className="text-right">{t('invoicesAdmin.colTtc')}</TableHead>
                    <TableHead className="w-12 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((invoice) => (
                    <TableRow key={invoice.id} className={cn(invoice.deletedAt && 'opacity-60')}>
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={selected.has(invoice.id)}
                          onCheckedChange={() => toggleOne(invoice.id)}
                          aria-label={invoice.invoiceNumber}
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setPreviewTarget(invoice)}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {invoice.invoiceNumber}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          <span
                            title={
                              isAutomatic(invoice)
                                ? t('invoicesAdmin.sourceAutoTitle')
                                : t('invoicesAdmin.sourceManualTitle')
                            }
                          >
                            {isAutomatic(invoice)
                              ? t('invoicesAdmin.sourceAuto')
                              : t('invoicesAdmin.sourceManual')}
                          </span>
                          <EmailedHint invoice={invoice} />
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0 max-w-64">
                          <p className="truncate">{invoice.clientName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {invoice.order?.orderCode ?? invoice.clientEmail ?? '—'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <p className="text-sm">{formatTimestampDay(invoice.issueDate, lang)}</p>
                        <DueHint invoice={invoice} now={now} />
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                        {formatPrice(n(invoice.totalTtc), invoice.currency)}
                        <NetPayableHint invoice={invoice} />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <RowActions {...rowActions(invoice)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Stacked cards < lg — same data, same actions. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {rows.map((invoice) => (
              <li
                key={invoice.id}
                className={cn(
                  'rounded-xl bg-card p-3 ring-1 ring-foreground/10',
                  invoice.deletedAt && 'opacity-60',
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    className="mt-1"
                    checked={selected.has(invoice.id)}
                    onCheckedChange={() => toggleOne(invoice.id)}
                    aria-label={invoice.invoiceNumber}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewTarget(invoice)}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {invoice.invoiceNumber}
                      </button>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>
                    <p className="mt-0.5 truncate text-sm">{invoice.clientName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatTimestampDay(invoice.issueDate, lang)}
                      {invoice.order?.orderCode ? ` · ${invoice.order.orderCode}` : ''}
                      <EmailedHint invoice={invoice} />
                    </p>
                    <DueHint invoice={invoice} now={now} />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <RowActions {...rowActions(invoice)} />
                    <span className="text-right text-sm font-semibold tabular-nums">
                      {formatPrice(n(invoice.totalTtc), invoice.currency)}
                      <NetPayableHint invoice={invoice} />
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── Pagination ── */}
      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground tabular-nums">
            {t('invoiceDesk.range', {
              from: (page - 1) * PAGE_SIZE + 1,
              to: (page - 1) * PAGE_SIZE + rows.length,
              total,
            })}
          </span>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-11 sm:h-7"
                disabled={page <= 1 || list.isFetching}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t('invoiceDesk.previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11 sm:h-7"
                disabled={page >= totalPages || list.isFetching}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                {t('invoiceDesk.next')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <InvoicePreviewDialog
        invoice={previewTarget}
        onOpenChange={(open) => {
          if (!open) setPreviewTarget(null);
        }}
      />

      <AlertDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('invoicesAdmin.cancelInvoiceTitle', { number: cancelTarget?.invoiceNumber ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('invoicesAdmin.cancelInvoiceBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('invoiceDesk.keepInvoice')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (cancelTarget) setStatusOf(cancelTarget, InvoiceStatus.CANCELLED);
                setCancelTarget(null);
              }}
            >
              {t('invoiceDesk.markCancelled')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PermanentDeleteDialog
        open={Boolean(purgeTarget)}
        onOpenChange={(open) => {
          if (!open) setPurgeTarget(null);
        }}
        title={t('invoicesAdmin.permanentTitle')}
        description={
          purgeTarget
            ? `${purgeTarget.invoiceNumber} — ${t('invoicesAdmin.permanentBody')}`
            : t('invoicesAdmin.permanentBody')
        }
        confirmLabel={t('invoicesAdmin.permanentDelete')}
        pending={purge.isPending || purgeArchiving}
        onConfirm={() => {
          if (purgeTarget) void purgeDraft(purgeTarget);
        }}
      />
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────

/** "Due 12 Oct" — turns into an overdue warning once the date has passed. */
function DueHint({ invoice, now }: { invoice: Invoice; now: number }) {
  const { t, lang } = useT();
  if (!invoice.dueDate || invoice.status !== InvoiceStatus.ISSUED) return null;
  const overdue = new Date(invoice.dueDate).getTime() < now;
  return (
    <p className={cn('text-xs', overdue ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
      {overdue
        ? t('invoiceDesk.overdue')
        : t('invoiceDesk.dueOn', { date: formatTimestampDay(invoice.dueDate, lang) })}
    </p>
  );
}

/** " · Envoyée le 12 nov." — the last e-mail of the PDF to the doctor. */
function EmailedHint({ invoice }: { invoice: Invoice }) {
  const { t, lang } = useT();
  if (!invoice.emailedAt) return null;
  const date = formatTimestampDay(invoice.emailedAt, lang);
  return (
    <span
      title={
        invoice.emailedTo
          ? t('invoicesAdmin.emailedTitle', { email: invoice.emailedTo, date })
          : undefined
      }
    >
      {' · '}
      <MailIcon aria-hidden="true" className="inline size-3 align-[-2px]" />{' '}
      {t('invoicesAdmin.emailedOn', { date })}
    </span>
  );
}

/** "Net 990,000" under the total when a retenue à la source applies. */
function NetPayableHint({ invoice }: { invoice: Invoice }) {
  const { t } = useT();
  if (n(invoice.withholdingAmount) <= 0) return null;
  return (
    <span className="block text-xs font-normal text-muted-foreground">
      {t('invoicesAdmin.netPayableShort', {
        amount: formatPrice(n(invoice.netPayable), invoice.currency),
      })}
    </span>
  );
}

function EmptyState({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-12 text-center ring-1 ring-foreground/10">
      <FileTextIcon className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{title}</p>
      {action}
    </div>
  );
}

function RowActions({
  invoice,
  busy,
  onPreview,
  onDownload,
  onEdit,
  onEmail,
  emailing,
  onStatus,
  onCancelInvoice,
  onArchive,
  onRestore,
  onPurge,
}: {
  invoice: Invoice;
  busy: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onEdit: () => void;
  /** E-mail the PDF to the practitioner. */
  onEmail: () => void;
  emailing: boolean;
  onStatus: (status: InvoiceStatus) => void;
  onCancelInvoice: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const { t } = useT();
  const archived = Boolean(invoice.deletedAt);
  const canIssue = !archived && invoice.status === InvoiceStatus.DRAFT;
  const canPay =
    !archived &&
    (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.ISSUED);
  // Owner rule: "deleting" an issued or paid invoice cancels it (the
  // number stays in the series); only a draft never issued is erased.
  const canCancel =
    !archived &&
    (invoice.status === InvoiceStatus.ISSUED || invoice.status === InvoiceStatus.PAID);
  const canErase = isErasable(invoice);
  const canEmail =
    !archived &&
    (invoice.status === InvoiceStatus.ISSUED || invoice.status === InvoiceStatus.PAID);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 sm:size-8"
          aria-label={t('invoiceDesk.openMenu')}
        >
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={onPreview}>
          <EyeIcon className="size-4" />
          {t('invoicesAdmin.view')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDownload}>
          <DownloadIcon className="size-4" />
          {t('invoicesAdmin.downloadPdf')}
        </DropdownMenuItem>
        {canEmail ? (
          <DropdownMenuItem disabled={emailing} onClick={onEmail}>
            {emailing ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <MailIcon className="size-4" />
            )}
            {invoice.emailedAt ? t('invoicesAdmin.resendEmail') : t('invoicesAdmin.sendEmail')}
          </DropdownMenuItem>
        ) : null}

        {archived ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={busy} onClick={onRestore}>
              <RotateCcwIcon className="size-4" />
              {t('invoicesAdmin.restore')}
            </DropdownMenuItem>
            {canErase ? (
              <DropdownMenuItem variant="destructive" onClick={onPurge}>
                <Trash2Icon className="size-4" />
                {t('invoicesAdmin.permanentDelete')}
              </DropdownMenuItem>
            ) : null}
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon className="size-4" />
              {t('invoicesAdmin.edit')}
            </DropdownMenuItem>
            {canIssue || canPay ? <DropdownMenuSeparator /> : null}
            {canIssue ? (
              <DropdownMenuItem disabled={busy} onClick={() => onStatus(InvoiceStatus.ISSUED)}>
                <SendIcon className="size-4" />
                {t('invoiceDesk.markIssued')}
              </DropdownMenuItem>
            ) : null}
            {canPay ? (
              <DropdownMenuItem disabled={busy} onClick={() => onStatus(InvoiceStatus.PAID)}>
                <BanknoteIcon className="size-4" />
                {t('invoiceDesk.markPaid')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            {canCancel ? (
              <DropdownMenuItem variant="destructive" disabled={busy} onClick={onCancelInvoice}>
                <XCircleIcon className="size-4" />
                {t('invoiceDesk.markCancelled')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem disabled={busy} onClick={onArchive}>
              <ArchiveIcon className="size-4" />
              {t('invoicesAdmin.archive')}
            </DropdownMenuItem>
            {canErase ? (
              <DropdownMenuItem variant="destructive" disabled={busy} onClick={onPurge}>
                <Trash2Icon className="size-4" />
                {t('invoicesAdmin.deleteDraft')}
              </DropdownMenuItem>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
