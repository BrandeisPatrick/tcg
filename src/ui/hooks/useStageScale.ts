import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The scale that fits a fixed-size stage (BoardTable's STAGE) into a host
 * box, on both axes, never past `max`. The host is measured, not the window,
 * so a phone's toolbars, a split view and a rotation all re-fit the stage:
 * a ResizeObserver on the host, plus the window's resize and
 * orientationchange for browsers that report a rotation before the host's
 * box settles.
 */
export function useStageScale(w: number, h: number, max = 1.25) {
  const [scale, setScale] = useState(1);
  const host = useRef<HTMLDivElement | null>(null);
  const ro = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const el = host.current;
    if (!el) return;
    const availW = el.clientWidth;
    const availH = el.clientHeight;
    if (!availW || !availH) return;
    const next = Math.min(max, availW / w, availH / h);
    setScale((prev) => (Math.abs(prev - next) > 0.002 ? next : prev));
  }, [w, h, max]);

  const hostRef = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    host.current = el;
    if (!el || typeof ResizeObserver === 'undefined') { measure(); return; }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    ro.current = observer;
    measure();
  }, [measure]);

  useEffect(() => {
    const onChange = () => { measure(); requestAnimationFrame(measure); };
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    window.visualViewport?.addEventListener('resize', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
      window.visualViewport?.removeEventListener('resize', onChange);
      ro.current?.disconnect();
    };
  }, [measure]);

  return { hostRef, scale };
}
