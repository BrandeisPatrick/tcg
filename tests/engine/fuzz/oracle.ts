/**
 * Shared helpers for the fuzz harness: card enumeration, rules oracles — which
 * targets an ability or an active item may be aimed at, what putting an item on
 * a hero costs (its price, or the difference for an upgrade onto the hero that
 * wears its component), who may play which card from the hand (an item onto a
 * hero, a hero onto the bench or into an empty lane), the opening's first
 * Active, a draw card's discard, and who may use which item — direct
 * (non-client) move calls on a cloned state, and a structural diff. Nothing here
 * mutates the live G — every helper that runs the engine does it on a
 * structuredClone. Written from docs/deck-plan.md and the card texts, never
 * from the engine's own functions.
 */
import { INVALID_MOVE } from 'boardgame.io/core';
import type { Ctx } from 'boardgame.io';
import type { CardId, CardInstance, GameState, ItemCard, ItemSlot, ItemTier, Owner, PlayerID, PlayerState } from '@/engine/types';
import { CARDS_BY_ID, ITEMS } from '@/cards';
import { STATUSES_BY_ID } from '@/statuses';
import { DeadlockGame } from '@/engine/game';
import { getAbility, type TargetFilter } from '@/abilities';
import {
  ACTIVE_COOLDOWN, CATEGORY_SPIKE_ITEMS, FLEX_SLOT, KILL_BOUNTY_BASE, LATE_GAME_ROUND, LATE_PUSH_MULTIPLIER, LEVEL_THRESHOLDS,
  MAX_ITEMS, PRICE, RESPAWN_TURNS, ULT_COOLDOWN, ULT_COST, ULT_UNLOCK_LEVEL,
} from '@/engine/constants';
import { isRespawning } from '@/engine/query';

export const PIDS: PlayerID[] = ['0', '1'];
export const other = (p: PlayerID): PlayerID => (p === '0' ? '1' : '0');

export const isHeroCard = (c: CardInstance | null | undefined): boolean =>
  !!c && CARDS_BY_ID[c.cardId]?.type === 'hero';

/** A Rem merged into an ally: she rides in its `attached` list, a hero, not an item. */
export const isMergedRem = (c: CardInstance): boolean => c.cardId === 'hero_rem' && c.remMergeTurnsLeft != null;

/** The item card behind an id — an ACTIVE item is a 'spell', a PASSIVE one 'equipment' —
 *  or undefined for a hero, an ultimate, an unknown id or no string at all. */
export function itemData(cardId: unknown): ItemCard | undefined {
  const d = typeof cardId === 'string' && Object.prototype.hasOwnProperty.call(CARDS_BY_ID, cardId) ? CARDS_BY_ID[cardId] : undefined;
  return d?.type === 'spell' || d?.type === 'equipment' ? d : undefined;
}

/** Active + bench, nulls dropped (corpses included). */
export function boardOf(ps: PlayerState): CardInstance[] {
  return [ps.active, ...ps.bench].filter((c): c is CardInstance => !!c);
}

/** Every card instance anywhere in G — the heroes in the slots and everything
 *  they carry (worn items, a merged Rem and what she wears), each player's
 *  deck (place 'deck'), hand (place 'hand') and discard pile (place
 *  'discard') with whatever a hero card there carries (a fallen hero keeps
 *  its items), and the Mid-Boss in the pit (place 'pit', owned by nobody) —
 *  with a label for where it sits. A card is in exactly one of those places:
 *  nothing leaves the game but a Mid-Boss that falls. */
export function everyCard(G: GameState): { card: CardInstance; place: string; pid: Owner }[] {
  const out: { card: CardInstance; place: string; pid: Owner }[] = [];
  const seen = new Set<CardInstance>();
  const walk = (c: CardInstance, place: string, pid: Owner) => {
    if (seen.has(c)) return; // a corrupted state could hang a card inside itself
    seen.add(c);
    out.push({ card: c, place, pid });
    for (const a of c.attached ?? []) walk(a, `attached:${c.iid}`, pid);
  };
  for (const pid of PIDS) {
    const ps = G.players[pid];
    if (ps.active) walk(ps.active, 'active', pid);
    ps.bench.forEach((b, i) => { if (b) walk(b, `bench${i}`, pid); });
    for (const c of ps.deck ?? []) walk(c, 'deck', pid);
    for (const c of ps.hand ?? []) walk(c, 'hand', pid);
    for (const c of ps.discard ?? []) walk(c, 'discard', pid);
  }
  if (G.boss) walk(G.boss, 'pit', 'none');
  return out;
}

/** The cards in `pid`'s hand, in the order they came. */
export function handOf(G: GameState, pid: PlayerID): CardInstance[] {
  return G.players[pid].hand ?? [];
}

/** `pid`'s deck, the top card last. */
export function deckOf(G: GameState, pid: PlayerID): CardInstance[] {
  return G.players[pid].deck ?? [];
}

/** `pid`'s discard pile, the newest last. */
export function discardOf(G: GameState, pid: PlayerID): CardInstance[] {
  return G.players[pid].discard ?? [];
}

