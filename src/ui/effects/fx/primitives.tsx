/**
 * The FX layer's drawing vocabulary — flat, printed, in the poster idiom:
 * washes and rings clipped to a card, motes and stickers spilling past it,
 * bolts and tracers drawn between cards. Everything is framer-motion driven
 * (no CSS animations) so the QA virtual clock can step it, and every delay
 * is given in milliseconds from the batch start.
 */
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { fonts } from '../../tokens';
import { poster, chamfer, clipBoth } from '../../poster';
import { FX_INK } from './fxCatalog';
import { type Pt, type Rect, angleOf, curvePath, dist, jaggedPath, seeded } from './geometry';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const sec = (ms: number) => Math.max(0, ms) / 1000;

const fixedBox = (r: Rect, z: number): CSSProperties => ({
  position: 'fixed', left: r.left, top: r.top, width: r.width, height: r.height,
  pointerEvents: 'none', zIndex: z,
});

/** A fixed box over a card's viewport rect. `clip` keeps children inside the
 *  card's rounded silhouette (washes, holes, drips); unclipped for anything
 *  that should spill past the frame (motes, rings, stickers). */
export function Fixed({ rect, clip = false, radius = 10, z = 80, children, style }: {
  rect: Rect; clip?: boolean; radius?: number; z?: number; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <div aria-hidden style={{
      ...fixedBox(rect, z),
      overflow: clip ? 'hidden' : 'visible',
      borderRadius: clip ? radius : undefined,
      isolation: clip ? 'isolate' : undefined,
      ...style,
    }}>
      {children}
    </div>
  );
}

/** A colour overprint that snaps in, holds, then fades. */
export function Wash({ color, peak = 0.6, at = 0, dur = 900, radial = false, holdFrac = 0.55 }: {
  color: string; peak?: number; at?: number; dur?: number; radial?: boolean; holdFrac?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, peak, peak * 0.92, 0] }}
      transition={{ duration: sec(dur), delay: sec(at), ease: EASE_OUT, times: [0, 0.07, holdFrac, 1] }}
      style={{
        position: 'absolute', inset: 0, borderRadius: 'inherit',
        background: radial
          ? `radial-gradient(ellipse at center, ${color}, ${color} 45%, transparent 100%)`
          : color,
      }}
    />
  );
}

/** An expanding ring centred at (cx, cy) of its positioned parent. */
export function Ring({ cx = '50%', cy = '50%', size, color, at = 0, dur = 520, from = 0.3, to = 1.6, width = 3, peak = 0.9, dashed = false }: {
  cx?: number | string; cy?: number | string; size: number; color: string;
  at?: number; dur?: number; from?: number; to?: number; width?: number; peak?: number; dashed?: boolean;
}) {
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

export type MoteShape = 'star' | 'dot' | 'streak' | 'shard' | 'cross';

function moteStyle(shape: MoteShape, color: string): CSSProperties {
  switch (shape) {
    case 'star':   return { background: color, ...clipBoth('polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)') };
    case 'dot':    return { background: color, borderRadius: '50%' };
    case 'streak': return { background: color, borderRadius: 2 };
    case 'shard':  return { background: color, ...clipBoth('polygon(50% 0, 100% 100%, 0 100%)') };
    case 'cross':  return { background: color, ...clipBoth('polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%)') };
  }
}

/** Particles flung from `origin` (px in the parent). Every third mote prints
 *  in the `alt` ink. `angle` narrows the throw to a cone; `rise` lifts the
 *  whole cloud, `gravity` drops it. Seeded, so a re-render scatters the same. */
export function Motes({ origin, count, seed, color, alt = FX_INK.cream, shape = 'star', at = 0, dur = 600, spread = [30, 70], rise = 0, gravity = 0, size = 8, angle }: {
  origin: Pt; count: number; seed: number; color: string; alt?: string; shape?: MoteShape;
  at?: number; dur?: number; spread?: [number, number]; rise?: number; gravity?: number; size?: number;
  angle?: { center: number; span: number };
}) {
  const rng = seeded(seed);
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const a = angle ? angle.center + (rng() - 0.5) * angle.span : rng() * Math.PI * 2;
        const d = spread[0] + rng() * (spread[1] - spread[0]);
        const dx = Math.cos(a) * d;
        const dy = Math.sin(a) * d - rise;
        const s = size * (0.6 + rng() * 0.8);
        const col = i % 3 === 2 ? alt : color;
        const delay = at + rng() * 80;
        const isStreak = shape === 'streak';
        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: isStreak ? (a * 180) / Math.PI : 0 }}
            animate={{
              x: [0, dx * 0.7, dx],
              y: [0, dy * 0.7, dy + gravity],
              opacity: [0, 1, 1, 0],
              scale: [0.4, 1, 0.9, 0.5],
              rotate: isStreak ? (a * 180) / Math.PI : [0, 90 + rng() * 180],
            }}
            transition={{ duration: sec(dur), delay: sec(delay), ease: 'easeOut', times: [0, 0.2, 0.65, 1] }}
            style={{
              position: 'absolute',
              left: origin.x - s / 2, top: origin.y - s / 2,
              width: isStreak ? s * 2.4 : s,
              height: isStreak ? Math.max(2, s * 0.28) : s,
              ...moteStyle(shape, col),
            }}
          />
        );
      })}
    </>
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

