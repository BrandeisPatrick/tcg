/**
 * The print breaks. Two effects here take the card itself apart rather than
 * drawing damage over it: a kill shatters it (ShatterPieces), and a pure hit
 * tears it in two for a moment (TearHalves). Both work on still clones of
 * the live tile, clipped to their piece and moved in 3D.
 *
 * On a kill the card comes apart — not a drawing of
 * a crack over it. `planShatter` (shatterPlan.ts) cuts the card's rect into
 * shards along cracks radiating from the impact point; `ShatterPieces`
 * clones the live tile once per shard, clips each clone to its shard, and
 * throws the shards off the table: outward from the impact, up toward the
 * viewer, tumbling, then falling away. Underneath, a dark backing stands in
 * for the emptied frame until the tile has taken on its corpse look.
 *
 * The shards tile the rect exactly, so the instant before they move the
 * clones are indistinguishable from the tile they cover.
 */
import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { poster } from '../../poster';
import { FX_INK } from './fxCatalog';
import { useFxCalm } from './FxMotionContext';
import { type Pt, type Rect, seeded } from './geometry';
import { EASE_OUT, Fixed, sec } from './primitives';
import { planShatter } from './shatterPlan';

/** A still copy of the live tile, laid out at its own size and scaled to the
 *  rect it was measured at (the board is fit-scaled; the rect is not). */
function cloneTile(source: HTMLElement, rect: Rect): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const w = source.offsetWidth || rect.width;
  const h = source.offsetHeight || rect.height;
  clone.setAttribute('aria-hidden', 'true');
  clone.removeAttribute('aria-label');
  clone.tabIndex = -1;
  Object.assign(clone.style, {
    position: 'absolute', left: '0', top: '0', width: `${w}px`, height: `${h}px`, margin: '0',
    transformOrigin: '0 0', transform: `scale(${rect.width / w}, ${rect.height / h})`,
    boxShadow: 'none', pointerEvents: 'none',
  });
  // The portraits are lazy, async-decoded images: a clone must paint on its
  // first frame or the shards would fly off blank.
  clone.querySelectorAll('img').forEach((img) => { img.loading = 'eager'; img.decoding = 'sync'; });
  return clone;
}

/** The card's cracks racing out from the impact, then the card thrown apart
 *  along them. `at` is when the print breaks; the cracks lead it by `crack`. */
export function ShatterPieces({ rect, source, at, seed, crack = 180, hold = 1200, dir, z = 84 }: {
  rect: Rect;
  /** The live tile to cut up; without one only the cracks and backing draw. */
  source?: HTMLElement | null;
  at: number;
  seed: number;
  crack?: number;
  hold?: number;
  /** The killing blow's direction — the shards are thrown that way. */
  dir?: number;
  z?: number;
}) {
  const calm = useFxCalm();
  const plan = planShatter(rect.width, rect.height, seed);
  const rng = seeded(seed + 101);
  const mount = useCallback((node: HTMLDivElement | null) => {
    if (node && source && !node.firstChild) node.appendChild(cloneTile(source, rect));
  }, [source, rect]);
  const reach = Math.max(rect.width, rect.height);
  const fly = 760;
  const push = dir == null ? { x: 0, y: 0 } : { x: Math.cos(dir) * reach * 0.22, y: Math.sin(dir) * reach * 0.22 };

  return (
    <>
      {/* The cracks, drawn over the still-living print. */}
      <Fixed rect={rect} clip z={z}>
        <svg width={rect.width} height={rect.height} style={{ position: 'absolute', inset: 0 }}>
          {plan.cracks.map((d, i) => {
            const tr = { duration: sec(crack + 140), delay: sec(at - crack + (i % 4) * 14), times: [0, 0.55, 0.9, 1], ease: 'easeOut' as const };
            return (
              <g key={i}>
                <motion.path d={d} fill="none" stroke={poster.ink} strokeWidth={2.8} strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 1, 1, 0] }} transition={tr} />
                <motion.path d={d} fill="none" stroke={FX_INK.cream} strokeWidth={0.9} strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 0.9, 0.9, 0] }} transition={tr} />
              </g>
            );
          })}
        </svg>
      </Fixed>

      {/* The emptied frame — dark, lit wine from the impact — standing in
          until the tile underneath has turned. */}
      <Fixed rect={rect} clip z={z}>
        <motion.div
          data-fx-backing
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0, 0] }}
          transition={{ duration: sec(hold), delay: sec(at), times: [0, 0.01, 0.5, 0.8, 1], ease: 'linear' }}
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse at ${plan.impact.x}px ${plan.impact.y}px, ${FX_INK.ko}, #1c1210 55%, #0c0a09 100%)`,
            boxShadow: 'inset 0 0 0 2px rgba(0, 0, 0, 0.6), inset 0 10px 26px rgba(0, 0, 0, 0.7)',
          }}
        />
      </Fixed>

      {/* The shards. Under calm motion the print does not fly: the backing
          and the K.O. sticker tell it. */}
      {source && !calm && (
        <Fixed rect={rect} z={z + 1}>
          {plan.shards.map((s, i) => {
            const ox = s.centroid.x - plan.impact.x;
            const oy = s.centroid.y - plan.impact.y;
            const d = Math.hypot(ox, oy) || 1;
            // Thrown out from the impact (and along the blow), up at the
            // viewer, then down the screen as it falls away.
            const out = reach * (s.inner ? 0.55 + rng() * 0.5 : 0.3 + rng() * 0.4);
            const x = (ox / d) * out + push.x;
            const y = (oy / d) * out + push.y;
            const up = (s.inner ? 150 : 70) + rng() * 130;
            const fall = reach * (0.18 + rng() * 0.22);
            const rx = (rng() - 0.5) * (s.inner ? 320 : 170);
            const ry = (rng() - 0.5) * (s.inner ? 320 : 170);
            const rz = (rng() - 0.5) * 70;
            const delay = at + (s.inner ? 0 : 35) + rng() * 40;
            const clip = `polygon(${s.poly.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(', ')})`;
            return (
              <motion.div
                key={i}
                initial={{ x: 0, y: 0, z: 0, rotateX: 0, rotateY: 0, rotateZ: 0, opacity: 0 }}
                animate={{
                  x: [0, x * 0.72, x], y: [0, y * 0.72 - 8, y + fall], z: [0, up, up * 0.35],
                  rotateX: [0, rx * 0.6, rx], rotateY: [0, ry * 0.6, ry], rotateZ: [0, rz * 0.6, rz],
                  opacity: [0, 1, 1, 0],
                }}
                // Every shard is in place the instant the backing appears (a
                // delayed animation holds its first keyframe, so the clones
                // stay unseen until then); each starts moving a beat later,
                // the inner ones first.
                transition={{ duration: sec(fly), delay: sec(delay), times: [0, 0.45, 1], ease: EASE_OUT, opacity: { duration: sec(fly + 70), delay: sec(at), times: [0, 0.01, 0.62, 1], ease: 'linear' } }}
                style={{
                  position: 'absolute', left: 0, top: 0, width: rect.width, height: rect.height,
                  transformOrigin: `${s.centroid.x}px ${s.centroid.y}px`, transformPerspective: 900,
                }}
              >
                {/* A hard drop a few pixels under the shard — the card's thickness. */}
                <div style={{ position: 'absolute', inset: 0, transform: 'translate(2px, 4px)', background: 'rgba(0, 0, 0, 0.5)', clipPath: clip, WebkitClipPath: clip }} />
                <div ref={mount} style={{ position: 'absolute', inset: 0, clipPath: clip, WebkitClipPath: clip }} />
              </motion.div>
            );
          })}
        </Fixed>
      )}
    </>
  );
}

