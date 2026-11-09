/**
 * The only place the legality of a move is written. Every function is pure and
 * answers "what stops this?" — null means allowed. `perform` asks before it
 * touches anything, and the AI, the board and the tutorial ask the same
 * functions, so none of them offers a move the engine would refuse.
 *
 * Reading a `Block` code: each function lists its reasons in the order it
 * checks them, and the first that holds is the answer.
 *
 * Importing this module loads the card behaviour (`src/abilities`), which
 * registers itself with the engine (registry.ts) — the questions below read it
 * (a skill's target filter, Frenzy's bonus in the attack gate). So do the
 * modules that act (engine.ts) and the resolver tests call directly.
 */
import '@/abilities';
import type { AbilityId, CardId, CardInstance, GameState, PlayerID, PlayerState } from './types';
import { CARDS_BY_ID, itemCard } from '@/cards';
import { upgradesOf } from '@/cards/decks';
import type { Action } from './engine';
import { getAbility } from './registry';
import { ULT_UNLOCK_LEVEL } from './constants';
import {
  abilityAim, attackPower, findCardOnBoard, findWornItem, handCard, hasReach, heroesOf, heroRetreat, isBlocked, isRespawning,
  isUntargetable, itemCooldown, itemPrice, kitAbilityIds, kitCost, laneOpen, liveBoardCards, optionalTriggers, otherPlayer, promptOwed,
  resolveSkill, retreatDiscount, slotCap, slottedHeroes, standingBoss, stepInCandidates, targetsFor, triggerPrice, wornActives, wornItems,
} from './query';
import { seatToMove } from './rounds';

// ---------- The Active's attack ----------

/** The first mover forgoes first strike: Turn 1 (the engine's first, the
 *  first mover's own turn 1) has no attack. One rule, read by the attack gate
 *  and the board, so they cannot drift apart. */
export function attackTurn(G: GameState): boolean {
  return (G.turnNumber ?? 1) > 1;
}

/** Why a player's Active cannot attack. */
export type AttackBlock = 'turn1' | 'used' | 'noActive' | 'cannot' | 'noTarget' | 'target';

/** The reasons that stop the Active attacking whatever it aims at — the ones
 *  about the attacker and the turn, in the order `attackBlocked` checks them.
 *  A player makes one attack a turn (`G.attackUsed`), whoever stands in the
 *  Active slot; a hero that used its ability this turn may still make it. */
function attackerBlock(G: GameState, pid: PlayerID): 'turn1' | 'used' | 'noActive' | null {
  if (!attackTurn(G)) return 'turn1';
  if (G.attackUsed) return 'used';
  const active = G.players[pid].active;
  if (!active || isRespawning(active)) return 'noActive';
  return null;
}

/** Everyone `active` could aim a basic attack at, were it free to make one: the
 *  rival's living Active — or, with reach, every living enemy hero in
 *  `targetsFor` order — minus any hero a status makes untargetable for an
 *  attack (Dome); then the Mid-Boss, while it stands in the pit. Whether the
 *  swing would deal anything is a separate question. */
function aimable(G: GameState, pid: PlayerID, active: CardInstance): CardInstance[] {
  let foes: CardInstance[];
  if (hasReach(active)) {
    foes = targetsFor(G, pid, 'enemyHero');
  } else {
    const rival = G.players[otherPlayer(pid)].active;
    foes = rival && !isRespawning(rival) ? [rival] : [];
  }
  foes = foes.filter((t) => !isUntargetable(t, 'attack'));
  const boss = standingBoss(G);
  return boss ? [...foes, boss] : foes;
}

/**
 * The one list of what `pid`'s Active may swing at this turn: the rival's living
 * Active, or — with reach — every living enemy hero, in `targetsFor` order; never
 * a hero a Dome makes untargetable, and only those the swing would hurt; and
 * last, the Mid-Boss while it stands in the pit (an attack at it is the turn's
 * attack like any other). Empty when the Active cannot attack for any of
 * `attackBlocked`'s reasons. The first of the list is who a bare `attack`
 * swings at — the rival Active, or the boss when no enemy hero can be hit;
 * the board, the AI and `legalActions` offer one attack per target in it.
 */
export function attackTargets(G: GameState, pid: PlayerID): CardInstance[] {
  if (attackerBlock(G, pid) !== null) return [];
  const active = G.players[pid].active!;
  return aimable(G, pid, active).filter((t) => attackPower(active, t).total > 0);
}