/** A slapped-on sticker, centred at `top` of its positioned parent. */
export function Stamp({ text, at = 0, dur = 900, sticker = poster.ink, ink = poster.paper, fontSize = 13, rotate = -5, top = '50%', fill, z }: {
  text: string; at?: number; dur?: number; sticker?: string; ink?: string; fontSize?: number;
  rotate?: number; top?: string | number; fill?: string; z?: number;
}) {
  return (
    <div style={{ position: 'absolute', left: '50%', top, transform: 'translate(-50%, -50%)', zIndex: z }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.8, 1.06, 1, 1] }}
        transition={{ duration: sec(dur), delay: sec(at), times: [0, 0.12, 0.82, 1], ease: EASE_OUT }}
        style={{
          display: 'inline-block',
          padding: `${Math.round(fontSize * 0.3)}px ${Math.round(fontSize * 0.55)}px`,
          background: sticker,
          borderRadius: 3,
          rotate,
          boxShadow: '0 3px 8px rgba(0, 0, 0, 0.35)',
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

/** A small ink plate floating above a card — the caster's ability name. */
export function Plate({ text, keyline, at = 0, dur = 800, fontSize = 11 }: {
  text: string; keyline: string; at?: number; dur?: number; fontSize?: number;
}) {
  return (
    <div style={{ position: 'absolute', left: '50%', top: -10, transform: 'translate(-50%, -100%)' }}>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.9 }}
        animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -6], scale: [0.9, 1, 1, 1] }}
        transition={{ duration: sec(dur), delay: sec(at), times: [0, 0.15, 0.8, 1] }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '5px 10px 6px',
          background: poster.ink, color: poster.paper,
          border: `1.5px solid ${keyline}`,
          ...clipBoth(chamfer(4)),
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

/** A curved bolt drawn from `from` to `to` with a glowing head riding it. */
export function Bolt({ from, to, color, at = 0, dur = 340, width = 3, bulge = 0.18, head = true, alt = FX_INK.cream, z = 81, fade = 220 }: {
  from: Pt; to: Pt; color: string; at?: number; dur?: number; width?: number; bulge?: number;
  head?: boolean; alt?: string; z?: number; fade?: number;
}) {
  const { d, box } = curvePath(from, to, bulge);
  const total = dur + fade;
  const drawn = dur / total;
  const stroke = {
    initial: { pathLength: 0, opacity: 0 },
    transition: { duration: sec(total), delay: sec(at), times: [0, drawn, Math.min(1, drawn + 0.05), 1], ease: 'easeInOut' as const },
  };
  return (
    <div aria-hidden style={fixedBox(box, z)}>
      <svg width={box.width} height={box.height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <motion.path d={d} fill="none" stroke={poster.ink} strokeWidth={width + 2.5} strokeLinecap="round"
          initial={stroke.initial} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 0.5, 0.5, 0] }} transition={stroke.transition} />
        <motion.path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
          initial={stroke.initial} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 1, 1, 0] }} transition={stroke.transition} />
      </svg>
      {head && (
        <motion.div
          initial={{ offsetDistance: '0%', opacity: 0, scale: 0.6 }}
          animate={{ offsetDistance: ['0%', '100%'], opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.4] }}
          transition={{ duration: sec(dur + 80), delay: sec(at), ease: 'easeIn', times: [0, 0.1, 0.9, 1] }}
          style={{
            position: 'absolute', left: 0, top: 0, width: 14, height: 14, marginLeft: -7, marginTop: -7,
            offsetPath: `path('${d}')`, offsetRotate: '0deg',
            borderRadius: '50%', background: alt,
            boxShadow: `0 0 0 3px ${color}, 0 0 14px ${color}`,
          }}
        />
      )}
    </div>
  );
}

