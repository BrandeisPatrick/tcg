// Core type model for Deadlock TCG.
// Cards are static data; CardInstance is per-game runtime.

export type CardId = string;
export type AbilityId = string;
export type StatusId = string;
export type PlayerID = '0' | '1';
/** Who a card instance belongs to: a seat — or nobody, the Mid-Boss in the
 *  pit (`GameState.boss`). Read a seat-owned card's seat through `seatOf`
 *  (query.ts). */
export type Owner = PlayerID | 'none';
/** Where a card instance is: in its owner's deck (face down, drawn from the
 *  top), in its owner's hand (a hero or an item, drawn and not yet played), in
 *  its owner's discard pile, a hero in the Active slot or on the bench, an item
 *  worn by a hero (in its `attached` list), or the Mid-Boss in the pit between
 *  the two lanes. */
export type Zone = 'deck' | 'hand' | 'discard' | 'active' | 'bench' | 'equipment' | 'pit';

/** The three structures of a side's track, front to back: damage goes to the
 *  front standing one, and what is left over carries on to the next. */
export type StructureKind = 'guardian' | 'walker' | 'patron';

/** One structure of a side's track. A structure at 0 HP has fallen; one with
 *  `max` 0 is not on this track at all (a scripted match's shorter one). */
export interface Structure {
  kind: StructureKind;
  hp: number;
  max: number;
}

/** A track's HP by structure, for a match that does not use `STRUCTURES` (a
 *  Story fight's or a lesson's): a structure left out is not on the track
 *  (its `max` is 0), and the Patron always is. */
export type TrackHp = Partial<Record<StructureKind, number>>;

/** What pushed into a structure: a kill (the victim's level + 1), or an
 *  Active pushing into a lane its rival left empty (its bullet power). */
export type PushCause = 'kill' | 'lane';

export type DamageType = 'attack' | 'spirit' | 'pure';

type CardType = 'hero' | 'spell' | 'equipment' | 'ultimate';

/** An item's shop tab, from Deadlock's shop: Weapon items work through attacks
 *  and Bullet Power, Spirit items through skills and spirit damage, Vitality
 *  items through HP, healing, shields and resists. */
export type ItemSlot = 'weapon' | 'spirit' | 'vitality';

/** An item's shop tier, from Deadlock's shop (800 / 1,600 / 3,200 / 6,400 /
 *  9,999 souls there). Its price here is `PRICE[tier]` (constants.ts), and
 *  `ITEM_TIERS` lists them: every list of tiers reads that one. */
export type ItemTier = 1 | 2 | 3 | 4 | 5;

export interface BaseCard {
  id: CardId;
  name: string;
  type: CardType;
  rarity: 1 | 2 | 3 | 4;
  text?: string;
}

/** A hero's role (docs/hero-design.md §1): how it plays in Deadlock. */
export type HeroRole = 'Tank' | 'Bruiser' | 'Gun carry' | 'Marksman' | 'Spirit caster' | 'Assassin' | 'Support' | 'Controller';

/** When a hero peaks (docs/hero-design.md §2). Early: +1 point at Level 1 and
 *  2 growth points a level; mid: none and 3; late: −1 point (never below
 *  Attack 1 or HP 4) and 4. All three are even at Level 2. */
export type HeroCurve = 'early' | 'mid' | 'late';

/** What a hero card is designed from (docs/hero-design.md §1–2): its role,
 *  its mix of tank, damage, control and support (each 0–3), its reach and its
 *  curve. HP is 4 + `mix.tank` at Level 1, adjusted by the curve; Attack is 1,
 *  or 2 for a `gun` hero (its damage mainly bullet or melee) with damage 2 or
 *  more. The data tests check the printed stats against these. */
export interface HeroProfile {
  role: HeroRole;
  mix: { tank: number; damage: number; control: number; support: number };
  reach: 'one' | 'many' | 'both';
  curve: HeroCurve;
  /** Its damage is mainly bullet or melee. */
  gun?: true;
}

/** A hero prints no text of its own: its card text is its abilities' (`name`
 *  and `text` on each AbilityDef), read through `heroAbilities` (engine/query.ts). */
