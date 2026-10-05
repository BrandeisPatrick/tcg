/**
 * What a hero can still do this turn, read the way the engine reads it. A
 * turn is the player's to spend on cards, skills and a retreat, with one
 * attack among them: every hero may use its skill once a turn (a soul each),
 * and the Active does one or the other — its skill or the attack. The board's
 * glint, the hero sheet's plates and the tutorial all ask the engine's own
 * `skillBlocked` / `attackBlocked` (legality.ts), so none of them offers a move
 * the engine would refuse; this file only words the answers.
 */
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { SKILL_COST } from '@/engine/constants';
import { skillBlocked, type AttackBlock, type SkillBlock } from '@/engine/legality';
import type { AttackPlan } from '@/engine/forecast';

/** The line the hero sheet prints on a skill that cannot be used. */
export function skillBlockReason(block: SkillBlock): string {
  switch (block) {
    case 'used': return 'Already used';
    case 'attacked': return 'Attacked this turn';
    case 'status': return 'Cannot use skill (status)';
    case 'souls': return `Need ${SKILL_COST} soul`;
    case 'target': return 'No valid target';
    case 'down': return 'Down until it respawns';
    case 'noSkill': return '';
  }
}

/** The line the hero sheet prints on an attack that cannot be made. */
export function attackBlockReason(block: AttackBlock, active: CardInstance): string {
  switch (block) {
    case 'turn1': return 'No attacks on Turn 1';
    case 'used': return active.attackedThisTurn ? 'Attacked this turn' : "This turn's attack is spent";
    case 'skill': return 'Used its skill this turn';
    case 'cannot': return 'Cannot attack (status)';
    case 'noTarget': return 'No rival Active to hit';
    case 'noActive': return 'Down until it respawns';
  }
}

/** What the attack would do, read off its plan: "Hits Dynamo for 2 bullet
 *  damage", with the Extra Attacks, what a Shield soaks up and a knockout
 *  said when they happen. */
export function attackLine(plan: AttackPlan): string {
  const first = plan.steps[0];
  if (!first) return '';
  const dealt = plan.steps.reduce((n, s) => n + s.finalDamage, 0);
  const soaked = plan.steps.reduce((n, s) => n + s.shieldAbsorbed, 0);
  const swings = plan.steps.length > 1 ? ` in ${plan.steps.length} swings` : '';
  const shield = soaked > 0 ? `, ${soaked} into its Shield` : '';
  const ko = plan.defenderActiveKO ? ' — a knockout' : '';
  return `Hits ${first.targetName} for ${dealt} bullet damage${swings}${shield}${ko}`;
}

/** Every hero of `pid`'s that can still do something this turn: use its
 *  skill now, or — the Active — make the turn's attack while it is open. */
export function readyHeroes(G: GameState, pid: PlayerID, attackOpen: boolean): Set<string> {
  const ps = G.players[pid];
  const ready = new Set<string>();
  for (const hero of [ps.active, ...ps.bench]) {
    if (!hero) continue;
    if (skillBlocked(G, pid, hero) === null || (hero === ps.active && attackOpen)) ready.add(hero.iid);
  }
  return ready;
}
