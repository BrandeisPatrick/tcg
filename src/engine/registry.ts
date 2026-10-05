/**
 * Where the engine finds card behaviour.
 *
 * The rules in `src/engine` need to run what a card does (a skill's effect, an
 * equipment proc), but that code lives in `src/abilities`, which itself calls
 * back into the engine (`damageUnit`, `addStatus`…). So the engine never
 * imports the abilities: `src/abilities/index.ts` registers them here when it
 * loads, and the engine looks them up by id. `engine.ts` and `legality.ts`
 * import the abilities module for that side effect, so anything that goes
 * through `perform`, the legality questions, the forecast or the game has them.
 * Code that calls the lower layers directly (`damageUnit`, `fireTriggers`…)
 * must import `@/abilities` itself.
 */
import type { AbilityDef } from '@/abilities';

const registered = new Map<string, AbilityDef>();

export function registerAbilities(defs: readonly AbilityDef[]): void {
  for (const def of defs) registered.set(def.id, def);
}

export function getAbility(id: string): AbilityDef | undefined {
  return registered.get(id);
}