/** The card with this iid in `pid`'s hand. */
export function handCardOf(G: GameState, pid: PlayerID, iid: unknown): CardInstance | undefined {
  return typeof iid === 'string' ? handOf(G, pid).find((c) => c.iid === iid) : undefined;
}

export function allIids(G: GameState): string[] {
  return everyCard(G).map((x) => x.card.iid);
}

/** Cards a player could aim at: the board (corpses included), not attachments. */
export function boardUnits(G: GameState): CardInstance[] {
  return PIDS.flatMap((pid) => boardOf(G.players[pid]));
}

export function describeUnit(c: CardInstance | null | undefined): string {
  if (!c) return 'none';
  const eq = (c.attached ?? []).map((a) => {
    const cd = a.cooldowns?.[a.cardId];
    return `${a.cardId}${cd ? `(cd${cd})` : ''}${a.charges !== undefined ? `(x${a.charges})` : ''}`;
  }).join('+') || '-';
  const st = c.statuses.map((s) => `${s.id}:${s.value}/${s.duration}`).join(',') || '-';
  const dead = isRespawning(c) ? ` CORPSE(${c.respawnTurnsLeft})` : '';
  return `${c.cardId}#${c.iid} hp ${c.hp}/${c.hpMax} lv${c.level ?? '?'} spirit+${c.spiritMod} atk+${c.atkMod} eq[${eq}] st[${st}]${dead}`;
}

// ---------------------------------------------------------------------------
// Rules oracle: which targets are legal for an ability. Written from the
// TargetFilter doc in abilities/index.ts, NOT copied from the engine or the AI.
// ---------------------------------------------------------------------------

/** The TargetFilter that governs a worn item: an ACTIVE item is aimed by its
 *  first ability's filter (as the spell it was always read from); a PASSIVE
 *  item is never used ('passive'); anything that is no item has none. */
export function filterForItem(card: CardInstance): TargetFilter | 'passive' | null {
  const d = itemData(card.cardId);
  if (!d) return null;
  if (d.type === 'equipment') return 'passive';
  return getAbility(d.abilities[0])?.target ?? 'noTarget';
}

/** The kit abilities a hero may use, in order: the skill its card lists (none
 *  for a passive-only hero), then its ultimate. The first skill
 *  (`firstSkillOf`) is what a bare `useSkill` names; every other is named.
 *  Read off the card, not the engine. */
export function skillIdsOf(hero: CardInstance): string[] {
  const d = CARDS_BY_ID[hero.cardId];
  if (d?.type !== 'hero') return [];
  const ids = [...d.skills];
  if (d.ult) ids.push(d.ult);
  return ids;
}

/** What a kit ability costs, by docs/hero-design.md §2: a skill the souls its
 *  card prints (1–3), an ultimate 4, 8 or 12 by its size (small, medium,
 *  large). 0 for an id the hero does not have. */
export function kitSoulsOracle(hero: CardInstance, skillId?: string): number {
  const d = CARDS_BY_ID[hero.cardId];
  if (d?.type !== 'hero') return 0;
  const id = skillId ?? firstSkillOf(hero);
  if (id === undefined || !skillIdsOf(hero).includes(id)) return 0;
  if (id === d.ult) {
    const face = Object.values(CARDS_BY_ID).find((c) => c.type === 'ultimate' && c.abilities[0] === id);
    if (face?.type !== 'ultimate') return 0;
    // A charged ultimate prints its own price, 1 off for each point its hero has counted.
    return face.charged ? Math.max(0, face.charged.cost - (hero.tally?.[id] ?? 0)) : ULT_COST[face.size];
  }
  return getAbility(id)?.souls ?? 0;
}

/** The skill a bare `useSkill` names: the first its card lists, if any. */
export function firstSkillOf(hero: CardInstance): string | undefined {
  const d = CARDS_BY_ID[hero.cardId];
  return d?.type === 'hero' ? d.skills[0] : undefined;
}

/** How one of a hero's kit abilities is aimed, read off its card: its fixed
 *  filter, or — an ability that aims by the board (Traveler, Audience
 *  Participation) — the reading its card gives for `G` and `pid`; null when
 *  the hero has no such ability or it cannot be aimed now. */
function aimOf(hero: CardInstance, skillId?: string, G?: GameState, pid?: PlayerID): { target: TargetFilter; excludeSelf?: boolean } | null {
  const ids = skillIdsOf(hero);
  const id = skillId ?? firstSkillOf(hero);
  if (id === undefined || !ids.includes(id)) return null;
  const ab = getAbility(id);
  if (!ab) return null;
  if (ab.aim && G && pid) return ab.aim(G, pid, hero);
  return { target: ab.target, excludeSelf: ab.excludeSelf };
}

/** The TargetFilter that governs one of a hero's kit abilities (`skillId`;
 *  left out, its first skill), or null when the hero has no such ability (or
 *  one aimed by the board cannot be aimed now). */
export function filterForSkill(hero: CardInstance, skillId?: string, G?: GameState, pid?: PlayerID): TargetFilter | null {
  return aimOf(hero, skillId, G, pid)?.target ?? null;
}

