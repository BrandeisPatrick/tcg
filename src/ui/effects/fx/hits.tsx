/**
 * "Card got hit" — one animation family per damage type, and a unique intro
 * for every tagged effect. Each family prints its mark on the card (a wash
 * of light off the impact, holes, a rune, a tear, the amount in stencil
 * digits) and throws the rest into the air on the FX stage, where it has
 * height and falls back to the table. The tile itself rocks via FxImpulse.
 *
 *   bullet  gunfire — muzzle flash, casings, a tracer volley; holes punched
 *           into the print one after another, sparks carrying on past them
 *           and chads of the card flung up
 *   spirit  arcane — a plum bloom, a shockwave along the table and a halo
 *           lifting off the card, the rune swinging up out of it, embers
 *           winding toward the viewer
 *   pure    raw — a teal tear ripped across the card, glass thrown off
 *           either side of it; Bleed instead runs red down the print and
 *           drips onto the paper
 *   KO      the print cracks from the impact point, then the card itself
 *           breaks into shards that fly off the table; the K.O. sticker is
 *           slammed down on what is left
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
import { FX_INK, FX_TIMING, TAG_INFO, numeralInk, tagLead } from './fxCatalog';
import { useFxCalm } from './FxMotionContext';
import { type Pt, type Rect, angleOf, center, edgePoint, scatterInRect, seeded } from './geometry';
import { Bolt, EASE_OUT, Fixed, Gunfire, LightningArc, Numeral, Ring, Sheen, Stamp, Wash, numeralSize, sec } from './primitives';
import { ShatterPieces, TearHalves } from './shatter';
import { useStage } from './stage/FxStage';
import { bleedSpill, castCharge, chads, gunImpact, koBlast, pureTear, ring, sparks, spiritBurst, stampDust } from './stage/emitters';

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

export function HitImpact({ ev, rect, sourceRect, tile, at, hold, ownerInk = FX_INK.gold, index = 0 }: {
  ev: HitFx;
  rect: Rect;
  sourceRect?: Rect | null;
  /** The struck card's live tile — a kill cuts it into shards. */
  tile?: HTMLElement | null;
  /** ms into the batch when the impact lands. */
  at: number;
  hold: number;
  /** The source's owner ink (your gold / the rival's red) for tracers. */
  ownerInk?: string;
  /** Which hit on this card within the batch — fans the numerals apart. */
  index?: number;
}) {
  const seed = ev.seq;
  const tag = ev.tag;
  const info = tag ? TAG_INFO[tag] : null;
  const lead = tagLead(tag);
  const from = sourceRect ? center(sourceRect) : undefined;
  // Gunfire leaves from the source's edge facing the target, not its middle.
  const muzzle = sourceRect ? edgePoint(sourceRect, center(rect)) : undefined;
  // Ricochet / Tesla draw their own travel; the plain volley would double it.
  const travelsItself = tag === 'ricochet' || tag === 'tesla';
  const fs = stampSize(rect);
  const blow = from && sourceRect !== rect ? angleOf(from, center(rect)) : undefined;

  return (
    <>
      {/* Lead-in */}
      {tag === 'djinns_mark' && <DjinnConverge rect={rect} stacks={ev.stacks ?? 4} at={at - lead} dur={lead} seed={seed} />}
      {tag === 'reverb' && <EchoRings rect={rect} at={at - lead} dur={lead} />}
      {tag === 'naptime' && <SleepLetters rect={rect} at={at - lead} dur={lead} ink={TAG_INFO.naptime.ink} />}
      {tag === 'execute' && <ExecuteSlash rect={rect} at={at - lead} dur={lead} seed={seed} />}
      {tag === 'ricochet' && from && (
        <Bolt from={from} to={center(rect)} color={FX_INK.gold} at={at - lead} dur={lead - 40} bulge={0.38} size={5} arc={60} ease={1.1} />
      )}
      {tag === 'tesla' && from && (
        <LightningArc from={from} to={center(rect)} at={at - lead} dur={lead + 60} seed={seed} />
      )}

      {/* Impact by type */}
      {ev.type === 'attack' && (
        <GunBurst rect={rect} amount={ev.amount} at={at} hold={hold} seed={seed} from={muzzle} ownerInk={ownerInk} volley={!!muzzle && !travelsItself} />
      )}
      {ev.type === 'spirit' && (
        <SpiritBurst rect={rect} at={at} hold={hold} seed={seed} accent={tag === 'djinns_mark' ? TAG_INFO.djinns_mark.ink : tag === 'life_drain' ? TAG_INFO.life_drain.ink : undefined} big={tag === 'djinns_mark' || tag === 'naptime'} />
      )}
      {ev.type === 'pure' && tag === 'bleed' && <BleedDrips rect={rect} amount={ev.amount} at={at} hold={hold} seed={seed} />}
      {ev.type === 'pure' && tag !== 'bleed' && <PureBurst rect={rect} tile={ev.ko ? null : tile} at={at} hold={hold} seed={seed} />}

      {/* Sticker for the tagged effects that earn one */}
      {info && STAMPED_TAGS.has(tag!) && (
        <Fixed rect={rect} z={87}>
          <Stamp
            text={tag === 'djinns_mark' ? `${info.label} ×${ev.stacks ?? ''}`.trim() : info.label}
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

      {/* The amount — stencil digits in the type ink, above everything. */}
      {ev.amount > 0 && (
        <Fixed rect={rect} z={89}>
          <Numeral text={`−${ev.amount}`} ink={numeralInk(ev.type, ev.ko)} at={at + 30} dur={Math.min(hold, 1000)} size={numeralSize(rect)} top={ev.ko ? '24%' : '30%'} index={index} />
        </Fixed>
      )}

      {/* The kill */}
      {ev.ko && <KoShatter rect={rect} tile={tile} at={at + FX_TIMING.koBreak} seed={seed} hold={hold - FX_TIMING.koBreak} dir={blow} />}
      {ev.ko && tag !== 'execute' && <KoSticker rect={rect} at={at + FX_TIMING.koStamp} hold={hold - FX_TIMING.koStamp} seed={seed} />}
    </>
  );
}

const STAMPED_TAGS = new Set<string>(['djinns_mark', 'reverb', 'naptime', 'execute', 'bleed', 'life_drain', 'combo', 'ricochet', 'tesla']);

// ---------------------------------------------------------------------------
// Bullet — gunfire.
// ---------------------------------------------------------------------------

/** A hole punched through the print: the paper torn up round it, dark
 *  inside, light catching the far lip. */
function BulletHole({ x, y, size, at, hold }: { x: number; y: number; size: number; at: number; hold: number }) {
  return (
    <>
      <motion.div
        initial={{ scale: 2.2, opacity: 0 }}
        animate={{ scale: [2.2, 0.88, 1, 1], opacity: [0, 1, 1, 0] }}
        transition={{ duration: sec(hold), delay: sec(at), times: [0, 0.06, 0.8, 1], ease: EASE_OUT }}
        style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" width="100%" height="100%" style={{ overflow: 'visible' }}>
          <g stroke={poster.ink} strokeWidth="1.3" strokeLinecap="round" opacity="0.9">
            <line x1="12" y1="12" x2="0" y2="4" />
            <line x1="12" y1="12" x2="24" y2="7" />
            <line x1="12" y1="12" x2="16" y2="25" />
            <line x1="12" y1="12" x2="3" y2="22" />
          </g>
          <path d="M12 3.5 L15 5.2 L18.6 5.4 L18.9 9 L20.6 12 L18.8 15 L18.5 18.6 L15 18.8 L12 20.6 L9 18.8 L5.4 18.6 L5.2 15 L3.4 12 L5.2 9 L5.4 5.4 L9 5.2 Z"
            fill={FX_INK.cream} stroke={poster.ink} strokeWidth="0.8" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="5.4" fill="#0b0908" />
          <path d="M7.4 10.4 A5 5 0 0 1 10.4 7.4" stroke="rgba(0, 0, 0, 0.55)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M16.9 13.4 A5.2 5.2 0 0 1 13.4 16.9" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="1.1" fill="none" strokeLinecap="round" />
        </svg>
      </motion.div>
      <Ring cx={x} cy={y} size={size * 2.2} color={FX_INK.bullet} at={at} dur={260} from={0.4} to={2.2} width={2} />
    </>
  );
}

/** Gunfire landing on a card. With `from` and `volley`, the muzzle flash,
 *  casings and tracer rounds are fired too (the combat choreographer fires
 *  its own). */
export function GunBurst({ rect, amount, at, hold, seed, from, ownerInk = FX_INK.gold, volley = true, z = 80 }: {
  rect: Rect; amount: number; at: number; hold: number; seed: number;
  from?: Pt; ownerInk?: string; volley?: boolean; z?: number;
}) {
  const rng = seeded(seed);
  const holes = clamp(1 + Math.ceil(amount / 2), 2, 5);
  const pts = scatterInRect(rect, holes, rng);
  const holeSize = clamp(rect.width * 0.09, 9, 18);
  const dir = from ? angleOf(from, center(rect)) : Math.PI / 2;
  const gap = 50;
  const travel = FX_TIMING.volleyLead - 2 * gap;
  const power = clamp(amount / 6, 0.2, 1);
  // Each round that lands throws its own sparks and chads, at its own hole;
  // a heavy volley also kicks a shockwave out along the table.
  useStage((s) => {
    pts.forEach((p, i) => s.at(at + i * 65, (stage) => stage.add(gunImpact({
      at: { x: rect.left + p.x, y: rect.top + p.y }, dir, seed: seed + i * 17, power, density: stage.density,
    }))));
    if (power >= 0.6) s.at(at, (stage) => stage.add(ring({ at: center(rect), r0: rect.width * 0.4, r1: rect.width * 1.15, color: FX_INK.bullet, width: 3.5, life: 400 })));
  });
  return (
    <>
      {from && volley && (
        <Gunfire from={from} to={edgePoint(rect, from)} ink={ownerInk} seed={seed + 5} at={at - FX_TIMING.volleyLead} dur={travel} rounds={3} gap={gap} />
      )}
      <Fixed rect={rect} clip z={z}>
        <Wash color={FX_INK.bullet} peak={0.55} at={at} dur={hold * 0.8} radial origin={`${pts[0].x.toFixed(0)}px ${pts[0].y.toFixed(0)}px`} holdFrac={0.4} />
        <Sheen angle={dir} reach={Math.max(rect.width, rect.height)} at={at} />
        {pts.map((p, i) => <BulletHole key={i} x={p.x} y={p.y} size={holeSize} at={at + i * 65} hold={Math.max(400, hold - i * 65)} />)}
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
  useStage((s) => s.at(at, (stage) => stage.add(spiritBurst({ at: center(rect), r: rect.width / 2, ink, seed, big, density: stage.density }))));
  return (
    <>
      <Fixed rect={rect} clip z={z}>
        <Wash color={ink} peak={0.6} at={at} dur={hold * 0.8} radial holdFrac={0.4} />
        <Wash color={FX_INK.cream} peak={0.45} at={at} dur={200} radial />
        {[0, 90, 180].map((d, i) => (
          <Ring key={i} size={rect.width * 0.5} color={i === 1 ? FX_INK.cream : ink} at={at + d} dur={560} from={0.2} to={big ? 3 : 2.4} width={2.5} peak={0.85} />
        ))}
      </Fixed>
      {/* The rune swings up out of the card and hangs over it, its shadow
          left behind on the print. */}
      <Fixed rect={rect} z={z + 3}>
        <motion.div
          initial={{ scale: 0.3, opacity: 0, rotateY: -86, y: 0 }}
          animate={{ scale: [0.3, 1.28, 1.12, 1.12, 1.3], opacity: [0, 1, 1, 1, 0], rotateY: [-86, 14, 0, 0, 0], y: [0, -8, -6, -6, -14] }}
          transition={{ duration: sec(Math.min(hold, 860)), delay: sec(at), times: [0, 0.2, 0.3, 0.75, 1], ease: EASE_OUT }}
          style={{
            position: 'absolute', left: '50%', top: '50%', width: runeSize, height: runeSize,
            marginLeft: -runeSize / 2, marginTop: -runeSize / 2,
            transformPerspective: 480,
            filter: 'drop-shadow(0 12px 5px rgba(0, 0, 0, 0.45))',
          }}
        >
          <svg viewBox="0 0 16 16" width="100%" height="100%">
            <path d="M8 1 C 11 4, 12 7, 8 13 C 4 7, 5 4, 8 1 Z" fill={ink} stroke={poster.ink} strokeWidth="0.6" />
            <path d="M8 2.6 C 9.6 4.6, 10.2 6.6, 8.6 10 C 9 7, 8.8 4.6, 8 2.6 Z" fill="rgba(255, 255, 255, 0.28)" />
            <circle cx="8" cy="9" r="1.5" fill={FX_INK.cream} />
          </svg>
        </motion.div>
      </Fixed>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pure — raw, and Bleed.
// ---------------------------------------------------------------------------

/** Pure damage rips the print across. With the card's live `tile` the two
 *  halves really part — curling up off the table over a dark gap — before
 *  they close again; the stage throws glass off either side of the rip. */
export function PureBurst({ rect, tile, at, hold, seed, z = 80 }: {
  rect: Rect; tile?: HTMLElement | null; at: number; hold: number; seed: number; z?: number;
}) {
  const rng = seeded(seed);
  const tearY = rect.height * 0.45;
  const pts = Array.from({ length: 9 }, (_, i) => ({
    x: (i / 8) * rect.width,
    y: tearY + (i % 2 ? -1 : 1) * (6 + rng() * 10),
  }));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const tr = { duration: sec(hold * 0.8), delay: sec(at), times: [0, 0.3, 0.8, 1] };
  useStage((s) => s.at(at + 40, (stage) => stage.add(pureTear({
    a: { x: rect.left + rect.width * 0.08, y: rect.top + tearY }, b: { x: rect.left + rect.width * 0.92, y: rect.top + tearY },
    seed, density: stage.density,
  }))));
  return (
    <>
      <TearHalves rect={rect} source={tile} line={pts} at={at + 60} z={z - 1} />
      <Fixed rect={rect} clip z={z}>
        <Wash color={FX_INK.pure} peak={0.55} at={at} dur={hold * 0.8} radial origin={`50% ${tearY.toFixed(0)}px`} holdFrac={0.4} />
        <svg width={rect.width} height={rect.height} style={{ position: 'absolute', inset: 0 }}>
          {/* The rip: dark where the print has parted, a bright torn edge on it. */}
          <motion.path d={d} fill="none" stroke="#0b0908" strokeWidth={8} strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 0.9, 0.9, 0] }} transition={tr} />
          <motion.path d={d} fill="none" stroke={FX_INK.pure} strokeWidth={4} strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 1, 1, 0] }} transition={tr} />
          <motion.path d={d} fill="none" stroke={FX_INK.cream} strokeWidth={1.6} strokeLinejoin="round"
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
    </>
  );
}

