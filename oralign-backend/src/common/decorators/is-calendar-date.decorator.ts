import {
  buildMessage,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';
import { isCalendarDate } from '../time/business-day';

/**
 * A day written 'YYYY-MM-DD' that exists. 2026-02-30 and 2026-11-6 are
 * refused (400), never rolled over or guessed.
 */
export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isCalendarDate',
      validator: {
        validate: (value: unknown) => isCalendarDate(value),
        defaultMessage: buildMessage(
          (each) =>
            `${each}$property must be an existing date written YYYY-MM-DD`,
          options,
        ),
      },
    },
    options,
  );
}
