import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { App } from './App';
import { StartScreen } from './ui/start/StartScreen';
import { HeroPreferenceScreen } from './ui/collection/HeroPreferenceScreen';
import { DeckManagerScreen } from './ui/collection/DeckManagerScreen';
import { DeckEditorScreen } from './ui/collection/DeckEditorScreen';
import { StoryMapScreen } from './ui/story/StoryMapScreen';
import { TornEdgeDefs } from './ui/start/tornEdges';
import { setMatchConfig } from './storage/matchConfig';
import { getPreferredHeroes, getSelectedDeck } from './storage/playerData';
import type { StoryRun, StoryNode } from './story/types';
import { loadRun, saveRun, clearNode, setMatchExitHandler } from './story/storyRun';
import { buildStoryMatch } from './story/content';

type View =
  | { screen: 'start' }
  | { screen: 'heroes' }
  | { screen: 'decks' }
  | { screen: 'deckEdit'; slotIndex: number }
  | { screen: 'story' }
  | { screen: 'match' };

export function Root() {
  // Deep-link an initial screen via the URL, e.g. ?screen=match (jumps straight
  // into a Quick Match draft), ?screen=heroes|decks|story, or
  // ?screen=deckEdit&slot=N. Only activates when the param is present, so the
  // normal entry (no query) still lands on the start screen.
  const [view, setView] = useState<View>(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get('screen');
    if (s === 'heroes' || s === 'decks' || s === 'story') return { screen: s };
    if (s === 'deckEdit') return { screen: 'deckEdit', slotIndex: Number(q.get('slot') ?? 0) || 0 };
    if (s === 'match') {
      setMatchConfig({
        playerDeck: getSelectedDeck()?.cards ?? [],
        heroPreferences: getPreferredHeroes(),
        story: undefined,
      });
      return { screen: 'match' };
    }
    return { screen: 'start' };
  });
  const [matchEpoch, setMatchEpoch] = useState(0);
  const [run, setRun] = useState<StoryRun | null>(() => loadRun());
  // The node whose battle is currently in progress (resolved on match end).
  const pendingBattleNode = useRef<string | null>(null);

  const goStart = useCallback(() => setView({ screen: 'start' }), []);
  const goHeroes = useCallback(() => setView({ screen: 'heroes' }), []);
  const goDecks = useCallback(() => setView({ screen: 'decks' }), []);
  const goStory = useCallback(() => setView({ screen: 'story' }), []);
  const goEditDeck = useCallback((idx: number) => setView({ screen: 'deckEdit', slotIndex: idx }), []);

  const goMatch = useCallback(() => {
    const deck = getSelectedDeck();
    const prefs = getPreferredHeroes();
    setMatchConfig({
      playerDeck: deck?.cards ?? [],
      heroPreferences: prefs,
      story: undefined, // ensure a Quick Match runs the normal draft path
    });
    setMatchEpoch((e) => e + 1);
    setView({ screen: 'match' });
  }, []);

  // ---- Story run state ----
  const persistRun = useCallback((next: StoryRun | null) => {
    saveRun(next);
    setRun(next);
  }, []);

  const startStoryBattle = useCallback((node: StoryNode) => {
    setRun((current) => {
      if (!current) return current;
      pendingBattleNode.current = node.id;
      setMatchConfig({
        playerDeck: [],
        heroPreferences: [null, null, null, null],
        story: buildStoryMatch(current, node),
      });
      setMatchEpoch((e) => e + 1);
      setView({ screen: 'match' });
      return current;
    });
  }, []);

  // Bridge: the in-match Board calls finishStoryBattle() on gameover, which
  // invokes this handler — resolve the pending node, then return to the map.
  useEffect(() => {
    setMatchExitHandler((win: boolean) => {
      const nodeId = pendingBattleNode.current;
      pendingBattleNode.current = null;
      setRun((prev) => {
        if (!prev) return prev;
        const next = win && nodeId ? clearNode(prev, nodeId) : { ...prev, status: 'lost' as const };
        saveRun(next);
        return next;
      });
      setView({ screen: 'story' });
    });
    return () => setMatchExitHandler(null);
  }, []);

  // Keyed per screen so AnimatePresence cross-fades on navigation instead of
  // hard-swapping. `mode="wait"` keeps only one (potentially heavy) screen
  // mounted at a time; match keys on epoch so a rematch also gets a fresh fade.
  const screenKey =
    view.screen === 'match' ? `match-${matchEpoch}` :
    view.screen === 'deckEdit' ? `deckEdit-${view.slotIndex}` :
    view.screen;

  return (
    <>
      <TornEdgeDefs />
      <AnimatePresence mode="wait">
        <motion.div
          key={screenKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          {view.screen === 'start' && (
            <StartScreen
              onPlay={goMatch}
              onStory={goStory}
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
          {view.screen === 'story' && (
            <StoryMapScreen
              run={run}
              onUpdateRun={persistRun}
              onBattle={startStoryBattle}
              onExit={goStart}
            />
          )}
          {view.screen === 'match' && (
            <App key={matchEpoch} />
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
