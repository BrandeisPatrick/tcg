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
