/**
 * What the turn's attack would do, worked out ahead of making it — for the
 * board's damage preview and the choreographer's walk, and for the AI's crude
 * attack score.
 *
 * STAGE 1: this is still the hand-written mirror of the resolver
 * (`planAttackPhase`); it only reads attack damage through `attackPower` now,
 * so the Frenzy and lockout rules are not repeated here. It is replaced by a
 * forecast derived from the real action run on a copy (`forecastAttack`).
 */
import type { CardInstance, GameState, PlayerID } from './types';
import { CARDS_BY_ID } from '@/cards';
import { KO_PATRON_DAMAGE } from './constants';
import { attackPower, otherPlayer } from './query';
import { attackTurn } from './legality';
import { collectAttackers } from './actions/attack';

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
    const { dmg, bonusLabel } = swingPower(atk, self);
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
      const bonus = swingPower(atk, self).dmg;
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

/** What one swing of `atk` deals, with `self` standing in for its HP — the
 *  planner's running copy between swings, which is what Frenzy's threshold
 *  reads. Everything is `attackPower`'s: lockouts, Weaken, bonus hooks. */
function swingPower(atk: CardInstance, self: { hp: number; hpMax: number }): { dmg: number; bonusLabel?: string } {
  const power = attackPower({ ...atk, hp: self.hp, hpMax: self.hpMax });
  return { dmg: power.total, bonusLabel: power.parts.find((p) => p.bonus)?.label };
}
