/**
 * The AI. It knows no rules: the moves it considers are the engine's own
 * `legalActions` (legality.ts), so everything it offers is something the engine
 * has already said yes to, and it never has to be taught a new rule. What is
 * left here is judgement — how good a move, or the position it leaves, is.
 *
 * It plays the deck game by the same rules as a person (docs/deck-plan.md):
 * its deck is made from its heroes' builds at the match's start, it draws,
 * benches the heroes it draws, puts items from its hand on heroes for their
 * price (an upgrade onto the hero wearing its component evolves it for the
 * difference), casts its draw cards and pays their discards (`discardChoice`:
 * the cards worth least to it), and, when a play could make one of several
 * upgrades, picks the one its heroes' builds name.
 *
 * With lookahead (the default) every candidate is made on a copy through the
 * engine (`simulate`), and the resulting position is scored by `evalState`.
 * That captures target choice, lethal and the value of gear, skills and
 * ultimates without hand-tuning each case, and what a line leaves on the board:
 * the statuses it lands, the channel it starts, the Rem it merges, the souls it
 * keeps, the cards it holds. A turn is the player's to spend on cards from the
 * hand, abilities (one per hero — a skill or an ultimate for its souls, or a
 * worn active item, free) and
 * one Retreat, and then one attack, which ends it: after the attack only
 * `endTurn` is left. Ending the turn never attacks, so the AI has to choose
 * `attack` itself. Every line before the attack is valued with the attack
 * still to come (if making it helps), so a card, a buff, a bench skill, an item
 * or a Retreat is weighed by the swing it sets up, and attacking early — which
 * forfeits everything else — only wins when nothing else adds. Among plays the
 * evaluation cannot tell apart, an item goes to the hero whose build lists it.
 *
 * Without lookahead (the eval framework's random agent, the MCTS bot's rollouts)
 * the moves are only listed, ranked by cheap per-move scores.
 *
 * The map. Structure HP is the win condition, the Patron's weighed highest;
 * the flex slot and a live Rejuvenator are worth having; a Mid-Boss in the pit
 * is worth the side its damage tally favours, more as it runs low (whoever
 * leads the tally takes it when it falls); and a hero that has attacked the
 * boss has its blow at the End step still to take. So the AI finishes the boss
 * when the swing kills it and the tally gives it to its side, chips it when
 * the rival's Active is a poor target (a Dome, an Unstoppable, a lane left
 * empty), and otherwise leaves it be.
 *
 * The difficulty dial (`AiStrength`, read off the options a caller passes):
 * 'normal' is everything above. 'hard' plays every line it enumerates out to
 * the turn's attack at each target it may then make (the forecast of each),
 * not only at the default one, keeps the best, and retreats only when that
 * evaluation names a gain (no rule of thumb). 'easy' is 'normal' with a seeded
 * noise term of about ±15% of the spread of its options' scores.
 */
import type { Ctx } from 'boardgame.io';
import type { CardId, GameState, PlayerID, PlayerState, CardInstance, StatusInstance, StructureKind } from '@/engine/types';
import { CARDS_BY_ID, itemCard } from '@/cards';
import { CC_STATUSES, STATUSES_BY_ID } from '@/statuses';
import {
  checkWinner, effectiveAtk, effectiveSpirit, findCardOnBoard, findWornItem, handCard, heroWorth, isBoss, isRespawning, itemCooldown,
  itemPrice, liveBoardCards, otherPlayer, promptOwed, resolveSkill, reviveReady, slottedHeroes, wornItems,
} from '@/engine/query';
import { getAbility } from '@/abilities';
import type { Action } from '@/engine/engine';
import { attackBlocked, attackTargets, legalActions, playBlocked, upgradeComponent } from '@/engine/legality';
import { buildOf } from '@/engine/deck';
import { seededRandom } from '@/engine/rng';
import { forecastAttack, simulate } from '@/engine/forecast';
import { BOSS_RETALIATION, LANE_INCOME } from '@/engine/constants';

/** How hard the AI plays: the difficulty dial (see the head of this file). */
export type AiStrength = 'easy' | 'normal' | 'hard';
/** Every strength, easiest first. */
export const AI_STRENGTHS: readonly AiStrength[] = ['easy', 'normal', 'hard'];
/** The AI as it always was. */
export const DEFAULT_AI_STRENGTH: AiStrength = 'normal';

/** What a caller may tell the AI about the seat it plays. */
export interface AiOptions {
  /** How hard it plays (default 'normal'). */
  strength?: AiStrength;
  /** Items it may not play: restricted play (scripts/eval/restricted.ts)
   *  bars one side from an item to measure what the item is worth. */
  banned?: ReadonlySet<CardId>;
}

/** The options with their defaults filled in. */
interface Dial {
  strength: AiStrength;
  banned: ReadonlySet<CardId>;
}
const NONE: ReadonlySet<CardId> = new Set();
const dial = (o: AiOptions = {}): Dial => ({ strength: o.strength ?? DEFAULT_AI_STRENGTH, banned: o.banned ?? NONE });
const NORMAL: Dial = dial();

/** 'easy': the noise added to each option's score, as a share of the spread
 *  between the best and the worst of the scores in play, either way. */
const EASY_NOISE = 0.15;

// ----- what a status is worth ---------------------------------------------------
// The numbers `evalState` pays for statuses and channels, in its own units (a
// point of HP is worth 2). They are judgement, kept in one place so a balance
// pass can move them without touching the arithmetic below. They were set by
// play, not by eye: `scripts/eval/ai-vs-ai.ts` against the AI before them.
// Pricing a point of pure damage or of a stat at 1 won 54.4% of 40,000 seeded
// games against it; at a point of HP (2) it won 55.3%. Most of the other lines
// move the result by less than the noise (a game is decided by the draft and
// the first player's edge far more than by what a stun is worth), so move one
// only with thousands of games behind it.