export interface HeroCard extends Omit<BaseCard, 'text'> {
  type: 'hero';
  /** Attack and HP at Level 1 (docs/hero-design.md §2). */
  atk: number;
  hp: number;
  /** What each level gained adds: the curve's growth points split between
   *  Attack, HP and Spirit (2 a level early, 3 mid, 4 late). */
  growth: { atk: number; hp: number; spirit: number };
  /** Souls a Retreat costs while this hero is the one leaving the Active slot:
   *  0 for very mobile heroes, 1 for most, 2 for slow heavy ones
   *  (`retreatCost`, legality.ts). */
  retreat: number;
  profile: HeroProfile;
  /** The hero's skill, when it has one (a hero has one skill or one passive):
   *  a bare `useSkill` names `skills[0]`. A hero uses one ability a turn (a
   *  skill, an active item or its ultimate). */
  skills: AbilityId[];
  passives?: AbilityId[];
  /** The ultimate's ability id: a button printed on the hero card, used like a
   *  skill from ULT_UNLOCK_LEVEL for its size's souls (`ULT_COST`) and then on
   *  ULT_COOLDOWN. Its card (`ULTIMATES`, the one whose `abilities[0]` it is)
   *  names it, sizes it and shows its icon. */
  ult?: AbilityId;
  /** The hero's two signature items, chosen to fit its kit (one of tier 1 or
   *  2): both are on sale in any match the hero is drafted into. */
  signature: [CardId, CardId];
  /** `benchOnly`: the hero never takes the Active slot. No card sets it since
   *  Rem stands in the lane (2026-11-09); the engine keeps the rule for one
   *  that may. */
  flags?: { benchOnly?: boolean };
}

/** What every item shares, active or passive: its shop tab and tier (its price
 *  is the tier's, `PRICE[tier]`), and the item it upgrades, when Deadlock builds
 *  it from one in this catalogue: bought for a hero wearing that component, it
 *  costs the difference and takes the component's place. */
interface ItemFields {
  slot: ItemSlot;
  tier: ItemTier;
  upgradesFrom?: CardId;
}

/** An ACTIVE item (Deadlock's `is_active_item`): worn like any item, and used
 *  from its bearer's sheet as that hero's one ability of the turn. Its first
 *  ability's target filter says what it is aimed at; every onPlay ability runs
 *  when it is used. It then cools down (ACTIVE_COOLDOWN by tier), or, for hard
 *  crowd control, spends one of its HARD_CC_CHARGES. */
export interface SpellCard extends BaseCard, ItemFields {
  type: 'spell';
  abilities: AbilityId[];
  /** Hard crowd control (its effect stuns, silences, disarms, roots, sleeps or
   *  curses an enemy): HARD_CC_CHARGES uses a match and no cooldown. */
  hardCC?: true;
  /** Own turns it waits after use (and when put on), when the card names its
   *  own rather than its tier's ACTIVE_COOLDOWN: the draw cards wait 2 at
   *  every tier. */
  cooldown?: number;
}

/** A PASSIVE item: always on while worn — its stat `bonus` and its abilities'
 *  triggers and hooks. */
export interface EquipmentCard extends BaseCard, ItemFields {
  type: 'equipment';
  abilities?: AbilityId[];
  bonus?: { atk?: number; hp?: number; spirit?: number };
}

/** Any item the shop sells: an active (spell) or a passive (equipment). */
export type ItemCard = SpellCard | EquipmentCard;

/** An ultimate's size (docs/hero-design.md §4): it sets the souls it costs
 *  (`ULT_COST`: 4, 8 or 12). */
export type UltSize = 'small' | 'medium' | 'large';

/** An ultimate's face: its name, text, size and icon (the hero's Deadlock
 *  ultimate icon, `public/ult/<hero>.webp`). The ultimate itself is a kit
 *  ability of its hero (`HeroCard.ult`), a button on the hero card, never
 *  dealt or held: it is paid for in souls when it is used. */
export interface UltimateCard extends BaseCard {
  type: 'ultimate';
  linkedHero: CardId;
  abilities: AbilityId[];
  size: UltSize;
  /** A charged ultimate (docs/hero-design.md §2; Victor, Silver): it prints
   *  `cost` souls instead of its size's, and each damage its hero takes
   *  (`by: 'taken'`) or deals (`'dealt'`) makes it 1 soul cheaper, down to 0
   *  (`kitCost`). The count is the hero's `tally` under the ultimate's ability
   *  id, and starts over when the ultimate is used. `text` is the rule's own
   *  line under the effect ("Costs 1 less for each damage Victor takes."),
   *  outside the effect's 15 words. Its `size` is what the effect is worth,
   *  half the price, and prices nothing. */
  charged?: { cost: number; by: 'taken' | 'dealt'; text: string };
}

