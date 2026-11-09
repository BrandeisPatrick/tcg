/**
 * Pure reads of the game: who is on the board, what a hero can do, how hard it
 * hits. Nothing here mutates `G` or emits events, so the rules, the forecast,
 * the AI and the board can all ask the same question and get the same answer.
 * A rule that needs a number asks here instead of working it out again.
 */
import type {
  AbilityId,
  CardId,
  CardInstance,
  DamageType,
  EquipmentCard,
  GameState,
  HeroCard,
  ItemSlot,
  ItemTier,
  Owner,
  PendingTrigger,
  PlayerID,
  PlayerState,
  StatusId,
  StructureKind,
  UltimateCard,
} from './types';
import { CARDS_BY_ID, ULTIMATES, itemCard } from '@/cards';
import { STATUSES_BY_ID, type Blockable, type Untargetable } from '@/statuses';
import type { AbilityDef, HeroAbilityDef } from '@/abilities';
import { getAbility } from './registry';
import {
  ACTIVE_COOLDOWN, CATEGORY_SPIKE_ITEMS, FLEX_SLOT, KILL_BOUNTY_BASE, MAX_ITEMS, PRICE, RESPAWN_TURNS, START_LEVEL, ULT_COST,
} from './constants';
import { pushMultiplier, round, secondMover } from './rounds';

// ---------- The board ----------

export function otherPlayer(id: PlayerID): PlayerID {
  return id === '0' ? '1' : '0';
}

/** The board card with this iid, or null: a hero in a slot, or the Mid-Boss in
 *  the pit (owned by nobody). An empty slot is nobody: a missing or junk iid
 *  (`undefined`, a number…) finds nothing, so callers can treat "not found" as
 *  the one answer for every id that names no card. */
export function findCardOnBoard(G: GameState, iid: string): { owner: Owner; card: CardInstance } | null {
  for (const pid of ['0', '1'] as PlayerID[]) {
    const ps = G.players[pid];
    if (ps.active && ps.active.iid === iid) return { owner: pid, card: ps.active };
    for (const b of ps.bench) if (b && b.iid === iid) return { owner: pid, card: b };
  }
  if (G.boss && G.boss.iid === iid) return { owner: 'none', card: G.boss };
  return null;
}

/** The seat a hero or an item belongs to. Only the Mid-Boss belongs to no
 *  seat, and nothing that asks this is ever handed it: a programming error
 *  if it is. */
export function seatOf(card: CardInstance): PlayerID {
  if (card.ownerId === 'none') throw new Error(`${card.cardId}#${card.iid} belongs to no seat`);
  return card.ownerId;
}

/** True for the Mid-Boss: the unit in the pit. */
export function isBoss(card: CardInstance | null | undefined): boolean {
  return card?.zone === 'pit';
}

/** The Mid-Boss, while it stands in the pit (up, and not yet reaped at 0 HP). */
export function standingBoss(G: GameState): CardInstance | null {
  return G.boss && G.boss.hp > 0 ? G.boss : null;
}

/** True when a hero is currently a corpse waiting to respawn (greyed in UI,
 *  can't act / be targeted / take damage / receive statuses). */
export function isRespawning(card: CardInstance): boolean {
  return (card.respawnTurnsLeft ?? 0) > 0;
}

/** A player's heroes in a slot, in board order — the Active, then bench
 *  1..3 — standing or on the respawn timer. */
export function slottedHeroes(ps: PlayerState): CardInstance[] {
  return [ps.active, ...ps.bench].filter((c): c is CardInstance => !!c);
}

/** A player's living heroes in board order: the Active, then bench 1..3. */
export function liveBoardCards(ps: PlayerState): CardInstance[] {
  const out: CardInstance[] = [];
  if (ps.active && !isRespawning(ps.active)) out.push(ps.active);
  for (const b of ps.bench) if (b && !isRespawning(b)) out.push(b);
  return out;
}

/** True while `ps`'s Active slot needs filling: it is empty (a fallen Active
 *  that went to the hand) or holds a corpse. A bench hero steps up to it
 *  (`promoteToActive`), or — empty — a hero from the hand goes straight in
 *  (`placeHero`). */
export function laneOpen(ps: PlayerState): boolean {
  return !ps.active || isRespawning(ps.active);
}