/** A status adds `hvalue × scale × (byValue ? value : 1) × min(duration, turns)` to
 *  its bearer. `hvalue` is the sign and size the status declares for itself
 *  (statuses/index.ts: a buff is positive, a debuff negative), so the same line
 *  lowers an own unit that suffers a status and raises the foe's that does. */
interface Weight {
  /** Multiplies the status's own `hvalue`. */
  scale: number;
  /** The status's `value` is a magnitude that multiplies the price. */
  byValue?: true;
  /** The most turns of the status that count (a permanent one counts as this many). */
  turns: number;
}

const STATUS_WEIGHT: Record<string, Weight> = {
  // Hard crowd control: any status the engine flags `cc` (stun, silenced, disarm, sleep).
  cc:            { scale: 3,   turns: 2 },                // a denied turn is worth about a unit's threat; two turns at most
  // Damage and crowd control still to come.
  bleed:         { scale: 2,   turns: 3, byValue: true }, // pure damage: `value` a turn for up to 3 turns, each point worth a point of HP
  charged:       { scale: 3,   turns: 1 },                // a Stun on its way: the price of one denied turn
  djinns_mark:   { scale: 1.5, turns: 1, byValue: true }, // the detonation (3 spirit a stack), halved: it can be cleansed first
  reverb:        { scale: 1,   turns: 1, byValue: true }, // the echo: its stored spirit damage
  // Magnitude buffs and debuffs: each point is a point of HP saved or dealt on a hit, for the
  // next 2 turns (a permanent one counts as 2).
  bullet_resist:      { scale: 2, turns: 2, byValue: true }, // damage taken off every bullet hit
  spirit_resist:      { scale: 2, turns: 2, byValue: true }, // damage taken off every spirit hit
  weapon_power:       { scale: 2, turns: 2, byValue: true }, // extra damage on every swing
  spirit_power:       { scale: 2, turns: 2, byValue: true }, // extra damage on every skill
  weapon_power_down:  { scale: 2, turns: 2, byValue: true }, // swings that hit softer
  spirit_power_down:  { scale: 2, turns: 2, byValue: true }, // skills that hit softer
  bullet_resist_down: { scale: 2, turns: 2, byValue: true }, // extra damage taken from every bullet hit
  spirit_resist_down: { scale: 2, turns: 2, byValue: true }, // extra damage taken from every spirit hit
  healing_boost:      { scale: 2, turns: 2, byValue: true }, // extra healing on every heal
  healing_boost_down: { scale: 2, turns: 2 },                // no healing at all for up to 2 turns, worth about 2 a turn
  // Immunity.
  unstoppable:   { scale: 3,   turns: 2 },                // a turn of immunity to damage and crowd control is worth a lot: about 6 a turn
  dome:          { scale: 2,   turns: 1 },                // a turn no attack can reach the bearer: about a swing's damage
  return_fire:   { scale: 1,   turns: 2, byValue: true }, // `value` bullet damage back at each swing that lands
  ricochet:      { scale: 2,   turns: 1, byValue: true }, // `value` bullet damage to each other enemy hero on a swing this turn, its debuffs aside
  // Rooted is flagged `cc` (Unstoppable clears it) but only stops a move, so it is
  // priced here on its own rather than as a denied turn.
  rooted:        { scale: 1,   turns: 1 },
  // Not here, on purpose: Shield (counted with the unit), Extra Attack and the Siphon
  // markers (bookkeeping), and the two channels, which `channelValue` prices.
};

/** What a channelled ultimate is worth (`channelValue`): the damage it still has
 *  to deal, less the actions its caster gives up while it channels. */
const CHANNEL_WEIGHT = {
  /** The damage still to come counts in full, as threat. */
  damage: 1,
  /** A heavy channel's caster can neither attack nor cast: this share of its threat is lost for each turn left. */
  lockout: 0.5,
};

/** A hero's offensive potential: bullet attack PLUS its best skill's output
 *  (base + Spirit if it scales). This is what makes the lookahead ITEMIZE — a
 *  Spirit item raises a caster's threat (its skill), a Weapon item raises an
 *  attacker's, so the AI routes each build axis onto the hero that wants it.
 *  A hero uses one skill a turn, so the best of its skills is what it threatens. */
function heroThreat(c: CardInstance): number {
  const data = CARDS_BY_ID[c.cardId];
  let t = effectiveAtk(c);
  if (data?.type === 'hero') {
    let best: number | undefined;
    for (const id of data.skills) {
      const ab = getAbility(id);
      if (!ab || ab.base == null) continue;
      const v = ab.base + (ab.scalesSpirit ? effectiveSpirit(c) : 0);
      if (best === undefined || v > best) best = v;
    }
    if (best !== undefined) t += best;
  }
  return t;
}

/** How much of an active item's worth is still there while it cools down
 *  (a turn or two away from use again): the lookahead sees the use cost it. */
const COOLING_SHARE = 0.5;

/** What a worn draw card is worth for each card it nets (draws less
 *  discards), ready or cooling alike: what a cast gains shows in the hand it
 *  leaves (`handValue`), so a cast is weighed by the cards it brings and the
 *  hero's ability it spends, not by the card going on cooldown. */
const DRAW_NET_CARD = 2;

// Value of what a hero wears beyond its stat bonuses (+atk/+spirit/+hp, which
// heroThreat and hp already show): a passive item's ability procs and hooks
// (lifesteal, burst, resist…), and an active item's effect, ready to use. The
// 1-ply lookahead sees no benefit in a proc item otherwise (wearing one changes
// nothing on the board this turn), and using an active puts it on cooldown or
// spends a charge, which is the price the lookahead weighs its effect against.
function equipValue(c: CardInstance): number {
  let v = 0;
  for (const it of wornItems(c)) {
    const data = itemCard(it.cardId)!;
    if (data.type === 'equipment') {
      for (const aid of data.abilities ?? []) v += getAbility(aid)?.base ?? 3; // magnitude proxy; non-magnitude procs get a flat 3
      continue;
    }
    const first = getAbility(data.abilities[0]);
    if (first?.draw) { v += (first.draw.cards - first.draw.discard) * DRAW_NET_CARD; continue; }
    const worth = first?.base ?? 3;
    if (data.hardCC) v += worth * Math.min(it.charges ?? 0, 1) + (it.charges ?? 0);
    else v += itemCooldown(it) > 0 ? worth * COOLING_SHARE : worth;
  }
  return v;
}