export type CardData = HeroCard | SpellCard | EquipmentCard | UltimateCard;

export interface StatusInstance {
  id: StatusId;
  value: number;
  duration: number;
  /** A channel that escalates: `value` climbs by `ramp` after each pulse
   *  (Seven's Storm Cloud marks its `casting` status with 1). Absent on
   *  everything else. */
  ramp?: number;
  /** HP the bearer heals when the status goes off (Last Stand's). Absent on
   *  everything else, and read as 0 where a status that heals does not say. */
  heal?: number;
}

export interface CardInstance {
  iid: string;
  cardId: CardId;
  ownerId: Owner;
  zone: Zone;
  slot?: 0 | 1 | 2 | 3;
  attachedTo?: string;
  attached?: CardInstance[];
  hp: number;
  hpMax: number;
  atkMod: number;
  spiritMod: number;
  statuses: StatusInstance[];
  exhausted: boolean;
  /** This hero used an ability this turn — a skill or its ultimate. Each hero
   *  uses one a turn; the Active may still make the turn's attack after it. */
  skillUsedThisTurn: boolean;
  /** The ability this hero used this turn (set by `useSkill`, cleared with the
   *  other turn flags): what Echo Shard repeats (a skill only), and which
   *  plate the hero sheet marks USED. Bookkeeping, so the replay trace ignores it. */
  lastSkillUsed?: AbilityId;
  /** Own turns left before each kit ability may be used again: a skill's
   *  `cooldown` (SKILL_COOLDOWN when its data names none), an ultimate's
   *  ULT_COOLDOWN. Present only once an ability has set one: the map is dropped
   *  when it empties. Ticks at the start of the owner's turn (docs/stats-model.md
   *  §1), on a corpse too; a fall and a respawn leave it as it is. */
  cooldowns?: Partial<Record<AbilityId, number>>;
  /** What a hero's kit counts, by ability id: Drifter's Bloodscent counts the
   *  knockouts that have grown his Attack; a charged ultimate counts the damage
   *  that has made it cheaper (Victor's taken, Silver's dealt), and starts over
   *  when it is used. It stays through a death, as the level does. */
  tally?: Partial<Record<AbilityId, number>>;
  /** The hero whose blow dropped this one to 0 HP, while the fall waits on a
   *  trigger prompt (engine/prompts.ts): the blow's kill exp is paid when the
   *  fall goes ahead and never if a trigger cancels it. Only a hero that can
   *  cancel its own fall (it declares an optional trigger at 'onFall') holds
   *  it; cleared once the fall is decided. */
  downedBy?: string;
  /** A hard crowd-control active's uses left this match (HARD_CC_CHARGES when
   *  bought; it travels with the item). At 0 the item stays worn but cannot be
   *  used. Undefined on every other card. An active's cooldown lives in this
   *  instance's own `cooldowns`, keyed by its card id, and travels with it too. */
  charges?: number;
  /** A hero: the items whose first equip has paid it EXP_ON_EQUIP, so a
   *  second copy of one pays nothing more. */
  equippedIds?: CardId[];
  /** A hero: the Vitality category spike's +1 max HP is on its `hpMax` (it
   *  wears 3+ Vitality items). Kept so the point comes off when the spike is
   *  lost. */
  vitalitySpike?: true;
  // Multi-attack is modeled via the `extra_attack` STATUS (value = N extra
  // full-power swings queued for this turn). It stacks additively across
  // sources (Active Reload, Burst Fire, Haze's Fixation) and is consumed by the
  // bearer's attack — see grantExtraAttacks / actions/attack.ts. Each bonus swing
  // re-fires onAttack procs (so Toxic Bullets / Djinn's Mark proc per swing)
  // and bounces again with Ricochet.
  /**
   * Rem's ride (Tag Along, `rideOn` in death.ts): she leaves her slot — the
   * bench's or the lane — and rides on an ally as equipment. These live on the
   * Rem card while it sits in the bearer's `attached` list:
   * `remMergeTurnsLeft` is the ride's own turns left, counted down at her
   * owner's turn start, and `remMergeHpBuff` the max HP a ride granted (Tag
   * Along grants none; taken back when she gets off). When the ride is over,
   * or the bearer falls, she returns to the bench (`returnRemToBench`). Her
   * `slot` is the bench slot she rode out of, kept for her, or 0 when she rode
   * from the lane. Undefined for everyone else. (The names are the old
   * "Lil Helpers" merge's, whose machinery this is.)
   */
  remMergeTurnsLeft?: number;
  remMergeHpBuff?: number;
  /**
   * Own turns left before a fallen hero goes back to its owner's hand. `> 0`
   * means the hero is KO'd and occupying its slot as a corpse (greyed in UI,
   * can't act / be targeted). On reaching 0 it leaves the board for the hand,
   * at full HP with its level and its items (`RESPAWN_TURNS`). `undefined` /
   * `0` means alive.
   */
  respawnTurnsLeft?: number;
  /**
   * Hero leveling. Heroes start at level 1 and climb to a cap of 4.
   * Earn exp from three triggers: end of owner's turn (+1 per alive hero),
   * equipping an item (+1 to the bearer), and landing a killing blow (+2 to
   * the killer). Reaching the next per-level threshold (3 → 6 → 9 exp)
   * advances `level` and rolls the surplus into the next bar. Resets to
   * level 1 / 0 exp on death (alongside other corpse cleanup).
   */
  exp?: number;
  level?: 1 | 2 | 3 | 4;
}

