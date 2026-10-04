/**
 * Impulses — the moment a blow lands on a card, the tile itself should take
 * it. The tiles are cards lying on a table, so they move like cards: a hit
 * shoves one along the shot and rocks its far edge up off the paper, a kill
 * twists it, a shooter's card kicks back with every round, a caster's lifts
 * while it gathers power and slaps back down, and a shockwave passing under
 * a card bobs it. The FX layer and the combat choreographer know WHEN and
 * from WHERE; HeroSlot owns the tile. This bus joins them without either
 * side knowing the other's render tree: the players emit one impulse per
 * card at the beat, the tile subscribes by its iid and runs the kick.
 *
 * `kickFor` is pure so the shapes can be pinned by tests and tuned in one
 * place.
 */
import { createContext, useContext, useEffect, useRef } from 'react';

export type FxImpulseKind =
  | 'hit' | 'ko' | 'heal' | 'shield'
  | 'fire'    // this card is shooting: it kicks back with every round
  | 'cast'    // gathering power: lift off the table, hang, slap down
  | 'wave'    // a shockwave passing underneath
  | 'slam';   // something stamped onto the card

export interface FxImpulse {
  kind: FxImpulseKind;
  /** Direction the blow travels (radians, from its source toward the card);
   *  for 'fire', the direction of the shot. Absent when it came from nowhere
   *  in particular — a tick, a curse. */
  angle?: number;
  /** 0..1 — how hard. */
  strength: number;
  /** Seconds the kick should take, where the beat sets it (a cast's charge). */
  duration?: number;
  /** For 'fire': seconds the card is raised before the first round leaves,
   *  and seconds between rounds. */
  lead?: number;
  gap?: number;
}

type Listener = (impulse: FxImpulse) => void;

export class FxImpulseBus {
  private listeners = new Map<string, Set<Listener>>();

  emit(iid: string, impulse: FxImpulse): void {
    this.listeners.get(iid)?.forEach((cb) => cb(impulse));
  }

