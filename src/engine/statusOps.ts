import type { CardInstance, GameState, StatusInstance, StatusId, PlayerState } from './types';
import { DEBUFF_IDS, CC_STATUSES } from '@/statuses';
import { damageUnit } from './damage';
import { liveBoardCards, pushLog } from './util';
import { CARDS_BY_ID } from '@/cards';

/**
 * Apply a status to a target with Deadlock-style rules:
 *
 *  - Unstoppable BLOCKS any incoming CC (stun / silence / disarm / sleep).
 *  - Applying Unstoppable itself CLEANSES any CC currently on the bearer.
 *  - Re-applying a status with the same id refreshes value/duration to the
 *    larger of the two — except Bleed, which stacks up to 3.
 */
export function addStatus(G: GameState, target: CardInstance, id: StatusId, value: number, duration: number) {
  const name = CARDS_BY_ID[target.cardId]?.name ?? target.cardId;

  // Unstoppable: cleanse existing CC when applied.
  if (id === 'unstoppable') {
    const before = target.statuses.length;
    target.statuses = target.statuses.filter((s) => !CC_STATUSES.has(s.id));
    if (target.statuses.length < before) {
      pushLog(G, `${name} cleansed (Unstoppable).`);
    }
  }

  // Unstoppable: block incoming CC.
  if (CC_STATUSES.has(id) && target.statuses.some((s) => s.id === 'unstoppable')) {
    pushLog(G, `${name} resisted ${id} (Unstoppable).`);
    return;
  }

  const existing = target.statuses.find((s) => s.id === id);
  if (existing) {
    if (id === 'bleed') {
      existing.value = Math.min(3, existing.value + value);
      existing.duration = Math.max(existing.duration, duration);
    } else {
      existing.value = Math.max(existing.value, value);
      existing.duration = Math.max(existing.duration, duration);
    }
  } else {
    const inst: StatusInstance = { id, value, duration };
    target.statuses.push(inst);
  }
  pushLog(G, `${name} gained ${id}(${value}, (${duration})).`);
}

export function cleanseDebuffs(target: CardInstance) {
  target.statuses = target.statuses.filter((s) => !DEBUFF_IDS.has(s.id));
}

// Tick start-of-turn effects on a player's board.
export function tickStartOfTurn(G: GameState, ps: PlayerState) {
  for (const c of liveBoardCards(ps)) {
    const bleed = c.statuses.find((s) => s.id === 'bleed');
    if (bleed) damageUnit(G, c, bleed.value, 'pure');
    // Charged: delayed-stun. Detected BEFORE the tick so we know it's about to expire,
    // then converts into a 2-turn Stun on the same target. Powers Seven's Static Charge —
    // the long fuse (2 turns) pays off as a long stun (2 turns).
    const charged = c.statuses.find((s) => s.id === 'charged');
    if (charged && charged.duration === 1) {
      addStatus(G, c, 'stun', 1, 2);
      pushLog(G, `${CARDS_BY_ID[c.cardId]?.name ?? c.cardId} discharges: Stun for 2 turns.`);
    }
    c.statuses = c.statuses
      .map((s) => ({ ...s, duration: s.duration - 1 }))
      .filter((s) => s.duration > 0);
  }
}

export function clearTurnFlags(ps: PlayerState) {
  for (const c of liveBoardCards(ps)) {
    c.exhausted = false;
    c.skillUsedThisTurn = false;
  }
}
