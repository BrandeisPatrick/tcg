/**
 * What ends when a hero leaves the Active slot. A leaf module — statuses and
 * types only — so death.ts (the AI's auto-promotion), statusOps.ts and
 * actions/board.ts can all call it without importing one another.
 */
import type { CardInstance, GameState } from './types';
import { STATUSES_BY_ID } from '@/statuses';

/**
 * `hero` is leaving the Active slot: a Retreat, a promotion, a free swap-in, a
 * pull. What only means something while it stands in the lane ends with it —
 * every status that declares `clearOnLeaveActive` (Fixation). The one place
 * that rule is written, and every move off the slot calls it (moveHero,
 * promoteToActive, autoPromoteAi, swapIntoActive, pullToActive). A fallen hero
 * carries no statuses to begin with: they are wiped on death. Silent, like a
 * status that runs out: the chip just goes.
 */
export function leaveActive(_G: GameState, hero: CardInstance) {
  if (!hero.statuses.some((s) => STATUSES_BY_ID[s.id]?.clearOnLeaveActive)) return;
  hero.statuses = hero.statuses.filter((s) => !STATUSES_BY_ID[s.id]?.clearOnLeaveActive);
}