/** Why `pid`'s Active cannot attack right now, or null when it can. One gate,
 *  read by the `attack` move, the forecast, the AI and the board, so they cannot
 *  drift apart. A player makes one basic attack a turn, from whoever stands in
 *  the Active slot when it is made — a Retreat before it lets the hero who steps
 *  in make it — and the attack ends the turn's Act. `targetIid` names who is to
 *  be swung at; left out, it is the first of `attackTargets` (the rival Active,
 *  unless the hero has reach). Checked in this order:
 *   - 'turn1'    Turn 1 has no attack (the first mover forgoes first strike).
 *   - 'used'     the turn's attack has been made (`G.attackUsed`).
 *   - 'noActive' there is no living Active. A fallen one is replaced first —
 *                the hero who steps up may make the attack.
 *   - 'noTarget' there is no legal target: the rival has no living Active to
 *                swing at (or, with reach, no living hero), or all of them are
 *                untargetable (a Dome) — and no Mid-Boss stands in the pit.
 *   - 'target'   `targetIid` names a unit the attack may not be aimed at: not on
 *                the board, not an enemy, fallen, domed, or on the bench of a
 *                hero without reach.
 *   - 'cannot'   the swing would deal nothing: Stun, Disarm, Sleep, a heavy
 *                channel, or Weaken down to 0. */
export function attackBlocked(G: GameState, pid: PlayerID, targetIid?: string): AttackBlock | null {
  const early = attackerBlock(G, pid);
  if (early) return early;
  const active = G.players[pid].active!;
  const aim = aimable(G, pid, active);
  if (aim.length === 0) return 'noTarget';
  if (targetIid !== undefined && !aim.some((t) => t.iid === targetIid)) return 'target';
  const swings = targetIid === undefined ? aim : aim.filter((t) => t.iid === targetIid);
  if (!swings.some((t) => attackPower(active, t).total > 0)) return 'cannot';
  return null;
}

// ---------- Hero abilities: skills and ultimates ----------

export type SkillBlock = 'noSkill' | 'trigger' | 'actOver' | 'down' | 'locked' | 'used' | 'status' | 'cooldown' | 'souls' | 'hp' | 'target';

/** What one of a hero's kit abilities may be aimed at (`skillId` names it —
 *  its skill or its ultimate; left out, the hero's first skill): the live
 *  board cards its filter allows (`abilityAim`: its fixed filter, or the one
 *  its `aim` reads off the board; minus the caster, for an ability that says
 *  `excludeSelf`), or 'none' for one that takes no target. No such ability,
 *  or one that cannot be aimed now, gives []. */
export function skillTargets(G: GameState, pid: PlayerID, hero: CardInstance, skillId?: AbilityId): CardInstance[] | 'none' {
  const skill = resolveSkill(hero, skillId);
  if (!skill) return [];
  const aim = abilityAim(G, pid, hero, skill.ability);
  if (!aim) return [];
  if (aim.target === 'noTarget') return 'none';
  const targets = targetsFor(G, pid, aim.target, hero);
  return aim.excludeSelf ? targets.filter((t) => t.iid !== hero.iid) : targets;
}

/**
 * Why `hero` cannot use one of its kit abilities right now, or null when it
 * can: a hero with that ability (`skillId`: its skill or its ultimate; left
 * out, its first skill), in a turn whose attack has not ended the Act, alive,
 * its ultimate unlocked, that has not used an ability this turn (one per hero
 * per turn, skill and ultimate alike), free of the statuses that lock it, with
 * the ability off cooldown, the souls it costs (`kitCost`) in hand and a legal
 * target. Whose turn it is, is the caller's question. Checked in this order:
 *  - 'noSkill'  the hero has no such ability.
 *  - 'trigger'  it is an optional trigger ("When Victor falls, you may use
 *               this"): it is used at its moment, through the trigger prompt
 *               (`triggerBlocked`), never from its button.
 *  - 'actOver'  the turn's attack has been made: it ends the Act.
 *  - 'down'     it is a corpse on the respawn timer.
 *  - 'locked'   it is the hero's ultimate and the hero is below ULT_UNLOCK_LEVEL.
 *  - 'used'     it has used an ability this turn (any of its kit).
 *  - 'status'   a status locks its abilities (`isBlocked(hero, 'skill')`).
 *  - 'cooldown' this ability is still cooling down (`hero.cooldowns`).
 *  - 'souls'    `pid` has fewer souls than it costs (`kitCost`).
 *  - 'hp'       the ability costs HP (`hpCost`) and the hero does not have more
 *               than that: it can pay what it has left, never its last.
 *  - 'target'   there is nothing legal to aim it at — or `targetIid` is not.
 *
 * With `targetIid` given, that card must be one the ability may be aimed at
 * (`noTarget` abilities ignore it). Without it, the question is whether it
 * could be used on SOME legal target.
 */