/** What a won game is worth, in the units of `evalState`: more than any position. */
const DECISIVE = 1_000_000;

/** What a point of each structure's HP is worth: the win condition, the
 *  Patron (the last, and the loss) highest. A kill pushes the victim's level +
 *  1 (doubled from round 9), so a fresh kill into a Guardian is worth 16 here,
 *  against 2 for a point of a hero's HP. */
const STRUCTURE_WEIGHT: Record<StructureKind, number> = { guardian: 8, walker: 10, patron: 14 };

/** What the flex slot (the rival's Walker felled) is worth to a side: a fourth
 *  item on every hero, about a tier 2 item's value. */
const FLEX_SLOT_VALUE = 6;

/** What one live Rejuvenator credit is worth: a death that does not keep its
 *  hero off the board (it comes back at full HP), about a hero's presence. */
const REVIVE_CREDIT_VALUE = 8;

/** What a point of lead in the Mid-Boss's damage tally is worth, at the most:
 *  the side ahead takes it when it falls, so the lead counts for more as the
 *  boss runs low — from half this on a fresh boss to all of it on its last HP.
 *  A swing of three into a fresh boss is then worth a little more than the
 *  blow it hits back with (BOSS_RETALIATION HP, worth 4): worth making when the
 *  rival's Active is a poor target, never before a fair one (3 HP off a hero
 *  is worth 6). */
const BOSS_LEAD = 2.5;

/** The most a tally lead is worth (`BOSS_LEAD`), either way: half the boss's
 *  reward (its souls and two credits, about 17) — a boss in hand beats one in
 *  the pit, so a swing that takes it gains, and one that hands it over loses. */
const BOSS_STAKE_CAP = 8;

/** What a soul in hand is worth: souls carry over, so a line that keeps them
 *  is a little better than one that does not — small beside a point of HP
 *  (2), so it tips ties rather than steering play. */
const SOUL = 0.3;

/** What a hero card in the hand is worth: a hero to come — well under one
 *  standing on the board (`presence`), so it is benched as soon as it can be. */
const HAND_HERO = 6;

/** What an item card in the hand is worth: a base, plus this share of its
 *  price — well under what it is worth worn (`WORN_PRICE` of its price, and its
 *  stats and effects), so it is played once it can be paid for. Drawing is
 *  worth about this a card. */
const HAND_ITEM = { base: 0.5, perSoul: 0.1 } as const;

/** What a worn item is worth for each soul of its list price, on top of what
 *  the position reads off it (its stats in `presence`, its effects in
 *  `equipValue`): a card's price is its designed worth (docs/card-design.md
 *  §3), most of which the one-ply evaluation cannot see — a proc to come, a
 *  resist against the next hit. Above a soul's own worth (SOUL), so paying for
 *  an item and putting it on is worth it, and an evolve gains the difference. */
const WORN_PRICE = 0.5;

/** The tie-break for putting an item on the hero whose build lists it (or an
 *  item it builds into), and for picking the upgrade a build names: well under
 *  a point of HP, so the evaluation decides and this only orders its ties. */
const BUILD_FIT = 0.6;

/** What a hero standing on the board is worth: its presence, its HP and its offense. */
function presence(c: CardInstance): number {
  return 3 + c.hp * 2 + heroThreat(c) * 1.5;
}

/** One status line's price (see `Weight`). */
function price(hvalue: number, w: Weight, s: StatusInstance): number {
  return hvalue * w.scale * (w.byValue ? s.value : 1) * Math.min(s.duration, w.turns);
}

/** What the statuses on `c` are worth to its owner (a debuff is negative). The
 *  hard crowd control is found by the engine's own `cc` flag, not by a list. */
function statusValue(c: CardInstance): number {
  let v = 0;
  for (const s of c.statuses) {
    const def = STATUSES_BY_ID[s.id];
    if (!def) continue;
    const w = STATUS_WEIGHT[s.id] ?? (def.cc ? STATUS_WEIGHT.cc : undefined);
    if (w) v += price(def.hvalue, w, s);
  }
  return v;
}

/** What a channelled ultimate on `c` is worth to its owner: the damage it still
 *  has to deal to each of the `enemies` standing, counted as threat. Each pulse
 *  hits for the channel's value plus the caster's Spirit, once for every turn
 *  left, and an escalating channel (Seven's ramp) hits harder on each pulse. A
 *  heavy channel (`casting`) also locks its caster out of attacking and casting
 *  for as long as it runs. */
function channelValue(c: CardInstance, enemies: number): number {
  let v = 0;
  for (const s of c.statuses) {
    if (s.id !== 'casting' && s.id !== 'casting_light') continue;
    let dealt = (s.value + effectiveSpirit(c)) * s.duration;
    if (s.ramp) dealt += (s.ramp * (s.duration - 1) * s.duration) / 2;
    v += dealt * enemies * CHANNEL_WEIGHT.damage;
    if (s.id === 'casting') v -= heroThreat(c) * s.duration * CHANNEL_WEIGHT.lockout;
  }
  return v;
}

/** The Rem riding on `c`, if she has merged into it ("Lil Helpers"). A merged
 *  Rem is a hero still on the board, not gear: she is out of her bench slot but
 *  comes back to it, and the HP she granted is already on the bearer. */
function mergedRem(c: CardInstance): CardInstance[] {
  return (c.attached ?? []).filter((a) => a.remMergeTurnsLeft != null);
}

