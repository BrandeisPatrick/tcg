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

// Nodes are placed along Manhattan's tilted spine (Battery at the bottom tip →
// Inwood uptown at the top), so the run is a climb up the island. These must
// match the spine the NYC map (NycMap.tsx) draws Manhattan around. Coords are
// in the 1200x700 viewBox; nodes are normalized to 0..1 at the end.
const SPINE = { x0: 398, y0: 886, x1: 470, y1: 196 };
const VW = 840, VH = 1080;
const D = { x: SPINE.x1 - SPINE.x0, y: SPINE.y1 - SPINE.y0 };
const LEN = Math.hypot(D.x, D.y);
const PERP = { x: -D.y / LEN, y: D.x / LEN }; // across the island
// Perpendicular offsets (viewBox px) for each tier size — kept inside the
// island's mid-width (~126) so every node lands on Manhattan.
const OFFSETS: Record<number, number[]> = { 1: [0], 2: [-58, 58], 3: [-88, 0, 88] };

function dist(a: StoryNode, b: StoryNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Generate a layered, branching node map (Slay-the-Spire style) that climbs up
 * Manhattan. Each tier sits at a point along the island's spine; the tier's
 * nodes fan out across the island's width. Edges link nearest nodes between
 * tiers and every node is guaranteed reachable.
 */
export function generateMap(seed: number): StoryNode[] {
  const r = rng(seed);
  const tiers = COLUMNS.length;
  const nodesByTier: StoryNode[][] = [];

  for (let c = 0; c < tiers; c++) {
    const kinds = shuffled(COLUMNS[c], r);
    const k = kinds.length;
    const t = tiers === 1 ? 0 : c / (tiers - 1);
    const sx = SPINE.x0 + D.x * t;
    const sy = SPINE.y0 + D.y * t;
    const offs = OFFSETS[k] ?? [0];
    const tier: StoryNode[] = kinds.map((kind, i) => {
      const o = offs[i] + (r() - 0.5) * 14;       // across-island jitter
      const along = (r() - 0.5) * 24;             // up/down-spine jitter
      const vx = sx + PERP.x * o + (D.x / LEN) * along;
      const vy = sy + PERP.y * o + (D.y / LEN) * along;
      return {
        id: `n${c}_${i}`,
        kind,
        depth: c,
        x: Math.min(0.96, Math.max(0.04, vx / VW)),
        y: Math.min(0.96, Math.max(0.04, vy / VH)),
        next: [],
      };
    });
    nodesByTier.push(tier);
  }

  for (let c = 0; c < tiers - 1; c++) {
    const cur = nodesByTier[c];
    const nxt = nodesByTier[c + 1];
    for (const a of cur) {
      const byDist = [...nxt].sort((p, q) => dist(a, p) - dist(a, q));
      a.next.push(byDist[0].id);
      if (byDist[1] && r() < 0.45) a.next.push(byDist[1].id);
    }
    for (const b of nxt) {
      if (!cur.some((a) => a.next.includes(b.id))) {
        const closest = [...cur].sort((p, q) => dist(p, b) - dist(q, b))[0];
        closest.next.push(b.id);
      }
    }
  }

  return nodesByTier.flat();
}

export function maxDepth(nodes: StoryNode[]): number {
  return nodes.reduce((m, n) => Math.max(m, n.depth), 0);
}
