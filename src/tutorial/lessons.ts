/**
 * The tutorial — eight short lessons, step by step (Patrick, 2026-11-18:
 * "design a good tutorial for step by step"). The rules it is written to:
 *
 *   One step, one tap.   A step's title names the tap ("Tap Warden"); its
 *                        one line says why, or what the tap before it did.
 *                        Nothing is read and dismissed.
 *   One new thing.       A lesson teaches one idea and uses the ones before
 *                        it without saying them again.
 *   The taught move wins. Every lesson is its own small fight on the scripted
 *                        path Story uses (`StorySetup`): fixed heroes on the
 *                        board, a deck the lesson names, and numbers set so
 *                        the move being taught is the move that wins; the
 *                        line that skips it does not (tests/ui/lessons.spec.ts).
 *   Three lines to keep. A lesson closes on what it taught, as three short
 *                        lines at most (`learned`), over the verdict.
 *
 *   1  Attack          Warden against Lash: attack, end the turn, attack.
 *   2  The Skill       Yamato's Flying Slash, then the attack: both in a turn.
 *   3  Items           Yamato draws Extended Magazine and pays a soul to put
 *                      it on; the swing it adds is the kill.
 *   4  Spells          Kelvin plays Cold Front on Lash; the attack is the kill.
 *   5  The Bench       Haze is spent. Warden is drawn, benched for free and
 *                      sent in by a Retreat; Warden's swing is the kill.
 *   6  Level Up        Warden is one exp short of Level 3: a first item is
 *                      that exp, and Level 3 is the ultimate, Last Stand.
 *   7  A Fallen Hero   Warden is killed, is drawn again with the level and
 *                      the item kept, takes the lane and wins.
 *   8  The Map         Round 4: Frost Grenade's kill pushes the rival's
 *                      Guardian down, and the End pushes the empty lane into
 *                      the Patron (mapLesson.ts; its Mid-Boss part is off
 *                      with the Mid-Boss).
 *
 * In lessons 1–7 the rival's patron has one point left, so the kill is the
 * win (lesson 8 sets both tracks itself). Each step names exactly the control
 * that performs it (the gate lets nothing else through), waits out the
 * rival's turn, and — should the move be out of reach — points at the turn
 * button instead of asking for a move that cannot be made.
 */
import type { CardId, CardInstance, GameState, PlayerID } from '@/engine/types';
import type { StorySetup } from '@/storage/matchConfig';
import { CARDS_BY_ID, cardName } from '@/cards';
import { effectiveAtk, heroAbilities, isRespawning, itemPrice, skillWait, stepInCandidates, ultimateCard, wornItems } from '@/engine/query';
import { attackBlocked, placeHeroBlocked, playBlocked, retreatCost, skillBlocked } from '@/engine/legality';
import { EXP_ON_EQUIP, LANE_INCOME, ULT_UNLOCK_LEVEL } from '@/engine/constants';
import { retreatBlock } from '@/ui/board/heroActions';
import { END_TURN } from '@/ui/board/BoardControls';
import { inHandLabel } from '@/ui/board/Hand';
import { mapLesson, type LessonKit } from './mapLesson';

/* ------------------------------------------------------------------ */
/* The matches                                                         */
/* ------------------------------------------------------------------ */

/** A lesson's fight: your hero against Lash, no scaling on the rival. The
 *  rival's patron is down to its last point, so the one kill each lesson
 *  builds to is the win (a wiped board alone is not). Both decks are empty
 *  and nobody draws an opening hand, so nothing comes to hand but what the
 *  lesson deals. */
