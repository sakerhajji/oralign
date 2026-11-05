'use client';

import React from 'react';
import ReactPhoneInput from 'react-phone-input-2';
import type { CountryData } from 'react-phone-input-2';
import frCountryNames from 'react-phone-input-2/lang/fr.json';
// Loaded with this component only (it carries a 45 KB flag sprite): the
// overrides in app/globals.css win on specificity, not on order.
import 'react-phone-input-2/lib/style.css';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

const ISO2_REGEX = /^[A-Za-z]{2}$/;

/**
 * Pinned at the top of the country list, in this order (Tunisia, France,
 * then the neighbours) — `preserveOrder` stops the library re-sorting
 * them by name.
 */
const PREFERRED_COUNTRIES = ['tn', 'fr', 'dz', 'ly', 'ma'];
const PRESERVE_ORDER = ['preferredCountries'];
/**
 * The library has no Tunisian mask and falls back to "221 234 56";
 * Tunisian numbers have 8 digits, written "22 123 456".
 */
const MASKS = { tn: '.. ... ...' };

/**
 * Field heights, matched to the inputs the phone field sits beside:
 * `sm` = the shadcn Input (h-8), `default` = h-10, `lg` = the order
 * wizard's h-11 fields. The `!` utilities live in a cascade layer, so
 * they beat the unlayered `!important` rules of globals.css and of the
 * library stylesheet.
 */
export type PhoneInputSize = 'sm' | 'default' | 'lg';
const SIZE_CLASS: Record<PhoneInputSize, string> = {
  sm: 'h-8! py-0!',
  default: '',
  lg: 'h-11!',
};

function normalizeCountryCode(value?: string, fallback?: string) {
  const candidate = value ?? fallback;
  if (!candidate || !ISO2_REGEX.test(candidate)) return undefined;
  return candidate.toLowerCase();
}

function normalizePhoneValue(value?: string) {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

export interface PhoneInputChange {
  phone: string;
  country: string;
}

export interface PhoneInputProps {
  id?: string;
  name?: string;
  value?: string;
  country?: string;
  defaultCountry?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  isInvalid?: boolean;
  /** Height matching the surrounding inputs (default h-10). */
  size?: PhoneInputSize;
  /**
   * The underlying <input>, e.g. a react-hook-form Controller's
   * `field.ref` so validation can focus the field.
   */
  ref?: React.Ref<HTMLInputElement>;
  onBlur?: () => void;
  onChange?: (next: PhoneInputChange) => void;
  className?: string;
}

/**
 * International phone field with a country flag picker. Emits E.164
 * (`+21622123456`) plus the picked ISO-2 country. A dial code with no
 * number after it (the field's resting "+216") emits '' — never a
 * phone made of the country code alone.
 */
export function PhoneInput({
  id,
  name,
  value,
  country,
  defaultCountry = 'TN',
  placeholder,
  disabled,
  required,
  isInvalid,
  size = 'default',
  ref,
  onBlur,
  onChange,
  className,
}: PhoneInputProps) {
  const { t, lang } = useT();
  const resolvedCountry = normalizeCountryCode(country, defaultCountry) ?? 'tn';
  const normalizedValue = normalizePhoneValue(value);
  // Dial code of the country the field last reported. The form gets ''
  // for a bare dial code, but the library must never be handed '' back:
  // it would blank the visible "+216", and with countryCodeEditable off
  // it then rejects every keystroke until a country is picked again. So
  // an empty value is fed back as the dial code alone, which keeps the
  // field showing "+216" (also after a form reset to '').
  const [lastDialCode, setLastDialCode] = React.useState('');

  const handleChange = (rawValue: string, data: CountryData | Record<string, never>) => {
    const dialCode = 'dialCode' in data ? data.dialCode : '';
    setLastDialCode(dialCode);
    const nextPhone = rawValue && rawValue !== dialCode ? `+${rawValue}` : '';
    const nextCountry =
      'countryCode' in data && data.countryCode ? data.countryCode.toUpperCase() : '';
    onChange?.({ phone: nextPhone, country: nextCountry });
  };

  return (
    <ReactPhoneInput
      // The library builds its country names once, at mount: remount
      // when the dashboard language changes.
      key={lang}
      country={resolvedCountry}
      value={normalizedValue || lastDialCode}
      onChange={handleChange}
      preferredCountries={PREFERRED_COUNTRIES}
      preserveOrder={PRESERVE_ORDER}
      masks={MASKS}
      localization={lang === 'fr' ? frCountryNames : undefined}
      enableSearch
      countryCodeEditable={false}
      disableSearchIcon
      searchPlaceholder={t('uiBits.searchCountry')}
      searchNotFound={t('patientDesk.phone.searchNotFound')}
      containerClass={cn(
        'phone-input',
        isInvalid && 'phone-input--invalid',
        // 16px text on phones: iOS Safari zooms into smaller inputs.
        '[&_.search-box]:text-base! sm:[&_.search-box]:text-[0.8125rem]!',
        className,
      )}
      inputClass={cn('phone-input__control text-base! sm:text-sm!', SIZE_CLASS[size])}
      buttonClass="phone-input__button"
      dropdownClass="phone-input__dropdown"
      searchClass="phone-input__search"
      inputProps={{
        id,
        name,
        required,
        disabled,
        placeholder,
        autoComplete: 'tel',
        onBlur,
        ref,
        'aria-invalid': isInvalid ? 'true' : 'false',
      }}
    />
  );
}
