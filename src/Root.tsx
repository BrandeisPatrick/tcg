import { useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { useSettings } from '@/storage/settings';
import { App } from './App';
import { StartScreen } from './ui/start/StartScreen';
import { LoadoutScreen } from './ui/collection/LoadoutScreen';
import { DeckEditorScreen } from './ui/collection/DeckEditorScreen';
import { PosterBackdrop } from './ui/PosterBackdrop';
import { SystemLayer } from './ui/system/SystemMenu';
import { setMatchConfig, getMatchConfig } from './storage/matchConfig';
import { getPreferredHeroes, getSelectedDeck } from './storage/playerData';
import { tutorialSetup } from './tutorial/lesson';
import type { StoryRun, StoryNode } from './story/types';
import { loadRun, saveRun, clearNode, setMatchExitHandler } from './story/storyRun';
import { buildStoryMatch } from './story/content';
import { MatchNavContext, type MatchNav } from './ui/hooks/matchNav';

/**
 * The story map draws real NYC geometry — borough outlines and the whole OSM
 * road network, baked into nycGeo.ts. That data is 840 kB raw and ~320 kB
 * gzipped, which is more than every other module in the app put together, and
 * until now every visitor downloaded it to look at the title screen.
 *
 * Splitting it out is purely a matter of WHEN it is fetched: not a coordinate
 * of the map changes, and it renders exactly as before. The one cost — a beat
 * of nothing on the first Story open — is paid off by `prefetchStoryMap`
 * below, which pulls the chunk down while the title screen sits idle. By the
 * time anyone presses Story it is already in cache.
 */
const StoryMapScreen = lazy(() =>
  import('./ui/story/StoryMapScreen').then((m) => ({ default: m.StoryMapScreen })),
);

let storyMapPrefetched = false;
function prefetchStoryMap() {
  if (storyMapPrefetched) return;
  storyMapPrefetched = true;
  void import('./ui/story/StoryMapScreen');
}

type View =
  | { screen: 'start' }
  | { screen: 'loadout' }
  | { screen: 'deckEdit'; slotIndex: number }
  | { screen: 'story' }
  | { screen: 'match' };

export function Root() {
  // Deep-link an initial screen via the URL, e.g. ?screen=match (jumps straight
  // into a Quick Match draft), ?screen=loadout|story|tutorial, or
  // ?screen=deckEdit&slot=N. Only activates when the param is present, so the
  // normal entry (no query) still lands on the start screen.
  const [view, setView] = useState<View>(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get('screen');
    if (s === 'loadout' || s === 'story') return { screen: s };
    // Pre-merge links, kept working: both halves now live on one sheet.
    if (s === 'heroes' || s === 'decks') return { screen: 'loadout' };
    if (s === 'deckEdit') return { screen: 'deckEdit', slotIndex: Number(q.get('slot') ?? 0) || 0 };
    if (s === 'tutorial') {
      setMatchConfig({
        playerDeck: [],
        heroPreferences: [null, null, null, null],
        tutorial: tutorialSetup(),
      });
      return { screen: 'match' };
    }
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

  // Warm the story chunk while nothing else is happening, so pressing Story
  // never waits on the network. requestIdleCallback where it exists (not
  // Safari), a slack timeout otherwise; either way it never competes with the
  // title screen's own load.
  useEffect(() => {
    const idle = (window as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) { idle(prefetchStoryMap); return; }
    const t = setTimeout(prefetchStoryMap, 2000);
    return () => clearTimeout(t);
  }, []);

  const goStart = useCallback(() => setView({ screen: 'start' }), []);
  const goLoadout = useCallback(() => setView({ screen: 'loadout' }), []);
  const goStory = useCallback(() => setView({ screen: 'story' }), []);
  const goEditDeck = useCallback((idx: number) => setView({ screen: 'deckEdit', slotIndex: idx }), []);

  // The tutorial is a real match on a fixed, lopsided setup — same scripted
  // path Story uses, plus the coach plate. It ignores the player's loadout on
  // purpose: the lesson refers to specific heroes and cards.
  const goTutorial = useCallback(() => {
    setMatchConfig({
      playerDeck: [],
      heroPreferences: [null, null, null, null],
      tutorial: tutorialSetup(),
    });
    setMatchEpoch((e) => e + 1);
    setView({ screen: 'match' });
  }, []);

  const goMatch = useCallback(() => {
    const deck = getSelectedDeck();
    const prefs = getPreferredHeroes();
    setMatchConfig({
      playerDeck: deck?.cards ?? [],
      heroPreferences: prefs,
      // Clear both scripted setups so a Quick Match runs the normal draft path.
      story: undefined,
      tutorial: undefined,
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

  // System-menu exit: conceding a story battle retreats to the campaign map
  // (the node stays uncleared, so it can be retried); everything else
  // returns to the title screen.
  const systemExit = useCallback(() => {
    if (view.screen === 'match' && getMatchConfig().story) {
      pendingBattleNode.current = null;
      setView({ screen: 'story' });
    } else {
      setView({ screen: 'start' });
    }
  }, [view.screen]);

  const systemExitLabel =
    view.screen === 'start' ? '' :
    view.screen === 'match'
      ? getMatchConfig().story ? 'Concede · Back to Map'
      : getMatchConfig().tutorial ? 'Leave the Lesson'
      : 'Concede Match'
      : 'Back to Title';

  // In-match navigation (end screen's Rematch / Main Menu). Provided via
  // context because Board sits under boardgame.io's Client and can't take
  // props from here.
  const matchNav: MatchNav = useMemo(
    () => ({ rematch: goMatch, exitToMenu: goStart }),
    [goMatch, goStart],
  );

  const { reducedMotion } = useSettings();

  return (
    // reducedMotion 'always' disables framer's transform/layout animations
    // app-wide (opacity still fades); 'user' defers to the OS preference.
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
    <MatchNavContext.Provider value={matchNav}>
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
              onTutorial={goTutorial}
              onLoadout={goLoadout}
            />
          )}
          {view.screen === 'loadout' && (
            <LoadoutScreen
              onBack={goStart}
              onEditDeck={goEditDeck}
            />
          )}
          {view.screen === 'deckEdit' && (
            <DeckEditorScreen
              slotIndex={view.slotIndex}
              onBack={goLoadout}
            />
          )}
          {view.screen === 'story' && (
            <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#0d1715' }}><PosterBackdrop /></div>}>
            <StoryMapScreen
              run={run}
              onUpdateRun={persistRun}
              onBattle={startStoryBattle}
              onExit={goStart}
            />
            </Suspense>
          )}
          {view.screen === 'match' && (
            <App key={matchEpoch} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Persistent system chrome — same corner on every screen, never
          part of the screen cross-fade. */}
      <SystemLayer
        screen={view.screen}
        onExitToMenu={systemExit}
        exitLabel={systemExitLabel}
      />
    </MatchNavContext.Provider>
    </MotionConfig>
  );
}
