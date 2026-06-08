'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2Icon,
  InfoIcon,
  PackageIcon,
  SparklesIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDoctorAvailablePacks } from '@/lib/hooks';
import type { AvailablePack } from '@/lib/types';

const TND = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' TND';

/**
 * Doctor-facing available packs grid. Mirrors the marketing pack
 * cards but lives inside the dashboard, with a "Current" badge on
 * the pack the doctor most recently paid for.
 */
export function AvailablePacks({ recommendedId }: { recommendedId?: string }) {
  const { data, isLoading } = useDoctorAvailablePacks();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="grid h-32 place-items-center text-sm text-muted-foreground">
          No packs are currently available.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {data.map((pack) => (
        <PackCard
          key={pack.id}
          pack={pack}
          isRecommended={recommendedId === pack.id && !pack.isCurrent}
        />
      ))}
    </div>
  );
}

function PackCard({
  pack,
  isRecommended,
}: {
  pack: AvailablePack;
  isRecommended: boolean;
}) {
  const features: { label: string; ok: boolean }[] = [
    {
      label: pack.isUnlimitedSteps
        ? 'Unlimited treatment steps'
        : `${pack.maxStepsPerArch ?? 0} steps per arch`,
      ok: true,
    },
    {
      label: pack.isUnlimitedCorrections
        ? 'Unlimited corrections'
        : `${pack.includedCorrections ?? 0} corrections included`,
      ok: true,
    },
    {
      label: pack.isForOrthodontists
        ? 'Tailored for orthodontists'
        : 'General dentists welcome',
      ok: true,
    },
  ];

  return (
    // Read-only catalogue card. Subscription happens on the order
    // wizard (the doctor picks a pack as part of the New Order flow),
    // NOT here — keeping a CTA on this card would lead doctors into
    // a half-flow that needs an order to complete. Better to surface
    // it as informational and let the order form be the single entry.
    <Card
      className={cn(
        'relative flex h-full flex-col',
        // The "Current" pack used to ship with a `ring-2 ring-primary`
        // halo, but the team asked to drop it — the badge on the top-
        // right already tells the doctor which pack is theirs and the
        // ring made the catalogue feel cluttered. Recommended packs
        // still get a soft tinted border so the suggestion reads
        // distinctly from the default cards.
        isRecommended && 'border-emerald-300/60',
      )}
    >
      {/*
        The "Current" badge used to sit here for the doctor's
        active pack. Removed at product's request — the catalogue
        is purely informational and the badge was redundant with
        the inline hint in the card body.
       */}
      {isRecommended ? (
        <Badge
          variant="outline"
          className="absolute right-4 top-4 gap-1 border-emerald-400 text-emerald-700 dark:text-emerald-300"
        >
          <SparklesIcon className="size-3" /> Recommended
        </Badge>
      ) : null}
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <PackageIcon className="size-4" />
          </div>
          <CardTitle className="text-lg">{pack.name}</CardTitle>
        </div>
        <CardDescription className="line-clamp-2 min-h-[2.5rem]">
          {pack.description ?? 'Customized aligner workflow tailored to your clinic.'}
        </CardDescription>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-3xl font-bold tabular-nums">
            {TND(pack.price)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <ul className="space-y-2 text-sm">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2Icon className="mt-0.5 size-4 text-emerald-600" />
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
        {/* Inline hint replacing the old "Subscribe" CTA. Surfaces
            where to actually pick the pack so doctors don't hunt
            for a button that's no longer here. */}
        <p className="flex items-start gap-1.5 rounded-md border bg-muted/30 p-2 text-[11px] leading-snug text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3 shrink-0" />
          <span>
            {pack.isCurrent
              ? 'Your current pack. You can pick it again when you create a new order.'
              : 'Choose this pack from the New Order form when you create a case.'}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
