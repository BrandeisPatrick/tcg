/**
 * Module-level "current cast" context. Set by the dispatcher (useSkill /
 * playCard / ult / attack) BEFORE invoking the ability's run() and cleared
 * AFTER it returns. Read by damageUnit / addStatus / healUnit so equipment
 * triggers (Mystic Burst, Suppressor, Reactive Barrier, etc.) can react to
 * "bearer's skill damaged X" / "bearer suffered CC" without every call site
 * having to plumb source + kind through their signature.
 *
 * JS is single-threaded; nesting is supported via a stack. Most cards push
 * once and pop once, but Echo Shard re-fires a skill mid-resolution so the
 * stack form is the safe path.
 */
import type { CardInstance } from './types';

type CastKind = 'skill' | 'attack' | 'spell' | 'ult' | 'proc';

interface CastFrame {
  source: CardInstance | null;
  kind: CastKind;
  /** An attack frame that is a Ricochet bounce, not the swing itself: damageUnit
   *  hands the attacker's on-attack gear `bounce: true`, so a heal or a chain
   *  that belongs to the swing stays out of it (actions/attack.ts). */
  bounce?: true;
}

/** What a frame says beyond its source and kind. */
interface CastOpts {
  bounce?: true;
}

const stack: CastFrame[] = [];

function pushCast(source: CardInstance | null, kind: CastKind, opts: CastOpts = {}) {
  stack.push(opts.bounce ? { source, kind, bounce: true } : { source, kind });
}

function popCast() {
  stack.pop();
}

export function currentCast(): CastFrame | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/** Wrap a function call in push/pop. Safe even if fn throws. */
export function withCast<T>(source: CardInstance | null, kind: CastKind, fn: () => T, opts?: CastOpts): T {
  pushCast(source, kind, opts);
  try {
    return fn();
  } finally {
    popCast();
  }
}


/** A cast frame is pushed and popped inside one synchronous call (try/finally),
 *  so none can be open when a new action begins. `perform` asserts that in dev:
 *  a leftover frame would silently mis-attribute everything the action does. */
export function assertNoCast(): void {
  if (import.meta.env?.DEV && stack.length > 0) {
    throw new Error(`cast frame left open (${stack[stack.length - 1].kind}) when a new action began`);
  }
}
