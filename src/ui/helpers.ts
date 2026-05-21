import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import type { TargetFilter } from '@/abilities';
import { palette } from './tokens';

/** A card the player has armed to play but not yet targeted/committed. */
export interface PendingPlay {
  kind: 'playCard' | 'useSkill';
  iid: string;
  title: string;
  desc: string;
  filter: TargetFilter;
}

/**
 * Categorize a log line by its leading verb / keyword so the side panel can
 * tint it semantically. Pure substring matching — fast and stable since all
 * log strings are constructed in the engine via `pushLog`.
 *
 *   attack arrow / KO / fell / overflow       → wine red
 *   healed / respawned / refresh              → success green
 *   gained <status> / cleansed / discharges   → spirit purple
 *   used skill / played / promoted / unlocked → brass
 *   Mulligan / Turn marker                    → dim grey
 *   everything else                           → default text
 */
export function logEntryColor(s: string): string {
  if (/→.* dmg|overflow|fatigue|fell\.|KO bounty|spills|patron|took \d+/i.test(s)) return palette.danger;
  if (/healed |respawned|refresh|reshuffled|woke/i.test(s)) return palette.success;
  if (/gained |cleansed|discharges|resisted/i.test(s)) return palette.spirit;
  if (/used skill:|played |promoted |retreated|swapped|unlocked|\+\d+ souls?|\+\d+ Souls?/i.test(s)) return palette.accent;
  if (/Mulligan|---/i.test(s)) return palette.textFaint;
  return palette.text;
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