/** What a side's standing structures are worth (`STRUCTURE_WEIGHT`). */
function structureValue(ps: PlayerState): number {
  return ps.structures.reduce((n, st) => n + Math.max(0, st.hp) * STRUCTURE_WEIGHT[st.kind], 0);
}

/** What the map's other prizes are worth to a side: the flex slot, and the
 *  Rejuvenator's credits while they are live. */
function mapPrizes(g: GameState, pid: PlayerID): number {
  const ps = g.players[pid];
  return (ps.flexSlot ? FLEX_SLOT_VALUE : 0) + (reviveReady(g, pid) ? ps.reviveCredits * REVIVE_CREDIT_VALUE : 0);
}

/** What the Mid-Boss in the pit is worth to `pid` over the rival (the rival's
 *  is its negative): its damage lead (`BOSS_LEAD`, more as the boss runs low,
 *  at most BOSS_STAKE_CAP either way). Its reward, once taken, is in the souls
 *  and credits it gave. */
function bossStake(g: GameState, pid: PlayerID): number {
  const boss = g.boss;
  if (!boss || boss.hp <= 0) return 0;
  const lead = g.bossDamage[pid] - g.bossDamage[otherPlayer(pid)];
  const low = 1 - boss.hp / Math.max(1, boss.hpMax);
  const v = lead * BOSS_LEAD * (0.5 + 0.5 * low);
  return Math.max(-BOSS_STAKE_CAP, Math.min(BOSS_STAKE_CAP, v));
}

/** The blow the Mid-Boss still owes the hero that attacked it this turn, as
 *  that hero's side feels it: its HP (BOSS_RETALIATION, worth 2 a point), or —
 *  a blow that would fell it — the hero itself. */
function bossBlow(g: GameState, pid: PlayerID): number {
  const iid = g.bossAttacker;
  if (!iid || !g.boss || g.boss.hp <= 0) return 0;
  const hero = findCardOnBoard(g, iid);
  if (!hero || hero.owner !== pid || isRespawning(hero.card)) return 0;
  return hero.card.hp <= BOSS_RETALIATION ? presence(hero.card) + 5 : BOSS_RETALIATION * 2;
}

/** Position value from `pid`'s perspective (higher = better for pid). It counts
 *  the structures each side has standing, the flex slot and a live
 *  Rejuvenator, the Mid-Boss's damage lead and the blow it still owes; each
 *  living hero's HP, offense (attack plus its best skill), shield and worn
 *  gear, plus the statuses it carries, the channel it is running and the merged
 *  Rem it wears, each fallen hero as a lost
 *  presence, the souls each side keeps and the cards it holds. */
function evalState(g: GameState, pid: PlayerID, d: Dial = NORMAL): number {
  // A match that is over is not "a good position": it is the one that must
  // rank first (or, lost, last). The engine's own win check says which.
  const won = checkWinner(g)?.winner;
  if (won) return won === pid ? DECISIVE : -DECISIVE;
  const en = otherPlayer(pid);
  const me = g.players[pid];
  const foe = g.players[en];
  // The structures are the win condition — weighed heavily, the Patron most.
  let s = structureValue(me) - structureValue(foe);
  s += mapPrizes(g, pid) - mapPrizes(g, en);
  s += bossStake(g, pid);
  s -= bossBlow(g, pid) - bossBlow(g, en);
  // Souls carry over from turn to turn: a little for each one kept. The hand is
  // cards to come (a draw card's discard still owed takes its worst away).
  s += (me.souls - foe.souls) * SOUL;
  s += handValue(g, pid) - handValue(g, en);
  const tally = (ps: PlayerState, rivals: PlayerState, sign: number) => {
    const enemies = liveBoardCards(rivals).length;
    for (const c of liveBoardCards(ps)) {
      // Shield absorbs damage before HP, so a point of shield is worth a
      // point of HP — weight it like HP (×2), not ×1 (which made the bot
      // under-value/under-cast shielders like Warden).
      const shield = c.statuses.find((x) => x.id === 'shield')?.value ?? 0;
      s += sign * (presence(c) + shield * 2 + equipValue(c) * 2 + heroWorth(c) * WORN_PRICE + statusValue(c) + channelValue(c, enemies));
      // Merging Rem into an ally is not the loss of a hero.
      for (const rem of mergedRem(c)) s += sign * presence(rem);
    }
    for (const c of [ps.active, ...ps.bench]) {
      if (c && isRespawning(c)) s -= sign * 5; // corpse = lost presence
    }
  };
  tally(me, foe, 1);
  tally(foe, me, -1);
  return s;
}

// ----- the hand -------------------------------------------------------------------

/** True when `hero`'s build (`buildOf`) lists `itemId`, or an item `itemId`
 *  builds into (a build that names Superior Cooldown wants Compress Cooldown
 *  on the way). */
function buildWants(G: GameState, pid: PlayerID, hero: CardInstance, itemId: CardId): boolean {
  for (const id of buildOf(G, pid, hero.cardId)) {
    for (let x: CardId | undefined = id; x; x = itemCard(x)?.upgradesFrom) if (x === itemId) return true;
  }
  return false;
}

/** What one card in `pid`'s hand is worth to it as it stands (`HAND_HERO`,
 *  `HAND_ITEM`). */
function cardValue(card: CardInstance): number {
  if (CARDS_BY_ID[card.cardId]?.type === 'hero') return HAND_HERO;
  return HAND_ITEM.base + itemPrice(card.cardId) * HAND_ITEM.perSoul;
}

/** What `pid`'s hand is worth to it: every card's `cardValue`, less the cards
 *  a draw card's discard still owed will take (the least worth). */
function handValue(g: GameState, pid: PlayerID): number {
  const values = g.players[pid].hand.map(cardValue).sort((a, b) => a - b);
  const owed = g.pendingDiscard?.pid === pid ? g.pendingDiscard.count : 0;
  return values.slice(owed).reduce((n, v) => n + v, 0);
}

