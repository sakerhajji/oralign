import {
  PRODUCTION_ACTS,
  PRODUCTION_FORBIDDEN_KEY,
} from '../production.constants';
import type { ActTotals } from '../production.contract';

/**
 * Every key path of `value`, AS IT WOULD BE SERIALISED, whose key matches
 * `pattern` ("files[0].relativePath"). The production guard spec runs it on
 * each technician-reachable response built from a fixture where every
 * money / contact / path column is filled, and expects [].
 */
export function findForbiddenKeys(
  value: unknown,
  pattern: RegExp = PRODUCTION_FORBIDDEN_KEY,
): string[] {
  const found: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(
      node as Record<string, unknown>,
    )) {
      const childPath = path ? `${path}.${key}` : key;
      if (pattern.test(key)) found.push(childPath);
      walk(child, childPath);
    }
  };
  walk(JSON.parse(JSON.stringify(value ?? null)) as unknown, '');
  return found;
}

/** ActTotals with every act at zero (fill, then send). */
export function emptyActTotals(): ActTotals {
  const totals = {} as ActTotals;
  for (const act of PRODUCTION_ACTS) totals[act] = { entries: 0, quantity: 0 };
  return totals;
}
