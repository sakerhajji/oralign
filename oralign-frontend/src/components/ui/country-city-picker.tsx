'use client';

import { useCallback, useId, useMemo, useState } from 'react';
// Types only (erased at build): the dataset itself is never imported
// statically — see loadCountries / loadCityItems below.
import type { ICity, ICountry } from 'country-state-city';
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
  /** Shown (not stored) while `value` has no country, e.g. "TN". */
  defaultCountryCode?: string;
  countryLabel?: string;
  cityLabel?: string;
  /** Show the clear (X) button on the country. Default true; false when a country is mandatory. */
  countryClearable?: boolean;
  disabled?: boolean;
  invalid?: { country?: boolean; city?: boolean };
  className?: string;
}

/**
 * Countries the picker can name and flag before the dataset is loaded —
 * the defaults the app preselects. Names match `country-state-city`'s, the
 * string persisted by every form using this picker.
 */
const KNOWN_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  TN: 'Tunisia',
};

/** The country preselected by the app's forms (ISO code + dataset name). */
export const DEFAULT_COUNTRY = { code: 'TN', name: KNOWN_COUNTRY_NAMES.TN } as const;

const EMPTY_ITEMS: readonly ComboboxItem[] = [];

/** "TN" → 🇹🇳 (two regional-indicator symbols); no dataset needed. */
function flagOf(isoCode: string): string | undefined {
  if (!/^[A-Za-z]{2}$/.test(isoCode)) return undefined;
  return String.fromCodePoint(
    ...isoCode.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

// ── Lazy dataset ─────────────────────────────────────────────────────────
// `country-state-city` ships every city of the world (8 MB of JSON, ~150k
// rows). Importing it statically put that chunk in the first load of every
// page using this picker and froze the main thread on mount while it was
// parsed and converted. The two halves are now separate dynamic imports,
// fetched the first time the matching list opens. Each promise is cached
// for the tab and dropped on failure so the next open retries.

let countriesPromise: Promise<readonly ICountry[]> | null = null;
let countriesLoaded: readonly ICountry[] | null = null;

function loadCountries(): Promise<readonly ICountry[]> {
  countriesPromise ??= import('country-state-city/lib/country').then(
    (mod) => {
      countriesLoaded = mod.default.getAllCountries();
      return countriesLoaded;
    },
    (error: unknown) => {
      countriesPromise = null;
      throw error;
    },
  );
  return countriesPromise;
}

type CityApi = (typeof import('country-state-city/lib/city'))['default'];
let cityApiPromise: Promise<CityApi> | null = null;
/** Combobox items per ISO code: built once, on the first open for that country. */
const cityItemsByCountry = new Map<string, readonly ComboboxItem[]>();

async function loadCityItems(countryCode: string): Promise<readonly ComboboxItem[]> {
  const cached = cityItemsByCountry.get(countryCode);
  if (cached) return cached;
  cityApiPromise ??= import('country-state-city/lib/city').then(
    (mod) => mod.default,
    (error: unknown) => {
      cityApiPromise = null;
      throw error;
    },
  );
  const cityApi = await cityApiPromise;
  const items = toCityItems(cityApi.getCitiesOfCountry(countryCode) ?? []);
  cityItemsByCountry.set(countryCode, items);
  return items;
}

function toCityItems(cities: readonly ICity[]): readonly ComboboxItem[] {
  // De-duplicate by name (the dataset has multiple rows per city name when
  // there are several administrative subdivisions — we don't surface state
  // here, so the dropdown shouldn't show duplicates).
  const seen = new Set<string>();
  const unique: ComboboxItem[] = [];
  for (const city of cities) {
    const key = city.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ value: city.name, label: city.name, hint: city.stateCode });
  }
  unique.sort((a, b) => a.label.localeCompare(b.label));
  return unique;
}

