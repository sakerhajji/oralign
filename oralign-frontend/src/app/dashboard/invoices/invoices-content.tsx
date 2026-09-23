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
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  SendIcon,
  Trash2Icon,
  XCircleIcon,
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { PermanentDeleteDialog } from '@/components/shared/permanent-delete-dialog';
import { useAuth } from '@/lib/providers/auth-provider';
import { useT } from '@/lib/i18n/lang-context';
import {
  useArchiveInvoice,
  useBulkArchiveInvoices,
  useDownloadInvoicePdf,
  useExportInvoicesCsv,
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
const NEW_INVOICE_PATH = '/dashboard/invoices/new';
const editPath = (id: string) => `/dashboard/invoices/${id}/edit`;

/** Prisma Decimal arrives as a string over the wire. */
const n = (value: unknown): number => Number(value ?? 0);

type PeriodKey = 'all' | 'thisMonth' | 'lastMonth' | 'last30' | 'custom';

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** The from/to a preset resolves to; `custom` keeps whatever is typed. */
function periodRange(key: PeriodKey): { from: string; to: string } | null {
  const now = new Date();
  if (key === 'thisMonth' || key === 'lastMonth') {
    const offset = key === 'thisMonth' ? 0 : -1;
    return {
      from: isoDay(new Date(now.getFullYear(), now.getMonth() + offset, 1)),
      to: isoDay(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)),
    };
  }
  if (key === 'last30') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { from: isoDay(start), to: isoDay(now) };
  }
  if (key === 'all') return { from: '', to: '' };
  return null;
}

/**
 * Admin invoicing desk — the list.
 *
 * Header → status tabs with live counts → search and period → totals of
 * the whole filter → table (≥lg) or stacked cards (<lg) → pagination.
 * Every row action that changes state lives in one "…" menu so a row
 * stays readable; only the invoice number is a direct link (it opens the
 * PDF preview).
 */
