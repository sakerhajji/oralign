'use client';

import { useState } from 'react';
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
import { useT } from '@/lib/i18n/lang-context';

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
// PhaseGroup carries a `labelKey` instead of a hard-coded English
// label so the grouped <Select> re-renders the section headers in the
// current language.
interface PhaseGroup {
  labelKey: string;
  options: OrderStatus[];
}

const PHASES: PhaseGroup[] = [
  {
    labelKey: 'ordersPage.phaseSubmission',
    options: [OrderStatus.DRAFT, OrderStatus.SUBMITTED, OrderStatus.UNDER_REVIEW],
  },
  {
    labelKey: 'ordersPage.phasePlanning',
    options: [
      OrderStatus.TREATMENT_PLANNING,
      OrderStatus.TREATMENT_PLAN_READY,
      OrderStatus.REVISION_REQUESTED,
      OrderStatus.TREATMENT_APPROVED,
    ],
  },
  {
    labelKey: 'ordersPage.phaseBilling',
    options: [
      OrderStatus.QUOTATION_SENT,
      OrderStatus.PAYMENT_PLAN_SELECTED,
      OrderStatus.PAYMENT_PENDING,
      OrderStatus.PAYMENT_REVIEW,
      OrderStatus.PAID,
    ],
  },
  {
    labelKey: 'ordersPage.phaseProduction',
    options: [
      OrderStatus.FABRICATION,
      OrderStatus.READY_TO_SHIP,
      OrderStatus.SHIPPED,
      OrderStatus.FINISHED,
    ],
  },
  {
    labelKey: 'ordersPage.phaseTerminal',
    options: [OrderStatus.CANCELED],
  },
];

// Resolve an OrderStatus to its localised label via the existing
// `orders.statusLabel.*` dict block — same lookup the badge uses.
function statusLabel(
  status: OrderStatus,
  t: (path: string) => string,
): string {
  const key = `orders.statusLabel.${status}`;
  const hit = t(key);
  return hit !== key ? hit : String(status);
}

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
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<OrderStatus>(currentStatus);
  const [reason, setReason] = useState('');

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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setTarget(currentStatus);
          setReason('');
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {t('ordersPage.overrideDialogTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t('ordersPage.overrideDialogBody', { code: orderCode })}
          </DialogDescription>
        </DialogHeader>

        {/* Current → target visual */}
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('ordersPage.currently')}
            </p>
            <Badge variant="outline" className="mt-1 text-xs">
              {statusLabel(currentStatus, t)}
            </Badge>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('ordersPage.willBecome')}
            </p>
            <Badge
              variant="outline"
              className="mt-1 border-primary/40 bg-primary/5 text-xs text-primary"
            >
              {statusLabel(target, t)}
            </Badge>
          </div>
        </div>

        {/* Phase-grouped select */}
        <div className="grid gap-2">
          <Label>{t('ordersPage.newStatus')}</Label>
          <Select
            value={target}
            onValueChange={(v) => setTarget(v as OrderStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHASES.map((phase) => (
                <SelectGroup key={phase.labelKey}>
                  <SelectLabel>{t(phase.labelKey)}</SelectLabel>
                  {phase.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {statusLabel(opt, t)}
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
            {t('ordersPage.reasonLabel')}{' '}
            <span className="text-muted-foreground">
              {t('ordersPage.reasonOptional')}
            </span>
          </Label>
          <Textarea
            id="status-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('ordersPage.reasonPh')}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            {t('ordersPage.cancel')}
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
            {t('ordersPage.applyChange')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
