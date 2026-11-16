'use client';

import type { ReactNode } from 'react';
import { FieldsetCard, fieldErrorId } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';
import type { FieldErrors, ValidationField } from './supplemental-validation';

/** DOM attribute listing the validation fields a question owns. */
const FIELDS_ATTRIBUTE = 'data-question-fields';

function questionDomId(field: ValidationField): string {
  return `supplemental-question-${field.replace('.', '-')}`;
}

/** Id of a control inside the question owning `field` (for label links). */
export function fieldDomId(field: ValidationField): string {
  return `${questionDomId(field)}-input`;
}

/** Id of the error line shown under the question owning `field`. */
export function questionErrorId(field: ValidationField): string {
  return fieldErrorId(questionDomId(field));
}

/**
 * Scrolls to the first question (in page order) owning one of `fields`
 * and focuses its first control. Called from event handlers, once the
 * step holding the question has rendered.
 */
export function focusFirstInvalidQuestion(fields: readonly string[]): void {
  const questions = document.querySelectorAll<HTMLElement>(`[${FIELDS_ATTRIBUTE}]`);
  for (const question of questions) {
    const owned = question.getAttribute(FIELDS_ATTRIBUTE)?.split(' ') ?? [];
    if (!owned.some((field) => fields.includes(field))) continue;
    question.scrollIntoView({ behavior: 'smooth', block: 'center' });
    question
      .querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')
      ?.focus({ preventScroll: true });
    return;
  }
}

/**
 * A numbered clinical question: the shared fieldset card, plus the wiring
 * that lets the wizard find it when one of its fields fails. The first
 * failing field's message is shown under the card, except for `inline`
 * fields whose control shows its own message.
 */
export function ClinicalQuestion({
  fields,
  inline = [],
  errors,
  number,
  legend,
  required,
  hint,
  children,
}: {
  /** Every validation field answered in this card; the first names it. */
  fields: readonly [ValidationField, ...ValidationField[]];
  inline?: readonly ValidationField[];
  errors: FieldErrors;
  number?: number;
  legend: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useT();
  const id = questionDomId(fields[0]);
  const errorKey = fields
    .filter((field) => !inline.includes(field))
    .map((field) => errors[field])
    .find(Boolean);
  return (
    <div id={id} className="scroll-mt-24" {...{ [FIELDS_ATTRIBUTE]: fields.join(' ') }}>
      <FieldsetCard
        legend={legend}
        number={number}
        required={required}
        requiredLabel={t('supplemental.wizard.required')}
        hint={hint}
        error={errorKey ? t(errorKey) : undefined}
        errorId={fieldErrorId(id)}
      >
        {children}
      </FieldsetCard>
    </div>
  );
}