export function BleedDrips({ rect, amount, at, hold, seed, z = 80 }: { rect: Rect; amount: number; at: number; hold: number; seed: number; z?: number }) {
  const rng = seeded(seed);
  const n = clamp(1 + amount, 2, 5);
  // What runs down the print drips off its lower edge onto the paper.
  useStage((s) => s.at(at + 220, (stage) => stage.add(bleedSpill({
    at: { x: rect.left + rect.width / 2, y: rect.top + rect.height - 6 }, width: rect.width * 0.7, seed, count: n + 2, density: stage.density,
  }))));
  return (
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
              background: `linear-gradient(90deg, ${poster.red}, ${poster.red} 55%, ${poster.redDeep})`,
              borderRadius: `0 0 ${w}px ${w}px`,
              boxShadow: '1px 2px 0 rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ position: 'absolute', left: -w * 0.35, bottom: -w * 0.6, width: w * 1.7, height: w * 1.7, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #f06a5c, ${poster.red} 45%, ${poster.redDeep})`, boxShadow: '1px 2px 0 rgba(0, 0, 0, 0.3)' }} />
          </motion.div>
        );
      })}
    </Fixed>
  );
}

// ---------------------------------------------------------------------------
// KO — the print breaks.
// ---------------------------------------------------------------------------

