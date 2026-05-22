import type { GameState, PlayerID, CardInstance } from './types';
import { CARDS_BY_ID } from '@/cards';
import { damageUnit, damagePlayer, reapDead } from './damage';
import { otherPlayer, effectiveAtk, pushLog } from './util';
import { getAbility } from '@/abilities';
import { withCast } from './castContext';

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
  /** Amount the target's Shield absorbed at this step. > 0 means the attack
   *  landed but Shield mitigated some/all of it — choreographer renders a
   *  green deflect flash so the impact reads even when HP doesn't move. */
  shieldAbsorbed: number;
  /** Short label for any bonus that contributed (e.g., "Haze passive vs Stun: +2"). */
  bonusLabel?: string;
  /** Retaliation damage dealt by the defender BACK to the attacker (mutual-damage rule).
   *  Only populated when `atk` is the rival's active hero — bench attackers (Mystic
   *  Expansion bearers, etc.) don't trigger retaliation. 0 means no retaliation. */
  retaliationDamage: number;
  /** Predicted HP on the attacker after retaliation lands. null if no retaliation. */
  attackerHpAfter: number | null;
  /** True if retaliation will KO the attacker. */
  attackerKO: boolean;
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

  // Running simulation state for the DEFENDER (without mutating G).
  let simHp = target?.hp ?? 0;
  let simShield = target?.statuses.find((s) => s.id === 'shield')?.value ?? 0;

  const steps: AttackStep[] = [];
  let damageToActive = 0;
  let damageToFace = 0;
  let defenderActiveKO: string | null = null;

  for (const atk of attackers) {
    if (atk.hp <= 0) continue;
    const { dmg, bonusLabel } = effectiveAttackDamage(atk, target);
    if (dmg <= 0) continue;

    if (target) {
      const wraithSplit = atk.cardId === 'hero_wraith';
      const shieldBefore = simShield;
      const m = simulateAttackMitigation(dmg, target, simShield, wraithSplit);
      simShield = m.shieldRemaining;
      const shieldAbsorbed = Math.max(0, shieldBefore - m.shieldRemaining);
      const final = m.final;

      const predictedHp = simHp - final;
      const ko = predictedHp <= 0;
      // Overflow: anything past 0 HP spills to the defender's patron.
      const overflow = ko ? -predictedHp : 0;

      // Retaliation: only the defender's Active retaliates, and only against
      // the rival's active attacker. Bench attackers (Mystic Expansion) swing
      // freely with no return damage.
      const isActiveAttacker = atk === attacker.active;
      let retaliationDamage = 0;
      let attackerHpAfter: number | null = null;
      let attackerKO = false;
      if (isActiveAttacker) {
        const { dmg: rawRetal } = effectiveAttackDamage(target, atk);
        if (rawRetal > 0) {
          const rm = simulateAttackMitigation(
            rawRetal,
            atk,
            atk.statuses.find((s) => s.id === 'shield')?.value ?? 0,
            target.cardId === 'hero_wraith',
          );
          retaliationDamage = rm.final;
          const atkHp = atk.hp - retaliationDamage;
          attackerHpAfter = Math.max(0, atkHp);
          attackerKO = atkHp <= 0;
        } else {
          attackerHpAfter = atk.hp;
        }
      }

      steps.push({
        attackerIid: atk.iid,
        attackerName: CARDS_BY_ID[atk.cardId]?.name ?? atk.cardId,
        targetIid: target.iid,
        targetName: CARDS_BY_ID[target.cardId]?.name ?? target.cardId,
        finalDamage: final,
        rawDamage: dmg,
        predictedHpAfter: Math.max(0, predictedHp),
        predictedKO: ko,
        shieldAbsorbed,
        bonusLabel,
        retaliationDamage,
        attackerHpAfter,
        attackerKO,
      });
      simHp = Math.max(0, predictedHp);
      damageToActive += final;
      if (overflow > 0) damageToFace += overflow;
      if (ko) defenderActiveKO = target.iid;
    } else {
      // No defender Active → face damage. Face attacks don't retaliate.
      steps.push({
        attackerIid: atk.iid,
        attackerName: CARDS_BY_ID[atk.cardId]?.name ?? atk.cardId,
        targetIid: null,
        targetName: null,
        finalDamage: dmg,
        rawDamage: dmg,
        predictedHpAfter: null,
        predictedKO: false,
        shieldAbsorbed: 0,
        bonusLabel,
        retaliationDamage: 0,
        attackerHpAfter: null,
        attackerKO: false,
      });
      damageToFace += dmg;
    }
  }

  return { attackerId, defenderId, steps, damageToActive, damageToFace, defenderActiveKO };
}

/** Pure-function mitigation simulator shared between the planner's attack and
 *  retaliation paths. Mirrors damageUnit's pipeline (Vulnerable, Unstoppable,
 *  Vindicta -1 bullet, Bullet Resist, Wraith half-split, Shield). */
