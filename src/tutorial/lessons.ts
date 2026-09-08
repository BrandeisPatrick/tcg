/**
 * The tutorial — five short lessons, one mechanic each, and every lesson its
 * own small match on the scripted path Story uses (`StorySetup`): fixed
 * rosters, fixed decks, no draft, no mulligan.
 *
 * A lesson can open mid-fight (`startTurn`), so "Skills and Gear" begins with
 * two souls already in hand and "Ultimates" with the ultimates already dealt —
 * nobody replays the opening five times. Each lesson is written against the
 * real soul economy of the turn it opens on:
 *
 *   1  The Table         turn 1  · 1 soul   · play a card, end the turn
 *   2  Skills and Gear   turn 3  · 2 souls  · one skill, one piece of gear
 *   3  The Bench         turn 5  · 3 souls  · retreat, fight with the fresh one
 *   4  Ultimates         turn 11 · 6 souls  · cast Shadow Transformation
 *   5  Take the Street   turn 5  · 3 souls  · their patron's last life
 *
 * Every task step names exactly the control that performs it (the gate lets
 * nothing else through), waits out the rival's turn, and — should the player
 * arrive short of souls — points at End Turn instead of asking for a move
 * that cannot be made. Stated steps light up the thing they describe.
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
/** Theirs: two of the lowest-attack heroes in the set (1 atk each) fronting,
 *  and Viscous — whose skill only ever touches himself — on the bench, so no
 *  rival turn lands more than a couple of points on the player's Active. */
