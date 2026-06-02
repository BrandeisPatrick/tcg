import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Scale-to-fit on height. Returns callback refs for an outer container (the
 * available box) and an inner content stage, plus a `scale` factor that shrinks
 * the stage's natural height to fit the container. Never scales up past 1;
 * clamps down to `min`.
 *
 * Why: the battle stage is built from fixed-height rows (benches + duel) that
 * sum to ~1080px. On a laptop viewport shorter than that, a vertically-centered
 * stack overflows top and bottom equally — clipping the hand row off the bottom
 * of the screen. Scaling the whole stage keeps every row, including the hand,
 * on-screen and fully interactive.
 *
 * Callback refs (not object refs) are used deliberately: Board renders a
 * different branch during the pre-match draft, so the stage DOM mounts only
 * after the draft resolves. A callback ref fires exactly when each node mounts
 * or unmounts, so the observer attaches at the right moment regardless of which
 * branch rendered first — an effect keyed on stable deps would miss it.
 *
 * `offsetHeight` is unaffected by CSS transforms, so applying the returned
 * scale to the content does NOT feed back into the measurement — no loop.
 * Recomputes on viewport resize and whenever the stage's own height changes
 * (e.g. the hand grows or shrinks).
 */
export function useFitScale(min = 0.5) {
  const [scale, setScale] = useState(1);
  const containerEl = useRef<HTMLDivElement | null>(null);
  const contentEl = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const c = containerEl.current;
    const k = contentEl.current;
    if (!c || !k) return;
    const avail = c.clientHeight;
    const natural = k.offsetHeight; // layout height, transform-independent
    if (!avail || !natural) return;
    const next = Math.min(1, Math.max(min, avail / natural));
    // Ignore sub-pixel jitter so we don't churn renders during animations.
    setScale((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
  }, [min]);

  const attach = useCallback(() => {
    roRef.current?.disconnect();
    if (!containerEl.current || !contentEl.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(containerEl.current);
    ro.observe(contentEl.current);
    roRef.current = ro;
    measure();
  }, [measure]);

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    containerEl.current = el;
    attach();
  }, [attach]);

  const contentRef = useCallback((el: HTMLDivElement | null) => {
    contentEl.current = el;
    attach();
  }, [attach]);

  useEffect(() => () => roRef.current?.disconnect(), []);

  return { containerRef, contentRef, scale };
}
