'use client';

import { memo, useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * One labelled input of the billing settings: label (with the required
 * star), the input, then its error or its helper line, wired through
 * aria-describedby / aria-invalid. Shared by the settings form and its
 * rule cards (retenue, inactivity).
 */
export interface SettingsFieldProps<N extends string> {
  name: N;
  label: string;
  value: string;
  onValueChange: (name: N, value: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'url';
  inputMode?: 'decimal' | 'numeric';
  autoComplete?: string;
  required?: boolean;
  wide?: boolean;
  helper?: string;
  error?: string;
  disabled?: boolean;
  /** Upper-case what is typed (currency, quote prefix). */
  uppercase?: boolean;
  /** Figures right-aligned in tabular digits (amounts, rates). */
  numeric?: boolean;
  className?: string;
}

function SettingsFieldImpl<N extends string>({
  name,
  label,
  value,
  onValueChange,
  placeholder,
  type = 'text',
  inputMode,
  autoComplete = 'off',
  required,
  wide,
  helper,
  error,
  disabled,
  uppercase,
  numeric,
  className,
}: SettingsFieldProps<N>) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? helper;
  return (
    <div className={cn(wide && 'sm:col-span-2', className)}>
      <Label htmlFor={id} className="mb-1.5 inline-flex items-center gap-1">
        {label}
        {required && (
          <span aria-hidden className="text-red-500">
            *
          </span>
        )}
      </Label>
      <Input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) =>
          onValueChange(name, uppercase ? e.target.value.toUpperCase() : e.target.value)
        }
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn('pointer-coarse:h-12', numeric && 'tabular-nums')}
      />
      {message && (
        <p
          id={messageId}
          className={cn('mt-1 text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/** Memoised: with stable setters, typing re-renders one field. */
export const SettingsField = memo(SettingsFieldImpl) as typeof SettingsFieldImpl;
