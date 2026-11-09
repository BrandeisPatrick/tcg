/**
 * What a hero can still do this turn, read the way the engine reads it. A
 * turn opens with its income and its draw; then the player puts heroes from
 * the hand on the bench (free) and items from the hand on heroes (their
 * price), every hero may use one ability a turn (its skill or, from Level 2,
 * its ultimate, each for its souls; or an active item it wears, free), one
 * Retreat (the leaving hero's own price), and the Active makes the turn's
 * attack, which ends the turn. The board's glint, the
 * hero sheet's plates, the hand, the refusal stickers and the tutorial all ask
 * the engine's own `skillBlocked` / `activateBlocked` / `attackBlocked` /
 * `playBlocked` / `placeHeroBlocked` / `moveBlocked` (legality.ts) and
 * `blocked`, so none of them offers a move the engine would refuse; this file
 * only words the answers.
 */
import type { AbilityId, CardInstance, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID, cardName } from '@/cards';
import { ULT_UNLOCK_LEVEL } from '@/engine/constants';
import {
  activateBlocked, blocked, moveBlocked, playCost, retreatCost, skillBlocked,
  type ActivateBlock, type AttackBlock, type ChooseActiveBlock, type DiscardBlock, type MoveBlock, type PlaceBlock, type PlayBlock,
  type PromoteBlock, type SkillBlock,
} from '@/engine/legality';
import {
  findCardOnBoard, findWornItem, handCard, isRespawning, isUntargetable, itemCooldown, itemPrice, kitAbilityIds, kitCost, otherPlayer,
  resolveSkill, slotCap, wornActives,
} from '@/engine/query';
import type { Action } from '@/engine/engine';
import type { AbilityDef } from '@/abilities';
import type { AttackPlan } from '@/engine/forecast';

/** "1 soul", "2 souls". */
const souls = (n: number) => `${n} soul${n === 1 ? '' : 's'}`;
const nameOf = (card: CardInstance | null | undefined) => (card ? CARDS_BY_ID[card.cardId]?.name ?? '' : '');

/** The line printed when the turn's attack has ended its Act. */
export const ACT_OVER = 'The attack ended your turn';

/** The line printed on a move made while a draw card's discard is owed. */
export const DISCARD_FIRST = 'Discard first';

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
      if (lastKind === 'ult') return 'Used its ultimate this turn';
      if (!lastKind) return `Used ${cardName(last)} this turn`;
      return skill.kind === 'skill' ? 'Used its other skill this turn' : 'Used its skill this turn';
    }
    case 'trigger': return triggerMomentLine(hero, skill?.ability);
    case 'actOver': return ACT_OVER;
    case 'locked': return `Unlocks at Level ${ULT_UNLOCK_LEVEL}`;
    case 'status': return 'Cannot use abilities (status)';
    case 'cooldown': {
      const left = (skill && hero?.cooldowns?.[skill.id]) || 0;
      return left > 0 ? `Ready in ${left} turn${left === 1 ? '' : 's'}` : 'On cooldown';
    }
    case 'souls': {
      const cost = hero && skill ? kitCost(hero, skill.id) : 0;
      return cost > 0 ? `Need ${souls(cost)}` : 'Not enough souls';
    }
    case 'hp': return skill?.ability.hpCost ? `Needs more than ${skill.ability.hpCost} HP` : 'Not enough HP';
    case 'target': return 'No valid target';
    case 'down': return 'Down until it respawns';
    case 'noSkill': return '';
  }
}

/** When an optional trigger is asked (engine/prompts.ts): the line its plate
 *  prints in place of a button, since it is never used from one ("Asked when
 *  Victor falls"). */
