import type { CardId } from '@/engine/types';

/**
 * Story (campaign) mode. A roguelike run over a vintage New York City map:
 * the player starts with a single hero, fights along a branching node path,
 * recruits up to 4 heroes and gathers supplies for the next fight via 1-of-3
 * choices, while the opponents scale up the deeper they go.
 */
export type NodeKind = 'battle' | 'elite' | 'recruit' | 'supply' | 'boss';

export interface StoryNode {
  id: string;
  kind: NodeKind;
  depth: number;        // position along its path (0 = start) — drives scaling
  x: number;            // normalized 0..1 position on the map
  y: number;            // normalized 0..1 position on the map
  next: string[];       // child node ids further along the path
  /** Named NYC location (e.g. "Wall Street"). */
  name?: string;
  /** Which campaign route this node belongs to. */
  region?: string;
  /** Themed enemy hero that leads the roster at this battle (combat nodes). */
  enemy?: CardId;
}

/** What the next fight starts with, gathered at supply stops on the way to
 *  it (rewards add up until a fight is over): items your side wears from the
 *  first turn, free, and souls in hand before the first income. */
export interface FightReward {
  items: CardId[];
  souls: number;
}

/** One of the three things a supply stop offers: an item, or a purse of
 *  souls. */
export type RewardChoice = { item: CardId } | { souls: number };

export interface StoryRun {
  seed: number;
  nodes: StoryNode[];
  /** Last cleared node; null means the player is at the origin (only depth-0
   *  nodes are reachable). */
  currentNodeId: string | null;
  clearedNodeIds: string[];
  heroes: CardId[];     // recruited roster, 1..4
  /** The supplies waiting for the next fight; that fight spends them. */
  nextFight: FightReward;
  status: 'active' | 'won' | 'lost';
}
