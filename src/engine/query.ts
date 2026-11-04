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
  PlayerID,
  PlayerState,
  StatusId,
  UltimateCard,
} from './types';
import { CARDS_BY_ID, ULTIMATES, itemCard } from '@/cards';
import { STATUSES_BY_ID, type Blockable, type Untargetable } from '@/statuses';
import type { AbilityDef, HeroAbilityDef } from '@/abilities';
import { getAbility } from './registry';
import {
  ACTIVE_COOLDOWN, CATEGORY_SPIKE_ITEMS, COMEBACK_STEPS, FLEX_SLOT, KILL_BOUNTY_BASE, MAX_ITEMS, PRICE,
  RICHEST_BOUNTY_BONUS, START_LEVEL,
} from './constants';
import { secondMover } from './rounds';

// ---------- The board ----------

export function otherPlayer(id: PlayerID): PlayerID {
  return id === '0' ? '1' : '0';
}

/** The board card with this iid, or null. An empty slot is nobody: a missing or
 *  junk iid (`undefined`, a number…) finds nothing, so callers can treat "not
 *  found" as the one answer for every id that names no card. */
export function findCardOnBoard(G: GameState, iid: string): { owner: PlayerID; card: CardInstance } | null {
  for (const pid of ['0', '1'] as PlayerID[]) {
    const ps = G.players[pid];
    if (ps.active && ps.active.iid === iid) return { owner: pid, card: ps.active };
    for (const b of ps.bench) if (b && b.iid === iid) return { owner: pid, card: b };
  }
  return null;
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

/** The bench heroes who can take the Active slot right now: alive, and not
 *  bench-only (Rem). One list for the forced promotion off a fallen Active,
 *  the paid retreat, the AI and the board, so they cannot disagree. */
export function stepInCandidates(ps: PlayerState): CardInstance[] {
  return ps.bench.filter((b): b is CardInstance => {
    if (!b || isRespawning(b)) return false;
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

/** One way to lose: your patron's HP reaches 0. A board with every hero down
 *  is no loss (the rival's Active pushes into the empty lane at the end of its
 *  turn instead, endTurnEffects). Should both patrons fall to one action, the
 *  one with more HP left wins, and on a tie the second mover. This is
 *  boardgame.io's `endIf`: it runs after every move on the already-resolved
 *  state. */
export function checkWinner(G: GameState): { winner?: PlayerID } | undefined {
  if (G.draft) return undefined;
  const p0 = G.players['0'].hp;
  const p1 = G.players['1'].hp;
  if (p0 > 0 && p1 > 0) return undefined;
  if (p0 <= 0 && p1 <= 0) return { winner: p0 > p1 ? '0' : p1 > p0 ? '1' : secondMover(G) };
  return { winner: p0 <= 0 ? '1' : '0' };
}

/** Patron HP a hero's fall costs its owner: the fallen hero's level, so a
 *  leveled carry is the costliest to lose — and the one worth hunting. */
export function koPatronDamage(hero: CardInstance): number {
  return hero.level ?? START_LEVEL;
}

// ---------- Worth ----------

/** What an item lists at: its tier's price (`PRICE`). Anything that is not
 *  an item lists at 0. The shop charges it, a sale refunds it (or half), and
 *  net worth counts every worn item at it. */
export function itemPrice(cardId: CardId): number {
  const data = itemCard(cardId);
  return data ? PRICE[data.tier] : 0;
}

/** The list price of everything `hero` wears. */
export function heroWorth(hero: CardInstance): number {
  return wornItems(hero).reduce((n, it) => n + itemPrice(it.cardId), 0);
}

/** The list price of the cards in a player's hand. */
export function handWorth(ps: PlayerState): number {
  return ps.hand.reduce((n, c) => n + itemPrice(c.cardId), 0);
}

/** The card with this iid in `pid`'s hand, or undefined. */
export function handCard(G: GameState, pid: PlayerID, iid: string): CardInstance | undefined {
  return G.players[pid].hand.find((c) => c.iid === iid);
}

/** True for a card bought for the difference: an upgrade priced against a
 *  component on its owner's side, which its play will consume. (A card that
 *  was not bought — a Story reward — never is.) */
export function boughtAtDiscount(card: CardInstance): boolean {
  return card.paid !== undefined && card.paid < itemPrice(card.cardId);
}

/** `pid`'s copies of the item `cardId`: those in its hand, then those its
 *  heroes wear (`heroesOf`: the slotted ones in board order, then a Rem merged
 *  into one of them). */
export function copiesOnSide(G: GameState, pid: PlayerID, cardId: CardId): CardInstance[] {
  const ps = G.players[pid];
  const worn = heroesOf(ps).flatMap((h) => wornItems(h).filter((it) => it.cardId === cardId));
  return [...ps.hand.filter((c) => c.cardId === cardId), ...worn];
}

/** Every hero a side has, wherever it stands: the Active, the bench (corpses
 *  included) and a Rem merged into an ally, who rides in its `attached` list. */
export function heroesOf(ps: PlayerState): CardInstance[] {
  const slotted = [ps.active, ...ps.bench].filter((c): c is CardInstance => !!c && !!heroData(c));
  return [...slotted, ...slotted.flatMap((c) => (c.attached ?? []).filter((a) => !!heroData(a)))];
}

/** A side's net worth: the souls it holds plus the list price of every item
 *  its heroes wear and every card in its hand. The comeback at income time
 *  reads it. */
export function netWorth(G: GameState, pid: PlayerID): number {
  const ps = G.players[pid];
  return ps.souls + heroesOf(ps).reduce((n, h) => n + heroWorth(h), 0) + handWorth(ps);
}

/** True when `hero` wears strictly more (by list price) than every other hero
 *  on the board, both sides counted; a tie for the top makes nobody richest. */
export function isRichestHero(G: GameState, hero: CardInstance): boolean {
  const mine = heroWorth(hero);
  if (mine <= 0) return false;
  const others = (['0', '1'] as PlayerID[]).flatMap((pid) => heroesOf(G.players[pid])).filter((h) => h.iid !== hero.iid);
  return others.every((h) => heroWorth(h) < mine);
}

/** Souls a kill pays the victim's opponent: the victim's level plus
 *  KILL_BOUNTY_BASE, and RICHEST_BOUNTY_BONUS more when it was strictly the
 *  richest hero on the board. */
export function killBounty(G: GameState, hero: CardInstance): number {
  return (hero.level ?? START_LEVEL) + KILL_BOUNTY_BASE + (isRichestHero(G, hero) ? RICHEST_BOUNTY_BONUS : 0);
}

/** The comeback `pid` collects with its income: the largest COMEBACK_STEPS
 *  bonus whose deficit its net worth trails the rival's by. */
export function comebackBonus(G: GameState, pid: PlayerID): number {
  const behind = netWorth(G, otherPlayer(pid)) - netWorth(G, pid);
  let bonus = 0;
  for (const [by, add] of COMEBACK_STEPS) if (behind >= by) bonus = Math.max(bonus, add);
  return bonus;
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

/** Own turns an active item of `tier` waits after use (and when bought) on
 *  `bearer`: ACTIVE_COOLDOWN by tier, less the bearer's `cooldownCut` hooks
 *  (the Cooldown family), never under 1. */
export function activeCooldown(bearer: CardInstance, tier: ItemTier): number {
  const base = tier <= 2 ? ACTIVE_COOLDOWN.low : ACTIVE_COOLDOWN.high;
  return Math.max(1, base - cooldownCut(bearer, 'item'));
}

/** Own turns the active item `item` has left to cool down (0: ready). */
export function itemCooldown(item: CardInstance): number {
  return item.cooldowns?.[item.cardId] ?? 0;
}

// ---------- A hero's kit ----------

/** What kind of kit ability a hero uses: one of its skills, its own ultimate,
 *  or an ultimate it has borrowed (Sinclair's copy, `borrowedUlt`). */
export type KitKind = 'skill' | 'ult' | 'borrowed';

/** One ability a hero can use: its id, the ability that does it, and its kind. */
export interface KitAbility {
  id: AbilityId;
  ability: AbilityDef;
  kind: KitKind;
}

/** The abilities `card` may choose to use, in order: its skills, its
 *  ultimate, then an ultimate it has borrowed. Every one is used through
 *  `useSkill` naming its id; the legal-move list, the hero sheet and the
 *  board's ready glint all walk this list. */
export function kitAbilityIds(card: CardInstance): AbilityId[] {
  const data = heroData(card);
  if (!data) return [];
  const out = [...data.skills];
  if (data.ult) out.push(data.ult);
  if (card.borrowedUlt && !out.includes(card.borrowedUlt)) out.push(card.borrowedUlt);
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
  const kind: KitKind | undefined = data.skills.includes(id) ? 'skill'
    : id === data.ult ? 'ult'
    : id === card.borrowedUlt ? 'borrowed'
    : undefined;
  if (!kind) return undefined;
  const ability = getAbility(id);
  return ability ? { id, ability, kind } : undefined;
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