export function triggerMomentLine(hero?: CardInstance, ability?: AbilityDef): string {
  const name = hero ? nameOf(hero) : 'the hero';
  switch (ability?.trigger) {
    case 'onFall': return `Asked when ${name} falls`;
    default: return 'Asked when it can be used';
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

/** The line the hero sheet prints on an active item that cannot be used.
 *  Name the item to get how long its cooldown has to run, and its bearer to
 *  get which ability it used instead. */
export function activateBlockReason(block: ActivateBlock, item?: CardInstance, bearer?: CardInstance): string {
  switch (block) {
    case 'noItem': return 'Not one of your items';
    case 'passive': return 'A passive item: always on';
    case 'actOver': return ACT_OVER;
    case 'down': return 'Down until it respawns';
    case 'used': {
      const last = bearer?.lastSkillUsed;
      if (!last || last === item?.cardId) return 'Already used';
      const kind = bearer && resolveSkill(bearer, last)?.kind;
      return kind === 'ult' ? 'Used its ultimate this turn' : kind ? 'Used its skill this turn' : `Used ${cardName(last)} this turn`;
    }
    case 'status': return 'Cannot use abilities (status)';
    case 'charges': return 'No charges left';
    case 'cooldown': {
      const left = item ? itemCooldown(item) : 0;
      return left > 0 ? `Ready in ${left} turn${left === 1 ? '' : 's'}` : 'On cooldown';
    }
    case 'target': return 'No valid target';
  }
}

/** Who and what a hand refusal is about, so its line can name them. */
interface HandSubject {
  /** The card ("Extended Magazine"). */
  item?: string;
  /** The hero it was to go on, when one was named. */
  hero?: string;
  /** What it would cost (`playCost`). */
  cost?: number;
  /** The souls the player has. */
  have?: number;
  /** The slots a hero has (`slotCap`). */
  slots?: number;
}

/** The line the sticker prints on a card from the hand that cannot go onto
 *  the hero it was played on. */
export function playBlockReason(block: PlayBlock, s: HandSubject = {}): string {
  switch (block) {
    case 'notYourTurn': return 'Not your turn';
    case 'notInHand': return 'That card is not in your hand';
    case 'hero': return 'A hero goes on the bench — tap it in your hand';
    case 'noHero': return 'Play it onto one of your heroes';
    case 'duplicate': return `${s.hero ?? 'That hero'} already wears ${s.item ?? 'one'}`;
    case 'full': return `${s.hero ?? 'That hero'} wears ${s.slots ?? 3} items`;
    case 'souls': return s.cost === undefined ? 'Not enough souls' : `Need ${souls(s.cost)}${s.have === undefined ? '' : ` — you have ${s.have}`}`;
    case 'upgrade': return 'Not an upgrade of that card';
  }
}

/** The line printed on a hero from the hand that cannot go on the board. */
export function placeBlockReason(block: PlaceBlock): string {
  switch (block) {
    case 'notYourTurn': return 'Not your turn';
    case 'notInHand': return 'That card is not in your hand';
    case 'notHero': return 'An item goes on a hero';
    case 'occupied': return 'Your Active slot is taken';
    case 'benchOnly': return 'That hero can only fight from the bench';
    case 'benchFull': return 'Your bench is full';
  }
}

/** The line printed on a first Active the engine will not take. */
export function chooseActiveBlockReason(block: ChooseActiveBlock): string {
  switch (block) {
    case 'notOwed': return 'Your Active is already in the lane';
    case 'notInHand': return 'That card is not in your hand';
    case 'notHero': return 'Choose a hero';
    case 'benchOnly': return 'That hero can only fight from the bench';
  }
}

/** The line printed on a discard the engine will not take. */
export function discardBlockReason(block: DiscardBlock): string {
  switch (block) {
    case 'notOwed': return 'Nothing to discard';
    case 'none': return 'Choose the cards to discard';
    case 'tooMany': return 'Too many cards';
    case 'repeat': return 'A card was chosen twice';
    case 'notInHand': return 'That card is not in your hand';
  }
}

/** The line the board's sticker prints on a swap that cannot be made. `cost` is
 *  what the Retreat costs right now (`retreatCost`, legality.ts): the leaving
 *  hero's own price. Left out, the line names no number. */
export function moveBlockReason(block: MoveBlock, cost?: number): string {
  switch (block) {
    case 'same': return 'That hero is already there';
    case 'actOver': return ACT_OVER;
    case 'retreated': return 'One Retreat a turn';
    case 'empty': return 'There is no hero in that slot';
    case 'benchOnly': return 'That hero can only fight from the bench';
    case 'down': return 'Down until it respawns';
    case 'rooted': return 'Rooted: cannot retreat or be swapped';
    case 'souls': return cost === undefined ? 'Not enough souls' : `Need ${souls(cost)}`;
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
  if (code === 'activeOwed') return 'Put your first Active in the lane';
  if (code === 'discardOwed') return DISCARD_FIRST;
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
    case 'activate': {
      const worn = findWornItem(G, a.itemIid, pid);
      if (code === 'target' && a.targetIid !== undefined) return `Not a valid target for ${nameOf(worn?.item) || 'that item'}`;
      return activateBlockReason(code as ActivateBlock, worn?.item, worn?.bearer);
    }
    case 'playCard': {
      const card = handCard(G, pid, a.cardIid);
      const hero = findCardOnBoard(G, a.heroIid)?.card;
      return playBlockReason(code as PlayBlock, {
        item: nameOf(card) || undefined, hero: nameOf(hero) || undefined, slots: slotCap(G, pid),
        cost: card ? (hero ? playCost(hero, card.cardId) : itemPrice(card.cardId)) : undefined, have: G.players[pid].souls,
      });
    }
    case 'placeHero': return placeBlockReason(code as PlaceBlock);
    case 'chooseActive': return chooseActiveBlockReason(code as ChooseActiveBlock);
    case 'discard': return discardBlockReason(code as DiscardBlock);
    case 'moveHero': return moveBlockReason(code as MoveBlock, retreatCost(G, pid));
    case 'promoteToActive': return promoteBlockReason(code as PromoteBlock);
    case 'endTurn': return '';
    default: return code;
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
 *  its kit abilities now (its skill or its ultimate, souls in hand) or an
 *  active item it wears, or — the Active — make the turn's attack while it is
 *  open. Nobody glints while a choice is owed (a discard, the first Active). */
export function readyHeroes(G: GameState, pid: PlayerID, attackOpen: boolean): Set<string> {
  const ps = G.players[pid];
  const ready = new Set<string>();
  if (G.pendingDiscard || G.pendingActive) return ready;
  for (const hero of [ps.active, ...ps.bench]) {
    if (!hero) continue;
    const abilityOpen = kitAbilityIds(hero).some((id) => skillBlocked(G, pid, hero, undefined, id) === null)
      || wornActives(hero).some((it) => activateBlocked(G, pid, it.iid) === null);
    if (abilityOpen || (hero === ps.active && attackOpen)) ready.add(hero.iid);
  }
  return ready;
}