/** What a card in hand is worth keeping, for the discard: a hero most (a hero
 *  to come), then an item one of its heroes could take that its builds name,
 *  then one some hero could take, cheaper to pay first; an item no hero of its
 *  could ever take now (every one wears it or is full) least. */
function keepValue(G: GameState, pid: PlayerID, card: CardInstance): number {
  if (CARDS_BY_ID[card.cardId]?.type === 'hero') return 100;
  const ps = G.players[pid];
  const heroes = slottedHeroes(ps);
  // Who could take it were the souls there: the engine's own gate, souls aside.
  const fits = heroes.filter((h) => {
    const why = playBlocked(G, pid, card.iid, h.iid);
    return why === null || why === 'souls' || why === 'notYourTurn';
  });
  const price = itemPrice(card.cardId);
  let v = 10 + Math.min(price, 16) * 0.5;
  if (fits.length === 0) v -= 12;
  if (fits.some((h) => buildWants(G, pid, h, card.cardId) || upgradeComponent(h, card.cardId))) v += 6;
  // An item several turns of income away is worth less in a hand that must shrink.
  if (price > ps.souls + 2 * LANE_INCOME) v -= 4;
  return v;
}

/** The cards `pid` discards to pay a draw card's discard of `n`: the `n` of
 *  its hand worth least to keep (`keepValue`), the earliest drawn first on a
 *  tie. */
export function discardChoice(G: GameState, pid: PlayerID, n: number): string[] {
  const hand = G.players[pid].hand;
  return hand
    .map((c, i) => ({ c, i, v: keepValue(G, pid, c) }))
    .sort((a, b) => a.v - b.v || a.i - b.i)
    .slice(0, Math.max(0, Math.min(n, hand.length)))
    .map((x) => x.c.iid);
}

/** The tie-break a hand play earns (`BUILD_FIT`): an item onto a hero whose
 *  build wants it, and the upgrade its heroes' builds name. */
function buildFit(G: GameState, pid: PlayerID, a: Action): number {
  if (a.type !== 'playCard') return 0;
  const card = handCard(G, pid, a.cardIid);
  const hero = findCardOnBoard(G, a.heroIid)?.card;
  if (!card || !hero) return 0;
  let v = buildWants(G, pid, hero, card.cardId) ? BUILD_FIT : 0;
  if (a.upgradeId && slottedHeroes(G.players[pid]).some((h) => buildWants(G, pid, h, a.upgradeId!))) v += BUILD_FIT / 2;
  return v;
}

interface MoveOption {
  move: 'playCard' | 'placeHero' | 'discard' | 'chooseActive' | 'activate' | 'useSkill' | 'attack' | 'endTurn' | 'moveHero' | 'promoteToActive' | 'useTrigger' | 'passTrigger' | 'draftPick';
  args: any[];
  score: number;
}

/** An engine action in the form the callers dispatch: the boardgame.io move and
 *  its arguments (playCard [card, hero, upgrade?], placeHero [card, toActive?, slot?],
 *  discard [cards], chooseActive [card], activate [item, target?], useSkill
 *  [hero, target?, skill?], moveHero [from, to], promoteToActive [iid], attack
 *  [target?], endTurn []). */
function toMove(G: GameState, a: Action): Pick<MoveOption, 'move' | 'args'> {
  const present = (...xs: (string | undefined)[]) => xs.filter((x): x is string => x !== undefined);
  switch (a.type) {
    case 'playCard': return { move: 'playCard', args: a.upgradeId ? [a.cardIid, a.heroIid, a.upgradeId] : [a.cardIid, a.heroIid] };
    case 'placeHero': return { move: 'placeHero', args: a.toActive ? [a.cardIid, true] : a.slot === undefined ? [a.cardIid] : [a.cardIid, false, a.slot] };
    case 'discard': return { move: 'discard', args: [[...a.cardIids]] };
    case 'chooseActive': return { move: 'chooseActive', args: [a.cardIid] };
    case 'activate': return { move: 'activate', args: present(a.itemIid, a.targetIid) };
    case 'useSkill': {
      // The skill is named only when it is not the hero's first (the move's default),
      // so a one-skill hero's move is the one it always was; a skill with no target
      // keeps the target's place in the list empty rather than shift the skill into it.
      const hero = findCardOnBoard(G, a.heroIid)?.card;
      const first = hero && resolveSkill(hero)?.id;
      if (a.skillId === undefined || a.skillId === first) return { move: 'useSkill', args: present(a.heroIid, a.targetIid) };
      return { move: 'useSkill', args: [a.heroIid, a.targetIid, a.skillId] };
    }
    case 'moveHero': return { move: 'moveHero', args: [a.fromSlot, a.toSlot] };
    case 'promoteToActive': return { move: 'promoteToActive', args: [a.benchIid] };
    case 'useTrigger': return { move: 'useTrigger', args: [a.heroIid, a.abilityId] };
    case 'passTrigger': return { move: 'passTrigger', args: [] };
    // The default target (the first the engine lists) is the move's default: no argument.
    case 'attack': return { move: 'attack', args: present(a.targetIid) };
    case 'endTurn': return { move: 'endTurn', args: [] };
  }
}

// ----- the crude per-move scores ---------------------------------------------
// What ranks the plain list (no lookahead), fed by the action: items and
// skills above passing, the attack by the damage it would land.

/** A crude active item's score, as the spell it was: above a skill, more on an
 *  enemy it could finish or an ally in trouble. */
function scoreActivate(pid: PlayerID, target?: CardInstance): number {
  let s = 25;
  if (target && target.ownerId !== pid) {
    s += 5;
    if (target.hp <= 3) s += 25;
  }
  if (target && target.ownerId === pid && target.hp < target.hpMax / 2) s += 8;
  return s;
}

/** A crude ability's score; an ultimate ranks above a skill. */
function scoreSkill(pid: PlayerID, target?: CardInstance, ultimate = false): number {
  let s = ultimate ? 30 : 12;
  if (target && target.ownerId !== pid) {
    s += 8;
    if (target.hp <= 3) s += 20;
  }
  if (target && target.ownerId === pid && target.hp < target.hpMax / 2) s += 14;
  return s;
}