function fight(over: Partial<StorySetup> = {}): StorySetup {
  return {
    playerHeroes: ['hero_kelvin'],
    enemyHeroes: ['hero_lash'],
    enemyBuff: { atk: 0, hp: 0 },
    patronHp: 4,
    enemyPatronHp: 1,
    playerDeck: [],
    enemyDeck: [],
    openingHand: 0,
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* Reading the board                                                   */
/* ------------------------------------------------------------------ */

/** Monotonic latches the coach sets as it watches play — once set, they
 *  stay set, so a step can't un-complete when the turn rolls over. */
export interface CoachSeen {
  /** Some hero of yours wears an item. */
  equipped: boolean;
  usedSkill: boolean;
  /** You used an active item. */
  usedItem: boolean;
  castUlt: boolean;
  swapped: boolean;
  /** How many of your turns you have attacked in. */
  attacks: number;
  /** How many of your turns you have ended. */
  turnsEnded: number;
  /** How many heroes you have put on the board from your hand. */
  placed: number;
}

export const emptySeen: CoachSeen = {
  equipped: false,
  usedSkill: false,
  usedItem: false,
  castUlt: false,
  swapped: false,
  attacks: 0,
  turnsEnded: 0,
  placed: 0,
};

export interface CoachView {
  G: GameState;
  me: PlayerID;
  seen: CoachSeen;
  /** A card, a skill or an attack is armed and waiting for its target. */
  targeting: boolean;
  /** A hero from your hand is picked up and waiting for its spot. */
  placing: boolean;
  /** Your attack is being walked, before the engine makes it. */
  attacking: boolean;
  /** The hero detail sheet is open (where Skill, Attack and Retreat live). */
  sheetOpen: boolean;
  /** …and whose it is. */
  sheetHero: CardId | null;
}

/**
 * A gate spec names something on screen by its accessible name:
 *   `Kelvin —`                 first element whose aria-label starts with this
 *   `*Bench slot`              every element whose aria-label starts with this
 *   `~Retreat`                 first button whose text contains this
 *   `Hero sheet >> Attack`     the second, looked up inside the first
 */
export type GateSpec = string;

const RIVAL: PlayerID = '1';
const alive = (c: CardInstance | null | undefined): c is CardInstance => !!c && !isRespawning(c);
const nameOf = (c: CardInstance | null | undefined) =>
  c ? cardName(c.cardId) : '';
/** The hero tile announces itself as "Kelvin — 2 attack, 6 health". */
const tile = (c: CardInstance | null | undefined) => (c ? `${nameOf(c)} —` : '');
/** The Attack plate on the open hero sheet; its accessible name starts
 *  "Attack". Looked up inside the sheet, so nothing else on the board can
 *  answer to it. */
const ATTACK_PLATE: GateSpec = 'Hero sheet >> Attack';
/** The empty lane and the free bench spots, lit while a hero from the hand
 *  is picked up (BoardTable's SlotWell names them only then). */
const LANE_SPOT: GateSpec = 'Active slot';
const BENCH_SPOTS: GateSpec = '*Bench slot';

function activeOf(G: GameState, pid: PlayerID): CardInstance | null {
  const a = G.players[pid].active;
  return alive(a) ? a : null;
}
function benchOf(G: GameState, pid: PlayerID): CardInstance | null {
  return G.players[pid].bench.find(alive) ?? null;
}
/** "Frost Grenade" — the hero's first skill by its own name, exactly as the
 *  sheet prints it. */
function skillNameOf(c: CardInstance | null): string {
  if (!c) return 'the skill';
  const data = CARDS_BY_ID[c.cardId];
  if (data?.type !== 'hero') return 'the skill';
  return heroAbilities(data).find((x) => x.kind === 'skill')?.ability.name || 'the skill';
}
/** How long the hero's first skill waits after a use, in turns. */
function skillWaitOf(c: CardInstance | null): number {
  const data = c ? CARDS_BY_ID[c.cardId] : undefined;
  const ability = data?.type === 'hero' ? heroAbilities(data).find((x) => x.kind === 'skill')?.ability : undefined;
  return ability ? skillWait(ability) : 0;
}
/** The hero's ultimate: its ability id and the name its button prints. */
function ultOf(c: CardInstance | null): { id: string; name: string } | null {
  const data = c ? CARDS_BY_ID[c.cardId] : undefined;
  if (data?.type !== 'hero' || !data.ult) return null;
  return { id: data.ult, name: ultimateCard(data.ult)?.name ?? 'the ultimate' };
}

/** A number in the coach's voice: "two". */
const word = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
/** A count of souls, in figures: "1 soul", "2 souls". */
const soulsText = (n: number) => `${n} soul${n === 1 ? '' : 's'}`;

/** True once any hero of yours wears an item. */
export function hasEquipment(G: GameState, me: PlayerID): boolean {
  const ps = G.players[me];
  return [ps.active, ...ps.bench].some((c) => !!c && wornItems(c).length > 0);
}

/** True when your hero `who` wears the item `id`. */
function wears(c: CardInstance | null, id: CardId): boolean {
  return !!c && wornItems(c).some((it) => it.cardId === id);
}

/** Your card `id` in the hand, if one is there. */
function inHand(v: CoachView, id: CardId): CardInstance | undefined {
  return v.G.players[v.me].hand.find((c) => c.cardId === id);
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

type Text = string | ((v: CoachView) => string);

export interface CoachStep {
  id: string;
  /** The tap this step is, in two or three words: "Tap Warden". */
  title: Text;
  /** One short line: why, or what the tap before it did. */
  body: Text;
  /** Completes when this reads true. Every step has one. */
  task: (v: CoachView) => boolean;
  /** Can the move be made right now? When not, the plate shows `blocked`
   *  and opens the turn button instead — a short soul pocket must never
   *  trap the player in a step they cannot finish. */
  ready?: (v: CoachView) => boolean;
  blocked?: Text;
  /** Returns a line to hold on while something plays out, or null to
   *  proceed. Steps wait for your turn by default (`rival` is the line). */
  wait?: (v: CoachView) => string | null;
  /** The line the plate holds on while the rival moves, when the lesson has
   *  one of its own to say (RIVAL_TURN when left out). */
  rival?: Text;
  /** What is lit through the scrim. Empty = the whole board is sealed. */
  spot: (v: CoachView) => GateSpec[];
  /** What may be tapped. Defaults to `spot`. */
  allow?: (v: CoachView) => GateSpec[];
  /** How long the plate holds on the tick before the next step, in ms (the
   *  plate's own beat when left out). A sheet sliding open needs less. */
  beat?: number;
  /** The step is the placing of a hero picked up from the hand: the gate
   *  stays up while its spots are lit (on any other step it steps aside). */
  placing?: boolean;
}

export const RIVAL_TURN = "Rival's turn. Watch.";

/** The turn button, by its name. */
export const TURN_BUTTON: GateSpec = END_TURN;

/** A sheet opening is no event to dwell on: the next tap lights at once. */
const QUICK_BEAT = 320;

const mine = (v: CoachView) => activeOf(v.G, v.me);
const theirs = (v: CoachView) => activeOf(v.G, RIVAL);
const myBench = (v: CoachView) => benchOf(v.G, v.me);
const atkOf = (c: CardInstance | null) => (c ? effectiveAtk(c) : 0);
const hp = (c: CardInstance | null) => c?.hp ?? 0;
const tap = (what: string) => `Tap ${what}`;
const myName = (v: CoachView) => nameOf(mine(v)) || 'your hero';
const theirName = (v: CoachView) => nameOf(theirs(v)) || 'the rival';

/** `step`, with more of the board lit beside what it lights itself: what its
 *  line points at (a level ring, your souls, the rival's structures). Lit
 *  only: what may be tapped stays the step's own. */
function lit(step: CoachStep, more: (v: CoachView) => GateSpec[]): CoachStep {
  const spot = step.spot;
  return { ...step, spot: (v) => [...spot(v), ...more(v)], allow: step.allow ?? spot };
}

/** Your souls, beside the turn button. */
const MY_SOULS: GateSpec = 'Your souls:';

/** One tap on your Active: its sheet opens. That is where the attack, the
 *  skill, the ultimate and the Retreat are. */
function open(id: string, body: Text, rival?: Text): CoachStep {
  return {
    id,
    title: (v) => tap(myName(v)),
    body,
    rival,
    task: (v) => v.sheetHero !== null && v.sheetHero === mine(v)?.cardId,
    ready: (v) => !!mine(v),
    blocked: 'No hero of yours is in the lane. End the turn.',
    spot: (v) => [tile(mine(v))].filter(Boolean),
    beat: QUICK_BEAT,
  };
}

/** One tap on Attack, on the open sheet: your `n`-th attack of the lesson.
 *  Should the sheet be closed, the tap that opens it comes first. */
function attack(id: string, n: number, body: Text): CoachStep {
  return {
    id,
    title: (v) => (v.sheetOpen || v.attacking ? 'Tap Attack' : tap(myName(v))),
    body,
    task: (v) => v.seen.attacks >= n,
    ready: (v) => attackBlocked(v.G, v.me) === null,
    blocked: 'No attack left this turn. End the turn.',
    spot: (v) => (v.sheetOpen ? ['Hero sheet'] : [tile(mine(v))]),
    allow: (v) => (v.sheetOpen ? [ATTACK_PLATE] : [tile(mine(v))]),
  };
}

/** One tap on your Active's skill, on the open sheet: it lifts and waits for
 *  its target (`aim` is the tap after). */
function skill(id: string, body: Text): CoachStep {
  return {
    id,
    title: (v) => (v.sheetOpen || v.targeting ? tap(skillNameOf(mine(v))) : tap(myName(v))),
    body,
    task: (v) => v.targeting || v.seen.usedSkill,
    ready: (v) => {
      const me = mine(v), them = theirs(v);
      return !!me && !!them && skillBlocked(v.G, v.me, me, them.iid) === null;
    },
    blocked: (v) => `${skillNameOf(mine(v))} is waiting. End the turn; it comes back.`,
    spot: (v) => (v.sheetOpen ? ['Hero sheet'] : [tile(mine(v))]),
    allow: (v) => (v.sheetOpen ? [`~${skillNameOf(mine(v))}`] : [tile(mine(v))]),
    beat: QUICK_BEAT,
  };
}

/** One tap on your Active's ultimate, on the open sheet. */
function ultimate(id: string, body: Text): CoachStep {
  return {
    id,
    title: (v) => (v.sheetOpen || v.targeting ? tap(ultOf(mine(v))?.name ?? 'the ultimate') : tap(myName(v))),
    body,
    task: (v) => v.targeting || v.seen.castUlt,
    ready: (v) => {
      const me = mine(v), them = theirs(v), ult = ultOf(me);
      return !!me && !!them && !!ult && skillBlocked(v.G, v.me, me, them.iid, ult.id) === null;
    },
    blocked: 'The ultimate is not ready. End the turn.',
    spot: (v) => (v.sheetOpen ? ['Hero sheet'] : [tile(mine(v))]),
    allow: (v) => (v.sheetOpen ? [`~${ultOf(mine(v))?.name ?? 'Ultimate'}`] : [tile(mine(v))]),
    beat: QUICK_BEAT,
  };
}

/** One tap on the rival's Active: the target of the skill or ultimate that
 *  is lifted (`done` says which has to have gone off). Should it have been
 *  put back down, the tap that lifts it again comes first. */
function aim(id: string, what: 'skill' | 'ult', body: Text): CoachStep {
  const row = (v: CoachView) => (what === 'ult' ? ultOf(mine(v))?.name ?? 'Ultimate' : skillNameOf(mine(v)));
  return {
    id,
    title: (v) => (v.targeting ? tap(theirName(v)) : v.sheetOpen ? tap(row(v)) : tap(myName(v))),
    body,
    task: (v) => (what === 'ult' ? v.seen.castUlt : v.seen.usedSkill),
    ready: (v) => !!mine(v) && !!theirs(v),
    blocked: 'Nothing to aim at. End the turn.',
    spot: (v) => (v.targeting ? [tile(theirs(v))] : v.sheetOpen ? ['Hero sheet'] : [tile(mine(v))]),
    allow: (v) => (v.targeting ? [tile(theirs(v))] : v.sheetOpen ? [`~${row(v)}`] : [tile(mine(v))]),
  };
}

/** One tap on the card `itemId` in your hand: it lifts and waits for the
 *  hero it goes to (`putOn` or `castOn` is the tap after). */
function pick(id: string, itemId: CardId, on: 'mine' | 'theirs', body: Text): CoachStep {
  const label = cardName(itemId);
  const gone = (v: CoachView) => !inHand(v, itemId);
  return {
    id,
    title: tap(label),
    body,
    task: (v) => v.targeting || gone(v),
    // The engine's own question: the card in the hand, the souls, a hero for it.
    ready: (v) => {
      const card = inHand(v, itemId), to = on === 'mine' ? mine(v) : theirs(v);
      return gone(v) || (!!card && !!to && playBlocked(v.G, v.me, card.iid, to.iid) === null);
    },
    blocked: `${label} cannot be played now. End the turn; it waits in your hand, and ${word(LANE_INCOME)} more souls arrive.`,
    spot: () => [inHandLabel(label)],
    beat: QUICK_BEAT,
  };
}

/** One tap on your Active: the item `itemId`, lifted from the hand, goes on
 *  it for its price and stays. */
function putOn(id: string, itemId: CardId, body: Text): CoachStep {
  const label = cardName(itemId);
  return {
    id,
    title: (v) => (v.targeting ? tap(myName(v)) : tap(label)),
    body,
    task: (v) => wears(mine(v), itemId),
    ready: (v) => !!mine(v),
    blocked: 'No hero of yours is in the lane. End the turn.',
    spot: (v) => (v.targeting ? [tile(mine(v))] : [inHandLabel(label)]),
  };
}

/** One tap on the rival's Active: the spell `itemId`, lifted from the hand,
 *  is played on it for its price, does its work and goes to the discard pile. */
function castOn(id: string, itemId: CardId, body: Text): CoachStep {
  const label = cardName(itemId);
  return {
    id,
    title: (v) => (v.targeting ? tap(theirName(v)) : tap(label)),
    body,
    // Played: it is out of the hand and on the discard pile.
    task: (v) => !inHand(v, itemId) && v.G.players[v.me].discard.some((c) => c.cardId === itemId),
    ready: (v) => !!theirs(v),
    blocked: 'Nothing to play it on. End the turn.',
    spot: (v) => (v.targeting ? [tile(theirs(v))] : [inHandLabel(label)]),
  };
}

/** One tap on the hero `heroId` in your hand: it lifts, and the spots it may
 *  go in light (`place` is the tap after). The lesson's `n`-th hero put on
 *  the board from the hand: a hero who has stood there all along is no
 *  answer to it. */
function pickHero(id: string, heroId: CardId, n: number, body: Text, rival?: Text): CoachStep {
  const label = cardName(heroId);
  return {
    id,
    title: tap(label),
    body,
    rival,
    placing: true,
    task: (v) => v.placing || v.seen.placed >= n,
    // The engine's own question: the hero in the hand, and a spot for it.
    ready: (v) => {
      const card = inHand(v, heroId);
      return !!card && (placeHeroBlocked(v.G, v.me, card.iid) === null || placeHeroBlocked(v.G, v.me, card.iid, true) === null);
    },
    blocked: `${label} is not in your hand yet. End the turn; you draw a card each turn.`,
    spot: () => [inHandLabel(label)],
    beat: QUICK_BEAT,
  };
}

/** One tap on a lit spot: the hero `heroId`, lifted from the hand, goes on
 *  the bench — or into the lane, when the lane is where the lesson sends it.
 *  It costs nothing. */
function place(id: string, heroId: CardId, n: number, where: 'lane' | 'bench', body: Text): CoachStep {
  const label = cardName(heroId);
  const spots = where === 'lane' ? LANE_SPOT : BENCH_SPOTS;
  return {
    id,
    title: (v) => (v.placing ? (where === 'lane' ? 'Tap the lane' : 'Tap a lit spot') : tap(label)),
    body,
    placing: true,
    task: (v) => v.seen.placed >= n,
    ready: (v) => !!inHand(v, heroId),
    blocked: `${label} is not in your hand yet. End the turn; you draw a card each turn.`,
    spot: (v) => (v.placing ? [spots] : [inHandLabel(label)]),
  };
}

/** One tap on Retreat, on the open sheet: your Active swaps with your bench
 *  hero for its printed price. */
function retreat(id: string, body: Text): CoachStep {
  return {
    id,
    title: (v) => (v.sheetOpen ? 'Tap Retreat' : tap(myName(v))),
    body,
    task: (v) => v.seen.swapped,
    // The engine's own question: is a swap with the bench open to you now?
    ready: (v) => {
      const stepIns = stepInCandidates(v.G.players[v.me]);
      return stepIns.length > 0 && retreatBlock(v.G, v.me, stepIns) === null;
    },
    blocked: (v) => `Retreat costs ${soulsText(retreatCost(v.G, v.me))}, once a turn. End the turn, then come back to it.`,
    spot: (v) => (v.sheetOpen ? ['Hero sheet'] : [tile(mine(v))]),
    allow: (v) => (v.sheetOpen ? ['~Retreat'] : [tile(mine(v))]),
  };
}

/** One tap on the turn button: your `n`-th turn of the lesson ends, and the
 *  rival has its own. */
function endTurn(id: string, n: number, body: Text): CoachStep {
  return {
    id,
    title: tap(END_TURN),
    body,
    task: (v) => v.seen.turnsEnded >= n,
    spot: () => [TURN_BUTTON],
  };
}

/* ------------------------------------------------------------------ */
/* The lessons                                                         */
/* ------------------------------------------------------------------ */

export type LessonId = 'attack' | 'skill' | 'souls' | 'spells' | 'bench' | 'levelup' | 'fallen' | 'map';

export interface Lesson {
  id: LessonId;
  /** 1-based; printed as "Lesson 2". */
  number: number;
  title: string;
  /** One line under the title on the list: what the lesson teaches. */
  blurb: string;
  /** The hero whose portrait fronts the lesson on the list. */
  face: CardId;
  /** What the lesson taught, to keep: three short lines at most — printed
   *  over the verdict when it is won, and on the coach's closing card should
   *  the script run out first. */
  learned: string[];
  setup: () => StorySetup;
  steps: CoachStep[];
}

/** The step builders a lesson in its own file is made of (mapLesson.ts). */
export const LESSON_KIT: LessonKit = { fight, open, skill, aim, attack, endTurn, lit };

export const LESSONS: Lesson[] = [
  {
    id: 'attack',
    number: 1,
    title: 'Attack',
    blurb: 'Tap your hero, attack, end the turn.',
    face: 'hero_warden',
    learned: [
      'Tap your hero, then Attack. One attack a turn.',
      'End Turn gives the rival its turn.',
      'A kill hits the rival\'s Patron. When the Patron falls, you win.',
    ],
    // Warden swings for 2 at a Lash on 4: two turns of it, with Lash's own
    // turn (a swing of 1 at Warden) between them. Turn two, so there is an
    // attack: the first mover's first turn has none.
    setup: () => fight({
      startTurn: 2,
      playerHeroes: ['hero_warden'],
      enemyHeroStats: [{ hpMax: 4 }],
    }),
    steps: [
      open('open', (v) => `${myName(v)} is your hero, in the lane against ${theirName(v)}.`),
      attack('attack', 1, (v) => `An attack deals the hero's Bullet Power: ${atkOf(mine(v))}. ${theirName(v)} has ${hp(theirs(v))} HP.`),
      endTurn('end', 1, (v) => `${theirName(v)} is at ${hp(theirs(v))}. A hero attacks once a turn, so pass the turn.`),
      open('open-2', (v) => `Your turn again. ${theirName(v)} is at ${hp(theirs(v))} HP.`, (v) => `${theirName(v)}'s turn: a hit back.`),
      attack('attack-2', 2, (v) => `Finish ${theirName(v)}.`),
    ],
  },

  {
    id: 'skill',
    number: 2,
    title: 'The Skill',
    blurb: 'A skill is free. Then it waits.',
    face: 'hero_yamato',
    learned: [
      'A skill costs nothing. After a use it waits a few turns.',
      'Tap the skill, then tap its target.',
      'A hero can use its skill and attack in the same turn.',
    ],
    // Yamato swings for 1 at a Lash on 3: Flying Slash's two spirit damage
    // first, then the swing, is the kill; the swing alone is not. Turn two,
    // so there is an attack.
    setup: () => fight({
      startTurn: 2,
      playerHeroes: ['hero_yamato'],
      enemyHeroStats: [{ hpMax: 3 }],
    }),
    steps: [
      open('open', (v) => `${theirName(v)} has ${hp(theirs(v))} HP. ${myName(v)}'s attack deals ${atkOf(mine(v))}: not enough alone.`),
      skill('skill', (v) => `${skillNameOf(mine(v))} is ${myName(v)}'s skill: 2 damage. A skill costs nothing.`),
      aim('aim', 'skill', (v) => `The skill is lifted. ${theirName(v)} is lit: the target.`),
      open('open-2', (v) => `${theirName(v)} is at ${hp(theirs(v))}. ${skillNameOf(mine(v))} now waits ${word(skillWaitOf(mine(v)))} turns. The attack is still open.`),
      attack('attack', 1, (v) => `Skill, then attack, in one turn. Finish ${theirName(v)}.`),
    ],
  },

  {
    id: 'souls',
    number: 3,
    title: 'Items',
    blurb: 'Souls buy the cards you draw. An item stays on.',
    face: 'hero_yamato',
    learned: [
      `Each turn you get ${LANE_INCOME} souls and draw a card. Unspent souls stay.`,
      'An item costs souls. Tap it, then tap a hero of yours.',
      'An item stays on its hero. A hero wears 3.',
    ],
    // Yamato swings for 1 at a Lash on 2. The deck is one card, Extended
    // Magazine — a tier 1 for one of the turn's two souls — drawn as the turn
    // opens; on Yamato it makes the swing 2, and that swing is the kill. Turn
    // two, so there is an attack.
    setup: () => fight({
      startTurn: 2,
      playerHeroes: ['hero_yamato'],
      playerDeck: ['extended_magazine'],
      enemyHeroStats: [{ hp: 2 }],
    }),
    steps: [
      lit(pick('pick', 'extended_magazine', 'mine', `Each turn gives you ${LANE_INCOME} souls and a card. This item costs ${soulsText(itemPrice('extended_magazine'))}.`), () => [MY_SOULS]),
      putOn('put', 'extended_magazine', (v) => `Put it on ${myName(v)}: +1 Bullet Power, and it stays on.`),
      open('open', (v) => `${myName(v)} hits for ${atkOf(mine(v))} now. ${theirName(v)} has ${hp(theirs(v))} HP.`),
      attack('attack', 1, (v) => `Finish ${theirName(v)}.`),
    ],
  },

  {
    id: 'spells',
    number: 4,
    title: 'Spells',
    blurb: 'A spell works once, then it is gone.',
    face: 'hero_kelvin',
    learned: [
      'A spell has a bolt on its card. Pay, it works once, it is discarded.',
      'An item stays on a hero. A spell does not.',
      'Play as many cards in a turn as your souls pay for.',
    ],
    // Kelvin holds Cold Front, a spell, with four souls: two brought in and
    // the turn's two. Lash stands at three: Cold Front's two spirit damage,
    // then Kelvin's swing of one, are the kill. Turn two, so there is an attack.
    setup: () => fight({
      startTurn: 2,
      playerItems: ['cold_front'],
      playerSouls: 2,
      enemyHeroStats: [{ hp: 3 }],
    }),
    steps: [
      lit(pick('pick', 'cold_front', 'theirs', `Cold Front is a spell: the bolt on its card says so. It costs ${soulsText(itemPrice('cold_front'))}.`), () => [MY_SOULS]),
      castOn('cast', 'cold_front', (v) => `Play it on ${theirName(v)}: 2 damage.`),
      open('open', (v) => `The spell is spent: it went to your discard pile. ${theirName(v)} is at ${hp(theirs(v))} HP.`),
      attack('attack', 1, (v) => `Finish ${theirName(v)}.`),
    ],
  },

  {
    id: 'bench',
    number: 5,
    title: 'The Bench',
    blurb: 'Bench a hero for free. Retreat swaps it in.',
    face: 'hero_haze',
    learned: [
      'A hero you draw goes on the bench for free.',
      'Only the hero in the lane fights and gets hit.',
      'Retreat swaps it with a bench hero, once a turn, for the price on its sheet.',
    ],
    // Haze at one point of health against a Lash at a full 2: Haze's swing of
    // one cannot finish Lash (Fixation adds nothing against full HP), and
    // Lash's next attack finishes Haze. The deck is one card, Warden, drawn
    // as the turn opens: benched for free, sent in for Haze's soul, Warden's
    // swing of two is the kill. Turn three, so the attack is open.
    setup: () => fight({
      startTurn: 3,
      playerHeroes: ['hero_haze'],
      playerDeck: ['hero_warden'],
      playerHeroStats: [{ hp: 1 }],
      enemyHeroStats: [{ hpMax: 2 }],
    }),
    steps: [
      pickHero('pick', 'hero_warden', 1, 'You drew a hero. A hero goes on the bench for free.'),
      place('place', 'hero_warden', 1, 'bench', 'The lit spots are your bench.'),
      open('open', (v) => `${myName(v)} has ${hp(mine(v))} HP left and cannot finish ${theirName(v)}. ${theirName(v)}'s next hit is the kill.`),
      retreat('retreat', (v) => `Retreat swaps ${myName(v)} with ${nameOf(myBench(v)) || 'your bench hero'} for ${soulsText(retreatCost(v.G, v.me))}. The bench is safe.`),
      open('open-2', (v) => `${myName(v)} is in the lane now. A hero who steps in can still attack.`),
      attack('attack', 1, (v) => `${myName(v)} hits for ${atkOf(mine(v))}. Finish ${theirName(v)}.`),
    ],
  },

  {
    id: 'levelup',
    number: 6,
    title: 'Level Up',
    blurb: 'Exp fills the ring. Level 3 is the ultimate.',
    face: 'hero_warden',
    learned: [
      'Exp: +1 each turn to one of your heroes, +1 for a new item, +1 for a kill.',
      'Each level makes a hero stronger. Level 4 is the top.',
      `Level ${ULT_UNLOCK_LEVEL} unlocks the ultimate. It is free, then it waits.`,
    ],
    // Warden at Level 2, one exp short of Level 3, hurt to 3 HP, against a
    // Lash on 6. Extra Health in hand: a hero's first wear of an item is one
    // exp (EXP_ON_EQUIP), so putting it on is Level 3, and Level 3 is the
    // ultimate. Last Stand deals 6 — the kill — and heals Warden as much; the
    // swing of 4 is not the kill. Turn eleven: Warden's sixth own turn, the
    // first a medium ultimate is off its opening wait.
    setup: () => fight({
      startTurn: 11,
      playerHeroes: ['hero_warden'],
      playerItems: ['extra_health'],
      playerHeroStats: [{ level: 2, exp: 4, hp: 3 }],
      enemyHeroStats: [{ hpMax: 6 }],
    }),
    steps: [
      lit(pick('pick', 'extra_health', 'mine', (v) => `The ring on ${myName(v)} is the level: ${mine(v)?.level ?? 1}. One more exp makes Level ${ULT_UNLOCK_LEVEL}.`), (v) => [tile(mine(v))]),
      putOn('put', 'extra_health', `A hero gets +${EXP_ON_EQUIP} exp the first time it wears an item.`),
      open('open', (v) => `Level ${mine(v)?.level ?? ULT_UNLOCK_LEVEL}! More HP and Bullet Power, and the ultimate is unlocked.`),
      ultimate('ult', (v) => `${ultOf(mine(v))?.name ?? 'The ultimate'}: 6 damage, and ${myName(v)} heals as much. It costs nothing.`),
      aim('aim', 'ult', (v) => `${theirName(v)} is lit: the target.`),
    ],
  },

  {
    id: 'fallen',
    number: 7,
    title: 'A Fallen Hero',
    blurb: 'A killed hero comes back with its level and items.',
    face: 'hero_warden',
    learned: [
      'A killed hero is shuffled into your deck.',
      'It keeps its level, its exp and its items.',
      'Draw it again and it comes back at full HP, for free.',
    ],
    // Warden at Level 2 wearing Extended Magazine, hurt to 1 HP, alone,
    // against a Lash on 8 who swings for 3. Warden's swing of 4 leaves Lash
    // on 4; Lash's turn kills Warden, who is shuffled into a deck that holds
    // nothing else, so the next turn draws the card: Level 2, the item on,
    // full HP. Warden takes the empty lane and the swing of 4 is the kill.
    // Your track is the standard one, so Lash's pushes (the kill's, then the
    // empty lane's) cost the Guardian and no more. Turn three, so the attack
    // is open.
    setup: () => fight({
      startTurn: 3,
      playerHeroes: ['hero_warden'],
      playerHeroStats: [{ level: 2, worn: ['extended_magazine'], hp: 1 }],
      enemyHeroStats: [{ hpMax: 8, atk: 3 }],
      structures: { guardian: 4, walker: 6, patron: 8 },
      enemyStructures: { patron: 1 },
    }),
    steps: [
      open('open', (v) => `${myName(v)} is Level ${mine(v)?.level ?? 1} and wears an item, but has ${hp(mine(v))} HP. No one is on your bench.`),
      attack('attack', 1, (v) => `Hit while ${myName(v)} stands: ${atkOf(mine(v))} damage.`),
      endTurn('end', 1, (v) => `${theirName(v)} will kill ${myName(v)}. Watch where the card goes.`),
      pickHero('pick', 'hero_warden', 1, 'Warden went into your deck, and you drew the card: same level, same item.', 'Warden is killed, and shuffled into your deck.'),
      place('place', 'hero_warden', 1, 'lane', 'Your lane is empty. Send Warden in: it is free.'),
      open('open-2', (v) => `Back at full HP: ${hp(mine(v))}. ${theirName(v)} is at ${hp(theirs(v))}.`),
      attack('attack-2', 2, (v) => `Finish ${theirName(v)}.`),
    ],
  },

  // 8 The Map — its own file (mapLesson.ts), made of the builders above.
  mapLesson(LESSON_KIT),
];

export function lessonById(id: string | undefined | null): Lesson | undefined {
  return id ? LESSONS.find((l) => l.id === id) : undefined;
}

export function nextLesson(id: string): Lesson | undefined {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? LESSONS[i + 1] : undefined;
}
