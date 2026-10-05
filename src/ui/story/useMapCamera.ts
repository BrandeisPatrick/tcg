import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  clampCamera, panBy, pinchTo, zoomAt, toMap, lerpCamera, lerpCameraAbout,
  releaseVelocity, glideOffset, glideSpeed, FLING_MIN, GLIDE_STOP,
  type Camera, type Frame, type Sample,
} from './mapCamera';

/**
 * The story map's camera as a tiny external store, plus the gestures that
 * drive it: drag to pan (and throw — the map glides on and eases out), wheel
 * / trackpad pinch to zoom at the cursor, two-finger pinch on touch, a double
 * tap to zoom in about a point, and eased flights for the buttons.
 *
 * The camera deliberately lives OUTSIDE React, and while it moves React does
 * nothing at all. Input is only recorded as it arrives; once per animation
 * frame the camera takes it in and the painters (`paint`) write the new
 * transforms straight onto the few elements that carry the map. React hears
 * from the store (`subscribe`) only when the camera comes to REST: that is
 * when the sheet is re-laid-out at the zoom (`raster`, so it is crisp at rest
 * and only transformed — never re-laid-out — while moving) and the stops
 * settle their size and name tags.
 */

export interface Rest {
  /** The camera as it came to rest. */
  cam: Camera;
  /** px per map unit the sheet is laid out at — the rest camera's zoom. */
  raster: number;
}

/** Writes one frame of the camera onto the DOM. */
export type Painter = (cam: Camera, raster: number, frame: Frame) => void;