/** The bench heroes who can take the Active slot right now: alive (not a
 *  corpse, nor a hero at 0 HP whose fall waits on a trigger prompt), and not
 *  bench-only (Rem). One list for the forced promotion off a fallen Active,
 *  the paid retreat, the AI and the board, so they cannot disagree. */
export function stepInCandidates(ps: PlayerState): CardInstance[] {
  return ps.bench.filter((b): b is CardInstance => {
    if (!b || isRespawning(b) || b.hp <= 0) return false;
    const d = CARDS_BY_ID[b.cardId];
    return d?.type === 'hero' && !d.flags?.benchOnly;
  });
}

/** The hero card behind an instance, or undefined for anything else (a spell,
 *  a piece of equipment, an unknown id). */
export function heroData(card: CardInstance): HeroCard | undefined {
  const data = CARDS_BY_ID[card.cardId];
  return data?.type === 'hero' ? data : undefined;
}

// ---------- The map ----------

/** A side's structure of `kind` (every track has all three; one not on a
 *  scripted track has `max` 0). */
export function structureOf(ps: PlayerState, kind: StructureKind) {
  return ps.structures.find((s) => s.kind === kind)!;
}

/** The structure HP a side has left, its three together. */
export function structureHp(ps: PlayerState): number {
  return ps.structures.reduce((n, s) => n + Math.max(0, s.hp), 0);
}

/** The front standing structure of a side — where the next push lands — or
 *  undefined once its Patron has fallen. */
export function frontStructure(ps: PlayerState) {
  return ps.structures.find((s) => s.hp > 0);
}

/** True once a side's Patron has fallen: that side has lost. */
export function patronFallen(ps: PlayerState): boolean {
  return structureOf(ps, 'patron').hp <= 0;
}

/** How a match decided on what stands was settled. */
export type StandingVerdict = 'structures' | 'netWorth' | 'secondMover';

/** Who wins on what stands — the round cap's verdict, and the verdict when
 *  both Patrons fall to one action: more structure HP; on a tie, more net
 *  worth; still tied, the second mover. */
export function standingVerdict(G: GameState): { winner: PlayerID; by: StandingVerdict } {
  const s0 = structureHp(G.players['0']);
  const s1 = structureHp(G.players['1']);
  if (s0 !== s1) return { winner: s0 > s1 ? '0' : '1', by: 'structures' };
  const w0 = netWorth(G, '0');
  const w1 = netWorth(G, '1');
  if (w0 !== w1) return { winner: w0 > w1 ? '0' : '1', by: 'netWorth' };
  return { winner: secondMover(G), by: 'secondMover' };
}

/** How a match is won: the rival's Patron falls — to the push of a kill, or
 *  of an Active into an empty lane; both at once goes to what stands
 *  (`standingVerdict`) — or round ROUND_CAP ends (`G.capped`) and what stands
 *  decides. A board with every hero down is no loss by itself. This is
 *  boardgame.io's `endIf`: it runs after every move and turn edge on the
 *  already-resolved state. */
export function checkWinner(G: GameState): { winner?: PlayerID } | undefined {
  if (G.draft) return undefined;
  const down0 = patronFallen(G.players['0']);
  const down1 = patronFallen(G.players['1']);
  if (down0 && down1) return { winner: standingVerdict(G).winner };
  if (down0 || down1) return { winner: down0 ? '1' : '0' };
  if (G.capped) return { winner: standingVerdict(G).winner };
  return undefined;
}

/** The structure HP a hero's fall pushes into its side's front structure:
 *  its level plus KILL_BOUNTY_BASE (the kill bounty's own number, without
 *  the richest hero's bonus), doubled in the late game. */
export function killPush(G: GameState, hero: CardInstance): number {
  return ((hero.level ?? START_LEVEL) + KILL_BOUNTY_BASE) * pushMultiplier(G);
}

/** Own turns a hero that falls now waits in its slot before it goes back to
 *  its owner's hand: RESPAWN_TURNS, for every hero at every point of the
 *  match (0: it goes straight to the hand). */
export function respawnTimer(_G: GameState, _hero: CardInstance): number {
  return RESPAWN_TURNS;
}

/** True while `pid`'s Rejuvenator can bring a hero back: a credit left, in a
 *  round it is good through. */
export function reviveReady(G: GameState, pid: PlayerID): boolean {
  const ps = G.players[pid];
  return ps.reviveCredits > 0 && round(G) <= ps.reviveUntilRound;
}

