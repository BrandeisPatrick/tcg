/**
 * Shared helpers for the fuzz harness: card enumeration, rules oracles — which
 * targets an ability or an active item may be aimed at, what an item costs and
 * what a sale brings back, who may buy, sell, move, play and use which card,
 * what a play consumes and what a same-turn sale puts back — direct
 * (non-client) move calls on a cloned state, and a structural diff. Nothing here
 * mutates the live G — every helper that runs the engine does it on a
 * structuredClone.
 */
import { INVALID_MOVE } from 'boardgame.io/core';
import type { Ctx } from 'boardgame.io';
import type { CardId, CardInstance, GameState, ItemCard, ItemSlot, ItemTier, Owner, PlayerID, PlayerState } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { STATUSES_BY_ID } from '@/statuses';
import { DeadlockGame } from '@/engine/game';
import { getAbility, type TargetFilter } from '@/abilities';
import {
  ACTIVE_COOLDOWN, CATEGORY_SPIKE_ITEMS, FLEX_SLOT, KILL_BOUNTY_BASE, LATE_GAME_ROUND, LATE_PUSH_MULTIPLIER, LEVEL_THRESHOLDS,
  MAX_ITEMS, PRICE, RESPAWN_BY_ROUND, RETREAT_COST, RICHEST_BOUNTY_BONUS, RICH_RESPAWN_PENALTY, ULT_COOLDOWN, ULT_UNLOCK_LEVEL,
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
 *  they carry (worn items, a merged Rem and what she wears), the cards in each
 *  player's hand (place 'hand'), and the Mid-Boss in the pit (place 'pit',
 *  owned by nobody) — with a label for where it sits. There is no deck and no
 *  discard pile: a card is on the board, in a hand, or gone. (A component an
 *  upgrade consumed this turn is kept on the upgrade's `replaced`, out of
 *  play: it is not walked.) */
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
    for (const c of ps.hand ?? []) walk(c, 'hand', pid);
  }
  if (G.boss) walk(G.boss, 'pit', 'none');
  return out;
}

