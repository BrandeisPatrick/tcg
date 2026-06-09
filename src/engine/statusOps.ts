import type { CardInstance, GameState, StatusInstance, StatusId, PlayerState } from './types';
import { DEBUFF_IDS, CC_STATUSES, STATUSES_BY_ID } from '@/statuses';
import { damageUnit, healUnit, reapDead, returnRemToBench } from './damage';
import { liveBoardCards, pushLog, otherPlayer, effectiveSpirit } from './util';
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
  'extra_attack',
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

  // Superior Duration: the bearer's own buffs last 1 turn longer.
  const sdDef = STATUSES_BY_ID[id];
  if (sdDef && sdDef.hvalue > 0 && duration < 99 && target.attached?.some((eq) => eq.cardId === 'superior_duration')) {
    duration += 1;
  }

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
    // Siphon Bullets: temporary max-HP transfer reverts when the marker expires.
    const drain = c.statuses.find((s) => s.id === 'siphon_drain');
    if (drain && drain.duration === 1) { c.hpMax += drain.value; }
    const gain = c.statuses.find((s) => s.id === 'siphon_gain');
    if (gain && gain.duration === 1) { c.hpMax -= gain.value; if (c.hp > c.hpMax) c.hp = c.hpMax; }
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

/**
 * Tick Rem's "Lil Helpers" merges at her owner's turn start: count down each
 * attached Rem and, when the timer expires, detach her back to the bench (which
 * also reverts the max-HP she granted the bearer).
 */
export function tickRemMerges(G: GameState, ps: PlayerState) {
  for (const bearer of liveBoardCards(ps)) {
    const rem = bearer.attached?.find((a) => a.cardId === 'hero_rem' && a.remMergeTurnsLeft != null);
    if (!rem) continue;
    rem.remMergeTurnsLeft = (rem.remMergeTurnsLeft ?? 0) - 1;
    if (rem.remMergeTurnsLeft <= 0) returnRemToBench(G, ps, bearer, rem);
  }
}

export function clearTurnFlags(ps: PlayerState) {
  for (const c of liveBoardCards(ps)) {
    c.exhausted = false;
    c.skillUsedThisTurn = false;
    // Any unused Extra Attack stack expires at end of turn (it's a this-turn
    // resource); resolveAttackPhase normally consumes it first.
    c.statuses = c.statuses.filter((s) => s.id !== 'extra_attack');
  }
}

/**
 * Channeled-ultimate pulse. Heroes carrying a `casting` (heavy: Dynamo, Seven)
 * or `casting_light` (mobile: Warden) status deal AoE spirit damage to all
 * enemies at the END of each of their turns, over the channel's duration —
 * a board-wipe win condition. The status `value` is the per-tick base damage;
 * effective Spirit is added live each pulse. Called from turn.onEnd BEFORE the
 * attack phase, so Warden's chip softens enemies before he swings.
 *
 *  - Interrupt: if the channeler is Stunned / Slept this turn, the pulse is
 *    skipped (canon: channels are interruptible) — the channel still counts
 *    down at the next start of turn.
 *  - Warden's light variant heals him for the total damage dealt (Last Stand
 *    drain) and does NOT lock him out of attacking / skills.
 *  - Seven's channel escalates: its per-tick value climbs by 1 each pulse
 *    (Storm Cloud ramps), so a duration-3 cast deals 2 → 3 → 4 (+Spirit).
 */
export function tickCastingPulses(G: GameState, ps: PlayerState) {
  for (const c of liveBoardCards(ps)) {
    const heavy = c.statuses.find((s) => s.id === 'casting');
    const channel = heavy ?? c.statuses.find((s) => s.id === 'casting_light');
    if (!channel) continue;
    const name = CARDS_BY_ID[c.cardId]?.name ?? c.cardId;

    // Interruptible: hard CC that pins the caster suppresses this turn's pulse.
    if (c.statuses.some((s) => s.id === 'stun' || s.id === 'sleep')) {
      pushLog(G, `${name}'s channel is interrupted this turn.`);
      continue;
    }

    const perTick = channel.value + effectiveSpirit(c);
    const enemyId = otherPlayer(c.ownerId);
    let totalDealt = 0;
    for (const e of liveBoardCards(G.players[enemyId])) {
      totalDealt += damageUnit(G, e, perTick, 'spirit', name);
    }
    reapDead(G, G.players[enemyId]);
    pushLog(G, `${name} channels — ${perTick} spirit to all enemies.`);

    // Warden (light): drain the total back as healing.
    if (!heavy && totalDealt > 0) {
      const heal = Math.ceil(totalDealt / 2);
      healUnit(G, c, heal);
      pushLog(G, `Last Stand: ${name} drained ${heal} HP.`);
    }
    // Seven: escalate the next pulse.
    if (heavy && c.cardId === 'hero_seven') channel.value += 1;
  }
}
