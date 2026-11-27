import { z } from 'zod';
import { registrationNumberFits } from './registration-number';

/**
 * The zod field of the optional registration number, shared by the three
 * clinic forms. The form keeps the raw text (so the input never jumps
 * while typing); the payload is built with registrationNumberPayload().
 */
export function registrationNumberField(tooLongMessage: string) {
  return z
    .string()
    .optional()
    .refine((value) => registrationNumberFits(value), { message: tooLongMessage });
}
