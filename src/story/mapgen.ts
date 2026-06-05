import type { StoryNode, NodeKind } from './types';
import { rng, shuffled } from './content';

// Column blueprint. Each entry is the set of node kinds offered at that depth
// (their vertical order is shuffled per seed). Depth 0 is the opening 1v1;
// the final column is always a single boss. Recruit options appear in the
// early/mid columns so reaching a 4-hero roster is always achievable.
const COLUMNS: NodeKind[][] = [
  ['battle'],
  ['battle', 'recruit'],
  ['recruit', 'supply', 'battle'],
  ['elite', 'battle', 'recruit'],
  ['recruit', 'supply', 'battle'],
  ['supply', 'elite'],
  ['boss'],
];

// Vertical layout: depth climbs bottom (start / the Battery) to top (boss /
// uptown); nodes within a tier spread horizontally. Matches a portrait journey
// up the island. The X range is kept central so nodes stay on the landmass.
const X_MIN = 0.2, X_MAX = 0.8;
const Y_TOP = 0.12;     // boss tier (uptown)
const Y_BOTTOM = 0.87;  // start tier (downtown)

/**
 * Generate a layered, branching node map (Slay-the-Spire style) laid out over
 * the NYC map as a vertical climb. Positions are normalized 0..1 so the UI can
 * place node buttons by percentage. Edges connect each node to 1-2 nearest
 * nodes in the next tier, and every node is guaranteed reachable.
 */
export function generateMap(seed: number): StoryNode[] {
  const r = rng(seed);
  const tiers = COLUMNS.length;
  const nodesByTier: StoryNode[][] = [];

  // Place nodes — depth → vertical position (bottom up), index → horizontal.
  for (let c = 0; c < tiers; c++) {
    const kinds = shuffled(COLUMNS[c], r);
    const k = kinds.length;
    const y = Y_BOTTOM - (Y_BOTTOM - Y_TOP) * (tiers === 1 ? 0 : c / (tiers - 1));
    const tier: StoryNode[] = kinds.map((kind, i) => {
      const base = k === 1 ? 0.5 : i / (k - 1);
      const x = X_MIN + (X_MAX - X_MIN) * base + (r() - 0.5) * 0.05;
      const jy = y + (r() - 0.5) * 0.035;
      return {
        id: `n${c}_${i}`,
        kind,
        depth: c,
        x: Math.min(X_MAX + 0.02, Math.max(X_MIN - 0.02, x)),
        y: Math.min(0.92, Math.max(0.08, jy)),
        next: [],
      };
    });
    nodesByTier.push(tier);
  }

  // Connect tiers. Each node links to its nearest-by-x node in the tier above,
  // plus a second with some probability; then any orphaned node gets an edge.
  for (let c = 0; c < tiers - 1; c++) {
    const cur = nodesByTier[c];
    const nxt = nodesByTier[c + 1];
    for (const a of cur) {
      const byDist = [...nxt].sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x));
      a.next.push(byDist[0].id);
      if (byDist[1] && r() < 0.45) a.next.push(byDist[1].id);
    }
    for (const b of nxt) {
      const hasIncoming = cur.some((a) => a.next.includes(b.id));
      if (!hasIncoming) {
        const closest = [...cur].sort((p, q) => Math.abs(p.x - b.x) - Math.abs(q.x - b.x))[0];
        closest.next.push(b.id);
      }
    }
  }

  return nodesByTier.flat();
}

export function maxDepth(nodes: StoryNode[]): number {
  return nodes.reduce((m, n) => Math.max(m, n.depth), 0);
}
