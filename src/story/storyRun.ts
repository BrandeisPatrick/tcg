import type { CardId } from '@/engine/types';
import type { FightReward, NodeKind, RewardChoice, StoryRun, StoryNode } from './types';
import { buildCampaign } from './campaign';
import { itemCard, migrateCardIds } from '@/cards';

const STORAGE_KEY = 'deadlock-tcg-story';

// ---- persistence -------------------------------------------------------------
export function loadRun(): StoryRun | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as StoryRun & { deck?: unknown };
    if (!saved?.nodes?.length) return null;
    // A run saved before the shop carries a deck and no reward: the deck goes
    // (nothing holds cards any more) and the next fight starts with nothing
    // extra.
    const { deck: _deck, ...run } = saved;
    return { ...run, nextFight: savedReward(run.nextFight) };
  } catch {
    return null;
  }
}

/** A saved reward brought up to date: known items only, whole souls. */
function savedReward(saved: unknown): FightReward {
  const r = (saved ?? {}) as Partial<Record<keyof FightReward, unknown>>;
  const ids = Array.isArray(r.items) ? r.items.filter((id): id is string => typeof id === 'string') : [];
  const souls = typeof r.souls === 'number' && Number.isFinite(r.souls) ? Math.max(0, Math.floor(r.souls)) : 0;
  return { items: migrateCardIds(ids).filter((id) => !!itemCard(id)), souls };
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
    nodes: buildCampaign(),
    currentNodeId: null,
    clearedNodeIds: [],
    heroes: [startHero],
    nextFight: emptyReward(),
    status: 'active',
  };
}

// ---- the next fight's supplies ---------------------------------------------------
export function emptyReward(): FightReward {
  return { items: [], souls: 0 };
}

/** True when nothing is waiting for the next fight. */
export function isEmptyReward(reward: FightReward): boolean {
  return reward.items.length === 0 && reward.souls <= 0;
}

/** Add a supply stop's pick to what the next fight starts with. */
export function takeReward(run: StoryRun, choice: RewardChoice): StoryRun {
  const r = run.nextFight;
  return {
    ...run,
    nextFight: 'item' in choice
      ? { items: [...r.items, choice.item], souls: r.souls }
      : { items: r.items, souls: r.souls + choice.souls },
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

/** The kinds of stop that are a fight. */
export const isFight = (kind: NodeKind): boolean => kind === 'battle' || kind === 'elite' || kind === 'boss';

/** Mark a node cleared. A won fight spends the supplies that were waiting for
 *  it (a recruit or a cache leaves them be). The campaign is won once every
 *  boss has fallen. */
export function clearNode(run: StoryRun, nodeId: string): StoryRun {
  const cleared = [...run.clearedNodeIds, nodeId];
  const bosses = run.nodes.filter((n) => n.kind === 'boss');
  const allBossesDown = bosses.length > 0 && bosses.every((b) => cleared.includes(b.id));
  const node = run.nodes.find((n) => n.id === nodeId);
  return {
    ...run,
    currentNodeId: nodeId,
    clearedNodeIds: cleared,
    nextFight: node && isFight(node.kind) ? emptyReward() : run.nextFight,
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
