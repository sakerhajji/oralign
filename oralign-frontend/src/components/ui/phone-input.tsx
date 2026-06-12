'use client';

import React from 'react';
import ReactPhoneInput from 'react-phone-input-2';
import type { CountryData } from 'react-phone-input-2';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

const ISO2_REGEX = /^[A-Za-z]{2}$/;

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
  onBlur?: () => void;
  onChange?: (next: PhoneInputChange) => void;
  className?: string;
}

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
  onBlur,
  onChange,
  className,
}: PhoneInputProps) {
  const { t } = useT();
  const resolvedCountry = normalizeCountryCode(country, defaultCountry) ?? 'tn';
  const normalizedValue = normalizePhoneValue(value);

  const handleChange = (rawValue: string, data: CountryData | Record<string, never>) => {
    const nextPhone = rawValue ? `+${rawValue}` : '';
    const nextCountry =
      'countryCode' in data && data.countryCode ? data.countryCode.toUpperCase() : '';
    onChange?.({ phone: nextPhone, country: nextCountry });
  };

  return (
    <ReactPhoneInput
      country={resolvedCountry}
      value={normalizedValue}
      onChange={handleChange}
      enableSearch
      countryCodeEditable={false}
      disableSearchIcon
      searchPlaceholder={t('uiBits.searchCountry')}
      containerClass={cn('phone-input', isInvalid && 'phone-input--invalid', className)}
      inputClass="phone-input__control"
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
        'aria-invalid': isInvalid ? 'true' : 'false',
      }}
    />
  );
}
