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
  'djinns_mark', 'weapon_power_down', 'spirit_power_down',
  'bullet_resist_down', 'spirit_resist_down', 'healing_boost', 'healing_boost_down',
]);

// Stat-reduction debuffs store a positive magnitude that represents a reduction.
// The log prints it with a leading minus so the text matches the on-card badge
// (e.g. "−BP 2") instead of reading like a buff ("Bullet Power 2").
const NEGATIVE_MAGNITUDE_STATUSES: Set<StatusId> = new Set([
  'weapon_power_down', 'spirit_power_down', 'bullet_resist_down', 'spirit_resist_down',
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
  // Natural-prose log: buffs read "gained", debuffs read "suffered" so the sign
  // of the effect is unambiguous. Stat-reduction debuffs print a leading minus
  // on their magnitude to match the on-card badge:
  //   "Haze suffered Stun for 2 turns" / "Abrams suffered Bleed 3 for 3 turns" /
  //   "Vindicta gained Shield 5" / "Shiv suffered Bullet Power −2 for 2 turns".
  const title = STATUSES_BY_ID[id]?.title ?? id;
  const sign = NEGATIVE_MAGNITUDE_STATUSES.has(id) ? '−' : '';
  const mag = MAGNITUDE_STATUSES.has(id) ? ` ${sign}${value}` : '';
  const dur = duration >= 99 ? '' : ` for ${duration} turn${duration === 1 ? '' : 's'}`;
  const verb = DEBUFF_IDS.has(id) ? 'suffered' : 'gained';
  pushLog(G, `${name} ${verb} ${title}${mag}${dur}.`);

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
    // tick to 0) for 3 spirit damage per stack. The mark itself is removed
    // by the standard duration-decay path immediately after.
    const mark = c.statuses.find((s) => s.id === 'djinns_mark');
    if (mark && mark.duration === 1) {
      pushLog(G, `${CARDS_BY_ID[c.cardId]?.name ?? c.cardId} — Djinn's Mark detonates.`);
      damageUnit(G, c, 3 * mark.value, 'spirit');
    }
    // Reverb (Mystic Reverb): delayed echo. Detonates on natural expiry for its
    // stored value as spirit damage, then the decay path removes it below.
    const reverb = c.statuses.find((s) => s.id === 'reverb');
    if (reverb && reverb.duration === 1) {
      pushLog(G, `${CARDS_BY_ID[c.cardId]?.name ?? c.cardId} — Mystic Reverb echoes.`);
      damageUnit(G, c, reverb.value, 'spirit', 'Mystic Reverb');
    }
    // Action-denying CC (stun/silenced/disarm) is NOT decremented here — it
    // ticks at the END of the afflicted unit's turn (see tickEndOfTurnCC), so a
    // stored duration of N denies exactly N of the unit's turns. Everything else
    // (buffs, DoT, stat debuffs) decrements at start-of-turn as normal.
    // Full rationale: docs/stats-model.md.
    c.statuses = c.statuses
      .map((s) => (CC_STATUSES.has(s.id) ? s : { ...s, duration: s.duration - 1 }))
      .filter((s) => s.duration > 0);
  }
}

// Tick action-denying CC (stun/silenced/disarm) at the END of the afflicted
// unit's owner's turn — after they've spent the turn under it. Pairs with the
// CC exclusion in tickStartOfTurn so duration N = N denied turns.
export function tickEndOfTurnCC(G: GameState, ps: PlayerState) {
  for (const c of liveBoardCards(ps)) {
    // Sleep about to expire naturally → fire its wake-up burst (Rem's Naptime)
    // before it drops. Strip it first so the burst doesn't re-enter the
    // damage-side wake hook. Plain sleep (value 0) just decays below.
    const sleeping = c.statuses.find((s) => s.id === 'sleep');
    if (sleeping && sleeping.duration === 1 && sleeping.value > 0) {
      c.statuses = c.statuses.filter((s) => s !== sleeping);
      pushLog(G, `${CARDS_BY_ID[c.cardId]?.name ?? c.cardId} wakes — Naptime detonates.`);
      damageUnit(G, c, sleeping.value, 'spirit', 'Naptime');
    }
    c.statuses = c.statuses
      .map((s) => (CC_STATUSES.has(s.id) ? { ...s, duration: s.duration - 1 } : s))
      .filter((s) => s.duration > 0);
  }
}

export function clearTurnFlags(ps: PlayerState) {
  for (const c of liveBoardCards(ps)) {
    c.exhausted = false;
    c.skillUsedThisTurn = false;
    c.extraHalfAttack = false;
  }
}
