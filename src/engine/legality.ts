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
import type { AbilityId, CardInstance, GameState, PlayerID } from './types';
import { CARDS_BY_ID } from '@/cards';
import type { Action } from './engine';
import { getAbility } from './registry';
import { MAX_EQUIPMENT_PER_HERO, RETREAT_COST, ULT_UNLOCK_LEVEL } from './constants';
import {
  attackPower, findCardOnBoard, hasReach, isBlocked, isRespawning, isUntargetable, kitAbilityIds, liveBoardCards, otherPlayer,
  resolveSkill, retreatDiscount, stepInCandidates, targetsFor, wornEquipment,
} from './query';

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
 *  attack (Dome). Whether the swing would deal anything is a separate question. */
function aimable(G: GameState, pid: PlayerID, active: CardInstance): CardInstance[] {
  let foes: CardInstance[];
  if (hasReach(active)) {
    foes = targetsFor(G, pid, 'enemyHero');
  } else {
    const rival = G.players[otherPlayer(pid)].active;
    foes = rival && !isRespawning(rival) ? [rival] : [];
  }
  return foes.filter((t) => !isUntargetable(t, 'attack'));
}

/**
 * The one list of what `pid`'s Active may swing at this turn: the rival's living
 * Active, or — with reach — every living enemy hero, in `targetsFor` order; never
 * a hero a Dome makes untargetable, and only those the swing would hurt. Empty
 * when the Active cannot attack for any of `attackBlocked`'s reasons. The first
 * of the list is who a bare `attack` swings at; the board, the AI and
 * `legalActions` offer one attack per hero in it.
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
 *                untargetable (a Dome).
 *   - 'target'   `targetIid` names a hero the attack may not be aimed at: not on
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

// ---------- Playing a card ----------

export type PlayBlock = 'notInHand' | 'actOver' | 'souls' | 'target' | 'duplicate' | 'full' | 'discard';

/** Souls a card costs to play: the instance's own override first, else its
 *  printed cost. Heroes and ultimates are never played. */
export function cardCost(card: CardInstance): number {
  const data = CARDS_BY_ID[card.cardId];
  if (data?.type === 'spell' || data?.type === 'equipment') {
    return card.costOverride ?? data.cost ?? 0;
  }
  return 0;
}

/** What a card in hand may be aimed at, or 'none' when there is nothing to
 *  aim: a spell that takes no target. Equipment goes on one of your living
 *  heroes. Anything else (an ultimate card is never held) has no targets. */
export function playTargets(G: GameState, pid: PlayerID, card: CardInstance): CardInstance[] | 'none' {
  const data = CARDS_BY_ID[card.cardId];
  if (data?.type === 'equipment') return targetsFor(G, pid, 'allyHero');
  if (data?.type !== 'spell') return [];
  const filter = getAbility(data.abilities[0])?.target ?? 'noTarget';
  if (filter === 'noTarget') return 'none';
  return targetsFor(G, pid, filter);
}

/**
 * Why `pid` cannot play `cardIid` right now, or null when they can. In hand,
 * before the turn's attack has ended the Act, paid for, and aimed at something
 * legal:
 *  - a spell takes the target its first ability's filter allows (a card that
 *    takes no target ignores one);
 *  - equipment goes on one of your living heroes ('target'), not one that
 *    already wears it ('duplicate'), and a hero at the cap needs a worn item
 *    named to discard — 'full' when none is named, 'discard' when it is not
 *    worn equipment. (A merged Rem is not equipment: she takes no slot and
 *    cannot be named.)
 * Without `targetIid` the question is whether the card is playable on SOME
 * target; a discard is then assumed to be available.
 */
