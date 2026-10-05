import type { TargetFilter } from '@/abilities';
import { poster } from './poster';

/** A card the player has armed to play but not yet targeted/committed. */
export interface PendingPlay {
  kind: 'playCard' | 'useSkill';
  iid: string;
  title: string;
  desc: string;
  /** What the banner says it may be aimed at (its label, and where it docks).
   *  Which heroes actually glow is the engine's answer: board/targeting.ts. */
  filter: TargetFilter;
}

/**
 * Spirit-damage plum for the dark log — lighter than poster.stat.spirit
 * (which is pitched for paper) so it reads on poster.panel / poster.ground.
 * Shared by logEntryColor and LogLine's spirit glyph so line and glyph agree.
 */
export const LOG_SPIRIT_PLUM = '#b48cc4';

/**
 * Categorize a log line by its leading verb / keyword so the side panel and
 * the full log can tint it semantically. Pure substring matching — fast and
 * stable since all log strings are constructed in the engine via `pushLog`.
 *
 * Every colour is a dark-chrome ink: the log only ever sits on poster.panel
 * or poster.ground, never on paper.
 *
 *   attack arrow / KO / fell / overflow       → rival red
 *   healed / respawned / refresh              → green
 *   gained <status> / cleansed / discharges   → spirit plum
 *   used skill / played / promoted / unlocked → your gold
 *   Mulligan / Turn marker                    → dim cream
 *   everything else                           → cream
 */
export function logEntryColor(s: string): string {
  if (/→.* dmg|overflow|fatigue|fell\.|KO bounty|spills|patron|took \d+/i.test(s)) return poster.rival;
  if (/healed |respawned|refresh|reshuffled|woke/i.test(s)) return poster.green;
  if (/gained |cleansed|discharges|resisted/i.test(s)) return LOG_SPIRIT_PLUM;
  if (/used skill:|played |promoted |retreated|swapped|unlocked|\+\d+ souls?|\+\d+ Souls?/i.test(s)) return poster.you;
  if (/Mulligan|---/i.test(s)) return poster.creamDim;
  return poster.cream;
}
