'use client';

import type { UseFormRegisterReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';

/**
 * The optional, private professional-order registration number (spec §6)
 * of the three clinic forms: /account/clinic, /account/settings and the
 * onboarding clinic step. One component so the label, the privacy note
 * and the error read the same everywhere. Validation (≤ 64 characters
 * once trimmed) lives in the form schema, built with
 * lib/doctor/registration-number.ts.
 */
export function RegistrationNumberField({
  id = 'registrationNumber',
  registration,
  error,
  className,
}: {
  id?: string;
  registration: UseFormRegisterReturn;
  error?: string;
  className?: string;
}) {
  const { t } = useT();
  const describedBy = `${id}-description`;
  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-sm font-medium" htmlFor={id}>
        {t('doctorIdentity.registrationNumber.label')}{' '}
        <span className="font-normal text-muted-foreground">
          {t('doctorIdentity.registrationNumber.optional')}
        </span>
      </label>
      <Input
        id={id}
        autoComplete="off"
        spellCheck={false}
        placeholder={t('doctorIdentity.registrationNumber.placeholder')}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        {...registration}
      />
      {error ? (
        <p id={describedBy} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <p id={describedBy} className="text-xs text-muted-foreground">
          {t('doctorIdentity.registrationNumber.help')}
        </p>
      )}
    </div>
  );
}
