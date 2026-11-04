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
import type { AbilityId, CardId, CardInstance, GameState, PlayerID } from './types';
import { CARDS_BY_ID, itemCard } from '@/cards';
import type { Action } from './engine';
import { getAbility } from './registry';
import { RETREAT_COST, ULT_UNLOCK_LEVEL } from './constants';
import {
  attackPower, boughtAtDiscount, copiesOnSide, findCardOnBoard, findWornItem, handCard, hasReach, heroesOf, isBlocked, isRespawning,
  isUntargetable, itemCooldown, itemPrice, kitAbilityIds, liveBoardCards, otherPlayer, resolveSkill, retreatDiscount,
  slotCap, slottedHeroes, standingBoss, stepInCandidates, targetsFor, wornActives, wornItems,
} from './query';
import { marketItems, onSale } from './market';
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

export type SkillBlock = 'noSkill' | 'actOver' | 'down' | 'locked' | 'used' | 'status' | 'cooldown' | 'hp' | 'target';

/** What one of a hero's kit abilities may be aimed at (`skillId` names it —
 *  a skill, its ultimate or a borrowed ultimate; left out, the hero's first
 *  skill): the live board cards its filter allows (minus the caster, for an
 *  ability that says `excludeSelf`), or 'none' for one that takes no target.
 *  No such ability gives []. */
export function skillTargets(G: GameState, pid: PlayerID, hero: CardInstance, skillId?: AbilityId): CardInstance[] | 'none' {
  const skill = resolveSkill(hero, skillId);
  if (!skill) return [];
  const { ability } = skill;
  if (ability.target === 'noTarget') return 'none';
  const targets = targetsFor(G, pid, ability.target, hero);
  return ability.excludeSelf ? targets.filter((t) => t.iid !== hero.iid) : targets;
}

/**
 * Why `hero` cannot use one of its kit abilities right now, or null when it
 * can: a hero with that ability (`skillId`: a skill, its ultimate or a borrowed
 * ultimate; left out, its first skill), in a turn whose attack has not ended
 * the Act, alive, its ultimate unlocked, that has not used an ability this turn
 * (one per hero per turn, skill and ultimate alike), free of the statuses that
 * lock it, with the ability off cooldown and a legal target. Abilities cost no
 * souls. Whose turn it is, is the caller's question. Checked in this order:
 *  - 'noSkill'  the hero has no such ability.
 *  - 'actOver'  the turn's attack has been made: it ends the Act.
 *  - 'down'     it is a corpse on the respawn timer.
 *  - 'locked'   it is the hero's ultimate and the hero is below ULT_UNLOCK_LEVEL.
 *  - 'used'     it has used an ability this turn (any of its kit).
 *  - 'status'   a status locks its abilities (`isBlocked(hero, 'skill')`).
 *  - 'cooldown' this ability is still cooling down (`hero.cooldowns`).
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
  if (G.attackUsed) return 'actOver';
  if (isRespawning(hero)) return 'down';
  if (skill.kind === 'ult' && (hero.level ?? 1) < ULT_UNLOCK_LEVEL) return 'locked';
  if (hero.skillUsedThisTurn) return 'used';
  if (isBlocked(hero, 'skill')) return 'status';
  if ((hero.cooldowns?.[skill.id] ?? 0) > 0) return 'cooldown';
  if (skill.ability.hpCost && hero.hp <= skill.ability.hpCost) return 'hp';
  const targets = skillTargets(G, pid, hero, skill.id);
  if (targets === 'none') return null;
  if (targetIid === undefined) return targets.length > 0 ? null : 'target';
  return targets.some((t) => t.iid === targetIid) ? null : 'target';
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

// ---------- The shop and the hand ----------

export type ShopBlock = 'notYourTurn' | 'notShop' | 'noItem' | 'notOnSale' | 'souls' | 'notOwned' | 'claimed' | 'notWorn' | 'noHero' | 'same' | 'duplicate' | 'full';

/** Why the shop is shut to `pid`: not its turn (the draft included), or its
 *  turn is past the shop step. */
