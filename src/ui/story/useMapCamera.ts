import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { clampCamera, panBy, pinchTo, zoomAt, lerpCamera, type Camera, type Frame } from './mapCamera';

/**
 * The story map's camera as a tiny external store, plus the gestures that
 * drive it: drag to pan, wheel / trackpad pinch to zoom at the cursor,
 * two-finger pinch on touch, and eased flights for the buttons.
 *
 * The camera deliberately lives OUTSIDE React state. The screen that owns the
 * hook (and the panels docked on it) never re-renders while the map moves;
 * only the few components that draw from the camera subscribe (useCamera).
 * The same store holds `raster`: the px-per-unit the sheet is laid out at,
 * committed to the live zoom once the camera has rested, so the map is crisp
 * at rest and only transformed — never re-laid-out — while moving.
 */

export interface MapCamera {
  frame: Frame;
  get: () => Camera;
  /** px per map unit the sheet is laid out at; equals the camera's s at rest. */
  getRaster: () => number;
  /** Where the camera is headed: the end of the current flight, or here. */
  dest: () => Camera;
  subscribe: (fn: () => void) => () => void;
  jump: (cam: Camera) => void;
  flyTo: (cam: Camera, ms?: number) => void;
  /** Animated zoom about the viewport centre (the +/− buttons). */
  zoomBy: (factor: number) => void;
  /** Callback ref for the element that takes the gestures. */
  viewportRef: (el: HTMLDivElement | null) => void;
}

interface Options {
  /** Gestures on (off behind the intro / ending sheets). */
  enabled: boolean;
  /** Jump instead of flying. */
  reduced: boolean;
  /** The opening camera, given the viewport. Read once. */
  initial: (frame: Frame) => Camera;
  /** A tap (not a drag) on the map itself, not on a stop. */
  onTapEmpty?: () => void;
}

/** A press that travels further than this is a pan, not a tap on a stop. */
const DRAG_THRESHOLD = 4;
/** How long the camera must rest before the sheet is re-laid-out at its zoom.
 *  The re-layout stalls the main thread, so this must outlast the gap between
 *  two notches of a mouse wheel turned at an ordinary pace (~150-250ms) —
 *  otherwise the stall lands mid-zoom instead of after it. */
const RASTER_COMMIT_MS = 320;
export const FLY_MS = 450;