/** What the attack on `targetIid` (left out, the default target) is worth to
 *  the crude list: a win outranks everything; else the damage it would land on
 *  its target, plus a premium for a KO. With lookahead a win is `evalState`'s
 *  verdict instead. Both are read off the engine's own run of the attack —
 *  "wins" means what the rules mean: the knockout's push into the last
 *  structure, a Ricochet bounce that drops a bench hero, a merged Rem who walks
 *  off the fallen bearer. An attack at the Mid-Boss is `scoreBossAttack`'s. */
function scoreAttack(G: GameState, pid: PlayerID, targetIid?: string): number {
  const after = simulate(G, pid, { type: 'attack', targetIid }).G;
  if (checkWinner(after)?.winner === pid) return DECISIVE;
  const target = targetIid === undefined ? attackTargets(G, pid)[0] : findCardOnBoard(G, targetIid)?.card;
  if (isBoss(target)) return scoreBossAttack(G, pid, after);
  const plan = forecastAttack(G, pid, targetIid);
  return 15 + plan.damageToActive * 3 + (plan.defenderActiveKO ? 25 : 0);
}

/** The crude score of an attack at the Mid-Boss (`after`: the position it
 *  leaves). Finish it when the swing kills it and it goes to this side; never
 *  hand it to the rival; chip it when no enemy hero is a target worth the
 *  swing (none can be hit, or the best swing at one lands nothing); else leave
 *  it be. */
function scoreBossAttack(G: GameState, pid: PlayerID, after: GameState): number {
  if (!after.boss) return after.record[pid].bossKills > G.record[pid].bossKills ? 60 : -60;
  const heroes = attackTargets(G, pid).filter((t) => !isBoss(t));
  const best = Math.max(0, ...heroes.map((t) => forecastAttack(G, pid, t.iid).damageToActive));
  if (best > 0) return -5;
  const dealt = G.boss ? G.boss.hp - after.boss.hp : 0;
  return 10 + dealt;
}

/** Below this share of its HP a hero is about to die: an Active worth pulling
 *  out, and a bench hero not worth sending in for its swing. */
const ABOUT_TO_DIE = 0.35;

/** A retreat's score by rule of thumb, or null when it gives no reason of its
 *  own: it has one when the hero stepping in is much fresher, when the Active
 *  is crowd-controlled (dead weight whatever its HP), or when it buys the
 *  turn's attack — the Active cannot make it (Stunned, Disarmed) and the hero
 *  who steps in can; `bought` is that swing's crude score, from
 *  `attackBought`, and is only counted for a hero not itself about to die in
 *  the lane. (A Retreat comes before the attack, and one a turn.) The lookahead
 *  also takes a retreat whose line — the swap, then the new Active's attack —
 *  beats attacking as things stand by RETREAT_MARGIN; anything else the AI
 *  still lists — the engine allows it — but ranks behind everything. */
function retreatPoints(active: CardInstance, incoming: CardInstance, bought: number | null = null): number | null {
  const activeFrac = active.hp / Math.max(1, active.hpMax);
  const incomingFrac = incoming.hp / Math.max(1, incoming.hpMax);
  const gain = incomingFrac - activeFrac;
  const deadWeight = active.statuses.some((s) => CC_STATUSES.has(s.id));
  const swing = bought !== null && incomingFrac >= ABOUT_TO_DIE ? bought : null;
  if (gain < 0.25 && !deadWeight && swing === null) return null;
  let s = 10;
  if (activeFrac < ABOUT_TO_DIE) s += 30; // about to die
  if (deadWeight) s += 18;
  if (swing !== null) s += swing;
  return s + Math.round(gain * 20);
}

/** The crude score of the attack retreat `a` buys, or null when it buys none:
 *  the Active cannot make the turn's attack now (it is locked out: Stunned,
 *  Disarmed) and the hero the retreat brings in can. Asked of the engine — the
 *  retreat is made on a copy and the attack gate read after it — not worked
 *  out here. */
function attackBought(G: GameState, pid: PlayerID, a: Extract<Action, { type: 'moveHero' }>): number | null {
  if (attackBlocked(G, pid) === null) return null;
  const after = simulate(G, pid, a);
  if (after.invalid || attackBlocked(after.G, pid) !== null) return null;
  return scoreAttack(after.G, pid);
}

/** Where a retreat that is not worth it ranks: behind passing, behind every
 *  real play, but still in the list. */
const NOT_WORTH_IT = -1000;

/** How much better than attacking as things stand a retreat's line (the swap,
 *  then the new Active's attack) must be for the lookahead to take a retreat
 *  that has no rule-of-thumb reason: about a point of HP, so a swap is made for
 *  a real gain and not to shuffle heroes for a rounding error. */
const RETREAT_MARGIN = 2;

/** The retreat `a` makes: who leaves the Active slot and who takes it. */
function retreatPair(G: GameState, pid: PlayerID, a: Extract<Action, { type: 'moveHero' }>) {
  const ps = G.players[pid];
  return { active: ps.active!, incoming: ps.bench[a.fromSlot - 1]! };
}