const ENEMY_HEROES: CardId[] = ['hero_lash', 'hero_sinclair', 'hero_viscous'];

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
function handNames(G: GameState, me: PlayerID): string[] {
  return [...new Set(G.players[me].hand.map(nameOf))];
}
function ultsInHand(G: GameState, me: PlayerID): string[] {
  return G.players[me].hand.filter((c) => CARDS_BY_ID[c.cardId]?.type === 'ultimate').map(nameOf);
}
function corpses(G: GameState): CardInstance[] {
  return (['0', '1'] as PlayerID[]).flatMap((pid) => {
    const ps = G.players[pid];
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
  /** One or two short lines. The board shows the rest. */
  body: Text;
  /** Present = the step is a task, and completes when this reads true.
   *  Absent = the step just states something and advances on Next. */
  task?: (v: CoachView) => boolean;
  /** Task steps: can the move be made right now? When not, the plate shows
   *  `blocked` and opens End Turn instead — a short soul pocket must never
   *  trap the player in a step they cannot finish. */
  ready?: (v: CoachView) => boolean;
  blocked?: Text;
  /** Returns a line to hold on while something plays out (the rival's turn),
   *  or null to proceed. Task steps wait for your turn by default. */
  wait?: (v: CoachView) => string | null;
  /** What is lit through the scrim. Empty = the whole board is sealed.
   *  Absent = no gate at all; the board is the player's. */
  spot?: (v: CoachView) => GateSpec[];
  /** What may be tapped. Task steps only; defaults to `spot`. */
  allow?: (v: CoachView) => GateSpec[];
}

export const RIVAL_TURN = "Rival's turn. Watch — on their way out, both Actives trade blows.";

const YOU = `${PATRON_NAMES.you}:`;
const THEM = `${PATRON_NAMES.rival}:`;
const afterRival = (v: CoachView) => (v.isMyTurn ? null : RIVAL_TURN);
const bothActives = (v: CoachView) =>
  [tile(activeOf(v.G, RIVAL)), tile(activeOf(v.G, v.me))].filter(Boolean);

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

export const LESSONS: Lesson[] = [
  {
    id: 'table',
    number: 1,
    title: 'The Table',
    blurb: 'Patrons, rows, souls — and your first card.',
    face: 'hero_kelvin',
    outro: 'You can play a card and end a turn. Everything else is a variation on that.',
    setup: () => match({
      playerDeck: [
        'healing_rite',      // turn 1, 1 soul — "Play a Card"
        'extra_health', 'extended_magazine',
        'restorative_shot',  // drawn turn 1
        ...FILLER,
      ],
    }),
    steps: [
      {
        id: 'deal',
        title: 'The Deal',
        body: 'Two patrons back this fight — theirs on the top rule, yours on the bottom. Every hero that falls costs its patron a life. Drop theirs to zero and the street is yours.',
        spot: () => [THEM, YOU],
      },
      {
        id: 'rows',
        title: 'The Rows',
        body: 'Only the two Actives in the middle row fight. Benches wait out of reach — theirs above, yours below.',
        spot: bothActives,
      },
      {
        id: 'souls',
        title: 'Souls',
        body: 'Souls pay for everything, and they sit on your rule. They refill at the start of each of your turns — one, then two, then three. Unspent souls do not carry over.',
        spot: () => [`${YOU} >> Souls:`],
      },
      {
        id: 'draw',
        title: 'The Draw',
        body: 'You draw one card a turn off the top of your deck. Your hand is what you can play; the deck count is what is left.',
        spot: (v) => [`${YOU} >> Deck:`, ...handNames(v.G, v.me).map((n) => `*${n}`)],
      },
      {
        id: 'play',
        title: 'Play a Card',
        body: (v) => `Tap Healing Rite, then tap ${nameOf(activeOf(v.G, v.me)) || 'your Active'}. The spell heals for two, spends your one soul and goes to the discard.`,
        task: (v) => v.seen.playedCard,
        ready: (v) => v.G.players[v.me].souls >= 1 && inHand(v.G, v.me, 'healing_rite') && !!activeOf(v.G, v.me),
        blocked: 'Healing Rite costs a soul and you have none left. End the turn — souls refill.',
        spot: (v) => (v.targeting ? [tile(activeOf(v.G, v.me))] : ['*Healing Rite']),
      },
      endTurn(1, 'Nothing left to spend, so end the turn. The rival moves, and on their way out both Actives trade blows.'),
      {
        id: 'trade',
        title: 'The Trade',
        body: (v) => {
          const mine = activeOf(v.G, v.me), theirs = activeOf(v.G, RIVAL);
          if (!mine || !theirs || v.seen.turnsEnded < 1) {
            return 'Every turn closes with the two Actives trading blows. The number beside the blade is what each one hits for.';
          }
          return `${nameOf(theirs)} swung for ${effectiveAtk(theirs)} and ${nameOf(mine)} hit back for ${effectiveAtk(mine)}. Every turn closes with that trade — the number beside the blade is what each one hits for.`;
        },
        wait: afterRival,
        spot: bothActives,
      },
    ],
  },

  {
    id: 'skills',
    number: 2,
    title: 'Skills and Gear',
    blurb: 'Two souls: one for a skill, one for a piece of gear.',
    face: 'hero_kelvin',
    outro: 'Skills cost a soul and gear stays on. Spend every soul, every turn.',
    setup: () => match({
      startTurn: 3,
      playerDeck: [
        'extra_health',      // turn 3, 1 soul — "Gear a Hero"
        'extended_magazine', 'restorative_shot',
        'rusted_barrel',     // drawn turn 3
        ...FILLER,
      ],
    }),
    steps: [
      {
        id: 'two',
        title: 'Two Souls',
        body: 'Turn three, and the rail refilled to two. One buys a skill, one buys a piece of gear — and both are gone at the end of the turn either way.',
        spot: () => [`${YOU} >> Souls:`],
      },
      useSkill('Use a Skill', () => `One skill a turn across your whole side, for ${SKILL_COST} soul.`),
      {
        id: 'equip',
        title: 'Gear a Hero',
        body: (v) => `Tap Extra Health, then ${nameOf(activeOf(v.G, v.me)) || 'your Active'}. Gear stays on a hero — up to ${MAX_EQUIPMENT_PER_HERO} pieces — and folds into their numbers.`,
        task: (v) => v.seen.equipped,
        ready: (v) => v.G.players[v.me].souls >= 1 && inHand(v.G, v.me, 'extra_health') && !!activeOf(v.G, v.me),
        blocked: 'Extra Health costs a soul and you have none left. End the turn — souls refill.',
        spot: (v) => (v.targeting ? [tile(activeOf(v.G, v.me))] : ['*Extra Health']),
      },
      endTurn(1, 'Spent out. End the turn and watch the trade — the gear counts in it.'),
      {
        id: 'levels',
        title: 'Levelling',
        body: (v) => `${nameOf(activeOf(v.G, v.me)) || 'Your Active'} earned experience for standing the turn and for landing the hit. The ring in the card's corner fills; a level raises the numbers.`,
        wait: afterRival,
        spot: (v) => [tile(activeOf(v.G, v.me))].filter(Boolean),
      },
    ],
  },

  {
    id: 'bench',
    number: 3,
    title: 'The Bench',
    blurb: 'Pull a worn Active out and send the fresh one in.',
    face: 'hero_yamato',
    outro: 'Rotate. A worn Active on the bench is a hero saved.',
    setup: () => match({ startTurn: 5 }),
    steps: [
      {
        id: 'retreat',
        title: 'Retreat',
        body: (v) => `Three souls this turn. Tap ${nameOf(benchOf(v.G, v.me)) || 'your bench hero'} on your bench, then Retreat: ${RETREAT_COST} souls swap the two, and the worn one steps out before it falls.`,
        task: (v) => v.seen.swapped,
        ready: (v) => v.G.players[v.me].souls >= RETREAT_COST && !!benchOf(v.G, v.me) && !!activeOf(v.G, v.me),
        blocked: `Retreat costs ${RETREAT_COST} souls. End the turn to refill, then come back to it.`,
        spot: (v) => (v.sheetOpen ? ['Hero sheet'] : [tile(benchOf(v.G, v.me))]),
        allow: (v) => (v.sheetOpen ? ['~Retreat'] : [tile(benchOf(v.G, v.me))]),
      },
      useSkill('Fresh Legs', (v) => `${nameOf(activeOf(v.G, v.me)) || 'The fresh hero'} is in the fight now, and one soul is left for a skill.`),
      endTurn(1, 'End the turn. The fresh Active takes the trade; the worn one sits it out.'),
      {
        id: 'holds',
        title: 'The Bench Holds',
        body: (v) => {
          const rested = benchOf(v.G, v.me), front = activeOf(v.G, v.me);
          return rested && front
            ? `${nameOf(rested)} sat that round out at ${rested.hp} health while ${nameOf(front)} took the hits. Rotate the worn one out and the fresh one in — that is how a lopsided fight stays even.`
            : 'Rotate the worn one out and the fresh one in — that is how a lopsided fight stays even.';
        },
        wait: afterRival,
        spot: (v) => [tile(activeOf(v.G, v.me)), tile(benchOf(v.G, v.me))].filter(Boolean),
      },
    ],
  },

  {
    id: 'ults',
    number: 4,
    title: 'Ultimates',
    blurb: 'The big card every hero deals you on turn five.',
    face: 'hero_yamato',
    outro: 'One ultimate per hero, per match. Time it.',
    // Yamato fronts this one: Shadow Transformation is cast on himself and the
    // payoff is his own swing. Six souls — the turn-eleven refill — pay for it.
    setup: () => match({ startTurn: 11, playerHeroes: ['hero_yamato', 'hero_kelvin'] }),
    steps: [
      {
        id: 'intro',
        title: 'Ultimates',
        body: (v) => {
          const ults = ultsInHand(v.G, v.me);
          return ults.length
            ? `Turn eleven, six souls. Every hero on your board dealt you its ultimate on turn five — ${ults.join(' and ')} are in your hand. They cost the most, and they end fights.`
            : 'From turn five, every hero on your board deals you its ultimate. They cost the most, and they end fights.';
        },
        spot: (v) => ultsInHand(v.G, v.me).map((n) => `*${n}`),
      },
      {
        id: 'cast',
        title: 'Cast It',
        body: (v) => `Tap Shadow Transformation. It costs all six souls: ${nameOf(activeOf(v.G, v.me)) || 'Yamato'} gains three attack for two turns, cannot be stopped, and heals five.`,
        task: (v) => v.seen.castUlt,
        ready: (v) => v.G.players[v.me].souls >= cardCost('ult_yamato', 6)
          && inHand(v.G, v.me, 'ult_yamato')
          && [v.G.players[v.me].active, ...v.G.players[v.me].bench].some((c) => alive(c) && c.cardId === 'hero_yamato'),
        blocked: 'Shadow Transformation costs six souls. End the turn — souls refill.',
        spot: () => ['*Shadow Transformation'],
      },
      endTurn(1, 'End the turn. Watch the number beside the blade, and what it does to the trade.'),
      {
        id: 'payoff',
        title: 'The Payoff',
        body: (v) => {
          const mine = activeOf(v.G, v.me), theirs = activeOf(v.G, RIVAL);
          const c = corpses(v.G)[0];
          const swing = mine ? `${nameOf(mine)} swings for ${effectiveAtk(mine)} while it lasts` : 'The buff lasts two turns';
          return c
            ? `${swing} — and ${nameOf(c)} is down for it. A fallen hero greys out on a respawn timer, and its patron has already paid the life. One ultimate per hero, per match.`
            : `${swing}${theirs ? `, and ${nameOf(theirs)} is at ${theirs.hp}` : ''}. The card is gone to the discard: one ultimate per hero, per match.`;
        },
        wait: afterRival,
        spot: (v) => [tile(activeOf(v.G, v.me)), tile(activeOf(v.G, RIVAL)), ...corpses(v.G).map(tile)].filter(Boolean),
      },
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
      {
        id: 'last',
        title: 'Last Life',
        body: (v) => `Their patron is down to its last life. Drop ${nameOf(activeOf(v.G, RIVAL)) || 'their Active'} and the street is yours.`,
        spot: () => [THEM],
      },
      useSkill('Wear Them Down', (v) => {
        const theirs = activeOf(v.G, RIVAL);
        return theirs ? `${nameOf(theirs)} is at ${theirs.hp}; the skill takes one.` : 'Soften their Active first.';
      }),
      endTurn(1, 'End the turn. The swing is what finishes it — watch their rule.'),
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
