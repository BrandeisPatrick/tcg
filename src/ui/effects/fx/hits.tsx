/**
 * "Card got hit" — one animation family per damage type, and a unique intro
 * for every tagged effect:
 *
 *   bullet  gunfire — muzzle flash, a tracer volley, holes punched into the
 *           print one after another, sparks flying off the far side
 *   spirit  arcane — a plum overprint, rings, the spirit rune popping,
 *           star motes drifting up
 *   pure    raw — a teal overprint with a tear drawn across the card and
 *           scan bars; Bleed instead runs red down the print
 *   KO      the print cracks from the impact point, a wine vignette, shards
 *           fall away, the K.O. sticker charges gold
 *
 * Tagged hits add their own lead-in before the impact: Djinn's Mark glyphs
 * converge on the target and detonate amber, an Echo rings in, Naptime's
 * letters float off before the burst, a Killing Blow slashes first, a
 * Ricochet bounces in, Tesla arcs across.
 */
import { motion } from 'framer-motion';
import type { HitFx } from '@/engine/types';
import { poster } from '../../poster';
import { fonts } from '../../tokens';
import { FX_INK, TAG_INFO, tagLead } from './fxCatalog';
import { type Pt, type Rect, angleOf, center, edgePoint, scatterInRect, seeded } from './geometry';
import { Bolt, EASE_OUT, Fixed, LightningArc, Motes, MuzzleFlash, Ring, Stamp, TracerVolley, Wash, sec } from './primitives';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const stampSize = (rect: Rect) => clamp(Math.round(rect.width * 0.1), 11, 22);

