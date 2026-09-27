/**
 * Impulses — the moment a blow lands on a card, the tile itself should take
 * it: lurch away from the shot, shudder on a kill, lift on a heal. The FX
 * layer and the combat choreographer know WHEN and from WHERE an impact
 * lands; HeroSlot owns the tile. This bus joins them without either side
 * knowing the other's render tree: the players emit one impulse per card at
 * the impact beat, the tile subscribes by its iid and runs the kick.
 *
 * `kickFor` is pure so the shapes can be pinned by tests and tuned in one
 * place.
 */
import { createContext, useContext, useEffect, useRef } from 'react';

export type FxImpulseKind = 'hit' | 'ko' | 'heal' | 'shield';

export interface FxImpulse {
  kind: FxImpulseKind;
  /** Direction the blow travels (radians, from its source toward the card).
   *  Absent when it came from nowhere in particular — a tick, a curse. */
  angle?: number;
  /** 0..1 — how hard. */
  strength: number;
}

type Listener = (impulse: FxImpulse) => void;

export class FxImpulseBus {
  private listeners = new Map<string, Set<Listener>>();

  emit(iid: string, impulse: FxImpulse): void {
    this.listeners.get(iid)?.forEach((cb) => cb(impulse));
  }

  subscribe(iid: string, cb: Listener): () => void {
    let set = this.listeners.get(iid);
    if (!set) {
      set = new Set();
      this.listeners.set(iid, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.listeners.delete(iid);
    };
  }

  /** How many cards are listening. */
  get size(): number {
    return this.listeners.size;
  }
}

export const FxImpulseContext = createContext<FxImpulseBus | null>(null);

/** Run `onImpulse` whenever a blow lands on the card `iid`. */
export function useFxImpulse(iid: string, onImpulse: Listener): void {
  const bus = useContext(FxImpulseContext);
  const ref = useRef(onImpulse);
  ref.current = onImpulse;
  useEffect(() => bus?.subscribe(iid, (i) => ref.current(i)), [bus, iid]);
}

/** A hit's strength from the damage dealt: a graze nudges, a heavy blow shoves. */
export function hitStrength(amount: number): number {
  return Math.max(0.45, Math.min(1, 0.45 + amount * 0.11));
}

export interface Kick {
  /** Transform keyframes for the tile — every track returns to rest. */
  keyframes: { x: number[]; y: number[]; rotate: number[]; scale: number[] };
  /** Seconds. */
  duration: number;
}

// `|| 0` folds a -0 (a zero component along a negative axis) into +0.
const round = (v: number) => Math.round(v * 100) / 100 || 0;
const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

/** The tile's reaction to an impulse. A hit shoves the card along the blow
 *  and lets it spring back past rest; a kill shoves harder and twists; a
 *  heal lifts; a shield shivers in place. With no angle the blow comes
 *  straight on, so the card shudders sideways. */
export function kickFor(impulse: FxImpulse): Kick {
  const { kind, strength } = impulse;
  const a = impulse.angle;
  const ux = a == null ? 1 : Math.cos(a);
  const uy = a == null ? 0 : Math.sin(a);
  const along = (amp: number, profile: number[]) => ({
    x: profile.map((p) => round(ux * amp * p)),
    y: profile.map((p) => round(uy * amp * p)),
  });
  switch (kind) {
    case 'hit': {
      const { x, y } = along(5 + 6 * strength, [0, 1, -0.45, 0.2, -0.08, 0]);
      return { keyframes: { x, y, rotate: flat(6, 0), scale: flat(6, 1) }, duration: 0.42 };
    }
    case 'ko': {
      const { x, y } = along(9 + 7 * strength, [0, 1, -0.5, 0.3, -0.15, 0.05, 0]);
      const twist = ux >= 0 ? 1 : -1;
      return {
        keyframes: {
          x, y,
          rotate: [0, -2.4, 1.8, -1, 0.5, -0.2, 0].map((r) => round(r * twist)),
          scale: [1, 0.985, 1.01, 0.995, 1, 1, 1],
        },
        duration: 0.62,
      };
    }
    case 'heal':
      return { keyframes: { x: flat(4, 0), y: [0, -3, -1, 0], rotate: flat(4, 0), scale: [1, 1.03, 1.01, 1] }, duration: 0.45 };
    case 'shield':
      return { keyframes: { x: [0, -3, 3, -2, 1, 0], y: flat(6, 0), rotate: flat(6, 0), scale: flat(6, 1) }, duration: 0.3 };
  }
}