export function skillBlocked(G: GameState, pid: PlayerID, hero: CardInstance, targetIid?: string, skillId?: AbilityId): SkillBlock | null {
  const skill = resolveSkill(hero, skillId);
  if (!skill) return 'noSkill';
  if (skill.ability.optional) return 'trigger';
  if (G.attackUsed) return 'actOver';
  if (isRespawning(hero)) return 'down';
  if (skill.kind === 'ult' && (hero.level ?? 1) < ULT_UNLOCK_LEVEL) return 'locked';
  if (hero.skillUsedThisTurn) return 'used';
  if (isBlocked(hero, 'skill')) return 'status';
  if ((hero.cooldowns?.[skill.id] ?? 0) > 0) return 'cooldown';
  if (G.players[pid].souls < kitCost(hero, skill.id)) return 'souls';
  if (skill.ability.hpCost && hero.hp <= skill.ability.hpCost) return 'hp';
  const targets = skillTargets(G, pid, hero, skill.id);
  if (targets === 'none') return null;
  if (targetIid === undefined) return targets.length > 0 ? null : 'target';
  return targets.some((t) => t.iid === targetIid) ? null : 'target';
}

// ---------- Optional triggers (the trigger prompt, engine/prompts.ts) ----------

export type TriggerBlock = 'notOwed' | 'noOffer' | 'noHero' | 'noTrigger' | 'locked' | 'cooldown' | 'souls';

/**
 * Why `hero`'s optional trigger `abilityId` cannot be used now by `pid`, or
 * null when it can — the tests of docs/hero-design.md §6, and only those: it
 * is one of the hero's optional triggers, at the right level (an ultimate's
 * ULT_UNLOCK_LEVEL), not waiting (its cooldown), and `pid` has the souls it
 * costs (`triggerPrice`). A trigger is no turn's ability, so whose turn it is,
 * the Act, the hero's one ability of the turn and its statuses do not enter
 * into it. The prompt system asks this to decide whether to ask at all, and
 * the answer is checked against it again. Checked in this order:
 *  - 'noTrigger' the hero declares no optional trigger with that id.
 *  - 'locked'    an ultimate, and the hero is below ULT_UNLOCK_LEVEL.
 *  - 'cooldown'  it is still waiting (`hero.cooldowns`).
 *  - 'souls'     `pid` has fewer souls than it costs.
 */
export function triggerBlocked(G: GameState, pid: PlayerID, hero: CardInstance, abilityId: AbilityId): TriggerBlock | null {
  if (!optionalTriggers(hero).some((a) => a.id === abilityId)) return 'noTrigger';
  if (resolveSkill(hero, abilityId)?.kind === 'ult' && (hero.level ?? 1) < ULT_UNLOCK_LEVEL) return 'locked';
  if ((hero.cooldowns?.[abilityId] ?? 0) > 0) return 'cooldown';
  if (G.players[pid].souls < triggerPrice(hero, abilityId)) return 'souls';
  return null;
}

/** Why an answer to the trigger prompt cannot be given now, or null when it
 *  can: a prompt is owed (`G.triggers`, the last asked); a pass is always an
 *  answer; a use names one of its offers, which its player can still use
 *  (`triggerBlocked`). Whose prompt it is comes from the prompt, so either
 *  seat may give the answer, as with a promotion. */
export function answerBlocked(G: GameState, a: { type: 'passTrigger' } | { type: 'useTrigger'; heroIid: string; abilityId: AbilityId }): TriggerBlock | null {
  const owed = promptOwed(G);
  if (!owed) return 'notOwed';
  if (a.type === 'passTrigger') return null;
  if (!owed.offers.some((o) => o.heroIid === a.heroIid && o.abilityId === a.abilityId)) return 'noOffer';
  const hero = findCardOnBoard(G, a.heroIid)?.card;
  if (!hero) return 'noHero';
  return triggerBlocked(G, owed.pid, hero, a.abilityId);
}

// ---------- Active items ----------

export type ActivateBlock = 'noItem' | 'passive' | 'actOver' | 'down' | 'used' | 'status' | 'charges' | 'cooldown' | 'target';

/** What the active item `item`, worn by `bearer`, may be aimed at: the live
 *  board cards its first ability's filter allows (as the card it was always
 *  read from), or 'none' for one that takes no target. A passive item has []. */
export function activateTargets(G: GameState, pid: PlayerID, item: CardInstance, bearer: CardInstance): CardInstance[] | 'none' {
  const data = itemCard(item.cardId);
  if (data?.type !== 'spell') return [];
  const filter = getAbility(data.abilities[0])?.target ?? 'noTarget';
  if (filter === 'noTarget') return 'none';
  return targetsFor(G, pid, filter, bearer);
}

/**
 * Why `pid` cannot use the active item `itemIid` right now, or null when it
 * can: an item one of its heroes in a slot wears, an active one, in a turn
 * whose attack has not ended the Act, its bearer standing, not yet having used
 * its one ability this turn (skill, item and ultimate share it), free of the
 * statuses that lock abilities, the item ready — off cooldown, or for hard
 * crowd control with a charge left — and a legal target. Whose turn it is, and
 * the step, are the caller's question (`blocked`). Checked in this order:
 *  - 'noItem'   no hero of `pid` in a slot wears it.
 *  - 'passive'  it is a passive item: nothing to use.
 *  - 'actOver'  the turn's attack has been made: it ends the Act.
 *  - 'down'     its bearer is a corpse on the respawn timer.
 *  - 'used'     its bearer has used an ability this turn.
 *  - 'status'   a status locks its bearer's abilities (`isBlocked(…, 'skill')`).
 *  - 'charges'  hard crowd control with no charge left this match.
 *  - 'cooldown' it is still cooling down.
 *  - 'target'   nothing legal to aim it at — or `targetIid` is not.
 */
