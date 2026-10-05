import { useLayoutEffect, useRef } from 'react';
import { useReducedMotionConfig } from 'framer-motion';

/** One cycle of an ambient loop. */
export interface Loop {
  /** `transform` and `opacity` only — what the compositor can play alone.
   *  Evenly spaced unless a keyframe sets its `offset`. */
  keyframes: Keyframe[];
  /** One cycle, ms. A framer `repeatDelay` is a hold at the end of it. */
  duration: number;
  /** Each segment's easing, as framer's `ease` applied it. */
  easing: string;
}

/**
 * An ambient loop — something that moves forever while nothing is happening,
 * like the turn dial breathing — run as a Web Animation, which the compositor
 * plays by itself. framer-motion drives an infinite loop on `scale`, `x` or
 * `rotate` from JavaScript, so it woke the main thread every frame of a
 * screen the player was just sitting on.
 *
 * Kept to framer's behaviour, so swapping one for the other changes nothing
 * on screen:
 *  - it stops wherever framer's transform loops stop — reduced motion, from
 *    the in-app setting or the OS (MotionConfig) — and the element then rests
 *    on its own style, which callers set to the loop's last frame, as framer
 *    left it;
 *  - the pace a loop starts at is the pace it keeps: framer did not restart a
 *    loop for a new duration alone, and changing it mid-cycle would jump;
 *  - `settle` (ms): when the loop is switched off under a mounted element, it
 *    eases from wherever it was back to rest, as framer's own `animate`
 *    change did.
 *
 * Without WAAPI (the QA clock, ?vtclock=1, removes it to keep framer on its
 * steppable path) the loop simply holds still, as under reduced motion.
 */
export function useAmbientLoop<T extends Element>(loop: Loop | null, settle = 0) {
  const ref = useRef<T>(null);
  const still = useReducedMotionConfig();
  const on = loop && !still ? loop : null;
  // Read when a loop starts, not a reason to restart one.
  const pace = useRef(0);
  useLayoutEffect(() => { pace.current = on?.duration ?? 0; });
  const key = on ? JSON.stringify([on.keyframes, on.easing]) : null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !key || typeof el.animate !== 'function') return;
    const [keyframes, easing] = JSON.parse(key) as [Keyframe[], string];
    const run = el.animate(keyframes.map((k) => ({ easing, ...k })), { duration: pace.current, iterations: Infinity });
    return () => {
      if (settle > 0) {
        const props = [...new Set(keyframes.flatMap(Object.keys))].filter((p) => p !== 'offset' && p !== 'easing');
        const now = getComputedStyle(el);
        const from = Object.fromEntries(props.map((p) => [p, now.getPropertyValue(p)]));
        run.cancel();
        el.animate([from, {}], { duration: settle, easing: 'ease-out' });
      } else {
        run.cancel();
      }
    };
  }, [key, settle]);

  return ref;
}