/** Who takes the Mid-Boss falling now, and what settled it: the side that
 *  dealt it more damage; on a tie, the side behind on net worth; still tied,
 *  the side that landed the last hit (seat 0 should nobody have — no boss
 *  dies unhit). */
export function bossTaker(G: GameState): { pid: PlayerID; by: 'damage' | 'netWorth' | 'lastHit' } {
  const d0 = G.bossDamage['0'];
  const d1 = G.bossDamage['1'];
  if (d0 !== d1) return { pid: d0 > d1 ? '0' : '1', by: 'damage' };
  const w0 = netWorth(G, '0');
  const w1 = netWorth(G, '1');
  if (w0 !== w1) return { pid: w0 < w1 ? '0' : '1', by: 'netWorth' };
  return { pid: G.bossLastHit ?? '0', by: 'lastHit' };
}

// ---------- Worth ----------

/** What an item lists at: its tier's price (`PRICE`). Anything that is not
 *  an item lists at 0. Putting it on a hero costs it (an evolving upgrade, the
 *  difference: `playCost`), and net worth counts every worn item and every
 *  item in hand at it. */
export function itemPrice(cardId: CardId): number {
  const data = itemCard(cardId);
  return data ? PRICE[data.tier] : 0;
}

/** The list price of everything `hero` wears. */
export function heroWorth(hero: CardInstance): number {
  return wornItems(hero).reduce((n, it) => n + itemPrice(it.cardId), 0);
}

/** The list price of the items in a player's hand (a hero card lists at 0). */
export function handWorth(ps: PlayerState): number {
  return ps.hand.reduce((n, c) => n + itemPrice(c.cardId), 0);
}

/** The card with this iid in `pid`'s hand, or undefined. */
export function handCard(G: GameState, pid: PlayerID, iid: string): CardInstance | undefined {
  return G.players[pid].hand.find((c) => c.iid === iid);
}

/** True for a hero card (in a hand, the deck, the discard pile or on the board). */
export function isHeroCard(card: CardInstance): boolean {
  return CARDS_BY_ID[card.cardId]?.type === 'hero';
}

/** Every hero a side has on the board: the Active, the bench (corpses
 *  included) and a Rem merged into an ally, who rides in its `attached` list. */
export function heroesOf(ps: PlayerState): CardInstance[] {
  const slotted = [ps.active, ...ps.bench].filter((c): c is CardInstance => !!c && !!heroData(c));
  return [...slotted, ...slotted.flatMap((c) => (c.attached ?? []).filter((a) => !!heroData(a)))];
}

/** A side's net worth: the souls it holds plus the list price of every item
 *  its heroes on the board wear and every item in its hand. The round cap's
 *  tie-break and the Mid-Boss's read it. */
export function netWorth(G: GameState, pid: PlayerID): number {
  const ps = G.players[pid];
  return ps.souls + heroesOf(ps).reduce((n, h) => n + heroWorth(h), 0) + handWorth(ps);
}

// ---------- Targets ----------

/** What a skill, spell or ultimate may be aimed at. Moved here from the
 *  abilities, which still re-export it. */
export type TargetFilter =
  | 'noTarget'
  | 'self'
  | 'allyAny'           // any ally board card
  | 'allyHero'
  | 'enemyAny'
  | 'enemyHero'
  | 'enemyActive'
  | 'allyBench'         // a bench ally who could step into the Active slot
  | 'enemyBench'        // an enemy bench hero who could be dragged to the front
  | 'anyBoard';

/**
 * Every live board card `filter` allows for `pid`, in board order: the enemy's
 * Active, enemy bench 1..3, then your Active and bench 1..3. Corpses are never
 * targets. `self` is `source` alone, and `noTarget` allows none (the caller
 * reads that as "nothing to aim"). `allyHero` includes the caster; a skill that
 * should not aim at its own caster says so itself (`excludeSelf`, applied by
 * legality's skillTargets) rather than needing a filter of its own.
 */