function crudeScore(G: GameState, pid: PlayerID, a: Action): number {
  switch (a.type) {
    case 'attack': return scoreAttack(G, pid, a.targetIid);
    // The hand, on the plain list: a hero onto the board first (into an empty
    // lane above all; the first free bench slot, a named one only with a
    // reason of its own), then an item.
    case 'placeHero': return a.toActive ? 60 : a.slot === undefined ? 30 : 29;
    case 'playCard': return 22 + buildFit(G, pid, a);
    case 'discard': return 50_000;
    // The opening's first Active, from the drafted heroes in the deck: the
    // hero with the most HP, then attack.
    case 'chooseActive': {
      const data = CARDS_BY_ID[G.players[G.pendingActive ?? pid].deck.find((c) => c.iid === a.cardIid)?.cardId ?? ''];
      return 60_000 + (data?.type === 'hero' ? data.hp * 10 + data.atk : 0);
    }
    case 'activate': {
      const found = findWornItem(G, a.itemIid, pid);
      return found ? scoreActivate(pid, a.targetIid ? findCardOnBoard(G, a.targetIid)?.card : undefined) : 0;
    }
    case 'useSkill': {
      const hero = findCardOnBoard(G, a.heroIid)?.card;
      const ultimate = !!hero && resolveSkill(hero, a.skillId)?.kind !== 'skill';
      return scoreSkill(pid, a.targetIid ? findCardOnBoard(G, a.targetIid)?.card : undefined, ultimate);
    }
    case 'moveHero': {
      const { active, incoming } = retreatPair(G, pid, a);
      return retreatPoints(active, incoming, attackBought(G, pid, a)) ?? NOT_WORTH_IT;
    }
    // A promotion owed comes before everything: the healthiest hero steps up.
    case 'promoteToActive': return 50_000 + findCardOnBoard(G, a.benchIid)!.card.hp;
    // A trigger prompt's answer: the asked side's own valuation (`answerScore`).
    case 'useTrigger':
    case 'passTrigger': return answerScore(G, a);
    case 'endTurn': return 1;
  }
}

// ----- a trigger prompt's answer -----------------------------------------------
// The engine asks the AI the same question it asks a person (engine/prompts.ts):
// use one of the offers, or pass. The valuation is simple and is the lookahead's
// own: each answer is made on a copy, and the asked side takes the position it
// likes best — a revive keeps a hero and its push off the map for its souls.

/** What answering the prompt owed with `a` is worth to the side asked: the
 *  position it leaves, from that side's view (`evalState`). */
function answerScore(G: GameState, a: Action): number {
  const asked = promptOwed(G)?.pid;
  if (!asked) return 0;
  return evalState(simulate(G, asked, a).G, asked);
}

/** The answer the side asked gives to the prompt owed in `G`: its best by
 *  `answerScore`, a pass on a tie. */
function answerFor(G: GameState): Action {
  const asked = promptOwed(G)!.pid;
  let best: Action = { type: 'passTrigger' };
  let value = answerScore(G, best);
  for (const a of legalActions(G, asked)) {
    if (a.type !== 'useTrigger') continue;
    const v = answerScore(G, a);
    if (v > value) { best = a; value = v; }
  }
  return best;
}

/** `g` with any trigger prompt it holds answered the way the side asked would
 *  answer it (`answerFor`), so a line that fells a hero who may come back is
 *  valued as it will play out. A chain is not possible yet, but the loop is
 *  bounded all the same. */
function answered(g: GameState): GameState {
  for (let i = 0; i < 4 && promptOwed(g); i++) g = simulate(g, promptOwed(g)!.pid, answerFor(g)).G;
  return g;
}

// ----- the lookahead ----------------------------------------------------------

/** The position after `a`, on a copy. The attack ends the turn's Act and
 *  there is one a turn, so a line is "this move, then the turn's attack" while
 *  the attack is still open after it — and the attack only when making it
 *  leaves the better position (a swing into Return Fire may not). So a buff, a
 *  skill, an ultimate or a retreat is valued by the attack it sets up, and sees
 *  lethal; the attack itself is valued alone, everything it forfeits
 *  forfeited. `endTurn` is scored as the position stands: ending the turn
 *  forfeits the attack. */
function lineAfter(G: GameState, pid: PlayerID, a: Action, d: Dial = NORMAL): GameState {
  if (a.type === 'endTurn') return G;
  // A prompt the move opens (a hero of the rival's that may come back) is
  // answered as its side would answer it.
  let g = answered(simulate(G, pid, a).G);
  // A draw card's discard is the AI's own to pay: the line pays it as it would.
  const owed = g.pendingDiscard;
  if (owed && owed.pid === pid) g = simulate(g, pid, { type: 'discard', cardIids: discardChoice(g, pid, owed.count) }).G;
  if (a.type === 'attack' || attackBlocked(g, pid) !== null) return g;
  if (d.strength === 'hard') return bestSwing(g, pid, d);
  const swung = answered(simulate(g, pid, { type: 'attack' }).G);
  return evalState(swung, pid, d) >= evalState(g, pid, d) ? swung : g;
}

/** 'hard': the best of `g` as it stands and the turn's attack made at each
 *  target the engine allows from it (the default first, as legalActions lists
 *  them), each played out on a copy and valued by `evalState`. */
function bestSwing(g: GameState, pid: PlayerID, d: Dial): GameState {
  let best = g;
  let value = evalState(g, pid, d);
  attackTargets(g, pid).forEach((t, i) => {
    const swung = answered(simulate(g, pid, i === 0 ? { type: 'attack' } : { type: 'attack', targetIid: t.iid }).G);
    const v = evalState(swung, pid, d);
    if (v > value) { best = swung; value = v; }
  });
  return best;
}

/** The lookahead's score for `a`: the value of the position it leads to. A tiny
 *  bias toward acting (vs. passing) breaks ties so the AI takes value-neutral
 *  tempo plays instead of idling. A retreat with no rule-of-thumb reason
 *  (`retreatPoints`) is marked down so it ranks behind real plays — unless its
 *  line beats `baseline`, the value of attacking as things stand, by
 *  RETREAT_MARGIN: then the swap is the better way to make the turn's attack. */
function lookaheadScore(G: GameState, pid: PlayerID, a: Action, baseline: () => number, d: Dial = NORMAL): number {
  let s = evalState(lineAfter(G, pid, a, d), pid, d) + (a.type === 'endTurn' ? 0 : 0.1) + buildFit(G, pid, a);
  if (a.type === 'moveHero') {
    // 'hard' takes no rule of thumb: a retreat must show its gain in the evaluation.
    const reason = d.strength !== 'hard' && retreatPoints(...pairOf(G, pid, a), attackBought(G, pid, a)) !== null;
    if (!reason && s < baseline() + RETREAT_MARGIN) s += NOT_WORTH_IT;
  }
  return s;
}

