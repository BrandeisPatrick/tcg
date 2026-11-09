/**
 * Whether the deck motion layer (DeckMotionLayer.tsx) puts up the batch
 * `planKey` now. When it does, the batch's pile ticks are scheduled here, and
 * the layer puts its flights and riffles in the air.
 *
 * A batch goes up once: its cards fly once and each pile ticks once for them.
 * `last` is the layer's memory of the batch it last put up, a ref, so it holds
 * through a remount that keeps the component's state. React may run the
 * layer's batch effect twice for one batch: StrictMode's development remount
 * replays a mount's effects (Fast Refresh does too), and the layer mounts on
 * the very render the opening's batch arrives, since the board shows only the
 * draft until the last pick. Put up twice, every flight and riffle of the
 * opening was in the air twice under one key, and each deck held every card
 * dealt twice.
 */
import type { PlayerID } from '@/engine/types';
import type { DeckMotionPlan } from './deckMotionPlan';
import type { PileTicker } from './pileTicker';

export function admitBatch(
  last: { current: number },
  planKey: number,
  plan: DeckMotionPlan,
  ticker: PileTicker,
  ownerOf: (pid: PlayerID) => 'you' | 'rival',
): boolean {
  if (planKey === 0 || (plan.flights.length === 0 && plan.riffles.length === 0 && plan.ticks.length === 0)) return false;
  if (planKey === last.current) return false;
  last.current = planKey;
  ticker.schedule(plan.ticks, ownerOf);
  return true;
}