export function targetsFor(G: GameState, pid: PlayerID, filter: TargetFilter, source?: CardInstance): CardInstance[] {
  if (filter === 'noTarget') return [];
  const enemy = liveBoardCards(G.players[otherPlayer(pid)]);
  const ally = liveBoardCards(G.players[pid]);
  const heroes = (cards: CardInstance[]) => cards.filter((c) => CARDS_BY_ID[c.cardId]?.type === 'hero');
  switch (filter) {
    case 'self': return source && !isRespawning(source) ? [source] : [];
    case 'allyAny': return ally;
    case 'allyHero': return heroes(ally);
    case 'enemyAny': return enemy;
    case 'enemyHero': return heroes(enemy);
    case 'enemyActive': return enemy.filter((c) => c.zone === 'active');
    // A bench hero who can take the front: alive, not bench-only, not Rooted —
    // and, on your own side, only while your Active is free to leave it.
    case 'allyBench': {
      const ps = G.players[pid];
      if (!ps.active || isRespawning(ps.active) || isBlocked(ps.active, 'move')) return [];
      return stepInCandidates(ps).filter((b) => !isBlocked(b, 'move'));
    }
    case 'enemyBench': {
      const ps = G.players[otherPlayer(pid)];
      if (!ps.active) return [];
      return stepInCandidates(ps).filter((b) => !isBlocked(b, 'move'));
    }
    case 'anyBoard': return [...enemy, ...ally];
  }
}

// ---------- What a card brings with it ----------

/** One ability a board hero carries, and the equipment it came from (absent
 *  for the hero's own passives). */
interface AbilitySource {
  ability: AbilityDef;
  equip?: CardInstance;
}

/** The abilities a board hero carries, in the order they are asked: its own
 *  passives, then each worn piece of equipment's abilities in worn order. The
 *  one list behind the reactive triggers (engine/triggers.ts) and the pure
 *  hooks read below, so a card's behaviour is found in the same place by every
 *  rule. A merged Rem in `attached` is a hero, not equipment, and adds none. */
export function abilitySources(card: CardInstance): AbilitySource[] {
  const out: AbilitySource[] = [];
  for (const id of heroData(card)?.passives ?? []) {
    const ability = getAbility(id);
    if (ability) out.push({ ability });
  }
  for (const equip of wornEquipment(card)) {
    const data = CARDS_BY_ID[equip.cardId] as EquipmentCard;
    for (const id of data.abilities ?? []) {
      const ability = getAbility(id);
      if (ability) out.push({ ability, equip });
    }
  }
  return out;
}

/** The passive items (equipment) `card` wears, in worn order: what its
 *  triggers and pure hooks are read off (`abilitySources`). */
export function wornEquipment(card: CardInstance): CardInstance[] {
  return (card.attached ?? []).filter((a) => CARDS_BY_ID[a.cardId]?.type === 'equipment');
}

/** Every item `card` wears, active or passive, in worn order: what fills its
 *  slots. A merged Rem rides in the same `attached` list but is a hero, not an
 *  item: she takes no slot and cannot be sold or moved. */
export function wornItems(card: CardInstance): CardInstance[] {
  return (card.attached ?? []).filter((a) => !!itemCard(a.cardId));
}

/** The active items `card` wears, in worn order: the ones it can use. */
export function wornActives(card: CardInstance): CardInstance[] {
  return (card.attached ?? []).filter((a) => CARDS_BY_ID[a.cardId]?.type === 'spell');
}

/** How many items a hero of `pid` may wear: MAX_ITEMS, and FLEX_SLOT more once
 *  the side has the flex slot. */
export function slotCap(G: GameState, pid: PlayerID): number {
  return MAX_ITEMS + (G.players[pid].flexSlot ? FLEX_SLOT : 0);
}

/** The worn item with this iid on one of `pid`'s heroes in a slot (Active or
 *  bench, standing or not) — or, without `pid`, on either side — and who wears
 *  it; null when there is none. A merged Rem's items are out of reach until she
 *  is back on the bench. */
export function findWornItem(G: GameState, iid: string, pid?: PlayerID): { owner: PlayerID; bearer: CardInstance; item: CardInstance } | null {
  for (const owner of (pid ? [pid] : ['0', '1']) as PlayerID[]) {
    const ps = G.players[owner];
    for (const hero of [ps.active, ...ps.bench]) {
      const item = hero && wornItems(hero).find((it) => it.iid === iid);
      if (item) return { owner, bearer: hero!, item };
    }
  }
  return null;
}

/** How many items of each tab `card` wears. */
export function tabCounts(card: CardInstance): Record<ItemSlot, number> {
  const out: Record<ItemSlot, number> = { weapon: 0, spirit: 0, vitality: 0 };
  for (const it of wornItems(card)) out[itemCard(it.cardId)!.slot]++;
  return out;
}

