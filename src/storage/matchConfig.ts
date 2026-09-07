import type { CardId } from '@/engine/types';

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
