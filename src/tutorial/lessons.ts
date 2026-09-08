/**
 * The tutorial — five short lessons, one mechanic each, and every lesson its
 * own small match on the scripted path Story uses (`StorySetup`): fixed
 * rosters, fixed decks, no draft, no mulligan.
 *
 * Nothing here is read and dismissed: every step is a tap on the real thing.
 * A concept is taught by doing it — open a hero to see his numbers, tap a
 * card you cannot pay for and feel the soul limit, gear up and watch the
 * health climb, end the turn and watch a hero fall.
 *
 * A lesson can open mid-fight (`startTurn`, `activeWear`), so a heal has a
 * worn hero to land on and "Ultimates" opens with the ultimates already
 * dealt. Each lesson is written against the real soul economy of the turn it
 * opens on:
 *
 *   1  The Table          turn 1  · 1 soul   · look, feel the limit, gear, end, the fall
 *   2  Spells and Skills  turn 3  · 2 souls  · a spell that resolves, a skill that returns
 *   3  The Bench          turn 5  · 3 souls  · retreat, fight with the fresh one
 *   4  Ultimates          turn 11 · 6 souls  · cast Shadow Transformation
 *   5  Take the Street    turn 5  · 3 souls  · their patron's last life
 *
 * Every step names exactly the control that performs it (the gate lets
 * nothing else through), waits out the rival's turn, and — should the player
 * arrive short of souls — points at End Turn instead of asking for a move
 * that cannot be made.
 */
