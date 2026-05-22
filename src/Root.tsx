// Top-level shell that gates entry to the boardgame.io match behind a
// start-screen. `App` is a boardgame.io Client factory — mounting it kicks
// off a match immediately. We delay that mount until the user clicks Quick
// Match, and key it on `matchEpoch` so a future "back to menu → play again"
// flow gets a clean match by bumping the key.

import { useState } from 'react';
import { App } from './App';
import { StartScreen } from './ui/start/StartScreen';
import { TornEdgeDefs } from './ui/start/tornEdges';

type View = 'start' | 'match';

export function Root() {
  const [view, setView] = useState<View>('start');
  const [matchEpoch] = useState(0);

  return (
    <>
      <TornEdgeDefs />
      {view === 'start'
        ? <StartScreen onPlay={() => setView('match')} />
        : <App key={matchEpoch} />}
    </>
  );
}