/** An ability that is never aimed at its own caster (Rem's Tag Along), whatever its filter says. */
export function skillExcludesSelf(hero: CardInstance, skillId?: string, G?: GameState, pid?: PlayerID): boolean {
  return !!aimOf(hero, skillId, G, pid)?.excludeSelf;
}

/** An ability that is still cooling down: its entry in the owner's-turn timer
 *  (`cooldowns`, docs/stats-model.md §1) is above 0. Written from that rule, not
 *  from `skillBlocked`, so the probes can tell the gate it is wrong. */
export function skillCooling(hero: CardInstance, skillId: string): boolean {
  return (hero.cooldowns?.[skillId] ?? 0) > 0;
}

/** The hero's own ultimate while it is below the unlock level: not usable. */
export function ultLocked(hero: CardInstance, skillId: string): boolean {
  const d = CARDS_BY_ID[hero.cardId];
  return d?.type === 'hero' && d.ult === skillId && (hero.level ?? 1) < ULT_UNLOCK_LEVEL;
}

/** Is `target` a legal choice for `filter`, cast by `pid` from `source` (a
 *  hero using a skill, or the hero wearing an active item)? A target must be on
 *  the board and alive (a corpse "can't be targeted"). */
export function targetLegal(
  filter: TargetFilter,
  target: CardInstance | undefined,
  source: CardInstance | undefined,
  pid: PlayerID,
  G?: GameState,
): boolean {
  if (filter === 'noTarget') return target === undefined;
  if (!target) return false;
  if (isRespawning(target)) return false;
  // The Mid-Boss in the pit: no ability or item is ever aimed at it.
  if (target.zone === 'pit') return false;
  const ally = target.ownerId === pid;
  const hero = isHeroCard(target);
  switch (filter) {
    case 'self': return !!source && target.iid === source.iid;
    case 'allyAny': return ally;
    case 'allyHero': return ally && hero;
    case 'enemyAny': return !ally;
    case 'enemyHero': return !ally && hero;
    case 'enemyActive': return !ally && target.zone === 'active';
    // A bench hero who can take the front: not bench-only, not Rooted, with an
    // Active on its side to trade places with — and on your own side, an Active
    // that is alive and not Rooted itself.
    case 'allyBench': {
      const front = G?.players[pid].active;
      return ally && benchMover(target) && !!front && !isRespawning(front) && !rooted(front);
    }
    case 'enemyBench': return !ally && benchMover(target) && target.ownerId !== 'none' && !!G?.players[target.ownerId].active;
    case 'anyBoard': return true;
  }
}

const rooted = (c: CardInstance) => c.statuses.some((s) => s.id === 'rooted');
function benchMover(c: CardInstance): boolean {
  const d = CARDS_BY_ID[c.cardId] as { type?: string; flags?: { benchOnly?: boolean } } | undefined;
  return c.zone === 'bench' && d?.type === 'hero' && !d.flags?.benchOnly && !rooted(c);
}

/** A status on the hero locks its abilities (Stun, Silence, Sleep, a channel…): the
 *  statuses' own data says which block 'skill'. An active item is an ability too. */
export function abilitiesLocked(hero: CardInstance): boolean {
  return hero.statuses.some((s) => STATUSES_BY_ID[s.id]?.blocks?.includes('skill'));
}

// ---------------------------------------------------------------------------
// Rules oracle: the basic attack. Written from the rules, not copied from
// `attackTargets` / `attackBlocked`: one attack a turn, in the act step, so it is
// open when it is not Turn 1, the shop is closed, the turn's attack has not
// been made, and the Active is standing (whatever abilities it used first); it
// may be aimed at the rival's living Active — or, if a passive of the hero's or
// a piece of gear it wears has `reach`, at any living enemy hero — and never at
// a hero under a Dome.
// ---------------------------------------------------------------------------

/** The ability ids a hero carries: its own passives, then its worn passive items'. */
function carriedAbilityIds(hero: CardInstance): string[] {
  const data = CARDS_BY_ID[hero.cardId];
  const worn = (hero.attached ?? []).flatMap((a) => {
    const d = CARDS_BY_ID[a.cardId];
    return d?.type === 'equipment' ? d.abilities ?? [] : [];
  });
  return [...(data?.type === 'hero' ? data.passives ?? [] : []), ...worn];
}

/** Does a passive of the hero's, or gear it wears, give its attack reach? */
function carriesReach(hero: CardInstance): boolean {
  return carriedAbilityIds(hero).some((id) => !!getAbility(id)?.reach);
}

/** Is an attack open to `pid`'s Active at all (whoever it might aim at, and
 *  whatever the swing would deal)? Not while a choice is owed (the opening's
 *  first Active, a draw card's discard). */
export function attackOpenFor(G: GameState, pid: PlayerID): boolean {
  const active = G.players[pid].active;
  return !G.draft && !G.pendingActive && !G.pendingDiscard && G.turnNumber > 1 && !G.attackUsed && !!active && !isRespawning(active);
}