export function activateBlocked(G: GameState, pid: PlayerID, itemIid: string, targetIid?: string): ActivateBlock | null {
  const worn = findWornItem(G, itemIid, pid);
  if (!worn) return 'noItem';
  const { bearer, item } = worn;
  const data = itemCard(item.cardId);
  if (data?.type !== 'spell') return 'passive';
  if (G.attackUsed) return 'actOver';
  if (isRespawning(bearer)) return 'down';
  if (bearer.skillUsedThisTurn) return 'used';
  if (isBlocked(bearer, 'skill')) return 'status';
  if (data.hardCC) {
    if ((item.charges ?? 0) <= 0) return 'charges';
  } else if (itemCooldown(item) > 0) return 'cooldown';
  const targets = activateTargets(G, pid, item, bearer);
  if (targets === 'none') return null;
  if (targetIid === undefined) return targets.length > 0 ? null : 'target';
  return targets.some((t) => t.iid === targetIid) ? null : 'target';
}

// ---------- The hand ----------

/** `pid`'s hero in a slot (the Active or a bench hero, standing or on the
 *  respawn timer) with this iid. */
function slottedHero(G: GameState, pid: PlayerID, heroIid: string): CardInstance | undefined {
  const found = findCardOnBoard(G, heroIid);
  return found && found.owner === pid ? found.card : undefined;
}

/** The worn item an upgrade played onto `hero` evolves: the component it
 *  upgrades from (`upgradesFrom`), when the hero wears it. It takes that
 *  item's place, and costs the difference. */
export function upgradeComponent(hero: CardInstance, itemId: CardId): CardInstance | undefined {
  const from = itemCard(itemId)?.upgradesFrom;
  return from ? wornItems(hero).find((it) => it.cardId === from) : undefined;
}

/** Souls putting the item `itemId` on `hero` costs: its price (`PRICE` by
 *  tier) — or, an upgrade onto the hero wearing its component (it evolves,
 *  taking that item's place), the difference, as in Deadlock. */
export function playCost(hero: CardInstance, itemId: CardId): number {
  const comp = upgradeComponent(hero, itemId);
  return Math.max(0, itemPrice(itemId) - (comp ? itemPrice(comp.cardId) : 0));
}

/** Why the hand and the board are shut to `pid` now: not its turn (the draft
 *  and the opening included). */
function turnShut(G: GameState, pid: PlayerID): 'notYourTurn' | null {
  return G.draft || seatToMove(G) !== pid ? 'notYourTurn' : null;
}

export type PlayBlock = 'notYourTurn' | 'notInHand' | 'hero' | 'noHero' | 'duplicate' | 'full' | 'souls' | 'upgrade';

/**
 * Why `pid` cannot put the item `cardIid` from its hand on its hero `heroIid`
 * right now, or null when it can. It costs `playCost` souls (an upgrade onto
 * the hero wearing its component evolves it for the difference) and is not the
 * hero's ability for the turn. `upgradeId`, when given, is the upgrade the play
 * makes (`upgradesOf`: the player picks one when there are several); it must be
 * one of them. Checked in this order:
 *  - 'notYourTurn' it is not `pid`'s turn (the draft included).
 *  - 'notInHand'   no card in `pid`'s hand has that iid.
 *  - 'hero'        the card is a hero: it goes on the bench (`placeHero`).
 *  - 'noHero'      no hero of `pid` in a slot has that iid (bench and corpses count).
 *  - 'duplicate'   the hero already wears one.
 *  - 'full'        the hero's slots are full (`slotCap`) and the card is no
 *                  upgrade of an item the hero wears (which takes its place).
 *  - 'souls'       `pid` has fewer souls than it costs.
 *  - 'upgrade'     `upgradeId` names no upgrade of the card.
 */
export function playBlocked(G: GameState, pid: PlayerID, cardIid: string, heroIid: string, upgradeId?: CardId): PlayBlock | null {
  const shut = turnShut(G, pid);
  if (shut) return shut;
  const card = handCard(G, pid, cardIid);
  if (!card) return 'notInHand';
  if (!itemCard(card.cardId)) return 'hero';
  const hero = slottedHero(G, pid, heroIid);
  if (!hero) return 'noHero';
  if (wornItems(hero).some((it) => it.cardId === card.cardId)) return 'duplicate';
  if (!upgradeComponent(hero, card.cardId) && wornItems(hero).length >= slotCap(G, pid)) return 'full';
  if (G.players[pid].souls < playCost(hero, card.cardId)) return 'souls';
  if (upgradeId !== undefined && !upgradesOf(card.cardId).includes(upgradeId)) return 'upgrade';
  return null;
}

