import type { CardInstance, GameState, StatusInstance, StatusId, PlayerState } from './types';
import { DEBUFF_IDS, CC_STATUSES, STATUSES_BY_ID } from '@/statuses';
import { damageUnit } from './damage';
import { liveBoardCards, pushLog } from './util';
import { CARDS_BY_ID } from '@/cards';
import { fireEquipmentTriggers } from './equipmentDispatch';

// Statuses whose value is a magnitude that's worth printing in the log
// (Bleed 3, Bullet Resist 4, Shield 5, etc.). Stun/Silence/Disarm/Sleep are
// binary (value=1) and read better without the trailing "1". Vulnerable and
// Weaken carry a real magnitude (the "+N damage taken" / "-N ATK" values),
// so they're listed here too.
const MAGNITUDE_STATUSES: Set<StatusId> = new Set([
  'bleed', 'bullet_resist', 'spirit_resist', 'shield', 'weapon_power', 'spirit_power',
  'djinns_mark', 'vulnerable', 'weaken',
]);

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
    } else if (id === 'djinns_mark') {
      // Mirage's mark stacks additively (cap 4) and refreshes its full
      // 3-turn timer on every new stack — the active rebuilds the timer.
      existing.value = Math.min(4, existing.value + value);
      existing.duration = duration;
    } else {
      existing.value = Math.max(existing.value, value);
      existing.duration = Math.max(existing.duration, duration);
    }
  } else {
    const inst: StatusInstance = { id, value, duration };
    target.statuses.push(inst);
  }
  // Natural-prose log: "Haze gained Stun for 2 turns" / "Abrams gained Bleed 3 for 3 turns" /
  // "Vindicta gained Shield 5" (permanent, no duration shown).
  const title = STATUSES_BY_ID[id]?.title ?? id;
  const mag = MAGNITUDE_STATUSES.has(id) ? ` ${value}` : '';
  const dur = duration >= 99 ? '' : ` for ${duration} turn${duration === 1 ? '' : 's'}`;
  pushLog(G, `${name} gained ${title}${mag}${dur}.`);

  // Equipment reactive: Reactive Barrier shields the bearer when they suffer
  // hard CC. Fire here so any attached equipment with onBearerCCSuffered runs.
  if (CC_STATUSES.has(id)) {
    fireEquipmentTriggers(G, target, 'onBearerCCSuffered', { movingPlayer: target.ownerId });
  }
}

export function cleanseDebuffs(target: CardInstance) {
  target.statuses = target.statuses.filter((s) => !DEBUFF_IDS.has(s.id));
}

// Tick start-of-turn effects on a player's board.
export function tickStartOfTurn(G: GameState, ps: PlayerState) {
  for (const c of liveBoardCards(ps)) {
    const bleed = c.statuses.find((s) => s.id === 'bleed');
    if (bleed) damageUnit(G, c, bleed.value, 'pure');
    // Charged: delayed-stun. Detected BEFORE the tick so we know it's about
    // to expire, then converts into a 1-turn Stun on the same target. Powers
    // Seven's Static Charge — long fuse + small payoff (down from 2t stun
    // after the balance pass).
    const charged = c.statuses.find((s) => s.id === 'charged');
    if (charged && charged.duration === 1) {
      addStatus(G, c, 'stun', 1, 1);
      pushLog(G, `${CARDS_BY_ID[c.cardId]?.name ?? c.cardId} discharges: Stun for 1 turn.`);
    }
    // Djinn's Mark: detonates on natural expiry (timer reaches 1 = about to
    // tick to 0) for 2 spirit damage per stack. The mark itself is removed
    // by the standard duration-decay path immediately after.
    const mark = c.statuses.find((s) => s.id === 'djinns_mark');
    if (mark && mark.duration === 1) {
      pushLog(G, `${CARDS_BY_ID[c.cardId]?.name ?? c.cardId} — Djinn's Mark detonates.`);
      damageUnit(G, c, 2 * mark.value, 'spirit');
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