export interface PlayerState {
  id: PlayerID;
  /** The side's track, front to back: Guardian, Walker, Patron (always these
   *  three, in this order — `STRUCTURES`, or a scripted match's own). Pushes
   *  take the front standing one first (`pushStructures`, map.ts). The Patron
   *  falling loses the match. */
  structures: Structure[];
  souls: number;
  /** The deck, face down (zone 'deck'): the side's items and its drafted
   *  heroes, shuffled. The top card is the LAST of the list (`drawCards`
   *  takes from the end). An upgrade made by playing its component is
   *  shuffled in. Empty: nothing more is drawn, and nothing else happens. */
  deck: CardInstance[];
  /** The cards in hand, in the order they came (zone 'hand'): heroes and
   *  items, drawn (or given: a Story reward) and not yet played. A hero goes
   *  to the bench for free; an item onto a hero for its price. A draw past
   *  MAX_HAND is skipped (a fallen hero coming back is not a draw). Items in
   *  hand count in net worth at list price. */
  hand: CardInstance[];
  /** The discard pile (zone 'discard'), newest last: the cards a draw card
   *  made its player discard, and the item an evolved upgrade replaced. */
  discard: CardInstance[];
  active: CardInstance | null;
  bench: (CardInstance | null)[]; // length 3
  /** The side's heroes have felled the enemy Walker: every hero has the flex
   *  slot, MAX_ITEMS + FLEX_SLOT items (`slotCap`). Set when that Walker falls
   *  (map.ts). */
  flexSlot: boolean;
  /** The Rejuvenator: revives this side has left — a hero of it that falls
   *  comes straight back in place, at full HP, one credit spent. Set to
   *  REVIVE_CREDITS when the side takes the Mid-Boss; 0 once the window shuts. */
  reviveCredits: number;
  /** The last round the credits are good through (they lapse at its end). */
  reviveUntilRound: number;
}

/** What the map has seen one side do this match: the result sheet and the
 *  sims read it. */
export interface MapRecord {
  /** Enemy heroes that fell to this side — a kill the Rejuvenator undid
   *  included (it still paid and pushed). The Mid-Boss's blow kills nobody's. */
  kills: number;
  /** Pushes this side made into the rival's structures (kills and empty
   *  lanes), and the structure HP they took. */
  pushes: number;
  pushDamage: number;
  /** Mid-Bosses this side took, and of them, the ones taken while it trailed
   *  on net worth. */
  bossKills: number;
  bossKillsBehind: number;
  /** Heroes of this side the Rejuvenator brought straight back. */
  revives: number;
}

export interface LogEntry {
  turn: number;
  text: string;
}

/**
 * One "action" the player or AI just took — drives the matching reveal
 * animation (item flash, skill flash, ult flash) and the UI/AI lock that
 * prevents the next move until the animation finishes. State transitions
 * `begin` → `done` via the `completeAction` move once the UI's animation
 * timeout fires. Engine moves do not gate themselves on this — tests bypass
 * the UI and the lock lives at the dispatch layer.
 */
export type GameActionKind = 'item' | 'skill' | 'ult';

export interface GameAction {
  id: string;
  kind: GameActionKind;
  by: PlayerID;
  cardId: CardId;
  state: 'begin' | 'done';
  /** For a 'skill' action: which of the hero's skills was used (the skill
   *  flash reads its name). */
  abilityId?: AbilityId;
}

