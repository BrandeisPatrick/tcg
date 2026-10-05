/**
 * What a hero can still do this turn, read the way the engine reads it. A
 * turn is the player's to spend on cards, skills and a retreat, with one
 * attack among them: every hero may use its skill once a turn (a soul each),
 * and the Active does one or the other — its skill or the attack. The board's
 * glint, the hero sheet's plates, the refusal stickers and the tutorial all
 * ask the engine's own `skillBlocked` / `attackBlocked` / `playBlocked` /
 * `moveBlocked` (legality.ts), so none of them offers a move the engine would
 * refuse; this file only words the answers.
 */
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { MAX_EQUIPMENT_PER_HERO, RETREAT_COST, SKILL_COST } from '@/engine/constants';
import {
  blocked, cardCost, moveBlocked, skillBlocked,
  type AttackBlock, type MoveBlock, type PlayBlock, type PromoteBlock, type SkillBlock,
} from '@/engine/legality';
import { findCardOnBoard } from '@/engine/query';
import type { Action } from '@/engine/engine';
import type { AttackPlan } from '@/engine/forecast';

/** "1 soul", "2 souls". */
const souls = (n: number) => `${n} soul${n === 1 ? '' : 's'}`;
const nameOf = (card: CardInstance | null | undefined) => (card ? CARDS_BY_ID[card.cardId]?.name ?? '' : '');

/** The line the hero sheet prints on a skill that cannot be used. */
export function skillBlockReason(block: SkillBlock): string {
  switch (block) {
    case 'used': return 'Already used';
    case 'attacked': return 'Attacked this turn';
    case 'status': return 'Cannot use skill (status)';
    case 'souls': return `Need ${souls(SKILL_COST)}`;
    case 'target': return 'No valid target';
    case 'down': return 'Down until it respawns';
    case 'noSkill': return '';
  }
}

/** The line the hero sheet prints on an attack that cannot be made. */
export function attackBlockReason(block: AttackBlock, active: CardInstance | null | undefined): string {
  switch (block) {
    case 'turn1': return 'No attacks on Turn 1';
    case 'used': return active?.attackedThisTurn ? 'Attacked this turn' : "This turn's attack is spent";
    case 'skill': return 'Used its skill this turn';
    case 'cannot': return 'Cannot attack (status)';
    case 'noTarget': return 'No rival Active to hit';
    case 'noActive': return 'Down until it respawns';
  }
}

/** Who and what a card refusal is about, so its line can name them. */
export interface PlaySubject {
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
    case 'souls': return `Need ${souls(s.cost)}${s.have === undefined ? '' : ` — you have ${s.have}`}`;
    case 'target': return `Not a valid target for ${s.card}`;
    case 'duplicate': return s.hero ? `${s.hero} already wears ${s.card}` : `Every hero already wears ${s.card}`;
    case 'full': return `${s.hero ?? 'That hero'} wears ${MAX_EQUIPMENT_PER_HERO} items — pick one to replace`;
    case 'discard': return `${s.hero ?? 'That hero'} is not wearing that item`;
  }
}

/** The line the board's sticker prints on a swap that cannot be made. */
export function moveBlockReason(block: MoveBlock): string {
  switch (block) {
    case 'same': return 'That hero is already there';
    case 'empty': return 'There is no hero in that slot';
    case 'benchOnly': return 'That hero can only fight from the bench';
    case 'down': return 'Down until it respawns';
    case 'souls': return `Need ${souls(RETREAT_COST)}`;
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
  switch (a.type) {
    case 'attack':
      if (code === 'draft') return 'Pick your heroes first';
      return attackBlockReason(code as AttackBlock, G.players[pid].active);
    case 'useSkill': {
      const hero = nameOf(findCardOnBoard(G, a.heroIid)?.card);
      if (code === 'noHero') return 'That is not one of your heroes';
      if (code === 'noSkill') return `${hero} has no skill`;
      if (code === 'target' && a.targetIid !== undefined) return `Not a valid target for ${hero}'s skill`;
      return skillBlockReason(code as SkillBlock);
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
    case 'moveHero': return moveBlockReason(code as MoveBlock);
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
