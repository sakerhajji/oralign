/**
 * Public type surface of the app — ONE import path: `@/lib/types`.
 *
 * The domain files below used to be a single 2,000-line index.ts; they
 * are split by bounded context so a change to, say, billing types is a
 * change in billing.ts. Nothing outside this folder imports a sub-path.
 */
export * from './enums';
export * from './treatment-plan';
export * from './quotation';
export * from './billing';
export * from './entities';
export * from './auth';
export * from './user';
export * from './dentist-profile';
export * from './working-hours';
export * from './patient';
export * from './api';
export * from './notifications';
export * from './invoice';
export * from './query-params';
export * from './support';
export * from './dashboard';
export * from './slider-media';
export * from './community';
export * from './reports';
export * from './blog';
