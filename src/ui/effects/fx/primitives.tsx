/**
 * The FX layer's drawing vocabulary. Two kinds of thing live here:
 *
 *   On the card — washes, rings, stickers, plates and numerals, printed flat
 *   in the poster idiom and clipped to (or pinned on) a card's rect. They
 *   are framer-motion driven DOM, and they carry the story of a hit on their
 *   own. Stickers and numerals come down from above the table: they slam
 *   onto the card rather than fade in.
 *
 *   In the air — bolts, gunfire, lifesteal, shockwaves. These render nothing
 *   themselves: they book entities on the FX stage (stage/), the canvas where
 *   things have height, cast shadows and fall back to the table.
 *
 * Every delay is given in milliseconds from the batch start. Under calm
 * motion (FxMotionContext) nothing flies — the stage books nothing, rings
 * and arcs render nothing, and the stickers land without the slam.
 */
import { createContext, useContext, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { animate, motion, type AnimationPlaybackControls } from 'framer-motion';
import { fonts } from '../../tokens';
import { poster, chamfer, clipBoth } from '../../poster';
import { FX_INK } from './fxCatalog';
import { TILT_PERSPECTIVE, fromHere, kickFor, useFxImpulse } from './FxImpulse';
import { useFxCalm } from './FxMotionContext';
import { type Pt, type Rect, angleOf, dist, jaggedPath, seeded } from './geometry';
import { useStage } from './stage/FxStage';
import { bolt, drainOrbs, lightningStrike, muzzleBlast, tracers, waveFront } from './stage/emitters';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const sec = (ms: number) => Math.max(0, ms) / 1000;

const fixedBox = (r: Rect, z: number): CSSProperties => ({
  position: 'fixed', left: r.left, top: r.top, width: r.width, height: r.height,
  pointerEvents: 'none', zIndex: z,
});

/** The card a subtree of effects is printed on. Its `Fixed` boxes ride that
 *  tile's kicks (FxImpulse), so a wash, a hole or a sticker stays on the card
 *  as a blow rocks it instead of hanging in the air where the card was. */
export const FxCardContext = createContext<string | null>(null);
const FxRidingContext = createContext(false);

/** A fixed box over a card's viewport rect. `clip` keeps children inside the
 *  card's rounded silhouette (washes, holes, drips); unclipped for anything
 *  that should spill past the frame (rings, stickers). Inside an
 *  FxCardContext the box moves with that card. */
export function Fixed({ rect, clip = false, radius = 10, z = 80, children, style }: {
  rect: Rect; clip?: boolean; radius?: number; z?: number; children: ReactNode; style?: CSSProperties;
}) {
  const iid = useContext(FxCardContext);
  const riding = useContext(FxRidingContext);
  const calm = useFxCalm();
  const ref = useRef<HTMLDivElement>(null);
  const kick = useRef<AnimationPlaybackControls | null>(null);
  useFxImpulse(iid ?? '', (impulse) => {
    const el = ref.current;
    if (!el || !iid || riding || calm) return;
    kick.current?.stop();
    const { keyframes, duration, times } = kickFor(impulse);
    kick.current = animate(el, fromHere(keyframes), { duration, times, ease: 'easeOut' });
  });
  useEffect(() => () => kick.current?.stop(), []);
  return (
    <div aria-hidden style={{ ...fixedBox(rect, z), perspective: TILT_PERSPECTIVE, ...style }}>
      <div ref={ref} style={{
        position: 'absolute', inset: 0,
        overflow: clip ? 'hidden' : 'visible',
        borderRadius: clip ? radius : undefined,
        isolation: clip ? 'isolate' : undefined,
      }}>
        <FxRidingContext.Provider value>{children}</FxRidingContext.Provider>
      </div>
    </div>
  );
}

/** A colour overprint that snaps in, holds, then fades. `radial` pools it
 *  round `origin` (a CSS position) like light off the impact rather than a
 *  flat sheet of ink. */
export function Wash({ color, peak = 0.6, at = 0, dur = 900, radial = false, holdFrac = 0.55, origin = 'center' }: {
  color: string; peak?: number; at?: number; dur?: number; radial?: boolean; holdFrac?: number; origin?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, peak, peak * 0.92, 0] }}
      transition={{ duration: sec(dur), delay: sec(at), ease: EASE_OUT, times: [0, 0.07, holdFrac, 1] }}
      style={{
        position: 'absolute', inset: 0, borderRadius: 'inherit',
        background: radial
          ? `radial-gradient(ellipse at ${origin}, ${color}, ${color} 38%, transparent 100%)`
          : color,
      }}
    />
  );
}

