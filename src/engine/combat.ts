import type { GameState, PlayerID, CardInstance } from './types';
import { CARDS_BY_ID } from '@/cards';
import { damageUnit, resolve, KO_PATRON_DAMAGE } from './damage';
import { otherPlayer, effectiveAtk, attackLocked, isRespawning } from './util';
import { getAbility } from '@/abilities';
import { withCast } from './castContext';

// ---------- The turn's attack ----------

/** The first player forgoes first strike: Turn 1 has no attack. One rule,
 *  read by the planner, the resolver, the attack gate and the board, so the
 *  four cannot drift apart. */
export function attackTurn(G: GameState): boolean {
  return (G.turnNumber ?? 1) > 1;
}

/** Why a player's Active cannot make the turn's attack. */
export type AttackBlock = 'turn1' | 'used' | 'skill' | 'noActive' | 'cannot' | 'noTarget';

/** Why `pid`'s Active cannot make the turn's attack right now, or null when it
 *  can. One gate, read by the `attack` move, the planner's callers, the AI and
 *  the board, so the four cannot drift apart. Checked in this order:
 *   - 'turn1'    Turn 1 has no attack (the first player forgoes first strike).
 *   - 'used'     this turn's attack has been made. One a turn, whoever is
 *                Active: the hero who steps in after it cannot swing again.
 *   - 'noActive' there is no living Active. A fallen one is replaced first —
 *                the attack belongs to the hero who steps up.
 *   - 'skill'    the Active used its skill this turn; a hero does one or the
 *                other.
 *   - 'noTarget' the rival has no living Active to swing at.
 *   - 'cannot'   the swing would deal nothing: Stun, Disarm, Sleep, a heavy
 *                channel, or Weaken down to 0. */
export function attackBlocked(G: GameState, pid: PlayerID): AttackBlock | null {
  if (!attackTurn(G)) return 'turn1';
  if (G.attackUsed) return 'used';
  const active = G.players[pid].active;
  if (!active || isRespawning(active)) return 'noActive';
  if (active.skillUsedThisTurn) return 'skill';
  const target = G.players[otherPlayer(pid)].active;
  if (!target || isRespawning(target)) return 'noTarget';
  if (effectiveAttackDamage(active, target).dmg <= 0) return 'cannot';
  return null;
}

// ---------- Attack plan (pure, for UI prediction + animation) ----------

/** One projected swing of the attack. */
export interface AttackStep {
  attackerIid: string;
  attackerName: string;
  /** iid of the defending hero — always the rival's living Active. */
  targetIid: string;
  targetName: string;
  /** Final damage that will be dealt after mitigation (shield/armor), at the moment of this step. */
  finalDamage: number;
  /** Raw damage before mitigation, for tooltips. */
  rawDamage: number;
  /** Predicted HP on the target after this step (clamped at 0). */
  predictedHpAfter: number;
  /** True if this step will KO the target. */
  predictedKO: boolean;
  /** Amount the target's Shield absorbed at this step. > 0 means the attack
   *  landed but Shield mitigated some/all of it — choreographer renders a
   *  green deflect flash so the impact reads even when HP doesn't move. */
  shieldAbsorbed: number;
  /** Short label for any bonus that contributed (e.g., "Haze passive vs Stun: +2"). */
  bonusLabel?: string;
}

export interface AttackPlan {
  attackerId: PlayerID;
  defenderId: PlayerID;
  steps: AttackStep[];
  /** Sum of damage hitting the defender's Active hero. */
  damageToActive: number;
  /** Patron HP the attack costs the defender: the flat KO_PATRON_DAMAGE when
   *  its Active is knocked out, 0 otherwise. The swings themselves never reach
   *  the patron — damage past 0 HP is discarded, not spilled. */
  patronDamage: number;
  /** iid of the defender's Active if it will be KO'd during the attack. */
  defenderActiveKO: string | null;
}

/**
 * Build a pure, predictive plan of the attack `attackerId`'s Active would make.
 *
 * The plan mirrors what `resolveAttackPhase` will do but mutates nothing.
 * The UI can read this to (a) project the attack's damage before it is made
 * and (b) drive an animated choreographer that walks the steps in order. It
 * does not ask whether the attack may be made — callers check `attackBlocked`.
 *
 * Predicted HP factors in current shield/armor and any queued bonus attacks.
 * The attacker's own HP is carried from swing to swing as well: its on-attack
 * heals land between swings, so Frenzy's threshold moves as it does in the
 * engine. Reaping order matches the engine: the target is not re-evaluated
 * mid-attack (defender.active doesn't shift until every swing has landed).
 */
