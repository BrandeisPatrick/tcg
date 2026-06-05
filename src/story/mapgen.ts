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

const X_MIN = 0.08, X_MAX = 0.92;
const Y_MIN = 0.16, Y_MAX = 0.84;

/**
 * Generate a layered, branching node map (Slay-the-Spire style) laid out over
 * the NYC map. Positions are normalized 0..1 so the UI can place node buttons
 * by percentage. Edges connect each node to 1-2 nearest nodes in the next
 * column, and every node is guaranteed reachable with an outgoing path.
 */
export function generateMap(seed: number): StoryNode[] {
  const r = rng(seed);
  const cols = COLUMNS.length;
  const nodesByCol: StoryNode[][] = [];

  // Place nodes.
  for (let c = 0; c < cols; c++) {
    const kinds = shuffled(COLUMNS[c], r);
    const k = kinds.length;
    const x = X_MIN + (X_MAX - X_MIN) * (cols === 1 ? 0.5 : c / (cols - 1));
    const col: StoryNode[] = kinds.map((kind, i) => {
      // Even vertical spread + small deterministic jitter for an organic look.
      const base = k === 1 ? 0.5 : i / (k - 1);
      const y = Y_MIN + (Y_MAX - Y_MIN) * base + (r() - 0.5) * 0.06;
      const jx = x + (r() - 0.5) * 0.03;
      return {
        id: `n${c}_${i}`,
        kind,
        depth: c,
        x: Math.min(X_MAX, Math.max(X_MIN, jx)),
        y: Math.min(0.9, Math.max(0.1, y)),
        next: [],
      };
    });
    nodesByCol.push(col);
  }

  // Connect columns. Each current node links to its nearest-by-y child, plus a
  // second with some probability; then any orphaned child gets an incoming edge.
  for (let c = 0; c < cols - 1; c++) {
    const cur = nodesByCol[c];
    const nxt = nodesByCol[c + 1];
    for (const a of cur) {
      const byDist = [...nxt].sort((p, q) => Math.abs(p.y - a.y) - Math.abs(q.y - a.y));
      a.next.push(byDist[0].id);
      if (byDist[1] && r() < 0.45) a.next.push(byDist[1].id);
    }
    // Guarantee every next-column node is reachable.
    for (const b of nxt) {
      const hasIncoming = cur.some((a) => a.next.includes(b.id));
      if (!hasIncoming) {
        const closest = [...cur].sort((p, q) => Math.abs(p.y - b.y) - Math.abs(q.y - b.y))[0];
        closest.next.push(b.id);
      }
    }
  }

  return nodesByCol.flat();
}

export function maxDepth(nodes: StoryNode[]): number {
  return nodes.reduce((m, n) => Math.max(m, n.depth), 0);
}
