'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useOverrideOrderStatus } from '@/lib/hooks/use-orders';
import { OrderStatus } from '@/lib/types';
import { orderStatusLabel } from '@/components/orders/order-status-badge';

/**
 * Admin-only dialog for manually changing an order's lifecycle status.
 * The same control rolls the order forward (skip past a stuck step) or
 * backward (undo a transition that fired by mistake). Backend logs the
 * change with the caller's user id + the optional reason.
 *
 * Lifecycle values are grouped in the <Select> by phase (submission /
 * planning / billing / fabrication / terminal) so the list is scannable
 * even though there are 16 modern statuses. Legacy enum values
 * (in_review, approved, rejected, cancelled) are deliberately omitted —
 * they exist on the model for back-compat but should never be chosen
 * for new transitions.
 */
interface PhaseGroup {
  label: string;
  options: OrderStatus[];
}

const PHASES: PhaseGroup[] = [
  {
    label: 'Submission',
    options: [OrderStatus.DRAFT, OrderStatus.SUBMITTED, OrderStatus.UNDER_REVIEW],
  },
  {
    label: 'Treatment planning',
    options: [
      OrderStatus.TREATMENT_PLANNING,
      OrderStatus.TREATMENT_PLAN_READY,
      OrderStatus.REVISION_REQUESTED,
      OrderStatus.TREATMENT_APPROVED,
    ],
  },
  {
    label: 'Quote & payment',
    options: [
      OrderStatus.QUOTATION_SENT,
      OrderStatus.PAYMENT_PLAN_SELECTED,
      OrderStatus.PAYMENT_PENDING,
      OrderStatus.PAYMENT_REVIEW,
      OrderStatus.PAID,
    ],
  },
  {
    label: 'Production',
    options: [
      OrderStatus.FABRICATION,
      OrderStatus.READY_TO_SHIP,
      OrderStatus.SHIPPED,
      OrderStatus.FINISHED,
    ],
  },
  {
    label: 'Terminal',
    options: [OrderStatus.CANCELED],
  },
];

export function OrderStatusChangeDialog({
  orderId,
  orderCode,
  currentStatus,
  trigger,
}: {
  orderId: string;
  orderCode: string;
  currentStatus: OrderStatus;
  trigger: React.ReactNode;
}) {
  const override = useOverrideOrderStatus();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<OrderStatus>(currentStatus);
  const [reason, setReason] = useState('');

  // Reset the picked target / reason whenever the dialog reopens so the
  // user starts from a clean slate, not from whatever they last picked.
  useEffect(() => {
    if (open) {
      setTarget(currentStatus);
      setReason('');
    }
  }, [open, currentStatus]);

  const handleSave = async () => {
    if (target === currentStatus) {
      setOpen(false);
      return;
    }
    try {
      await override.mutateAsync({
        id: orderId,
        status: target,
        reason: reason.trim() || undefined,
      });
      setOpen(false);
    } catch {
      // toast already raised by useOverrideOrderStatus.onError
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Change order status
          </DialogTitle>
          <DialogDescription className="text-xs">
            Admin override for <span className="font-medium">{orderCode}</span>.
            Use this to roll the order forward past a stuck step or roll
            backward to fix a mistake. Treatment plan and quotation
            artefacts are kept — only the status changes.
          </DialogDescription>
        </DialogHeader>

        {/* Current → target visual */}
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Currently
            </p>
            <Badge variant="outline" className="mt-1 text-xs">
              {orderStatusLabel[currentStatus] ?? currentStatus}
            </Badge>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Will become
            </p>
            <Badge
              variant="outline"
              className="mt-1 border-primary/40 bg-primary/5 text-xs text-primary"
            >
              {orderStatusLabel[target] ?? target}
            </Badge>
          </div>
        </div>

        {/* Phase-grouped select */}
        <div className="grid gap-2">
          <Label>New status</Label>
          <Select
            value={target}
            onValueChange={(v) => setTarget(v as OrderStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHASES.map((phase) => (
                <SelectGroup key={phase.label}>
                  <SelectLabel>{phase.label}</SelectLabel>
                  {phase.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {orderStatusLabel[opt] ?? opt}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Reason — optional but encouraged */}
        <div className="grid gap-2">
          <Label htmlFor="status-reason">
            Reason{' '}
            <span className="text-muted-foreground">(optional, logged)</span>
          </Label>
          <Textarea
            id="status-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. doctor confirmed payment over the phone — rolling to paid"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={override.isPending || target === currentStatus}
            className="gap-2"
          >
            {override.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Apply change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