// ---------------------------------------------------------------------------
// Board FX stream — everything the match screen animates after the engine has
// resolved it. The engine pushes one event per thing that visibly happened;
// the UI plays each new batch as a small choreographed timeline (a skill's
// flare on the caster, its bolt to the target, the type-coloured impact, the
// status stamps) and holds the stat numbers until the impact lands.
// ---------------------------------------------------------------------------

/** How an effect came about. The FX layer picks its animation family from
 *  this: a skill / spell (an active item) / ult is a cast (a bolt leaves the
 *  caster), a proc is
 *  a passive going off, a tick is a start- or end-of-turn resolution. The
 *  basic swing is 'attack' — the engine reports it like everything else, but
 *  the combat choreographer has already walked it from the forecast BEFORE the
 *  engine resolved, so the board skips these events (`walkedByChoreographer`
 *  in ui/effects/fx/fxTimeline.ts). Anything riding on a swing (a tagged proc)
 *  is filed as 'proc'. */
export type FxCastKind = 'skill' | 'spell' | 'ult' | 'proc' | 'tick' | 'attack';

/** A one-of-a-kind effect signature. Each tag has its own animation in the
 *  FX layer (Djinn's Mark converging and detonating, Bleed dripping, Mystic
 *  Reverb ringing in, a Killing Blow slashing…). Untagged events fall back to
 *  the damage-type family (gunfire / spirit / pure). */
export type FxTag =
  | 'djinns_mark'    // Mirage's mark detonating (at 4 stacks or on expiry)
  | 'bleed'          // start-of-turn Bleed tick
  | 'reverb'         // Mystic Reverb's delayed echo
  | 'naptime'        // Rem's Naptime wake-up burst
  | 'discharge'      // Charged running out → Stun
  | 'execute'        // Shiv's Killing Blow execute
  | 'life_drain'     // Lady Geist's Life Drain hit
  | 'lifesteal'      // healing drawn out of a struck enemy (Bloodscent, Leech…)
  | 'mixed_bullets'  // Wraith's spirit rider on her bullet
  | 'ricochet'       // a Ricochet bounce off the swing to another enemy hero
  | 'tesla'          // Tesla Bullets chaining to the bench
  | 'burst'          // Mystic Burst proc after a skill
  | 'channel'        // a channeled ultimate's end-of-turn pulse
  | 'regen'          // start-of-turn regeneration (Abrams, Extra Regen)
  | 'combo'          // Mo & Krill's Combo drain
  | 'siphon';        // Siphon Bullets' max-HP transfer

/** Who caused an effect, as far as the board can point at them (the Mid-Boss
 *  belongs to nobody). */
export interface FxSource {
  iid: string;
  cardId: CardId;
  owner: Owner;
}

interface FxBase {
  /** Monotonic id — the UI tracks a high-water mark to play only new events. */
  seq: number;
}

/** A resolved damage hit (post-resist, post-shield). */
export interface HitFx extends FxBase {
  kind: 'hit';
  iid: string;            // the damaged unit
  amount: number;         // final damage dealt
  type: DamageType;       // 'attack' (bullet) | 'spirit' | 'pure'
  ko: boolean;            // dropped the unit to 0
  cast: FxCastKind;
  source?: FxSource;
  tag?: FxTag;
  /** Tag-specific count — Djinn's Mark stacks that detonated. */
  stacks?: number;
}

export interface HealFx extends FxBase {
  kind: 'heal';
  iid: string;
  amount: number;
  tag?: FxTag;
  /** Where the healing was drawn from (lifesteal) — the motes stream from here. */
  from?: FxSource;
  source?: FxSource;
}

export interface StatusFx extends FxBase {
  kind: 'status';
  iid: string;
  statusId: StatusId;
  /** Resulting magnitude on the unit (after stacking / refresh). */
  value: number;
  duration: number;
  debuff: boolean;
  tag?: FxTag;
  source?: FxSource;
}

/** A Shield ate some or all of a hit. */
export interface ShieldFx extends FxBase {
  kind: 'shield';
  iid: string;
  absorbed: number;
  broken: boolean;        // the shield is gone after this
  type: DamageType;
  /** How the hit that met the Shield came about (a basic swing is 'attack'). */
  cast?: FxCastKind;
  source?: FxSource;
}

/** Unstoppable shrugged something off. */
export interface ImmuneFx extends FxBase {
  kind: 'immune';
  iid: string;
  what: 'damage' | StatusId;
  /** For `what: 'damage'`: how the hit that was shrugged off came about. */
  cast?: FxCastKind;
}

