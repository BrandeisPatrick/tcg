import type { CardId } from '@/engine/types';
import type { StoryRun, StoryNode } from './types';
import { generateMap } from './mapgen';
import { STARTING_DECK } from './content';

const STORAGE_KEY = 'deadlock-tcg-story';

// ---- persistence -------------------------------------------------------------
export function loadRun(): StoryRun | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as StoryRun;
    if (!run?.nodes?.length) return null;
    return run;
  } catch {
    return null;
  }
}

export function saveRun(run: StoryRun | null): void {
  try {
    if (run) localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — run stays in-memory only */
  }
}

export function newRun(startHero: CardId): StoryRun {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  return {
    seed,
    nodes: generateMap(seed),
    currentNodeId: null,
    clearedNodeIds: [],
    heroes: [startHero],
    deck: [...STARTING_DECK],
    status: 'active',
  };
}

// ---- map traversal helpers ---------------------------------------------------
/** A node is reachable when it's a route start (no parents) or any parent has
 *  been cleared. Each of the three routes advances independently. */
export function isReachable(run: StoryRun, node: StoryNode): boolean {
  if (run.status !== 'active') return false;
  if (run.clearedNodeIds.includes(node.id)) return false;
  const parents = run.nodes.filter((n) => n.next.includes(node.id));
  if (parents.length === 0) return true; // route start
  return parents.some((p) => run.clearedNodeIds.includes(p.id));
}

export function nodeById(run: StoryRun, id: string | null): StoryNode | undefined {
  return id == null ? undefined : run.nodes.find((n) => n.id === id);
}

/** Mark a node cleared. The campaign is won once every boss has fallen. */
export function clearNode(run: StoryRun, nodeId: string): StoryRun {
  const cleared = [...run.clearedNodeIds, nodeId];
  const bosses = run.nodes.filter((n) => n.kind === 'boss');
  const allBossesDown = bosses.length > 0 && bosses.every((b) => cleared.includes(b.id));
  return {
    ...run,
    currentNodeId: nodeId,
    clearedNodeIds: cleared,
    status: allBossesDown ? 'won' : run.status,
  };
}

// ---- match-result bridge -----------------------------------------------------
// The in-match Board lives inside a boardgame.io Client and can't reach Root's
// view state directly, so it calls finishStoryBattle() on gameover. Root
// registers the handler (which resolves the pending node and returns to the map).
let exitHandler: ((win: boolean) => void) | null = null;
export function setMatchExitHandler(fn: ((win: boolean) => void) | null): void {
  exitHandler = fn;
}
export function finishStoryBattle(win: boolean): void {
  // Keep the handler registered — it must work for every battle in the run, not
  // just the first. (Root registers it once on mount and clears it on unmount.)
  exitHandler?.(win);
}
