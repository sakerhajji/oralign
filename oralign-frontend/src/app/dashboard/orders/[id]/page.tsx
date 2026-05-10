'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Edit, ShieldX, Trash2 } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderFileUpload } from '@/components/orders/order-file-upload';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { OdontogramSelector } from '@/components/orders/odontogram-selector';
import {
  useDeleteOrder,
  useOrder,
  usePermanentDeleteOrder,
} from '@/lib/hooks';
import { useAuth } from '@/lib/providers/auth-provider';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderQuery = useOrder(params.id);
  const deleteOrder = useDeleteOrder();
  const permanentDeleteOrder = usePermanentDeleteOrder();
  const { isAdmin, isDentist } = useAuth();

  if (orderQuery.isLoading) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (orderQuery.error || !orderQuery.data) {
    return (
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <p className="font-medium text-red-600">Order not found or access is blocked</p>
            <Button asChild variant="outline">
              <Link href="/dashboard/orders">Back to orders</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const order = orderQuery.data;
  const canManage = isAdmin || isDentist;

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 px-0">
            <Link href="/dashboard/orders">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Orders
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{order.orderCode}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-muted-foreground">
            Created {format(new Date(order.createdAt), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button asChild>
              <Link href={`/dashboard/orders/${order.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Order
              </Link>
            </Button>
          )}
          {canManage && (
            <OrderDeleteAction
              title="Delete order?"
              description="This soft deletes the order, so it disappears from active order lists. Backend permissions still enforce dentist ownership."
              actionLabel="Delete"
              icon={<Trash2 className="mr-2 h-4 w-4" />}
              disabled={deleteOrder.isPending}
              onConfirm={() =>
                deleteOrder.mutate(order.id, {
                  onSuccess: () => router.push('/dashboard/orders'),
                })
              }
            />
          )}
          {isAdmin && (
            <OrderDeleteAction
              title="Permanently delete order?"
              description="This removes the order, tooth instructions, file records, and stored files. This cannot be undone."
              actionLabel="Delete forever"
              icon={<ShieldX className="mr-2 h-4 w-4" />}
              disabled={permanentDeleteOrder.isPending}
              destructive
              onConfirm={() =>
                permanentDeleteOrder.mutate(order.id, {
                  onSuccess: () => router.push('/dashboard/orders'),
                })
              }
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Clinical Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Info label="Patient" value={order.patient?.fullName} />
              <Info label="Dentist" value={order.doctor?.fullName} />
              <Info label="Stage" value={order.patientStage} />
              <Info label="Arch" value={order.archTreatment} />
              <Info label="Chief complaint" value={order.chiefComplaint} wide />
              <Info label="Treatment plan" value={order.treatmentPlan} wide />
              <Info label="Do not move" value={order.dontMoveOption} />
              <Info label="AP relationship" value={order.apRelationship} />
              <Info label="Anteroposterior" value={order.anteroposteriorRelationship} />
              <Info label="Elastics" value={order.elastics} />
              <Info label="Open bite" value={order.openBite} />
              <Info label="Midline" value={order.midline} />
              <Info label="IPR" value={order.ipr} />
              <Info label="Bite ramps" value={order.biteRamps} />
              <Info label="Crossbite" value={order.crossbite} />
              <Info label="Spaces" value={order.spaces} />
              <Info label="Extractions" value={order.extractions} />
              <Info label="Special instructions" value={order.specialInstructions} wide />
              <Info label="Additional instructions" value={order.additionalInstructions} wide />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Odontogram Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <OdontogramSelector
                value={order.toothInstructions ?? []}
                onChange={() => undefined}
                disabled
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Info label="CBCT with scans" value={order.useCbctWithScans ? 'Yes' : 'No'} />
              <Info label="Manufacturing" value={order.wantsManufacturing ? 'Requested' : 'Not requested'} />
              <Info
                label="Materials"
                value={(order.materials ?? []).join(', ') || 'Not set'}
              />
              <Info label="Submitted" value={order.submittedAt ? format(new Date(order.submittedAt), 'MMM d, yyyy') : 'Not submitted'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Files</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderFileUpload orderId={order.id} readOnly={!canManage} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  wide,
}: {
  label: string;
  value?: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'md:col-span-2' : undefined}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm font-medium">{value || '—'}</p>
    </div>
  );
}

function OrderDeleteAction({
  title,
  description,
  actionLabel,
  icon,
  disabled,
  destructive,
  onConfirm,
}: {
  title: string;
  description: string;
  actionLabel: string;
  icon: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={destructive ? 'destructive' : 'outline'}
          disabled={disabled}
        >
          {icon}
          {actionLabel}
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
