import type { StoryNode } from './types';
import { buildCampaign } from './campaign';

/**
 * The campaign map is now a hand-designed three-route layout (see campaign.ts),
 * not procedurally generated — every battle is a named NYC location with a
 * themed enemy. The seed is kept in the signature for API compatibility but is
 * unused (the map is fixed).
 */
export function generateMap(_seed: number): StoryNode[] {
  return buildCampaign();
}

export function maxDepth(nodes: StoryNode[]): number {
  return nodes.reduce((m, n) => Math.max(m, n.depth), 0);
}