/** A jagged lightning arc with a flicker, plus a thinner branch. */
export function LightningArc({ from, to, at = 0, dur = 300, seed, color = FX_INK.lightning, z = 82 }: {
  from: Pt; to: Pt; at?: number; dur?: number; seed: number; color?: string; z?: number;
}) {
  const rng = seeded(seed);
  const main = jaggedPath(from, to, rng, 8, 0.12);
  // The branch forks from a point a third of the way along and dies out
  // sideways.
  const forkFrom = { x: from.x + (to.x - from.x) * 0.35, y: from.y + (to.y - from.y) * 0.35 };
  const side = angleOf(from, to) + (rng() > 0.5 ? 1 : -1) * 0.9;
  const forkTo = { x: forkFrom.x + Math.cos(side) * dist(from, to) * 0.3, y: forkFrom.y + Math.sin(side) * dist(from, to) * 0.3 };
  const branch = jaggedPath(forkFrom, forkTo, rng, 4, 0.18);
  const flicker = { opacity: [0, 1, 0.25, 1, 0.6, 0] };
  const tr = { duration: sec(dur), delay: sec(at), times: [0, 0.12, 0.3, 0.45, 0.75, 1] };
  return (
    <>
      <div aria-hidden style={fixedBox(main.box, z)}>
        <svg width={main.box.width} height={main.box.height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <motion.path d={main.d} fill="none" stroke={poster.ink} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" initial={{ opacity: 0 }} animate={flicker} transition={tr} />
          <motion.path d={main.d} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" initial={{ opacity: 0 }} animate={flicker} transition={tr} />
        </svg>
      </div>
      <div aria-hidden style={fixedBox(branch.box, z)}>
        <svg width={branch.box.width} height={branch.box.height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <motion.path d={branch.d} fill="none" stroke={poster.ink} strokeWidth={3} strokeLinejoin="round" initial={{ opacity: 0 }} animate={flicker} transition={{ ...tr, delay: sec(at + 40) }} />
          <motion.path d={branch.d} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" initial={{ opacity: 0 }} animate={flicker} transition={{ ...tr, delay: sec(at + 40) }} />
        </svg>
      </div>
    </>
  );
}

/** Gunfire: `rounds` short tracers leaving `from` for `to`, one after another. */
export function TracerVolley({ from, to, ink, at = 0, dur = 220, rounds = 3, gap = 55, z = 81 }: {
  from: Pt; to: Pt; ink: string; at?: number; dur?: number; rounds?: number; gap?: number; z?: number;
}) {
  const a = angleOf(from, to);
  const d = dist(from, to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(14, Math.min(30, d * 0.3));
  return (
    <>
      {Array.from({ length: rounds }, (_, i) => (
        <motion.div
          key={i}
          aria-hidden
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{ x: [0, dx], y: [0, dy], opacity: [0, 1, 1, 0] }}
          transition={{ duration: sec(dur), delay: sec(at + i * gap), ease: [0.3, 0.7, 0.5, 1], times: [0, 0.08, 0.85, 1] }}
          style={{
            position: 'fixed',
            left: from.x - len / 2, top: from.y - 1.5,
            width: len, height: 3, borderRadius: 2,
            rotate: `${a}rad`,
            background: `linear-gradient(90deg, transparent, ${ink} 40%, ${FX_INK.cream})`,
            boxShadow: `0 0 6px ${ink}`,
            pointerEvents: 'none', zIndex: z,
          }}
        />
      ))}
    </>
  );
}

/** A four-point flash with two puffs of smoke, at the muzzle. */
export function MuzzleFlash({ at: pt, angle, ink, atMs = 0, size = 36, z = 83 }: {
  at: Pt; angle: number; ink: string; atMs?: number; size?: number; z?: number;
}) {
  return (
    <div aria-hidden style={{ position: 'fixed', left: pt.x - size / 2, top: pt.y - size / 2, width: size, height: size, pointerEvents: 'none', zIndex: z }}>
      <motion.div
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 1.25, 0.9], opacity: [0, 1, 0] }}
        transition={{ duration: 0.2, delay: sec(atMs), times: [0, 0.35, 1] }}
        style={{ position: 'absolute', inset: 0, rotate: `${angle}rad` }}
      >
        <svg viewBox="0 0 40 40" width="100%" height="100%">
          <path d="M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z" fill={FX_INK.cream} stroke={poster.ink} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M20 12 L22 18 L28 20 L22 22 L20 28 L18 22 L12 20 L18 18 Z" fill={ink} />
        </svg>
      </motion.div>
      {[0, 1].map((i) => {
        const a = angle + (i ? 0.55 : -0.55);
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
            animate={{ opacity: [0, 0.6, 0], scale: [0.3, 1.4, 1.9], x: Math.cos(a) * 22, y: Math.sin(a) * 22 - 8 }}
            transition={{ duration: 0.5, delay: sec(atMs + 40), ease: 'easeOut' }}
            style={{ position: 'absolute', left: size / 2 - 7, top: size / 2 - 7, width: 14, height: 14, borderRadius: '50%', background: FX_INK.smoke }}
          />
        );
      })}
    </div>
  );
}

