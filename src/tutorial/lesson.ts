/**
 * The tutorial lesson — one fixed match plus the coached script that runs on
 * top of it.
 *
 * The match reuses the scripted-setup path Story already uses (`StorySetup`),
 * so no engine branch is needed: fixed rosters, fixed decks, no draft, no
 * mulligan. It is deliberately lopsided — two 2/6 heroes against three 1-attack
 * ones — so the lesson is very hard to lose and long enough for the whole
 * script to land.
 *
 * The script is written against the real soul economy, turn by turn:
 *
 *   turn 1 · 1 soul  → play Healing Rite
 *   turn 3 · 2 souls → one skill, one piece of gear
 *   turn 5 · 3 souls → a retreat (2), with the ultimates just dealt
 *
 * Every task step names exactly the control that performs it (the gate lets
 * nothing else through), waits out the rival's turn, and — should the player
 * ever arrive short of souls — points at End Turn instead of asking for a
 * move that cannot be made. Stated steps light up the thing they describe.
 */
import type { CardId, CardInstance, GameState, PlayerID } from '@/engine/types';
import type { StorySetup } from '@/storage/matchConfig';
import { CARDS_BY_ID } from '@/cards';
import { getAbility } from '@/abilities';
import { effectiveAtk } from '@/engine/util';
import { RETREAT_COST, SKILL_COST, MAX_EQUIPMENT_PER_HERO } from '@/engine/game';
import { PATRON_NAMES } from '@/ui/board/patrons';

/** Your side: two sturdy heroes with cheap, unambiguous skills. */
const PLAYER_HEROES: CardId[] = ['hero_kelvin', 'hero_yamato'];
/** Theirs: three of the lowest-attack heroes in the set (1 atk each), so the
 *  lesson is safe to lose track of. */
const ENEMY_HEROES: CardId[] = ['hero_lash', 'hero_sinclair', 'hero_lady_geist'];

/** Dealt TOP-DOWN, not shuffled (StorySetup.orderedPlayerDeck), because the
 *  script names the card it asks you to play. The first three are the opening
 *  hand: a 1-cost spell for the "play a card" step, a 1-cost item for the
 *  "gear a hero" step, and one more so the hand does not look staged. */
const PLAYER_DECK: CardId[] = [
  'healing_rite',        // turn 1, 1 soul — "Play a Card"
  'extra_health',        // turn 3, 1 soul — "Gear a Hero"
  'extended_magazine',
  'restorative_shot',    // drawn turn 1
  'rusted_barrel',       // drawn turn 3
  'extra_regen',         // drawn turn 5
  'mystic_regeneration',
  'healing_booster',
  'extra_health', 'healing_rite', 'restorative_shot', 'extended_magazine',
  'rusted_barrel', 'extra_regen', 'mystic_regeneration', 'healing_booster',
];
const ENEMY_DECK: CardId[] = [
  'extra_health', 'extra_health',
  'healing_rite', 'healing_rite',
  'extra_regen', 'extra_regen',
  'restorative_shot', 'restorative_shot',
  'healing_booster', 'mystic_regeneration',
];

/** Patron lives for the lesson. Low so it still ends while the script is
 *  fresh; the player's side is safe behind 6 HP heroes either way. */
const TUTORIAL_PATRON_HP = 4;
/** Flat HP on every rival hero. Buying time rather than lives: it stretches
 *  the match past the last step without making the rivals hit any harder. */
const ENEMY_BUFF = { atk: 0, hp: 2 };

