'use client';

import { useMemo } from 'react';
// The flag sprite: the same stylesheet PhoneInput loads (bundled once).
import 'react-phone-input-2/lib/style.css';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

const ISO2_REGEX = /^[A-Za-z]{2}$/;

function useCountryLabel(country?: string) {
  const { lang } = useT();
  const displayNames = useMemo(
    () =>
      typeof Intl !== 'undefined' && 'DisplayNames' in Intl
        ? new Intl.DisplayNames([lang], { type: 'region' })
        : undefined,
    [lang],
  );
  if (!country || !ISO2_REGEX.test(country)) return '';
  const iso2 = country.toUpperCase();
  try {
    return displayNames?.of(iso2) ?? iso2;
  } catch {
    return iso2;
  }
}

/**
 * The country's flag from react-phone-input-2's sprite. The library
 * scopes its sprite rules under `.react-tel-input` (`.react-tel-input
 * .flag`, `.react-tel-input .tn`), so the flag sits in a wrapper with
 * that class; the `!` utilities undo the wrapper's form-field box
 * (full width) so it stays an inline 16×11 mark.
 */
export function CountryFlag({
  country,
  className,
}: {
  country?: string;
  className?: string;
}) {
  if (!country || !ISO2_REGEX.test(country)) return null;
  return (
    <span
      aria-hidden="true"
      className={cn('react-tel-input inline-flex w-auto! shrink-0 items-center', className)}
    >
      <span className={cn('flag inline-block rounded-[2px]', country.toLowerCase())} />
    </span>
  );
}

export function CountryPhoneDisplay({
  phone,
  country,
  fallback,
  className,
}: {
  phone?: string;
  country?: string;
  fallback?: string;
  className?: string;
}) {
  const { t } = useT();
  // Resolved here (not as a parameter default) so the fallback flips
  // with the language toggle.
  const effectiveFallback = fallback ?? t('uiBits.notProvided');
  const countryLabel = useCountryLabel(country);

  if (!phone && !countryLabel) {
    return <span className={className}>{effectiveFallback}</span>;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <CountryFlag country={country} />
      <span className="font-medium">{countryLabel || effectiveFallback}</span>
      {phone && <span className="text-muted-foreground">· {phone}</span>}
    </div>
  );
}