/** The heroes `pid` could put its card `cardIid` on right now, in board order
 *  (the Active, then the bench): those `playBlocked` lets it go on. */
export function playTargets(G: GameState, pid: PlayerID, cardIid: string): CardInstance[] {
  return slottedHeroes(G.players[pid]).filter((h) => playBlocked(G, pid, cardIid, h.iid) === null);
}

/** The bench slot (1..3) a hero from `ps`'s hand goes into: the first empty
 *  one that no riding Rem will come back to; undefined when there is none. */
export function freeBenchSlot(ps: PlayerState): 1 | 2 | 3 | undefined {
  const reserved = new Set(heroesOf(ps).filter((h) => h.remMergeTurnsLeft != null).map((h) => h.slot));
  const i = ps.bench.findIndex((b, k) => b == null && !reserved.has((k + 1) as 1 | 2 | 3));
  return i < 0 ? undefined : ((i + 1) as 1 | 2 | 3);
}

export type PlaceBlock = 'notYourTurn' | 'notInHand' | 'notHero' | 'occupied' | 'benchOnly' | 'benchFull' | 'badSlot' | 'slotTaken';

/** The bench slots a hero from `ps`'s hand may go into now: the empty ones
 *  no riding Rem will come back to. */
export function freeBenchSlots(ps: PlayerState): (1 | 2 | 3)[] {
  const reserved = new Set(heroesOf(ps).filter((h) => h.remMergeTurnsLeft != null).map((h) => h.slot));
  return ps.bench.flatMap((b, k) => (b == null && !reserved.has((k + 1) as 1 | 2 | 3) ? [(k + 1) as 1 | 2 | 3] : []));
}

/**
 * Why `pid` cannot put the hero `cardIid` from its hand on the board right
 * now, or null when it can: into the bench slot `slot` (1-3), or its first
 * free one (`freeBenchSlot`) when none is named, or, `toActive`, straight
 * into an EMPTY Active slot (the lane left open by a fallen Active gone to
 * the hand; `slot` is then ignored). Free. Checked in this order:
 *  - 'notYourTurn' it is not `pid`'s turn.
 *  - 'notInHand'   no card in `pid`'s hand has that iid.
 *  - 'notHero'     the card is an item: it goes on a hero (`playCard`).
 *  - 'occupied'    `toActive`, and the Active slot holds a hero (standing or
 *                  a corpse: a bench hero steps up to a corpse's slot).
 *  - 'benchOnly'   `toActive`, and the hero never takes the Active slot
 *                  (`flags.benchOnly`; no card sets it now).
 *  - 'badSlot'     `slot` is no bench slot (not 1, 2 or 3).
 *  - 'slotTaken'   `slot` holds a hero (standing or a corpse), or a riding Rem
 *                  will come back to it.
 *  - 'benchFull'   no bench slot is free (three heroes on the bench).
 */
export function placeHeroBlocked(G: GameState, pid: PlayerID, cardIid: string, toActive = false, slot?: unknown): PlaceBlock | null {
  const shut = turnShut(G, pid);
  if (shut) return shut;
  const card = handCard(G, pid, cardIid);
  if (!card) return 'notInHand';
  const data = CARDS_BY_ID[card.cardId];
  if (data?.type !== 'hero') return 'notHero';
  const ps = G.players[pid];
  if (toActive) {
    if (ps.active) return 'occupied';
    if (data.flags?.benchOnly) return 'benchOnly';
    return null;
  }
  if (slot !== undefined) {
    if (slot !== 1 && slot !== 2 && slot !== 3) return 'badSlot';
    return freeBenchSlots(ps).includes(slot) ? null : 'slotTaken';
  }
  return freeBenchSlot(ps) === undefined ? 'benchFull' : null;
}

export type ChooseActiveBlock = 'notOwed' | 'notInDeck' | 'notHero' | 'benchOnly';

/** The heroes `pid` may open with: the drafted heroes in its deck that may
 *  stand in the lane (not bench-only), in deck order. */
export function openingCandidates(G: GameState, pid: PlayerID): CardInstance[] {
  return G.players[pid].deck.filter((c) => {
    const d = CARDS_BY_ID[c.cardId];
    return d?.type === 'hero' && !d.flags?.benchOnly;
  });
}

/** Why the hero `cardIid` cannot be put in the lane as its side's first
 *  Active now, or null when it can: the match's opening owes that side its
 *  Active (`G.pendingActive`), and the card is a hero in that side's deck
 *  (its drafted four) that may stand there (not bench-only). Whose deck it
 *  is comes from the iid, so either seat may ask, like a promotion. */