export function playBlocked(
  G: GameState, pid: PlayerID, cardIid: string, targetIid?: string, discardIid?: string,
): PlayBlock | null {
  const card = G.players[pid].hand.find((c) => c.iid === cardIid);
  const data = card && CARDS_BY_ID[card.cardId];
  if (!card || !data) return 'notInHand';
  if (G.attackUsed) return 'actOver';
  if (G.players[pid].souls < cardCost(card)) return 'souls';

  if (data.type === 'spell') {
    const filter = getAbility(data.abilities[0])?.target ?? 'noTarget';
    if (filter === 'noTarget') return null;
    const targets = targetsFor(G, pid, filter);
    if (targetIid === undefined) return targets.length > 0 ? null : 'target';
    return targets.some((t) => t.iid === targetIid) ? null : 'target';
  }

  if (data.type === 'equipment') {
    const heroes = playTargets(G, pid, card) as CardInstance[];
    const wears = (hero: CardInstance) => wornEquipment(hero).some((eq) => eq.cardId === card.cardId);
    if (targetIid === undefined) {
      if (heroes.length === 0) return 'target';
      return heroes.some((h) => !wears(h)) ? null : 'duplicate';
    }
    const hero = heroes.find((h) => h.iid === targetIid);
    if (!hero) return 'target';
    if (wears(hero)) return 'duplicate';
    const worn = wornEquipment(hero);
    if (worn.length >= MAX_EQUIPMENT_PER_HERO) {
      if (!discardIid) return 'full';
      if (!worn.some((eq) => eq.iid === discardIid)) return 'discard';
    }
    return null;
  }

  return 'target'; // a hero or an ultimate card has nothing to aim at and nowhere to go
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

// ---------- The draft and the opening mulligan ----------

type DraftBlock = 'noDraft' | 'notYourPick' | 'notInPool';

/** Why `pid` cannot draft `heroId` now: there is a draft, it is their pick,
 *  and the hero is still in the pool. */
export function draftPickBlocked(G: GameState, pid: PlayerID, heroId: string): DraftBlock | null {
  if (!G.draft) return 'noDraft';
  if (G.draft.order[G.draft.currentIndex] !== pid) return 'notYourPick';
  if (!G.draft.pool.includes(heroId)) return 'notInPool';
  return null;
}

export function mulliganBlocked(G: GameState): 'noMulligan' | null {
  return G.mulliganPending ? null : 'noMulligan';
}

// ---------- One question for every action ----------

/** Why `a` cannot be made by `pid` right now, or null when it can — the
 *  dispatch `perform` runs before it mutates anything. An action must name a
 *  target whenever the ability or card takes one (the per-move functions above
 *  also answer the looser "is there some target" when it is left off).
 *
 *  While a promotion is owed (`G.pendingPromotion`: a seat's Active has fallen
 *  and a bench hero can step up) the only legal action is that promotion — for
 *  that seat's bench, made from either seat — so nothing, the end of the turn
 *  included, happens around a corpse in the lane. Once the turn's attack is
 *  made ('actOver') nothing is legal but ending the turn and a promotion. */
export function blocked(G: GameState, pid: PlayerID, a: Action): string | null {
  if (!G.players[pid]) return 'noPlayer';
  if (G.pendingPromotion) {
    if (a.type !== 'promoteToActive') return 'promotionOwed';
    const owed = G.players[G.pendingPromotion].bench.some((b) => b != null && b.iid === a.benchIid);
    if (!owed) return 'promotionOwed';
  }
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
    case 'playCard': {
      const why = playBlocked(G, pid, a.cardIid, a.targetIid, a.discardIid);
      if (why) return why;
      const card = G.players[pid].hand.find((c) => c.iid === a.cardIid)!;
      return a.targetIid === undefined && playTargets(G, pid, card) !== 'none' ? 'target' : null;
    }
    case 'moveHero':
      return moveBlocked(G, pid, a.fromSlot, a.toSlot);
    case 'promoteToActive':
      return promoteBlocked(G, a.benchIid);
    case 'endTurn':
      return null;
  }
}

/**
 * Every action `pid` could make right now. In order: the Active's attack, if
 * open — once per hero it may swing at (`attackTargets`), the first as the bare
 * action (a bare `attack` swings at it) and any others naming theirs; each
 * card in hand, in hand order, on each of its legal targets in `targetsFor`
 * order (equipment on a hero at the cap is offered once per item it could
 * discard — the choice of which is the player's); each living hero's kit
 * abilities (`kitAbilityIds`: its skills, its ultimate, a borrowed ultimate), in
 * board order and the kit's own order, each on each of its targets (every
 * action names its `skillId`); retreats from the bench in `stepInCandidates`
 * order (before the attack: the hero who steps in may make it); promotions
 * (either seat's: `pid` may promote the seat that owes one); and ending the turn
 * last. Everything listed passes `blocked`, so while a promotion is owed that is
 * all there is, and once the attack is made only the end of the turn is left.
 */
export function legalActions(G: GameState, pid: PlayerID): Action[] {
  const ps = G.players[pid];
  const out: Action[] = [];
  const offer = (a: Action) => { if (blocked(G, pid, a) === null) out.push(a); };

  attackTargets(G, pid).forEach((t, i) => offer(i === 0 ? { type: 'attack' } : { type: 'attack', targetIid: t.iid }));

  for (const card of ps.hand) {
    const targets = playTargets(G, pid, card);
    if (targets === 'none') { offer({ type: 'playCard', cardIid: card.iid }); continue; }
    const equipment = CARDS_BY_ID[card.cardId]?.type === 'equipment';
    for (const t of targets) {
      const worn = wornEquipment(t);
      if (equipment && worn.length >= MAX_EQUIPMENT_PER_HERO) {
        for (const eq of worn) offer({ type: 'playCard', cardIid: card.iid, targetIid: t.iid, discardIid: eq.iid });
      } else {
        offer({ type: 'playCard', cardIid: card.iid, targetIid: t.iid });
      }
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
  // A promotion may be made for either seat: the one owed is on the other side of the table
  // when its Active fell to this seat's attack.
  for (const seat of ['0', '1'] as PlayerID[]) {
    for (const b of stepInCandidates(G.players[seat])) offer({ type: 'promoteToActive', benchIid: b.iid });
  }

  offer({ type: 'endTurn' });
  return out;
}
