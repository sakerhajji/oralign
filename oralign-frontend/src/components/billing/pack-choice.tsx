'use client';

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { usePacks } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import { ArchType, type Pack, type PackPrice } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';
import { PackPicker, archLabel, packFacts } from './pack-picker';

/** A pack + arcade pair, as stored on a quote. */
export interface PackChoice {
  packId: string;
  archType: ArchType;
}

export interface ResolvedPackChoice {
  pack: Pack;
  /** The requested arcade, or the one the pack actually sells. */
  archType: ArchType;
  price: PackPrice | null;
  twoPrice: PackPrice | null;
  singlePrice: PackPrice | null;
}

/**
 * Resolve a choice against the live catalogue. Falls back to the arcade
 * the pack does sell when the requested one has no active price; null
 * when the pack is gone or inactive.
 */
export function resolvePackChoice(
  packs: readonly Pack[] | undefined,
  choice: PackChoice | null,
): ResolvedPackChoice | null {
  if (!choice) return null;
  const pack = packs?.find((p) => p.id === choice.packId && p.isActive && !p.deletedAt);
  if (!pack) return null;
  const prices = (pack.prices ?? []).filter((p) => p.isActive);
  const twoPrice = prices.find((p) => p.archType === ArchType.TWO_ARCHES) ?? null;
  const singlePrice = prices.find((p) => p.archType === ArchType.ONE_ARCH) ?? null;
  const archType =
    choice.archType === ArchType.ONE_ARCH && !singlePrice
      ? ArchType.TWO_ARCHES
      : choice.archType === ArchType.TWO_ARCHES && !twoPrice && singlePrice
        ? ArchType.ONE_ARCH
        : choice.archType;
  return {
    pack,
    archType,
    price: archType === ArchType.ONE_ARCH ? singlePrice : twoPrice,
    twoPrice,
    singlePrice,
  };
}

/** Resolved choice for the current catalogue (shares the picker's cache). */
export function useResolvedPackChoice(choice: PackChoice | null) {
  const packsQ = usePacks({ limit: 100 });
  return resolvePackChoice(packsQ.data?.data, choice);
}

/**
 * Pack picker + arcade switch. A pick from the catalogue sets both; the
 * switch then flips between the pack's two prices without reopening it.
 */
export function PackChoiceFields({
  value,
  onChange,
  disabled,
  hidePackLabel = false,
}: {
  value: PackChoice | null;
  onChange: (choice: PackChoice) => void;
  disabled?: boolean;
  /** Keep the label for screen readers only (the section title says it). */
  hidePackLabel?: boolean;
}) {
  const { t, lang } = useT();
  const resolved = useResolvedPackChoice(value);
  const pickerId = useId();
  const archLabelId = useId();
  const facts = resolved ? packFacts(resolved.pack, t, lang) : [];

  const arches = [
    { arch: ArchType.TWO_ARCHES, price: resolved?.twoPrice ?? null },
    { arch: ArchType.ONE_ARCH, price: resolved?.singlePrice ?? null },
  ];

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor={pickerId} className={hidePackLabel ? 'sr-only' : undefined}>
          {t('quoteUi.attachPack.packLabel')}
        </Label>
        <PackPicker
          id={pickerId}
          value={resolved ? { packId: resolved.pack.id, archType: resolved.archType } : null}
          onSelect={({ pack, price }) => onChange({ packId: pack.id, archType: price.archType })}
          disabled={disabled}
        />
        {facts.length > 0 ? (
          <p className="text-xs text-muted-foreground">{facts.join(' · ')}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <span id={archLabelId} className="text-sm font-medium">
          {t('quoteUi.attachPack.archModeLabel')}
        </span>
        <div
          role="radiogroup"
          aria-labelledby={archLabelId}
          className="grid grid-cols-2 gap-2 sm:max-w-md"
        >
          {arches.map(({ arch, price }) => {
            const checked = !!resolved && resolved.archType === arch;
            return (
              <button
                key={arch}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={disabled || !price}
                onClick={() => resolved && onChange({ packId: resolved.pack.id, archType: arch })}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  checked
                    ? 'border-foreground bg-muted/40 ring-1 ring-foreground'
                    : 'border-input hover:border-foreground/30',
                )}
              >
                <span className="text-sm font-medium">{archLabel(arch, t)}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {price ? formatPrice(price.price, price.currency) : '—'}
                </span>
              </button>
            );
          })}
        </div>
        {resolved && !resolved.singlePrice ? (
          <p className="text-xs text-muted-foreground">
            {t('quoteUi.attachPack.singleArchUnavailable')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