/** True while `card` has the category spike of `slot`: it wears
 *  CATEGORY_SPIKE_ITEMS or more items of that tab (+1 Bullet Power for
 *  Weapon, +1 Spirit Power for Spirit, +1 max HP for Vitality). Read off what
 *  it wears, never stored on its modifiers. */
export function hasSpike(card: CardInstance, slot: ItemSlot): boolean {
  return tabCounts(card)[slot] >= CATEGORY_SPIKE_ITEMS;
}

/** Own turns an active item of `tier` waits after use (and when put on) on
 *  `bearer`: the card's own `cooldown` when it names one (`own`: the draw
 *  cards' 2), else ACTIVE_COOLDOWN by tier — less the bearer's `cooldownCut`
 *  hooks, never under 1. */
export function activeCooldown(bearer: CardInstance, tier: ItemTier, own?: number): number {
  const base = own ?? (tier <= 2 ? ACTIVE_COOLDOWN.low : ACTIVE_COOLDOWN.high);
  return Math.max(1, base - cooldownCut(bearer, 'item'));
}

/** Own turns the active item `item` has left to cool down (0: ready). */
export function itemCooldown(item: CardInstance): number {
  return item.cooldowns?.[item.cardId] ?? 0;
}

// ---------- A hero's kit ----------

/** What kind of kit ability a hero uses: its skill, or its ultimate (the
 *  button printed on its card). */
export type KitKind = 'skill' | 'ult';

/** One ability a hero can use: its id, the ability that does it, and its kind. */
export interface KitAbility {
  id: AbilityId;
  ability: AbilityDef;
  kind: KitKind;
}

/** The abilities `card` may choose to use, in order: its skill, then its
 *  ultimate. Every one is used through `useSkill` naming its id; the
 *  legal-move list, the hero sheet and the board's ready glint all walk this
 *  list. */
export function kitAbilityIds(card: CardInstance): AbilityId[] {
  const data = heroData(card);
  if (!data) return [];
  const out = [...data.skills];
  if (data.ult) out.push(data.ult);
  return out;
}

/**
 * The kit ability `skillId` names on `card` — left out, the hero's first
 * skill — or undefined when the card is no hero, has no such ability, or the
 * ability is not registered. The one reading of "which ability": the rules
 * (legality, `useSkill`), the AI and the board all ask here, so a bare action
 * means the same thing to every one of them.
 */
export function resolveSkill(card: CardInstance, skillId?: AbilityId): KitAbility | undefined {
  const data = heroData(card);
  if (!data) return undefined;
  const id = skillId === undefined ? data.skills[0] : skillId;
  if (id === undefined) return undefined;
  const kind: KitKind | undefined = data.skills.includes(id) ? 'skill' : id === data.ult ? 'ult' : undefined;
  if (!kind) return undefined;
  const ability = getAbility(id);
  return ability ? { id, ability, kind } : undefined;
}

/** The souls a hero's kit ability costs to use (docs/hero-design.md §2): a
 *  skill its own `souls` (1–3), an ultimate its card's size (`ULT_COST`: 4, 8
 *  or 12). 0 for an id the hero does not have. The one price: legality checks
 *  it, `useSkill` charges it, the hero sheet prints it and the AI pays it. */
export function kitCost(card: CardInstance, skillId?: AbilityId): number {
  const skill = resolveSkill(card, skillId);
  if (!skill) return 0;
  if (skill.kind === 'ult') {
    const face = ultimateCard(skill.id);
    if (!face) return 0;
    // A charged ultimate: its printed price, less what its hero has counted.
    return Math.max(0, ultPrice(face) - (face.charged ? card.tally?.[skill.id] ?? 0 : 0));
  }
  return skill.ability.souls ?? 0;
}

/** The price an ultimate's card prints: a charged one's own `cost`, else its
 *  size's (`ULT_COST`: 4, 8 or 12). What a hero pays now is `kitCost`, which
 *  takes a charged ultimate's count off it. */
export function ultPrice(face: UltimateCard): number {
  return face.charged ? face.charged.cost : ULT_COST[face.size];
}

/** The charged ultimate `card` carries (docs/hero-design.md §2), with how it
 *  charges — damage the hero takes or deals — or undefined for any other
 *  card. The damage kernel counts it (`damageUnit`). */
export function chargedUlt(card: CardInstance): { id: AbilityId; by: 'taken' | 'dealt' } | undefined {
  const id = heroData(card)?.ult;
  const charged = ultimateCard(id)?.charged;
  return id && charged ? { id, by: charged.by } : undefined;
}