/** The card comes apart: `at` is the instant it breaks (the cracks race out
 *  just before). With the card's live `tile` the shards are the card itself;
 *  the stage throws the rest — torn print, sparks, dust rolling out. */
export function KoShatter({ rect, tile, at, seed, hold = 1350, dir, z = 84 }: {
  rect: Rect; tile?: HTMLElement | null; at: number; seed: number; hold?: number; dir?: number; z?: number;
}) {
  const calm = useFxCalm();
  useStage((s) => s.at(at, (stage) => stage.add(koBlast({
    at: center(rect), r: Math.hypot(rect.width, rect.height) / 2, seed: seed + 11, dir, density: stage.density,
  }))));
  return (
    <>
      {/* The room blinks as the card goes. */}
      {!calm && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.2, 0] }}
          transition={{ duration: 0.18, delay: sec(at), times: [0, 0.25, 1] }}
          style={{ position: 'fixed', inset: 0, background: FX_INK.cream, pointerEvents: 'none', zIndex: z - 5 }}
        />
      )}
      <ShatterPieces rect={rect} source={tile} at={at} seed={seed} hold={hold} dir={dir} z={z} />
    </>
  );
}

/** The K.O. sticker, slammed down on what is left of the card. */
export function KoSticker({ rect, at, hold, seed }: { rect: Rect; at: number; hold: number; seed: number }) {
  useStage((s) => s.at(at + 100, (stage) => stage.add(stampDust({ at: center(rect), width: rect.width, seed: seed + 23, density: stage.density }))));
  return (
    <Fixed rect={rect} z={87}>
      <Stamp text="K.O." sticker={poster.red} ink={poster.paper} fill={FX_INK.gold}
        fontSize={clamp(Math.round(rect.width * 0.2), 14, 44)} at={at} dur={hold} top="50%" />
    </Fixed>
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

/** The mark's stacks ring the card, spin inward and gather into a glow,
 *  with motes drawn down out of the air after them. */
function DjinnConverge({ rect, stacks, at, dur, seed, z = 85 }: { rect: Rect; stacks: number; at: number; dur: number; seed: number; z?: number }) {
  const n = clamp(stacks, 1, 4);
  const amber = TAG_INFO.djinns_mark.ink;
  const r = rect.width * 0.44;
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const size = clamp(rect.width * 0.17, 18, 34);
  const glow = rect.width * 0.5;
  useStage((s) => s.at(at, (stage) => stage.add(castCharge({ at: center(rect), r: rect.width * 0.55, ink: amber, seed, dur, heavy: n >= 3, density: stage.density }))));
  return (
    <Fixed rect={rect} z={z}>
      {Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x0 = Math.cos(a) * r;
        const y0 = Math.sin(a) * r;
        return (
          <motion.div key={i}
            initial={{ x: x0, y: y0, scale: 1, opacity: 0, rotate: 0 }}
            animate={{ x: [x0, x0 * 0.75, 0], y: [y0, y0 * 0.75, 0], scale: [1.5, 1.2, 0.45], opacity: [0, 1, 1], rotate: [0, 120, 260] }}
            transition={{ duration: sec(dur), delay: sec(at), ease: [0.4, 0, 0.8, 1], times: [0, 0.35, 1] }}
            style={{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size, filter: 'drop-shadow(0 6px 3px rgba(0, 0, 0, 0.5))' }}
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

/** Sleep letters drifting off the card — Naptime's wake, and the Sleep stamp.
 *  They float up toward the viewer, growing as they come. */
export function SleepLetters({ rect, at, dur, ink, z = 86 }: { rect: Rect; at: number; dur: number; ink: string; z?: number }) {
  const size = clamp(rect.width * 0.13, 14, 26);
  return (
    <Fixed rect={rect} z={z}>
      {['z', 'Z', 'Z'].map((ch, i) => (
        <motion.div key={i}
          initial={{ opacity: 0, y: 0, x: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], y: [0, -14 - i * 10, -28 - i * 14], x: [0, 8 + i * 6, 14 + i * 8], scale: [0.6, 1, 1.2, 1.9] }}
          transition={{ duration: sec(dur * 0.9), delay: sec(at + i * 90), ease: 'easeOut', times: [0, 0.2, 0.7, 1] }}
          style={{
            position: 'absolute', right: rect.width * 0.18, top: rect.height * 0.22,
            fontFamily: fonts.display, fontSize: size * (0.8 + i * 0.25), color: ink,
            textShadow: `0 2px 0 rgba(0, 0, 0, 0.6), 0 ${6 + i * 3}px ${4 + i * 2}px rgba(0, 0, 0, 0.3)`, lineHeight: 1,
          }}
        >
          {ch}
        </motion.div>
      ))}
    </Fixed>
  );
}

/** Killing Blow — two slashes cut across the card before the hit lands,
 *  each one throwing sparks and strips of the print along its line. */
function ExecuteSlash({ rect, at, dur, seed, z = 86 }: { rect: Rect; at: number; dur: number; seed: number; z?: number }) {
  const w = rect.width;
  const h = rect.height;
  const d1 = `M ${-w * 0.2} ${-h * 0.1} L ${w * 1.2} ${h * 1.1}`;
  const d2 = `M ${w * 1.15} ${h * 0.1} L ${-w * 0.15} ${h * 0.9}`;
  const stroke = (d: string, color: string, width: number, delay: number) => (
    <motion.path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" fill="none"
      initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 0.95, 0.95, 0] }}
      transition={{ duration: sec(dur + 600), delay: sec(delay), times: [0, 0.25, 0.75, 1], ease: 'easeOut' }} />
  );
  useStage((s) => {
    const c = center(rect);
    [Math.atan2(h, w), Math.atan2(h * 0.8, -w)].forEach((along, i) => s.at(at + 70 + i * 110, (stage) => {
      stage.add(sparks({ at: c, seed: seed + 41 + i, count: 7, color: i ? FX_INK.cream : poster.red, dir: along, spread: 0.5, speed: [260, 560], lift: [80, 300], density: stage.density }));
      stage.add(chads({ at: c, seed: seed + 51 + i, count: 4, colors: [poster.frame, poster.red], dir: along, spread: 0.8, speed: [120, 300], density: stage.density }));
    }));
  });
  return (
    <Fixed rect={rect} z={z}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: 'drop-shadow(0 5px 3px rgba(0, 0, 0, 0.35))' }}>
        {stroke(d1, poster.ink, 10, at)}
        {stroke(d1, poster.red, 6, at)}
        {stroke(d2, poster.ink, 6, at + 110)}
        {stroke(d2, FX_INK.cream, 3, at + 110)}
      </svg>
    </Fixed>
  );
}
