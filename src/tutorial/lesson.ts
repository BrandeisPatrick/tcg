/**
 * The tutorial lesson — one fixed match plus the coached script that runs on
 * top of it.
 *
 * The match reuses the scripted-setup path Story already uses (`StorySetup`),
 * so no engine branch is needed: fixed rosters, fixed decks, no draft, no
 * mulligan. It is deliberately lopsided — the player fields two 2/6 heroes
 * against two 1/4s, and the patron only has 3 lives, so the lesson resolves in
 * a handful of turns and is very hard to lose.
 *
 * The script never blocks input. Each step either states something (advance on
 * Next) or names a task and watches the game state until the player does it.
 * That keeps the coach honest: it can't get stuck on a move the player already
 * made, and a player who ignores it entirely still just plays a match.
 */
import type { CardId, GameState, PlayerID } from '@/engine/types';
import type { StorySetup } from '@/storage/matchConfig';
import { RETREAT_COST, SKILL_COST } from '@/engine/game';

/** Your side: two sturdy heroes with cheap, unambiguous skills. */
const PLAYER_HEROES: CardId[] = ['hero_kelvin', 'hero_yamato'];
/** Theirs: three of the lowest-attack heroes in the set (1 atk each), so the
 *  lesson is safe to lose track of — and long enough that the script gets to
 *  finish. With two, an optimal opponent's board wipes on turn 5, which can
 *  end the match while the coach is still on step 5. */
const ENEMY_HEROES: CardId[] = ['hero_lash', 'hero_sinclair', 'hero_lady_geist'];

/** A 12-card deck of 1- and 2-cost cards only, so something is always
 *  playable and it never runs dry inside the lesson. */
const PLAYER_DECK: CardId[] = [
  'extra_health', 'extra_health',
  'healing_rite', 'healing_rite',
  'restorative_shot', 'restorative_shot',
  'extended_magazine', 'extended_magazine',
  'rusted_barrel', 'rusted_barrel',
  'extra_regen', 'extra_regen',
];

const ENEMY_DECK: CardId[] = [
  'extra_health', 'extra_health',
  'healing_rite', 'healing_rite',
  'extra_regen', 'extra_regen',
  'restorative_shot', 'restorative_shot',
  'healing_booster', 'mystic_regeneration',
];

/** Patron lives for the lesson. Low so the match still ends while the script
 *  is fresh; the player's side is safe behind 6 HP heroes either way. */
const TUTORIAL_PATRON_HP = 4;

export function tutorialSetup(): StorySetup {
  return {
    playerHeroes: [...PLAYER_HEROES],
    playerDeck: [...PLAYER_DECK],
    enemyHeroes: [...ENEMY_HEROES],
    enemyDeck: [...ENEMY_DECK],
    enemyBuff: { atk: 0, hp: 0 },
    patronHp: TUTORIAL_PATRON_HP,
  };
}

/* ------------------------------------------------------------------ */
/* The script                                                          */
/* ------------------------------------------------------------------ */

/** Monotonic latches the coach sets as it watches play — once true, they
 *  stay true, so a step can't un-complete when the turn rolls over. */
export interface CoachSeen {
  playedCard: boolean;
  usedSkill: boolean;
  endedTurn: boolean;
  swapped: boolean;
}

export const emptySeen: CoachSeen = {
  playedCard: false,
  usedSkill: false,
  endedTurn: false,
  swapped: false,
};

export interface CoachView {
  G: GameState;
  me: PlayerID;
  isMyTurn: boolean;
  seen: CoachSeen;
}

export interface CoachStep {
  id: string;
  /** Stencil heading — two or three words. */
  title: string;
  /** One line. The board shows the rest. */
  body: string;
  /** Present = the step is a task, and completes when this reads true.
   *  Absent = the step just states something and advances on Next. */
  task?: (v: CoachView) => boolean;
}

export const LESSON: CoachStep[] = [
  {
    id: 'deal',
    title: 'The Deal',
    body: 'Zero their patron, or floor their whole bench.',
  },
  {
    id: 'souls',
    title: 'Souls',
    body: 'The rail refills each turn. Cards and skills spend it.',
  },
  {
    id: 'play',
    title: 'Play a Card',
    body: 'Tap a card, then tap who it lands on.',
    task: (v) => v.seen.playedCard,
  },
  {
    id: 'skill',
    title: 'Use a Skill',
    body: `Tap your Active, then its Skill. ${SKILL_COST} soul, once a turn.`,
    task: (v) => v.seen.usedSkill,
  },
  {
    id: 'end',
    title: 'End the Turn',
    body: 'Both Actives trade blows on the way out.',
    task: (v) => v.seen.endedTurn,
  },
  {
    id: 'retreat',
    title: 'Retreat',
    body: `Open a bench hero and Retreat — ${RETREAT_COST} souls.`,
    task: (v) => v.seen.swapped,
  },
  {
    id: 'ults',
    title: 'Ultimates',
    body: 'Every hero deals you theirs on turn five.',
  },
  {
    id: 'close',
    title: "That's the Game",
    body: 'Take the street.',
  },
];