/** The cards in `pid`'s hand, in the order they came. */
export function handOf(G: GameState, pid: PlayerID): CardInstance[] {
  return G.players[pid].hand ?? [];
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

/** The kit abilities a hero may use, in order: the skills its card lists (one
 *  or two, none for a passive-only hero), its ultimate, then an ultimate it has
 *  borrowed (Sinclair's copy). The first skill (`firstSkillOf`) is what a bare
 *  `useSkill` names; every other is named. Read off the card and the instance,
 *  not the engine. */
export function skillIdsOf(hero: CardInstance): string[] {
  const d = CARDS_BY_ID[hero.cardId];
  if (d?.type !== 'hero') return [];
  const ids = [...d.skills];
  if (d.ult) ids.push(d.ult);
  if (hero.borrowedUlt && !ids.includes(hero.borrowedUlt)) ids.push(hero.borrowedUlt);
  return ids;
}

/** The skill a bare `useSkill` names: the first its card lists, if any. */
export function firstSkillOf(hero: CardInstance): string | undefined {
  const d = CARDS_BY_ID[hero.cardId];
  return d?.type === 'hero' ? d.skills[0] : undefined;
}

/** The TargetFilter that governs one of a hero's kit abilities (`skillId`;
 *  left out, its first skill), or null when the hero has no such ability. */
export function filterForSkill(hero: CardInstance, skillId?: string): TargetFilter | null {
  const ids = skillIdsOf(hero);
  const id = skillId ?? firstSkillOf(hero);
  if (id === undefined || !ids.includes(id)) return null;
  return getAbility(id)?.target ?? null;
}

/** An ability that is never aimed at its own caster (Rem's merge), whatever its filter says. */
export function skillExcludesSelf(hero: CardInstance, skillId?: string): boolean {
  const ids = skillIdsOf(hero);
  const id = skillId ?? firstSkillOf(hero);
  return id !== undefined && ids.includes(id) && !!getAbility(id)?.excludeSelf;
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
 *  whatever the swing would deal)? */
export function attackOpenFor(G: GameState, pid: PlayerID): boolean {
  const active = G.players[pid].active;
  return !G.draft && G.step === 'act' && G.turnNumber > 1 && !G.attackUsed && !!active && !isRespawning(active);
}

// ---------------------------------------------------------------------------
// Rules oracle: the Retreat's price. Written from the card text, not copied from
// `retreatCost`: 1 soul, a soul off for each "Retreat costs 1 less" the hero
// leaving the Active slot carries (Sprint Boots, Enduring Speed: their
// `retreatDiscount` hooks), nothing while that hero is Swift; never below 0.
// ---------------------------------------------------------------------------

/** What `pid`'s Retreat costs, by the rules. */
export function retreatCostOracle(G: GameState, pid: PlayerID): number {
  const leaving = G.players[pid].active;
  if (!leaving) return RETREAT_COST;
  if (leaving.statuses.some((s) => s.id === 'swift')) return 0;
  const off = carriedAbilityIds(leaving).reduce((n, id) => n + (getAbility(id)?.retreatDiscount?.(leaving) ?? 0), 0);
  return Math.max(0, RETREAT_COST - off);
}

// ---------------------------------------------------------------------------
// Rules oracle: items. Written from rules.md §2–§5 and the hand's rules (the
// step 2b brief), NOT copied from query.ts / legality.ts: an item lists at PRICE
// by its tier; a card bought goes to the hand, an upgrade costing the
// difference while a free copy of the component its data names is on the
// buyer's side (in its hand, or worn by one of its heroes in a slot — not a
// merged Rem's), a copy being claimed by each upgrade of it in the hand bought
// for the difference; a card played onto a hero consumes its component — the
// copy the hero wears, else one in the hand (one bought at full price first),
// else, for a card bought for the difference, the copy another of the player's
// heroes wears — and a hand copy bought for the difference settles its own
// component the same way; a sale refunds what was paid on the engine turn it
// was bought, else half the price rounded down, and a worn upgrade sold on its
// buy turn puts its component back (onto the hero it came from while it has
// room and wears no copy, else into the hand); a hero wears MAX_ITEMS (FLEX_SLOT
// more once its side has the flex slot), never two of one item; a merged Rem is
// a hero riding on her ally, never an item.
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

/** The worn item an upgrade `itemId` played onto `hero` takes the place of: the
 *  component the item's data says it is built from, when the hero wears it. */
export function upgradeComponentOracle(hero: CardInstance, itemId: unknown): CardInstance | undefined {
  const from = itemData(itemId)?.upgradesFrom;
  return from ? wornItemsOf(hero).find((a) => a.cardId === from) : undefined;
}

/** A card bought for the difference: less was paid than its list price. A card
 *  that was not bought (a Story reward) never was. */
export function boughtAtDiscountOracle(card: CardInstance): boolean {
  return card.paid !== undefined && card.paid < itemPriceOracle(card.cardId);
}

/** `pid`'s copies of `cardId` on its side: in its hand, and worn by its heroes —
 *  those in a slot (corpses included) and a Rem merged into one of them. */
export function copiesOnSideOracle(G: GameState, pid: PlayerID, cardId: unknown): CardInstance[] {
  const worn = heroesOfSide(G.players[pid]).flatMap((h) => wornItemsOf(h));
  return [...handOf(G, pid), ...worn].filter((c) => c.cardId === cardId);
}

/** The copies of `componentId` on `pid`'s side no upgrade has claimed: each upgrade
 *  of it in the hand bought for the difference claims one (its play will consume it). */
export function freeCopiesOracle(G: GameState, pid: PlayerID, componentId: unknown): number {
  const claims = handOf(G, pid).filter((c) => boughtAtDiscountOracle(c) && itemData(c.cardId)?.upgradesFrom === componentId).length;
  return copiesOnSideOracle(G, pid, componentId).length - claims;
}

/** What `pid` pays for `itemId`: its price, less its component's while a free copy of
 *  the component is on its side. Never below 0; anything that is no item lists at 0. */
export function buyPriceOracle(G: GameState, pid: PlayerID, itemId: unknown): number {
  const from = itemData(itemId)?.upgradesFrom;
  const off = from && freeCopiesOracle(G, pid, from) > 0 ? itemPriceOracle(from) : 0;
  return Math.max(0, itemPriceOracle(itemId) - off);
}

/** What selling `item` (in the hand or worn) brings back: what was paid for it
 *  when it was bought on this engine turn, else half its price, rounded down. */
export function sellRefundOracle(G: GameState, item: CardInstance): number {
  if (item.boughtOnTurn === G.turnNumber) return item.paid ?? itemPriceOracle(item.cardId);
  return Math.floor(itemPriceOracle(item.cardId) / 2);
}

/** One component a play consumes: the card, and the hero that wore it (absent:
 *  it came from the hand). */
export interface ConsumedOracle { item: CardInstance; from?: CardInstance }

/**
 * Everything `card` (in `pid`'s hand) played onto `hero` consumes, in order:
 * the component it takes — the copy `hero` wears; else a copy in the hand, one
 * bought at full price before one bought for the difference; else, when `card`
 * was bought for the difference, the copy another of `pid`'s heroes wears (those
 * in a slot in board order, then a merged Rem); else none — and then, when that component came from the
 * hand and was itself bought for the difference, the component it settles the
 * same way (with no hero of its own), and so on. Read on the board before the
 * play; a card already taken is not taken twice.
 */
export function playConsumesOracle(G: GameState, pid: PlayerID, card: CardInstance, hero: CardInstance | undefined): ConsumedOracle[] {
  const out: ConsumedOracle[] = [];
  const gone = new Set<string>([card.iid]);
  let next: CardInstance | undefined = card;
  let target = hero;
  while (next) {
    const taking: CardInstance = next;
    const from = itemData(taking.cardId)?.upgradesFrom;
    if (!from) break;
    let taken: ConsumedOracle | undefined;
    const worn = target ? wornItemsOf(target).find((a) => a.cardId === from && !gone.has(a.iid)) : undefined;
    if (worn) taken = { item: worn, from: target };
    if (!taken) {
      const held = handOf(G, pid).filter((c) => c.cardId === from && !gone.has(c.iid));
      const inHand = held.find((c) => !boughtAtDiscountOracle(c)) ?? held[0];
      if (inHand) taken = { item: inHand };
    }
    if (!taken && boughtAtDiscountOracle(taking)) {
      for (const h of heroesOfSide(G.players[pid])) {
        if (h === target) continue;
        const it = wornItemsOf(h).find((a) => a.cardId === from && !gone.has(a.iid));
        if (it) { taken = { item: it, from: h }; break; }
      }
    }
    if (!taken) break;
    out.push(taken);
    gone.add(taken.item.iid);
    // Only a copy from the hand bought for the difference settles a component of its own.
    next = !taken.from && boughtAtDiscountOracle(taken.item) ? taken.item : undefined;
    target = undefined;
  }
  return out;
}

/** Where one component a same-turn sale puts back lands: on that hero, or in the hand. */
export interface RestoredOracle { item: CardInstance; to: CardInstance | 'hand' }

/**
 * What selling the worn `item` (its bearer `bearer`) puts back, read on the board
 * before the sale: nothing unless it was bought on this engine turn and holds the
 * component its play consumed (`replaced`); then that component goes onto the hero
 * it came from (`replacedFrom`) while that hero — one of `pid`'s in a slot — has
 * room and wears no copy, else into the hand; and the component it consumed in
 * turn after it, the same way.
 */
export function restoredBySaleOracle(G: GameState, pid: PlayerID, item: CardInstance, bearer: CardInstance): RestoredOracle[] {
  if (item.boughtOnTurn !== G.turnNumber) return [];
  const out: RestoredOracle[] = [];
  const wearing = new Map<string, string[]>();
  const worn = (h: CardInstance) => {
    if (!wearing.has(h.iid)) wearing.set(h.iid, wornItemsOf(h).filter((a) => a.iid !== item.iid).map((a) => a.cardId));
    return wearing.get(h.iid)!;
  };
  if (!wornItemsOf(bearer).some((a) => a.iid === item.iid)) return [];
  let comp = item.replaced;
  let fromIid = item.replacedFrom;
  while (comp) {
    const hero = fromIid !== undefined ? slottedHeroOf(G, pid, fromIid) : undefined;
    if (hero && worn(hero).length < slotCapOracle(G, pid) && !worn(hero).includes(comp.cardId)) {
      worn(hero).push(comp.cardId);
      out.push({ item: comp, to: hero });
    } else out.push({ item: comp, to: 'hand' });
    fromIid = comp.replacedFrom;
    comp = comp.replaced;
  }
  return out;
}

/** True while `hero` wears CATEGORY_SPIKE_ITEMS or more items of the tab `slot`
 *  (the category spike: +1 on that tab's line). */
export function hasSpikeOracle(hero: CardInstance, slot: ItemSlot): boolean {
  return wornItemsOf(hero).filter((a) => itemData(a.cardId)!.slot === slot).length >= CATEGORY_SPIKE_ITEMS;
}

/** The Cooldown family, from the card texts: own turns off the cooldowns the
 *  bearer starts — its ultimate's and its active items'. Compress Cooldown "The
 *  bearer's ultimate cools down 1 turn faster"; Superior "ultimate and active
 *  items cool down 1 turn faster"; Transcendent "ultimate cools down 2 turns
 *  faster, and its active items 1 turn faster". Never under 1 turn. */
export const COOLDOWN_CUT: Readonly<Record<CardId, { ult: number; item: number }>> = {
  improved_cooldown: { ult: 1, item: 0 },
  superior_cooldown: { ult: 1, item: 1 },
  transcendent_cooldown: { ult: 2, item: 1 },
};

/** Own turns `hero`'s worn Cooldown family takes off what it starts. */
export function cooldownCutOracle(hero: CardInstance, kind: 'ult' | 'item'): number {
  return wornItemsOf(hero).reduce((n, a) => n + (COOLDOWN_CUT[a.cardId]?.[kind] ?? 0), 0);
}

/** The cooldown an active item of `tier` starts on its bearer (bought, or used):
 *  2 own turns for tiers 1–2, 3 for tiers 3–4, less the bearer's Cooldown
 *  family, never under 1. */
export function activeCooldownOracle(bearer: CardInstance, tier: ItemTier): number {
  const full = tier <= 2 ? ACTIVE_COOLDOWN.low : ACTIVE_COOLDOWN.high;
  return Math.max(1, full - cooldownCutOracle(bearer, 'item'));
}

/** The cooldown an ultimate starts: ULT_COOLDOWN less the Cooldown family, never under 1. */
export function ultCooldownOracle(hero: CardInstance): number {
  return Math.max(1, ULT_COOLDOWN - cooldownCutOracle(hero, 'ult'));
}

/** A hero's experience as one number: the thresholds of every level it has
 *  climbed past plus its surplus toward the next. */
export function totalExp(hero: CardInstance): number {
  const level = hero.level ?? 1;
  return LEVEL_THRESHOLDS.slice(0, level - 1).reduce((a, b) => a + b, 0) + (hero.exp ?? 0);
}

/** The most experience a hero can hold (every threshold climbed). */
export const MAX_TOTAL_EXP = LEVEL_THRESHOLDS.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Rules oracle: what a kill pays. Written from rules.md §2, not copied from
// `killBounty`: the victim's level plus one, and two more when the victim was
// strictly the richest hero on the board — the highest list price of the items
// it wears (actives and passives) among every hero of both sides; a tie pays no
// extra. Worn items survive a death, so the board after the move says it.
// ---------------------------------------------------------------------------

/** Every hero a side has: the slotted ones (corpses included) and a Rem merged into one of them. */
export function heroesOfSide(ps: PlayerState): CardInstance[] {
  const slotted = boardOf(ps).filter(isHeroCard);
  return [...slotted, ...slotted.flatMap((c) => (c.attached ?? []).filter(isHeroCard))];
}

/** The list price of what a hero wears: PRICE by tier of each worn item. */
export function wornWorth(hero: CardInstance): number {
  return wornItemsOf(hero).reduce((n, a) => n + itemPriceOracle(a.cardId), 0);
}

/** What the fall of `hero` pays its opponent, by the rules, read on the board `G`. */
export function bountyOracle(G: GameState, hero: CardInstance): number {
  const mine = wornWorth(hero);
  const others = PIDS.flatMap((p) => heroesOfSide(G.players[p])).filter((h) => h.iid !== hero.iid);
  const richest = mine > 0 && others.every((h) => wornWorth(h) < mine);
  return (hero.level ?? 1) + KILL_BOUNTY_BASE + (richest ? RICHEST_BOUNTY_BONUS : 0);
}

/** Strictly the richest hero on the board, by the rules (a tie for the top: nobody). */
export function richestOracle(G: GameState, hero: CardInstance): boolean {
  const mine = wornWorth(hero);
  const others = PIDS.flatMap((p) => heroesOfSide(G.players[p])).filter((h) => h.iid !== hero.iid);
  return mine > 0 && others.every((h) => wornWorth(h) < mine);
}

// ---------------------------------------------------------------------------
// Rules oracle: the map (rules.md §6). Written from the rules, not copied from
// map.ts / rounds.ts: round r is both players' r-th own turns, engine turns
// 2r − 1 and 2r; a kill pushes the victim's level + 1 into its side's front
// structure, an empty lane its pusher's bullet power, both doubled from round
// 9; a fallen hero waits 1 own turn in rounds 1–4, 2 in rounds 5–8, 3 from
// round 9, one more when it was strictly the richest; what stands decides on
// more structure HP, then more net worth, then the second mover.
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

/** The own turns a hero that falls in round `r` waits, before the richest penalty. */
export function respawnBandOracle(r: number): number {
  let turns = RESPAWN_BY_ROUND[0][1];
  for (const [from, n] of RESPAWN_BY_ROUND) if (r >= from) turns = n;
  return turns;
}

/** The respawn timer of `hero` falling in round `r` on the board `G`. */
export function respawnTimerOracle(G: GameState, hero: CardInstance, r: number): number {
  return respawnBandOracle(r) + (richestOracle(G, hero) ? RICH_RESPAWN_PENALTY : 0);
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
 *  wear and of every card in its hand. */
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
// Rules oracle: the shop, the hand and the active items — who may buy, sell,
// move, play and use what, right now. Each answers null for "allowed", else a
// short reason (for the probes' tags; only allowed / refused is compared with
// the engine).
// ---------------------------------------------------------------------------

/** The seat whose turn it is, from the engine turn: the first mover's on odd
 *  turns, the other seat's on even ones; nobody's before turn 1 or in the draft. */
export function seatOnTurn(G: GameState): PlayerID | null {
  if (G.draft || !(G.turnNumber >= 1)) return null;
  const first = G.firstMover ?? '0';
  return G.turnNumber % 2 === 1 ? first : other(first);
}

/** Why the shop is shut to `pid` (rules.md §3): an owed promotion comes before
 *  everything, the shop is the current player's own, it is open only in the
 *  shop step, and nothing but ending the turn follows the attack. */
export function shopShutOracle(G: GameState, pid: PlayerID): string | null {
  if (G.pendingPromotion !== undefined) return 'promotion-owed';
  if (seatOnTurn(G) !== pid) return 'not-your-turn';
  if (G.step !== 'shop') return 'not-shop-step';
  if (G.attackUsed) return 'act-over';
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

/** Why `pid` may not buy `itemId`: the shop is shut; it is no item, or not in this
 *  match's market; `souls` (the player's, unless given) fall short of its price
 *  (`buyPriceOracle`). No hero is named: the card goes to the hand. */
export function buyBlockedOracle(G: GameState, pid: PlayerID, itemId: unknown, souls = G.players[pid].souls): string | null {
  const shut = shopShutOracle(G, pid);
  if (shut) return shut;
  const data = itemData(itemId);
  if (!data) return 'no-item';
  if (!(G.market ?? []).includes(data.id)) return 'off-market';
  if (souls < buyPriceOracle(G, pid, data.id)) return 'souls';
  return null;
}

/** Why `pid` may not sell `iid`: the shop is shut; it is neither a card in its hand nor
 *  an item one of its heroes in a slot wears; or it is the last free copy of a component
 *  an upgrade in its hand was bought for the difference against (claimed). */
export function sellBlockedOracle(G: GameState, pid: PlayerID, iid: unknown): string | null {
  const shut = shopShutOracle(G, pid);
  if (shut) return shut;
  const card = handCardOf(G, pid, iid) ?? wornItemOf(G, pid, iid)?.item;
  if (!card) return 'not-owned';
  if (freeCopiesOracle(G, pid, card.cardId) <= 0) return 'claimed';
  return null;
}

/** Why `pid` may not play `cardIid` from its hand onto its hero `heroIid`: an owed
 *  promotion comes first; nothing but ending the turn follows the attack; it is not
 *  `pid`'s turn (the draft included); no such card is in its hand; no hero of its in a
 *  slot has that iid (bench and corpses count, a merged Rem does not); the hero wears
 *  one already; or its slots are full and the card upgrades nothing it wears. Either
 *  step of the turn. */
export function playBlockedOracle(G: GameState, pid: PlayerID, cardIid: unknown, heroIid: unknown): string | null {
  if (G.pendingPromotion !== undefined) return 'promotion-owed';
  if (G.attackUsed) return 'act-over';
  if (seatOnTurn(G) !== pid) return 'not-your-turn';
  const card = handCardOf(G, pid, cardIid);
  if (!card) return 'not-in-hand';
  const hero = slottedHeroOf(G, pid, heroIid);
  if (!hero) return 'no-hero';
  const worn = wornItemsOf(hero);
  if (worn.some((a) => a.cardId === card.cardId)) return 'duplicate';
  if (!upgradeComponentOracle(hero, card.cardId) && worn.length >= slotCapOracle(G, pid)) return 'full';
  return null;
}

/** Why `pid` may not move `itemIid` to its hero `toHeroIid`: the shop is shut;
 *  none of its heroes in a slot wears it (a card in the hand is played, not
 *  moved); the hero is none of its own in a slot, or the one wearing it; the hero
 *  wears one already; or its slots are full. */
export function moveItemBlockedOracle(G: GameState, pid: PlayerID, itemIid: unknown, toHeroIid: unknown): string | null {
  const shut = shopShutOracle(G, pid);
  if (shut) return shut;
  const worn = wornItemOf(G, pid, itemIid);
  if (!worn) return 'not-worn';
  const to = slottedHeroOf(G, pid, toHeroIid);
  if (!to) return 'no-hero';
  if (to.iid === worn.bearer.iid) return 'same-hero';
  if (wornItemsOf(to).some((a) => a.cardId === worn.item.cardId)) return 'duplicate';
  if (wornItemsOf(to).length >= slotCapOracle(G, pid)) return 'full';
  return null;
}

/** Why `pid` may not close the shop: it is shut to `pid` already. */
export function closeShopBlockedOracle(G: GameState, pid: PlayerID): string | null {
  return shopShutOracle(G, pid);
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
 * Why `pid` may not use the item `itemIid` aimed at `targetIid` (rules.md §3 and
 * §5): an owed promotion comes first; items are used in the act step and not
 * after the attack; the item is worn by one of `pid`'s heroes in a slot (bench
 * included) and is an ACTIVE one; its bearer stands, has not used its one
 * ability this turn (skill, item and ultimate share it) and no status locks its
 * abilities; a hard crowd-control item has a charge left (it has no cooldown),
 * any other is off cooldown; and the target is one its filter allows — named
 * when the item takes one. Whose turn it is, boardgame.io sees to.
 */
export function activateBlockedOracle(G: GameState, pid: PlayerID, itemIid: unknown, targetIid?: unknown): string | null {
  if (G.draft) return 'draft';
  if (G.pendingPromotion !== undefined) return 'promotion-owed';
  if (G.step !== 'act') return 'shop-step';
  if (G.attackUsed) return 'act-over';
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
