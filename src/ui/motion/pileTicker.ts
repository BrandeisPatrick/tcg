/**
 * The piles' counts ticking with the motion. The engine changes a pile's
 * count the instant it resolves; the board shows the old count until the
 * card's flight leaves or lands, then ticks. The ticker holds, per pile, the
 * deltas scheduled and not yet fired: a pile shows `actual - pending`.
 *
 * A draw's `-1` fires as the card leaves the deck (so the deck reads one more
 * until then); a discard's `+1` as it lands on the pile. The deltas of a plan
 * sum to the state change it animates, so once every tick has fired the pile
 * shows the engine's number — and with motion off nothing is scheduled, so it
 * shows it at once.
 */
import type { PileKind, PileTick } from './deckMotionPlan';

export type PileKey = `${PileKind}-${'you' | 'rival'}`;

export class PileTicker {
  private pending = new Map<PileKey, number>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private subs = new Set<() => void>();

  /** Hold `ticks` (ms from now) off the piles until each fires. */
  schedule(ticks: readonly PileTick[], ownerOf: (pid: PileTick['pid']) => 'you' | 'rival'): void {
    if (ticks.length === 0) return;
    for (const t of ticks) {
      const key: PileKey = `${t.pile}-${ownerOf(t.pid)}`;
      this.pending.set(key, (this.pending.get(key) ?? 0) + t.delta);
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        const left = (this.pending.get(key) ?? 0) - t.delta;
        if (left === 0) this.pending.delete(key);
        else this.pending.set(key, left);
        this.notify();
      }, Math.max(0, t.at));
      this.timers.add(timer);
    }
    this.notify();
  }

  /** The deltas not yet fired for a pile: what to take off its actual count. */
  pendingFor(key: PileKey): number {
    return this.pending.get(key) ?? 0;
  }

  subscribe = (cb: () => void): (() => void) => {
    this.subs.add(cb);
    return () => { this.subs.delete(cb); };
  };

  /** Drop every scheduled tick: the piles show their actual counts. */
  clear(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.pending.clear();
    this.notify();
  }

  private notify() {
    for (const cb of this.subs) cb();
  }
}