function simulateAttackMitigation(
  rawDmg: number,
  target: CardInstance,
  shieldValue: number,
  wraithSplit: boolean,
): { final: number; shieldRemaining: number } {
  const bulletResist = target.statuses.find((s) => s.id === 'bullet_resist')?.value ?? 0;
  const spiritResist = target.statuses.find((s) => s.id === 'spirit_resist')?.value ?? 0;
  const hasInvinc = target.statuses.some((s) => s.id === 'unstoppable');
  const vulnerable = target.statuses.some((s) => s.id === 'vulnerable');
  const targetIsVindicta = target.cardId === 'hero_vindicta';

  let final = rawDmg;
  if (vulnerable) final += 2;
  if (hasInvinc) final = 0;
  if (final > 0) {
    if (wraithSplit) {
      const half1 = Math.max(0, Math.ceil(final / 2) - (targetIsVindicta ? 1 : 0));
      const half2 = Math.floor(final / 2);
      const bulletHalf = Math.max(0, half1 - bulletResist);
      const spiritHalf = Math.max(0, half2 - spiritResist);
      final = bulletHalf + spiritHalf;
    } else {
      if (targetIsVindicta) final = Math.max(0, final - 1);
      final = Math.max(0, final - bulletResist);
    }
  }
  let shieldRemaining = shieldValue;
  if (final > 0 && shieldRemaining > 0) {
    const absorb = Math.min(shieldRemaining, final);
    shieldRemaining -= absorb;
    final -= absorb;
  }
  return { final, shieldRemaining };
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
      // Mutual-damage rule: when the rival's Active is the attacker, the
      // defender's Active retaliates with their full ATK. Bench attackers
      // (Mystic Expansion bearers) don't trigger retaliation. Damage in both
      // directions is computed BEFORE either lands, so a KO on one side
      // doesn't discount the other side's swing.
      const isActiveAttacker = atk === attacker.active;
      const { dmg: retalDmg } = isActiveAttacker
        ? effectiveAttackDamage(target, atk)
        : { dmg: 0 };

      // ---- Apply the attacker's swing first (existing pipeline). ----
      withCast(atk, 'attack', () => {
        if (atk.cardId === 'hero_wraith') {
          const half1 = Math.ceil(dmg / 2);
          const half2 = Math.floor(dmg / 2);
          if (half1 > 0) damageUnit(G, target, half1, 'attack', atkName);
          if (half2 > 0) damageUnit(G, target, half2, 'spirit', atkName);
        } else {
          damageUnit(G, target, dmg, 'attack', atkName);
        }
      });
      const data = CARDS_BY_ID[atk.cardId];
      if (data?.type === 'hero') {
        for (const passId of data.passives ?? []) {
          const a = getAbility(passId);
          if (a?.trigger === 'onAttack') a.run(G, { movingPlayer: attackerId }, { source: atk, target });
        }
      }

      // ---- Apply the defender's retaliation. ----
      // Use the pre-attack rawDmg from above; defender's HP loss in the same
      // exchange does not reduce their retaliation strength. Atk is the new
      // damage recipient, so all its mitigation (shield, Vindicta -1, etc.)
      // applies through damageUnit naturally.
      if (retalDmg > 0 && atk.hp > 0) {
        const targetName = CARDS_BY_ID[target.cardId]?.name ?? target.cardId;
        withCast(target, 'attack', () => {
          if (target.cardId === 'hero_wraith') {
            const half1 = Math.ceil(retalDmg / 2);
            const half2 = Math.floor(retalDmg / 2);
            if (half1 > 0) damageUnit(G, atk, half1, 'attack', targetName);
            if (half2 > 0) damageUnit(G, atk, half2, 'spirit', targetName);
          } else {
            damageUnit(G, atk, retalDmg, 'attack', targetName);
          }
        });
        const tdata = CARDS_BY_ID[target.cardId];
        if (tdata?.type === 'hero') {
          for (const passId of tdata.passives ?? []) {
            const a = getAbility(passId);
            if (a?.trigger === 'onAttack') a.run(G, { movingPlayer: defenderId }, { source: target, target: atk });
          }
        }
      }
    } else {
      damagePlayer(G, defenderId, dmg);
    }
  }

  reapDead(G, defender);
  reapDead(G, attacker);
}

// ---------- Helpers (shared between planner and resolver) ----------

function collectAttackers(attacker: { active: CardInstance | null; bench: (CardInstance | null)[] }): CardInstance[] {
  const out: CardInstance[] = [];
  if (attacker.active && (attacker.active.respawnTurnsLeft ?? 0) === 0) out.push(attacker.active);
  for (const b of attacker.bench) {
    if (!b || (b.respawnTurnsLeft ?? 0) > 0) continue;
    // Mystic Expansion equipment lets the bearer attack from the bench
    // (canon: imbue with range). Same effect as the intrinsic flag — checked
    // directly by attached cardId so no engine-level "long_range" status is
    // needed.
    if (b.attached?.some((eq) => eq.cardId === 'mystic_expansion')) { out.push(b); continue; }
    // Intrinsic long range on the hero card (Vindicta's Flight, e.g.).
    const data = CARDS_BY_ID[b.cardId];
    if (data?.type === 'hero' && data.flags?.longRange) out.push(b);
  }
  return out;
}

function effectiveAttackDamage(atk: CardInstance, target: CardInstance | null): { dmg: number; bonusLabel?: string } {
  let dmg = effectiveAtk(atk);
  // Weaken: subtract the status value from the attacker's outgoing damage,
  // floored at 0. Carried by Rusted Barrel and any future "ATK-down" effect.
  const weak = atk.statuses.find((s) => s.id === 'weaken');
  if (weak) dmg = Math.max(0, dmg - weak.value);
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
