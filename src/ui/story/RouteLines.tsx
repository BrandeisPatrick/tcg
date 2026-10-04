import { memo } from 'react';
import type { StoryRun, StoryNode } from '@/story/types';
import { stopState } from '@/story/describe';
import { poster } from '../poster';
import { MAP_W, MAP_H, type Camera, type Frame } from './mapCamera';

/**
 * The campaign routes, drawn in SCREEN space over the transformed sheet so
 * their weight never scales with the zoom. Each route is one smooth curve
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

export const RouteLines = memo(function RouteLines({
  run, legs, cam, frame, drawIn, calm,
}: {
  run: StoryRun;
  legs: Leg[];
  cam: Camera;
  frame: Frame;
  /** Legs that draw themselves in (the ones a cleared stop just opened). */
  drawIn: ReadonlySet<string>;
  calm: boolean;
}) {
  const sx = (v: V) => ((v.x - cam.cx) * cam.s + frame.w / 2).toFixed(1);
  const sy = (v: V) => ((v.y - cam.cy) * cam.s + frame.h / 2).toFixed(1);
  const d = (leg: Leg) => {
    const [a, b, c, e] = leg.p;
    return `M${sx(a)} ${sy(a)}C${sx(b)} ${sy(b)} ${sx(c)} ${sy(c)} ${sx(e)} ${sy(e)}`;
  };
  const by: Record<LegState, Leg[]> = { travelled: [], open: [], locked: [] };
  for (const leg of legs) by[legState(run, leg)].push(leg);
  const masked = by.open.filter((l) => drawIn.has(l.key) && !calm);

  return (
    <svg aria-hidden width={frame.w} height={frame.h}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
      {masked.length > 0 && (
        <defs>
          {masked.map((leg) => (
            // A stroke that reveals the leg end to end; pathLength 1 makes the
            // dash offset a 0→1 progress whatever the leg's length on screen.
            <mask key={leg.key} id={maskId(leg)} maskUnits="userSpaceOnUse"
              x={-frame.w} y={-frame.h} width={frame.w * 3} height={frame.h * 3}>
              <path d={d(leg)} fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round"
                pathLength={1} strokeDasharray="1 1"
                style={{ strokeDashoffset: 1, animation: 'story-draw 700ms 550ms cubic-bezier(0.3, 0, 0.2, 1) forwards' }} />
            </mask>
          ))}
        </defs>
      )}

      <g fill="none" strokeLinecap="round">
        {by.locked.map((leg) => (
          <g key={leg.key}>
            <path d={d(leg)} stroke={LOCKED_CASING} strokeWidth="3.5" />
            <path d={d(leg)} stroke={LOCKED_INK} strokeWidth="1.4" strokeDasharray="5 6" />
          </g>
        ))}
        {by.travelled.map((leg) => (
          <g key={leg.key}>
            <path d={d(leg)} stroke={poster.ink} strokeWidth="6" />
            <path d={d(leg)} stroke={poster.gold} strokeWidth="3" />
          </g>
        ))}
        {by.open.map((leg) => (
          <g key={leg.key} mask={masked.includes(leg) ? `url(#${maskId(leg)})` : undefined}>
            <path d={d(leg)} stroke={poster.paper} strokeWidth="7.5" strokeDasharray={`0.1 ${DOT_GAP - 0.1}`} />
            <path d={d(leg)} stroke={poster.red} strokeWidth="4.5" strokeDasharray={`0.1 ${DOT_GAP - 0.1}`} />
          </g>
        ))}
      </g>
    </svg>
  );
});
