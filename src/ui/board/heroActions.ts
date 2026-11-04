/**
 * What a hero can still do this turn, read the way the engine reads it. A
 * turn is the player's to spend on cards, abilities and one Retreat, then one
 * attack: every hero may use one ability a turn (a skill or, from Level 2, its
 * ultimate — all free), and the Active makes the turn's attack, which ends the
 * turn's Act. The board's glint, the hero sheet's plates, the refusal stickers
 * and the tutorial all ask the engine's own `skillBlocked` / `attackBlocked` /
 * `playBlocked` / `moveBlocked` (legality.ts), so none of them offers a move the
 * engine would refuse; this file only words the answers.
 */
import type { AbilityId, CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { MAX_EQUIPMENT_PER_HERO, RETREAT_COST, ULT_UNLOCK_LEVEL } from '@/engine/constants';
import {
  blocked, cardCost, moveBlocked, retreatCost, skillBlocked,
  type AttackBlock, type MoveBlock, type PlayBlock, type PromoteBlock, type SkillBlock,
} from '@/engine/legality';
import { findCardOnBoard, isRespawning, isUntargetable, kitAbilityIds, otherPlayer, resolveSkill } from '@/engine/query';
import type { Action } from '@/engine/engine';
import type { AttackPlan } from '@/engine/forecast';

/** "1 soul", "2 souls". */
const souls = (n: number) => `${n} soul${n === 1 ? '' : 's'}`;
const nameOf = (card: CardInstance | null | undefined) => (card ? CARDS_BY_ID[card.cardId]?.name ?? '' : '');

/** The line printed when the turn's attack has ended its Act. */
export const ACT_OVER = 'The attack ended your turn';

/** The line the hero sheet prints on an ability (a skill, or the ultimate)
 *  that cannot be used. Name the hero and the ability (left out: its first
 *  skill) to get the lines that need them: how long a cooldown has to run, and
 *  that it was another of the hero's abilities that was used. */
export function skillBlockReason(block: SkillBlock, hero?: CardInstance, skillId?: AbilityId): string {
  const skill = hero && resolveSkill(hero, skillId);
  switch (block) {
    case 'used': {
      const last = hero?.lastSkillUsed;
      if (!hero || !last || !skill || last === skill.id) return 'Already used';
      const lastKind = resolveSkill(hero, last)?.kind;
      if (lastKind === 'ult' || lastKind === 'borrowed') return 'Used its ultimate this turn';
      return skill.kind === 'skill' ? 'Used its other skill this turn' : 'Used its skill this turn';
    }
    case 'actOver': return ACT_OVER;
    case 'locked': return `Unlocks at Level ${ULT_UNLOCK_LEVEL}`;
    case 'status': return 'Cannot use abilities (status)';
    case 'cooldown': {
      const left = (skill && hero?.cooldowns?.[skill.id]) || 0;
      return left > 0 ? `Ready in ${left} turn${left === 1 ? '' : 's'}` : 'On cooldown';
    }
    case 'hp': return skill?.ability.hpCost ? `Needs more than ${skill.ability.hpCost} HP` : 'Not enough HP';
    case 'target': return 'No valid target';
    case 'down': return 'Down until it respawns';
    case 'noSkill': return '';
  }
}

/** The line the hero sheet prints on an attack that cannot be made. Name the
 *  rival's Active to get the line for one who cannot be attacked (a Dome)
 *  rather than for one who is not there. */
export function attackBlockReason(block: AttackBlock, rival?: CardInstance | null): string {
  switch (block) {
    case 'turn1': return 'No attacks on Turn 1';
    // One attack a turn: 'used' is the turn's attack, made.
    case 'used': return 'Attacked this turn';
    case 'cannot': return 'Cannot attack (status)';
    case 'noTarget': {
      const domed = !!rival && !isRespawning(rival) && isUntargetable(rival, 'attack');
      return domed ? 'Their Active cannot be attacked this turn' : 'No rival Active to hit';
    }
    case 'target': return 'That hero cannot be attacked';
    case 'noActive': return 'Down until it respawns';
  }
}

/** Who and what a card refusal is about, so its line can name them. */
interface PlaySubject {
  /** The card in hand ("Extended Magazine"). */
  card: string;
  /** The hero it was aimed at, when one was named. */
  hero?: string;
  /** What the card costs: the engine's `cardCost`, an override included. */
  cost: number;
  /** The souls the player has — printed after the price when given. */
  have?: number;
}

/** The line the board's sticker prints on a card that cannot be played. Every
 *  `PlayBlock` has one. 'full' is answered on the board with a chooser (which
 *  item goes) rather than a sticker; its line is the fallback. */
export function playBlockReason(block: PlayBlock, s: PlaySubject): string {
  switch (block) {
    case 'notInHand': return `${s.card} is not in your hand`;
    case 'actOver': return ACT_OVER;
    case 'souls': return `Need ${souls(s.cost)}${s.have === undefined ? '' : ` — you have ${s.have}`}`;
    case 'target': return `Not a valid target for ${s.card}`;
    case 'duplicate': return s.hero ? `${s.hero} already wears ${s.card}` : `Every hero already wears ${s.card}`;
    case 'full': return `${s.hero ?? 'That hero'} wears ${MAX_EQUIPMENT_PER_HERO} items — pick one to replace`;
    case 'discard': return `${s.hero ?? 'That hero'} is not wearing that item`;
  }
}

/** The line the board's sticker prints on a swap that cannot be made. `cost` is
 *  what the Retreat costs right now (`retreatCost`, legality.ts); left out, the
 *  base price. */
export function moveBlockReason(block: MoveBlock, cost = RETREAT_COST): string {
  switch (block) {
    case 'same': return 'That hero is already there';
    case 'actOver': return ACT_OVER;
    case 'retreated': return 'One Retreat a turn';
    case 'empty': return 'There is no hero in that slot';
    case 'benchOnly': return 'That hero can only fight from the bench';
    case 'down': return 'Down until it respawns';
    case 'rooted': return 'Rooted: cannot retreat or be swapped';
    case 'souls': return `Need ${souls(cost)}`;
    case 'illegal': return 'Not a place on the board';
  }
}

/** The line printed on a promotion the engine will not make. */
export function promoteBlockReason(block: PromoteBlock): string {
  switch (block) {
    case 'notOnBench': return 'That hero is not on your bench';
    case 'notOwed': return 'Your Active is still standing';
    case 'down': return 'Down until it respawns';
    case 'benchOnly': return 'That hero can only fight from the bench';
  }
}

/** The retreat the Active's sheet offers: why it cannot be done right now, or
 *  null when some bench hero can be swapped in. Asks `moveBlocked` for each
 *  hero who could step in; with a choice of heroes it is blocked only when
 *  every one of them is. */
export function retreatBlock(G: GameState, pid: PlayerID, stepIns: CardInstance[]): MoveBlock | null {
  const bench = G.players[pid].bench;
  const asks = stepIns.map((hero) => moveBlocked(G, pid, bench.findIndex((b) => b?.iid === hero.iid) + 1, 0));
  return asks.length > 0 && asks.every((b) => b !== null) ? asks[0] : null;
}

/** An action the engine refused, and the line that says why. */
export interface Refusal {
  /** The engine's own code (`blocked`'s answer), for a caller that reacts to one. */
  code: string;
  text: string;
}

/**
 * Ask the engine whether `pid` may make `a` now. Null means go ahead; else the
 * code and the words for it. The one gate every move the player makes passes
 * before it is dispatched, so a refused move is said, not silent. Whose turn it
 * is, and whether a reveal is still playing, are the caller's questions.
 */
export function actionRefusal(G: GameState, pid: PlayerID, a: Action): Refusal | null {
  const code = blocked(G, pid, a);
  if (code === null) return null;
  return { code, text: refusalText(G, pid, a, code) };
}

function refusalText(G: GameState, pid: PlayerID, a: Action, code: string): string {
  // Owed by either seat, a promotion comes before anything else at the table.
  if (code === 'promotionOwed') return 'Choose who steps up first';
  if (code === 'actOver') return ACT_OVER;
  switch (a.type) {
    case 'attack':
      if (code === 'draft') return 'Pick your heroes first';
      return attackBlockReason(code as AttackBlock, G.players[otherPlayer(pid)].active);
    case 'useSkill': {
      const card = findCardOnBoard(G, a.heroIid)?.card;
      const hero = nameOf(card);
      if (code === 'noHero') return 'That is not one of your heroes';
      if (code === 'noSkill') return `${hero} has no such ability`;
      if (code === 'target' && a.targetIid !== undefined) {
        const kind = card && resolveSkill(card, a.skillId)?.kind;
        return `Not a valid target for ${hero}'s ${kind && kind !== 'skill' ? 'ultimate' : 'skill'}`;
      }
      return skillBlockReason(code as SkillBlock, card, a.skillId);
    }
    case 'playCard': {
      const card = G.players[pid].hand.find((c) => c.iid === a.cardIid);
      return playBlockReason(code as PlayBlock, {
        card: nameOf(card) || 'That card',
        hero: nameOf(a.targetIid ? findCardOnBoard(G, a.targetIid)?.card : null) || undefined,
        cost: card ? cardCost(card) : 0,
        have: G.players[pid].souls,
      });
    }
    case 'moveHero': return moveBlockReason(code as MoveBlock, retreatCost(G, pid));
    case 'promoteToActive': return promoteBlockReason(code as PromoteBlock);
    case 'endTurn': return '';
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

/** Every hero of `pid`'s that can still do something this turn: use one of
 *  its kit abilities now (a skill, its ultimate, a borrowed ultimate), or — the
 *  Active — make the turn's attack while it is open. */
export function readyHeroes(G: GameState, pid: PlayerID, attackOpen: boolean): Set<string> {
  const ps = G.players[pid];
  const ready = new Set<string>();
  for (const hero of [ps.active, ...ps.bench]) {
    if (!hero) continue;
    const abilityOpen = kitAbilityIds(hero).some((id) => skillBlocked(G, pid, hero, undefined, id) === null);
    if (abilityOpen || (hero === ps.active && attackOpen)) ready.add(hero.iid);
  }
  return ready;
}