const readFrame = (): Frame => ({ w: window.innerWidth, h: window.innerHeight });
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function useMapCamera({ enabled, reduced, initial, onTapEmpty }: Options): MapCamera {
  const [frame, setFrame] = useState<Frame>(readFrame);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const camRef = useRef<Camera | null>(null);
  if (!camRef.current) camRef.current = clampCamera(initial(frame), frame);
  const rasterRef = useRef(camRef.current.s);

  const listeners = useRef(new Set<() => void>());
  const flight = useRef<{ raf: number; to: Camera } | null>(null);
  const commitTimer = useRef(0);
  /** Fingers or buttons down on the map. A hand on the map can move it at any
   *  moment, so the sheet is never re-laid-out while one is there. */
  const held = useRef(0);

  // Options the native listeners read without being re-attached.
  const opts = useRef({ enabled, reduced, onTapEmpty });
  opts.current = { enabled, reduced, onTapEmpty };

  /** Re-lay the sheet out at the live zoom once the camera has rested (and
   *  nothing is holding it); every move restarts the wait. */
  const scheduleCommit = useCallback(() => {
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      if (held.current > 0 || rasterRef.current === camRef.current!.s) return;
      rasterRef.current = camRef.current!.s;
      listeners.current.forEach((fn) => fn());
    }, RASTER_COMMIT_MS);
  }, []);

  const set = useCallback((cam: Camera) => {
    camRef.current = cam;
    listeners.current.forEach((fn) => fn());
    scheduleCommit();
  }, [scheduleCommit]);

  const stopFlight = useCallback(() => {
    if (flight.current) cancelAnimationFrame(flight.current.raf);
    flight.current = null;
  }, []);

  const flyTo = useCallback((target: Camera, ms = FLY_MS) => {
    const f = frameRef.current;
    const to = clampCamera(target, f);
    stopFlight();
    if (opts.current.reduced || ms <= 0) { set(to); return; }
    const from = camRef.current!;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      set(clampCamera(lerpCamera(from, to, ease(t)), frameRef.current));
      if (t < 1 && flight.current) flight.current.raf = requestAnimationFrame(step);
      else flight.current = null;
    };
    flight.current = { raf: requestAnimationFrame(step), to };
  }, [set, stopFlight]);

  // A resize or rotation keeps the view, re-clamped to the new viewport.
  useEffect(() => {
    const onResize = () => {
      const f = readFrame();
      setFrame(f);
      frameRef.current = f;
      stopFlight();
      set(clampCamera(camRef.current!, f));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [set, stopFlight]);

  useEffect(() => () => {
    stopFlight();
    window.clearTimeout(commitTimer.current);
  }, [stopFlight]);

  // ---- gestures -------------------------------------------------------------
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let down = { x: 0, y: 0 };
    let moved = false;
    let swallowClick = false;

    const onDown = (e: PointerEvent) => {
      if (!opts.current.enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stopFlight();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      held.current = pointers.size;
      if (pointers.size === 1) {
        down = { x: e.clientX, y: e.clientY };
        moved = false;
      } else {
        // A second finger makes it a pinch, never a tap.
        moved = true;
        for (const id of pointers.keys()) { try { el.setPointerCapture(id); } catch { /* gone */ } }
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const next = { x: e.clientX, y: e.clientY };
      const f = frameRef.current;
      if (pointers.size === 1) {
        if (!moved) {
          // Hold still until the press clearly travels, so a tap on a stop
          // still lands as a click; then pan the whole way from the press.
          if (Math.hypot(next.x - down.x, next.y - down.y) <= DRAG_THRESHOLD) return;
          moved = true;
          el.style.cursor = 'grabbing';
          try { el.setPointerCapture(e.pointerId); } catch { /* not active */ }
        }
        pointers.set(e.pointerId, next);
        set(panBy(camRef.current!, f, next.x - prev.x, next.y - prev.y));
        return;
      }
      const [a, b] = [...pointers.values()];
      const midA = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distA = Math.hypot(a.x - b.x, a.y - b.y);
      pointers.set(e.pointerId, next);
      const [c, d] = [...pointers.values()];
      const midB = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
      const distB = Math.hypot(c.x - d.x, c.y - d.y);
      set(pinchTo(camRef.current!, f, distA > 0 ? distB / distA : 1, midA, midB));
    };
    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      held.current = pointers.size;
      if (pointers.size > 0) return;
      // Let go: the commit that waited for the hand to lift can run now.
      scheduleCommit();
      el.style.cursor = '';
      if (moved) {
        // The click that ends a drag is not a press on whatever is under it.
        swallowClick = true;
        window.setTimeout(() => { swallowClick = false; }, 0);
      }
    };
    const onClickCapture = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (!opts.current.enabled) return;
      if ((e.target as Element).closest('button')) return;
      opts.current.onTapEmpty?.();
    };
    const onWheel = (e: WheelEvent) => {
      if (!opts.current.enabled) return;
      e.preventDefault();
      stopFlight();
      const f = frameRef.current;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? f.h : 1;
      const dy = Math.max(-240, Math.min(240, e.deltaY * unit));
      // A trackpad pinch arrives as ctrl+wheel with small deltas: steeper.
      const k = Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0025));
      set(zoomAt(camRef.current!, f, k, e.clientX, e.clientY));
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('click', onClick);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('click', onClick);
      el.removeEventListener('wheel', onWheel);
      held.current = 0;
    };
  }, [el, set, stopFlight, scheduleCommit]);

  const stable = useMemo(() => ({
    get: () => camRef.current!,
    getRaster: () => rasterRef.current,
    dest: () => flight.current?.to ?? camRef.current!,
    subscribe: (fn: () => void) => {
      listeners.current.add(fn);
      return () => { listeners.current.delete(fn); };
    },
    jump: (cam: Camera) => { stopFlight(); set(clampCamera(cam, frameRef.current)); },
    flyTo,
    zoomBy: (factor: number) => {
      const f = frameRef.current;
      flyTo(zoomAt(flight.current?.to ?? camRef.current!, f, factor, f.w / 2, f.h / 2), 260);
    },
    viewportRef: setEl,
  }), [flyTo, set, stopFlight]);

  return useMemo(() => ({ ...stable, frame }), [stable, frame]);
}

/** The live camera, for components that draw from it. */
export function useCamera(camera: MapCamera): Camera {
  return useSyncExternalStore(camera.subscribe, camera.get);
}

/** The zoom the sheet is currently laid out at. */
export function useRaster(camera: MapCamera): number {
  return useSyncExternalStore(camera.subscribe, camera.getRaster);
}
