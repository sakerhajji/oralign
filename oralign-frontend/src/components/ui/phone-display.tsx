'use client';

import React from 'react';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

const ISO2_REGEX = /^[A-Za-z]{2}$/;

const displayNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : undefined;

function getCountryLabel(country?: string) {
  if (!country || !ISO2_REGEX.test(country)) return '';
  const iso2 = country.toUpperCase();
  return displayNames?.of(iso2) ?? iso2;
}

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
      className={cn('flag country-flag', country.toLowerCase(), className)}
      aria-hidden="true"
    />
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
  const countryLabel = getCountryLabel(country);

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