// ---------------------------------------------------------------------------
// Rules oracle: the Retreat's price. Written from the card text, not copied from
// `retreatCost`: the retreat printed on the hero leaving the Active slot (0, 1
// or 2, docs/hero-design.md §2), a soul off for each "Retreat costs 1 less" it
// carries (Sprint Boots, Enduring Speed: their `retreatDiscount` hooks),
// nothing while that hero is Swift; never below 0.
// ---------------------------------------------------------------------------

/** What `pid`'s Retreat costs, by the rules. */
export function retreatCostOracle(G: GameState, pid: PlayerID): number {
  const leaving = G.players[pid].active;
  if (!leaving) return 0;
  if (leaving.statuses.some((s) => s.id === 'swift')) return 0;
  const d = CARDS_BY_ID[leaving.cardId];
  const printed = d?.type === 'hero' ? d.retreat : 0;
  const off = carriedAbilityIds(leaving).reduce((n, id) => n + (getAbility(id)?.retreatDiscount?.(leaving) ?? 0), 0);
  return Math.max(0, printed - off);
}

// ---------------------------------------------------------------------------
// Rules oracle: items. Written from docs/deck-plan.md and the card data, NOT
// copied from query.ts / legality.ts: an item lists at PRICE by its tier; it is
// put on a hero from the hand for that price — or, an upgrade onto the hero
// that wears the component its data names, for the difference (it evolves:
// the component leaves the hero for the discard pile); a hero wears MAX_ITEMS
// (FLEX_SLOT more once its side has the flex slot), never two of one item; a
// merged Rem is a hero riding on her ally, never an item. Playing an item
// Deadlock builds into others (the items whose `upgradesFrom` names it) makes
// one of them — the player's pick, else the first — and shuffles it into the
// deck.
// ---------------------------------------------------------------------------

/** What an item lists at: its tier's price. Anything that is no item lists at 0. */
export function itemPriceOracle(cardId: unknown): number {
  const d = itemData(cardId);
  return d ? PRICE[d.tier] : 0;
}

/** The items a hero wears, actives and passives, in worn order (a merged Rem is not one). */
export function wornItemsOf(hero: CardInstance): CardInstance[] {
  return (hero.attached ?? []).filter((a) => !!itemData(a.cardId));
}

/** How many items a hero of `pid` may wear. */
export function slotCapOracle(G: GameState, pid: PlayerID): number {
  return MAX_ITEMS + (G.players[pid].flexSlot ? FLEX_SLOT : 0);
}

/** The worn item an upgrade `itemId` played onto `hero` evolves: the component
 *  the item's data says it is built from, when the hero wears it. */
export function upgradeComponentOracle(hero: CardInstance, itemId: unknown): CardInstance | undefined {
  const from = itemData(itemId)?.upgradesFrom;
  return from ? wornItemsOf(hero).find((a) => a.cardId === from) : undefined;
}

/** What putting `itemId` on `hero` costs: its price, less its component's when
 *  the hero wears the component (it evolves). Never below 0. */
export function playCostOracle(hero: CardInstance, itemId: unknown): number {
  const comp = upgradeComponentOracle(hero, itemId);
  return Math.max(0, itemPriceOracle(itemId) - (comp ? itemPriceOracle(comp.cardId) : 0));
}

/** The items built from `itemId` (whose `upgradesFrom` names it), in catalogue order. */
export function upgradesOfOracle(itemId: unknown): string[] {
  return typeof itemId === 'string' ? ITEMS.filter((i) => i.upgradesFrom === itemId).map((i) => i.id) : [];
}

/** The upgrade a play of `itemId` naming `upgradeId` makes: the one named when
 *  it is one of them, else the first; undefined when the item builds into
 *  nothing. */
export function upgradeMadeOracle(itemId: unknown, upgradeId: unknown): string | undefined {
  const ups = upgradesOfOracle(itemId);
  if (!ups.length) return undefined;
  return typeof upgradeId === 'string' && ups.includes(upgradeId) ? upgradeId : ups[0];
}

/** The draw cards, from their texts ("Draw N cards, then discard M cards from
 *  your hand"): what each casts — N drawn, then M discarded from anywhere in
 *  the hand. Pinned against the card texts by harness.spec. */
export const DRAW_CARDS: Readonly<Record<CardId, { draw: number; discard: number }>> = {
  improved_cooldown: { draw: 2, discard: 1 },
  superior_cooldown: { draw: 4, discard: 2 },
  transcendent_cooldown: { draw: 8, discard: 4 },
};

/** True while `hero` wears CATEGORY_SPIKE_ITEMS or more items of the tab `slot`
 *  (the category spike: +1 on that tab's line). */
export function hasSpikeOracle(hero: CardInstance, slot: ItemSlot): boolean {
  return wornItemsOf(hero).filter((a) => itemData(a.cardId)!.slot === slot).length >= CATEGORY_SPIKE_ITEMS;
}

/** The cooldown an active item starts on its bearer (put on, or used): the
 *  card's own when it names one (the draw cards: 2), else 2 own turns for
 *  tiers 1–2 and 3 for tiers 3 and up. (Nothing in the catalogue shortens an
 *  item's cooldown since the Cooldown family became the draw cards.) */
