'use client';

import { useId } from 'react';
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  InfoIcon,
  PackageIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { pickLocalized } from '@/lib/api/blog.service';
import { useDoctorAvailablePacks } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import type { AvailablePack } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';
import {
  packCardDescription,
  packCardFacts,
  packCardName,
  type PackFactKind,
  type PickText,
} from './pack-card-facts';

// A wrapping row rather than a grid: a row that is not full (one or two
// packs, or the last packs of the list) sits in the middle of the page
// instead of against the left edge. Widths match 1 / 2 / 3 columns.
const CARD_ROW = 'flex flex-wrap justify-center gap-4';
const CARD_WIDTH = 'w-full md:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]';

const FACT_ICON: Record<PackFactKind, LucideIcon> = {
  steps: CheckCircle2Icon,
  corrections: CheckCircle2Icon,
  validity: CalendarClockIcon,
};

/**
 * The practitioner's pack catalogue, in the order set by the admin.
 * Read-only: the pack of a case is the one an admin attaches to its quote,
 * so the cards carry no call to action. Prices are TTC.
 */
export function AvailablePacks() {
  const { data, isPending, isError, isFetching, refetch } =
    useDoctorAvailablePacks();
  const { t } = useT();

  if (isPending) {
    return (
      <div aria-busy="true">
        <span role="status" className="sr-only">
          {t('dashboard.packs.loading')}
        </span>
        <div className={CARD_ROW} aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className={cn('h-[22rem] rounded-xl', CARD_WIDTH)} />
          ))}
        </div>
      </div>
    );
  }

  // A failed background refresh keeps showing the cached catalogue; only
  // a first load that failed gets the error state.
  if (isError && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <TriangleAlertIcon className="size-6 text-destructive" aria-hidden="true" />
          <p role="alert" className="text-sm text-muted-foreground">
            {t('dashboard.packs.loadError')}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="pointer-coarse:h-12 pointer-coarse:px-4"
          >
            <RefreshCwIcon
              className={cn('size-4', isFetching && 'animate-spin')}
              aria-hidden="true"
            />
            {t('dashboard.packs.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <PackageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t('dashboard.packs.none')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul aria-label={t('dashboard.packs.listLabel')} className={CARD_ROW}>
      {data.map((pack) => (
        <li key={pack.id} className={cn('flex', CARD_WIDTH)}>
          <PackCard pack={pack} />
        </li>
      ))}
    </ul>
  );
}

function PackCard({ pack }: { pack: AvailablePack }) {
  const { t, lang } = useT();
  const priceCaptionId = useId();
  const pick: PickText = (value) => pickLocalized(value, lang);

  const name = packCardName(pack, pick);
  const description =
    packCardDescription(pack, pick) ?? t('dashboard.packs.defaultDescription');
  const facts = packCardFacts(pack, pick);
  const archPrices = [
    { label: t('quoteUi.attachPack.twoArches'), amount: pack.priceTwoArches },
    { label: t('quoteUi.attachPack.singleArch'), amount: pack.priceSingleArch },
  ];

  return (
    <Card className="w-full">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <PackageIcon className="size-4" />
          </span>
          <h2 className="min-w-0 font-heading text-lg leading-snug font-semibold break-words">
            {name}
          </h2>
        </div>
        {/* Two lines reserved side by side, so the price blocks of a row
            line up when descriptions differ in length. */}
        <CardDescription className="line-clamp-3 md:min-h-10">
          {description}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="overflow-hidden rounded-lg border">
          <p
            id={priceCaptionId}
            className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            {t('dashboard.packs.pricesTtc')}
          </p>
          <dl aria-labelledby={priceCaptionId} className="divide-y">
            {archPrices.map(({ label, amount }) => (
              <div
                key={label}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2"
              >
                <dt className="text-muted-foreground">{label}</dt>
                {amount == null ? (
                  <dd className="text-muted-foreground">
                    {t('dashboard.packs.archNotOffered')}
                  </dd>
                ) : (
                  <dd className="text-base font-semibold tabular-nums">
                    {formatPrice(amount, pack.currency)}
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </div>

        {facts.length > 0 ? (
          <ul aria-label={t('dashboard.packs.featuresLabel')} className="space-y-2">
            {facts.map((fact) => {
              const Icon = FACT_ICON[fact.kind];
              return (
                <li key={fact.kind} className="flex items-start gap-2">
                  <Icon
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      fact.kind === 'validity'
                        ? 'text-primary'
                        : 'text-emerald-600 dark:text-emerald-400',
                    )}
                    aria-hidden="true"
                  />
                  <span>{t(fact.key, fact.params)}</span>
                </li>
              );
            })}
          </ul>
        ) : null}

        <p className="mt-auto flex items-start gap-2 rounded-md border bg-muted/30 px-2.5 py-2 text-xs leading-snug text-muted-foreground">
          <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {pack.isCurrent ? (
              <>
                <span className="font-medium text-foreground">
                  {t('dashboard.packs.hintCurrent')}
                </span>{' '}
              </>
            ) : null}
            {t('dashboard.packs.hint')}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