/** One swing of the turn's attack, pushed BEFORE that swing's damage so the
 *  stream reads "this swing, then what it did": the hit, the Shield that ate
 *  part of it, the riders and detonations it set off. The forecast reads the
 *  swings back off the real run. */
export interface SwingFx extends FxBase {
  kind: 'swing';
  iid: string;            // the attacker
  targetIid: string;
  /** 0 for the primary swing, 1.. for Extra Attacks. */
  index: number;
  /** The attack power the swing was made with, before the target's mitigation. */
  raw: number;
  /** What the swing carried: 'Extra Attack' on an extra swing, a bonus's own
   *  label (Frenzy's) on a swing whose attack power included one. */
  label?: string;
  /** The target's HP as the swing begins — so HP after a swing is read off the
   *  next one's, riders and detonations included. */
  targetHp: number;
}

/** A cast just happened — pushed BEFORE its effects so the batch reads as
 *  "this caster did the following". `iid` is the casting unit on the board:
 *  the hero for a skill or an ultimate (`cardId` then names the ultimate's
 *  face), the bearer for an active item ('spell', `cardId` the item) and for
 *  an item put on ('equip'); absent when nobody's there. */
export interface CastFx extends FxBase {
  kind: 'cast';
  castKind: 'skill' | 'spell' | 'ult' | 'equip';
  by: PlayerID;
  cardId: CardId;
  iid?: string;
  targetIid?: string;
}

/** A corpse came back at full HP — or, `credit`, a hero the Rejuvenator
 *  brought straight back where it fell (the knockout still pushed), or,
 *  `cancelled`, a hero a trigger stood back up before its fall went ahead
 *  (Shocking Reanimation: no knockout at all). */
export interface ReviveFx extends FxBase {
  kind: 'revive';
  iid: string;
  credit?: true;
  cancelled?: true;
}

/** A hero reached a new level. */
export interface LevelUpFx extends FxBase {
  kind: 'levelup';
  iid: string;
  level: number;
}

/** A push hit a structure: `side`'s `structure` lost `amount` and has `hp`
 *  left. One per structure a push reaches. */
export interface PushFx extends FxBase {
  kind: 'push';
  side: PlayerID;
  structure: StructureKind;
  amount: number;
  hp: number;
  cause: PushCause;
}

/** A structure fell: `side`'s `structure`, to the other side's push. */
export interface FallFx extends FxBase {
  kind: 'fall';
  side: PlayerID;
  structure: StructureKind;
}

/** The Mid-Boss: it rose in the pit ('spawn'), it fell ('death': `pid` took
 *  it, settled `by` the damage tally, net worth or the last hit), and its
 *  reward ('award': `pid`'s souls and Rejuvenator credits). Its hits are
 *  `hit` events like any unit's. */
export interface BossFx extends FxBase {
  kind: 'boss';
  what: 'spawn' | 'death' | 'award';
  iid: string;
  pid?: PlayerID;
  by?: 'damage' | 'netWorth' | 'lastHit';
}

/** A card moved between a side's deck, hand and discard pile — what the
 *  deck, the discard pile and the hand animate: 'shuffle' (the deck was
 *  shuffled: the opening, the drafted heroes going in), 'draw' (deck → hand),
 *  'discard' (hand → discard pile), 'upgrade' (an upgrade card made and
 *  shuffled into the deck), 'toHand' (a fallen hero back in the hand). `iid` /
 *  `cardId` name the card ('shuffle' names none). */
export interface DeckFx extends FxBase {
  kind: 'deck';
  /** `place`: a hero from the hand (or, the opening, the deck) put in a slot
   *  of the board (`slot`: 0 the Active, 1-3 the bench). `rideOn`: a hero
   *  left its slot to ride on an ally as equipment (Rem's Tag Along;
   *  `bearerIid` the ally). `rideOff`: the ride is over and it is back on the
   *  bench (`slot`), off `bearerIid`. */
  what: 'shuffle' | 'draw' | 'discard' | 'upgrade' | 'toHand' | 'place' | 'rideOn' | 'rideOff';
  pid: PlayerID;
  iid?: string;
  cardId?: CardId;
  slot?: 0 | 1 | 2 | 3;
  /** `rideOn` / `rideOff`: the hero ridden on. */
  bearerIid?: string;
}

