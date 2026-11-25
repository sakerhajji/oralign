import type { ProductionArch, ProductionArchChoice } from '@/lib/types/production';

/** Upper first: the order of the API's rows and of every per-arch display. */
export const ARCHES: readonly ProductionArch[] = ['upper', 'lower'];

export function archesOf(choice: ProductionArchChoice): ProductionArch[] {
  return choice === 'both' ? ['upper', 'lower'] : [choice];
}

/** The choice that covers exactly these arches ("both" for two). */
export function choiceOf(arches: readonly ProductionArch[]): ProductionArchChoice {
  if (arches.length === 1) return arches[0];
  return 'both';
}