export function planAttackPhase(G: GameState, attackerId: PlayerID): AttackPlan {
  const defenderId = otherPlayer(attackerId);
  const noAttack: AttackPlan = { attackerId, defenderId, steps: [], damageToActive: 0, patronDamage: 0, defenderActiveKO: null };

  // Mirror resolveAttackPhase's first-turn rule (P0 forgoes first-strike on
  // Turn 1): the plan must predict "no attacks" too, or the UI choreographs
  // a phantom strike — tracers, hit flashes, Damaged banners — that the
  // engine then never applies.
  if (!attackTurn(G)) return noAttack;

  const attacker = G.players[attackerId];
  const defender = G.players[defenderId];

  const attackers = collectAttackers(attacker);
  // A corpse active (respawning) isn't a valid bullet sponge, and nothing
  // stands in for it: with no living Active the attack fizzles, as it does in
  // the resolver, so the plan has no steps.
  const target = defender.active && (defender.active.respawnTurnsLeft ?? 0) === 0 ? defender.active : null;
  if (!target) return noAttack;

  // Running simulation state for the DEFENDER (without mutating G).
  let simHp = target.hp;
  let simShield = target.statuses.find((s) => s.id === 'shield')?.value ?? 0;
  const foe = { hpMax: target.hpMax };

  const steps: AttackStep[] = [];
  let damageToActive = 0;
  let defenderActiveKO: string | null = null;

  for (const atk of attackers) {
    if (atk.hp <= 0) continue;
    // The attacker's own HP, carried across its swings. Its on-attack heals
    // land between them, and the damage is read off it afresh for every
    // swing, as the resolver re-reads it — so Frenzy's +3 drops off the swing
    // after a heal lifts the bearer to half HP.
    const self = { hp: atk.hp, hpMax: atk.hpMax };
    const { dmg, bonusLabel } = effectiveAttackDamage(atk, target, self);
    if (dmg <= 0) continue;

    /** One swing: mitigated, recorded, and its effects on the attacker
     *  applied before the next one is worked out. */
    const land = (raw: number, label: string | undefined) => {
      const wraithSplit = false; // Wraith deals full bullet + a separate Spirit hit via passive_wraith_mixed
      const shieldBefore = simShield;
      const m = simulateAttackMitigation(raw, target, simShield, wraithSplit);
      simShield = m.shieldRemaining;
      const predictedHp = simHp - m.final;
      const ko = predictedHp <= 0;
      steps.push({
        attackerIid: atk.iid,
        attackerName: CARDS_BY_ID[atk.cardId]?.name ?? atk.cardId,
        targetIid: target.iid,
        targetName: CARDS_BY_ID[target.cardId]?.name ?? target.cardId,
        finalDamage: m.final,
        rawDamage: raw,
        predictedHpAfter: Math.max(0, predictedHp),
        predictedKO: ko,
        shieldAbsorbed: Math.max(0, shieldBefore - m.shieldRemaining),
        bonusLabel: label,
      });
      simHp = Math.max(0, predictedHp);
      damageToActive += m.final;
      if (ko) defenderActiveKO = target.iid;
      simulateSwingOnAttacker(atk, m.final, self, foe);
    };

    land(dmg, bonusLabel);

    // Extra Attacks: predicted extra full-power swings.
    // Haze's Fixation grants +1 on her primary swing (resolver runs it as an
    // onAttack passive, which the pure planner can't execute) — mirror it here
    // so the prediction matches the resolved damage.
    let extra = atk.statuses.find((s) => s.id === 'extra_attack')?.value ?? 0;
    if (atk.cardId === 'hero_haze') extra += 1;
    for (let i = 0; i < extra && simHp > 0; i++) {
      const bonus = effectiveAttackDamage(atk, target, self).dmg;
      if (bonus <= 0) continue;
      land(bonus, 'Extra Attack');
    }
  }

  // The patron is only damaged when a hero dies: a knocked-out Active costs
  // its side the flat KO_PATRON_DAMAGE (charged in killInPlace), and whatever
  // the swing dealt past 0 HP is discarded.
  const patronDamage = defenderActiveKO ? KO_PATRON_DAMAGE : 0;

  return { attackerId, defenderId, steps, damageToActive, patronDamage, defenderActiveKO };
}

