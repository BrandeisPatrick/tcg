/**
 * The FX stage: one canvas over the whole viewport, a world of particles in
 * table space (sim.ts), and a frame loop that only runs while something is
 * in the air. The FX components stay declarative — a hit mounts, and through
 * `useStage` it books the bursts its beat needs ("sparks at the impact, the
 * shatter 140 ms later"); unmounting cancels whatever has not fired.
 *
 * The loop reads its time from requestAnimationFrame, so the QA virtual
 * clock steps it frame by frame with everything else. Under calm motion the
 * hook books nothing — sparks are exactly the "things that fly" a
 * reduced-motion player asked not to see.
 */
import { createContext, useContext, useEffect, useMemo, useRef, type DependencyList, type ReactNode } from 'react';
import { useFxCalm } from '../FxMotionContext';
import { type Bounds, boundsOf, paint } from './draw';
import { CAMERA_HEIGHT, type Camera, type Ent, type World, createWorld, step } from './sim';

/** A cue this late was booked for a frame that never came (a hidden tab
 *  stalls the loop) — playing it now would be a burst out of nowhere. */
const STALE_MS = 400;
const MAX_DPR = 2;
/** The longest step the world takes in one frame; a stall resumes in slow
 *  motion rather than teleporting everything to the floor. */
const MAX_DT = 0.05;

/** The canvas's layer: above every wash and sticker, below the numerals. */
export const STAGE_Z = 88;

interface Cue { due: number; fn: () => void; dead: boolean }

export class FxStageEngine {
  readonly world: World = createWorld();
  /** Thins bursts on small screens; emitters read it through `add`'s caller. */
  density = 1;
  private cues: Cue[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private cam: Camera = { cx: 0, cy: 0, f: CAMERA_HEIGHT };
  private raf = 0;
  private last = 0;
  /** What the last frame drew over (CSS px) — all the next one has to clear. */
  private painted: Bounds | null = null;
  private aimed = false;

  attach(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') ?? null;
    if (canvas) this.resize();
  }

  /** Match the backing store to the viewport. */
  resize = (): void => {
    const c = this.canvas;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = window.innerWidth;
    const h = window.innerHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.aimed) this.cam = { cx: w / 2, cy: h / 2, f: CAMERA_HEIGHT };
    this.painted = null;   // resizing the backing store wiped it
  };

  /** Hang the camera over `p` — the middle of the table, wherever the board
   *  sits in the viewport — so what flies up spreads evenly out from it. */
  lookAt(p: { x: number; y: number }): void {
    this.aimed = true;
    this.cam = { cx: p.x, cy: p.y, f: CAMERA_HEIGHT };
  }

  /** Run `fn` in `delayMs`, on the frame loop's clock. Returns a cancel. */
  cue(delayMs: number, fn: () => void): () => void {
    const cue: Cue = { due: performance.now() + Math.max(0, delayMs), fn, dead: false };
    this.cues.push(cue);
    this.wake();
    return () => { cue.dead = true; };
  }

  add(ents: Ent[]): void {
    for (const e of ents) this.world.ents.push(e);
    this.wake();
  }

  /** Drop everything — the stage is going away. */
  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.cues = [];
    this.world.ents = [];
    this.clear();
  }

  private wake(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private clear(): void {
    const b = this.painted;
    if (this.ctx && b) this.ctx.clearRect(b.x0 - 2, b.y0 - 2, b.x1 - b.x0 + 4, b.y1 - b.y0 + 4);
    this.painted = null;
  }

  private frame = (t: number): void => {
    this.raf = 0;
    const dt = this.last ? Math.min(MAX_DT, (t - this.last) / 1000) : 0;
    this.last = t;
    if (this.cues.length) {
      const due = this.cues.filter((c) => c.due <= t);
      if (due.length) {
        this.cues = this.cues.filter((c) => c.due > t);
        for (const c of due) if (!c.dead && t - c.due < STALE_MS) c.fn();
      }
    }
    step(this.world, dt);
    this.clear();
    if (this.ctx && this.world.ents.length) {
      paint(this.ctx, this.world, this.cam);
      this.painted = boundsOf(this.world, this.cam);
    }
    if (this.world.ents.length || this.cues.some((c) => !c.dead)) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.cues = [];
      this.last = 0;
    }
  };
}

const FxStageContext = createContext<FxStageEngine | null>(null);

/** Mounts the stage canvas and hands its engine to everything beneath. The
 *  canvas sits above the washes and stickers and below the amounts, so a
 *  spark never hides a number. */
export function FxStageProvider({ children, density = 1 }: { children: ReactNode; density?: number }) {
  const engine = useMemo(() => new FxStageEngine(), []);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { engine.density = density; }, [engine, density]);
  useEffect(() => {
    engine.attach(ref.current);
    window.addEventListener('resize', engine.resize);
    return () => {
      window.removeEventListener('resize', engine.resize);
      engine.dispose();
      engine.attach(null);
    };
  }, [engine]);
  return (
    <FxStageContext.Provider value={engine}>
      {children}
      <canvas
        ref={ref}
        aria-hidden
        data-fx-stage
        style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: STAGE_Z }}
      />
    </FxStageContext.Provider>
  );
}

/** The stage's engine, or null when nothing mounted one. */
export function useStageEngine(): FxStageEngine | null {
  return useContext(FxStageContext);
}

export interface StageScope {
  /** Book `fn` for `ms` after this component mounted. */
  at(ms: number, fn: (stage: FxStageEngine) => void): void;
}

/** Book stage cues for the life of the calling component. `setup` runs once
 *  on mount (and again if `deps` change); every cue it books is cancelled on
 *  unmount. Books nothing under calm motion or without a stage. */
export function useStage(setup: (scope: StageScope) => void, deps: DependencyList = []): void {
  const engine = useContext(FxStageContext);
  const calm = useFxCalm();
  useEffect(() => {
    if (!engine || calm) return;
    const cancels: (() => void)[] = [];
    setup({ at: (ms, fn) => { cancels.push(engine.cue(ms, () => fn(engine))); } });
    return () => cancels.forEach((c) => c());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, calm, ...deps]);
}
