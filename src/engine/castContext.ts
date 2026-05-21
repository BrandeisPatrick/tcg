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

export type CastKind = 'skill' | 'attack' | 'spell' | 'ult' | 'proc';

interface CastFrame {
  source: CardInstance | null;
  kind: CastKind;
}

const stack: CastFrame[] = [];

export function pushCast(source: CardInstance | null, kind: CastKind) {
  stack.push({ source, kind });
}

export function popCast() {
  stack.pop();
}

export function currentCast(): CastFrame | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/** Wrap a function call in push/pop. Safe even if fn throws. */
export function withCast<T>(source: CardInstance | null, kind: CastKind, fn: () => T): T {
  pushCast(source, kind);
  try {
    return fn();
  } finally {
    popCast();
  }
}

/** Reset the entire stack (used by test helpers + game reset). */
export function resetCastContext() {
  stack.length = 0;
}