/** A band of light crossing the card along `angle` — the gloss a print
 *  shows as a blow rocks it. `reach` is the card's longer side in px. */
export function Sheen({ angle, reach, at = 0, dur = 420, peak = 0.5, color = FX_INK.cream }: {
  angle: number; reach: number; at?: number; dur?: number; peak?: number; color?: string;
}) {
  if (useFxCalm()) return null;
  const band = reach * 0.42;
  return (
    <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, rotate: `${angle}rad` }}>
      <motion.div
        initial={{ x: -reach, opacity: 0 }}
        animate={{ x: [-reach, reach], opacity: [0, peak, peak, 0] }}
        transition={{ duration: sec(dur), delay: sec(at), ease: 'easeOut', times: [0, 0.15, 0.7, 1] }}
        style={{
          position: 'absolute', left: -band / 2, top: -reach, width: band, height: reach * 2,
          background: `linear-gradient(90deg, transparent, ${color} 50%, transparent)`,
        }}
      />
    </div>
  );
}

/** An expanding ring centred at (cx, cy) of its positioned parent. */
export function Ring({ cx = '50%', cy = '50%', size, color, at = 0, dur = 520, from = 0.3, to = 1.6, width = 3, peak = 0.9, dashed = false }: {
  cx?: number | string; cy?: number | string; size: number; color: string;
  at?: number; dur?: number; from?: number; to?: number; width?: number; peak?: number; dashed?: boolean;
}) {
  if (useFxCalm()) return null;
  return (
    <motion.div
      initial={{ scale: from, opacity: 0 }}
      animate={{ scale: [from, to], opacity: [0, peak, 0] }}
      transition={{ duration: sec(dur), delay: sec(at), ease: 'easeOut', times: [0, 0.25, 1] }}
      style={{
        position: 'absolute', left: cx, top: cy, width: size, height: size,
        marginLeft: -size / 2, marginTop: -size / 2, borderRadius: '50%',
        border: `${width}px ${dashed ? 'dashed' : 'solid'} ${color}`,
      }}
    />
  );
}

/** A word charging with a second ink left→right inside the paper word —
 *  the K.O. sticker's fill bar. */
function FillWord({ word, fill, ink, at, dur }: { word: string; fill: string; ink: string; at: number; dur: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ color: ink }}>{word}</span>
      <motion.span
        initial={{ width: '0%' }}
        animate={{ width: '100%' }}
        transition={{ duration: sec(dur), delay: sec(at), ease: EASE_OUT }}
        style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          overflow: 'hidden', display: 'block',
          color: fill, borderRight: `2px solid ${fill}`,
        }}
      >
        <span style={{ whiteSpace: 'nowrap' }}>{word}</span>
      </motion.span>
    </span>
  );
}

/** A sticker slapped onto the card, centred at `top` of its positioned
 *  parent. It comes down from above the table — large, tipped toward the
 *  viewer, its shadow far below it — and lands with a squash. */