/** What a swing that dealt `dealt` does to its attacker, mirrored for the
 *  planner, which cannot run the onAttack effects that do it in the engine.
 *  Moves the running `self` (and `foe`'s max HP), in the engine's order:
 *   - the attacker's gear, in the order it is worn — only after a swing that
 *     reached HP, as damageUnit fires it after the damage lands: Frenzy heals
 *     2 while below half HP, Restorative Shot 1, Bullet Lifesteal (and
 *     Leech) 2, and Siphon Bullets takes 1 max HP from the target and fills it;
 *   - then the hero's own passive: Drifter's Bloodscent heals half of `dealt`.
 *  Heals follow healUnit: Healing Blocked stops them, Healing Boost adds to
 *  each, and max HP caps them. Only effects that move the attacker's HP are
 *  here — it is what Frenzy's threshold reads. */
function simulateSwingOnAttacker(
  atk: CardInstance,
  dealt: number,
  self: { hp: number; hpMax: number },
  foe: { hpMax: number },
) {
  const blocked = atk.statuses.some((s) => s.id === 'healing_boost_down');
  const boost = atk.statuses.find((s) => s.id === 'healing_boost')?.value ?? 0;
  const heal = (amount: number) => {
    if (amount <= 0 || blocked) return;
    self.hp += Math.max(0, Math.min(amount + boost, self.hpMax - self.hp));
  };
  if (dealt > 0) {
    for (const eq of atk.attached ?? []) {
      const data = CARDS_BY_ID[eq.cardId];
      if (data?.type !== 'equipment' || !data.abilities) continue;
      for (const aid of data.abilities) {
        if (aid === 'eff_frenzy' && self.hp < self.hpMax / 2) heal(2);
        else if (aid === 'eff_restorative_shot_proc') heal(1);
        else if (aid === 'eff_bullet_lifesteal') heal(2);
        else if (aid === 'eff_siphon_bullets' && foe.hpMax > 1) {
          foe.hpMax -= 1;
          self.hpMax += 1;
          self.hp += 1;
        }
      }
    }
  }
  const hero = CARDS_BY_ID[atk.cardId];
  if (hero?.type === 'hero' && hero.passives?.includes('passive_drifter_bloodscent')) heal(Math.floor(dealt / 2));
}

/** Pure-function mitigation simulator for the planner's swings. Mirrors
 *  damageUnit's pipeline (Vulnerable, Unstoppable, Vindicta -1 bullet, Bullet
 *  Resist, Wraith half-split, Shield). */