function shopShut(G: GameState, pid: PlayerID): 'notYourTurn' | 'notShop' | null {
  if (G.draft || seatToMove(G) !== pid) return 'notYourTurn';
  if (G.step !== 'shop') return 'notShop';
  return null;
}

/** `pid`'s hero in a slot (the Active or a bench hero, standing or on the
 *  respawn timer) with this iid. */
function slottedHero(G: GameState, pid: PlayerID, heroIid: string): CardInstance | undefined {
  const found = findCardOnBoard(G, heroIid);
  return found && found.owner === pid ? found.card : undefined;
}

/** The worn item an upgrade played onto `hero` takes the place of: the
 *  component it upgrades from (`upgradesFrom`), when the hero wears it. */
export function upgradeComponent(hero: CardInstance, itemId: CardId): CardInstance | undefined {
  const from = itemCard(itemId)?.upgradesFrom;
  return from ? wornItems(hero).find((it) => it.cardId === from) : undefined;
}

/** How many of `pid`'s copies of the item `componentId` are free to price an
 *  upgrade at the difference: the copies on its side (`copiesOnSide`: in its
 *  hand, or worn by one of its heroes) less the upgrades of it in its hand
 *  already bought for the difference — each of those will consume a copy when
 *  it is played. */
export function freeComponents(G: GameState, pid: PlayerID, componentId: CardId): number {
  const claimed = G.players[pid].hand.filter((c) => boughtAtDiscount(c) && itemCard(c.cardId)?.upgradesFrom === componentId).length;
  return copiesOnSide(G, pid, componentId).length - claimed;
}

/** Souls `pid` pays for `itemId`: its price, or — an upgrade whose component
 *  is on its side (worn by one of its heroes or in its hand) and not already
 *  spoken for by another upgrade in its hand — the difference. */
export function buyPrice(G: GameState, pid: PlayerID, itemId: CardId): number {
  const from = itemCard(itemId)?.upgradesFrom;
  const off = from && freeComponents(G, pid, from) > 0 ? itemPrice(from) : 0;
  return Math.max(0, itemPrice(itemId) - off);
}

/** Souls selling `item` (in the hand or worn) brings back: what was paid for
 *  it when it was bought this turn, else half its price, rounded down. */
export function sellRefund(G: GameState, item: CardInstance): number {
  if (item.boughtOnTurn === G.turnNumber) return item.paid ?? itemPrice(item.cardId);
  return Math.floor(itemPrice(item.cardId) / 2);
}

/**
 * Why `pid` cannot buy `itemId` right now, or null when it can. The card goes
 * to the hand: no hero is chosen at the shop. Checked in this order:
 *  - 'notYourTurn' it is not `pid`'s turn.
 *  - 'notShop'   the shop step is over (`closeShop`).
 *  - 'noItem'    no item has that id.
 *  - 'notOnSale' this match's market does not sell it.
 *  - 'souls'     `pid` has fewer souls than `buyPrice`.
 */
export function buyBlocked(G: GameState, pid: PlayerID, itemId: CardId): ShopBlock | null {
  const shut = shopShut(G, pid);
  if (shut) return shut;
  if (!itemCard(itemId)) return 'noItem';
  if (!onSale(G, itemId)) return 'notOnSale';
  if (G.players[pid].souls < buyPrice(G, pid, itemId)) return 'souls';
  return null;
}

/** `pid`'s card with this iid: in its hand, or worn by one of its heroes in a slot. */
function ownedItem(G: GameState, pid: PlayerID, iid: string): CardInstance | undefined {
  return handCard(G, pid, iid) ?? findWornItem(G, iid, pid)?.item;
}

/** Why `pid` cannot sell its card `itemIid` now: the shop is shut to it; it
 *  holds no such card in its hand and none of its heroes in a slot wears it
 *  ('notOwned'); or it is the last free copy of a component an upgrade in its
 *  hand was bought for the difference against ('claimed': that upgrade will
 *  consume it — play or sell the upgrade first). */
