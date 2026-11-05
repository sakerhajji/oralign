'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Gift, Info, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCompanyBilling } from '@/lib/hooks/use-company-billing';
import { useSetDoctorWelcomeGiftMark } from '@/lib/hooks/use-welcome-gift';
import { useT } from '@/lib/i18n/lang-context';
import type { User } from '@/lib/types';
import { formatTimestampDay } from '@/lib/utils/calendar-date';

/**
 * User sheet → Account → "Cadeau Oralign" (dentists only).
 *
 * The switch saves on its own through `PATCH /welcome-gift/doctors/:id`
 * (own pending state, toast) — it is not part of the Account form's
 * Save button. While the request runs it shows the requested position.
 * When the offer is switched off globally a muted note says so, without
 * blocking the switch (the mark still matters once the offer is back on).
 */
export function WelcomeGiftMarkSection({ user }: { user: User }) {
  const { t, lang } = useT();
  const switchId = useId();
  const billing = useCompanyBilling();
  const setMark = useSetDoctorWelcomeGiftMark();

  // Payload without the mark (backend older than the gift admin): hide.
  if (user.welcomeGiftUsedAt === undefined) return null;

  const pending = setMark.isPending && setMark.variables?.doctorId === user.id;
  const checked = pending
    ? Boolean(setMark.variables?.used)
    : Boolean(user.welcomeGiftUsedAt);
  const order = user.welcomeGiftOrder ?? null;
  const offerOff = billing.data?.welcomeGiftEnabled === false;
  // An archived case still counts as the used gift, but its page is gone
  // (GET /orders/:id answers 404): show the code without a link.
  const caseLink = !order ? null : order.archived ? (
    <span className="font-medium text-foreground">
      {order.orderCode} {t('usersDesk.gift.archivedCase')}
    </span>
  ) : (
    <Link
      href={`/dashboard/orders/${order.id}`}
      className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
    >
      {order.orderCode}
    </Link>
  );

  return (
    <section aria-labelledby={`${switchId}-title`}>
      <h3
        id={`${switchId}-title`}
        className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {t('usersDesk.gift.title')}
      </h3>
      <div className="rounded-lg border">
        <div className="flex items-start justify-between gap-4 p-3">
          <div className="min-w-0">
            <Label htmlFor={switchId} className="flex items-center gap-1.5">
              <Gift className="size-3.5" aria-hidden="true" />
              {t('usersDesk.gift.switchLabel')}
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('usersDesk.gift.switchHint')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {pending && (
              <Loader2
                className="size-3.5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <Switch
              id={switchId}
              checked={checked}
              disabled={pending}
              aria-busy={pending}
              onCheckedChange={(used) =>
                setMark.mutate({ doctorId: user.id, used })
              }
            />
          </div>
        </div>

        <div className="space-y-1 border-t bg-muted/30 px-3 py-2.5 text-sm">
          {user.welcomeGiftUsedAt ? (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
              />
              <span>
                {t('usersDesk.gift.statusUsedOn', {
                  date: formatTimestampDay(user.welcomeGiftUsedAt, lang),
                })}
              </span>
              {caseLink ? (
                <span className="text-muted-foreground">
                  {t('usersDesk.gift.statusOnCase')} {caseLink}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {t('usersDesk.gift.statusManual')}
                </span>
              )}
            </p>
          ) : (
            <>
              <p className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                />
                <span className="text-emerald-700 dark:text-emerald-400">
                  {t('usersDesk.gift.statusAvailable')}
                </span>
              </p>
              {caseLink && (
                <p className="text-xs text-muted-foreground">
                  {t('usersDesk.gift.previousCase')} {caseLink}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {offerOff && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {t('usersDesk.gift.offerOff')}
        </p>
      )}
    </section>
  );
}
