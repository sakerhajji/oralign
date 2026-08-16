import { ConflictException } from '../exceptions/app.exception';

/**
 * Error code every blocked permanent deletion carries. The frontend keys
 * on it (see lib/api/error.ts) to render the explanation prominently
 * instead of a generic "conflict" toast.
 */
export const DELETION_BLOCKED = 'DELETION_BLOCKED';

/** One protected dependency family, e.g. `{ label: 'orders', count: 3 }`. */
export interface Dependency {
  label: string;
  count: number;
}

/**
 * Permanent deletion refused because historical records depend on the
 * row. Always a 409 with a human-readable list of what blocks it —
 * "3 orders, 1 quotation" — so an admin knows exactly why and never
 * works around it by deleting the dependencies first.
 */
export class DeletionBlockedException extends ConflictException {
  constructor(
    public readonly subject: string,
    public readonly dependencies: Dependency[],
  ) {
    super(
      `${subject} cannot be permanently deleted because historical records depend on it: ${describe(dependencies)}. ` +
        'Archive it instead (soft delete) — history is preserved.',
      DELETION_BLOCKED,
    );
    this.name = 'DeletionBlockedException';
  }
}

/**
 * Throw when any dependency count is > 0. Call it with the counts you
 * fetched in ONE query (`_count` select) right before a hard delete:
 *
 *   assertNoDependents('This order', [
 *     { label: 'quotations', count: order._count.quotations },
 *     { label: 'payments', count: order._count.payments },
 *   ]);
 *
 * The DB constraints (onDelete: Restrict) are the last line of defence;
 * this is the first, and the one that produces a useful message.
 */
export function assertNoDependents(
  subject: string,
  dependencies: Dependency[],
): void {
  const blocking = dependencies.filter((d) => d.count > 0);
  if (blocking.length > 0) {
    throw new DeletionBlockedException(subject, blocking);
  }
}

function describe(dependencies: Dependency[]): string {
  return dependencies.map((d) => `${d.count} ${d.label}`).join(', ');
}
