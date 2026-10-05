/**
 * What a hero can still do this turn, read the way the engine reads it. A
 * turn is the player's to spend on cards, skills and a retreat, with one
 * attack among them: every hero may use its skill once a turn (a soul each),
 * and the Active does one or the other — its skill or the attack. The board's
 * glint, the hero sheet's plates and the tutorial all ask here, so none of
 * them offers a move the engine would refuse.
 */
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { SKILL_COST } from '@/engine/game';
import type { AttackBlock, AttackPlan } from '@/engine/combat';

/** Why a hero cannot use its skill right now. */
export type SkillBlock = 'noSkill' | 'down' | 'used' | 'attacked' | 'status' | 'souls';

/** Statuses that keep a hero from its skill: Stun, Silence, Sleep, and the
 *  heavy channel lockout (`casting`; Warden's `casting_light` is not one). */
const SKILL_LOCKS = new Set(['silenced', 'stun', 'sleep', 'casting']);

/** Why `pid`'s hero cannot use its skill right now, or null when it can.
 *  The engine's `useSkill` guards, one for one: a hero with a skill, alive,
 *  that has neither used it nor made the turn's attack, free of the statuses
 *  that lock it, and a soul to pay with. Whose turn it is, is the caller's
 *  question. */
export function skillBlocked(G: GameState, pid: PlayerID, hero: CardInstance): SkillBlock | null {
  const data = CARDS_BY_ID[hero.cardId];
  if (data?.type !== 'hero' || !data.skill || !getAbility(data.skill)) return 'noSkill';
  if ((hero.respawnTurnsLeft ?? 0) > 0) return 'down';
  if (hero.skillUsedThisTurn) return 'used';
  if (hero.attackedThisTurn) return 'attacked';
  if (hero.statuses.some((s) => SKILL_LOCKS.has(s.id))) return 'status';
  if (G.players[pid].souls < SKILL_COST) return 'souls';
  return null;
}

/** The line the hero sheet prints on a skill that cannot be used. */
export function skillBlockReason(block: SkillBlock): string {
  switch (block) {
    case 'used': return 'Already used';
    case 'attacked': return 'Attacked this turn';
    case 'status': return 'Cannot use skill (status)';
    case 'souls': return `Need ${SKILL_COST} soul`;
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