export function activeCooldownOracle(_bearer: CardInstance, item: ItemCard | ItemTier): number {
  if (typeof item === 'number') return item <= 2 ? ACTIVE_COOLDOWN.low : ACTIVE_COOLDOWN.high;
  const own = item.type === 'spell' ? item.cooldown : undefined;
  return own ?? (item.tier <= 2 ? ACTIVE_COOLDOWN.low : ACTIVE_COOLDOWN.high);
}

/** The cooldown an ultimate starts: ULT_COOLDOWN. */
export function ultCooldownOracle(_hero: CardInstance): number {
  return ULT_COOLDOWN;
}

/** A hero's experience as one number: the thresholds of every level it has
 *  climbed past plus its surplus toward the next. */
export function totalExp(hero: CardInstance): number {
  const level = hero.level ?? 1;
  return LEVEL_THRESHOLDS.slice(0, level - 1).reduce((a, b) => a + b, 0) + (hero.exp ?? 0);
}

/** The most experience a hero can hold (every threshold climbed). */
export const MAX_TOTAL_EXP = LEVEL_THRESHOLDS.reduce((a, b) => a + b, 0);

/** Every hero a side has on the board: the slotted ones (corpses included) and a Rem merged into one of them. */
export function heroesOfSide(ps: PlayerState): CardInstance[] {
  const slotted = boardOf(ps).filter(isHeroCard);
  return [...slotted, ...slotted.flatMap((c) => (c.attached ?? []).filter(isHeroCard))];
}

/** The list price of what a hero wears: PRICE by tier of each worn item. */
export function wornWorth(hero: CardInstance): number {
  return wornItemsOf(hero).reduce((n, a) => n + itemPriceOracle(a.cardId), 0);
}

// ---------------------------------------------------------------------------
// Rules oracle: the map (rules.md §6). Written from the rules, not copied from
// map.ts / rounds.ts: round r is both players' r-th own turns, engine turns
// 2r − 1 and 2r; a kill pushes the victim's level + 1 into its side's front
// structure, an empty lane its pusher's bullet power, both doubled from round
// 9 — and pays no souls (docs/deck-plan.md); a fallen hero waits RESPAWN_TURNS
// of its owner's turns in its slot, then goes back to the hand; what stands
// decides on more structure HP, then more net worth, then the second mover.
// ---------------------------------------------------------------------------

/** The round engine turn `G.turnNumber` belongs to. */
export function roundOracle(G: GameState): number {
  return Math.ceil(Math.max(0, G.turnNumber ?? 0) / 2);
}

/** What a push is multiplied by in round `r`. */
export function pushMultiplierOracle(r: number): number {
  return r >= LATE_GAME_ROUND ? LATE_PUSH_MULTIPLIER : 1;
}

/** What the fall of a hero of `level` pushes in round `r`. */
export function killPushOracle(level: number, r: number): number {
  return (level + KILL_BOUNTY_BASE) * pushMultiplierOracle(r);
}

/** The wait of a hero that falls, own turns of its owner's, whatever the round
 *  and whatever it wears: RESPAWN_TURNS (0: straight to the hand). */
export function respawnTimerOracle(_G: GameState, _hero: CardInstance, _r: number): number {
  return RESPAWN_TURNS;
}

/** A side's standing structure HP. */
export function structureHpOracle(ps: PlayerState): number {
  return (ps.structures ?? []).reduce((n, s) => n + Math.max(0, s.hp), 0);
}

/** A side's Patron (always the last of its track). */
export function patronOf(ps: PlayerState) {
  return (ps.structures ?? []).find((s) => s.kind === 'patron');
}

/** Who wins on what stands: more structure HP, then more net worth, then the second mover. */
export function standingWinnerOracle(G: GameState): PlayerID {
  const s0 = structureHpOracle(G.players['0']);
  const s1 = structureHpOracle(G.players['1']);
  if (s0 !== s1) return s0 > s1 ? '0' : '1';
  const w0 = netWorthOracle(G, '0');
  const w1 = netWorthOracle(G, '1');
  if (w0 !== w1) return w0 > w1 ? '0' : '1';
  return other(G.firstMover ?? '0');
}

/** A side's net worth by the rules: its souls, plus the list price of what its heroes
 *  on the board wear and of every item in its hand (a hero card lists at 0). */
export function netWorthOracle(G: GameState, pid: PlayerID): number {
  return netWorthOracleWithoutHand(G, pid) + handOf(G, pid).reduce((n, c) => n + itemPriceOracle(c.cardId), 0);
}

/** The same, the hand left out: what a net worth that forgot the hand would read. */
export function netWorthOracleWithoutHand(G: GameState, pid: PlayerID): number {
  return G.players[pid].souls + heroesOfSide(G.players[pid]).reduce((n, h) => n + wornWorth(h), 0);
}

/** What `pid`'s Active may aim its attack at, in board order (the rival's
 *  Active, then its bench), and last the Mid-Boss while it stands in the pit
 *  (from round 4: rules.md §6). Silent on whether the attack is open and
 *  whether the swing would deal anything: those are asked on their own. */
