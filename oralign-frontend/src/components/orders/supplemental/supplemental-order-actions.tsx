'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown, CirclePlus, Loader2, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useSupplementalEligibility,
  useSupplementalOrders,
} from '@/lib/hooks/use-supplemental-orders';
import { useCanOrder } from '@/lib/hooks/use-can-order';
import { useT } from '@/lib/i18n/lang-context';
import { buildSupplementalWizardHref } from '@/lib/orders/order-navigation';
import { SupplementalReviewStatus, type SupplementalKind } from '@/lib/types';
import { KIND_ICON, SUPPLEMENTAL_KINDS } from './supplemental-constants';
import { useCreateSupplementalDraft } from './use-create-supplemental-draft';

const TRIGGER_CLASS = 'h-11 w-full gap-2 sm:w-auto';

/**
 * "Nouvelle demande" menu of an initial case. Shown only to callers the
 * server allows to create (`canCreate`); a kind with an open draft resumes
 * it, a blocked kind shows why. Creation happens on click, never on load.
 * A dormant doctor (doctor inactivity, spec §5) can still resume a draft,
 * but every new request is disabled with the reason (403 ACCOUNT_DORMANT
 * otherwise).
 */
export function SupplementalOrderActions({ parentOrderId }: { parentOrderId: string }) {
  const { t } = useT();
  const router = useRouter();
  const eligibility = useSupplementalEligibility(parentOrderId);
  const requests = useSupplementalOrders(parentOrderId);
  const { start, pendingKind } = useCreateSupplementalDraft();
  const { canOrder } = useCanOrder();

  if (eligibility.isPending) {
    return (
      <Button type="button" variant="outline" disabled className={TRIGGER_CLASS}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {t('supplemental.newRequest')}
      </Button>
    );
  }
  if (eligibility.isError) {
    return <p className="text-xs text-muted-foreground">{t('supplemental.availability.loadError')}</p>;
  }
  if (!eligibility.data.canCreate) return null;
  const { requests: kinds } = eligibility.data;

  /** The kind's open request, when it is still a draft the caller can resume. */
  const resumableDraft = (kind: SupplementalKind) => {
    const activeId = kinds[kind].activeRequestId;
    const view = requests.data?.find((candidate) => candidate.order.id === activeId);
    return view && view.request.reviewStatus === SupplementalReviewStatus.DRAFT && view.permissions.canEdit
      ? view
      : null;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className={TRIGGER_CLASS} disabled={pendingKind !== null}>
          {pendingKind ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CirclePlus className="h-4 w-4" aria-hidden />
          )}
          {t('supplemental.newRequest')}
          <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))]">
        <DropdownMenuLabel>{t('supplemental.actions.menuTitle')}</DropdownMenuLabel>
        {!canOrder && (
          <p className="flex items-start gap-2 px-2 pb-2 text-xs leading-5 text-muted-foreground">
            <Moon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('accountActivity.supplemental.blocked')}
          </p>
        )}
        <DropdownMenuSeparator />
        {SUPPLEMENTAL_KINDS.map((kind) => {
          const Icon = KIND_ICON[kind];
          const state = kinds[kind];
          const draft = resumableDraft(kind);
          const dormant = !draft && !canOrder;
          const blocked = dormant || (!draft && !state.allowed);
          const detail = draft
            ? t('supplemental.actions.resumeDraft', { code: draft.order.orderCode })
            : dormant
              ? t('accountActivity.status.inactive')
              : blocked && state.blockedReason
                ? t(`supplemental.blockedReason.${state.blockedReason}`)
                : t(`supplemental.typeDescription.${kind}`);
          return (
            <DropdownMenuItem
              key={kind}
              disabled={blocked}
              className="min-h-11 items-start gap-3 py-3"
              onSelect={() =>
                draft
                  ? router.push(
                      buildSupplementalWizardHref({
                        parentOrderId,
                        type: kind,
                        requestId: draft.order.id,
                      }),
                    )
                  : start(parentOrderId, kind)
              }
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{t(`supplemental.type.${kind}`)}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{detail}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
