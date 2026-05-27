import { useState, useCallback } from 'react';
import { App } from './App';
import { StartScreen } from './ui/start/StartScreen';
import { HeroPreferenceScreen } from './ui/collection/HeroPreferenceScreen';
import { DeckManagerScreen } from './ui/collection/DeckManagerScreen';
import { DeckEditorScreen } from './ui/collection/DeckEditorScreen';
import { TornEdgeDefs } from './ui/start/tornEdges';
import { setMatchConfig } from './storage/matchConfig';
import { getPreferredHeroes, getSelectedDeck } from './storage/playerData';

type View =
  | { screen: 'start' }
  | { screen: 'heroes' }
  | { screen: 'decks' }
  | { screen: 'deckEdit'; slotIndex: number }
  | { screen: 'match' };

export function Root() {
  const [view, setView] = useState<View>({ screen: 'start' });
  const [matchEpoch, setMatchEpoch] = useState(0);

  const goStart = useCallback(() => setView({ screen: 'start' }), []);
  const goHeroes = useCallback(() => setView({ screen: 'heroes' }), []);
  const goDecks = useCallback(() => setView({ screen: 'decks' }), []);
  const goEditDeck = useCallback((idx: number) => setView({ screen: 'deckEdit', slotIndex: idx }), []);

  const goMatch = useCallback(() => {
    const deck = getSelectedDeck();
    const prefs = getPreferredHeroes();
    setMatchConfig({
      playerDeck: deck?.cards ?? [],
      heroPreferences: prefs,
    });
    setMatchEpoch((e) => e + 1);
    setView({ screen: 'match' });
  }, []);

  return (
    <>
      <TornEdgeDefs />
      {view.screen === 'start' && (
        <StartScreen
          onPlay={goMatch}
          onHeroes={goHeroes}
          onDecks={goDecks}
        />
      )}
      {view.screen === 'heroes' && (
        <HeroPreferenceScreen onBack={goStart} />
      )}
      {view.screen === 'decks' && (
        <DeckManagerScreen
          onBack={goStart}
          onEditDeck={goEditDeck}
        />
      )}
      {view.screen === 'deckEdit' && (
        <DeckEditorScreen
          slotIndex={view.slotIndex}
          onBack={goDecks}
        />
      )}
      {view.screen === 'match' && (
        <App key={matchEpoch} />
      )}
    </>
  );
}