export function chooseActiveBlocked(G: GameState, cardIid: string): ChooseActiveBlock | null {
  const pid = G.pendingActive;
  if (!pid) return 'notOwed';
  const card = G.players[pid].deck.find((c) => c.iid === cardIid);
  if (!card) return 'notInDeck';
  const data = CARDS_BY_ID[card.cardId];
  if (data?.type !== 'hero') return 'notHero';
  if (data.flags?.benchOnly) return 'benchOnly';
  return null;
}

export type DiscardBlock = 'notOwed' | 'none' | 'tooMany' | 'repeat' | 'notInHand';

/** Why `pid` cannot discard the hand cards `cardIids` now, or null when it
 *  can: a draw card's discard is owed by `pid` (`G.pendingDiscard`), the list
 *  names at least one card and no more than are owed, none twice, each in
 *  `pid`'s hand. */
export function discardBlocked(G: GameState, pid: PlayerID, cardIids: readonly string[]): DiscardBlock | null {
  const owed = G.pendingDiscard;
  if (!owed || owed.pid !== pid) return 'notOwed';
  if (!Array.isArray(cardIids) || cardIids.length === 0) return 'none';
  if (cardIids.length > owed.count) return 'tooMany';
  if (new Set(cardIids).size !== cardIids.length) return 'repeat';
  if (!cardIids.every((iid) => handCard(G, pid, iid))) return 'notInHand';
  return null;
}

// ---------- Moving heroes ----------

/**
 * Souls `pid`'s Retreat costs right now: the retreat printed on the hero
 * leaving the Active slot (`heroRetreat`: 0, 1 or 2 by how mobile it is), less
 * the `retreatDiscount` hooks of what it carries (Sprint Boots, Enduring
 * Speed), and nothing at all while that hero is Swift (Fleetfoot, Willpower) —
 * never below 0, and 0 with nobody in the slot. The one price: `moveBlocked`
 * checks it, `moveHero` charges it, the board prints it and the fuzz oracle
 * checks it. A Retreat spends the Swift (`moveHero`).
 */
export function retreatCost(G: GameState, pid: PlayerID): number {
  const leaving = G.players[pid].active;
  if (!leaving) return 0;
  if (leaving.statuses.some((s) => s.id === 'swift')) return 0;
  return Math.max(0, heroRetreat(leaving) - retreatDiscount(leaving));
}

export type MoveBlock = 'same' | 'actOver' | 'empty' | 'benchOnly' | 'down' | 'rooted' | 'retreated' | 'souls' | 'illegal';

/** Why `pid` cannot swap the heroes in two slots (0 = Active, 1..3 = bench),
 *  or null when they can. Nothing moves once the turn's attack has ended the
 *  Act. A swap trades two OCCUPIED slots: a hole is nobody to trade with (the
 *  Active walking into a hole would leave the lane empty), and slots outside
 *  0..3 are no slots. A bench-only hero (`flags.benchOnly`, which no card sets
 *  now) never takes the Active slot, whichever side of the swap it is on. Swapping the Active with a bench hero
 *  is a Retreat: both must be alive, neither may be Rooted (a status that
 *  blocks 'move', on either side of the swap), the player has not retreated
 *  this turn (one a turn), and it costs `retreatCost` souls. Bench-to-bench
 *  swaps are free, and a Rooted hero may still be moved between bench slots. A
 *  Retreat comes before the attack: the hero who steps in may make it. (The
 *  forced promotion of a fallen Active is not a swap: `promoteBlocked`.) */
export function moveBlocked(G: GameState, pid: PlayerID, fromSlot: number, toSlot: number): MoveBlock | null {
  const isSlot = (s: number) => s === 0 || s === 1 || s === 2 || s === 3;
  if (!isSlot(fromSlot) || !isSlot(toSlot)) return 'illegal';
  if (fromSlot === toSlot) return 'same';
  if (G.attackUsed) return 'actOver';
  const ps = G.players[pid];
  const get = (s: number) => (s === 0 ? ps.active : ps.bench[s - 1]);
  const a = get(fromSlot);
  const b = get(toSlot);
  if (!a || !b) return 'empty';
  if (fromSlot === 0 || toSlot === 0) {
    const incoming = fromSlot === 0 ? b : a; // who takes the Active slot
    const data = CARDS_BY_ID[incoming.cardId];
    if (data?.type === 'hero' && data.flags?.benchOnly) return 'benchOnly';
    if (isRespawning(a) || isRespawning(b)) return 'down';
    if (isBlocked(a, 'move') || isBlocked(b, 'move')) return 'rooted';
    if (G.retreatUsed) return 'retreated';
    if (ps.souls < retreatCost(G, pid)) return 'souls';
  }
  return null;
}

export type PromoteBlock = 'notOnBench' | 'notOwed' | 'down' | 'benchOnly';

/** Why the bench hero `benchIid` cannot step up to a fallen Active's slot
 *  (a corpse's, or empty), or null when it can. Whose bench it is comes from the iid, so either seat may ask
 *  (the AI promotes the owed seat from its own turn). */