  /** Every card on the table at once — the whole table jumping. */
  emitAll(impulse: FxImpulse): void {
    this.listeners.forEach((set) => set.forEach((cb) => cb(impulse)));
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

/** How far the viewer sits from a tile when a kick tips it out of the table
 *  plane (CSS `perspective`, px). The tile's wrapper and the FX boxes
 *  printed on it share this, so a print tips exactly as its card does. */
export const TILT_PERSPECTIVE = 760;

/** The CSS variable a tile's drop shadow reads: 0 at rest on the table,
 *  1 at the top of a lift (see HeroSlot's TILE_SHADOW). */
export const LIFT_VAR = '--fx-lift';

export interface Kick {
  /** Transform keyframes for the tile — every track returns to rest.
   *  `rotateX` / `rotateY` tip the card out of the table plane (degrees). */
  keyframes: {
    x: number[]; y: number[]; rotate: number[]; scale: number[];
    rotateX: number[]; rotateY: number[];
    [LIFT_VAR]: number[];
  };
  /** Seconds. */
  duration: number;
  /** Keyframe offsets, 0..1; evenly spaced when absent. */
  times?: number[];
}

/** A kick's keyframes with every track starting from wherever the tile is
 *  now (`null` is "the current value" to the animator) — a second blow
 *  landing mid-kick takes over smoothly instead of snapping to rest first. */
export function fromHere(keyframes: Kick['keyframes']): Record<string, (number | null)[]> {
  return Object.fromEntries(Object.entries(keyframes).map(([k, v]) => [k, [null, ...v.slice(1)]]));
}

// `|| 0` folds a -0 (a zero component along a negative axis) into +0.
const round = (v: number) => Math.round(v * 100) / 100 || 0;
const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

/** The tile's reaction to an impulse. With no angle a blow comes straight
 *  down from the viewer's side, so the card is pressed into the table and
 *  shudders sideways instead of rocking. */
export function kickFor(impulse: FxImpulse): Kick {
  const { kind, strength } = impulse;
  const a = impulse.angle;
  const ux = a == null ? 1 : Math.cos(a);
  const uy = a == null ? 0 : Math.sin(a);
  const along = (amp: number, profile: number[]) => ({
    x: profile.map((p) => round(ux * amp * p)),
    y: profile.map((p) => round(uy * amp * p)),
  });
  // Rock about the axis across the blow: the edge the blow is heading for
  // comes up toward the viewer. (CSS: +rotateX lifts the bottom edge,
  // +rotateY sinks the right one.)
  const rock = (deg: number, profile: number[]) => (a == null
    ? { rotateX: flat(profile.length, 0), rotateY: flat(profile.length, 0) }
    : {
      rotateX: profile.map((p) => round(uy * deg * p)),
      rotateY: profile.map((p) => round(-ux * deg * p)),
    });
  switch (kind) {
    case 'hit': {
      const { x, y } = along(5 + 6 * strength, [0, 1, -0.45, 0.2, -0.08, 0]);
      return {
        keyframes: {
          x, y, rotate: flat(6, 0),
          scale: a == null ? [1, 0.965, 1.012, 0.997, 1, 1] : [1, 1.025, 0.995, 1.004, 1, 1],
          ...rock(8 + 10 * strength, [0, 1, -0.4, 0.16, 0, 0]),
          [LIFT_VAR]: a == null ? flat(6, 0) : [0, 0.5, 0.1, 0, 0, 0],
        },
        duration: 0.46,
      };
    }
    case 'ko': {
      const { x, y } = along(9 + 7 * strength, [0, 1, -0.5, 0.3, -0.15, 0.05, 0]);
      const twist = ux >= 0 ? 1 : -1;
      return {
        keyframes: {
          x, y,
          rotate: [0, -2.4, 1.8, -1, 0.5, -0.2, 0].map((r) => round(r * twist)),
          scale: [1, 1.04, 0.985, 1.01, 0.997, 1, 1],
          ...rock(20 + 6 * strength, [0, 1, -0.45, 0.22, -0.08, 0, 0]),
          [LIFT_VAR]: [0, 0.9, 0.2, 0.1, 0, 0, 0],
        },
        duration: 0.66,
      };
    }
    case 'heal':
      return {
        keyframes: {
          x: flat(4, 0), y: [0, -4, -1, 0], rotate: flat(4, 0), scale: [1, 1.05, 1.015, 1],
          rotateX: flat(4, 0), rotateY: flat(4, 0), [LIFT_VAR]: [0, 1, 0.3, 0],
        },
        duration: 0.5,
      };
    case 'shield':
      return {
        keyframes: {
          x: [0, -3, 3, -2, 1, 0], y: flat(6, 0), rotate: flat(6, 0), scale: flat(6, 1),
          rotateX: flat(6, 0), rotateY: [0, 5, -4, 2.5, -1, 0], [LIFT_VAR]: flat(6, 0),
        },
        duration: 0.32,
      };
    case 'fire': {
      // The card comes up off the table and draws back a touch, then three
      // rounds: back along the shot each time, the muzzle edge climbing.
      const lead = Math.max(0.03, impulse.lead ?? 0.03);
      const gap = Math.max(0.04, impulse.gap ?? 0.05);
      const total = lead + 2 * gap + 0.3;
      const t = (s: number) => Math.round((s / total) * 1000) / 1000;
      const { x, y } = along(4 + 4 * strength, [0, -0.25, -1, -0.4, -1, -0.4, -1, 0.18, 0]);
      return {
        keyframes: {
          x, y, rotate: flat(9, 0), scale: [1, 1.04, 1.03, 1.025, 1.03, 1.025, 1.03, 0.995, 1],
          ...rock(7 + 3 * strength, [0, -0.3, 1, 0.35, 1, 0.35, 1, -0.2, 0]),
          [LIFT_VAR]: [0, 0.7, 0.6, 0.5, 0.6, 0.5, 0.6, 0, 0],
        },
        duration: total,
        times: [0, t(lead * 0.85), t(lead + 0.025), t(lead + gap * 0.7), t(lead + gap + 0.025), t(lead + gap * 1.7), t(lead + 2 * gap + 0.025), t(lead + 2 * gap + 0.16), 1],
      };
    }
    case 'cast':
      return {
        keyframes: {
          x: flat(6, 0), y: [0, -5, -6, 1.5, 0, 0], rotate: flat(6, 0),
          scale: [1, 1.07 + 0.03 * strength, 1.08 + 0.03 * strength, 0.975, 1.006, 1],
          rotateX: [0, -5, -6, 2, 0, 0], rotateY: flat(6, 0),
          [LIFT_VAR]: [0, 0.9, 1, 0, 0, 0],
        },
        duration: impulse.duration ?? 0.5,
        times: [0, 0.32, 0.7, 0.82, 0.92, 1],
      };
    case 'wave': {
      const { x, y } = along(3 * strength, [0, 1, -0.25, 0]);
      return {
        keyframes: {
          x, y, rotate: flat(4, 0), scale: [1, 1 + 0.055 * strength, 0.992, 1],
          ...rock(9 * strength, [0, 1, -0.3, 0]),
          [LIFT_VAR]: [0, strength, 0.1, 0],
        },
        duration: 0.4,
      };
    }
    case 'slam':
      return {
        keyframes: {
          x: flat(4, 0), y: [0, 2.5 * strength, -0.5, 0], rotate: flat(4, 0), scale: [1, 1 - 0.04 * strength, 1.008, 1],
          rotateX: flat(4, 0), rotateY: flat(4, 0), [LIFT_VAR]: flat(4, 0),
        },
        duration: 0.26,
      };
  }
}
