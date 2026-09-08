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
 * The script never blocks input. Each step either states something (advance on
 * Next) or names a task and watches the game state until the player does it.
 * That keeps the coach honest: it can't get stuck on a move the player already
 * made, and a player who ignores it entirely still just plays a match.
 */
import type { CardId, GameState, PlayerID } from '@/engine/types';
import type { StorySetup } from '@/storage/matchConfig';
import { CARDS_BY_ID } from '@/cards';
import { RETREAT_COST, SKILL_COST, MAX_EQUIPMENT_PER_HERO } from '@/engine/game';

/** Your side: two sturdy heroes with cheap, unambiguous skills. */
const PLAYER_HEROES: CardId[] = ['hero_kelvin', 'hero_yamato'];
/** Theirs: three of the lowest-attack heroes in the set (1 atk each), so the
 *  lesson is safe to lose track of. */
const ENEMY_HEROES: CardId[] = ['hero_lash', 'hero_sinclair', 'hero_lady_geist'];

/** Dealt TOP-DOWN, not shuffled (StorySetup.orderedPlayerDeck), because the
 *  script names the card it asks you to play. The first three are the opening
 *  hand: a 1-cost spell for the "play a card" step, a 1-cost item for the
 *  "gear a hero" step, and one more so the hand does not look staged. The
 *  sequence also respects the souls ramp — 1 soul on turn one buys exactly the
 *  spell, 2 on turn two buys the skill and the item. */