function findCountryByName(
  countries: readonly ICountry[] | null,
  name: string,
): ICountry | undefined {
  const needle = name.trim().toLowerCase();
  return countries?.find((c) => c.name.toLowerCase() === needle);
}

/** ISO code for a stored country name, from the static map or the loaded list. */
function codeForName(name: string, countries: readonly ICountry[] | null): string | null {
  const needle = name.trim().toLowerCase();
  for (const [code, known] of Object.entries(KNOWN_COUNTRY_NAMES)) {
    if (known.toLowerCase() === needle) return code;
  }
  return findCountryByName(countries, name)?.isoCode ?? null;
}

type LoadState = 'idle' | 'loading' | 'error';

/**
 * Two-step searchable picker:
 *   1. Country (full world list with emoji flags, searchable by name or ISO)
 *   2. City (filtered to the chosen country, searchable)
 *
 * Both selectors use the same SearchableCombobox primitive so they look and
 * behave identically. The stored value (a country NAME + a city name) is
 * shown as-is, so the trigger renders without the dataset; each list loads
 * when it is first opened, with a loading row meanwhile.
 */
export function CountryCityPicker({
  value,
  onChange,
  defaultCountryCode,
  countryLabel,
  cityLabel,
  countryClearable = true,
  disabled,
  invalid,
  className,
}: CountryCityPickerProps) {
  const { t } = useT();
  const uid = useId();
  const countryId = `${uid}-country`;
  const cityId = `${uid}-city`;

  const [countries, setCountries] = useState<readonly ICountry[] | null>(countriesLoaded);
  const [countriesState, setCountriesState] = useState<LoadState>('idle');
  const [cityLists, setCityLists] = useState<Readonly<Record<string, readonly ComboboxItem[]>>>({});
  // The city list being fetched (or that failed), by ISO code — so a slow
  // answer for a previous country never hides or flags the current one.
  const [cityLoad, setCityLoad] = useState<{ code: string; failed: boolean } | null>(null);
  // The display default applies until the user picks or clears a country.
  const [defaultDismissed, setDefaultDismissed] = useState(false);

  const storedCountry = value.country?.trim() ?? '';
  const fallbackCode =
    !storedCountry && !value.countryCode && !defaultDismissed
      ? (defaultCountryCode ?? null)
      : null;
  const countryCode =
    value.countryCode ||
    (storedCountry ? codeForName(storedCountry, countries) : null) ||
    fallbackCode;
  const countryName =
    storedCountry ||
    (countryCode
      ? (countries?.find((c) => c.isoCode === countryCode)?.name ??
        KNOWN_COUNTRY_NAMES[countryCode] ??
        countryCode)
      : '');

  const countryItems = useMemo<readonly ComboboxItem[]>(
    () =>
      countries?.map((c) => ({
        value: c.isoCode,
        label: c.name,
        prefix: c.flag,
        hint: c.isoCode,
        keywords: `${c.name} ${c.isoCode} ${c.flag}`,
      })) ?? EMPTY_ITEMS,
    [countries],
  );

  // Combobox value: the ISO code once known, else the stored name (a
  // country the static map can't resolve before the list is loaded).
  const countryValue = countryCode ?? (storedCountry || null);
  const countrySelectedItem = useMemo<ComboboxItem | null>(
    () =>
      countryValue
        ? {
            value: countryValue,
            label: countryName,
            prefix: countryCode ? flagOf(countryCode) : undefined,
            hint: countryCode ?? undefined,
          }
        : null,
    [countryValue, countryName, countryCode],
  );

  const ensureCountries = useCallback(async (): Promise<readonly ICountry[] | null> => {
    if (countriesLoaded) {
      setCountries(countriesLoaded);
      return countriesLoaded;
    }
    setCountriesState('loading');
    try {
      const list = await loadCountries();
      setCountries(list);
      setCountriesState('idle');
      return list;
    } catch {
      setCountriesState('error');
      return null;
    }
  }, []);

  const handleCountryOpen = (open: boolean) => {
    if (open && !countries) void ensureCountries();
  };

  const handleCityOpen = async (open: boolean) => {
    if (!open) return;
    let code = countryCode;
    if (!code && storedCountry) {
      // A stored name the static map can't resolve: the country list gives
      // its ISO code (the loading row shows meanwhile, see citiesLoading).
      const list = await ensureCountries();
      code = list ? codeForName(storedCountry, list) : null;
    }
    if (!code || cityLists[code]) return;
    const target = code;
    setCityLoad({ code: target, failed: false });
    try {
      const items = await loadCityItems(target);
      setCityLists((current) => ({ ...current, [target]: items }));
      setCityLoad((current) => (current?.code === target ? null : current));
    } catch {
      setCityLoad((current) =>
        current?.code === target ? { code: target, failed: true } : current,
      );
    }
  };

  const handleCountryChange = (nextIso: string | null) => {
    setDefaultDismissed(true);
    const country = nextIso ? countries?.find((c) => c.isoCode === nextIso) : undefined;
    onChange({
      country: country?.name ?? (nextIso ? (KNOWN_COUNTRY_NAMES[nextIso] ?? '') : ''),
      countryCode: country?.isoCode ?? nextIso ?? '',
      // Clear the city when the country changes — old city may not exist in
      // the new country, and silently keeping it would create inconsistent
      // state.
      city: '',
    });
  };

  const handleCityChange = (nextCity: string | null) => {
    onChange({
      country: countryName,
      countryCode: countryCode ?? value.countryCode ?? '',
      city: nextCity ?? '',
    });
  };

  const cityItems = (countryCode && cityLists[countryCode]) || EMPTY_ITEMS;
  const resolvingCountry = !countryCode && !!storedCountry;
  const cityLoadHere = countryCode && cityLoad?.code === countryCode ? cityLoad : null;
  const citiesLoading =
    (resolvingCountry && countriesState === 'loading') ||
    (cityLoadHere !== null && !cityLoadHere.failed);
  const citiesFailed =
    (resolvingCountry && countriesState === 'error') || !!cityLoadHere?.failed;
  const hasCountry = !!countryValue;
  const city = value.city ?? '';
  const citySelectedItem = useMemo<ComboboxItem | null>(
    () => (city ? { value: city, label: city } : null),
    [city],
  );

  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor={countryId}>
            {countryLabel ?? t('settingsDesk.picker.country')}
          </label>
          <SearchableCombobox
            id={countryId}
            value={countryValue}
            selectedItem={countrySelectedItem}
            onChange={handleCountryChange}
            onOpenChange={handleCountryOpen}
            clearable={countryClearable}
            loading={countriesState === 'loading'}
            items={countryItems}
            placeholder={t('uiBits.pickCountry')}
            emptyLabel={
              countriesState === 'error'
                ? t('settingsDesk.picker.loadFailed')
                : t('uiBits.noCountriesMatch')
            }
            disabled={disabled}
            isInvalid={invalid?.country}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor={cityId}>
            {cityLabel ?? t('settingsDesk.picker.city')}
          </label>
          <SearchableCombobox
            id={cityId}
            value={city || null}
            selectedItem={citySelectedItem}
            onChange={handleCityChange}
            onOpenChange={(open) => void handleCityOpen(open)}
            loading={citiesLoading}
            items={cityItems}
            placeholder={
              hasCountry ? t('uiBits.pickCity') : t('uiBits.chooseCountryFirst')
            }
            emptyLabel={
              citiesFailed
                ? t('settingsDesk.picker.loadFailed')
                : hasCountry
                  ? t('uiBits.noCitiesMatch')
                  : t('uiBits.pickCountryToSeeCities')
            }
            disabled={disabled || !hasCountry}
            isInvalid={invalid?.city}
            hint={
              cityItems.length > 200
                ? t('settingsDesk.picker.citiesHint', { count: cityItems.length })
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