export function sellBlocked(G: GameState, pid: PlayerID, itemIid: string): ShopBlock | null {
  const shut = shopShut(G, pid);
  if (shut) return shut;
  const item = ownedItem(G, pid, itemIid);
  if (!item) return 'notOwned';
  if (freeComponents(G, pid, item.cardId) <= 0) return 'claimed';
  return null;
}

/** Why `pid` cannot move its item `itemIid` to its hero `toHeroIid` now: the
 *  shop is shut, it wears no such item ('notWorn': a card in the hand is
 *  played, not moved), no such hero ('noHero'), the item is already there
 *  ('same'), the hero wears one ('duplicate'), or its slots are full ('full'). */
export function moveItemBlocked(G: GameState, pid: PlayerID, itemIid: string, toHeroIid: string): ShopBlock | null {
  const shut = shopShut(G, pid);
  if (shut) return shut;
  const worn = findWornItem(G, itemIid, pid);
  if (!worn) return 'notWorn';
  const to = slottedHero(G, pid, toHeroIid);
  if (!to) return 'noHero';
  if (to.iid === worn.bearer.iid) return 'same';
  if (wornItems(to).some((it) => it.cardId === worn.item.cardId)) return 'duplicate';
  if (wornItems(to).length >= slotCap(G, pid)) return 'full';
  return null;
}

/** Why `pid` cannot close the shop now: it is not its turn, or it is closed. */
export function closeShopBlocked(G: GameState, pid: PlayerID): ShopBlock | null {
  return shopShut(G, pid);
}

export type PlayBlock = 'notYourTurn' | 'notInHand' | 'noHero' | 'duplicate' | 'full';

/**
 * Why `pid` cannot play its card `cardIid` from the hand onto its hero
 * `heroIid` right now, or null when it can. Placing your own card is free and
 * is no shopping: it is legal in the shop step and in the act step (the step
 * and the end of the Act are `blocked`'s to say), and it is not the hero's
 * ability for the turn. Checked in this order:
 *  - 'notYourTurn' it is not `pid`'s turn (the draft included).
 *  - 'notInHand'   no card in `pid`'s hand has that iid.
 *  - 'noHero'      no hero of `pid` in a slot has that iid (bench and corpses count).
 *  - 'duplicate'   the hero already wears one.
 *  - 'full'        the hero's slots are full (`slotCap`) and the card is no
 *                  upgrade of an item the hero wears (which takes its place).
 */
export function playBlocked(G: GameState, pid: PlayerID, cardIid: string, heroIid: string): PlayBlock | null {
  if (G.draft || seatToMove(G) !== pid) return 'notYourTurn';
  const card = handCard(G, pid, cardIid);
  if (!card) return 'notInHand';
  const hero = slottedHero(G, pid, heroIid);
  if (!hero) return 'noHero';
  if (wornItems(hero).some((it) => it.cardId === card.cardId)) return 'duplicate';
  if (!upgradeComponent(hero, card.cardId) && wornItems(hero).length >= slotCap(G, pid)) return 'full';
  return null;
}

/** The heroes `pid` could play its card `cardIid` onto right now, in board
 *  order (the Active, then the bench): those `playBlocked` lets it go on. */
export function playTargets(G: GameState, pid: PlayerID, cardIid: string): CardInstance[] {
  return slottedHeroes(G.players[pid]).filter((h) => playBlocked(G, pid, cardIid, h.iid) === null);
}

/** What an upgrade played onto a hero consumes, and where from. */
export interface TakenComponent {
  item: CardInstance;
  /** The hero that wore it; absent when it came from the hand. */
  from?: CardInstance;
}

/**
 * The component the card `card` consumes when it is played onto `hero` (left
 * out: when it is settled as another upgrade's component), or undefined when
 * it consumes none and goes on as a plain item: the copy `hero` wears; else a
 * copy in `pid`'s hand (one bought at full price first); else — a card bought
 * for the difference, whose price counted on a copy — the copy another of
 * `pid`'s heroes wears (`heroesOf`: a merged Rem's too). A card that upgrades
 * nothing consumes nothing.
 */
