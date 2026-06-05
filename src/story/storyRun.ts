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
/** A node is reachable when it's a depth-0 node and nothing is cleared yet, or
 *  it's a direct child of the player's current (last-cleared) node. */
export function isReachable(run: StoryRun, node: StoryNode): boolean {
  if (run.status !== 'active') return false;
  if (run.clearedNodeIds.includes(node.id)) return false;
  if (run.currentNodeId === null) return node.depth === 0;
  const cur = run.nodes.find((n) => n.id === run.currentNodeId);
  return !!cur && cur.next.includes(node.id);
}

export function nodeById(run: StoryRun, id: string | null): StoryNode | undefined {
  return id == null ? undefined : run.nodes.find((n) => n.id === id);
}

/** Mark a node cleared and advance the player onto it (immutably). */
export function clearNode(run: StoryRun, nodeId: string): StoryRun {
  const node = run.nodes.find((n) => n.id === nodeId);
  return {
    ...run,
    currentNodeId: nodeId,
    clearedNodeIds: [...run.clearedNodeIds, nodeId],
    status: node?.kind === 'boss' ? 'won' : run.status,
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
  const h = exitHandler;
  exitHandler = null;
  h?.(win);
}
