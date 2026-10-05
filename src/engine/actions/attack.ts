/**
 * The turn's attack: the Active swings at the rival Active for its bullet
 * damage, then once more for each Extra Attack it has queued. It costs
 * nothing, it is one-way — the defender does not strike back — and the turn
 * stays with the player, who can go on playing cards, skills and a retreat
 * before `endTurn`. `attackBlocked` (legality.ts) holds every condition, so
 * this assumes a living Active, a living rival Active and a swing that deals
 * something.
 *
 * Every swing is reported as a `swing` event BEFORE its damage, so the stream
 * reads "this swing, then what it did" — and the forecast (forecast.ts) is
 * just this action run on a copy and read back.
 */
import type { CardInstance, GameState, PlayerID } from '../types';
import { CARDS_BY_ID } from '@/cards';
import { damageUnit } from '../damage';
import { resolve } from '../death';
import { attackPower, otherPlayer, type AttackPower } from '../query';
import { fireTriggers } from '../triggers';
import { withCast } from '../castContext';
import { pushFx } from '../fx';

/** Make the turn's attack: mark it spent, swing, then each Extra Attack. */
export function attack(G: GameState, pid: PlayerID) {
  G.attackUsed = true;
  const atk = G.players[pid].active!;
  atk.attackedThisTurn = true;
  const target = G.players[otherPlayer(pid)].active!;

  // ---- The primary swing. ----
  swing(G, atk, target, 0, attackPower(atk));

  // ---- Extra Attacks: additional full-power swings queued this turn (Active
  // Reload, Burst Fire, Fixation — the value of the `extra_attack` status,
  // read after the primary swing because Fixation grants one there). Each
  // re-fires the attacker's onAttack procs (lifesteal, bleed, Djinn's Mark,
  // Ricochet AoE, Tesla chain). Power is re-read every swing so mid-attack
  // threshold gear (Frenzy) stays honest. ----
  const extras = atk.statuses.find((s) => s.id === 'extra_attack')?.value ?? 0;
  let index = 1;
  for (let i = 0; i < extras; i++) {
    if (atk.hp <= 0 || target.hp <= 0) break;
    const power = attackPower(atk);
    if (power.total <= 0) continue;
    swing(G, atk, target, index++, power);
  }
  atk.statuses = atk.statuses.filter((s) => s.id !== 'extra_attack');
  // The patron is only damaged when a hero dies (flat KO_PATRON_DAMAGE, in
  // killInPlace), never by the swings themselves.
  resolve(G);
}

/** One swing at `power`: the event, the damage, then the follow-through. The
 *  attacker's worn equipment reacts inside damageUnit (HP already off, and only
 *  when damage got through); its passives follow once the damage call has
 *  returned, with how much got through (Drifter's Bloodscent heals half of it). */
function swing(G: GameState, atk: CardInstance, target: CardInstance, index: number, power: AttackPower) {
  const extra = index > 0;
  pushFx(G, {
    kind: 'swing', iid: atk.iid, targetIid: target.iid, index, raw: power.total,
    label: extra ? 'Extra Attack' : power.parts.find((p) => p.bonus)?.label,
    targetHp: target.hp,
  });
  const atkName = CARDS_BY_ID[atk.cardId]?.name ?? atk.cardId;
  let dealt = 0;
  withCast(atk, 'attack', () => {
    dealt = damageUnit(G, target, power.total, 'attack', extra ? `${atkName} (Extra Attack)` : atkName);
  });
  // `primary: true` marks the hero's main swing of the turn — Haze's Fixation
  // grants its extra attack only here, so the extra swings it spawns don't
  // re-trigger it.
  fireTriggers(G, atk, 'onAttack', { only: 'passives', target, params: extra ? { dealt } : { primary: true, dealt } });
}