export function playComponent(G: GameState, pid: PlayerID, card: CardInstance, hero?: CardInstance): TakenComponent | undefined {
  const from = itemCard(card.cardId)?.upgradesFrom;
  if (!from) return undefined;
  const worn = hero && wornItems(hero).find((it) => it.cardId === from);
  if (worn) return { item: worn, from: hero };
  const held = G.players[pid].hand.filter((c) => c !== card && c.cardId === from);
  const inHand = held.find((c) => !boughtAtDiscount(c)) ?? held[0];
  if (inHand) return { item: inHand };
  if (!boughtAtDiscount(card)) return undefined;
  for (const h of heroesOf(G.players[pid])) {
    if (h === hero) continue;
    const it = wornItems(h).find((x) => x.cardId === from);
    if (it) return { item: it, from: h };
  }
  return undefined;
}

// ---------- Moving heroes ----------

/**
 * Souls `pid`'s Retreat costs right now: RETREAT_COST, less the `retreatDiscount`
 * hooks of what the hero leaving the Active slot carries (Sprint Boots, Enduring
 * Speed), and nothing at all while that hero is Swift (Fleetfoot) — never below
 * 0. The one price: `moveBlocked` checks it, `moveHero` charges it, the board
 * prints it and the fuzz oracle checks it. A Retreat spends the Swift
 * (`moveHero`).
 */
export function retreatCost(G: GameState, pid: PlayerID): number {
  const leaving = G.players[pid].active;
  if (!leaving) return RETREAT_COST;
  if (leaving.statuses.some((s) => s.id === 'swift')) return 0;
  return Math.max(0, RETREAT_COST - retreatDiscount(leaving));
}

export type MoveBlock = 'same' | 'actOver' | 'empty' | 'benchOnly' | 'down' | 'rooted' | 'retreated' | 'souls' | 'illegal';

/** Why `pid` cannot swap the heroes in two slots (0 = Active, 1..3 = bench),
 *  or null when they can. Nothing moves once the turn's attack has ended the
 *  Act. A swap trades two OCCUPIED slots: a hole is nobody to trade with (the
 *  Active walking into a hole would leave the lane empty), and slots outside
 *  0..3 are no slots. A bench-only hero (Rem) never takes the Active slot,
 *  whichever side of the swap she is on. Swapping the Active with a bench hero
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

/** Why the bench hero `benchIid` cannot step up to a fallen Active, or null
 *  when it can. Whose bench it is comes from the iid, so either seat may ask
 *  (the AI promotes the owed seat from its own turn). */
