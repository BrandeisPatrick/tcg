import { createContext, useContext } from 'react';
import type { DamageEvent } from '@/engine/types';

/** Resolver a HeroSlot calls with its own iid to get the active "got hit" flash
 *  (or null). Supplied by Board: covers both the impact-beat sequencer
 *  (skill/spell/ult/bleed) and the in-flight basic-attack choreographer beat. */
export type DamageFxResolver = (iid: string) => DamageEvent | null;

export const DamageFxContext = createContext<DamageFxResolver | null>(null);

export function useDamageFx(iid: string): DamageEvent | null {
  const resolver = useContext(DamageFxContext);
  return resolver ? resolver(iid) : null;
}