/** Ink that reads on a sticker of `hex` — dark type on a light ink, paper on a dark one. */
export function onInk(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return poster.paper;
  const n = parseInt(m[1], 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 150 ? poster.ink : poster.paper;
}

// ---------------------------------------------------------------------------
// The dispatcher — one hit event → its intro, its type family, its stickers.
// ---------------------------------------------------------------------------

export function HitImpact({ ev, rect, sourceRect, at, hold, ownerInk = FX_INK.gold }: {
  ev: HitFx;
  rect: Rect;
  sourceRect?: Rect | null;
  /** ms into the batch when the impact lands. */
  at: number;
  hold: number;
  /** The source's owner ink (your gold / the rival's red) for tracers. */
  ownerInk?: string;
}) {
  const seed = ev.seq;
  const tag = ev.tag;
  const info = tag ? TAG_INFO[tag] : null;
  const lead = tagLead(tag);
  const from = sourceRect ? center(sourceRect) : undefined;
  // Ricochet / Tesla draw their own travel; the plain volley would double it.
  const travelsItself = tag === 'ricochet' || tag === 'tesla';
  const fs = stampSize(rect);

  return (
    <>
      {/* Lead-in */}
      {tag === 'djinns_mark' && <DjinnConverge rect={rect} stacks={ev.stacks ?? 4} at={at - lead} dur={lead} />}
      {tag === 'reverb' && <EchoRings rect={rect} at={at - lead} dur={lead} />}
      {tag === 'naptime' && <SleepLetters rect={rect} at={at - lead} dur={lead} ink={TAG_INFO.naptime.ink} />}
      {tag === 'execute' && <ExecuteSlash rect={rect} at={at - lead} dur={lead} />}
      {tag === 'ricochet' && from && (
        <Bolt from={from} to={center(rect)} color={FX_INK.gold} at={at - lead} dur={lead - 40} bulge={0.38} width={2.5} />
      )}
      {tag === 'tesla' && from && (
        <LightningArc from={from} to={center(rect)} at={at - lead} dur={lead + 60} seed={seed} />
      )}

      {/* Impact by type */}
      {ev.type === 'attack' && (
        <GunBurst rect={rect} amount={ev.amount} at={at} hold={hold} seed={seed} from={from} ownerInk={ownerInk} volley={!!from && !travelsItself} />
      )}
      {ev.type === 'spirit' && (
        <SpiritBurst rect={rect} at={at} hold={hold} seed={seed} accent={tag === 'djinns_mark' ? TAG_INFO.djinns_mark.ink : tag === 'life_drain' ? TAG_INFO.life_drain.ink : undefined} big={tag === 'djinns_mark' || tag === 'naptime'} />
      )}
      {ev.type === 'pure' && tag === 'bleed' && <BleedDrips rect={rect} amount={ev.amount} at={at} hold={hold} seed={seed} />}
      {ev.type === 'pure' && tag !== 'bleed' && <PureBurst rect={rect} at={at} hold={hold} seed={seed} />}

      {/* Sticker for the tagged effects that earn one */}
      {info && STAMPED_TAGS.has(tag!) && (
        <Fixed rect={rect} z={87}>
          <Stamp
            text={tag === 'djinns_mark' ? `${info.label} ×${ev.stacks ?? ''}`.trim() : tag === 'bleed' ? `${info.label} ${ev.amount}` : info.label}
            sticker={info.ink}
            ink={onInk(info.ink)}
            fontSize={fs}
            at={at + 110}
            dur={hold - 110}
            top={tag === 'execute' ? '42%' : '58%'}
            fill={tag === 'execute' ? FX_INK.gold : undefined}
          />
        </Fixed>
      )}

      {/* The kill */}
      {ev.ko && <KoShatter rect={rect} at={at + 140} seed={seed} hold={hold - 140} />}
      {ev.ko && tag !== 'execute' && (
        <Fixed rect={rect} z={88}>
          <Stamp text="K.O." sticker={poster.red} ink={poster.paper} fill={FX_INK.gold}
            fontSize={clamp(Math.round(rect.width * 0.2), 14, 44)} at={at + 320} dur={hold - 320} top="50%" />
        </Fixed>
      )}
    </>
  );
}

const STAMPED_TAGS = new Set<string>(['djinns_mark', 'reverb', 'naptime', 'execute', 'bleed', 'life_drain', 'combo', 'ricochet', 'tesla']);

// ---------------------------------------------------------------------------
// Bullet — gunfire.
// ---------------------------------------------------------------------------

function BulletHole({ x, y, size, at, hold }: { x: number; y: number; size: number; at: number; hold: number }) {
  return (
    <>
      <motion.div
        initial={{ scale: 1.8, opacity: 0 }}
        animate={{ scale: [1.8, 1, 1, 1], opacity: [0, 1, 1, 0] }}
        transition={{ duration: sec(hold), delay: sec(at), times: [0, 0.06, 0.8, 1], ease: EASE_OUT }}
        style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }}
      >
        <svg viewBox="0 0 20 20" width="100%" height="100%" style={{ overflow: 'visible' }}>
          <g stroke={poster.ink} strokeWidth="1.4" strokeLinecap="round" opacity="0.9">
            <line x1="10" y1="10" x2="1" y2="4" />
            <line x1="10" y1="10" x2="19" y2="7" />
            <line x1="10" y1="10" x2="13" y2="19" />
            <line x1="10" y1="10" x2="4" y2="17" />
          </g>
          <circle cx="10" cy="10" r="6.5" fill={FX_INK.cream} opacity="0.92" />
          <circle cx="10" cy="10" r="4.6" fill={poster.ink} />
          <circle cx="8.5" cy="8.5" r="1.2" fill="rgba(255, 255, 255, 0.35)" />
        </svg>
      </motion.div>
      <Ring cx={x} cy={y} size={size * 2.2} color={FX_INK.bullet} at={at} dur={260} from={0.4} to={2.2} width={2} />
    </>
  );
}

/** Gunfire landing on a card. With `from` and `volley`, the muzzle flash and
 *  tracer rounds are drawn too (the combat choreographer draws its own). */