export function promoteBlocked(G: GameState, benchIid: string): PromoteBlock | null {
  for (const pid of ['0', '1'] as PlayerID[]) {
    const ps = G.players[pid];
    const benchHero = ps.bench.find((b) => b != null && b.iid === benchIid);
    if (!benchHero) continue;
    // Only valid when the Active slot is empty or a corpse — otherwise use
    // retreat (which costs souls).
    if (!laneOpen(ps)) return 'notOwed';
    // Replacement must be alive (no corpses moving to Active).
    if (isRespawning(benchHero)) return 'down';
    const data = CARDS_BY_ID[benchHero.cardId];
    if (data?.type !== 'hero' || data.flags?.benchOnly) return 'benchOnly';
    return null;
  }
  return 'notOnBench';
}

// ---------- The draft ----------

type DraftBlock = 'noDraft' | 'notYourPick' | 'notInPool';

/** Why `pid` cannot draft `heroId` now: there is a draft, it is their pick,
 *  and the hero is still in the pool. */
export function draftPickBlocked(G: GameState, pid: PlayerID, heroId: string): DraftBlock | null {
  if (!G.draft) return 'noDraft';
  if (G.draft.order[G.draft.currentIndex] !== pid) return 'notYourPick';
  if (!G.draft.pool.includes(heroId)) return 'notInPool';
  return null;
}

// ---------- One question for every action ----------

/**
 * Why `a` cannot be made by `pid` right now, or null when it can — the
 * dispatch `perform` runs before it mutates anything. An action must name a
 * target whenever the ability or item takes one (the per-move functions above
 * also answer the looser "is there some target" when it is left off).
 *
 * Owed choices come first, in this order, and while one is owed it is the only
 * legal action: the opening's first Active (`G.pendingActive`: `chooseActive`
 * for that seat's hand, made from either seat); a trigger prompt (`G.triggers`:
 * `useTrigger` one of its offers or `passTrigger`, made from either seat, on
 * either player's turn); a promotion (`G.pendingPromotion`:
 * a seat's Active has fallen and a bench hero can step up — for that seat's
 * bench, made from either seat), so nothing, the end of the turn included,
 * happens around a corpse in the lane; a draw card's discard
 * (`G.pendingDiscard`: `discard`, by the player who owes it). Once the turn's
 * attack is made ('actOver') nothing is legal but ending the turn and a
 * promotion.
 */
export function blocked(G: GameState, pid: PlayerID, a: Action): string | null {
  if (!G.players[pid]) return 'noPlayer';
  if (G.pendingActive) return a.type === 'chooseActive' ? chooseActiveBlocked(G, a.cardIid) : 'activeOwed';
  if (a.type === 'chooseActive') return chooseActiveBlocked(G, a.cardIid);
  // A trigger prompt owed (prompts.ts) is answered before anything else, from either seat.
  if (promptOwed(G)) return a.type === 'useTrigger' || a.type === 'passTrigger' ? answerBlocked(G, a) : 'triggerOwed';
  if (a.type === 'useTrigger' || a.type === 'passTrigger') return 'notOwed';
  if (G.pendingPromotion) {
    if (a.type !== 'promoteToActive') return 'promotionOwed';
    const owed = G.players[G.pendingPromotion].bench.some((b) => b != null && b.iid === a.benchIid);
    if (!owed) return 'promotionOwed';
  }
  if (G.pendingDiscard && a.type !== 'discard' && a.type !== 'promoteToActive') return 'discardOwed';
  if (G.attackUsed && a.type !== 'endTurn' && a.type !== 'promoteToActive' && a.type !== 'attack') return 'actOver';
  switch (a.type) {
    case 'attack':
      return G.draft ? 'draft' : attackBlocked(G, pid, a.targetIid);
    case 'useSkill': {
      const found = findCardOnBoard(G, a.heroIid);
      if (!found || found.owner !== pid) return 'noHero';
      const why = skillBlocked(G, pid, found.card, a.targetIid, a.skillId);
      if (why) return why;
      return a.targetIid === undefined && skillTargets(G, pid, found.card, a.skillId) !== 'none' ? 'target' : null;
    }
    case 'activate': {
      const why = activateBlocked(G, pid, a.itemIid, a.targetIid);
      if (why) return why;
      const { item, bearer } = findWornItem(G, a.itemIid, pid)!;
      return a.targetIid === undefined && activateTargets(G, pid, item, bearer) !== 'none' ? 'target' : null;
    }
    case 'moveHero':
      return moveBlocked(G, pid, a.fromSlot, a.toSlot);
    case 'promoteToActive':
      return promoteBlocked(G, a.benchIid);
    case 'playCard':
      return playBlocked(G, pid, a.cardIid, a.heroIid, a.upgradeId);
    case 'placeHero':
      return placeHeroBlocked(G, pid, a.cardIid, a.toActive === true, a.slot);
    case 'discard':
      return discardBlocked(G, pid, a.cardIids);
    case 'endTurn':
      return G.draft ? 'draft' : null;
    default:
      return 'unknown';
  }
}

