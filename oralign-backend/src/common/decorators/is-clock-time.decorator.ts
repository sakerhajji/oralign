import {
  buildMessage,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';
import { isClockTime } from '../time/business-day';

/**
 * A wall-clock time written 'HH:mm', 24 h (00:00-23:59). '7:05', '24:00'
 * and '07:05:00' are refused (400). Pairs with IsCalendarDate for the
 * "date + heure" fields that businessInstant() turns into a UTC instant.
 */
export function IsClockTime(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isClockTime',
      validator: {
        validate: (value: unknown) => isClockTime(value),
        defaultMessage: buildMessage(
          (each) =>
            `${each}$property must be a time written HH:mm (00:00-23:59)`,
          options,
        ),
      },
    },
    options,
  );
}