/** The print torn in two along `line` — a zigzag across the card, left edge
 *  to right, in the card's own pixels. Both halves are the card itself: they
 *  part, each curling up off the table along its torn edge, hang open over a
 *  dark gap for `open` ms, and close again. */
export function TearHalves({ rect, source, line, at, open = 460, z = 79 }: {
  rect: Rect; source?: HTMLElement | null; line: Pt[]; at: number; open?: number; z?: number;
}) {
  const calm = useFxCalm();
  const mount = useCallback((node: HTMLDivElement | null) => {
    if (node && source && !node.firstChild) node.appendChild(cloneTile(source, rect));
  }, [source, rect]);
  if (!source || calm) return null;
  const w = rect.width;
  const h = rect.height;
  const pts = line.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`);
  const halves = [
    { clip: `polygon(0px 0px, ${w}px 0px, ${[...pts].reverse().join(', ')})`, origin: '50% 0%', y: -h * 0.04, tip: 11 },
    { clip: `polygon(${pts.join(', ')}, ${w}px ${h}px, 0px ${h}px)`, origin: '50% 100%', y: h * 0.04, tip: -11 },
  ];
  const tr = { duration: sec(open), delay: sec(at) };
  return (
    <>
      <Fixed rect={rect} clip z={z}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ ...tr, times: [0, 0.02, 0.96, 1], ease: 'linear' }}
          style={{ position: 'absolute', inset: 0, background: '#0b0908' }}
        />
      </Fixed>
      <Fixed rect={rect} z={z}>
        {halves.map((half, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 0, rotateX: 0 }}
            animate={{ opacity: [0, 1, 1, 0], y: [0, half.y, half.y, 0], rotateX: [0, half.tip, half.tip, 0] }}
            transition={{ ...tr, times: [0, 0.2, 0.7, 1], ease: EASE_OUT, opacity: { ...tr, times: [0, 0.02, 0.96, 1], ease: 'linear' } }}
            style={{ position: 'absolute', inset: 0, transformOrigin: half.origin, transformPerspective: 700 }}
          >
            <div style={{ position: 'absolute', inset: 0, transform: 'translate(1px, 3px)', background: 'rgba(0, 0, 0, 0.5)', clipPath: half.clip, WebkitClipPath: half.clip }} />
            <div ref={mount} style={{ position: 'absolute', inset: 0, clipPath: half.clip, WebkitClipPath: half.clip }} />
          </motion.div>
        ))}
      </Fixed>
    </>
  );
}
