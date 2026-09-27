import { useEffect, useState } from 'react';

/**
 * Show a value late. When `value` changes and `delayMs` is positive, keep
 * returning the previous value for that long, then switch — so a hero's HP
 * number drops when the bolt lands on the card, not the instant the engine
 * resolved it a few hundred milliseconds earlier. `delayMs` is read at the
 * moment the value changes; changing it afterwards never disturbs a hold that
 * is already in progress, and a second change mid-hold simply re-aims the
 * hold at the newest value.
 *
 * The change is detected during render (React's "adjust state from a prior
 * render" pattern), so a zero-delay change never shows one stale frame.
 */
export function useDelayedValue<T>(value: T, delayMs: number): T {
  const [state, setState] = useState<{ shown: T; seen: T; until: number }>(
    () => ({ shown: value, seen: value, until: 0 }),
  );
  let shown = state.shown;
  if (!Object.is(value, state.seen)) {
    if (delayMs > 0) {
      setState({ shown: state.shown, seen: value, until: performance.now() + delayMs });
    } else {
      setState({ shown: value, seen: value, until: 0 });
      shown = value;
    }
  }
  useEffect(() => {
    if (Object.is(state.seen, state.shown)) return;
    const t = setTimeout(
      () => setState((s) => ({ ...s, shown: s.seen })),
      Math.max(0, state.until - performance.now()),
    );
    return () => clearTimeout(t);
  }, [state]);
  return shown;
}