export function attackTargetsOracle(G: GameState, pid: PlayerID): CardInstance[] {
  const active = G.players[pid].active;
  const foe = G.players[other(pid)];
  if (!active) return [];
  const alive = boardOf(foe).filter((c) => isHeroCard(c) && !isRespawning(c));
  const reachable = carriesReach(active) ? alive : alive.filter((c) => c.iid === foe.active?.iid);
  const heroes = reachable.filter((c) => !c.statuses.some((s) => s.id === 'dome'));
  const boss = G.boss && G.boss.zone === 'pit' && G.boss.hp > 0 ? [G.boss] : [];
  return [...heroes, ...boss];
}

// ---------------------------------------------------------------------------
// Rules oracle: the hand and the active items — who may play and use what,
// right now. Each answers null for "allowed", else a short reason (for the
// probes' tags; only allowed / refused is compared with the engine). The
// owed choices come before everything (docs/deck-plan.md and the engine's
// contract): the opening's first Active, then a promotion, then a draw card's
// discard; then nothing but ending the turn follows the attack.
// ---------------------------------------------------------------------------

/** The seat whose turn it is, from the engine turn: the first mover's on odd
 *  turns, the other seat's on even ones; nobody's before turn 1 or in the draft. */
export function seatOnTurn(G: GameState): PlayerID | null {
  if (G.draft || !(G.turnNumber >= 1)) return null;
  const first = G.firstMover ?? '0';
  return G.turnNumber % 2 === 1 ? first : other(first);
}

/** What stops any move but the one owed (and ending the turn, but for those),
 *  in the order the choices come: the first Active, a promotion, a discard;
 *  then the attack having ended the Act. `move` is the move asked about. */
function owedOracle(G: GameState, move: string): string | null {
  if (G.pendingActive !== undefined && move !== 'chooseActive') return 'active-owed';
  if (G.pendingPromotion !== undefined && move !== 'promoteToActive') return 'promotion-owed';
  if (G.pendingDiscard !== undefined && move !== 'discard' && move !== 'promoteToActive') return 'discard-owed';
  if (G.attackUsed && move !== 'endTurn' && move !== 'promoteToActive' && move !== 'attack') return 'act-over';
  return null;
}

/** `pid`'s hero standing in a slot (the Active or the bench, corpses included) with this iid. */
export function slottedHeroOf(G: GameState, pid: PlayerID, iid: unknown): CardInstance | undefined {
  if (typeof iid !== 'string') return undefined;
  return boardOf(G.players[pid]).find((c) => c.iid === iid && isHeroCard(c));
}

/** The item with this iid one of `pid`'s heroes in a slot wears, and its bearer.
 *  A merged Rem's items are out of reach until she is back on the bench. */
export function wornItemOf(G: GameState, pid: PlayerID, iid: unknown): { item: CardInstance; bearer: CardInstance } | undefined {
  if (typeof iid !== 'string') return undefined;
  for (const bearer of boardOf(G.players[pid])) {
    const item = wornItemsOf(bearer).find((a) => a.iid === iid);
    if (item) return { item, bearer };
  }
  return undefined;
}

/** Why `pid` may not put the card `cardIid` from its hand on its hero `heroIid`
 *  (naming `upgradeId` as the upgrade it makes, when given): a choice owed
 *  first, or the attack made; it is not `pid`'s turn (the draft included); no
 *  such card is in its hand; the card is a hero (it goes on the bench); no hero
 *  of its in a slot has that iid (bench and corpses count, a merged Rem does
 *  not); the hero wears one already; its slots are full, the card evolves
 *  nothing it wears and no `replaceIid` names the worn item it takes the place
 *  of; a `replaceIid` with nothing to replace (room on the hero, or the card
 *  evolves an item it wears) or naming no item the hero wears (a merged Rem is
 *  none); `souls` (the player's, unless given) fall short of the cost; or
 *  `upgradeId` names none of the card's upgrades. */
export function playBlockedOracle(G: GameState, pid: PlayerID, cardIid: unknown, heroIid: unknown, upgradeId?: unknown, souls = G.players[pid].souls, replaceIid?: unknown): string | null {
  const owed = owedOracle(G, 'playCard');
  if (owed) return owed;
  if (seatOnTurn(G) !== pid) return 'not-your-turn';
  const card = handCardOf(G, pid, cardIid);
  if (!card) return 'not-in-hand';
  if (!itemData(card.cardId)) return 'hero-card';
  const hero = slottedHeroOf(G, pid, heroIid);
  if (!hero) return 'no-hero';
  const worn = wornItemsOf(hero);
  if (worn.some((a) => a.cardId === card.cardId)) return 'duplicate';
  const full = !upgradeComponentOracle(hero, card.cardId) && worn.length >= slotCapOracle(G, pid);
  if (replaceIid === undefined) {
    if (full) return 'full';
  } else if (!full) return 'replace-not-full';
  else if (!worn.some((a) => a.iid === replaceIid)) return 'replace-not-worn';
  if (souls < playCostOracle(hero, card.cardId)) return 'souls';
  if (upgradeId !== undefined && !upgradesOfOracle(card.cardId).includes(upgradeId as string)) return 'not-an-upgrade';
  return null;
}

