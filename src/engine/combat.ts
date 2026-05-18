import type { GameState, PlayerID, CardInstance } from './types';
import { CARDS_BY_ID } from '@/cards';
import { damageUnit, damagePlayer, reapDead } from './damage';
import { otherPlayer, effectiveAtk, pushLog } from './util';
import { getAbility } from '@/abilities';

// ---------- Attack plan (pure, for UI prediction + animation) ----------

/** One projected attack event. */
export interface AttackStep {
  attackerIid: string;
  attackerName: string;
  /** iid of the defending hero unit, or null if this damage hits face. */
  targetIid: string | null;
  targetName: string | null;
  /** Final damage that will be dealt after mitigation (shield/armor), at the moment of this step. */
  finalDamage: number;
  /** Raw damage before mitigation, for tooltips. */
  rawDamage: number;
  /** Predicted HP on the target after this step (clamped at 0). null if face. */
  predictedHpAfter: number | null;
  /** True if this step will KO the target. */
  predictedKO: boolean;
  /** Short label for any bonus that contributed (e.g., "Haze passive vs Stun: +2"). */
  bonusLabel?: string;
}

export interface AttackPlan {
  attackerId: PlayerID;
  defenderId: PlayerID;
  steps: AttackStep[];
  /** Sum of damage hitting the defender's Active hero. */
  damageToActive: number;
  /** Sum of damage hitting the defender's face (only if Active is null). */
  damageToFace: number;
  /** iid of the defender's Active if it will be KO'd during this phase. */
  defenderActiveKO: string | null;
}

/**
 * Build a pure, predictive plan for the upcoming attack phase.
 *
 * The plan mirrors what `resolveAttackPhase` will do but mutates nothing.
 * The UI can read this to (a) draw incoming-damage badges before end-of-turn
 * and (b) drive an animated choreographer that walks the steps in order.
 *
 * Predicted HP factors in current shield/armor + Haze's "+2 vs Stunned" passive.
 * Reaping order matches the engine: targets are not re-evaluated mid-phase
 * (defender.active doesn't shift until after all attackers have swung).
 */
export function planAttackPhase(G: GameState, attackerId: PlayerID): AttackPlan {
  const defenderId = otherPlayer(attackerId);
  const attacker = G.players[attackerId];
  const defender = G.players[defenderId];

  const attackers = collectAttackers(attacker);
  // A corpse active (respawning) isn't a valid bullet sponge — attacks pass to face.
  const target = defender.active && (defender.active.respawnTurnsLeft ?? 0) === 0 ? defender.active : null;

  // Running simulation state (without mutating G).
  let simHp = target?.hp ?? 0;
  let simShield = target?.statuses.find((s) => s.id === 'shield')?.value ?? 0;
  const bulletResist = target?.statuses.find((s) => s.id === 'bullet_resist')?.value ?? 0;
  const spiritResist = target?.statuses.find((s) => s.id === 'spirit_resist')?.value ?? 0;
  const hasInvinc = !!target?.statuses.some((s) => s.id === 'invincibility');
  const vulnerable = !!target?.statuses.some((s) => s.id === 'vulnerable');
  const targetIsVindicta = target?.cardId === 'hero_vindicta';

  const steps: AttackStep[] = [];
  let damageToActive = 0;
  let damageToFace = 0;
  let defenderActiveKO: string | null = null;

  for (const atk of attackers) {
    if (atk.hp <= 0) continue;
    const { dmg, bonusLabel } = effectiveAttackDamage(atk, target);
    if (dmg <= 0) continue;

    if (target) {
      // Mirror damageUnit's mitigation pipeline so the predicted HP matches reality.
      let final = dmg;
      const wraithSplit = atk.cardId === 'hero_wraith';
      if (vulnerable) final += 2;
      if (hasInvinc) final = 0;
      if (final > 0) {
        if (wraithSplit) {
          // Split half bullet / half spirit. Vindicta's -1 only applies to the bullet half.
          const half1 = Math.max(0, Math.ceil(final / 2) - (targetIsVindicta ? 1 : 0));
          const half2 = Math.floor(final / 2);
          const bulletHalf = Math.max(0, half1 - bulletResist);
          const spiritHalf = Math.max(0, half2 - spiritResist);
          final = bulletHalf + spiritHalf;
        } else {
          // Bullet Resist reduces attack-type damage; Vindicta further reduces by 1.
          if (targetIsVindicta) final = Math.max(0, final - 1);
          final = Math.max(0, final - bulletResist);
        }
      }
      // Shield absorbs next.
      if (final > 0 && simShield > 0) {
        const absorb = Math.min(simShield, final);
        simShield -= absorb;
        final -= absorb;
      }

      const predictedHp = simHp - final;
      const ko = predictedHp <= 0;
      // Overflow: anything past 0 HP spills to the defender's patron.
      const overflow = ko ? -predictedHp : 0;

      steps.push({
        attackerIid: atk.iid,
        attackerName: CARDS_BY_ID[atk.cardId]?.name ?? atk.cardId,
        targetIid: target.iid,
        targetName: CARDS_BY_ID[target.cardId]?.name ?? target.cardId,
        finalDamage: final,
        rawDamage: dmg,
        predictedHpAfter: Math.max(0, predictedHp),
        predictedKO: ko,
        bonusLabel,
      });
      simHp = Math.max(0, predictedHp);
      damageToActive += final;
      if (overflow > 0) damageToFace += overflow;
      if (ko) defenderActiveKO = target.iid;
    } else {
      // No defender Active → face damage.
      steps.push({
        attackerIid: atk.iid,
        attackerName: CARDS_BY_ID[atk.cardId]?.name ?? atk.cardId,
        targetIid: null,
        targetName: null,
        finalDamage: dmg,
        rawDamage: dmg,
        predictedHpAfter: null,
        predictedKO: false,
        bonusLabel,
      });
      damageToFace += dmg;
    }
  }

  return { attackerId, defenderId, steps, damageToActive, damageToFace, defenderActiveKO };
}