import type { CardId, CardInstance, GameState, PlayerID } from '@/engine/types';
import type { StorySetup } from '@/storage/matchConfig';
import { CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { effectiveAtk } from '@/engine/util';
import { RETREAT_COST, SKILL_COST, MAX_EQUIPMENT_PER_HERO } from '@/engine/game';
import { PATRON_NAMES } from '@/ui/board/patrons';

/* ------------------------------------------------------------------ */
/* The matches                                                         */
/* ------------------------------------------------------------------ */

/** Your side: two sturdy heroes with cheap, unambiguous skills. */
const PLAYER_HEROES: CardId[] = ['hero_kelvin', 'hero_yamato'];
/** Theirs: Lash (1 attack) fronting, with Viscous and Warden — whose skills
 *  only ever touch themselves — on the bench. Lash's Ground Strike is then
 *  the one rival skill that deals damage, and it deals one: a hero of yours
 *  can sit on the bench at two health and still be standing next turn. */
const ENEMY_HEROES: CardId[] = ['hero_lash', 'hero_viscous', 'hero_warden'];

/** Cheap, quiet cards: nothing here decides a fight, and nothing surprises a
 *  script that is naming other cards. */
const FILLER: CardId[] = [
  'extended_magazine', 'restorative_shot', 'rusted_barrel', 'extra_regen',
  'mystic_regeneration', 'healing_booster', 'extended_magazine', 'restorative_shot',
  'rusted_barrel', 'extra_regen', 'mystic_regeneration', 'healing_booster',
];
const ENEMY_DECK: CardId[] = [
  'extra_health', 'extra_health',
  'healing_rite', 'healing_rite',
  'extra_regen', 'extra_regen',
  'restorative_shot', 'restorative_shot',
  'healing_booster', 'mystic_regeneration',
];

/** Patron lives for a lesson. Low so it still ends while the script is
 *  fresh; the player's side is safe behind 6 HP heroes either way. */
const PATRON_HP = 4;
/** Flat HP on every rival hero: buys time rather than lives, so a lesson runs
 *  past its last step without the rivals hitting any harder. */
const ENEMY_BUFF = { atk: 0, hp: 2 };

/** A lesson's match: the shared rosters and pacing, with what differs. Decks
 *  are dealt top-down (`orderedPlayerDeck`) because the scripts name the cards
 *  they ask for. */
function match(over: Partial<StorySetup> = {}): StorySetup {
  return {
    playerHeroes: [...PLAYER_HEROES],
    playerDeck: [...FILLER],
    enemyHeroes: [...ENEMY_HEROES],
    enemyDeck: [...ENEMY_DECK],
    enemyBuff: { ...ENEMY_BUFF },
    patronHp: PATRON_HP,
    orderedPlayerDeck: true,
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* Reading the board                                                   */
/* ------------------------------------------------------------------ */

/** Monotonic latches the coach sets as it watches play — once set, they
 *  stay set, so a step can't un-complete when the turn rolls over. */
export interface CoachSeen {
  playedCard: boolean;
  equipped: boolean;
  usedSkill: boolean;
  castUlt: boolean;
  swapped: boolean;
  /** How many of your turns you have ended. */
  turnsEnded: number;
}

export const emptySeen: CoachSeen = {
  playedCard: false,
  equipped: false,
  usedSkill: false,
  castUlt: false,
  swapped: false,
  turnsEnded: 0,
};

export interface CoachView {
  G: GameState;
  me: PlayerID;
  isMyTurn: boolean;
  seen: CoachSeen;
  /** A card or skill is armed and waiting for its target. */
  targeting: boolean;
  /** The hero detail sheet is open (where Skill and Retreat live). */
  sheetOpen: boolean;
  /** …and whose it is. */
  sheetHero: CardId | null;
  /** Taps on cards the player could not pay for, so far. */
  refusals: number;
  /** The id of the last tap-to-continue step the player answered. */
  acked: string | null;
}

/**
 * A gate spec names something on screen by its accessible name:
 *   `Kelvin —`                 first element whose aria-label starts with this
 *   `*Healing Rite`            every element whose aria-label starts with this
 *   `~Retreat`                 first button whose text contains this
 *   `Amber Hand: >> Souls:`    the second, looked up inside the first
 */
export type GateSpec = string;

const RIVAL: PlayerID = '1';
const alive = (c: CardInstance | null | undefined): c is CardInstance =>
  !!c && (c.respawnTurnsLeft ?? 0) === 0;
const nameOf = (c: CardInstance | null | undefined) =>
  c ? CARDS_BY_ID[c.cardId]?.name ?? c.cardId : '';
/** The hero tile announces itself as "Kelvin — 2 attack, 6 health". */
const tile = (c: CardInstance | null | undefined) => (c ? `${nameOf(c)} —` : '');
const ccd = (c: CardInstance | null) =>
  !!c && c.statuses.some((s) => s.id === 'stun' || s.id === 'silenced');

function activeOf(G: GameState, pid: PlayerID): CardInstance | null {
  const a = G.players[pid].active;
  return alive(a) ? a : null;
}
function benchOf(G: GameState, pid: PlayerID): CardInstance | null {
  return G.players[pid].bench.find(alive) ?? null;
}
function inHand(G: GameState, me: PlayerID, id: CardId): boolean {
  return G.players[me].hand.some((c) => c.cardId === id);
}
function ultsInHand(G: GameState, me: PlayerID): string[] {
  return G.players[me].hand.filter((c) => CARDS_BY_ID[c.cardId]?.type === 'ultimate').map(nameOf);
}
function corpses(G: GameState, pid?: PlayerID): CardInstance[] {
  return (pid ? [pid] : (['0', '1'] as PlayerID[])).flatMap((p) => {
    const ps = G.players[p];
    return [ps.active, ...ps.bench].filter((c): c is CardInstance => !!c && (c.respawnTurnsLeft ?? 0) > 0);
  });
}
/** "Frost Grenade" — the skill's own name, hero prefix stripped, exactly as
 *  the sheet prints it. */
function skillNameOf(c: CardInstance | null): string {
  if (!c) return 'the skill';
  const data = CARDS_BY_ID[c.cardId];
  if (data?.type !== 'hero' || !data.skill) return 'the skill';
  const prompt = getAbility(data.skill)?.prompt ?? '';
  const head = prompt.split(' — ')[0]?.trim() ?? '';
  const name = head.startsWith(`${data.name} `) ? head.slice(data.name.length + 1) : head;
  return name || 'the skill';
}

/** A card's printed soul cost, with a fallback for the odd card without one. */
function cardCost(id: CardId, fallback: number): number {
  const d = CARDS_BY_ID[id];
  const cost = d && 'cost' in d ? (d as { cost?: number }).cost : undefined;
  return cost ?? fallback;
}

/** True once any hero of yours is wearing a piece of equipment. */
export function hasEquipment(G: GameState, me: PlayerID): boolean {
  const ps = G.players[me];
  return [ps.active, ...ps.bench].some((c) => {
    if (!c) return false;
    return (c.attached ?? []).some((a) => CARDS_BY_ID[a.cardId]?.type === 'equipment');
  });
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

type Text = string | ((v: CoachView) => string);

export interface CoachStep {
  id: string;
  /** Stencil heading — two or three words. */
  title: string;
  /** One or two short lines, ending in the tap it asks for. */
  body: Text;
  /** Completes when this reads true. Every step has one. */
  task: (v: CoachView) => boolean;
  /** Can the move be made right now? When not, the plate shows `blocked`
   *  and opens End Turn instead — a short soul pocket must never trap the
   *  player in a step they cannot finish. */
  ready?: (v: CoachView) => boolean;
  blocked?: Text;
  /** Returns a line to hold on while something plays out (the rival's turn),
   *  or null to proceed. Steps wait for your turn by default. */
  wait?: (v: CoachView) => string | null;
  /** What is lit through the scrim. Empty = the whole board is sealed. */
  spot: (v: CoachView) => GateSpec[];
  /** What may be tapped. Defaults to `spot`. */
  allow?: (v: CoachView) => GateSpec[];
  /** The lit things are not controls (a rule, a fallen hero): a tap on any
   *  of them is the answer, and `task` reads `acked`. */
  tap?: boolean;
}

export const RIVAL_TURN = "Rival's turn. Watch — on their way out, both Actives trade blows.";

const YOU = `${PATRON_NAMES.you}:`;
const THEM = `${PATRON_NAMES.rival}:`;

/** End the turn — the n-th time this lesson. */
function endTurn(n: number, body: string): CoachStep {
  return {
    id: `end${n}`,
    title: 'End the Turn',
    body,
    task: (v) => v.seen.turnsEnded >= n,
    wait: () => null,
    spot: () => ['End Turn'],
  };
}

/** Open a hero's sheet — the one place his numbers, skill, level and gear
 *  are all printed. Completes the moment it is open. */
function look(id: string, title: string, who: (v: CoachView) => CardInstance | null, body: Text): CoachStep {
  return {
    id,
    title,
    body,
    task: (v) => v.sheetHero !== null && v.sheetHero === who(v)?.cardId,
    ready: (v) => !!who(v),
    blocked: 'Nothing to look at there any more. End the turn.',
    spot: (v) => [tile(who(v))].filter(Boolean),
  };
}

/** …and close it again, having read what it says. */
function close(id: string, title: string, body: Text): CoachStep {
  return {
    id,
    title,
    body,
    task: (v) => !v.sheetOpen,
    wait: () => null,
    spot: () => ['Hero sheet'],
    allow: () => ['~Close'],
  };
}

/** Use your Active's skill on their Active — the three-tap flow through the
 *  hero sheet, gated tap by tap. */
function useSkill(title: string, lead: (v: CoachView) => string): CoachStep {
  return {
    id: 'skill',
    title,
    body: (v) => {
      const mine = activeOf(v.G, v.me), theirs = activeOf(v.G, RIVAL);
      return `${lead(v)} Tap ${nameOf(mine) || 'your Active'} to open the sheet, tap ${skillNameOf(mine)}, then tap ${nameOf(theirs) || 'their Active'}.`;
    },
    task: (v) => v.seen.usedSkill,
    ready: (v) => {
      const mine = activeOf(v.G, v.me);
      return v.G.players[v.me].souls >= SKILL_COST && !v.G.players[v.me].skillUsedThisTurn
        && !!mine && !ccd(mine) && !!activeOf(v.G, RIVAL);
    },
    blocked: (v) => ccd(activeOf(v.G, v.me))
      ? `${nameOf(activeOf(v.G, v.me))} is locked down and cannot act. End the turn.`
      : `A skill costs ${SKILL_COST} soul and needs a fresh turn. End the turn — souls refill.`,
    spot: (v) =>
      v.targeting ? [tile(activeOf(v.G, RIVAL))]
      : v.sheetOpen ? ['Hero sheet']
      : [tile(activeOf(v.G, v.me))],
    allow: (v) =>
      v.targeting ? [tile(activeOf(v.G, RIVAL))]
      : v.sheetOpen ? [`~${skillNameOf(activeOf(v.G, v.me))}`]
      : [tile(activeOf(v.G, v.me))],
  };
}

/** Play a one-soul card from hand onto your Active: tap it, then tap him. */
function playOnActive(id: string, title: string, cardId: CardId, cardName: string, lead: (v: CoachView) => string, done: (v: CoachView) => boolean): CoachStep {
  return {
    id,
    title,
    body: (v) => `${lead(v)} Tap ${cardName}, then tap ${nameOf(activeOf(v.G, v.me)) || 'your Active'}.`,
    task: done,
    ready: (v) => v.G.players[v.me].souls >= cardCost(cardId, 1) && inHand(v.G, v.me, cardId) && !!activeOf(v.G, v.me),
    blocked: `${cardName} costs a soul and you have none left. End the turn — souls refill.`,
    spot: (v) => (v.targeting ? [tile(activeOf(v.G, v.me))] : [`*${cardName}`]),
  };
}

/* ------------------------------------------------------------------ */
/* The lessons                                                         */
/* ------------------------------------------------------------------ */

export type LessonId = 'table' | 'skills' | 'bench' | 'ults' | 'street';

export interface Lesson {
  id: LessonId;
  /** 1-based; printed as "Lesson 2". */
  number: number;
  title: string;
  /** One line under the title on the list. */
  blurb: string;
  /** The hero whose portrait fronts the lesson on the list. */
  face: CardId;
  /** Printed on the closing card, once the script has run out. */
  outro: string;
  setup: () => StorySetup;
  steps: CoachStep[];
}

const mine = (v: CoachView) => activeOf(v.G, v.me);
const theirs = (v: CoachView) => activeOf(v.G, RIVAL);
const myBench = (v: CoachView) => benchOf(v.G, v.me);
const hpOf = (c: CardInstance | null) => (c ? `${c.hp} of ${c.hpMax}` : '');

export const LESSONS: Lesson[] = [
  {
    id: 'table',
    number: 1,
    title: 'The Table',
    blurb: 'Look, spend, gear up, end the turn — and watch a hero fall.',
    face: 'hero_kelvin',
    outro: 'You can read a hero, pay for a card and end a turn. Everything else is a variation on that.',
    // Rivals at two health and no cards to heal with: the first trade the
    // player ever ends drops Lash, and the patron's life is paid in front
    // of them.
    setup: () => match({
      enemyBuff: { atk: 0, hp: -2 },
      enemyDeck: [],
      playerDeck: [
        'extended_magazine',  // costs 2 — the card you cannot pay for
        'extra_health',       // costs 1 — the card you can
        'healing_rite',
        'restorative_shot',   // drawn turn 1
        ...FILLER,
      ],
    }),
    steps: [
      look('look', 'Your Active', mine, (v) => `Two heroes are yours: ${nameOf(mine(v))} in the middle row fights; ${nameOf(myBench(v))} waits on the bench below, out of reach. Tap ${nameOf(mine(v))} to look him over.`),
      close('numbers', 'His Numbers', (v) => `The sheet is every hero's card: attack, health, level, and his skill. Tap any hero, yours or theirs, to read it. Tap Close.`),
      {
        id: 'broke',
        title: 'Souls',
        body: (v) => `Cards cost souls, and the rail on your rule says you have ${v.G.players[v.me].souls}. Tap Extended Magazine — it costs two.`,
        task: (v) => v.refusals >= 1 || v.G.players[v.me].souls >= 2 || !inHand(v.G, v.me, 'extended_magazine'),
        spot: () => [`${YOU} >> Souls:`, '*Extended Magazine'],
        allow: () => ['*Extended Magazine'],
      },
      playOnActive('gear', 'Play a Card', 'extra_health', 'Extra Health',
        (v) => `Told you. One soul buys a one-soul card, and gear stays on: ${nameOf(mine(v))}'s health climbs to ${(mine(v)?.hpMax ?? 6) + 2}.`,
        (v) => v.seen.equipped),
      endTurn(1, 'Nothing left to spend — souls refill at the start of your next turn, one more each time. Tap End Turn. The rival moves, and on their way out the two Actives trade blows.'),
      {
        id: 'fall',
        title: 'The Trade',
        body: (v) => {
          const c = corpses(v.G, RIVAL)[0];
          const rival = v.G.players[RIVAL];
          const me = mine(v);
          if (c && me) {
            return `${nameOf(c)} swung, ${nameOf(me)} hit back for ${effectiveAtk(me)}, and ${nameOf(c)} fell. Every hero that falls costs its patron a life: theirs is down to ${rival.hp} of ${rival.hpMax}. Drop it to zero and the street is yours. Tap their rule.`;
          }
          return 'Every turn closes with the two Actives trading blows; the number beside the blade is what each one hits for. A patron pays a life for every hero of theirs that falls. Tap their rule.';
        },
        task: (v) => v.acked === 'fall',
        tap: true,
        spot: (v) => [THEM, ...corpses(v.G, RIVAL).map(tile)],
      },
    ],
  },

  {
    id: 'skills',
    number: 2,
    title: 'Spells and Skills',
    blurb: 'Two souls: a spell that resolves once, a skill that comes back.',
    face: 'hero_kelvin',
    outro: 'Spells resolve once and go to the discard. Skills cost a soul and come back every turn. Spend every soul, every turn.',
    setup: () => match({
      startTurn: 3,
      activeWear: 4,
      playerDeck: [
        'healing_rite',       // turn 3, 1 soul — the spell
        'extended_magazine', 'restorative_shot',
        'rusted_barrel',      // drawn turn 3
        ...FILLER,
      ],
    }),
    steps: [
      playOnActive('heal', 'Play a Spell', 'healing_rite', 'Healing Rite',
        (v) => `Turn three, two souls, and ${nameOf(mine(v))} is at ${hpOf(mine(v))}. A spell resolves once and goes to the discard.`,
        (v) => v.seen.playedCard),
      useSkill('Use a Skill', () => `One soul left. A skill costs exactly that, once a turn across your whole side — and it is back next turn.`),
      endTurn(1, 'Spent out. Tap End Turn and watch the trade.'),
      look('levels', 'Levelling', mine, (v) => `${nameOf(mine(v))} earned experience for standing the turn and for the hit. Tap ${nameOf(mine(v))}.`),
      close('ring', 'The Ring', 'The ring around his level fills with experience; a level raises his numbers. Tap Close.'),
    ],
  },

  {
    id: 'bench',
    number: 3,
    title: 'The Bench',
    blurb: 'Pull a worn Active out and send the fresh one in.',
    face: 'hero_yamato',
    outro: 'Rotate. A worn Active on the bench is a hero saved.',
    setup: () => match({ startTurn: 5, activeWear: 3 }),
    steps: [
      {
        id: 'retreat',
        title: 'Retreat',
        body: (v) => `${nameOf(mine(v))} is worn to ${hpOf(mine(v))}. Pull him out before it gets worse: three souls this turn — tap ${nameOf(myBench(v)) || 'your bench hero'} on your bench, then Retreat. ${RETREAT_COST} souls swap the two.`,
        task: (v) => v.seen.swapped,
        ready: (v) => v.G.players[v.me].souls >= RETREAT_COST && !!myBench(v) && !!mine(v),
        blocked: `Retreat costs ${RETREAT_COST} souls. End the turn to refill, then come back to it.`,
        spot: (v) => (v.sheetOpen ? ['Hero sheet'] : [tile(myBench(v))]),
        allow: (v) => (v.sheetOpen ? ['~Retreat'] : [tile(myBench(v))]),
      },
      useSkill('Fresh Legs', (v) => `${nameOf(mine(v))} is in the fight now, and one soul is left for his skill.`),
      endTurn(1, 'Tap End Turn. The fresh Active takes the trade; the worn one sits it out.'),
      look('holds', 'The Bench Holds', myBench, (v) => `Tap ${nameOf(myBench(v))} on the bench.`),
      close('safe', 'Out of the Trade', (v) => `Still standing at ${hpOf(myBench(v))}. Attacks only ever land on the Active; a skill can still chip the bench, but a chip is not a trade. Rotate the worn one out and the fresh one in. Tap Close.`),
    ],
  },

  {
    id: 'ults',
    number: 4,
    title: 'Ultimates',
    blurb: 'The big card every hero deals you on turn five.',
    face: 'hero_yamato',
    outro: 'One ultimate per hero, per match. Time it.',
    // Yamato fronts this one, worn down to a point of health: Shadow
    // Transformation heals him to full and puts three attack on his blade,
    // and the payoff is his own swing. Six souls — the turn-eleven refill.
    setup: () => match({ startTurn: 11, activeWear: 5, playerHeroes: ['hero_yamato', 'hero_kelvin'] }),
    steps: [
      {
        id: 'cast',
        title: 'Cast It',
        body: (v) => {
          const ults = ultsInHand(v.G, v.me);
          return `${nameOf(mine(v))} is at ${hpOf(mine(v))}, and it is turn eleven: six souls. Every hero deals you its ultimate on turn five${ults.length ? ` — ${ults.join(' and ')} are in your hand` : ''}. Tap Shadow Transformation.`;
        },
        task: (v) => v.seen.castUlt,
        ready: (v) => v.G.players[v.me].souls >= cardCost('ult_yamato', 6)
          && inHand(v.G, v.me, 'ult_yamato')
          && [v.G.players[v.me].active, ...v.G.players[v.me].bench].some((c) => alive(c) && c.cardId === 'hero_yamato'),
        blocked: 'Shadow Transformation costs six souls. End the turn — souls refill.',
        spot: () => ['*Shadow Transformation'],
      },
      endTurn(1, 'All six souls, one card: healed to full, and three more attack for two turns. Tap End Turn and watch the swing.'),
      look('payoff', 'The Payoff', mine, (v) => {
        const c = corpses(v.G, RIVAL)[0];
        const me = mine(v);
        return `${nameOf(me)} swings for ${me ? effectiveAtk(me) : 5} while it lasts${c ? ` — and ${nameOf(c)} is down for it, its patron a life poorer` : ''}. Tap ${nameOf(me)}.`;
      }),
      close('effects', 'Active Effects', 'Bullet Power +3 sits under Active Effects with its turns left; the card itself is gone to the discard. One ultimate per hero, per match. Tap Close.'),
    ],
  },

  {
    id: 'street',
    number: 5,
    title: 'Take the Street',
    blurb: "Their patron's last life. Finish it.",
    face: 'hero_lash',
    outro: "Their patron's last life is yours to take. Keep swinging.",
    // Rivals at 3 health and a patron with one life: the skill wears the
    // Active down to 2, the end-of-turn swing takes it, and the fall is the
    // match. An empty rival deck keeps them from healing it back.
    setup: () => match({
      startTurn: 5,
      enemyBuff: { atk: 0, hp: -1 },
      enemyPatronHp: 1,
      enemyDeck: [],
      playerDeck: ['healing_rite', 'healing_rite', ...FILLER],
    }),
    steps: [
      look('size', 'Last Life', theirs, (v) => `Their patron is down to its last life: one more fallen hero and the street is yours. Tap ${nameOf(theirs(v))} to size him up.`),
      close('plan', 'The Plan', (v) => {
        const me = mine(v);
        return `${hpOf(theirs(v)) || 'Three'} health. ${skillNameOf(me)} takes one; ${nameOf(me)}'s swing takes ${me ? effectiveAtk(me) : 2}. Tap Close.`;
      }),
      useSkill('Wear Him Down', (v) => `${nameOf(theirs(v))} is at ${hpOf(theirs(v))}.`),
      endTurn(1, 'Tap End Turn. The swing finishes it — watch their rule.'),
    ],
  },
];

export function lessonById(id: string | undefined | null): Lesson | undefined {
  return id ? LESSONS.find((l) => l.id === id) : undefined;
}

export function nextLesson(id: string): Lesson | undefined {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? LESSONS[i + 1] : undefined;
}
