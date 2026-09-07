import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import type { TargetFilter } from '@/abilities';
import { poster } from './poster';

/** A card the player has armed to play but not yet targeted/committed. */
export interface PendingPlay {
  kind: 'playCard' | 'useSkill';
  iid: string;
  title: string;
  desc: string;
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

/** Locate a hero by instance-id anywhere on either player's board. */
export function findOnBoard(G: GameState, iid: string): { owner: PlayerID; card: CardInstance } | null {
  for (const pid of ['0', '1'] as PlayerID[]) {
    const ps = G.players[pid];
    if (ps.active?.iid === iid) return { owner: pid, card: ps.active };
    for (const b of ps.bench) if (b?.iid === iid) return { owner: pid, card: b };
  }
  return null;
}

/** Does the given card satisfy an ability's target filter relative to "me"? */
export function filterAllows(filter: TargetFilter, card: CardInstance, owner: PlayerID, me: PlayerID): boolean {
  const isAlly = owner === me;
  switch (filter) {
    case 'noTarget': return false;
    case 'self': return false;
    case 'allyAny': return isAlly;
    case 'allyHero': return isAlly && CARDS_BY_ID[card.cardId]?.type === 'hero';
    case 'enemyAny': return !isAlly;
    case 'enemyHero': return !isAlly && CARDS_BY_ID[card.cardId]?.type === 'hero';
    case 'enemyActive': return !isAlly && card.zone === 'active';
    case 'anyBoard': return true;
  }
}