// ---------- Optional triggers (the trigger prompt system, engine/prompts.ts) ----------

/** The optional triggers ("you may") `card` declares — at `moment`, when one
 *  is named: its kit abilities (skill, ultimate) and passives that are
 *  `optional`, in that order. Declared is not usable: `triggerBlocked`
 *  (legality.ts) says whether one can be used now. */
export function optionalTriggers(card: CardInstance, moment?: AbilityDef['trigger']): AbilityDef[] {
  const data = heroData(card);
  if (!data) return [];
  const ids = [...data.skills, ...(data.ult ? [data.ult] : []), ...(data.passives ?? [])];
  const out: AbilityDef[] = [];
  for (const id of ids) {
    const a = getAbility(id);
    if (a?.optional && (moment === undefined || a.trigger === moment)) out.push(a);
  }
  return out;
}

/** The souls an optional trigger costs `card` to use: a kit ability's
 *  `kitCost` (a charged ultimate's count taken off), a passive's own
 *  `souls` (none: 0). The one price the prompt prints, the legality checks
 *  and the answer charges. */
export function triggerPrice(card: CardInstance, abilityId: AbilityId): number {
  return resolveSkill(card, abilityId) ? kitCost(card, abilityId) : getAbility(abilityId)?.souls ?? 0;
}

/** The trigger prompt the game is waiting on: the last of `G.triggers` (the
 *  one asked), or undefined when none is owed. */
export function promptOwed(G: GameState): PendingTrigger | undefined {
  const stack = G.triggers;
  return stack && stack.length > 0 ? stack[stack.length - 1] : undefined;
}

/** True while `hero` has dropped to 0 HP and its fall waits on a trigger
 *  prompt: it is neither standing nor a corpse. Nothing reaps, damages,
 *  heals or promotes it meanwhile. */
export function fallPending(G: GameState, hero: CardInstance): boolean {
  return !!G.triggers?.some((t) => t.moment === 'onFall' && t.subjectIid === hero.iid);
}

/** What `ability`, used by `hero` of `pid`, is aimed at now: its own `aim`
 *  when it has one (Traveler, Audience Participation — null when it cannot be
 *  aimed at all), else its fixed `target` filter and `excludeSelf`. The one
 *  reading, for `skillTargets` (legality.ts), `useSkill` and the copy-cast. */
export function abilityAim(G: GameState, pid: PlayerID, hero: CardInstance, ability: AbilityDef): { target: TargetFilter; excludeSelf?: boolean } | null {
  return ability.aim ? ability.aim(G, pid, hero) : { target: ability.target, excludeSelf: ability.excludeSelf };
}

/** Souls a Retreat costs while `card` is the hero leaving the Active slot,
 *  before what it carries takes any off: its card's `retreat` (0 for very
 *  mobile heroes, 1 for most, 2 for slow heavy ones). `retreatCost`
 *  (legality.ts) is the price with the discounts and Swift. */
export function heroRetreat(card: CardInstance): number {
  return heroData(card)?.retreat ?? 0;
}

/** The card that names and draws the ultimate `abilityId` (its first ability),
 *  or undefined for an ability no ultimate card carries. */
export function ultimateCard(abilityId: AbilityId | undefined): UltimateCard | undefined {
  return abilityId === undefined ? undefined : ULTIMATES.find((u) => u.abilities[0] === abilityId);
}

/**
 * Everything a hero card prints, in the order it prints it: its skills, in
 * order, then its passives — each ability with the `name` and `text` it carries.
 * The one way the card face, the hero sheet, the draft, the AI and the tutorial
 * read a hero's kit. An id that names no registered ability, or one without a
 * name and text, is left out (the data tests fail on it).
 */
export function heroAbilities(data: HeroCard): { kind: 'skill' | 'passive'; ability: HeroAbilityDef }[] {
  const named = (a: AbilityDef | undefined): a is HeroAbilityDef => !!a && typeof a.name === 'string' && typeof a.text === 'string';
  const out: { kind: 'skill' | 'passive'; ability: HeroAbilityDef }[] = [];
  const add = (kind: 'skill' | 'passive', ids: readonly AbilityId[]) => {
    for (const id of ids) {
      const ability = getAbility(id);
      if (named(ability)) out.push({ kind, ability });
    }
  };
  add('skill', data.skills);
  add('passive', data.passives ?? []);
  return out;
}