export function promoteBlocked(G: GameState, benchIid: string): PromoteBlock | null {
  for (const pid of ['0', '1'] as PlayerID[]) {
    const ps = G.players[pid];
    const benchHero = ps.bench.find((b) => b != null && b.iid === benchIid);
    if (!benchHero) continue;
    // Only valid when the Active is a corpse — otherwise use retreat (which costs souls).
    if (!ps.active || !isRespawning(ps.active)) return 'notOwed';
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

/** The moves of the shop step. */
const SHOP_MOVES: ReadonlySet<Action['type']> = new Set(['buy', 'sell', 'moveItem', 'closeShop']);
/** The moves legal in either step: placing a card from the hand, ending the
 *  turn, an owed promotion. */
const ANY_STEP_MOVES: ReadonlySet<Action['type']> = new Set(['playCard', 'endTurn', 'promoteToActive']);

/** Why `a` cannot be made by `pid` right now, or null when it can — the
 *  dispatch `perform` runs before it mutates anything. An action must name a
 *  target whenever the ability or item takes one (the per-move functions above
 *  also answer the looser "is there some target" when it is left off).
 *
 *  While a promotion is owed (`G.pendingPromotion`: a seat's Active has fallen
 *  and a bench hero can step up) the only legal action is that promotion — for
 *  that seat's bench, made from either seat — so nothing, the end of the turn
 *  included, happens around a corpse in the lane. The turn's two steps split
 *  the rest: in the shop step only the shop's moves (`buy`, `sell`, `moveItem`,
 *  `closeShop`, for the player whose turn it is) are legal, in the act step
 *  everything else ('shopOpen' / 'notShop'). Placing a card from the hand
 *  (`playCard`) and `endTurn` are legal in either. Once the turn's attack is
 *  made ('actOver') nothing is legal but ending the turn and a promotion. */
export function blocked(G: GameState, pid: PlayerID, a: Action): string | null {
  if (!G.players[pid]) return 'noPlayer';
  if (G.pendingPromotion) {
    if (a.type !== 'promoteToActive') return 'promotionOwed';
    const owed = G.players[G.pendingPromotion].bench.some((b) => b != null && b.iid === a.benchIid);
    if (!owed) return 'promotionOwed';
  }
  if (G.attackUsed && a.type !== 'endTurn' && a.type !== 'promoteToActive' && a.type !== 'attack') return 'actOver';
  if (!G.draft && G.step === 'shop' && !SHOP_MOVES.has(a.type) && !ANY_STEP_MOVES.has(a.type)) return 'shopOpen';
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
    case 'buy':
      return buyBlocked(G, pid, a.itemId);
    case 'playCard':
      return playBlocked(G, pid, a.cardIid, a.heroIid);
    case 'sell':
      return sellBlocked(G, pid, a.itemIid);
    case 'moveItem':
      return moveItemBlocked(G, pid, a.itemIid, a.toHeroIid);
    case 'closeShop':
      return closeShopBlocked(G, pid);
    case 'endTurn':
      return null;
    default:
      return 'unknown';
  }
}

/**
 * Every action `pid` could make right now. In the shop step of its turn: each
 * item on sale it can pay for, in market order; each card in its hand sold,
 * and each worn item sold and moved to each other hero; each card in its hand
 * played onto each hero it may go on; closing the shop. In the act step: the
 * Active's attack, if open — once per hero it may swing
 * at (`attackTargets`), the first as the bare action (a bare `attack` swings
 * at it) and any others naming theirs; each living hero's active items, in
 * board and worn order, each on each of its targets; each living hero's kit
 * abilities (`kitAbilityIds`: its skills, its ultimate, a borrowed ultimate),
 * in board order and the kit's own order, each on each of its targets (every
 * action names its `skillId`); retreats from the bench in `stepInCandidates`
 * order (before the attack: the hero who steps in may make it); each card in
 * its hand played onto each hero it may go on. Then, in either step, promotions (either seat's: `pid` may promote the seat that owes
 * one) and ending the turn last. Everything listed passes `blocked`, so while
 * a promotion is owed that is all there is, and once the attack is made only
 * the end of the turn is left.
 */
export function legalActions(G: GameState, pid: PlayerID): Action[] {
  const ps = G.players[pid];
  const out: Action[] = [];
  const offer = (a: Action) => { if (blocked(G, pid, a) === null) out.push(a); };

  const heroes = slottedHeroes(ps);
  const plays = () => {
    for (const card of ps.hand) for (const h of heroes) offer({ type: 'playCard', cardIid: card.iid, heroIid: h.iid });
  };
  if (G.step === 'shop') {
    if (!G.draft && seatToMove(G) === pid) {
      for (const itemId of marketItems(G)) offer({ type: 'buy', itemId });
      for (const card of ps.hand) offer({ type: 'sell', itemIid: card.iid });
      for (const h of heroes) {
        for (const it of wornItems(h)) {
          offer({ type: 'sell', itemIid: it.iid });
          for (const to of heroes) if (to !== h) offer({ type: 'moveItem', itemIid: it.iid, toHeroIid: to.iid });
        }
      }
      plays();
      offer({ type: 'closeShop' });
    }
  } else {
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
    plays();
  }
  // A promotion may be made for either seat: the one owed is on the other side of the table
  // when its Active fell to this seat's attack.
  for (const seat of ['0', '1'] as PlayerID[]) {
    for (const b of stepInCandidates(G.players[seat])) offer({ type: 'promoteToActive', benchIid: b.iid });
  }

  offer({ type: 'endTurn' });
  return out;
}
