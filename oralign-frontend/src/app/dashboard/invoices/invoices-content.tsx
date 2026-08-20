'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useDebounce } from 'use-debounce';
import {
  ArchiveIcon,
  DownloadIcon,
  FileTextIcon,
  Loader2Icon,
  MoreVertical,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
} from '@/lib/hooks';
import { InvoiceStatus, type Invoice, type InvoiceFilters } from '@/lib/types';
import { InvoiceEditorDialog } from './invoice-editor';

const PAGE_SIZE = 25;

/** Prisma Decimal arrives as a string over the wire. */
const n = (v: unknown): number => Number(v ?? 0);

function money(value: unknown, currency = 'TND'): string {
  return `${n(value).toFixed(3)} ${currency}`;
}

function shortDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

/** First and last day of a month offset from today, as ISO dates. */
function monthRange(offset: number): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: iso(first), to: iso(last) };
}

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { t } = useT();
  switch (status) {
    case InvoiceStatus.PAID:
      return (
        <Badge className="border-emerald-300/60 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          {t('invoicesAdmin.statusPaid')}
        </Badge>
      );
    case InvoiceStatus.ISSUED:
      return (
        <Badge className="border-sky-300/60 bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
          {t('invoicesAdmin.statusIssued')}
        </Badge>
      );
    case InvoiceStatus.CANCELLED:
      return <Badge variant="destructive">{t('invoicesAdmin.statusCancelled')}</Badge>;
    default:
      return <Badge variant="secondary">{t('invoicesAdmin.statusDraft')}</Badge>;
  }
}

/**
 * Admin invoicing desk — the central list.
 *
 * Filters, period range and multi-select follow the patterns already used
 * by /dashboard/orders and /dashboard/users rather than inventing a new
 * one: debounced search, a Set of selected ids, and a highlighted action
 * bar that appears with the selection.
 */
