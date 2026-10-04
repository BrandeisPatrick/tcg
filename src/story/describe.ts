import type { CardId } from '@/engine/types';
import type { StoryRun, StoryNode, NodeKind } from './types';
import { REGIONS } from './campaign';
import { enemyRosterSize, enemyBuff, patronHpForDepth, nodeLabel } from './content';
import { isReachable } from './storyRun';

/**
 * What a stop on the story map IS, in words a panel can print: its route and
 * number, whether it is open, and — for a fight — how big and how hard. Pure
 * reads of a run, so the map, the stop card and the run panel all tell the
 * same story from one place.
 */

/** The shared origin's region tag (campaign.ts gives Battery Park 'start'). */
const START_REGION = 'start';
const START_ROUTE_NAME = 'The Battery';

/** A recruit stop with a full roster pays out a card instead, so it reads as
 *  a supply stop everywhere the player looks. */
export function effectiveKind(run: StoryRun, node: StoryNode): NodeKind {
  return node.kind === 'recruit' && run.heroes.length >= 4 ? 'supply' : node.kind;
}

export type StopState = 'cleared' | 'open' | 'locked';

export function stopState(run: StoryRun, node: StoryNode): StopState {
  if (run.clearedNodeIds.includes(node.id)) return 'cleared';
  return isReachable(run, node) ? 'open' : 'locked';
}

export interface StopFacts {
  node: StoryNode;
  kind: NodeKind;       // effective
  state: StopState;
  place: string;
  routeName: string;
  stopNumber: number;   // 1-based along its route; 0 for the shared start
  routeStops: number;   // stops on that route, start excluded
  combat: boolean;
  foes: number;         // 0 when not combat
  buff: { atk: number; hp: number };
  patronHp: number;     // K.O.s needed to win the stop; 0 when not combat
  leader?: CardId;
  lockedBy?: StoryNode;
}

const isCombat = (k: NodeKind) => k === 'battle' || k === 'elite' || k === 'boss';

/** A route's stops in order, the shared start left out. */
function routeStopsOf(run: StoryRun, region: string | undefined): StoryNode[] {
  if (!region || region === START_REGION) return [];
  return run.nodes.filter((n) => n.region === region).sort((a, b) => a.depth - b.depth);
}

/** The stop the player has to clear before this one opens: the EARLIEST
 *  uncleared stop on the way here, since that is the one they can act on
 *  (Times Square behind an uncleared Wall Street says "clear Wall Street",
 *  not "clear City Hall"). */
function blockerOf(run: StoryRun, node: StoryNode): StoryNode | undefined {
  let blocker: StoryNode | undefined;
  const seen = new Set<string>();
  let at: StoryNode | undefined = node;
  while (at && !seen.has(at.id)) {
    seen.add(at.id);
    const id: string = at.id;
    const parent = run.nodes.find((n) => n.next.includes(id));
    if (parent && !run.clearedNodeIds.includes(parent.id)) blocker = parent;
    at = parent;
  }
  return blocker;
}

export function stopFacts(run: StoryRun, node: StoryNode): StopFacts {
  const kind = effectiveKind(run, node);
  const state = stopState(run, node);
  const isStart = node.region === START_REGION;
  const route = REGIONS.find((r) => r.id === node.region);
  const stops = routeStopsOf(run, node.region);
  const combat = isCombat(kind);
  return {
    node,
    kind,
    state,
    place: node.name ?? nodeLabel(kind),
    routeName: isStart ? START_ROUTE_NAME : route?.name ?? '',
    stopNumber: isStart ? 0 : stops.findIndex((n) => n.id === node.id) + 1,
    routeStops: stops.length,
    combat,
    foes: combat ? enemyRosterSize(node.depth, node.kind) : 0,
    buff: combat ? enemyBuff(node.depth, node.kind) : { atk: 0, hp: 0 },
    patronHp: combat ? patronHpForDepth(node.depth) : 0,
    leader: node.enemy,
    lockedBy: state === 'locked' ? blockerOf(run, node) : undefined,
  };
}

export interface RouteProgress {
  id: string;
  name: string;
  stops: StoryNode[];     // in route order, shared start excluded
  cleared: number;
  boss: StoryNode;
  bossDown: boolean;
  next: StoryNode | null; // first uncleared stop; null when the route is done
  open: boolean;          // `next` is reachable right now
}

export function routeProgress(run: StoryRun): RouteProgress[] {
  const out: RouteProgress[] = [];
  for (const r of REGIONS) {
    const stops = routeStopsOf(run, r.id);
    if (!stops.length) continue;
    const boss = stops.find((n) => n.kind === 'boss') ?? stops[stops.length - 1];
    const next = stops.find((n) => !run.clearedNodeIds.includes(n.id)) ?? null;
    out.push({
      id: r.id,
      name: r.name,
      stops,
      cleared: stops.filter((n) => run.clearedNodeIds.includes(n.id)).length,
      boss,
      bossDown: run.clearedNodeIds.includes(boss.id),
      next,
      open: !!next && isReachable(run, next),
    });
  }
  return out;
}
