import type { CardId } from '@/engine/types';

export interface DeckBlueprint {
  id: string;
  title: string;
  heroes: [CardId, CardId, CardId, CardId];
}

export const STARTER_DECK_PLAYER: DeckBlueprint = {
  id: 'starter_player',
  title: 'Starter — Aggro',
  heroes: ['hero_haze', 'hero_vindicta', 'hero_lash', 'hero_paige'],
};

export const STARTER_DECK_AI: DeckBlueprint = {
  id: 'starter_ai',
  title: 'Starter — Control',
  heroes: ['hero_abrams', 'hero_dynamo', 'hero_kelvin', 'hero_seven'],
};
