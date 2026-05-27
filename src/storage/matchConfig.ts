import type { CardId } from '@/engine/types';

export interface MatchConfig {
  playerDeck: CardId[];
  heroPreferences: (CardId | null)[];
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
