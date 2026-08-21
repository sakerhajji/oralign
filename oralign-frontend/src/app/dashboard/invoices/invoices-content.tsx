'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useDebounce } from 'use-debounce';
import {
  ArchiveIcon,
  CalendarIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  Loader2Icon,
  MoreVertical,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  ZapIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import { InvoiceEditorDialog } from './invoice-editor';
import { InvoicePreviewDialog } from './invoice-preview';

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

// ─── Badges ───────────────────────────────────────────────────────────
// Status colors are the app's existing status palette; every badge also
// carries its label, so state is never encoded by color alone.

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

/** Where the invoice came from: a payment (auto) or this desk (manual). */
function SourceBadge({ invoice }: { invoice: Invoice }) {
  const { t } = useT();
  if (invoice.paymentId) {
    return (
      <Badge
        variant="outline"
        title={t('invoicesAdmin.sourceAutoTitle')}
        className="gap-1 border-violet-300/60 text-violet-700 dark:border-violet-800 dark:text-violet-300"
      >
        <ZapIcon className="size-3" />
        {t('invoicesAdmin.sourceAuto')}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      title={t('invoicesAdmin.sourceManualTitle')}
      className="gap-1 text-muted-foreground"
    >
      <PencilIcon className="size-3" />
      {t('invoicesAdmin.sourceManual')}
    </Badge>
  );
}

// ─── KPI tiles ────────────────────────────────────────────────────────
// Stat tiles, not charts: text tokens only, tabular figures, the money
// values are the aggregates of the WHOLE filter (never just the page).

function KpiTile({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
      <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl">
        {loading ? '…' : value}
      </p>
      {hint ? (
        <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// ─── Row actions (shared by table + mobile cards) ─────────────────────

function RowActions({
  invoice,
  busy,
  onPreview,
  onDownload,
  onEdit,
  onArchive,
  onRestore,
  onPurge,
}: {
  invoice: Invoice;
  busy: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const { t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('invoicesAdmin.colActions')}>
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="gap-2" onClick={onPreview}>
          <EyeIcon className="size-4" />
          {t('invoicesAdmin.view')}
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2" onClick={onDownload}>
          <DownloadIcon className="size-4" />
          {t('invoicesAdmin.downloadPdf')}
        </DropdownMenuItem>
        {invoice.deletedAt ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" disabled={busy} onClick={onRestore}>
              <RotateCcwIcon className="size-4" />
              {t('invoicesAdmin.restore')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              onClick={onPurge}
            >
              <Trash2Icon className="size-4" />
              {t('invoicesAdmin.permanentDelete')}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem className="gap-2" onClick={onEdit}>
              <PencilIcon className="size-4" />
              {t('invoicesAdmin.edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              disabled={busy}
              onClick={onArchive}
            >
              <ArchiveIcon className="size-4" />
              {t('invoicesAdmin.archive')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Admin invoicing desk — the central list.
 *
 * Layout: brand header → KPI row (whole-filter aggregates) → status tabs
 * with live counts → filter bar → selection bar → table (≥lg) or stacked
 * cards (<lg) → pagination. Patterns follow /dashboard/orders and
 * /dashboard/users; the status-tab-with-count idea mirrors the community
 * moderation queues.
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
  const [previewTarget, setPreviewTarget] = React.useState<Invoice | null>(null);

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

  const byStatus = summary.data?.byStatus ?? {};
  const statusTabs: { key: 'all' | InvoiceStatus; label: string; count: number }[] = [
    { key: 'all', label: t('invoicesAdmin.tabAll'), count: summary.data?.totalAllStatuses ?? 0 },
    { key: InvoiceStatus.DRAFT, label: t('invoicesAdmin.statusDraft'), count: byStatus[InvoiceStatus.DRAFT] ?? 0 },
    { key: InvoiceStatus.ISSUED, label: t('invoicesAdmin.statusIssued'), count: byStatus[InvoiceStatus.ISSUED] ?? 0 },
    { key: InvoiceStatus.PAID, label: t('invoicesAdmin.statusPaid'), count: byStatus[InvoiceStatus.PAID] ?? 0 },
    { key: InvoiceStatus.CANCELLED, label: t('invoicesAdmin.statusCancelled'), count: byStatus[InvoiceStatus.CANCELLED] ?? 0 },
  ];

  const rowActionProps = (invoice: Invoice) => ({
    invoice,
    busy,
    onPreview: () => setPreviewTarget(invoice),
    onDownload: () =>
      downloadPdf.mutate({ id: invoice.id, invoiceNumber: invoice.invoiceNumber }),
    onEdit: () => {
      setEditing(invoice);
      setEditorOpen(true);
    },
    onArchive: () => archive.mutate(invoice.id),
    onRestore: () => restore.mutate(invoice.id),
    onPurge: () => setPurgeTarget(invoice),
  });

  if (user && !isAdmin) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-3 pb-8 sm:gap-5 sm:p-5 lg:p-8">
      {/* ── En-tête ── */}
      <header className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <FileTextIcon className="size-4" />
            </span>
            ORALIGN
          </div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
            {t('invoicesAdmin.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('invoicesAdmin.intro')}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
          >
            <RefreshCwIcon
              className={cn('mr-2 size-4', list.isFetching && 'animate-spin')}
            />
            {t('invoicesAdmin.refresh')}
          </Button>
          <Button
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <PlusIcon className="mr-2 size-4" />
            {t('invoicesAdmin.create')}
          </Button>
        </div>
      </header>

      {/* ── KPI: agrégats du filtre entier (jamais la page seule) ── */}
      <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <KpiTile
          label={t('invoicesAdmin.kpiCount')}
          value={String(summary.data?.count ?? 0)}
          loading={summary.isLoading}
        />
        <KpiTile
          label={t('invoicesAdmin.kpiHt')}
          value={money(summary.data?.subTotalHt)}
          hint={t('invoicesAdmin.kpiBillableHint')}
          loading={summary.isLoading}
        />
        <KpiTile
          label={t('invoicesAdmin.kpiTva')}
          value={money(summary.data?.tvaAmount)}
          hint={t('invoicesAdmin.kpiBillableHint')}
          loading={summary.isLoading}
        />
        <KpiTile
          label={t('invoicesAdmin.kpiTtc')}
          value={money(summary.data?.totalTtc)}
          hint={t('invoicesAdmin.kpiBillableHint')}
          loading={summary.isLoading}
        />
      </section>

      {/* ── Onglets de statut avec compteurs vivants ── */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="inline-flex min-w-max gap-1 rounded-lg bg-muted p-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setStatus(tab.key);
                resetView();
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                status === tab.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] tabular-nums',
                  status === tab.key
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted-foreground/10',
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Barre de filtres ── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv.mutate(filters)}
            disabled={exportCsv.isPending}
          >
            {exportCsv.isPending ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : (
              <DownloadIcon className="mr-2 size-4" />
            )}
            <span className="hidden sm:inline">{t('invoicesAdmin.exportCsv')}</span>
            <span className="sm:hidden">CSV</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarIcon className="size-3.5" />
            {t('invoicesAdmin.period')}
          </span>
          <Input
            type="date"
            value={from}
            aria-label={t('invoicesAdmin.from')}
            onChange={(e) => {
              setFrom(e.target.value);
              resetView();
            }}
            className="w-[9.5rem] flex-1 sm:flex-none"
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
            className="w-[9.5rem] flex-1 sm:flex-none"
          />
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
        </div>
      </div>

      {/* ── Barre d'actions groupées ── */}
      {selected.size > 0 ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-2 py-3 sm:gap-3">
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

      {/* ── Contenu ── */}
      {list.isLoading ? (
        <div className="flex min-h-40 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          {t('invoicesAdmin.loading')}
        </div>
      ) : list.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {t('invoicesAdmin.error')}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          <FileTextIcon className="size-8 opacity-40" />
          {hasFilters ? t('invoicesAdmin.emptyFiltered') : t('invoicesAdmin.empty')}
        </div>
      ) : (
        <>
          {/* Table ≥ lg. The wrapper scrolls, never the page body. */}
          <Card className="hidden min-w-0 overflow-hidden lg:block">
            <CardContent className="p-0">
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
                      <TableHead>{t('invoicesAdmin.colStatus')}</TableHead>
                      <TableHead className="text-right">{t('invoicesAdmin.colHt')}</TableHead>
                      <TableHead className="text-right">{t('invoicesAdmin.colTva')}</TableHead>
                      <TableHead className="text-right">{t('invoicesAdmin.colTtc')}</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((invoice) => (
                      <TableRow
                        key={invoice.id}
                        className={cn(invoice.deletedAt && 'opacity-60')}
                      >
                        <TableCell>
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
                            className="font-medium underline-offset-4 hover:text-primary hover:underline"
                          >
                            {invoice.invoiceNumber}
                          </button>
                          <div className="mt-1">
                            <SourceBadge invoice={invoice} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0 max-w-56">
                            <p className="truncate">{invoice.clientName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {invoice.order?.orderCode ?? invoice.clientEmail ?? '—'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {shortDate(invoice.issueDate)}
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
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                          {money(invoice.totalTtc, invoice.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions {...rowActionProps(invoice)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Cartes empilées < lg — même donnée, même actions. */}
          <div className="flex flex-col gap-2 lg:hidden">
            {rows.map((invoice) => (
              <div
                key={invoice.id}
                className={cn(
                  'rounded-xl border bg-card p-3 shadow-sm',
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewTarget(invoice)}
                        className="font-semibold underline-offset-4 hover:text-primary hover:underline"
                      >
                        {invoice.invoiceNumber}
                      </button>
                      <StatusBadge status={invoice.status} />
                      <SourceBadge invoice={invoice} />
                    </div>
                    <p className="mt-0.5 truncate text-sm">{invoice.clientName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {shortDate(invoice.issueDate)}
                      {invoice.order?.orderCode ? ` · ${invoice.order.orderCode}` : ''}
                    </p>
                  </div>
                  <RowActions {...rowActionProps(invoice)} />
                </div>
                <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
                  <span className="text-xs text-muted-foreground">
                    HT {n(invoice.subTotalHt).toFixed(3)} · TVA{' '}
                    {n(invoice.tvaAmount).toFixed(3)}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {money(invoice.totalTtc, invoice.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

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

      <InvoicePreviewDialog
        invoice={previewTarget}
        onOpenChange={(open) => {
          if (!open) setPreviewTarget(null);
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
