import type { CardId } from '@/engine/types';

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
 * builds both players from explicit rosters/decks, with a flat stat buff on
 * every enemy hero (opponents scale up as the campaign progresses) and an
 * optional patron-HP override (shorter early fights, epic late ones).
 */
export interface StorySetup {
  playerHeroes: CardId[];   // 1..4
  playerDeck: CardId[];
  enemyHeroes: CardId[];    // 1..4
  enemyDeck: CardId[];
  enemyBuff: { atk: number; hp: number };
  patronHp?: number;
  /** Deal the player's deck in the order given instead of shuffling it, so a
   *  scripted lesson can name the cards in the opening hand. */
  orderedPlayerDeck?: boolean;
  /** Open the match on a later turn (souls already ramped, ultimates already
   *  dealt) — the later tutorial lessons start mid-fight rather than making
   *  the player replay the opening every time. */
  startTurn?: number;
  /** Rival patron lives, when they should differ from yours. */
  enemyPatronHp?: number;
  /** Custom attack / health / experience per hero, so a lesson can build the
   *  exact situation it teaches: a hero one point short of a level, a rival
   *  who falls to precisely the taught move. */
  playerHeroStats?: (HeroStatOverride | undefined)[];
  enemyHeroStats?: (HeroStatOverride | undefined)[];
}

export interface MatchConfig {
  playerDeck: CardId[];
  heroPreferences: (CardId | null)[];
  /** When present, the game skips the draft and builds the story battle. */
  story?: StorySetup;
  /**
   * When present, the game skips the draft and builds the coached tutorial
   * battle. Same shape as `story` (fixed rosters, fixed decks) but kept on its
   * own field so nothing downstream mistakes a lesson for a campaign node —
   * conceding returns to the title, not to the map.
   */
  tutorial?: StorySetup;
  /** Which lesson `tutorial` is — picks the coach's script. */
  lesson?: string;
}

let current: MatchConfig = {
  playerDeck: [],
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