export interface MapCamera {
  frame: Frame;
  /** The live camera (it may be a frame ahead of the screen). */
  get: () => Camera;
  /** The camera as it last came to rest; a new object only then. */
  getRest: () => Rest;
  /** Where the camera is headed: the end of the current flight, or here. */
  dest: () => Camera;
  /** Told when the camera comes to rest — never once per frame. */
  subscribe: (fn: () => void) => () => void;
  /** Add a painter: called now, then once per animation frame in which the
   *  camera moved, and when it comes to rest. */
  paint: (fn: Painter) => () => void;
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
  /** Jump instead of flying; no glide after a throw. */
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
/** One zoom step: the +/− buttons and a double tap. */
export const ZOOM_STEP = 1.4;
/** Two taps on bare map this close in time (ms) and space (px) zoom in. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 28;
/** A press that lands on a glide still going faster than this (px/ms) only
 *  stops it — like a native list, the press is not also a tap. */
const CATCH_SPEED = 0.08;

const readFrame = (): Frame => ({ w: window.innerWidth, h: window.innerHeight });
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Flight = { t0: number; ms: number; from: Camera; to: Camera; about?: { x: number; y: number } };
type Glide = { t0: number; t: number; vx: number; vy: number };

export function useMapCamera({ enabled, reduced, initial, onTapEmpty }: Options): MapCamera {
  const [frame, setFrame] = useState<Frame>(readFrame);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const camRef = useRef<Camera | null>(null);
  if (!camRef.current) camRef.current = clampCamera(initial(frame), frame);
  const restRef = useRef<Rest | null>(null);
  if (!restRef.current) restRef.current = { cam: camRef.current, raster: camRef.current.s };

  const listeners = useRef(new Set<() => void>());
  const painters = useRef(new Set<Painter>());
  const flight = useRef<Flight | null>(null);
  const glide = useRef<Glide | null>(null);
  const commitTimer = useRef(0);
  const raf = useRef(0);
  /** The camera moved since the painters last ran. */
  const dirty = useRef(false);
  /** Fingers or buttons down on the map. A hand on the map can move it at any
   *  moment, so the sheet is never re-laid-out while one is there. */
  const held = useRef(0);
  /** The gesture handler's pending input, taken in once per frame. */
  const takeInput = useRef<() => void>(() => {});

  // Options the native listeners read without being re-attached.
  const opts = useRef({ enabled, reduced, onTapEmpty });
  opts.current = { enabled, reduced, onTapEmpty };

  const paintAll = useCallback(() => {
    dirty.current = false;
    const cam = camRef.current!, raster = restRef.current!.raster, f = frameRef.current;
    painters.current.forEach((fn) => fn(cam, raster, f));
  }, []);

  /** Re-lay the sheet out at the live zoom, and tell React, once the camera
   *  has rested (and nothing is holding or carrying it); every move restarts
   *  the wait. */
  const scheduleCommit = useCallback(() => {
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      if (held.current > 0 || flight.current || glide.current) return;
      const cam = camRef.current!;
      if (restRef.current!.cam === cam) return;
      restRef.current = { cam, raster: cam.s };
      // The new layout and its transform land in the same task as React's
      // re-render (a sync-lane update, flushed in a microtask): one frame.
      paintAll();
      listeners.current.forEach((fn) => fn());
    }, RASTER_COMMIT_MS);
  }, [paintAll]);

  // ---- the frame loop -------------------------------------------------------
  const tickRef = useRef<FrameRequestCallback>(() => {});
  const ticking = useRef(false);
  const requestFrame = useCallback(() => {
    if (!raf.current && !ticking.current) raf.current = requestAnimationFrame((now) => tickRef.current(now));
  }, []);

  /** Move the camera; the painters catch up on the next frame. */
  const move = useCallback((cam: Camera) => {
    camRef.current = cam;
    dirty.current = true;
    requestFrame();
    scheduleCommit();
  }, [requestFrame, scheduleCommit]);

  tickRef.current = (now) => {
    raf.current = 0;
    ticking.current = true;
    try { tick(now); } finally { ticking.current = false; }
  };
  const tick = (now: number) => {
    takeInput.current();
    let going = false;
    const f = frameRef.current;
    const fl = flight.current;
    if (fl) {
      const t = Math.min(1, Math.max(0, (now - fl.t0) / fl.ms));
      const e = ease(t);
      move(clampCamera(fl.about ? lerpCameraAbout(fl.from, fl.to, e, fl.about) : lerpCamera(fl.from, fl.to, e), f));
      if (t < 1) going = true;
      else flight.current = null;
    }
    const gl = glide.current;
    if (gl) {
      const t = Math.max(gl.t, now - gl.t0);
      const dx = glideOffset(gl.vx, t) - glideOffset(gl.vx, gl.t);
      const dy = glideOffset(gl.vy, t) - glideOffset(gl.vy, gl.t);
      gl.t = t;
      const from = camRef.current!;
      const to = panBy(from, f, dx, dy);
      // An edge stops the glide on that axis — no bounce, no pushing.
      if (Math.abs((from.cx - to.cx) * from.s - dx) > 0.01) gl.vx = 0;
      if (Math.abs((from.cy - to.cy) * from.s - dy) > 0.01) gl.vy = 0;
      if (to.cx !== from.cx || to.cy !== from.cy) move(to);
      if (Math.hypot(glideSpeed(gl.vx, t), glideSpeed(gl.vy, t)) > GLIDE_STOP) going = true;
      else { glide.current = null; scheduleCommit(); }
    }
    if (dirty.current) paintAll();
    ticking.current = false;
    if (going) requestFrame();
  };

  const stopFlight = useCallback(() => { flight.current = null; }, []);
  /** Stop a glide; true if it was still going at a clip. */
  const stopGlide = useCallback((): boolean => {
    const gl = glide.current;
    if (!gl) return false;
    glide.current = null;
    const t = performance.now() - gl.t0;
    return Math.hypot(glideSpeed(gl.vx, t), glideSpeed(gl.vy, t)) > CATCH_SPEED;
  }, []);

  const flyTo = useCallback((target: Camera, ms = FLY_MS, about?: { x: number; y: number }) => {
    const to = clampCamera(target, frameRef.current);
    stopFlight();
    stopGlide();
    if (opts.current.reduced || ms <= 0) { move(to); return; }
    flight.current = { t0: performance.now(), ms, from: camRef.current!, to, about };
    requestFrame();
  }, [move, requestFrame, stopFlight, stopGlide]);

  // A resize or rotation keeps the view, re-clamped to the new viewport.
  useEffect(() => {
    const onResize = () => {
      const f = readFrame();
      setFrame(f);
      frameRef.current = f;
      stopFlight();
      stopGlide();
      move(clampCamera(camRef.current!, f));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [move, stopFlight, stopGlide]);

  useEffect(() => () => {
    flight.current = null;
    glide.current = null;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    window.clearTimeout(commitTimer.current);
  }, []);

  // ---- gestures -------------------------------------------------------------
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) return;
    /** Where each pointer is now, and where it was when the camera last took
     *  it in: the camera moves by the difference, once a frame. */
    const pointers = new Map<number, { x: number; y: number }>();
    const applied = new Map<number, { x: number; y: number }>();
    let wheel: { k: number; x: number; y: number } | null = null;
    let down = { x: 0, y: 0 };
    let moved = false;
    /** This press caught a glide, or this gesture had two fingers: neither
     *  is a tap, and a pinch is never thrown. */
    let caught = false;
    let pinched = false;
    let swallowClick = false;
    /** The drag's recent path, for the speed of a throw. */
    let samples: Sample[] = [];
    let lastTap: { t: number; x: number; y: number } | null = null;

    const take = () => {
      const f = frameRef.current;
      let cam = camRef.current!;
      const before = cam;
      if (wheel) {
        cam = zoomAt(cam, f, wheel.k, wheel.x, wheel.y);
        wheel = null;
      }
      const ids = [...pointers.keys()];
      if (ids.length === 1 && moved) {
        const p = pointers.get(ids[0])!, a = applied.get(ids[0])!;
        if (p !== a) {
          cam = panBy(cam, f, p.x - a.x, p.y - a.y);
          applied.set(ids[0], p);
        }
      } else if (ids.length >= 2) {
        const [i, j] = ids;
        const a = applied.get(i)!, b = applied.get(j)!, c = pointers.get(i)!, d = pointers.get(j)!;
        if (a !== c || b !== d) {
          const midA = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const midB = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
          const distA = Math.hypot(a.x - b.x, a.y - b.y);
          const distB = Math.hypot(c.x - d.x, c.y - d.y);
          cam = pinchTo(cam, f, distA > 0 ? distB / distA : 1, midA, midB);
          applied.set(i, c);
          applied.set(j, d);
        }
      }
      if (cam !== before) move(cam);
    };
    takeInput.current = take;

    const onDown = (e: PointerEvent) => {
      if (!opts.current.enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      take();
      stopFlight();
      const p = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, p);
      applied.set(e.pointerId, p);
      held.current = pointers.size;
      if (pointers.size === 1) {
        down = p;
        moved = false;
        pinched = false;
        samples = [];
        // A touch stops a glide at once.
        caught = stopGlide();
      } else {
        // A second finger makes it a pinch, never a tap.
        moved = true;
        pinched = true;
        for (const id of pointers.keys()) { try { el.setPointerCapture(id); } catch { /* gone */ } }
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const next = { x: e.clientX, y: e.clientY };
      if (pointers.size === 1 && !moved) {
        // Hold still until the press clearly travels, so a tap on a stop
        // still lands as a click; then pan the whole way from the press.
        if (Math.hypot(next.x - down.x, next.y - down.y) <= DRAG_THRESHOLD) return;
        moved = true;
        // (An inherited style: it restyles the whole sheet, so only for a mouse.)
        if (e.pointerType === 'mouse') el.style.cursor = 'grabbing';
        try { el.setPointerCapture(e.pointerId); } catch { /* not active */ }
      }
      pointers.set(e.pointerId, next);
      if (pointers.size === 1) {
        samples.push({ t: e.timeStamp, ...next });
        if (samples.length > 24) samples.splice(0, samples.length - 24);
      }
      requestFrame();
    };
    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      take();
      pointers.delete(e.pointerId);
      applied.delete(e.pointerId);
      held.current = pointers.size;
      if (pointers.size > 0) return;
      // Let go: the commit that waited for the hand to lift can run now.
      scheduleCommit();
      if (el.style.cursor) el.style.cursor = '';
      if (moved || caught) {
        // The click that ends a drag is not a press on whatever is under it.
        swallowClick = true;
        window.setTimeout(() => { swallowClick = false; }, 0);
      }
      // A throw: the map carries on at the finger's speed and eases out.
      if (moved && !pinched && e.type === 'pointerup' && !opts.current.reduced) {
        const v = releaseVelocity(samples, e.timeStamp);
        if (Math.hypot(v.vx, v.vy) >= FLING_MIN) {
          glide.current = { t0: performance.now(), t: 0, vx: v.vx, vy: v.vy };
          requestFrame();
        }
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
      if ((e.target as Element).closest('button')) { lastTap = null; return; }
      opts.current.onTapEmpty?.();
      // The second tap of a double tap zooms in one step about that point.
      // The first has already done its work (deselect), so a lone tap is
      // never held back waiting to see whether another follows.
      const t = e.timeStamp;
      if (lastTap && t - lastTap.t <= DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) <= DOUBLE_TAP_PX) {
        lastTap = null;
        const f = frameRef.current, cam = camRef.current!;
        flyTo(zoomAt(cam, f, ZOOM_STEP, e.clientX, e.clientY), 300, toMap(cam, f, e.clientX, e.clientY));
      } else {
        lastTap = { t, x: e.clientX, y: e.clientY };
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!opts.current.enabled) return;
      e.preventDefault();
      stopFlight();
      stopGlide();
      const f = frameRef.current;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? f.h : 1;
      const dy = Math.max(-240, Math.min(240, e.deltaY * unit));
      // A trackpad pinch arrives as ctrl+wheel with small deltas: steeper.
      const k = Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0025));
      // Several notches in one frame (a trackpad sends many) make one step.
      wheel = { k: (wheel?.k ?? 1) * k, x: e.clientX, y: e.clientY };
      requestFrame();
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
      takeInput.current = () => {};
      held.current = 0;
    };
  }, [el, move, flyTo, requestFrame, stopFlight, stopGlide, scheduleCommit]);

  const stable = useMemo(() => ({
    get: () => camRef.current!,
    getRest: () => restRef.current!,
    dest: () => flight.current?.to ?? camRef.current!,
    subscribe: (fn: () => void) => {
      listeners.current.add(fn);
      return () => { listeners.current.delete(fn); };
    },
    paint: (fn: Painter) => {
      painters.current.add(fn);
      fn(camRef.current!, restRef.current!.raster, frameRef.current);
      return () => { painters.current.delete(fn); };
    },
    jump: (cam: Camera) => { stopFlight(); stopGlide(); move(clampCamera(cam, frameRef.current)); },
    flyTo: (cam: Camera, ms?: number) => flyTo(cam, ms),
    zoomBy: (factor: number) => {
      const f = frameRef.current;
      flyTo(zoomAt(flight.current?.to ?? camRef.current!, f, factor, f.w / 2, f.h / 2), 260);
    },
    viewportRef: setEl,
  }), [flyTo, move, stopFlight, stopGlide]);

  return useMemo(() => ({ ...stable, frame }), [stable, frame]);
}

/** The camera as it last came to rest, for components that draw from it:
 *  they re-render when the camera rests, never while it moves. */
export function useRest(camera: MapCamera): Rest {
  return useSyncExternalStore(camera.subscribe, camera.getRest);
}

/** The zoom the sheet is currently laid out at. */
export function useRaster(camera: MapCamera): number {
  return useSyncExternalStore(camera.subscribe, () => camera.getRest().raster);
}
