/**
 * The turn's attack: the Active swings at the rival Active for its bullet
 * damage, plus any Extra Attacks it has queued. It costs nothing, it is
 * one-way — the defender does not strike back — and the turn stays with the
 * player, who can go on playing cards, skills and a retreat before `endTurn`.
 * `attackBlocked` (legality.ts) holds every condition; these functions assume
 * it has been checked.
 */
import type { CardInstance, GameState, PlayerID } from '../types';
import { CARDS_BY_ID } from '@/cards';
import { damageUnit } from '../damage';
import { resolve } from '../death';
import { attackPower, otherPlayer } from '../query';
import { attackTurn } from '../legality';
import { fireTriggers } from '../triggers';
import { withCast } from '../castContext';

/** Make the turn's attack: mark it spent, then resolve the swings. */
export function attack(G: GameState, pid: PlayerID) {
  G.attackUsed = true;
  G.players[pid].active!.attackedThisTurn = true;
  resolveAttackPhase(G, pid);
}

// Only the Active hero attacks — bench heroes never swing. Returned as a
// one-element list so the resolver and planner can share a single loop.
export function collectAttackers(attacker: { active: CardInstance | null }): CardInstance[] {
  if (attacker.active && (attacker.active.respawnTurnsLeft ?? 0) === 0) return [attacker.active];
  return [];
}

/**
 * Resolve the attack of `attackerId`'s Active: its swing at the rival Active,
 * then any Extra Attacks it has queued. One-way — the defender does not strike
 * back, and none of its onAttack passives fire. This only swings: the `attack`
 * action checks `attackBlocked` and marks the attack as made before calling it.
 */
export function resolveAttackPhase(G: GameState, attackerId: PlayerID) {
  // First player (P0) forgoes first-strike: no attacks on Turn 1, so P1 lands
  // the first hit. NOTE: this alone does NOT close the seat gap — P0's edge is
  // cumulative (acting first every round); scripts/balance-sim.ts reports it.
  // A persistent counter-lever (e.g. a per-turn soul coin for P1) is still TODO.
  if (!attackTurn(G)) return;

  const defenderId = otherPlayer(attackerId);
  const attacker = G.players[attackerId];
  const defender = G.players[defenderId];

  const attackers = collectAttackers(attacker);
  // A corpse active (respawning) isn't a valid bullet sponge — with no living
  // Active there is nothing to swing at.
  const target = defender.active && (defender.active.respawnTurnsLeft ?? 0) === 0 ? defender.active : null;

  for (const atk of attackers) {
    if (atk.hp <= 0) continue;
    const dmg = attackPower(atk).total;
    if (dmg <= 0) continue;

    if (target) {
      const atkName = CARDS_BY_ID[atk.cardId]?.name ?? atk.cardId;

      // ---- The swing. ----
      // Capture the actual damage dealt (post-mitigation) so onAttack lifesteal
      // (Drifter) can heal for half of it. The attacker's worn equipment reacts
      // inside damageUnit (HP already off, and only when damage got through);
      // its passives follow once the damage call has returned.
      let dealt = 0;
      withCast(atk, 'attack', () => {
        dealt = damageUnit(G, target, dmg, 'attack', atkName);
      });
      // `primary: true` marks this as the hero's main swing of the turn —
      // Haze's Fixation grants its extra attack only here, so the extra
      // swings it spawns don't re-trigger it.
      fireTriggers(G, atk, 'onAttack', { only: 'passives', movingPlayer: attackerId, target, params: { primary: true, dealt } });

      // ---- Extra Attacks: additional full-power swings queued this turn
      // (Active Reload, Burst Fire, Fixation — value of the `extra_attack`
      // status). Each re-fires the attacker's onAttack procs (lifesteal,
      // bleed, Djinn's Mark, Ricochet AoE, Tesla chain — the equipment ones
      // fire automatically via the 'attack' cast-context in damageUnit).
      // Damage is re-evaluated each swing so mid-attack threshold gear
      // (Frenzy) stays honest. ----
      const extra = atk.statuses.find((s) => s.id === 'extra_attack')?.value ?? 0;
      for (let i = 0; i < extra; i++) {
        if (atk.hp <= 0 || target.hp <= 0) break;
        const bonus = attackPower(atk).total;
        if (bonus <= 0) continue;
        let exDealt = 0;
        withCast(atk, 'attack', () => {
          exDealt = damageUnit(G, target, bonus, 'attack', `${atkName} (Extra Attack)`);
        });
        fireTriggers(G, atk, 'onAttack', { only: 'passives', movingPlayer: attackerId, target, params: { dealt: exDealt } });
      }
    }
    atk.statuses = atk.statuses.filter((s) => s.id !== 'extra_attack');
    // No living Active to sponge → the attack fizzles. The patron is only
    // damaged when a hero dies (flat KO_PATRON_DAMAGE, in killInPlace), never
    // by the swings themselves.
  }

  resolve(G);
}