export function InvoicesContent() {
  const { t } = useT();
  const { user, isAdmin } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (user && !isAdmin) router.replace('/dashboard');
  }, [user, isAdmin, router]);

  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch] = useDebounce(searchInput, 300);
  const [status, setStatus] = React.useState<'all' | InvoiceStatus>('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Invoice | null>(null);
  const [purgeTarget, setPurgeTarget] = React.useState<Invoice | null>(null);

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
  const downloadPdf = useDownloadInvoicePdf();
  const exportCsv = useExportInvoicesCsv();
  const exportZip = useExportInvoicesZip();

  const rows = list.data?.data ?? [];
  const totalPages = list.data?.totalPages ?? 1;
  const busy =
    archive.isPending ||
    restore.isPending ||
    bulkArchive.isPending ||
    exportZip.isPending;

  // Any filter change resets both the page and the selection: acting on
  // rows that are no longer on screen is the classic bulk-action trap.
  const resetView = React.useCallback(() => {
    setPage(1);
    setSelected(new Set());
  }, []);

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyMonth = (offset: number) => {
    const { from: f, to: t2 } = monthRange(offset);
    setFrom(f);
    setTo(t2);
    resetView();
  };

  const clearFilters = () => {
    setSearchInput('');
    setStatus('all');
    setFrom('');
    setTo('');
    setShowArchived(false);
    resetView();
  };

  const hasFilters =
    Boolean(debouncedSearch || from || to) || status !== 'all' || showArchived;

  if (user && !isAdmin) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 pb-8 sm:p-5 lg:p-8">
      {/* ── En-tête + totaux de la période ── */}
      <header className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between lg:p-6">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <FileTextIcon className="size-4" />
            </span>
            ORALIGN
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('invoicesAdmin.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('invoicesAdmin.intro')}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Totals of the FILTER, not of the page — the number the
              accountant reconciles a month against. */}
          <div className="rounded-xl border bg-muted/30 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t('invoicesAdmin.periodTotal')}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {summary.isLoading ? '…' : money(summary.data?.totalTtc)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('invoicesAdmin.periodCount', { count: summary.data?.count ?? 0 })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void list.refetch()}
              disabled={list.isFetching}
            >
              <RefreshCwIcon
                className={list.isFetching ? 'mr-2 size-4 animate-spin' : 'mr-2 size-4'}
              />
              {t('invoicesAdmin.refresh')}
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <PlusIcon className="mr-2 size-4" />
              {t('invoicesAdmin.create')}
            </Button>
          </div>
        </div>
      </header>

      {/* ── Barre de filtres ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              resetView();
            }}
            placeholder={t('invoicesAdmin.searchPlaceholder')}
            className="pl-9"
          />
        </div>

        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as 'all' | InvoiceStatus);
            resetView();
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t('invoicesAdmin.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('invoicesAdmin.allStatuses')}</SelectItem>
            <SelectItem value={InvoiceStatus.DRAFT}>{t('invoicesAdmin.statusDraft')}</SelectItem>
            <SelectItem value={InvoiceStatus.ISSUED}>{t('invoicesAdmin.statusIssued')}</SelectItem>
            <SelectItem value={InvoiceStatus.PAID}>{t('invoicesAdmin.statusPaid')}</SelectItem>
            <SelectItem value={InvoiceStatus.CANCELLED}>{t('invoicesAdmin.statusCancelled')}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t('invoicesAdmin.from')}</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetView();
            }}
            className="w-[150px]"
          />
          <span className="text-xs text-muted-foreground">{t('invoicesAdmin.to')}</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetView();
            }}
            className="w-[150px]"
          />
        </div>

        {/* One click = "give me March", the actual export use case. */}
        <Button variant="outline" size="sm" onClick={() => applyMonth(0)}>
          {t('invoicesAdmin.thisMonth')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => applyMonth(-1)}>
          {t('invoicesAdmin.lastMonth')}
        </Button>
        <Button
          variant={showArchived ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setShowArchived((v) => !v);
            resetView();
          }}
        >
          <ArchiveIcon className="mr-2 size-4" />
          {t('invoicesAdmin.trash')}
        </Button>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            {t('invoicesAdmin.clearFilters')}
          </Button>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => exportCsv.mutate(filters)}
          disabled={exportCsv.isPending}
        >
          {exportCsv.isPending ? (
            <Loader2Icon className="mr-2 size-4 animate-spin" />
          ) : (
            <DownloadIcon className="mr-2 size-4" />
          )}
          {t('invoicesAdmin.exportCsv')}
        </Button>
      </div>

      {/* ── Barre d'actions groupées ── */}
      {selected.size > 0 ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm font-medium">
              {t('invoicesAdmin.selected', { count: selected.size })}
            </span>
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
          </CardContent>
        </Card>
      ) : null}

      {/* ── Tableau ── */}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <CardTitle className="text-base">{t('invoicesAdmin.title')}</CardTitle>
          <CardDescription>
            {t('invoicesAdmin.periodCount', { count: list.data?.total ?? 0 })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              {t('invoicesAdmin.loading')}
            </div>
          ) : list.isError ? (
            <div className="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {t('invoicesAdmin.error')}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              {hasFilters ? t('invoicesAdmin.emptyFiltered') : t('invoicesAdmin.empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selected.size === rows.length && rows.length > 0}
                        onCheckedChange={toggleAll}
                        aria-label="select all"
                      />
                    </TableHead>
                    <TableHead>{t('invoicesAdmin.colNumber')}</TableHead>
                    <TableHead>{t('invoicesAdmin.colClient')}</TableHead>
                    <TableHead>{t('invoicesAdmin.colDate')}</TableHead>
                    <TableHead>{t('invoicesAdmin.colOrder')}</TableHead>
                    <TableHead>{t('invoicesAdmin.colStatus')}</TableHead>
                    <TableHead className="text-right">{t('invoicesAdmin.colHt')}</TableHead>
                    <TableHead className="text-right">{t('invoicesAdmin.colTva')}</TableHead>
                    <TableHead className="text-right">{t('invoicesAdmin.colTtc')}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((invoice) => (
                    <TableRow key={invoice.id} className={invoice.deletedAt ? 'opacity-60' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(invoice.id)}
                          onCheckedChange={() => toggleOne(invoice.id)}
                          aria-label={invoice.invoiceNumber}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate">{invoice.clientName}</p>
                          {invoice.clientEmail ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {invoice.clientEmail}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{shortDate(invoice.issueDate)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {invoice.order?.orderCode ?? '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(invoice.subTotalHt).toFixed(3)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(invoice.tvaAmount).toFixed(3)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(invoice.totalTtc, invoice.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('invoicesAdmin.colActions')}
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() =>
                                downloadPdf.mutate({
                                  id: invoice.id,
                                  invoiceNumber: invoice.invoiceNumber,
                                })
                              }
                            >
                              <DownloadIcon className="size-4" />
                              {t('invoicesAdmin.downloadPdf')}
                            </DropdownMenuItem>
                            {invoice.deletedAt ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2"
                                  disabled={busy}
                                  onClick={() => restore.mutate(invoice.id)}
                                >
                                  <RotateCcwIcon className="size-4" />
                                  {t('invoicesAdmin.restore')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2 text-destructive focus:text-destructive"
                                  onClick={() => setPurgeTarget(invoice)}
                                >
                                  <Trash2Icon className="size-4" />
                                  {t('invoicesAdmin.permanentDelete')}
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => {
                                    setEditing(invoice);
                                    setEditorOpen(true);
                                  }}
                                >
                                  <PencilIcon className="size-4" />
                                  {t('invoicesAdmin.edit')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-destructive focus:text-destructive"
                                  disabled={busy}
                                  onClick={() => archive.mutate(invoice.id)}
                                >
                                  <ArchiveIcon className="size-4" />
                                  {t('invoicesAdmin.archive')}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || list.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || list.isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </Button>
          </div>
        </div>
      ) : null}

      <InvoiceEditorDialog
        open={editorOpen}
        invoice={editing}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditing(null);
        }}
      />

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