export function Stamp({ text, at = 0, dur = 900, sticker = poster.ink, ink = poster.paper, fontSize = 13, rotate = -5, top = '50%', fill, z }: {
  text: string; at?: number; dur?: number; sticker?: string; ink?: string; fontSize?: number;
  rotate?: number; top?: string | number; fill?: string; z?: number;
}) {
  const calm = useFxCalm();
  const landed = '0 3px 8px rgba(0, 0, 0, 0.35)';
  return (
    <div style={{ position: 'absolute', left: '50%', top, transform: 'translate(-50%, -50%)', zIndex: z }}>
      <motion.div
        initial={calm ? { opacity: 0, scale: 0.8 } : { opacity: 0, scale: 2.2, rotateX: 40 }}
        animate={calm
          ? { opacity: [0, 1, 1, 0], scale: [0.8, 1.06, 1, 1] }
          : {
            opacity: [0, 1, 1, 1, 0],
            scale: [2.2, 0.92, 1.04, 1, 1],
            rotateX: [40, -7, 0, 0, 0],
            boxShadow: ['0 26px 22px rgba(0, 0, 0, 0.22)', '0 1px 3px rgba(0, 0, 0, 0.5)', landed, landed, landed],
          }}
        transition={{ duration: sec(dur), delay: sec(at), times: calm ? [0, 0.12, 0.82, 1] : [0, 0.11, 0.19, 0.82, 1], ease: EASE_OUT }}
        style={{
          display: 'inline-block',
          padding: `${Math.round(fontSize * 0.3)}px ${Math.round(fontSize * 0.55)}px`,
          background: sticker,
          borderRadius: 3,
          rotate,
          transformPerspective: 520,
          boxShadow: landed,
          fontFamily: fonts.display, fontSize,
          letterSpacing: '0.1em', whiteSpace: 'nowrap', lineHeight: 1,
          textTransform: 'uppercase', color: ink,
        }}
      >
        {fill ? <FillWord word={text} fill={fill} ink={ink} at={at} dur={dur * 0.5} /> : text}
      </motion.div>
    </div>
  );
}

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Type size for the amount on a card of this width. */
export const numeralSize = (rect: Rect) => clampN(Math.round(rect.width * 0.2), 19, 42);

/** The amount, printed big at the impact — stencil digits in the effect's
 *  ink with a paper keyline and a hard ink drop. The digits fall onto the
 *  card from the viewer's side, bounce once, then drift up and fade.
 *  `index` fans several numerals on one card apart. Reads on any art; under
 *  reduced motion it only pops. */
export function Numeral({ text, ink, at = 0, dur = 900, size = 28, top = '30%', index = 0, drift = 24 }: {
  text: string; ink: string; at?: number; dur?: number; size?: number; top?: string; index?: number; drift?: number;
}) {
  const calm = useFxCalm();
  // Later numerals on the same card fan out to either side and land a beat
  // apart, so "−2" then "−3" never reads as "−23".
  const dx = (index % 2 ? 1 : -1) * Math.ceil(index / 2) * size * 1.5;
  const k = Math.max(1.2, size * 0.045);
  const keyline = poster.paper;
  const shadow = [
    `${-k}px ${-k}px 0 ${keyline}`, `${k}px ${-k}px 0 ${keyline}`, `${-k}px ${k}px 0 ${keyline}`, `${k}px ${k}px 0 ${keyline}`,
    `0 ${-k}px 0 ${keyline}`, `0 ${k}px 0 ${keyline}`, `${-k}px 0 0 ${keyline}`, `${k}px 0 0 ${keyline}`,
    `0 ${Math.max(2, Math.round(size * 0.11))}px 0 ${poster.ink}`,
  ].join(', ');
  return (
    <div style={{ position: 'absolute', left: `calc(50% + ${dx}px)`, top, transform: 'translate(-50%, -50%)' }}>
      <motion.div
        initial={calm ? { opacity: 0, scale: 0.5, y: 8 } : { opacity: 0, scale: 2.5, y: -10, rotateX: 48 }}
        animate={calm
          ? { opacity: [0, 1, 1, 0], scale: [0.5, 1.22, 1, 1], y: [8, -2, -drift * 0.55, -drift] }
          : {
            opacity: [0, 1, 1, 1, 0],
            scale: [2.5, 0.86, 1.12, 1, 1],
            y: [-10, 3, -4, -drift * 0.55, -drift],
            rotateX: [48, -12, 4, 0, 0],
          }}
        transition={{ duration: sec(dur), delay: sec(at + index * 160), times: calm ? [0, 0.14, 0.72, 1] : [0, 0.1, 0.19, 0.72, 1], ease: EASE_OUT }}
        style={{
          fontFamily: fonts.display, fontSize: size, lineHeight: 1, whiteSpace: 'nowrap',
          letterSpacing: '0.02em', color: ink, textShadow: shadow,
          transformPerspective: 420,
        }}
      >
        {text}
      </motion.div>
    </div>
  );
}

