import { useEffect, useRef, useState } from 'react';

/**
 * Direction of a single value change — `'up'` for increases (heal / buff),
 * `'down'` for decreases (damage / debuff), `null` when no change is in
 * flight.
 */
export type TickDirection = 'up' | 'down' | null;

/**
 * Watch a numeric value and emit a transient direction signal for `ms`
 * milliseconds after every change. Caller renders an animation off the
 * signal — pulse + colour flash on the stat number itself — then naturally
 * settles back to its steady-state appearance when the signal returns to
 * null.
 *
 * Replaces the floating ±N number system: HP and BP changes animate ON the
 * number on the card instead of as a separate floater layer.
 */
export function useStatTick(value: number, ms = 600): TickDirection {
  const [tick, setTick] = useState<TickDirection>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    const dir: TickDirection = value > prev.current ? 'up' : 'down';
    prev.current = value;
    setTick(dir);
    const t = setTimeout(() => setTick(null), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return tick;
}