export function GunBurst({ rect, amount, at, hold, seed, from, ownerInk = FX_INK.gold, volley = true, z = 80 }: {
  rect: Rect; amount: number; at: number; hold: number; seed: number;
  from?: Pt; ownerInk?: string; volley?: boolean; z?: number;
}) {
  const rng = seeded(seed);
  const holes = clamp(1 + Math.ceil(amount / 2), 2, 5);
  const pts = scatterInRect(rect, holes, rng);
  const holeSize = clamp(rect.width * 0.075, 7, 15);
  const c = center(rect);
  const dir = from ? angleOf(from, c) : -Math.PI / 2;
  const travel = 200;
  const gap = 50;
  const muzzle = from ? { x: from.x, y: from.y } : null;
  return (
    <>
      {muzzle && volley && (
        <>
          <MuzzleFlash at={muzzle} angle={dir} ink={ownerInk} atMs={at - travel - 2 * gap} />
          <TracerVolley from={muzzle} to={edgePoint(rect, muzzle)} ink={ownerInk} at={at - travel - 2 * gap} dur={travel} rounds={3} gap={gap} />
        </>
      )}
      <Fixed rect={rect} clip z={z}>
        <Wash color={FX_INK.bullet} peak={0.5} at={at} dur={hold * 0.9} />
        {pts.map((p, i) => <BulletHole key={i} x={p.x} y={p.y} size={holeSize} at={at + i * 65} hold={Math.max(400, hold - i * 65)} />)}
      </Fixed>
      <Fixed rect={rect} z={z + 3}>
        <Motes origin={{ x: rect.width / 2, y: rect.height / 2 }} count={6} seed={seed + 7} color={FX_INK.bullet} alt={FX_INK.gold}
          shape="streak" at={at} dur={420} spread={[26, 62]} gravity={16} angle={{ center: dir, span: 1.6 }} size={7} />
      </Fixed>
    </>
  );
}

// ---------------------------------------------------------------------------
// Spirit — arcane.
// ---------------------------------------------------------------------------

export function SpiritBurst({ rect, at, hold, seed, accent, big = false, z = 80 }: {
  rect: Rect; at: number; hold: number; seed: number; accent?: string; big?: boolean; z?: number;
}) {
  const ink = accent ?? FX_INK.spirit;
  const runeSize = clamp(rect.width * (big ? 0.5 : 0.42), 34, 92);
  return (
    <>
      <Fixed rect={rect} clip z={z}>
        <Wash color={ink} peak={0.55} at={at} dur={hold * 0.9} />
        <Wash color={FX_INK.cream} peak={0.4} at={at} dur={200} radial />
        {[0, 90, 180].map((d, i) => (
          <Ring key={i} size={rect.width * 0.5} color={i === 1 ? FX_INK.cream : ink} at={at + d} dur={560} from={0.2} to={big ? 3 : 2.4} width={2.5} peak={0.85} />
        ))}
        <motion.div
          initial={{ scale: 0.4, opacity: 0, rotate: -14 }}
          animate={{ scale: [0.4, 1.15, 1, 1], opacity: [0, 1, 1, 0], rotate: [-14, 4, 0, 0] }}
          transition={{ duration: sec(Math.min(hold, 820)), delay: sec(at), times: [0, 0.18, 0.75, 1], ease: EASE_OUT }}
          style={{
            position: 'absolute', left: '50%', top: '50%', width: runeSize, height: runeSize,
            marginLeft: -runeSize / 2, marginTop: -runeSize / 2,
            filter: 'drop-shadow(0 2px 0 rgba(0, 0, 0, 0.45))',
          }}
        >
          <svg viewBox="0 0 16 16" width="100%" height="100%">
            <path d="M8 1 C 11 4, 12 7, 8 13 C 4 7, 5 4, 8 1 Z" fill={ink} stroke={poster.ink} strokeWidth="0.6" />
            <circle cx="8" cy="9" r="1.5" fill={FX_INK.cream} />
          </svg>
        </motion.div>
      </Fixed>
      <Fixed rect={rect} z={z + 3}>
        <Motes origin={{ x: rect.width / 2, y: rect.height / 2 }} count={big ? 12 : 8} seed={seed + 3} color={ink} alt={FX_INK.cream}
          shape="star" at={at} dur={650} spread={[30, big ? 110 : 80]} rise={30} size={9} />
      </Fixed>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pure — raw, and Bleed.
// ---------------------------------------------------------------------------

export function PureBurst({ rect, at, hold, seed, z = 80 }: { rect: Rect; at: number; hold: number; seed: number; z?: number }) {
  const rng = seeded(seed);
  const pts = Array.from({ length: 9 }, (_, i) => ({
    x: (i / 8) * rect.width,
    y: rect.height * 0.45 + (i % 2 ? -1 : 1) * (6 + rng() * 10),
  }));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const tr = { duration: sec(hold * 0.8), delay: sec(at), times: [0, 0.3, 0.8, 1] };
  return (
    <>
      <Fixed rect={rect} clip z={z}>
        <Wash color={FX_INK.pure} peak={0.5} at={at} dur={hold * 0.9} />
        <svg width={rect.width} height={rect.height} style={{ position: 'absolute', inset: 0 }}>
          <motion.path d={d} fill="none" stroke={poster.ink} strokeWidth={5} strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 0.8, 0.8, 0] }} transition={tr} />
          <motion.path d={d} fill="none" stroke={FX_INK.cream} strokeWidth={2} strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 1, 1, 0] }} transition={tr} />
        </svg>
        {[0, 1].map((i) => (
          <motion.div key={i}
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: [-6, rect.height + 6], opacity: [0, 0.6, 0.6, 0] }}
            transition={{ duration: 0.45, delay: sec(at + i * 120), ease: 'linear', times: [0, 0.1, 0.9, 1] }}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: FX_INK.cream, mixBlendMode: 'overlay' }}
          />
        ))}
      </Fixed>
      <Fixed rect={rect} z={z + 3}>
        <Motes origin={{ x: rect.width / 2, y: rect.height * 0.45 }} count={5} seed={seed + 5} color={FX_INK.pure} alt={FX_INK.cream}
          shape="shard" at={at} dur={520} spread={[24, 60]} gravity={10} size={9} />
      </Fixed>
    </>
  );
}

