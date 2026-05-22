import { createContext, useContext } from 'react';

export type CombatProgress = {
  /** Number of beats in the active combat phase (i.e. plan.steps.length). */
  total: number;
  /** Zero-based index of the beat currently in flight. */
  currentBeat: number;
  /** True when the local player is the attacker — drives brass vs. wine hue. */
  attackerIsMe: boolean;
} | null;

/**
 * Ambient combat-progress signal — non-null only while
 * `CombatChoreographer` is running. The Turn Compass reads this to swap
 * its idle conic-sweep ring for a segmented progress ring during combat,
 * so the compass remains the single mid-board focal token instead of
 * adding a sibling pip strip.
 */
export const CombatProgressContext = createContext<CombatProgress>(null);

export function useCombatProgress(): CombatProgress {
  return useContext(CombatProgressContext);
}
