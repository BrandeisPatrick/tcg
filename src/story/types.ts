import type { CardId } from '@/engine/types';

/**
 * Story (campaign) mode. A roguelike run over a vintage New York City map:
 * the player starts with a single hero, fights along a branching node path,
 * recruits up to 4 heroes and builds a deck via 1-of-3 choices, while the
 * opponents scale up the deeper they go.
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

export interface StoryRun {
  seed: number;
  nodes: StoryNode[];
  /** Last cleared node; null means the player is at the origin (only depth-0
   *  nodes are reachable). */
  currentNodeId: string | null;
  clearedNodeIds: string[];
  heroes: CardId[];     // recruited roster, 1..4
  deck: CardId[];       // spell / equipment deck, grows via supply nodes
  status: 'active' | 'won' | 'lost';
}