/** Motes streaming along an arc from `from` to `to` — lifesteal on its way home. */
export function DrainStream({ from, to, color, at = 0, dur = 320, count = 7, seed, z = 82 }: {
  from: Pt; to: Pt; color: string; at?: number; dur?: number; count?: number; seed: number; z?: number;
}) {
  const rng = seeded(seed);
  const { d, box } = curvePath(from, to, 0.22);
  return (
    <div aria-hidden style={fixedBox(box, z)}>
      {Array.from({ length: count }, (_, i) => {
        const s = 5 + rng() * 6;
        return (
          <motion.div
            key={i}
            initial={{ offsetDistance: '0%', opacity: 0, scale: 0.5 }}
            animate={{ offsetDistance: ['0%', '100%'], opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 0.3] }}
            transition={{ duration: sec(dur + 120), delay: sec(at + i * 45), ease: 'easeInOut', times: [0, 0.15, 0.85, 1] }}
            style={{
              position: 'absolute', left: 0, top: 0, width: s, height: s, marginLeft: -s / 2, marginTop: -s / 2,
              borderRadius: '50%', background: i % 3 === 1 ? FX_INK.cream : color,
              boxShadow: `0 0 8px ${color}`,
              offsetPath: `path('${d}')`, offsetRotate: '0deg',
            }}
          />
        );
      })}
    </div>
  );
}

/** A shockwave ring from `from` out to `radius`, with faint spokes fanned to
 *  each target — an area effect leaving its caster. */
export function AoeWave({ from, radius, color, at = 0, dur = 420, z = 79, spokes }: {
  from: Pt; radius: number; color: string; at?: number; dur?: number; z?: number; spokes?: Pt[];
}) {
  const size = radius * 2;
  return (
    <>
      <div aria-hidden style={{ position: 'fixed', left: from.x - radius, top: from.y - radius, width: size, height: size, pointerEvents: 'none', zIndex: z }}>
        <motion.div
          initial={{ scale: 0.05, opacity: 0 }}
          animate={{ scale: [0.05, 1], opacity: [0, 0.9, 0.7, 0] }}
          transition={{ duration: sec(dur + 150), delay: sec(at), ease: 'easeOut', times: [0, 0.15, 0.75, 1] }}
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${color}`, boxShadow: `inset 0 0 40px ${color}55, 0 0 24px ${color}66` }}
        />
        <motion.div
          initial={{ scale: 0.05, opacity: 0 }}
          animate={{ scale: [0.05, 0.9], opacity: [0, 0.35, 0] }}
          transition={{ duration: sec(dur + 100), delay: sec(at + 60), ease: 'easeOut' }}
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle, transparent 55%, ${color}55 80%, transparent 100%)` }}
        />
      </div>
      {spokes?.map((p, i) => (
        <Bolt key={i} from={from} to={p} color={color} at={at + 40} dur={Math.max(120, dur - 60)} width={2} head={false} bulge={0.08} z={z} />
      ))}
    </>
  );
}