function simulateAttackMitigation(
  rawDmg: number,
  target: CardInstance,
  shieldValue: number,
  wraithSplit: boolean,
): { final: number; shieldRemaining: number } {
  const bulletResist = target.statuses.find((s) => s.id === 'bullet_resist')?.value ?? 0;
  const spiritResist = target.statuses.find((s) => s.id === 'spirit_resist')?.value ?? 0;
  const bulletShred = target.statuses.find((s) => s.id === 'bullet_resist_down')?.value ?? 0;
  const spiritShred = target.statuses.find((s) => s.id === 'spirit_resist_down')?.value ?? 0;
  const netBullet = bulletResist - bulletShred;
  const netSpirit = spiritResist - spiritShred;
  const hasInvinc = target.statuses.some((s) => s.id === 'unstoppable');
  const targetIsVindicta = target.cardId === 'hero_vindicta';

  let final = rawDmg;
  if (hasInvinc) final = 0;
  if (final > 0) {
    if (wraithSplit) {
      let half1 = Math.ceil(final / 2);
      if (targetIsVindicta) half1 = Math.max(0, half1 - 1);
      if (netBullet > 0) half1 = Math.max(0, half1 - netBullet);
      else if (netBullet < 0) half1 += Math.abs(netBullet);
      let half2 = Math.floor(final / 2);
      if (netSpirit > 0) half2 = Math.max(0, half2 - netSpirit);
      else if (netSpirit < 0) half2 += Math.abs(netSpirit);
      final = half1 + half2;
    } else {
      if (targetIsVindicta) final = Math.max(0, final - 1);
      if (netBullet > 0) final = Math.max(0, final - netBullet);
      else if (netBullet < 0) final += Math.abs(netBullet);
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
 * Resolve the attack of `attackerId`'s Active: its swing at the rival Active,
 * then any Extra Attacks it has queued. One-way — the defender does not strike
 * back, and none of its onAttack passives fire. The behavior matches
 * `planAttackPhase` step for step. This only swings: the `attack` move checks
 * `attackBlocked` and marks the attack as made before calling it.
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
    const { dmg } = effectiveAttackDamage(atk, target);
    if (dmg <= 0) continue;

    if (target) {
      const atkName = CARDS_BY_ID[atk.cardId]?.name ?? atk.cardId;

      // ---- The swing. ----
      // Capture the actual damage dealt (post-mitigation) so onAttack lifesteal
      // (Drifter) can heal for half of it.
      let dealt = 0;
      withCast(atk, 'attack', () => {
        dealt = damageUnit(G, target, dmg, 'attack', atkName);
      });
      const data = CARDS_BY_ID[atk.cardId];
      if (data?.type === 'hero') {
        for (const passId of data.passives ?? []) {
          const a = getAbility(passId);
          // `primary: true` marks this as the hero's main swing of the turn —
          // Haze's Fixation grants its extra attack only here, so the extra
          // swings it spawns don't re-trigger it.
          if (a?.trigger === 'onAttack') a.run(G, { movingPlayer: attackerId }, { source: atk, target, params: { primary: true, dealt } });
        }
      }

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
        const bonus = effectiveAttackDamage(atk, target).dmg;
        if (bonus <= 0) continue;
        let exDealt = 0;
        withCast(atk, 'attack', () => {
          exDealt = damageUnit(G, target, bonus, 'attack', `${atkName} (Extra Attack)`);
        });
        if (data?.type === 'hero') {
          for (const passId of data.passives ?? []) {
            const a = getAbility(passId);
            if (a?.trigger === 'onAttack') a.run(G, { movingPlayer: attackerId }, { source: atk, target, params: { dealt: exDealt } });
          }
        }
      }
    }
    atk.statuses = atk.statuses.filter((s) => s.id !== 'extra_attack');
    // No living Active to sponge → the attack fizzles. The patron is only
    // damaged when a hero dies (flat KO_PATRON_DAMAGE, in killInPlace), never
    // by the swings themselves.
  }

  resolve(G);
}

// ---------- Helpers (shared between planner and resolver) ----------

// Only the Active hero attacks — bench heroes never swing. Returned as a
// one-element list so the resolver and planner can share a single loop.
function collectAttackers(attacker: { active: CardInstance | null }): CardInstance[] {
  if (attacker.active && (attacker.active.respawnTurnsLeft ?? 0) === 0) return [attacker.active];
  return [];
}

function effectiveAttackDamage(
  atk: CardInstance,
  target: CardInstance | null,
  // The HP Frenzy's threshold is read against: the attacker's own, or the
  // planner's running copy of it between swings.
  self: { hp: number; hpMax: number } = atk,
): { dmg: number; bonusLabel?: string } {
  // A hero that cannot make basic attacks swings for nothing, whatever it
  // wears. Checked here, ahead of every bonus, so the planner, the resolver
  // and the attack gate all read the same 0.
  if (attackLocked(atk)) return { dmg: 0 };
  let dmg = effectiveAtk(atk);
  // Weaken: subtract the status value from the attacker's outgoing damage,
  // floored at 0. Carried by Rusted Barrel and any future "ATK-down" effect.
  const weak = atk.statuses.find((s) => s.id === 'weapon_power_down');
  if (weak) dmg = Math.max(0, dmg - weak.value);
  let bonusLabel: string | undefined;
  // Frenzy (equipment): +3 Bullet Power while the bearer is below half HP.
  if (atk.attached?.some((eq) => eq.cardId === 'frenzy') && self.hp < self.hpMax / 2) {
    dmg += 3;
    bonusLabel = 'Frenzy: +3 <½ HP';
  }
  return { dmg, bonusLabel };
}