export type FxEvent = HitFx | HealFx | StatusFx | ShieldFx | ImmuneFx | SwingFx | CastFx | ReviveFx | LevelUpFx | PushFx | FallFx | BossFx | DeckFx;

/**
 * Pre-match hero draft. Both players take turns picking 4 heroes each from
 * the full pool in snake order (seat 0 first). While `draft != null` the
 * regular match gates are inactive and the DraftOverlay is displayed. On the
 * 8th pick the move builds both decks (each side's items and its four
 * heroes, shuffled), deals the opening hands, clears `draft` and ends the
 * draft's turn: the first mover (seat 1, the pie rule) opens engine turn 1.
 */
export interface DraftState {
  pool: CardId[];                                 // remaining hero ids
  order: PlayerID[];                              // length 8, snake e.g. ['0','1','1','0','0','1','1','0']
  currentIndex: number;                           // 0..order.length
  picks: { '0': CardId[]; '1': CardId[] };        // per-player picks in pick order
}

/** The counters that name things (see ids.ts). They live in G so a game is
 *  its whole state: a simulation on a clone counts on its own copy. */
export interface Counters {
  /** Next instance id number. */
  iid: number;
  /** Last FX event sequence number handed out. */
  fx: number;
  /** Last `G.action` id handed out. */
  action: number;
  /** Random numbers drawn from the match seed so far (a shuffle, the opening
   *  hand's hero swap, where an upgrade goes in the deck): each draw is
   *  `seed` and this count mixed (deck.ts), so a game replays from G alone. */
  rng?: number;
}

/** A moment the trigger prompt system asks a player's optional triggers at
 *  (engine/prompts.ts). 'onFall': one of their heroes has dropped to 0 HP and
 *  is about to fall — the moment Victor's Shocking Reanimation answers. */
export type TriggerMoment = 'onFall';

/** One optional trigger a prompt offers: the hero's ability that may be used. */
export interface TriggerOffer {
  heroIid: string;
  abilityId: AbilityId;
}

/** A trigger prompt the game is waiting on ("Use Shocking Reanimation for 7
 *  souls?"): an optional ("you may") effect that came at a moment, offered to
 *  the player whose card it is — on either player's turn. Nothing else is
 *  legal until it is answered: one of `offers` used, or passed. The moment's
 *  own outcome (the fall) waits on the answer. */
export interface PendingTrigger {
  /** The seat asked. */
  pid: PlayerID;
  /** The moment it came at. */
  moment: TriggerMoment;
  /** The hero the moment is about: for 'onFall', the hero falling. */
  subjectIid: string;
  /** The usable triggers, in the order found (the player picks one, or passes). */
  offers: TriggerOffer[];
  /** 'onFall': the fall, if it goes ahead, pays nothing (the Mid-Boss's blow). */
  unpaid?: true;
}

/** A draw card's discard, owed by the player who cast it: `count` cards from
 *  anywhere in the hand, chosen by that player. Nothing else is legal until it
 *  is paid (`discard`). */
export interface PendingDiscard {
  pid: PlayerID;
  count: number;
  /** The draw card that asked for it (for the prompt's words). */
  cardId: CardId;
}