/** The bench slot (1..3) a hero from `pid`'s hand goes into: the first empty
 *  one no merged Rem will come back to (she keeps her old slot number). */
export function freeBenchSlotOracle(G: GameState, pid: PlayerID): number | undefined {
  const ps = G.players[pid];
  const reserved = new Set(boardOf(ps).flatMap((h) => (h.attached ?? []).filter(isMergedRem)).map((r) => r.slot));
  const i = ps.bench.findIndex((b, k) => b == null && !reserved.has((k + 1) as 1 | 2 | 3));
  return i < 0 ? undefined : i + 1;
}

/** The bench slots (1..3) a hero from `pid`'s hand may go into: the empty
 *  ones no merged Rem will come back to. */
export function freeBenchSlotsOracle(G: GameState, pid: PlayerID): number[] {
  const ps = G.players[pid];
  const reserved = new Set(boardOf(ps).flatMap((h) => (h.attached ?? []).filter(isMergedRem)).map((r) => r.slot));
  return ps.bench.flatMap((b, k) => (b == null && !reserved.has((k + 1) as 1 | 2 | 3) ? [k + 1] : []));
}

/** Why `pid` may not put the hero `cardIid` from its hand on the board — the
 *  bench slot `slot`, its first free bench slot when none is named, or
 *  (`toActive`) its empty Active slot: a choice owed first, or the attack
 *  made; not its turn; not in its hand; no hero; the Active slot holds a hero
 *  (standing or a corpse); a bench-only hero to the Active; a slot that is no
 *  bench slot; a slot taken (a hero, a corpse, or a merged Rem's); no bench
 *  slot free. */
export function placeHeroBlockedOracle(G: GameState, pid: PlayerID, cardIid: unknown, toActive: boolean, slot?: unknown): string | null {
  const owed = owedOracle(G, 'placeHero');
  if (owed) return owed;
  if (seatOnTurn(G) !== pid) return 'not-your-turn';
  const card = handCardOf(G, pid, cardIid);
  if (!card) return 'not-in-hand';
  if (!isHeroCard(card)) return 'not-hero';
  if (toActive) {
    if (G.players[pid].active) return 'occupied';
    if ((CARDS_BY_ID[card.cardId] as { flags?: { benchOnly?: boolean } }).flags?.benchOnly) return 'bench-only';
    return null;
  }
  if (slot !== undefined) {
    if (slot !== 1 && slot !== 2 && slot !== 3) return 'bad-slot';
    return freeBenchSlotsOracle(G, pid).includes(slot) ? null : 'slot-taken';
  }
  return freeBenchSlotOracle(G, pid) === undefined ? 'bench-full' : null;
}

/** Why the hero `cardIid` may not take the lane as its side's first Active:
 *  no first Active is owed; it is not in the owing seat's deck (its drafted
 *  heroes); it is no hero; it is bench-only. Either seat may make it. */
export function chooseActiveBlockedOracle(G: GameState, cardIid: unknown): string | null {
  const pid = G.pendingActive;
  if (pid === undefined) return 'not-owed';
  const card = typeof cardIid === 'string' ? deckOf(G, pid).find((c) => c.iid === cardIid) : undefined;
  if (!card) return 'not-in-deck';
  if (!isHeroCard(card)) return 'not-hero';
  if ((CARDS_BY_ID[card.cardId] as { flags?: { benchOnly?: boolean } }).flags?.benchOnly) return 'bench-only';
  return null;
}

/** The cards a `discard(arg)` move names: an array as it is, anything else as a list of one. */
export function discardList(arg: unknown): unknown[] {
  return Array.isArray(arg) ? arg : [arg];
}

/** Why `pid` may not discard the hand cards `cardIids` now: the opening or a
 *  promotion owed first, or the attack made; no discard is owed by `pid`; the
 *  list is empty, longer than what is owed, names a card twice, or names one
 *  not in `pid`'s hand. */
export function discardBlockedOracle(G: GameState, pid: PlayerID, cardIids: unknown[]): string | null {
  const owed = owedOracle(G, 'discard');
  if (owed) return owed;
  const d = G.pendingDiscard;
  if (!d || d.pid !== pid) return 'not-owed';
  if (cardIids.length === 0) return 'none';
  if (cardIids.length > d.count) return 'too-many';
  if (new Set(cardIids).size !== cardIids.length) return 'repeat';
  if (!cardIids.every((iid) => handCardOf(G, pid, iid))) return 'not-in-hand';
  return null;
}

/** Who an active item may be aimed at, by its bearer: the board cards its first
 *  ability's TargetFilter allows with the bearer as the source, or 'none' for an
 *  item that takes no target. A passive item, or no item, has []. */
export function activateTargetsOracle(G: GameState, pid: PlayerID, item: CardInstance, bearer: CardInstance): CardInstance[] | 'none' {
  const filter = filterForItem(item);
  if (filter === null || filter === 'passive') return [];
  if (filter === 'noTarget') return 'none';
  return boardUnits(G).filter((t) => targetLegal(filter, t, bearer, pid, G));
}

