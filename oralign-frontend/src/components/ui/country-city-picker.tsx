'use client';

import { useEffect, useMemo, useState } from 'react';
import { Country, City } from 'country-state-city';
import type { ICountry, ICity } from 'country-state-city';
import { SearchableCombobox, type ComboboxItem } from './searchable-combobox';
import { useT } from '@/lib/i18n/lang-context';

export interface CountryCityValue {
  /** Country name, e.g. "Tunisia". Persisted in the dentist profile. */
  country: string;
  /** ISO-2 country code, e.g. "TN". Useful for cross-references. */
  countryCode: string;
  /** City name. */
  city: string;
}

export interface CountryCityPickerProps {
  value: Partial<CountryCityValue>;
  onChange: (next: CountryCityValue) => void;
  /** Defaults if value is empty (e.g. default to Tunisia). */
  defaultCountryCode?: string;
  countryLabel?: string;
  cityLabel?: string;
  disabled?: boolean;
  invalid?: { country?: boolean; city?: boolean };
  className?: string;
}

/**
 * Two-step searchable picker:
 *   1. Country (full world list with emoji flags, searchable by name or ISO)
 *   2. City (filtered to the chosen country, searchable)
 *
 * Both selectors use the same SearchableCombobox primitive so they look and
 * behave identically. The city list is empty until a country is chosen — we
 * surface that explicitly in the empty/hint state instead of silently
 * showing nothing.
 */
export function CountryCityPicker({
  value,
  onChange,
  defaultCountryCode,
  countryLabel = 'Country',
  cityLabel = 'City',
  disabled,
  invalid,
  className,
}: CountryCityPickerProps) {
  const { t } = useT();
  // Reverse-lookup country by name (because the persisted value is the
  // human-readable country name, not the ISO code).
  const allCountries = useMemo(() => Country.getAllCountries(), []);
  const countryByName = useMemo(() => {
    const m = new Map<string, ICountry>();
    for (const c of allCountries) m.set(c.name.toLowerCase(), c);
    return m;
  }, [allCountries]);
  const countryByCode = useMemo(() => {
    const m = new Map<string, ICountry>();
    for (const c of allCountries) m.set(c.isoCode, c);
    return m;
  }, [allCountries]);

  const [countryCode, setCountryCode] = useState<string | null>(() => {
    if (value.countryCode) return value.countryCode;
    if (value.country) {
      return countryByName.get(value.country.toLowerCase())?.isoCode ?? null;
    }
    return defaultCountryCode ?? null;
  });

  // Keep local state in sync if the parent passes a new value (e.g. after
  // form.reset from existing profile data).
  useEffect(() => {
    if (value.countryCode && value.countryCode !== countryCode) {
      setCountryCode(value.countryCode);
      return;
    }
    if (value.country) {
      const match = countryByName.get(value.country.toLowerCase());
      if (match && match.isoCode !== countryCode) {
        setCountryCode(match.isoCode);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.country, value.countryCode]);

  const countryItems: ComboboxItem[] = useMemo(
    () =>
      allCountries.map((c) => ({
        value: c.isoCode,
        label: c.name,
        prefix: c.flag,
        hint: c.isoCode,
        keywords: `${c.name} ${c.isoCode} ${c.flag}`,
      })),
    [allCountries],
  );

  const cityItems: ComboboxItem[] = useMemo(() => {
    if (!countryCode) return [];
    const cities: ICity[] = City.getCitiesOfCountry(countryCode) ?? [];
    // De-duplicate by name (the dataset has multiple rows per city name when
    // there are several administrative subdivisions — we don't surface state
    // here, so the dropdown shouldn't show duplicates).
    const seen = new Set<string>();
    const unique: ComboboxItem[] = [];
    for (const city of cities) {
      const key = city.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push({
        value: city.name,
        label: city.name,
        hint: city.stateCode,
      });
    }
    unique.sort((a, b) => a.label.localeCompare(b.label));
    return unique;
  }, [countryCode]);

  const handleCountryChange = (nextIso: string | null) => {
    setCountryCode(nextIso);
    const country = nextIso ? countryByCode.get(nextIso) : undefined;
    onChange({
      country: country?.name ?? '',
      countryCode: country?.isoCode ?? '',
      // Clear the city when the country changes — old city may not exist in
      // the new country, and silently keeping it would create inconsistent
      // state.
      city: '',
    });
  };

  const handleCityChange = (nextCity: string | null) => {
    const country = countryCode ? countryByCode.get(countryCode) : undefined;
    onChange({
      country: country?.name ?? value.country ?? '',
      countryCode: country?.isoCode ?? value.countryCode ?? '',
      city: nextCity ?? '',
    });
  };

  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="picker-country">
            {countryLabel}
          </label>
          <SearchableCombobox
            id="picker-country"
            value={countryCode ?? undefined}
            onChange={handleCountryChange}
            items={countryItems}
            placeholder={t('uiBits.pickCountry')}
            emptyLabel={t('uiBits.noCountriesMatch')}
            disabled={disabled}
            isInvalid={invalid?.country}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="picker-city">
            {cityLabel}
          </label>
          <SearchableCombobox
            id="picker-city"
            value={value.city ?? undefined}
            onChange={handleCityChange}
            items={cityItems}
            placeholder={
              countryCode
                ? t('uiBits.pickCity')
                : t('uiBits.chooseCountryFirst')
            }
            emptyLabel={
              countryCode
                ? t('uiBits.noCitiesMatch')
                : t('uiBits.pickCountryToSeeCities')
            }
            disabled={disabled || !countryCode}
            isInvalid={invalid?.city}
            hint={
              cityItems.length > 200
                ? `${cityItems.length} cities — narrow with search`
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