export function InvoicesContent() {
  const { t, lang } = useT();
  const { user, isAdmin } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (user && !isAdmin) router.replace('/dashboard');
  }, [user, isAdmin, router]);

  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch] = useDebounce(searchInput, 300);
  const [status, setStatus] = React.useState<'all' | InvoiceStatus>('all');
  const [period, setPeriod] = React.useState<PeriodKey>('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const [purgeTarget, setPurgeTarget] = React.useState<Invoice | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<Invoice | null>(null);
  const [previewTarget, setPreviewTarget] = React.useState<Invoice | null>(null);
  // One clock for the whole render pass — an overdue badge must not flip
  // between two rows of the same table.
  const [now] = React.useState(() => Date.now());

  const filters = React.useMemo<InvoiceFilters>(() => {
    const next: InvoiceFilters = { page, limit: PAGE_SIZE };
    if (debouncedSearch.trim()) next.search = debouncedSearch.trim();
    if (status !== 'all') next.statuses = [status];
    if (from) next.issuedFrom = from;
    if (to) next.issuedTo = to;
    if (showArchived) next.includeDeleted = true;
    return next;
  }, [page, debouncedSearch, status, from, to, showArchived]);

  const list = useInvoices(filters, isAdmin);
  const summary = useInvoiceSummary(filters, isAdmin);

  const archive = useArchiveInvoice();
  const restore = useRestoreInvoice();
  const purge = usePermanentDeleteInvoice();
  const bulkArchive = useBulkArchiveInvoices();
  const update = useUpdateInvoice();
  const downloadPdf = useDownloadInvoicePdf();
  const exportCsv = useExportInvoicesCsv();
  const exportZip = useExportInvoicesZip();

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = list.data?.totalPages ?? 1;
  const busy =
    archive.isPending || restore.isPending || bulkArchive.isPending || update.isPending;

  // Any filter change resets both the page and the selection: acting on
  // rows that are no longer on screen is the classic bulk-action trap.
  const resetView = React.useCallback(() => {
    setPage(1);
    setSelected(new Set());
  }, []);

  const applyPeriod = (key: PeriodKey) => {
    setPeriod(key);
    const range = periodRange(key);
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
    resetView();
  };

  const clearFilters = () => {
    setSearchInput('');
    setStatus('all');
    setPeriod('all');
    setFrom('');
    setTo('');
    setShowArchived(false);
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
    Boolean(debouncedSearch || from || to) || status !== 'all' || showArchived;

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
    onStatus: (next: InvoiceStatus) => setStatusOf(invoice, next),
    onCancelInvoice: () => setCancelTarget(invoice),
    onArchive: () => archive.mutate(invoice.id),
    onRestore: () => restore.mutate(invoice.id),
    onPurge: () => setPurgeTarget(invoice),
  });

  if (user && !isAdmin) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-3 pb-8 sm:gap-5 sm:p-5 lg:p-8">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {t('invoicesAdmin.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('invoiceDesk.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href={NEW_INVOICE_PATH}>
              <PlusIcon className="mr-2 size-4" />
              {t('invoicesAdmin.create')}
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t('invoiceDesk.moreActions')}>
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => void list.refetch()} disabled={list.isFetching}>
                <RefreshCwIcon className={cn('size-4', list.isFetching && 'animate-spin')} />
                {t('invoicesAdmin.refresh')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportCsv.mutate(filters)}
                disabled={exportCsv.isPending}
              >
                <DownloadIcon className="size-4" />
                {t('invoicesAdmin.exportCsv')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setShowArchived((value) => !value);
                  resetView();
                }}
              >
                <ArchiveIcon className="size-4" />
                {t('invoicesAdmin.trash')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

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
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
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

      {/* ── Search + period ── */}
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
            className="pl-9"
          />
        </div>
        <Select value={period} onValueChange={(value) => applyPeriod(value as PeriodKey)}>
          <SelectTrigger className="w-[11rem]" aria-label={t('invoiceDesk.period')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('invoiceDesk.periodAll')}</SelectItem>
            <SelectItem value="thisMonth">{t('invoicesAdmin.thisMonth')}</SelectItem>
            <SelectItem value="lastMonth">{t('invoicesAdmin.lastMonth')}</SelectItem>
            <SelectItem value="last30">{t('invoiceDesk.period30')}</SelectItem>
            <SelectItem value="custom">{t('invoiceDesk.periodCustom')}</SelectItem>
          </SelectContent>
        </Select>
        {period === 'custom' ? (
          <div className="flex flex-1 items-center gap-2 sm:flex-none">
            <Input
              type="date"
              value={from}
              aria-label={t('invoicesAdmin.from')}
              onChange={(e) => {
                setFrom(e.target.value);
                resetView();
              }}
              className="w-full sm:w-[9.5rem]"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={to}
              aria-label={t('invoicesAdmin.to')}
              onChange={(e) => {
                setTo(e.target.value);
                resetView();
              }}
              className="w-full sm:w-[9.5rem]"
            />
          </div>
        ) : null}
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
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
            onClick={() => {
              setShowArchived(false);
              resetView();
            }}
          >
            {t('invoiceDesk.backToList')}
          </Button>
        </div>
      ) : null}

      {/* ── Totals of the whole filter, never of the page ── */}
      <dl className="grid grid-cols-2 divide-y rounded-xl bg-card ring-1 ring-foreground/10 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <SummaryFigure
          label={t('invoicesAdmin.kpiCount')}
          value={summary.isLoading ? null : String(summary.data?.count ?? 0)}
        />
        <SummaryFigure
          label={t('invoicesAdmin.kpiHt')}
          value={summary.isLoading ? null : formatPrice(summary.data?.subTotalHt ?? 0)}
        />
        <SummaryFigure
          label={t('invoicesAdmin.kpiTva')}
          value={summary.isLoading ? null : formatPrice(summary.data?.tvaAmount ?? 0)}
        />
        <SummaryFigure
          label={t('invoicesAdmin.kpiTtc')}
          value={summary.isLoading ? null : formatPrice(summary.data?.totalTtc ?? 0)}
          hint={t('invoicesAdmin.kpiBillableHint')}
          strong
        />
      </dl>

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
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
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
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
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
                : t('invoicesAdmin.empty')
          }
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t('invoicesAdmin.clearFilters')}
              </Button>
            ) : (
              <Button asChild size="sm">
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
                          {invoice.paymentId
                            ? t('invoicesAdmin.sourceAuto')
                            : t('invoicesAdmin.sourceManual')}
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
                    </p>
                    <DueHint invoice={invoice} now={now} />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <RowActions {...rowActions(invoice)} />
                    <span className="text-sm font-semibold tabular-nums">
                      {formatPrice(n(invoice.totalTtc), invoice.currency)}
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
                disabled={page <= 1 || list.isFetching}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                {t('invoiceDesk.previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
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
            <AlertDialogTitle>{t('invoiceDesk.cancelTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget ? `${cancelTarget.invoiceNumber} — ` : ''}
              {t('invoiceDesk.cancelBody')}
            </AlertDialogDescription>
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
        pending={purge.isPending}
        onConfirm={() => {
          if (!purgeTarget) return;
          purge.mutate(purgeTarget.id, { onSuccess: () => setPurgeTarget(null) });
        }}
      />
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────

function SummaryFigure({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  /** null while the aggregate is loading. */
  value: string | null;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <dt className="truncate text-xs text-muted-foreground">
        {label}
        {hint ? <span className="ml-1 opacity-70">({hint})</span> : null}
      </dt>
      <dd
        className={cn(
          'mt-0.5 truncate tabular-nums',
          strong ? 'text-base font-semibold sm:text-lg' : 'text-sm font-medium sm:text-base',
        )}
      >
        {value === null ? <Skeleton className="h-5 w-24" /> : value}
      </dd>
    </div>
  );
}

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
  const canCancel =
    !archived &&
    invoice.status !== InvoiceStatus.CANCELLED &&
    invoice.status !== InvoiceStatus.PAID;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('invoiceDesk.openMenu')}>
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

        {archived ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={busy} onClick={onRestore}>
              <RotateCcwIcon className="size-4" />
              {t('invoicesAdmin.restore')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onPurge}>
              <Trash2Icon className="size-4" />
              {t('invoicesAdmin.permanentDelete')}
            </DropdownMenuItem>
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
              <DropdownMenuItem disabled={busy} onClick={onCancelInvoice}>
                <XCircleIcon className="size-4" />
                {t('invoiceDesk.markCancelled')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem variant="destructive" disabled={busy} onClick={onArchive}>
              <ArchiveIcon className="size-4" />
              {t('invoicesAdmin.archive')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