/** A small ink plate above a card — the caster's ability name. It swings up
 *  from flat against the table, hinged on its bottom edge. */
export function Plate({ text, keyline, at = 0, dur = 800, fontSize = 11 }: {
  text: string; keyline: string; at?: number; dur?: number; fontSize?: number;
}) {
  const calm = useFxCalm();
  return (
    <div style={{ position: 'absolute', left: '50%', top: -10, transform: 'translate(-50%, -100%)' }}>
      <motion.div
        initial={calm ? { opacity: 0, y: 8, scale: 0.9 } : { opacity: 0, y: 6, rotateX: -84 }}
        animate={calm
          ? { opacity: [0, 1, 1, 0], y: [8, 0, 0, -6], scale: [0.9, 1, 1, 1] }
          : { opacity: [0, 1, 1, 0], y: [6, 0, 0, -6], rotateX: [-84, 0, 0, 0] }}
        transition={{ duration: sec(dur), delay: sec(at), times: [0, 0.2, 0.8, 1], ease: EASE_OUT }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '5px 10px 6px',
          background: poster.ink, color: poster.paper,
          border: `1.5px solid ${keyline}`,
          ...clipBoth(chamfer(4)),
          transformPerspective: 380, transformOrigin: '50% 100%',
          fontFamily: fonts.display, fontSize,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          lineHeight: 1, whiteSpace: 'nowrap',
        }}
      >
        <span aria-hidden style={{ width: 6, height: 6, background: keyline, flexShrink: 0 }} />
        {text}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// In the air — booked on the FX stage.
// ---------------------------------------------------------------------------

/** A bolt thrown from `from` to `to`: it climbs toward the viewer at
 *  mid-flight, drags a comet tail and sheds embers, with its shadow running
 *  along the table beneath. `size` is the head's radius. */
export function Bolt({ from, to, color, at = 0, dur = 340, size = 9, bulge = 0.18, arc, embers, ease, alt = FX_INK.cream }: {
  from: Pt; to: Pt; color: string; at?: number; dur?: number; size?: number; bulge?: number;
  arc?: number; embers?: number; ease?: number; alt?: string;
}) {
  useStage((s) => s.at(at, (stage) => stage.add(bolt({ from, to, color, alt, dur, size, bulge, arc, embers, ease }))));
  return null;
}

/** A jagged lightning arc with a flicker and a thinner branch; where it
 *  grounds, the stage throws the flash, sparks and a scorch. */
export function LightningArc({ from, to, at = 0, dur = 300, seed, color = FX_INK.lightning, z = 82 }: {
  from: Pt; to: Pt; at?: number; dur?: number; seed: number; color?: string; z?: number;
}) {
  const calm = useFxCalm();
  const rng = seeded(seed);
  const main = jaggedPath(from, to, rng, 8, 0.12);
  useStage((s) => s.at(at + dur * 0.12, (stage) => stage.add(lightningStrike({ at: to, seed, color, density: stage.density }))));
  if (calm) return null;
  // The branch forks from a point a third of the way along and dies out
  // sideways.
  const forkFrom = { x: from.x + (to.x - from.x) * 0.35, y: from.y + (to.y - from.y) * 0.35 };
  const side = angleOf(from, to) + (rng() > 0.5 ? 1 : -1) * 0.9;
  const forkTo = { x: forkFrom.x + Math.cos(side) * dist(from, to) * 0.3, y: forkFrom.y + Math.sin(side) * dist(from, to) * 0.3 };
  const branch = jaggedPath(forkFrom, forkTo, rng, 4, 0.18);
  const flicker = { opacity: [0, 1, 0.25, 1, 0.6, 0] };
  const tr = { duration: sec(dur), delay: sec(at), times: [0, 0.12, 0.3, 0.45, 0.75, 1] };
  const glow = `drop-shadow(0 0 5px ${color})`;
  return (
    <>
      <div aria-hidden style={fixedBox(main.box, z)}>
        <svg width={main.box.width} height={main.box.height} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: glow }}>
          <motion.path d={main.d} fill="none" stroke={poster.ink} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" initial={{ opacity: 0 }} animate={flicker} transition={tr} />
          <motion.path d={main.d} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" initial={{ opacity: 0 }} animate={flicker} transition={tr} />
          <motion.path d={main.d} fill="none" stroke="#ffffff" strokeWidth={1.1} strokeLinejoin="round" strokeLinecap="round" initial={{ opacity: 0 }} animate={flicker} transition={tr} />
        </svg>
      </div>
      <div aria-hidden style={fixedBox(branch.box, z)}>
        <svg width={branch.box.width} height={branch.box.height} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: glow }}>
          <motion.path d={branch.d} fill="none" stroke={poster.ink} strokeWidth={3.4} strokeLinejoin="round" initial={{ opacity: 0 }} animate={flicker} transition={{ ...tr, delay: sec(at + 40) }} />
          <motion.path d={branch.d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" initial={{ opacity: 0 }} animate={flicker} transition={{ ...tr, delay: sec(at + 40) }} />
        </svg>
      </div>
    </>
  );
}