/** Damage `card` is about to take, after the pure `incoming` hooks of what it
 *  carries (Vindicta's flight). Runs first, ahead of every status. */
export function incomingDamage(card: CardInstance, amount: number, type: DamageType): number {
  let n = amount;
  for (const { ability } of abilitySources(card)) {
    if (ability.incoming) n = ability.incoming(card, n, type);
  }
  return n;
}

/** How long a status lands for on `card`, after the `buffDuration` hooks of
 *  what it carries (Superior Duration stretches the bearer's buffs) and, for a
 *  debuff (a status whose `hvalue` is below 0), its `debuffDuration` hooks
 *  (Debuff Reducer shortens them). */
export function statusDuration(card: CardInstance, statusId: StatusId, duration: number): number {
  const debuff = (STATUSES_BY_ID[statusId]?.hvalue ?? 0) < 0;
  let n = duration;
  for (const { ability } of abilitySources(card)) {
    if (ability.buffDuration) n = ability.buffDuration(card, statusId, n);
    if (debuff && ability.debuffDuration) n = ability.debuffDuration(card, statusId, n);
  }
  return n;
}

/** Souls off `card`'s Retreat: the sum of the `retreatDiscount` hooks of what it
 *  carries (Sprint Boots, Enduring Speed). `retreatCost` (legality.ts) asks it of
 *  the hero leaving the Active slot and keeps the price at 0 or more. */
export function retreatDiscount(card: CardInstance): number {
  let n = 0;
  for (const { ability } of abilitySources(card)) n += ability.retreatDiscount?.(card) ?? 0;
  return n;
}

/** Own turns off the cooldowns `card` starts — its ultimate's ('ult') or its
 *  active items' ('item') — summed over the `cooldownCut` hooks of what it
 *  carries (Compress, Superior and Transcendent Cooldown). The callers keep the
 *  result at 1 or more. */
export function cooldownCut(card: CardInstance, kind: 'ult' | 'item'): number {
  let n = 0;
  for (const { ability } of abilitySources(card)) n += ability.cooldownCut?.(card, kind) ?? 0;
  return n;
}

/** The resist to `type` damage what `card` wears gives it (Bullet and Spirit
 *  Resilience): the largest of its `resist` hooks. `damageUnit` takes the
 *  larger of this and a resist status. */
export function itemResist(card: CardInstance, type: DamageType): number {
  let n = 0;
  for (const { ability } of abilitySources(card)) n = Math.max(n, ability.resist?.(card, type) ?? 0);
  return n;
}

/** The Healing Boost what `card` wears gives it (Healing Booster, Healing
 *  Tempo): the largest of its `healingBoost` hooks. `healUnit` takes the larger
 *  of this and a Healing Boost status. */
export function itemHealingBoost(card: CardInstance): number {
  let n = 0;
  for (const { ability } of abilitySources(card)) n = Math.max(n, ability.healingBoost?.(card) ?? 0);
  return n;
}

/** How hard `card`'s swing bounces: the value of a `ricochet` status on it plus
 *  the sum of the `ricochet` hooks of what it carries (the Ricochet item: 2).
 *  0 means it does not. `swing` (actions/attack.ts) asks it once a swing. */
export function ricochetPower(card: CardInstance): number {
  let n = card.statuses.find((s) => s.id === 'ricochet')?.value ?? 0;
  for (const { ability } of abilitySources(card)) n += ability.ricochet?.(card) ?? 0;
  return n;
}

/** The card that keeps `statusId` off `card` — the worn item's (or, for a
 *  passive, the hero's own) name — or undefined when nothing it carries
 *  `resists` it (Enduring Speed turns Rooted away). `addStatus` asks first. */
export function resistedBy(card: CardInstance, statusId: StatusId): string | undefined {
  for (const { ability, equip } of abilitySources(card)) {
    if (!ability.resists?.(card, statusId)) continue;
    const by = CARDS_BY_ID[(equip ?? card).cardId];
    return by?.name ?? (equip ?? card).cardId;
  }
  return undefined;
}

/** True when `card`'s basic attack may be aimed at any living enemy hero, not
 *  only the rival Active: something the hero carries — a passive, or worn gear —
 *  has `reach`. The one reading of it; `attackTargets` (legality.ts) asks here. */
export function hasReach(card: CardInstance): boolean {
  return abilitySources(card).some(({ ability }) => !!ability.reach);
}

// ---------- Statuses ----------

