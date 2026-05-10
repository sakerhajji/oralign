'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowUpRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Edit,
  Eye,
  FileText,
  Filter,
  Plus,
  Search,
  ShieldX,
  Stethoscope,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  useDeleteOrder,
  useOrders,
  usePermanentDeleteOrder,
} from '@/lib/hooks';
import { DentalOrder, OrderStatus } from '@/lib/types';

const PAGE_SIZE = 10;
const ALL_STATUSES = 'all';

const statusLabels: Record<OrderStatus, string> = {
  [OrderStatus.DRAFT]: 'Draft',
  [OrderStatus.SUBMITTED]: 'Submitted',
  [OrderStatus.IN_REVIEW]: 'In review',
  [OrderStatus.APPROVED]: 'Approved',
  [OrderStatus.REJECTED]: 'Rejected',
  [OrderStatus.CANCELLED]: 'Cancelled',
};

export default function OrdersPage() {
  const { isAdmin, isDentist, user } = useAuth();
  const deleteOrder = useDeleteOrder();
  const permanentDeleteOrder = usePermanentDeleteOrder();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL_STATUSES);

  const params = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(search ? { search } : {}),
      ...(status !== ALL_STATUSES ? { status: status as OrderStatus } : {}),
    }),
    [page, search, status],
  );

  const ordersQuery = useOrders(params);
  const orders = ordersQuery.data?.data ?? [];
  const canCreate = isDentist || isAdmin;
  const canManage = isDentist || isAdmin;
  const total = ordersQuery.data?.total ?? 0;
  const draftCount = orders.filter((order) => order.status === OrderStatus.DRAFT).length;
  const submittedCount = orders.filter((order) =>
    [OrderStatus.SUBMITTED, OrderStatus.IN_REVIEW].includes(order.status),
  ).length;

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value.trim());
    setPage(1);
  }, 300);

  return (
    <div className="@container/main flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <section className="rounded-lg border bg-background">
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center lg:p-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ClipboardList className="h-4 w-4" />
              Aligner order operations
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Orders
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {isAdmin
                ? 'Review clinical submissions, dentist ownership, patient records, and uploaded case files from one workspace.'
                : user?.role === 'designer'
                  ? 'Review assigned order cases and attached clinical assets.'
                  : 'Create treatment drafts, attach scan files, and submit aligner cases for production review.'}
            </p>
          </div>
          {canCreate && (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/dashboard/orders/new">
                <Plus className="mr-2 h-4 w-4" />
                New Order
              </Link>
            </Button>
          )}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          icon={<ClipboardList className="h-4 w-4" />}
          label="Total cases"
          value={total}
          hint="Visible in current role"
        />
        <MetricCard
          icon={<FileText className="h-4 w-4" />}
          label="Drafts"
          value={draftCount}
          hint="Current page"
        />
        <MetricCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="Active review"
          value={submittedCount}
          hint="Submitted or in review"
        />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_220px_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-10"
              placeholder="Search order code, patient, or dentist"
              onChange={(event) => debouncedSearch(event.target.value)}
            />
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-11">
              <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
              {Object.values(OrderStatus).map((item) => (
                <SelectItem key={item} value={item}>
                  {statusLabels[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => ordersQuery.refetch()}
          >
            Refresh
          </Button>
        </CardContent>
      </Card>

      {ordersQuery.isLoading ? (
        <OrdersLoading />
      ) : ordersQuery.error ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="Orders could not load"
          description={ordersQuery.error.message}
          action={
            <Button variant="outline" onClick={() => ordersQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="No orders found"
          description="Create a new order or adjust the search and status filters."
          action={
            canCreate ? (
              <Button asChild>
                <Link href="/dashboard/orders/new">
                  <Plus className="mr-2 h-4 w-4" />
                  New Order
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[190px]">Order</TableHead>
                  <TableHead>Patient</TableHead>
                  {isAdmin && <TableHead>Dentist</TableHead>}
                  <TableHead>Clinical</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <ClipboardList className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold">{order.orderCode}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.files?.length ?? 0} files
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PersonLine
                        icon={<UserRound className="h-4 w-4" />}
                        name={order.patient?.fullName ?? 'No patient'}
                        sub={order.patient?.phone ?? order.patient?.email}
                      />
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <PersonLine
                          icon={<Stethoscope className="h-4 w-4" />}
                          name={order.doctor?.fullName ?? 'No dentist'}
                          sub={order.doctor?.email}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium">
                          {order.archTreatment ?? 'Arch not set'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.patientStage ?? 'Stage not set'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(order.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <OrderActions
                        order={order}
                        canManage={canManage}
                        canPermanentDelete={isAdmin}
                        isDeleting={deleteOrder.isPending}
                        isPermanentDeleting={permanentDeleteOrder.isPending}
                        onDelete={() => deleteOrder.mutate(order.id)}
                        onPermanentDelete={() =>
                          permanentDeleteOrder.mutate(order.id)
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="grid gap-3 md:hidden">
            {orders.map((order) => (
              <OrderMobileCard
                key={order.id}
                order={order}
                isAdmin={isAdmin}
                canManage={canManage}
                canPermanentDelete={isAdmin}
                isDeleting={deleteOrder.isPending}
                isPermanentDeleting={permanentDeleteOrder.isPending}
                onDelete={() => deleteOrder.mutate(order.id)}
                onPermanentDelete={() => permanentDeleteOrder.mutate(order.id)}
              />
            ))}
          </div>

          <OrdersPagination
            page={page}
            total={total}
            totalPages={ordersQuery.data?.totalPages ?? 1}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function PersonLine({
  icon,
  name,
  sub,
}: {
  icon: ReactNode;
  name: string;
  sub?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function OrderActions({
  order,
  canManage,
  canPermanentDelete,
  isDeleting,
  isPermanentDeleting,
  onDelete,
  onPermanentDelete,
}: {
  order: DentalOrder;
  canManage: boolean;
  canPermanentDelete: boolean;
  isDeleting: boolean;
  isPermanentDeleting: boolean;
  onDelete: () => void;
  onPermanentDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button asChild size="icon" variant="ghost" aria-label="Open order">
        <Link href={`/dashboard/orders/${order.id}`}>
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </Button>
      {canManage && (
        <Button asChild size="icon" variant="ghost" aria-label="Edit order">
          <Link href={`/dashboard/orders/${order.id}/edit`}>
            <Edit className="h-4 w-4" />
          </Link>
        </Button>
      )}
      {canManage && (
        <OrderConfirmAction
          title="Delete order?"
          description={`This will hide ${order.orderCode} from active order lists. The order can still be recovered from the database by an admin.`}
          actionLabel="Delete"
          icon={<Trash2 className="h-4 w-4" />}
          disabled={isDeleting}
          onConfirm={onDelete}
        />
      )}
      {canPermanentDelete && (
        <OrderConfirmAction
          title="Permanently delete order?"
          description={`This permanently removes ${order.orderCode}, its tooth instructions, file records, and stored files. This cannot be undone.`}
          actionLabel="Delete forever"
          icon={<ShieldX className="h-4 w-4" />}
          disabled={isPermanentDeleting}
          destructive
          onConfirm={onPermanentDelete}
        />
      )}
    </div>
  );
}

function OrderConfirmAction({
  title,
  description,
  actionLabel,
  icon,
  disabled,
  destructive,
  showLabel,
  onConfirm,
}: {
  title: string;
  description: string;
  actionLabel: string;
  icon: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  showLabel?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size={showLabel ? 'sm' : 'icon'}
          variant={destructive ? 'destructive' : 'ghost'}
          aria-label={actionLabel}
          disabled={disabled}
        >
          {icon}
          {showLabel && <span>{actionLabel}</span>}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function OrderMobileCard({
  order,
  isAdmin,
  canManage,
  canPermanentDelete,
  isDeleting,
  isPermanentDeleting,
  onDelete,
  onPermanentDelete,
}: {
  order: DentalOrder;
  isAdmin: boolean;
  canManage: boolean;
  canPermanentDelete: boolean;
  isDeleting: boolean;
  isPermanentDeleting: boolean;
  onDelete: () => void;
  onPermanentDelete: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
              {format(new Date(order.createdAt), 'MMM d, yyyy')}
            </div>
            <h3 className="truncate text-lg font-semibold">{order.orderCode}</h3>
            <p className="truncate text-sm text-muted-foreground">
              {order.patient?.fullName ?? 'No patient selected'}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <MobileMeta label="Stage" value={order.patientStage ?? 'Not set'} />
          <MobileMeta label="Arch" value={order.archTreatment ?? 'Not set'} />
          {isAdmin && (
            <div className="col-span-2">
              <MobileMeta label="Dentist" value={order.doctor?.fullName ?? 'No dentist'} />
            </div>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild variant="outline" className="w-full">
            <Link href={`/dashboard/orders/${order.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              View Order
            </Link>
          </Button>
          {canManage && (
            <Button asChild variant="outline" className="w-full">
              <Link href={`/dashboard/orders/${order.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
        </div>
        {(canManage || canPermanentDelete) && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {canManage && (
              <OrderConfirmAction
                title="Delete order?"
                description={`This will hide ${order.orderCode} from active order lists.`}
                actionLabel="Delete"
                icon={<Trash2 className="h-4 w-4" />}
                disabled={isDeleting}
                showLabel
                onConfirm={onDelete}
              />
            )}
            {canPermanentDelete && (
              <OrderConfirmAction
                title="Permanently delete order?"
                description={`This permanently removes ${order.orderCode} and all stored order files. This cannot be undone.`}
                actionLabel="Delete forever"
                icon={<ShieldX className="h-4 w-4" />}
                disabled={isPermanentDeleting}
                destructive
                showLabel
                onConfirm={onPermanentDelete}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MobileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

function OrdersLoading() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OrdersPagination({
  page,
  total,
  totalPages,
  onPageChange,
}: {
  page: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} · {total} orders
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