/** Gunfire from `from` at `to`: per round a muzzle flash, smoke and a brass
 *  casing thrown clear, and a tracer streaking over the table with its
 *  shadow under it. The last of `rounds` leaves `(rounds - 1) * gap` in. */
export function Gunfire({ from, to, ink, seed, at = 0, dur = 220, rounds = 3, gap = 55 }: {
  from: Pt; to: Pt; ink: string; seed: number; at?: number; dur?: number; rounds?: number; gap?: number;
}) {
  useStage((s) => s.at(at, (stage) => {
    stage.add(muzzleBlast({ at: from, dir: angleOf(from, to), ink, seed, rounds, gap, density: stage.density }));
    stage.add(tracers({ from, to, color: ink, seed: seed + 1, rounds, gap, dur }));
  }));
  return null;
}

/** Lifesteal on its way home: orbs strung along an arc from `from` to `to`. */
export function DrainStream({ from, to, color, at = 0, dur = 320, count = 6, seed }: {
  from: Pt; to: Pt; color: string; at?: number; dur?: number; count?: number; seed: number;
}) {
  useStage((s) => s.at(at, (stage) => stage.add(drainOrbs({ from, to, color, dur, seed, count }))));
  return null;
}

/** A shockwave rolling out from `from` to `radius` along the table, dust
 *  and sparks on its front, with a low fast bolt to each of `spokes` — an
 *  area effect leaving its caster. */
export function AoeWave({ from, radius, color, at = 0, dur = 420, seed = 1, spokes }: {
  from: Pt; radius: number; color: string; at?: number; dur?: number; seed?: number; spokes?: Pt[];
}) {
  useStage((s) => s.at(at, (stage) => {
    stage.add(waveFront({ at: from, radius, color, dur, seed, density: stage.density }));
    for (const p of spokes ?? []) {
      stage.add(bolt({ from, to: p, color, dur: Math.max(120, dur - 60), size: 4.5, bulge: 0.08, arc: 34, embers: 40, ease: 1.2, delay: 40 }));
    }
  }));
  return null;
}