/** True while a status on `card` stops it doing `act`. The only lockout check
 *  there is: each status declares what it blocks (`StatusDef.blocks`), and the
 *  attack gate, `useSkill`, the channel pulse, the retreat gate, the AI and the
 *  board all ask this rather than listing statuses. */
export function isBlocked(card: CardInstance, act: Blockable): boolean {
  return card.statuses.some((s) => STATUSES_BY_ID[s.id]?.blocks?.includes(act));
}

/** True while a status on `card` keeps it from being the target of `act`: a
 *  Dome makes its bearer untargetable by a basic attack. The one check, as
 *  `isBlocked` is for what a hero cannot do: `attackTargets` (legality.ts) asks it. */
export function isUntargetable(card: CardInstance, act: Untargetable): boolean {
  return card.statuses.some((s) => STATUSES_BY_ID[s.id]?.untargetable?.includes(act));
}

// ---------- Attack and spirit ----------

export interface AttackPower {
  /** What one basic swing deals before the target's mitigation. */
  total: number;
  /** Where it comes from, for tooltips. `total` is the authority: a part list
   *  is an explanation, not something to sum. `bonus` marks a card's
   *  conditional bonus (Frenzy), as opposed to the hero's own numbers. */
  parts: { label: string; amount: number; bonus?: true }[];
}

/**
 * What one basic swing of `card` deals, before the target's mitigation. The
 * one place attack damage is worked out — the attack gate, the swing, the
 * forecast and the card face all read it, so nothing added on top of a hero's
 * attack (Frenzy) can swing through a lockout:
 *  - 0 when the hero cannot attack (Stun, Disarm, Sleep, a heavy channel);
 *  - else printed attack + modifiers + Weapon Power + the Weapon category
 *    spike, floored at 0;
 *  - minus Weaken (Rusted Barrel and any future "ATK-down"), floored at 0;
 *  - plus each `attackBonus` hook of what the hero carries.
 * It reads `card.hp` for hooks like Frenzy's, so a caller simulating a swing
 * later in the turn passes a view of the card at that moment. A swing at a
 * known target passes it (`target`), for a hook that reads the target (Fixation
 * adds a stack's worth against the hero it is fixed on); the card face has no
 * target and passes none.
 */
export function attackPower(card: CardInstance, target?: CardInstance): AttackPower {
  const data = heroData(card);
  if (!data || isBlocked(card, 'attack')) return { total: 0, parts: [] };
  const parts: AttackPower['parts'] = [{ label: 'Bullet Power', amount: data.atk + card.atkMod }];
  const weaponPower = card.statuses
    .filter((s) => s.id === 'weapon_power')
    .reduce((a, s) => a + s.value, 0);
  if (weaponPower) parts.push({ label: 'Weapon Power', amount: weaponPower });
  const spike = hasSpike(card, 'weapon') ? 1 : 0;
  if (spike) parts.push({ label: 'Weapon spike', amount: spike });
  let total = Math.max(0, data.atk + card.atkMod + weaponPower + spike);
  const weak = card.statuses.find((s) => s.id === 'weapon_power_down');
  if (weak) {
    const weakened = Math.max(0, total - weak.value);
    parts.push({ label: 'Weaken', amount: weakened - total });
    total = weakened;
  }
  for (const { ability } of abilitySources(card)) {
    const bonus = ability.attackBonus?.(card, target);
    if (!bonus) continue;
    total += bonus.amount;
    parts.push({ label: bonus.label, amount: bonus.amount, bonus: true });
  }
  return { total, parts };
}

/** The attack the card face shows: `attackPower(card).total`. */
export function effectiveAtk(card: CardInstance): number {
  return attackPower(card).total;
}

/** Total spirit-power for skill scaling: item bonuses and levels (the
 *  modifier), any Spirit Power status and the Spirit category spike, less any
 *  Spirit Power − (Inhibitor, Spirit Snatch), never below 0. */
export function effectiveSpirit(card: CardInstance): number {
  if (!card) return 0;
  const statuses = card.statuses ?? [];
  const fromBuff = statuses
    .filter((s) => s.id === 'spirit_power')
    .reduce((a, s) => a + s.value, 0);
  const down = statuses.find((s) => s.id === 'spirit_power_down')?.value ?? 0;
  const spike = card.attached && hasSpike(card, 'spirit') ? 1 : 0;
  return Math.max(0, (card.spiritMod ?? 0) + fromBuff + spike - down);
}
