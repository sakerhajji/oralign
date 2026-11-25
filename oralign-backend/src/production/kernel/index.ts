/**
 * The production shared kernel: pure rules and Prisma select fragments
 * that core (src/production), the notice dispatcher (notifications/) and
 * the admin reports (reports/) all need. FOUNDATION-OWNED and frozen
 * (production-build/CONTRACT.md); import from here, never re-implement.
 */
export * from './step-ranges';
export * from './planned-totals';
export * from './progress';
export * from './queue-rule';
export * from './leak-guard';
export * from './download-name';
