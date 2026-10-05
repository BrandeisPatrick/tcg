import { memo, type CSSProperties } from 'react';
import type { StoryRun, StoryNode } from '@/story/types';
import { stopState } from '@/story/describe';
import { poster } from '../poster';
import { MAP_W, MAP_H } from './mapCamera';

/**
 * The campaign routes, drawn over the sheet in map units inside the map
 * stage, under one group scaled by the stage's live zoom (`--s`). Their
 * strokes are non-scaling, so a route keeps its weight and the red dots their
 * rhythm at every zoom, mid-pinch included, and the paths themselves are
 * built once per run, not per frame. Each route is one smooth curve
 * through its stops (Catmull-Rom, cut into one cubic Bézier per leg so each
 * leg can carry its own state):
 *   - travelled — both ends cleared: a gold line on an ink casing, your path;
 *   - open — cleared → open: the title card's red dotted route, on a cream
 *     casing so it reads over land and water alike;
 *   - locked — faint ink dashes on a faint cream casing.
 * The routes hold still, like the title card's: the pulse on the open stops
 * already says "go here", and a route that moved would repaint this layer on
 * every frame the map is open. The one motion is a newly opened leg drawing
 * itself in on arrival (not under reduced motion).
 */

type V = { x: number; y: number };
export interface Leg { key: string; from: StoryNode; to: StoryNode; p: [V, V, V, V] }
export type LegState = 'travelled' | 'open' | 'locked';

/** A leg's key as an SVG id (keys hold a '>', which url(#…) will not take). */
const maskId = (leg: Leg) => `story-draw-${leg.key.replace(/[^\w-]/g, '_')}`;

/** Every root-to-end chain through the stop graph, cut into Bézier legs in
 *  map units. Shared legs (none today) are kept once. */
export function routeLegs(nodes: StoryNode[]): Leg[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasParent = new Set(nodes.flatMap((n) => n.next));
  const chains: StoryNode[][] = [];
  const walk = (path: StoryNode[]) => {
    const kids = path[path.length - 1].next.map((id) => byId.get(id)).filter((n): n is StoryNode => !!n);
    if (kids.length === 0 || path.length > nodes.length) { chains.push(path); return; }
    for (const k of kids) walk([...path, k]);
  };
  nodes.filter((n) => !hasParent.has(n.id)).forEach((r) => walk([r]));

  const legs = new Map<string, Leg>();
  for (const chain of chains) {
    const pts = chain.map((n) => ({ x: n.x * MAP_W, y: n.y * MAP_H }));
    for (let i = 0; i + 1 < chain.length; i++) {
      const key = `${chain[i].id}>${chain[i + 1].id}`;
      if (legs.has(key)) continue;
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      legs.set(key, {
        key, from: chain[i], to: chain[i + 1],
        p: [
          p1,
          { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
          { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
          p2,
        ],
      });
    }
  }
  return [...legs.values()];
}

export function legState(run: StoryRun, leg: Leg): LegState {
  const cleared = run.clearedNodeIds;
  if (!cleared.includes(leg.from.id)) return 'locked';
  if (cleared.includes(leg.to.id)) return 'travelled';
  return stopState(run, leg.to) === 'open' ? 'open' : 'locked';
}

// The red route's rhythm: a round dot every DOT_GAP px (the title card's
// dotted climb, a touch bolder for the map).
const DOT_GAP = 10;
const LOCKED_CASING = 'rgba(242, 230, 203, 0.32)';
const LOCKED_INK = 'rgba(23, 20, 16, 0.42)';
/** The draw-in mask's width, in map units: wider than the open route's
 *  casing at the widest zoom (≈ 10 units there), whatever the zoom. */
const REVEAL_W = 14;

const n = (v: number) => v.toFixed(1);
const pathOf = (leg: Leg) => {
  const [a, b, c, e] = leg.p;
  return `M${n(a.x)} ${n(a.y)}C${n(b.x)} ${n(b.y)} ${n(c.x)} ${n(c.y)} ${n(e.x)} ${n(e.y)}`;
};
/** Widths and dashes in screen px, whatever the group's scale. */
const fixed: CSSProperties = { vectorEffect: 'non-scaling-stroke' };

export const RouteLines = memo(function RouteLines({
  run, legs, drawIn, calm,
}: {
  run: StoryRun;
  legs: Leg[];
  /** Legs that draw themselves in (the ones a cleared stop just opened). */
  drawIn: ReadonlySet<string>;
  calm: boolean;
}) {
  const by: Record<LegState, Leg[]> = { travelled: [], open: [], locked: [] };
  for (const leg of legs) by[legState(run, leg)].push(leg);
  const masked = by.open.filter((l) => drawIn.has(l.key) && !calm);

  return (
    <svg aria-hidden width={1} height={1}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
      <g fill="none" strokeLinecap="round" style={{ transform: 'scale(var(--s, 1))' }}>
        {masked.length > 0 && (
          <defs>
            {masked.map((leg) => (
              // A stroke that reveals the leg end to end; pathLength 1 makes
              // the dash offset a 0→1 progress whatever the leg's length.
              <mask key={leg.key} id={maskId(leg)} maskUnits="userSpaceOnUse"
                x={-MAP_W} y={-MAP_H} width={MAP_W * 3} height={MAP_H * 3}>
                <path d={pathOf(leg)} fill="none" stroke="#fff" strokeWidth={REVEAL_W} strokeLinecap="round"
                  pathLength={1} strokeDasharray="1 1"
                  style={{ strokeDashoffset: 1, animation: 'story-draw 700ms 550ms cubic-bezier(0.3, 0, 0.2, 1) forwards' }} />
              </mask>
            ))}
          </defs>
        )}
        {by.locked.map((leg) => (
          <g key={leg.key}>
            <path d={pathOf(leg)} style={fixed} stroke={LOCKED_CASING} strokeWidth="3.5" />
            <path d={pathOf(leg)} style={fixed} stroke={LOCKED_INK} strokeWidth="1.4" strokeDasharray="5 6" />
          </g>
        ))}
        {by.travelled.map((leg) => (
          <g key={leg.key}>
            <path d={pathOf(leg)} style={fixed} stroke={poster.ink} strokeWidth="6" />
            <path d={pathOf(leg)} style={fixed} stroke={poster.gold} strokeWidth="3" />
          </g>
        ))}
        {by.open.map((leg) => (
          <g key={leg.key} mask={masked.includes(leg) ? `url(#${maskId(leg)})` : undefined}>
            <path d={pathOf(leg)} style={fixed} stroke={poster.paper} strokeWidth="7.5" strokeDasharray={`0.1 ${DOT_GAP - 0.1}`} />
            <path d={pathOf(leg)} style={fixed} stroke={poster.red} strokeWidth="4.5" strokeDasharray={`0.1 ${DOT_GAP - 0.1}`} />
          </g>
        ))}
      </g>
    </svg>
  );
});