export function BleedDrips({ rect, amount, at, hold, seed, z = 80 }: { rect: Rect; amount: number; at: number; hold: number; seed: number; z?: number }) {
  const rng = seeded(seed);
  const n = clamp(1 + amount, 2, 5);
  return (
    <>
      <Fixed rect={rect} clip z={z}>
        <Wash color={poster.redDeep} peak={0.4} at={at} dur={hold * 0.9} />
        {Array.from({ length: n }, (_, i) => {
          const x = rect.width * (0.15 + rng() * 0.7);
          const w = 4 + rng() * 4;
          const h = rect.height * (0.3 + rng() * 0.4);
          return (
            <motion.div key={i}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: [0, h * 0.6, h, h], opacity: [0, 1, 1, 0] }}
              transition={{ duration: sec(hold * 0.85), delay: sec(at + i * 70), times: [0, 0.25, 0.6, 1], ease: 'easeIn' }}
              style={{
                position: 'absolute', left: x - w / 2, top: -2, width: w,
                background: poster.red, borderRadius: `0 0 ${w}px ${w}px`,
                boxShadow: 'inset -1px 0 0 rgba(0, 0, 0, 0.25)',
              }}
            >
              <div style={{ position: 'absolute', left: -w * 0.35, bottom: -w * 0.6, width: w * 1.7, height: w * 1.7, borderRadius: '50%', background: poster.red }} />
            </motion.div>
          );
        })}
      </Fixed>
      <Fixed rect={rect} z={z + 3}>
        <Motes origin={{ x: rect.width / 2, y: rect.height * 0.75 }} count={4} seed={seed + 9} color={poster.red} alt={poster.redDeep}
          shape="dot" at={at + 220} dur={600} spread={[8, 30]} gravity={44} size={6} />
      </Fixed>
    </>
  );
}

// ---------------------------------------------------------------------------
// KO — the print cracks.
// ---------------------------------------------------------------------------

