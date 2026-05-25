'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3Icon,
  DownloadIcon,
  FileBarChartIcon,
  PackageIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DashboardRangePicker } from '@/components/dashboard/date-range-picker';
import { useAuth } from '@/lib/providers/auth-provider';
import { useDownloadReportCsv, useReportSummary } from '@/lib/hooks';
import type { DashboardRange, ReportExportType } from '@/lib/types';
import { cn } from '@/lib/utils';

const TND = (n: number) =>
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)} TND`;
const N = (n: number) => new Intl.NumberFormat('en-US').format(n);

function defaultRange(): DashboardRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function ReportsPage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [range, setRange] = useState<DashboardRange>(defaultRange);
  const reportRange = useMemo(() => ({ ...range, limit: 10 }), [range]);
  const summary = useReportSummary(reportRange, isAdmin);
  const download = useDownloadReportCsv();
  const data = summary.data;

  useEffect(() => {
    if (user && !isAdmin) router.replace('/dashboard');
  }, [user, isAdmin, router]);

  const exportCsv = (type: ReportExportType) => {
    download.mutate({ type, range: reportRange });
  };

  return (
    <div className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
            <Badge variant="outline" className="gap-1">
              <FileBarChartIcon className="size-3" />
              Admin
            </Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Exportable platform reports for revenue, doctor performance, and
            pack activity. The numbers use the same backend aggregates as the
            Admin Dashboard.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DashboardRangePicker value={range} onChange={setRange} />
          <Button
            variant="outline"
            onClick={() => summary.refetch()}
            disabled={summary.isFetching}
          >
            <RefreshCwIcon
              className={cn('size-4', summary.isFetching && 'animate-spin')}
            />
            Refresh
          </Button>
        </div>
      </div>

      {summary.isError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Reports could not load. Check that the backend is running and that
            your account has admin access.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ReportMetric
          title="Revenue"
          value={TND(data?.kpis.revenue.total ?? 0)}
          detail={`Collected ${TND(data?.kpis.revenue.collected ?? 0)}`}
          icon={WalletIcon}
          loading={summary.isLoading}
        />
        <ReportMetric
          title="Orders"
          value={N(data?.kpis.orders.inRange ?? 0)}
          detail={`${N(data?.kpis.orders.paid ?? 0)} paid · ${N(data?.kpis.orders.unpaid ?? 0)} unpaid`}
          icon={BarChart3Icon}
          loading={summary.isLoading}
        />
        <ReportMetric
          title="Doctors"
          value={N(data?.kpis.doctors.total ?? 0)}
          detail={`${N(data?.kpis.doctors.active ?? 0)} active`}
          icon={UsersIcon}
          loading={summary.isLoading}
        />
        <ReportMetric
          title="Conversion"
          value={`${data?.kpis.packs.conversionRatePct ?? 0}%`}
          detail={`AOV ${TND(data?.kpis.packs.averageOrderValue ?? 0)}`}
          icon={TrendingUpIcon}
          loading={summary.isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ExportCard
          title="Revenue report"
          description="Daily revenue, order volume, new doctors, and new patients."
          icon={WalletIcon}
          onExport={() => exportCsv('revenue')}
          pending={download.isPending}
        />
        <ExportCard
          title="Doctor report"
          description="Top doctors by orders, paid orders, revenue, and outstanding balance."
          icon={UsersIcon}
          onExport={() => exportCsv('doctors')}
          pending={download.isPending}
        />
        <ExportCard
          title="Pack report"
          description="Pack sales, revenue, collected amount, and current prices."
          icon={PackageIcon}
          onExport={() => exportCsv('packs')}
          pending={download.isPending}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top doctors</CardTitle>
            <CardDescription>Ranked by orders in the selected range.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (data?.topDoctors.byOrders.length ?? 0) === 0 ? (
              <EmptyReport />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doctor</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.topDoctors.byOrders.map((doctor) => (
                    <TableRow key={doctor.doctorId}>
                      <TableCell className="min-w-[180px] whitespace-normal">
                        <div className="font-medium">{doctor.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          {doctor.clinicName ?? doctor.email}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {N(doctor.orders)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {TND(doctor.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {TND(doctor.outstanding)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Best-selling packs</CardTitle>
            <CardDescription>Pack performance in the selected range.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (data?.bestPacks.length ?? 0) === 0 ? (
              <EmptyReport />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pack</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.bestPacks.map((pack) => (
                    <TableRow key={pack.packId}>
                      <TableCell className="min-w-[160px] whitespace-normal">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{pack.name}</span>
                          {!pack.isActive ? (
                            <Badge variant="outline">Inactive</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {N(pack.sold)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {TND(pack.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {TND(pack.collected)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReportMetric({
  title,
  value,
  detail,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-28" />
          ) : (
            <p className="truncate text-2xl font-semibold">{value}</p>
          )}
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ExportCard({
  title,
  description,
  icon: Icon,
  onExport,
  pending,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  onExport: () => void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-5" />
          </div>
          <Button variant="outline" size="sm" onClick={onExport} disabled={pending}>
            <DownloadIcon className="size-4" />
            CSV
          </Button>
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

function EmptyReport() {
  return (
    <div className="grid h-40 place-items-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
      No report data in this range.
    </div>
  );
}