export interface GameState {
  /** Id / FX-seq / action-id counters — see ids.ts. */
  counters: Counters;
  players: { '0': PlayerState; '1': PlayerState };
  /** The engine turn: both players' turns counted together, 1 the first
   *  mover's first. Own turns and rounds are read off it by rounds.ts. 0 between
   *  the last draft pick and the first turn. */
  turnNumber: number;
  /** The seat that takes the first turn. The pie rule: seat 0 drafts first, so
   *  seat 1 moves first in a drafted match; a scripted match names its own
   *  (seat 0 by default). Read it through `firstMover` (rounds.ts). */
  firstMover: PlayerID;
  /** The seat a person plays, or null when the AI plays both (a sim). Only that
   *  seat is asked who steps up when its Active falls (`pendingPromotion`); every
   *  other seat is promoted on the spot. Seat 0 by default. */
  humanSeat: PlayerID | null;
  log: LogEntry[];
  /** Pre-match hero draft. Null once draft completes. */
  draft: DraftState | null;
  /**
   * Offset between boardgame.io's ctx.turn and the engine turn. The draft
   * uses boardgame.io turns for its snake order, so the match's first turn is
   * a later ctx.turn; `beginTurn` reads `G.turnNumber = ctx.turn -
   * draftTurnsOffset`. Set when the last pick ends the draft's turn.
   */
  draftTurnsOffset: number;
  /** The match seed. Every shuffle and random pick of the match is drawn from
   *  it (deck.ts, through rng.ts), so a match replays from G alone. */
  seed: number;
  /** The builds the human seat brought: the player's saved builds, by hero,
   *  from the match config at setup. A hero they do not name, and every hero
   *  of an AI seat, follows its default build (cards/builds.ts). Read through
   *  `buildOf` (deck.ts): a side with no saved deck has one made from them. */
  playerBuilds?: Record<CardId, CardId[]>;
  /** The deck the human seat brought: the player's saved deck (DECK_SIZE
   *  items), from the match config at setup. Absent or not a legal deck: the
   *  deck is made from its heroes' builds (`deckFromBuilds`). */
  playerDeck?: CardId[];
  /** A draw card's discard still owed (see `PendingDiscard`). */
  pendingDiscard?: PendingDiscard;
  /** The trigger prompts waiting on an answer, oldest first: the LAST is the
   *  one asked (engine/prompts.ts). The first version opens one per moment and
   *  answers it before play goes on, so it holds one at a time; it is a stack
   *  so a chain (an answer to an answer, the newest resolving first) can push
   *  onto it later. Absent when nothing is owed. */
  triggers?: PendingTrigger[];
  /** The human seat has not yet put its first Active in the lane: the match's
   *  opening (after the opening hand is dealt). Only `chooseActive` is legal,
   *  for that seat, from either seat, until it does. AI seats choose at once. */
  pendingActive?: PlayerID;
  /** The turn's attack has been made. One basic attack a turn per player: this
   *  is its gate, and the attack ends the Act — after it nothing is legal but
   *  `endTurn` (and an owed promotion). Ending the turn never attacks. Reset at
   *  each turn start. */
  attackUsed: boolean;
  /** The turn's Retreat has been made (one a turn). Reset at each turn start. */
  retreatUsed: boolean;
  /** This match has a Mid-Boss: MID_BOSS_ENABLED (off since 2026-11-09), or
   *  what the setup names (`StorySetup.midBoss`, `MatchConfig.midBoss`; the
   *  tests that cover it turn it on). Off, the boss never rises and nothing
   *  counts down to it (`bossDue` is null), so the board hides its pit. */
  midBoss: boolean;
  /** The Mid-Boss standing in the pit between the lanes (zone 'pit', owned by
   *  nobody, `boss_midboss`), or null while it is not up — before round
   *  BOSS_SPAWN_ROUND, and from its death until it returns. Only basic attacks
   *  reach it (`attackTargets` offers it); no status or ability does. */
  boss: CardInstance | null;
  /** The damage each side has dealt the boss standing in the pit: the side
   *  with more takes it when it falls. Zeroed when a boss rises. */
  bossDamage: { '0': number; '1': number };
  /** The side that landed the last hit on the boss in the pit (the last
   *  tie-break of who takes it); null before any hit. */
  bossLastHit: PlayerID | null;
  /** The round at whose start the boss next rises (BOSS_SPAWN_ROUND, then
   *  BOSS_RESPAWN_ROUNDS after the round it died in). */
  bossRespawnRound: number;
  /** The hero that attacked the boss this turn: at the End step the boss hits
   *  it back for BOSS_RETALIATION. Cleared at each turn start. */
  bossAttacker: string | null;
  /** Round ROUND_CAP is over (set as the second mover's own turn ROUND_CAP
   *  ends): the match is decided on what stands (`checkWinner`). */
  capped: boolean;
  /** What each side has done on the map this match (kills, pushes, bosses,
   *  revives). */
  record: { '0': MapRecord; '1': MapRecord };
  /** Set by the `resolve` pass when the human seat's Active is a corpse and an
   *  eligible bench hero can step up — a forced promotion is owed, and the UI
   *  asks who (PromotionOverlay), or the auto-play loop answers. Every other
   *  seat is promoted inside `resolve`. Cleared once a promotion lands. */
  pendingPromotion?: PlayerID;
  /** Current resolving action (card play / skill / ult). UI watches this to
   *  trigger the reveal animation and pause further input until the player
   *  has had time to see what just happened. */
  action: GameAction | null;
  /** Transient board-FX stream — hits, heals, statuses, casts, revives…
   *  since the last turn ended. Cleared when a turn's end effects begin (so
   *  after `endTurn` it holds that turn's end and the next turn's start); the UI
   *  plays new entries by tracking the highest `seq` it has seen. */
  fx: FxEvent[];
}
