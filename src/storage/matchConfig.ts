import type { CardId, PlayerID, TrackHp } from '@/engine/types';

/** Custom numbers for one hero of a scripted match, by roster position
 *  (Active first, then the bench). `hpMax` sets a hero's full health and
 *  fills it; `hp` alone sets where he stands right now. */
export interface HeroStatOverride {
  atk?: number;
  hpMax?: number;
  hp?: number;
  exp?: number;
}

/**
 * Direct match setup for Story mode — bypasses the pre-match hero draft and
 * builds both players from explicit rosters, on the board from the start, with
 * a flat stat buff on every enemy hero (opponents scale up as the campaign
 * progresses) and an optional shorter structure track (quick early fights,
 * epic late ones). Each side draws from a deck of items: the player's saved
 * deck or the one its heroes' builds make, unless the setup names one.
 */
export interface StorySetup {
  playerHeroes: CardId[];   // 1..4
  enemyHeroes: CardId[];    // 1..4
  enemyBuff: { atk: number; hp: number };
  /** A track of the Patron alone, at this HP, for both sides (Story pacing);
   *  left out, the standard track (STRUCTURES) — unless `structures` names one. */
  patronHp?: number;
  /** The rival's Patron-alone track, when it differs from `patronHp` (a
   *  lesson whose one kill is the win). */
  enemyPatronHp?: number;
  /** Both sides' track by structure (a structure left out is not on it), when
   *  it is neither the standard one nor a Patron alone: a lesson about the map. */
  structures?: TrackHp;
  /** The rival's track, when it differs from `structures`. */
  enemyStructures?: TrackHp;
  /** Cards the player starts the fight holding (a Story reward): in the hand
   *  on top of the opening hand, to be played onto a hero like any card. */
  playerItems?: CardId[];
  /** The decks, when the setup names them (a lesson's script): item ids, the
   *  first on top, NOT shuffled. Left out, a side draws from its own deck
   *  (the player's saved deck, else its heroes' builds), shuffled. */
  playerDeck?: CardId[];
  enemyDeck?: CardId[];
  /** Cards each side draws before the first turn (OPENING_HAND when left out;
   *  a lesson may draw none). */
  openingHand?: number;
  /** Souls each side holds before its first income (a Story reward, a deeper
   *  opponent's war chest, a lesson's budget). */
  playerSouls?: number;
  enemySouls?: number;
  /** Open the match on a later engine turn — a lesson that starts mid-fight
   *  (from turn 2 on, the first turn has its attack). Seat 0 opens it either
   *  way: on an even turn it is the second mover. */
  startTurn?: number;
  /** Custom attack / health / experience per hero, so a lesson can build the
   *  exact situation it teaches: a hero one point short of a level, a rival
   *  who falls to precisely the taught move. */
  playerHeroStats?: (HeroStatOverride | undefined)[];
  enemyHeroStats?: (HeroStatOverride | undefined)[];
}

interface MatchConfig {
  heroPreferences: (CardId | null)[];
  /** The match seed (every shuffle is drawn from it); a fresh one when left out. */
  seed?: number;
  /** The human seat's builds — the player's saved builds, by hero. With no
   *  saved deck, the deck is made from the drafted heroes' builds; a hero not
   *  named here (and every hero of an AI seat) follows its default build. */
  builds?: Record<CardId, CardId[]>;
  /** The human seat's saved deck (DECK_SIZE items); left out or not a legal
   *  deck, the deck is made from its heroes' builds. */
  deck?: CardId[];
  /** The hero the title's Quick Match card featured — the recommended first
   *  pick: the draft opens focused on it for the first choice only. Unset for
   *  a deep-linked match or a rematch, where nothing is pre-selected. */
  featuredHero?: CardId;
  /** When present, the game skips the draft and builds the story battle. */
  story?: StorySetup;
  /**
   * When present, the game skips the draft and builds the coached tutorial
   * battle. Same shape as `story` (fixed rosters) but kept on its
   * own field so nothing downstream mistakes a lesson for a campaign node —
   * conceding returns to the title, not to the map.
   */
  tutorial?: StorySetup;
  /** Which lesson `tutorial` is — picks the coach's script. */
  lesson?: string;
  /** The seat a person plays (seat 0 when left out); null when the AI plays
   *  both seats, as in the balance sim: then both seats promote on the spot. */
  humanSeat?: PlayerID | null;
}

let current: MatchConfig = {
  heroPreferences: [null, null, null, null],
};

export function setMatchConfig(config: MatchConfig): void {
  current = { ...config };
}

export function getMatchConfig(): MatchConfig {
  return current;
}

/** The scripted setup for this match, whichever mode supplied it — Story
 *  campaign node or tutorial lesson. Both bypass the draft. */
export function scriptedSetup(config: MatchConfig = current): StorySetup | undefined {
  return config.story ?? config.tutorial;
}
