'use client';

import { useRouter } from 'next/navigation';
import { CirclePlus, Loader2 } from 'lucide-react';
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
import { useConvertWarrantyToReplacement } from '@/lib/hooks/use-supplemental-orders';
import { useT } from '@/lib/i18n/lang-context';
import { buildSupplementalWizardHref } from '@/lib/orders/order-navigation';
import { OrderType, type SupplementalOrderView } from '@/lib/types';

/**
 * Rejected warranty → paid replacement, only after the doctor confirms the
 * charge; then opens the new replacement draft to complete.
 */
export function ConvertWarrantyDialog({ view }: { view: SupplementalOrderView }) {
  const { t } = useT();
  const router = useRouter();
  const convert = useConvertWarrantyToReplacement();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" className="h-11 w-full gap-2 sm:w-auto">
          <CirclePlus className="h-4 w-4" aria-hidden />
          {t('supplemental.actions.convert')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('supplemental.convert.title')}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {view.request.reviewReason && (
                <p>{t('supplemental.convert.rejectionReason', { reason: view.request.reviewReason })}</p>
              )}
              <p>{t('supplemental.convert.charge')}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={convert.isPending}
            onClick={(event) => {
              // Stay open until the replacement exists, then open it.
              event.preventDefault();
              convert.mutate(
                {
                  requestId: view.order.id,
                  parentOrderId: view.parentOrder.id,
                  patientId: view.order.patientId,
                },
                {
                  onSuccess: (replacement) =>
                    router.push(
                      buildSupplementalWizardHref({
                        parentOrderId: replacement.parentOrder.id,
                        type: OrderType.REPLACEMENT,
                        requestId: replacement.order.id,
                      }),
                    ),
                },
              );
            }}
          >
            {convert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {t('supplemental.convert.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