export function tutorialSetup(): StorySetup {
  return {
    playerHeroes: [...PLAYER_HEROES],
    playerDeck: [...PLAYER_DECK],
    enemyHeroes: [...ENEMY_HEROES],
    enemyDeck: [...ENEMY_DECK],
    enemyBuff: { ...ENEMY_BUFF },
    patronHp: TUTORIAL_PATRON_HP,
    orderedPlayerDeck: true,
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
  swapped: boolean;
  /** How many of your turns you have ended. Two steps ask for one each. */
  turnsEnded: number;
}

export const emptySeen: CoachSeen = {
  playedCard: false,
  equipped: false,
  usedSkill: false,
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

/** True once any hero of yours is wearing a piece of equipment. */
export function hasEquipment(G: GameState, me: PlayerID): boolean {
  const ps = G.players[me];
  return [ps.active, ...ps.bench].some((c) => {
    if (!c) return false;
    return (c.attached ?? []).some((a) => CARDS_BY_ID[a.cardId]?.type === 'equipment');
  });
}

/* ------------------------------------------------------------------ */
/* The script                                                          */
/* ------------------------------------------------------------------ */

/** Which part of the game a step belongs to — printed in the plate's rail so
 *  the steps read as four short chapters rather than one long list. */
export type CoachPhase = 'Table' | 'Your Turn' | 'The Fight' | 'Close';

type Text = string | ((v: CoachView) => string);

export interface CoachStep {
  id: string;
  phase: CoachPhase;
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

export const LESSON: CoachStep[] = [
  // ---- Table: what you are looking at. Nothing is legal yet; each step
  //      lights the thing it names and the plate's Next is the only way on. ----
  {
    id: 'deal',
    phase: 'Table',
    title: 'The Deal',
    body: 'Two patrons back this fight — theirs on the top rule, yours on the bottom. Every hero that falls costs its patron a life. Drop theirs to zero and the street is yours.',
    spot: () => [THEM, YOU],
  },
  {
    id: 'rows',
    phase: 'Table',
    title: 'The Rows',
    body: 'Only the two Actives in the middle row fight. Benches wait out of reach — theirs above, yours below.',
    spot: (v) => [tile(activeOf(v.G, RIVAL)), tile(activeOf(v.G, v.me))].filter(Boolean),
  },
  {
    id: 'souls',
    phase: 'Table',
    title: 'Souls',
    body: 'Souls pay for everything, and they sit on your rule. They refill at the start of each of your turns — one, then two, then three. Unspent souls do not carry over.',
    spot: () => [`${YOU} >> Souls:`],
  },
  {
    id: 'draw',
    phase: 'Table',
    title: 'The Draw',
    body: 'You draw one card a turn off the top of your deck. Your hand is what you can play; the deck count is what is left.',
    spot: (v) => [`${YOU} >> Deck:`, ...handNames(v.G, v.me).map((n) => `*${n}`)],
  },

  // ---- Your Turn: four moves, each gated to exactly the control that
  //      performs it, phase by phase through the two-tap flows. ----
  {
    id: 'play',
    phase: 'Your Turn',
    title: 'Play a Card',
    body: (v) => `Tap Healing Rite, then tap ${nameOf(activeOf(v.G, v.me)) || 'your Active'}. The spell heals him for two, spends your one soul and goes to the discard.`,
    task: (v) => v.seen.playedCard,
    ready: (v) => v.G.players[v.me].souls >= 1 && inHand(v.G, v.me, 'healing_rite') && !!activeOf(v.G, v.me),
    blocked: 'Healing Rite costs a soul and you have none left. End the turn — souls refill.',
    spot: (v) => (v.targeting ? [tile(activeOf(v.G, v.me))] : ['*Healing Rite']),
  },
  {
    id: 'end',
    phase: 'Your Turn',
    title: 'End the Turn',
    body: 'Nothing left to spend, so end the turn. The rival moves, and on their way out both Actives trade blows.',
    task: (v) => v.seen.turnsEnded >= 1,
    wait: () => null,
    spot: () => ['End Turn'],
  },
  {
    id: 'trade',
    phase: 'Your Turn',
    title: 'The Trade',
    body: (v) => {
      const mine = activeOf(v.G, v.me), theirs = activeOf(v.G, RIVAL);
      if (!mine || !theirs) return 'Every turn closes with the two Actives trading blows. The number beside the blade is what each one hits for.';
      return `${nameOf(theirs)} swung for ${effectiveAtk(theirs)} and ${nameOf(mine)} hit back for ${effectiveAtk(mine)}. Every turn closes with that trade — the number beside the blade is what each one hits for. Two souls this turn.`;
    },
    wait: (v) => (v.isMyTurn ? null : RIVAL_TURN),
    spot: (v) => [tile(activeOf(v.G, RIVAL)), tile(activeOf(v.G, v.me))].filter(Boolean),
  },
  {
    id: 'skill',
    phase: 'Your Turn',
    title: 'Use a Skill',
    body: (v) => {
      const mine = activeOf(v.G, v.me), theirs = activeOf(v.G, RIVAL);
      return `Tap ${nameOf(mine) || 'your Active'} to open him, tap ${skillNameOf(mine)}, then tap ${nameOf(theirs) || 'their Active'}. One skill a turn across your whole side, for ${SKILL_COST} soul.`;
    },
    task: (v) => v.seen.usedSkill,
    ready: (v) => v.G.players[v.me].souls >= SKILL_COST && !v.G.players[v.me].skillUsedThisTurn
      && !!activeOf(v.G, v.me) && !!activeOf(v.G, RIVAL),
    blocked: `A skill costs ${SKILL_COST} soul and needs a fresh turn. End the turn — souls refill.`,
    spot: (v) =>
      v.targeting ? [tile(activeOf(v.G, RIVAL))]
      : v.sheetOpen ? ['Hero sheet']
      : [tile(activeOf(v.G, v.me))],
    allow: (v) =>
      v.targeting ? [tile(activeOf(v.G, RIVAL))]
      : v.sheetOpen ? [`~${skillNameOf(activeOf(v.G, v.me))}`]
      : [tile(activeOf(v.G, v.me))],
  },
  {
    id: 'equip',
    phase: 'Your Turn',
    title: 'Gear a Hero',
    body: (v) => `Tap Extra Health, then ${nameOf(activeOf(v.G, v.me)) || 'your Active'}. Gear stays on a hero — up to ${MAX_EQUIPMENT_PER_HERO} pieces — and folds into their numbers.`,
    task: (v) => v.seen.equipped,
    ready: (v) => v.G.players[v.me].souls >= 1 && inHand(v.G, v.me, 'extra_health') && !!activeOf(v.G, v.me),
    blocked: 'Extra Health costs a soul and you have none left. End the turn — souls refill.',
    spot: (v) => (v.targeting ? [tile(activeOf(v.G, v.me))] : ['*Extra Health']),
  },
  {
    id: 'end2',
    phase: 'Your Turn',
    title: 'End the Turn',
    body: 'Spent out again. End the turn — three souls next time, enough for a bigger move.',
    task: (v) => v.seen.turnsEnded >= 2,
    wait: () => null,
    spot: () => ['End Turn'],
  },

  // ---- The Fight ----
  {
    id: 'retreat',
    phase: 'The Fight',
    title: 'Retreat',
    body: (v) => `Tap ${nameOf(benchOf(v.G, v.me)) || 'your bench hero'} on your bench, then Retreat. ${RETREAT_COST} souls swap the two: a fresh hero steps in and a worn one steps out before it falls.`,
    task: (v) => v.seen.swapped,
    ready: (v) => v.G.players[v.me].souls >= RETREAT_COST && !!benchOf(v.G, v.me) && !!activeOf(v.G, v.me),
    blocked: `Retreat costs ${RETREAT_COST} souls. End the turn to refill, then come back to it.`,
    spot: (v) => (v.sheetOpen ? ['Hero sheet'] : [tile(benchOf(v.G, v.me))]),
    allow: (v) => (v.sheetOpen ? ['~Retreat'] : [tile(benchOf(v.G, v.me))]),
  },
  {
    id: 'down',
    phase: 'The Fight',
    title: 'Down, Not Out',
    body: (v) => {
      const c = corpses(v.G)[0];
      return c
        ? `${nameOf(c)} is down. A fallen hero stays greyed in its slot on a respawn timer, then stands back up at full health — but its patron has already paid the life.`
        : 'A fallen hero stays greyed in its slot on a respawn timer, then stands back up at full health — but its patron has already paid the life.';
    },
    spot: (v) => corpses(v.G).map(tile),
  },
  {
    id: 'levels',
    phase: 'The Fight',
    title: 'Levelling',
    body: 'Heroes earn experience every turn they stand, and more for damage and kills. The ring in each card’s corner fills, and a level raises their numbers.',
    spot: (v) => [tile(activeOf(v.G, v.me)), tile(benchOf(v.G, v.me))].filter(Boolean),
  },
  {
    id: 'ults',
    phase: 'The Fight',
    title: 'Ultimates',
    body: (v) => {
      const ults = ultsInHand(v.G, v.me);
      return ults.length
        ? `Turn five dealt you ${ults.join(' and ')} — your heroes’ ultimates. They cost the most and they end fights. Save up.`
        : 'From turn five, every hero on your board deals you its ultimate. They cost the most and they end fights.';
    },
    spot: (v) => ultsInHand(v.G, v.me).map((n) => `*${n}`),
  },

  // ---- Close. The last step opens the board back up for good. ----
  {
    id: 'log',
    phase: 'Close',
    title: 'The Log',
    body: 'Lost the thread? The panel lists every hit, heal and effect in order.',
    spot: () => ['Match log', 'Show panel'],
  },
  {
    id: 'close',
    phase: 'Close',
    title: "That's the Game",
    body: 'The rest of the match is yours. Take the street.',
  },
];