/**
 * Why `pid` may not use the item `itemIid` aimed at `targetIid` (rules.md §5):
 * a choice owed comes first, and nothing follows the attack; the item is worn
 * by one of `pid`'s heroes in a slot (bench included) and is an ACTIVE one; its
 * bearer stands, has not used its one ability this turn (skill, item and
 * ultimate share it) and no status locks its abilities; a hard crowd-control
 * item has a charge left (it has no cooldown), any other is off cooldown; and
 * the target is one its filter allows — named when the item takes one. Whose
 * turn it is, boardgame.io sees to.
 */
export function activateBlockedOracle(G: GameState, pid: PlayerID, itemIid: unknown, targetIid?: unknown): string | null {
  if (G.draft) return 'draft';
  const owed = owedOracle(G, 'activate');
  if (owed) return owed;
  const worn = wornItemOf(G, pid, itemIid);
  if (!worn) return 'not-worn';
  const { item, bearer } = worn;
  const data = itemData(item.cardId)!;
  if (data.type !== 'spell') return 'passive';
  if (isRespawning(bearer)) return 'bearer-down';
  if (bearer.skillUsedThisTurn) return 'bearer-used';
  if (abilitiesLocked(bearer)) return 'bearer-locked';
  if (data.hardCC) {
    if (!((item.charges ?? 0) > 0)) return 'no-charges';
  } else if ((item.cooldowns?.[item.cardId] ?? 0) > 0) return 'cooling';
  const targets = activateTargetsOracle(G, pid, item, bearer);
  if (targets === 'none') return null;
  if (targetIid === undefined) return 'missing-target';
  return targets.some((t) => t.iid === targetIid) ? null : 'bad-target';
}

// ---------------------------------------------------------------------------
// Direct move calls on a clone (what heuristic.ts simulateMove does).
// ---------------------------------------------------------------------------

type Outcome = 'accepted' | 'rejected' | 'threw';
interface CallResult { outcome: Outcome; G: GameState; error?: unknown }

const SWALLOW_EVENTS = new Proxy({}, { get: () => () => undefined });

function cloneG(G: GameState): GameState {
  return structuredClone(G) as GameState;
}

/** Run `DeadlockGame.moves[name]` straight on a structuredClone of G, as the
 *  AI's simulateMove and the turn-actions spec do. The clone is returned so a
 *  caller can inspect what the move did (or failed to undo). */
export function callMove(
  G: GameState,
  ctx: Ctx,
  pid: PlayerID,
  name: string,
  args: unknown[],
  /** Adjust the clone before the move runs (give souls, force a flag…). */
  prep?: (g: GameState) => void,
): CallResult {
  const g = cloneG(G);
  prep?.(g);
  const fn = (DeadlockGame.moves as Record<string, any>)[name];
  if (!fn) return { outcome: 'rejected', G: g };
  try {
    const r = fn({ G: g, ctx, playerID: pid, events: SWALLOW_EVENTS, random: {} }, ...args);
    return { outcome: r === INVALID_MOVE ? 'rejected' : 'accepted', G: g };
  } catch (error) {
    return { outcome: 'threw', G: g, error };
  }
}

// ---------------------------------------------------------------------------
// Structural diff (undefined == missing, like JSON), returns differing paths.
// ---------------------------------------------------------------------------

export function diffPaths(a: unknown, b: unknown, limit = 20): string[] {
  const out: string[] = [];
  const walk = (x: any, y: any, path: string) => {
    if (out.length >= limit) return;
    if (x === y) return;
    const xo = x !== null && typeof x === 'object';
    const yo = y !== null && typeof y === 'object';
    if (!xo || !yo) {
      if (!(Number.isNaN(x) && Number.isNaN(y))) out.push(`${path}: ${JSON.stringify(x)} != ${JSON.stringify(y)}`);
      return;
    }
    if (Array.isArray(x) !== Array.isArray(y)) { out.push(`${path}: array/object mismatch`); return; }
    if (Array.isArray(x)) {
      if (x.length !== y.length) { out.push(`${path}.length: ${x.length} != ${y.length}`); }
      const n = Math.max(x.length, y.length);
      for (let i = 0; i < n; i++) walk(x[i], y[i], `${path}[${i}]`);
      return;
    }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) walk(x[k], y[k], path ? `${path}.${k}` : k);
  };
  walk(a, b, '');
  return out;
}

// ---------------------------------------------------------------------------
// Misc spec helpers.
// ---------------------------------------------------------------------------

/** Number of games a spec plays per policy mix (FUZZ_GAMES overrides). */
export function fuzzGames(fallback: number): number {
  const n = Number(process.env.FUZZ_GAMES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** A readable block for a failed expectation. */
export function formatList(title: string, lines: string[], max = 25): string {
  const shown = lines.slice(0, max);
  const more = lines.length > max ? `\n  … and ${lines.length - max} more` : '';
  return `${title} (${lines.length}):\n  ${shown.join('\n  ')}${more}`;
}
