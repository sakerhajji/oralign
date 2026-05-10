'use client';

import React from 'react';
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
  fallback = 'Not provided',
  className,
}: {
  phone?: string;
  country?: string;
  fallback?: string;
  className?: string;
}) {
  const countryLabel = getCountryLabel(country);

  if (!phone && !countryLabel) {
    return <span className={className}>{fallback}</span>;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <CountryFlag country={country} />
      <span className="font-medium">{countryLabel || fallback}</span>
      {phone && <span className="text-muted-foreground">· {phone}</span>}
    </div>
  );
}