/**
 * Every action `pid` could make right now. While a choice is owed, that
 * choice alone: the opening's first Active (each drafted hero in the owing
 * seat's deck that may stand there), a trigger prompt (each offer, then the pass,
 * from either seat), a promotion (either seat's: `pid` may promote
 * the seat that owes one), or a draw card's discard (each card of the hand,
 * one at a time — a `discard` move may name several at once, up to what is
 * owed). Otherwise: the Active's attack, if open — once per
 * hero it may swing at (`attackTargets`), the first as the bare action (a bare
 * `attack` swings at it) and any others naming theirs; each living hero's
 * active items, in board and worn order, each on each of its targets; each
 * living hero's kit abilities (`kitAbilityIds`: its skill, its ultimate), in
 * board order and the kit's own order, each on each of
 * its targets (every action names its `skillId`); retreats from the bench in
 * `stepInCandidates` order (before the attack: the hero who steps in may make
 * it); each item in its hand put on each hero it may go on (one action per
 * upgrade it could make, when it could make several); each hero in its hand
 * put straight into an empty Active slot, on the bench (its first free slot),
 * and into each free bench slot by number (the hand's plays only on `pid`'s
 * own turn). Then promotions
 * and ending the turn last. Everything listed passes `blocked`, so once the
 * attack is made only the end of the turn is left.
 */
export function legalActions(G: GameState, pid: PlayerID): Action[] {
  const ps = G.players[pid];
  const out: Action[] = [];
  const offer = (a: Action) => { if (blocked(G, pid, a) === null) out.push(a); };

  if (G.pendingActive) {
    for (const c of openingCandidates(G, G.pendingActive)) offer({ type: 'chooseActive', cardIid: c.iid });
    return out;
  }
  // A trigger prompt owed: its offers, then the pass — from either seat.
  const prompt = promptOwed(G);
  if (prompt) {
    for (const o of prompt.offers) offer({ type: 'useTrigger', heroIid: o.heroIid, abilityId: o.abilityId });
    offer({ type: 'passTrigger' });
    return out;
  }
  if (G.pendingDiscard) {
    if (G.pendingDiscard.pid === pid) for (const c of ps.hand) offer({ type: 'discard', cardIids: [c.iid] });
  } else if (!G.draft) {
    // The hand's plays are `pid`'s own turn's (`blocked` says notYourTurn
    // otherwise); the board's moves are listed as `blocked` judges them.
    attackTargets(G, pid).forEach((t, i) => offer(i === 0 ? { type: 'attack' } : { type: 'attack', targetIid: t.iid }));

    for (const hero of liveBoardCards(ps)) {
      for (const item of wornActives(hero)) {
        const targets = activateTargets(G, pid, item, hero);
        if (targets === 'none') { offer({ type: 'activate', itemIid: item.iid }); continue; }
        for (const t of targets) offer({ type: 'activate', itemIid: item.iid, targetIid: t.iid });
      }
    }

    for (const hero of liveBoardCards(ps)) {
      for (const skillId of kitAbilityIds(hero)) {
        const targets = skillTargets(G, pid, hero, skillId);
        if (targets === 'none') { offer({ type: 'useSkill', heroIid: hero.iid, skillId }); continue; }
        for (const t of targets) offer({ type: 'useSkill', heroIid: hero.iid, skillId, targetIid: t.iid });
      }
    }

    for (const b of stepInCandidates(ps)) offer({ type: 'moveHero', fromSlot: (ps.bench.indexOf(b) + 1) as 1 | 2 | 3, toSlot: 0 });

    const heroes = slottedHeroes(ps);
    for (const card of ps.hand) {
      if (itemCard(card.cardId)) {
        const ups = upgradesOf(card.cardId);
        for (const h of heroes) {
          if (ups.length > 1) for (const u of ups) offer({ type: 'playCard', cardIid: card.iid, heroIid: h.iid, upgradeId: u });
          else offer({ type: 'playCard', cardIid: card.iid, heroIid: h.iid });
        }
      } else {
        offer({ type: 'placeHero', cardIid: card.iid, toActive: true });
        offer({ type: 'placeHero', cardIid: card.iid });
        for (const slot of freeBenchSlots(ps)) offer({ type: 'placeHero', cardIid: card.iid, slot });
      }
    }
  }
  // A promotion may be made for either seat: the one owed is on the other side of the table
  // when its Active fell to this seat's attack.
  for (const seat of ['0', '1'] as PlayerID[]) {
    for (const b of stepInCandidates(G.players[seat])) offer({ type: 'promoteToActive', benchIid: b.iid });
  }

  offer({ type: 'endTurn' });
  return out;
}