const PLAYER_DECK: CardId[] = [
  'healing_rite',        // turn 1, 1 soul — "Play a Card"
  'extra_health',        // turn 2, 1 soul — "Gear a Hero"
  'extended_magazine',
  'restorative_shot',
  'rusted_barrel',
  'extra_regen',
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
/* The script                                                          */
/* ------------------------------------------------------------------ */

/** Monotonic latches the coach sets as it watches play — once true, they
 *  stay true, so a step can't un-complete when the turn rolls over. */
export interface CoachSeen {
  playedCard: boolean;
  equipped: boolean;
  usedSkill: boolean;
  endedTurn: boolean;
  swapped: boolean;
}

export const emptySeen: CoachSeen = {
  playedCard: false,
  equipped: false,
  usedSkill: false,
  endedTurn: false,
  swapped: false,
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

/** Accessible name of a hero currently on the board, for a gate spec. */
function heroName(G: GameState, pid: PlayerID, where: 'active' | 'bench'): string {
  const ps = G.players[pid];
  const card = where === 'active' ? ps.active : ps.bench.find(Boolean);
  return card ? `${CARDS_BY_ID[card.cardId]?.name ?? ''} —` : '';
}

/** Which part of the game a step belongs to — printed in the plate's rail so
 *  fifteen steps read as four short chapters rather than one long list. */
export type CoachPhase = 'Table' | 'Your Turn' | 'The Fight' | 'Close';

export interface CoachStep {
  id: string;
  phase: CoachPhase;
  /** Stencil heading — two or three words. */
  title: string;
  /** One or two short lines. The board shows the rest. */
  body: string;
  /** Present = the step is a task, and completes when this reads true.
   *  Absent = the step just states something and advances on Next. */
  task?: (v: CoachView) => boolean;
  /** The only thing the player may touch right now. Returns accessible-name
   *  prefixes ('~' prefix matches button text instead). An empty array seals
   *  the board — correct for a step that is only telling you something. */
  gate?: (v: CoachView) => string[];
}

/** True once any hero of yours is wearing a piece of equipment. */
export function hasEquipment(G: GameState, me: PlayerID): boolean {
  const ps = G.players[me];
  return [ps.active, ...ps.bench].some((c) => {
    if (!c) return false;
    return (c.attached ?? []).some((a) => CARDS_BY_ID[a.cardId]?.type === 'equipment');
  });
}

export const LESSON: CoachStep[] = [
  // ---- Table: what you are looking at. Nothing is legal yet, so the gate
  //      seals the board and the plate's Next is the only way on. ----
  {
    id: 'deal',
    phase: 'Table',
    title: 'The Deal',
    body: 'Two patrons back this fight. Win by dropping theirs to zero, or by leaving their whole bench down at once.',
    gate: () => [],
  },
  {
    id: 'rows',
    phase: 'Table',
    title: 'The Rows',
    body: 'Only the Active in the middle row fights. Your bench waits below it, out of reach.',
    gate: () => [],
  },
  {
    id: 'lives',
    phase: 'Table',
    title: 'Patron Lives',
    body: 'Every hero that falls costs its patron one life. Both counts sit on the rules above and below the sheet.',
    gate: () => [],
  },
  {
    id: 'souls',
    phase: 'Your Turn',
    title: 'Souls',
    body: 'The rail refills at the start of your turn — one, then two, then more. Unspent souls do not carry over.',
    gate: () => [],
  },
  {
    id: 'draw',
    phase: 'Your Turn',
    title: 'The Draw',
    body: 'One card a turn, off the top of your deck. What is left of it is counted on your rule.',
    gate: () => [],
  },

  // ---- Your Turn: four moves, each gated to exactly the control that
  //      performs it, phase by phase through the two-tap flows. ----
  {
    id: 'play',
    phase: 'Your Turn',
    title: 'Play a Card',
    body: 'Tap Healing Rite, then tap Kelvin to land it. A spell resolves once and goes to the discard.',
    task: (v) => v.seen.playedCard,
    gate: (v) => (v.targeting ? [heroName(v.G, v.me, 'active')] : ['Healing Rite']),
  },
  {
    id: 'end',
    phase: 'Your Turn',
    title: 'End the Turn',
    body: 'Both Actives trade blows on the way out. The number beside the blade is what each one hits for.',
    task: (v) => v.seen.endedTurn,
    gate: () => ['End Turn'],
  },
  {
    id: 'skill',
    phase: 'Your Turn',
    title: 'Use a Skill',
    body: 'Open Kelvin, tap his Frost Grenade, then pick their Active. One skill a turn across your whole side.',
    task: (v) => v.seen.usedSkill,
    gate: (v) =>
      v.targeting ? [heroName(v.G, '1', 'active')]
      : v.sheetOpen ? ['~Frost Grenade']
      : [heroName(v.G, v.me, 'active')],
  },
  {
    id: 'equip',
    phase: 'Your Turn',
    title: 'Gear a Hero',
    body: `Tap Extra Health, then Kelvin. Equipment rides on a hero — up to ${MAX_EQUIPMENT_PER_HERO} pieces — and folds into their numbers.`,
    task: (v) => v.seen.equipped,
    gate: (v) => (v.targeting ? [heroName(v.G, v.me, 'active')] : ['Extra Health']),
  },

  // ---- The Fight ----
  {
    id: 'down',
    phase: 'The Fight',
    title: 'Down, Not Out',
    body: 'A fallen hero stays greyed in its slot on a respawn timer, then stands back up at full health.',
    gate: () => [],
  },
  {
    id: 'retreat',
    phase: 'The Fight',
    title: 'Retreat',
    body: `Open your bench hero and hit Retreat — ${RETREAT_COST} souls. Pull a worn Active out before it falls.`,
    task: (v) => v.seen.swapped,
    gate: (v) => (v.sheetOpen ? ['~Retreat'] : [heroName(v.G, v.me, 'bench')]),
  },
  {
    id: 'levels',
    phase: 'The Fight',
    title: 'Levelling',
    body: 'Heroes earn experience for damage and kills. The ring on each card fills, and levelling raises their numbers.',
    gate: () => [],
  },
  {
    id: 'ults',
    phase: 'The Fight',
    title: 'Ultimates',
    body: 'On turn five every hero deals you theirs. They cost the most and they end fights.',
    gate: () => [],
  },

  // ---- Close. The last step opens the board back up for good. ----
  {
    id: 'log',
    phase: 'Close',
    title: 'The Log',
    body: 'Lost the thread? The panel lists every hit, heal and effect in order.',
    gate: () => [],
  },
  {
    id: 'close',
    phase: 'Close',
    title: "That's the Game",
    body: 'The rest of the match is yours. Take the street.',
  },
];