/** `retreatPair` as arguments for `retreatPoints`. */
function pairOf(G: GameState, pid: PlayerID, a: Extract<Action, { type: 'moveHero' }>): [CardInstance, CardInstance] {
  const { active, incoming } = retreatPair(G, pid, a);
  return [active, incoming];
}

/** 'easy': each option's score moved by up to EASY_NOISE of the spread of the
 *  scores in play, either way, from a stream seeded by the position (the match
 *  seed, the turn and the engine's counters), so a replay makes the same moves.
 *  A won or lost line and a retreat marked not worth it stay where they are,
 *  and do not widen the spread. */
function addNoise(G: GameState, pid: PlayerID, options: MoveOption[]): void {
  const inPlay = options.filter((o) => Math.abs(o.score) < DECISIVE / 2 && o.score > NOT_WORTH_IT / 2);
  if (inPlay.length < 2) return;
  const scores = inPlay.map((o) => o.score);
  const spread = Math.max(...scores) - Math.min(...scores);
  const c = G.counters;
  const rand = seededRandom((G.seed ^ Math.imul(G.turnNumber + 1, 0x9e3779b1) ^ Math.imul(c.iid + 31 * c.fx + 977 * c.action, 0x85ebca6b) ^ (pid === '1' ? 0x5bd1e995 : 0)) >>> 0);
  for (const o of inPlay) o.score += (rand() * 2 - 1) * EASY_NOISE * spread;
}

export function enumerateAIMoves(G: GameState, ctx: Ctx, lookahead = true, options: AiOptions = {}): MoveOption[] {
  const pid = ctx.currentPlayer as PlayerID;
  const d = dial(options);
  // Pre-match draft: only one move kind is legal. Score by stat sum +
  // rarity, with a small diversity nudge so the AI doesn't pick four glass
  // cannons. Returns sorted; the top option is the AI's pick.
  if (G.draft && G.draft.order[G.draft.currentIndex] === pid) {
    const myPicks = G.draft.picks[pid];
    const taken = myPicks.map((id) => CARDS_BY_ID[id]).filter((c) => c?.type === 'hero') as any[];
    const myAtk = taken.reduce((a, h) => a + (h.atk ?? 0), 0);
    const myHp = taken.reduce((a, h) => a + (h.hp ?? 0), 0);
    const opts: MoveOption[] = [];
    for (const id of G.draft.pool) {
      const h = CARDS_BY_ID[id];
      if (!h || h.type !== 'hero') continue;
      // Stat sum + rarity weight (rarer heroes are usually statlines + skill).
      let s = (h.atk ?? 0) + (h.hp ?? 0) + (h.rarity ?? 1) * 1.5;
      // Diversity nudge: if I'm already heavy on ATK, prefer HP; vice versa.
      if (myAtk > myHp + 3 && (h.hp ?? 0) > (h.atk ?? 0)) s += 2;
      if (myHp > myAtk + 3 && (h.atk ?? 0) > (h.hp ?? 0)) s += 2;
      // Tiny jitter so identical scores don't always tie the same way (boardgame.io's RNG isn't seeded here).
      s += Math.random() * 0.4;
      opts.push({ move: 'draftPick', args: [id], score: s });
    }
    return opts.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  // Everything the engine allows, in its order: the attack, items, skills,
  // retreats and the hand's plays; then promotions, and ending the turn last.
  // While a choice is owed that is the choice alone — the opening's first
  // Active, a promotion (for whichever seat owes it, made from either: on the
  // board the local player answers the prompt themselves and the AI loop
  // waits rather than ask, unless auto-play is driving their seat), or a draw
  // card's discard.
  const actions = legalActions(G, pid).filter((a) => a.type !== 'playCard' || !d.banned.has(handCard(G, pid, a.cardIid)?.cardId ?? ''));

  // A trigger prompt owed (engine/prompts.ts) is answered first, by the side
  // asked — on either player's turn, so it is that side's valuation whoever is
  // on turn: each offer and the pass, by the position each leaves it.
  const prompt = promptOwed(G);
  if (prompt) {
    return legalActions(G, prompt.pid)
      .map((a): MoveOption => ({ ...toMove(G, a), score: answerScore(G, a) }))
      .sort((a, b) => b.score - a.score);
  }

  // A choice owed needs no weighing: the strongest hero opens, the healthiest
  // steps up.
  if (G.pendingActive || G.pendingPromotion) {
    return actions
      .map((a): MoveOption => ({ ...toMove(G, a), score: crudeScore(G, pid, a) }))
      .sort((a, b) => b.score - a.score);
  }

  // A draw card's discard: the cards worth least, all at once.
  if (G.pendingDiscard) {
    if (G.pendingDiscard.pid !== pid) return [];
    const cardIids = discardChoice(G, pid, G.pendingDiscard.count);
    return [{ ...toMove(G, { type: 'discard', cardIids }), score: 1 }];
  }

  // What attacking as things stand is worth (the position as it is when there
  // is no attack to make): the bar a retreat without a reason of its own must clear.
  // ('hard': the best attack at any target it may make.)
  let base: number | undefined;
  const baseline = () => (base ??= d.strength === 'hard'
    ? evalState(bestSwing(G, pid, d), pid, d)
    : evalState(attackBlocked(G, pid) === null ? answered(simulate(G, pid, { type: 'attack' }).G) : G, pid, d));
  const scored = actions.map((a): MoveOption => ({
    ...toMove(G, a),
    score: lookahead ? lookaheadScore(G, pid, a, baseline, d) : crudeScore(G, pid, a),
  }));
  if (d.strength === 'easy') addNoise(G, pid, scored);
  return scored.sort((a, b) => b.score - a.score).slice(0, 12);
}