// ---------- Engine resolver (mutating) ----------

/**
 * Run the attack phase for the player whose turn just ended.
 * The behavior matches `planAttackPhase` step for step.
 */
export function resolveAttackPhase(G: GameState, attackerId: PlayerID) {
  const defenderId = otherPlayer(attackerId);
  const attacker = G.players[attackerId];
  const defender = G.players[defenderId];

  const attackers = collectAttackers(attacker);
  // A corpse active (respawning) isn't a valid bullet sponge — attacks pass to face.
  const target = defender.active && (defender.active.respawnTurnsLeft ?? 0) === 0 ? defender.active : null;

  for (const atk of attackers) {
    if (atk.hp <= 0) continue;
    const { dmg } = effectiveAttackDamage(atk, target);
    if (dmg <= 0) continue;

    if (target) {
      const atkName = CARDS_BY_ID[atk.cardId]?.name ?? atk.cardId;
      // Wraith passive: split half bullet / half spirit. Pierces single-type resists.
      if (atk.cardId === 'hero_wraith') {
        const half1 = Math.ceil(dmg / 2);
        const half2 = Math.floor(dmg / 2);
        if (half1 > 0) damageUnit(G, target, half1, 'attack', atkName);
        if (half2 > 0) damageUnit(G, target, half2, 'spirit', atkName);
      } else {
        damageUnit(G, target, dmg, 'attack', atkName);
      }
      // Trigger any onAttack ability on the attacker's hero.
      const data = CARDS_BY_ID[atk.cardId];
      if (data?.type === 'hero') {
        for (const passId of data.passives ?? []) {
          const a = getAbility(passId);
          if (a?.trigger === 'onAttack') a.run(G, { movingPlayer: attackerId }, { source: atk, target });
        }
      }
    } else {
      damagePlayer(G, defenderId, dmg);
    }
  }

  reapDead(G, defender);
  reapDead(G, attacker);
  // (No trailing "phase resolved" log — the per-hit entries above + the turn
  // group header in the UI already convey what happened.)
}

// ---------- Helpers (shared between planner and resolver) ----------

function collectAttackers(attacker: { active: CardInstance | null; bench: (CardInstance | null)[] }): CardInstance[] {
  const out: CardInstance[] = [];
  if (attacker.active && (attacker.active.respawnTurnsLeft ?? 0) === 0) out.push(attacker.active);
  for (const b of attacker.bench) {
    if (!b || (b.respawnTurnsLeft ?? 0) > 0) continue;
    // Either the bench hero has the long_range status applied, or it's an
    // intrinsic flag on the hero data (Haze, Vindicta).
    if (b.statuses.some((s) => s.id === 'long_range')) { out.push(b); continue; }
    const data = CARDS_BY_ID[b.cardId];
    if (data?.type === 'hero' && data.flags?.longRange) out.push(b);
  }
  return out;
}

function effectiveAttackDamage(atk: CardInstance, target: CardInstance | null): { dmg: number; bonusLabel?: string } {
  let dmg = effectiveAtk(atk);
  let bonusLabel: string | undefined;
  // Haze passive: +2 vs Stunned target.
  const data = CARDS_BY_ID[atk.cardId];
  if (data?.type === 'hero' && data.id === 'hero_haze' && target?.statuses.some((s) => s.id === 'stun')) {
    dmg += 2;
    bonusLabel = 'Haze: +2 vs Stunned';
  }
  // Drifter passive: +3 vs targets at or below 4 HP (Bloodscent).
  if (data?.type === 'hero' && data.id === 'hero_drifter' && target && target.hp <= 4) {
    dmg += 3;
    bonusLabel = 'Drifter: Bloodscent +3';
  }
  return { dmg, bonusLabel };
}