export function KoShatter({ rect, at, seed, hold = 1500, z = 84 }: { rect: Rect; at: number; seed: number; hold?: number; z?: number }) {
  const rng = seeded(seed);
  const cx = rect.width * (0.35 + rng() * 0.3);
  const cy = rect.height * (0.3 + rng() * 0.3);
  const len = Math.max(rect.width, rect.height);
  const cracks = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 + rng() * 0.5;
    const mid = { x: cx + Math.cos(a) * len * 0.35 + (rng() - 0.5) * 14, y: cy + Math.sin(a) * len * 0.35 + (rng() - 0.5) * 14 };
    const end = { x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len };
    return `M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${mid.x.toFixed(1)} ${mid.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  });
  return (
    <>
      <Fixed rect={rect} clip z={z}>
        <Wash color={FX_INK.ko} peak={0.72} at={at} dur={hold} holdFrac={0.7} radial />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.7, 0.7, 0] }}
          transition={{ duration: sec(hold), delay: sec(at), times: [0, 0.1, 0.75, 1] }}
          style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.75) 100%)' }}
        />
        <svg width={rect.width} height={rect.height} style={{ position: 'absolute', inset: 0 }}>
          {cracks.map((d, i) => {
            const tr = { duration: sec(hold * 0.9), delay: sec(at + i * 22), times: [0, 0.22, 0.8, 1], ease: 'easeOut' as const };
            return (
              <g key={i}>
                <motion.path d={d} fill="none" stroke={poster.ink} strokeWidth={2.6} strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 1, 1, 0] }} transition={tr} />
                <motion.path d={d} fill="none" stroke={FX_INK.cream} strokeWidth={0.9} strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 0.9, 0.9, 0] }} transition={tr} />
              </g>
            );
          })}
        </svg>
      </Fixed>
      <Fixed rect={rect} z={z + 2}>
        <Motes origin={{ x: cx, y: cy }} count={7} seed={seed + 11} color={FX_INK.frame} alt={FX_INK.ko}
          shape="shard" at={at + 100} dur={720} spread={[40, 110]} gravity={50} size={12} />
      </Fixed>
    </>
  );
}

// ---------------------------------------------------------------------------
// Unique lead-ins.
// ---------------------------------------------------------------------------

/** Mirage's mark — a crescent with a flame. */
export function DjinnGlyph({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%">
      <path d="M14 3 A 9 9 0 1 0 14 21 A 7 7 0 1 1 14 3 Z" fill={color} stroke={poster.ink} strokeWidth="1" />
      <path d="M16 8 C 19 11, 19 14, 16 17 C 13 14, 13.5 11, 16 8 Z" fill={FX_INK.cream} stroke={poster.ink} strokeWidth="0.8" />
    </svg>
  );
}

/** The mark's stacks ring the card, spin inward and gather into a glow. */
function DjinnConverge({ rect, stacks, at, dur, z = 85 }: { rect: Rect; stacks: number; at: number; dur: number; z?: number }) {
  const n = clamp(stacks, 1, 4);
  const amber = TAG_INFO.djinns_mark.ink;
  const r = rect.width * 0.44;
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const size = clamp(rect.width * 0.17, 18, 34);
  const glow = rect.width * 0.5;
  return (
    <Fixed rect={rect} z={z}>
      {Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x0 = Math.cos(a) * r;
        const y0 = Math.sin(a) * r;
        return (
          <motion.div key={i}
            initial={{ x: x0, y: y0, scale: 1, opacity: 0, rotate: 0 }}
            animate={{ x: [x0, x0 * 0.75, 0], y: [y0, y0 * 0.75, 0], scale: [1, 1.15, 0.45], opacity: [0, 1, 1], rotate: [0, 120, 260] }}
            transition={{ duration: sec(dur), delay: sec(at), ease: [0.4, 0, 0.8, 1], times: [0, 0.35, 1] }}
            style={{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size, filter: 'drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5))' }}
          >
            <DjinnGlyph color={amber} />
          </motion.div>
        );
      })}
      <motion.div
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 0.9, 1.1], opacity: [0, 0.5, 0.95] }}
        transition={{ duration: sec(dur), delay: sec(at), ease: 'easeIn' }}
        style={{
          position: 'absolute', left: '50%', top: '50%', width: glow, height: glow, marginLeft: -glow / 2, marginTop: -glow / 2,
          borderRadius: '50%', background: `radial-gradient(circle, ${amber}, ${amber}44 55%, transparent 75%)`,
        }}
      />
      {/* The detonation itself — an amber flash and a wide double ring at impact. */}
      <Ring size={rect.width * 0.5} color={amber} at={at + dur} dur={620} from={0.2} to={3.2} width={4} peak={1} />
      <Ring size={rect.width * 0.5} color={FX_INK.spirit} at={at + dur + 90} dur={620} from={0.2} to={2.6} width={3} peak={0.9} />
    </Fixed>
  );
}

/** Mystic Reverb — dashed rings converge on the card. */
function EchoRings({ rect, at, dur, z = 85 }: { rect: Rect; at: number; dur: number; z?: number }) {
  const size = rect.width * 0.7;
  return (
    <Fixed rect={rect} z={z}>
      {[0, 1, 2].map((i) => (
        <motion.div key={i}
          initial={{ scale: 1.9, opacity: 0 }}
          animate={{ scale: [1.9, 0.5], opacity: [0, 0.9, 0.2] }}
          transition={{ duration: sec(Math.max(120, dur - i * 60)), delay: sec(at + i * 60), ease: 'easeIn' }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, borderRadius: '50%', border: `2.5px dashed ${FX_INK.spirit}` }}
        />
      ))}
    </Fixed>
  );
}

/** Sleep letters drifting off the card — Naptime's wake, and the Sleep stamp. */
export function SleepLetters({ rect, at, dur, ink, z = 86 }: { rect: Rect; at: number; dur: number; ink: string; z?: number }) {
  const size = clamp(rect.width * 0.13, 14, 26);
  return (
    <Fixed rect={rect} z={z}>
      {['z', 'Z', 'Z'].map((ch, i) => (
        <motion.div key={i}
          initial={{ opacity: 0, y: 0, x: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], y: [0, -14 - i * 10, -28 - i * 14], x: [0, 8 + i * 6, 14 + i * 8], scale: [0.6, 1, 1.05, 1.5] }}
          transition={{ duration: sec(dur * 0.9), delay: sec(at + i * 90), ease: 'easeOut', times: [0, 0.2, 0.7, 1] }}
          style={{
            position: 'absolute', right: rect.width * 0.18, top: rect.height * 0.22,
            fontFamily: fonts.display, fontSize: size * (0.8 + i * 0.25), color: ink,
            textShadow: '0 2px 0 rgba(0, 0, 0, 0.6)', lineHeight: 1,
          }}
        >
          {ch}
        </motion.div>
      ))}
    </Fixed>
  );
}

/** Killing Blow — two slashes cut across the card before the hit lands. */
function ExecuteSlash({ rect, at, dur, z = 86 }: { rect: Rect; at: number; dur: number; z?: number }) {
  const w = rect.width;
  const h = rect.height;
  const d1 = `M ${-w * 0.2} ${-h * 0.1} L ${w * 1.2} ${h * 1.1}`;
  const d2 = `M ${w * 1.15} ${h * 0.1} L ${-w * 0.15} ${h * 0.9}`;
  const stroke = (d: string, color: string, width: number, delay: number) => (
    <motion.path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" fill="none"
      initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 0.95, 0.95, 0] }}
      transition={{ duration: sec(dur + 600), delay: sec(delay), times: [0, 0.25, 0.75, 1], ease: 'easeOut' }} />
  );
  return (
    <Fixed rect={rect} z={z}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {stroke(d1, poster.ink, 10, at)}
        {stroke(d1, poster.red, 6, at)}
        {stroke(d2, poster.ink, 6, at + 110)}
        {stroke(d2, FX_INK.cream, 3, at + 110)}
      </svg>
    </Fixed>
  );
}
