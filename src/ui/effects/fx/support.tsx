/**
 * Everything that happens on a card that is not a hit: a caster's skill
 * trigger (motes drawn down into the card, the flare, the ability plate
 * swinging up, the shockwave as it lets go), healing lifting off the card, a
 * status slapped on as a sticker (with a glyph or a flourish per status), a
 * Shield deflect, an Unstoppable shrug, a revive, a level-up, an equipment
 * attach. As with hits, the card carries the print and the FX stage throws
 * whatever leaves it.
 */
import { motion } from 'framer-motion';
import type { AbilityId, FxTag, StatusFx, StatusId } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { heroAbilities } from '@/engine/query';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { poster } from '../../poster';
import { statusChipText, statusClass } from '../../card/StatusIcon';
import { StatusMark, markFor } from '../../card/statusMarks';
import { FX_INK, FX_TIMING, NUMERAL_INK, TAG_INFO } from './fxCatalog';
import { useFxCalm } from './FxMotionContext';
import { type Rect, center, seeded } from './geometry';
import { EASE_OUT, Fixed, LightningArc, Numeral, Plate, Ring, Stamp, Wash, numeralSize, sec } from './primitives';
import { DjinnGlyph, SleepLetters, onInk } from './hits';
import { useStage } from './stage/FxStage';
import { castCharge, castRelease, embers, goldBurst, healRise, helix, puffs, ring, shieldSkid } from './stage/emitters';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The name to print on a caster's plate — a hero's ability, a card's name.
 *  `abilityId` names the ability a hero used (`G.action.abilityId`); left out,
 *  it is the hero's first. */
export function castLabel(cardId: string, abilityId?: AbilityId): string {
  const data = CARDS_BY_ID[cardId];
  if (!data) return '';
  if (data.type !== 'hero') return data.name;
  const kit = heroAbilities(data);
  return (kit.find((x) => x.ability.id === abilityId) ?? kit[0])?.ability.name ?? 'Skill';
}

/** The colour a cast draws in — a hero's identity for a skill or ult. */
export function castInk(cardId: string): string {
  const data = CARDS_BY_ID[cardId];
  if (data?.type === 'hero') return getHeroIdentity(cardId).primary;
  if (data?.type === 'ultimate') return getHeroIdentity(data.linkedHero).primary;
  return FX_INK.spirit;
}

// ---------------------------------------------------------------------------
// Cast — the skill trigger on the caster's card.
// ---------------------------------------------------------------------------

export function CastFlare({ rect, ink, label, at, hold, seed, heavy = false }: {
  rect: Rect; ink: string; label: string; at: number; hold: number; seed: number; heavy?: boolean;
}) {
  const fontSize = clamp(rect.width * 0.075, 10, 13);
  const charge = FX_TIMING.castCharge;
  // Power gathers out of the air into the card, then goes off along the table.
  useStage((s) => {
    const at0 = center(rect);
    const r = Math.hypot(rect.width, rect.height) / 2;
    s.at(at, (stage) => stage.add(castCharge({ at: at0, r, ink, seed, dur: charge, heavy, density: stage.density })));
    s.at(at + charge, (stage) => stage.add(castRelease({ at: at0, r, ink, seed: seed + 7, heavy, density: stage.density })));
  });
  return (
    <>
      <Fixed rect={rect} clip z={80}>
        <Wash color={ink} peak={heavy ? 0.6 : 0.45} at={at} dur={hold * 0.7} radial />
        <Wash color={FX_INK.cream} peak={0.5} at={at + charge - 30} dur={220} radial />
        <motion.div
          initial={{ x: '-130%' }}
          animate={{ x: ['-130%', '130%'] }}
          transition={{ duration: 0.45, delay: sec(at), ease: 'easeInOut' }}
          style={{
            position: 'absolute', top: 0, bottom: 0, width: '45%',
            background: `linear-gradient(115deg, transparent 30%, ${FX_INK.cream} 50%, transparent 70%)`,
            opacity: 0.55,
          }}
        />
      </Fixed>
      <Fixed rect={rect} z={83}>
        {[0, 130, ...(heavy ? [260] : [])].map((d, i) => (
          <motion.div key={i}
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: [1, 1.14 + i * 0.06], opacity: [0, 0.95, 0] }}
            transition={{ duration: 0.55, delay: sec(at + d), ease: 'easeOut', times: [0, 0.2, 1] }}
            style={{ position: 'absolute', inset: 0, borderRadius: 12, border: `3px solid ${ink}`, boxShadow: `0 0 18px ${ink}88` }}
          />
        ))}
        {label && <Plate text={label} keyline={ink} at={at + 40} dur={hold - 40} fontSize={fontSize} />}
      </Fixed>
    </>
  );
}

/** A gold sweep and ring on the hero who just got new gear. */
export function EquipGlint({ rect, at, hold }: { rect: Rect; at: number; hold: number }) {
  return (
    <>
      <Fixed rect={rect} clip z={80}>
        <motion.div
          initial={{ x: '-130%' }}
          animate={{ x: ['-130%', '130%'] }}
          transition={{ duration: 0.6, delay: sec(at), ease: 'easeInOut' }}
          style={{
            position: 'absolute', top: 0, bottom: 0, width: '45%',
            background: `linear-gradient(115deg, transparent 30%, ${FX_INK.gold} 50%, transparent 70%)`,
            opacity: 0.5,
          }}
        />
      </Fixed>
      <Fixed rect={rect} z={83}>
        <motion.div
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 1.1], opacity: [0, 0.9, 0] }}
          transition={{ duration: sec(Math.min(hold, 700)), delay: sec(at), ease: 'easeOut', times: [0, 0.2, 1] }}
          style={{ position: 'absolute', inset: 0, borderRadius: 12, border: `2.5px solid ${FX_INK.gold}` }}
        />
      </Fixed>
    </>
  );
}

// ---------------------------------------------------------------------------
// Heal.
// ---------------------------------------------------------------------------

export function HealGlow({ rect, amount, at, hold, tag, seed }: {
  rect: Rect; amount: number; at: number; hold: number; tag?: FxTag; seed: number;
}) {
  const drawn = tag === 'lifesteal';
  const quiet = tag === 'regen';
  useStage((s) => s.at(at, (stage) => stage.add(healRise({
    at: center(rect), width: rect.width, height: rect.height, seed, count: clamp(3 + amount, 4, 10), quiet, density: stage.density,
  }))));
  return (
    <>
      <Fixed rect={rect} clip z={80}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, quiet ? 0.4 : 0.6, quiet ? 0.35 : 0.5, 0] }}
          transition={{ duration: sec(hold * 0.9), delay: sec(at), times: [0, 0.15, 0.6, 1] }}
          style={{ position: 'absolute', inset: 0, background: `linear-gradient(0deg, ${FX_INK.heal}, ${FX_INK.heal}44 55%, transparent 90%)` }}
        />
        {/* Light climbing the card as the healing takes. */}
        {!quiet && (
          <motion.div
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: ['110%', '-60%'], opacity: [0, 0.7, 0.7, 0] }}
            transition={{ duration: 0.7, delay: sec(at), ease: 'easeOut', times: [0, 0.15, 0.7, 1] }}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '45%', background: `linear-gradient(0deg, transparent, ${FX_INK.cream}, transparent)` }}
          />
        )}
        {drawn && <Wash color={poster.red} peak={0.35} at={at} dur={320} />}
        {!quiet && <Ring size={rect.width * 0.6} color={FX_INK.heal} at={at} dur={600} from={0.5} to={1.5} width={2.5} />}
      </Fixed>
      {amount > 0 && (
        <Fixed rect={rect} z={89}>
          <Numeral text={`+${amount}`} ink={NUMERAL_INK.heal} at={at + 30} dur={Math.min(hold, 950)} size={numeralSize(rect)} top="34%" />
        </Fixed>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Status stamps.
// ---------------------------------------------------------------------------

/** The stamp's ink is the colour of the chip it lands as (`statusClass`, read
 *  off the status definition); a channel is spirit-purple whichever side it
 *  sits on. */
function statusInk(ev: StatusFx): string {
  if (ev.statusId === 'casting' || ev.statusId === 'casting_light') return FX_INK.spirit;
  const side = statusClass(ev.statusId);
  return side === 'utility' ? poster.inkDim : side === 'debuff' ? poster.status.debuff : poster.status.buff;
}

/** A small printed glyph over the stamp for the statuses that have one. Fixation,
 *  Dome, Rooted, Rabbit and Last Stand wear the same mark as their chip
 *  (statusMarks.tsx), an id the registry does not know wears its diamond tag, and
 *  the rest are drawn here. */
function StatusGlyph({ id, color, size, value }: { id: StatusId; color: string; size: number; value?: number }) {
  const s = { width: size, height: size, display: 'block' as const, filter: 'drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5))' };
  if (markFor(id)) {
    return (
      <div style={s}>
        <StatusMark id={id} color={color} outline={poster.ink} size={size} count={id === 'fixation' ? value : undefined} />
      </div>
    );
  }
  switch (id) {
    case 'shield':
      return <svg viewBox="0 0 16 16" style={s}><path d="M8 1.2 L14 3 L14 8 C 14 11.5, 11.5 13.6, 8 14.8 C 4.5 13.6, 2 11.5, 2 8 L 2 3 Z" fill={color} stroke={poster.ink} strokeWidth="0.8" /></svg>;
    case 'silenced':
      return <svg viewBox="0 0 16 16" style={s}><path d="M3 5 H11 A2 2 0 0 1 13 7 V9 A2 2 0 0 1 11 11 H7 L4 13.5 V11 H3 A2 2 0 0 1 1 9 V7 A2 2 0 0 1 3 5 Z" fill={FX_INK.cream} stroke={poster.ink} strokeWidth="0.8" /><line x1="2" y1="14" x2="14" y2="2" stroke={color} strokeWidth="2.2" strokeLinecap="round" /></svg>;
    case 'disarm':
      return <svg viewBox="0 0 16 16" style={s}><path d="M5 5 L8 1 L11 5 Z" fill={FX_INK.cream} /><rect x="5" y="5" width="6" height="9" rx="0.6" fill={FX_INK.cream} stroke={poster.ink} strokeWidth="0.6" /><line x1="2" y1="14" x2="14" y2="2" stroke={color} strokeWidth="2.2" strokeLinecap="round" /></svg>;
    case 'bleed':
      return <svg viewBox="0 0 16 16" style={s}><path d="M8 1 C 10.5 5, 13 8, 13 10.5 A5 5 0 0 1 3 10.5 C 3 8, 5.5 5, 8 1 Z" fill={color} stroke={poster.ink} strokeWidth="0.8" /></svg>;
    case 'healing_boost':
      return <svg viewBox="0 0 16 16" style={s}><path d="M6 1 H10 V6 H15 V10 H10 V15 H6 V10 H1 V6 H6 Z" fill={color} stroke={poster.ink} strokeWidth="0.8" /></svg>;
    case 'healing_boost_down':
      return <svg viewBox="0 0 16 16" style={s}><path d="M6 1 H10 V6 H15 V10 H10 V15 H6 V10 H1 V6 H6 Z" fill={FX_INK.cream} stroke={poster.ink} strokeWidth="0.8" /><line x1="2" y1="14" x2="14" y2="2" stroke={color} strokeWidth="2.2" strokeLinecap="round" /></svg>;
    case 'weapon_power': case 'spirit_power': case 'bullet_resist': case 'spirit_resist':
      return <svg viewBox="0 0 16 16" style={s}><path d="M8 2 L14 9 H10 V14 H6 V9 H2 Z" fill={color} stroke={poster.ink} strokeWidth="0.8" strokeLinejoin="round" /></svg>;
    case 'weapon_power_down': case 'spirit_power_down': case 'bullet_resist_down': case 'spirit_resist_down':
      return <svg viewBox="0 0 16 16" style={s}><path d="M8 14 L2 7 H6 V2 H10 V7 H14 Z" fill={color} stroke={poster.ink} strokeWidth="0.8" strokeLinejoin="round" /></svg>;
    case 'charged':
      return <svg viewBox="0 0 16 16" style={s}><path d="M9 1 L3 9 H7.5 L6 15 L13 6 H8.5 Z" fill={FX_INK.lightning} stroke={poster.ink} strokeWidth="0.8" strokeLinejoin="round" /></svg>;
    case 'siphon_drain': case 'siphon_gain':
      return <svg viewBox="0 0 16 16" style={s}><path d="M8 14 C 4 11, 1 9, 1 5.5 C 1 3, 3 1, 5 1 C 6.5 1, 7.5 2, 8 3 C 8.5 2, 9.5 1, 11 1 C 13 1, 15 3, 15 5.5 C 15 9, 12 11, 8 14 Z" fill={id === 'siphon_gain' ? poster.red : poster.inkDim} stroke={poster.ink} strokeWidth="0.8" /></svg>;
    default:
      return null;
  }
}

/** Three stars circling above a stunned hero — an orbit seen edge-on, so
 *  each star swells as it swings round the near side and passes behind. */
function StunStars({ rect, at, hold }: { rect: Rect; at: number; hold: number }) {
  const r = rect.width * 0.22;
  const cx = rect.width / 2;
  const cy = rect.height * 0.2;
  const size = clamp(rect.width * 0.09, 10, 16);
  return (
    <>
      {[0, 1, 2].map((i) => {
        const a0 = (i / 3) * Math.PI * 2;
        const steps = 5;
        const ang = (k: number) => a0 + (k / (steps - 1)) * Math.PI * 1.5;
        const xs = Array.from({ length: steps }, (_, k) => cx + Math.cos(ang(k)) * r - size / 2);
        const ys = Array.from({ length: steps }, (_, k) => cy + Math.sin(ang(k)) * r * 0.45 - size / 2);
        // sin > 0 is the near side of the orbit.
        const depth = Array.from({ length: steps }, (_, k) => 1 + Math.sin(ang(k)) * 0.38);
        return (
          <motion.div key={i}
            initial={{ x: xs[0], y: ys[0], opacity: 0, scale: 0.6 }}
            animate={{ x: xs, y: ys, opacity: [0, 1, 1, 1, 0], scale: depth }}
            transition={{ duration: sec(hold * 0.9), delay: sec(at), ease: 'linear' }}
            style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, filter: 'drop-shadow(0 7px 3px rgba(0, 0, 0, 0.4))' }}
          >
            <svg viewBox="0 0 20 20" width="100%" height="100%"><path d="M10 1 L12.4 7.2 L19 7.6 L13.8 11.8 L15.6 18.5 L10 14.8 L4.4 18.5 L6.2 11.8 L1 7.6 L7.6 7.2 Z" fill={FX_INK.gold} stroke={poster.ink} strokeWidth="1" strokeLinejoin="round" /></svg>
          </motion.div>
        );
      })}
    </>
  );
}

/** A slow dashed ring around a channelling hero. */
function ChannelRing({ rect, at, hold, ink }: { rect: Rect; at: number; hold: number; ink: string }) {
  const size = rect.width * 0.78;
  return (
    <motion.div
      initial={{ opacity: 0, rotate: 0, scale: 0.8 }}
      animate={{ opacity: [0, 0.9, 0.9, 0], rotate: 220, scale: [0.8, 1, 1, 1.05] }}
      transition={{ duration: sec(hold), delay: sec(at), ease: 'linear', times: [0, 0.15, 0.8, 1] }}
      style={{ position: 'absolute', left: '50%', top: '50%', width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, borderRadius: '50%', border: `3px dashed ${ink}` }}
    />
  );
}

// ---------------------------------------------------------------------------
// Flourishes for the statuses that arrive with a picture of their own. Each is
// printed inside the card's clipped box (Dome, Fixation, Rooted, Rabbit, Last
// Stand); under calm motion only the wash, the mark and the sticker remain.
// ---------------------------------------------------------------------------

/** Dome: its outline draws itself up over the card from the base while the
 *  light under it swells, and a ring runs out along the table. */
function DomeRise({ rect, at, hold, ink }: { rect: Rect; at: number; hold: number; ink: string }) {
  const calm = useFxCalm();
  useStage((s) => s.at(at, (stage) => stage.add(ring({ at: center(rect), r0: rect.width * 0.35, r1: rect.width * 0.85, color: ink, width: 4, life: 560 }))));
  if (calm) return null;
  const { width: w, height: h } = rect;
  const arc = `M ${w * 0.05} ${h * 0.94} C ${w * 0.05} ${h * 0.02}, ${w * 0.95} ${h * 0.02}, ${w * 0.95} ${h * 0.94}`;
  const tr = { duration: sec(hold * 0.8), delay: sec(at), times: [0, 0.28, 0.78, 1], ease: 'easeOut' as const };
  const stroke = (color: string, width: number) => (
    <motion.path d={arc} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 1, 1, 0] }} transition={tr} />
  );
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: [0, 0.5, 0.4, 0] }} transition={tr}
        style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 62% 78% at 50% 100%, ${ink}, transparent 74%)` }}
      />
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {stroke(poster.ink, 9)}
        {stroke(ink, 5)}
        {stroke(FX_INK.cream, 1.6)}
      </svg>
    </>
  );
}

/** Fixation: a ring closes in from beyond the card on its middle while a
 *  crosshair flashes through it — the mark has found its target. */
function LockOn({ rect, at, hold, ink }: { rect: Rect; at: number; hold: number; ink: string }) {
  const calm = useFxCalm();
  if (calm) return null;
  const tr = { duration: sec(hold * 0.55), delay: sec(at + 140), times: [0, 0.2, 0.7, 1], ease: EASE_OUT };
  const bar = { position: 'absolute' as const, background: ink, boxShadow: `0 0 0 1.5px ${poster.ink}` };
  return (
    <>
      <Ring size={rect.width * 0.62} color={poster.ink} at={at} dur={520} from={2.1} to={0.8} width={8} peak={0.8} />
      <Ring size={rect.width * 0.62} color={ink} at={at} dur={520} from={2.1} to={0.8} width={4} peak={1} />
      <motion.div
        initial={{ opacity: 0, scaleX: 0.2 }} animate={{ opacity: [0, 1, 1, 0], scaleX: [0.2, 1, 1, 1] }} transition={tr}
        style={{ ...bar, left: 0, right: 0, top: '50%', height: 3, marginTop: -1.5 }}
      />
      <motion.div
        initial={{ opacity: 0, scaleY: 0.2 }} animate={{ opacity: [0, 1, 1, 0], scaleY: [0.2, 1, 1, 1] }} transition={tr}
        style={{ ...bar, top: 0, bottom: 0, left: '50%', width: 3, marginLeft: -1.5 }}
      />
    </>
  );
}

/** Rooted: roots break through the paper at the card's foot and climb it —
 *  each a curling stem that throws off a pair of shorter ones as it climbs. */
function RootsGrow({ rect, at, hold, ink, seed }: { rect: Rect; at: number; hold: number; ink: string; seed: number }) {
  const calm = useFxCalm();
  useStage((s) => s.at(at + 60, (stage) => stage.add(puffs({
    at: { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.96 }, seed, count: 7, speed: [30, 110], size: [8, 15], density: stage.density,
  }))));
  if (calm) return null;
  const { width: w, height: h } = rect;
  const rng = seeded(seed);
  type Pt = [number, number];
  /** A point `t` of the way along the cubic p0 to p3 (controls p1, p2). */
  const along = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]) as Pt;
  };
  const strokes: { d: string; width: number; delay: number }[] = [];
  [0.2, 0.5, 0.8].forEach((fx, i) => {
    const x = w * fx;
    const sway = (i % 2 ? -1 : 1) * w * (0.1 + rng() * 0.08);
    const top = h * (0.34 + rng() * 0.18);
    const p0: Pt = [x, h + 4], p1: Pt = [x + sway, h * 0.8], p2: Pt = [x - sway * 0.8, h * 0.58], p3: Pt = [x + sway * 0.3, top];
    strokes.push({ d: `M ${p0} C ${p1} ${p2} ${p3}`, width: 5, delay: i * 90 });
    // Two shorter roots leave the stem, one to each side, as it climbs.
    ([[0.42, -1], [0.7, 1]] as const).forEach(([t, side], k) => {
      const [bx, by] = along(p0, p1, p2, p3, t);
      const reach = w * (0.12 + rng() * 0.06);
      strokes.push({ d: `M ${bx} ${by} Q ${bx + side * reach * 0.4} ${by - h * 0.1} ${bx + side * reach} ${by - h * 0.13}`, width: 3, delay: i * 90 + 260 + k * 110 });
    });
  });
  return (
    <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      {strokes.flatMap((st, i) => [{ color: poster.ink, width: st.width + 4 }, { color: ink, width: st.width }].map((line) => (
        <motion.path key={`${i}-${line.width}`} d={st.d} fill="none" stroke={line.color} strokeWidth={line.width} strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: [0, 1, 1, 1], opacity: [0, 1, 1, 0] }}
          transition={{ duration: sec(hold * 0.8), delay: sec(at + st.delay), times: [0, 0.3, 0.78, 1], ease: 'easeOut' }} />
      )))}
    </svg>
  );
}

/** Rabbit: a puff of white smoke where the hero stood. */
function RabbitPoof({ rect, at, seed }: { rect: Rect; at: number; seed: number }) {
  useStage((s) => s.at(at, (stage) => stage.add(puffs({
    at: center(rect), seed, count: 12, ring: rect.width * 0.12, speed: [60, 170], size: [16, 30], life: [0.5, 0.9],
    color: 'rgba(246, 240, 226, 0.85)', density: stage.density,
  }))));
  return <Wash color={FX_INK.cream} peak={0.7} at={at} dur={420} radial />;
}

/** Last Stand: columns of light climb the card and embers rise off it — a
 *  charge building toward the strike. */
function ChargeRise({ rect, at, hold, seed }: { rect: Rect; at: number; hold: number; seed: number }) {
  const calm = useFxCalm();
  useStage((s) => s.at(at, (stage) => stage.add(embers({
    at: center(rect), seed, count: 12, color: FX_INK.gold, radius: [0, rect.width * 0.4], lift: [220, 400], size: [2, 3.4], density: stage.density,
  }))));
  if (calm) return null;
  return (
    <>
      {[0.22, 0.5, 0.78].map((fx, i) => (
        <motion.div key={i}
          initial={{ y: '115%', opacity: 0 }}
          animate={{ y: ['115%', '-70%'], opacity: [0, 0.85, 0.85, 0] }}
          transition={{ duration: sec(Math.min(hold, 900) * 0.85), delay: sec(at + i * 110), ease: 'easeOut', times: [0, 0.2, 0.7, 1] }}
          style={{
            position: 'absolute', left: `${fx * 100}%`, marginLeft: -rect.width * 0.045, width: rect.width * 0.09, top: 0, height: '55%',
            background: `linear-gradient(0deg, transparent, ${FX_INK.gold} 35%, ${FX_INK.cream} 60%, transparent)`,
          }}
        />
      ))}
    </>
  );
}

export function StatusStamp({ rect, ev, at, hold, index = 0 }: { rect: Rect; ev: StatusFx; at: number; hold: number; index?: number }) {
  const ink = statusInk(ev);
  const text = statusChipText(ev.statusId, ev.value);
  const fontSize = clamp(rect.width * 0.085, 10, 15);
  const glyphSize = clamp(rect.width * 0.2, 18, 34);
  // A mark is line art, so it stands clear of the sticker instead of tucking
  // behind its edge as the solid glyphs do.
  const marked = !!markFor(ev.statusId);
  const top = `${46 + index * 15}%`;
  const id = ev.statusId;
  const discharge = ev.tag === 'discharge';
  return (
    <>
      {/* Flourishes per status, behind the sticker. */}
      {discharge && (
        <>
          <LightningArc from={{ x: rect.left + rect.width * 0.3, y: rect.top - 40 }} to={{ x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 }} at={at - 60} dur={280} seed={ev.seq} />
          <LightningArc from={{ x: rect.left + rect.width * 0.8, y: rect.top - 30 }} to={{ x: rect.left + rect.width * 0.55, y: rect.top + rect.height * 0.45 }} at={at + 40} dur={280} seed={ev.seq + 1} />
          <Fixed rect={rect} clip z={80}><Wash color={FX_INK.lightning} peak={0.7} at={at - 40} dur={260} /></Fixed>
        </>
      )}
      <Fixed rect={rect} clip z={80}>
        <Wash color={ink} peak={0.32} at={at} dur={hold * 0.8} />
        {(id === 'casting' || id === 'casting_light') && <ChannelRing rect={rect} at={at} hold={hold} ink={FX_INK.spirit} />}
        {id === 'unstoppable' && (
          <>
            <Ring size={rect.width * 0.6} color={FX_INK.gold} at={at} dur={700} from={0.4} to={2} width={3} />
            <Ring size={rect.width * 0.6} color={FX_INK.cream} at={at + 140} dur={700} from={0.4} to={1.8} width={2} />
          </>
        )}
        {id === 'reverb' && <Ring size={rect.width * 0.6} color={FX_INK.spirit} at={at} dur={800} from={0.3} to={1.9} width={2.5} dashed />}
        {id === 'dome' && <DomeRise rect={rect} at={at} hold={hold} ink={ink} />}
        {id === 'fixation' && <LockOn rect={rect} at={at} hold={hold} ink={ink} />}
        {id === 'rooted' && <RootsGrow rect={rect} at={at} hold={hold} ink={ink} seed={ev.seq} />}
        {id === 'rabbit' && <RabbitPoof rect={rect} at={at} seed={ev.seq} />}
        {id === 'last_stand' && <ChargeRise rect={rect} at={at} hold={hold} seed={ev.seq} />}
      </Fixed>
      <Fixed rect={rect} z={86}>
        {id === 'stun' && <StunStars rect={rect} at={at} hold={hold} />}
        {id === 'sleep' && <SleepLetters rect={rect} at={at} dur={hold} ink={TAG_INFO.naptime.ink} z={86} />}
        {id === 'djinns_mark' && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: `calc(${top} - ${glyphSize * 1.15}px)`, display: 'flex', justifyContent: 'center', gap: 4 }}>
            {Array.from({ length: clamp(ev.value, 1, 4) }, (_, i) => (
              <motion.div key={i}
                initial={{ scale: 0.4, opacity: 0, y: 6 }}
                animate={{ scale: [0.4, 1.15, 1, 1], opacity: [0, 1, 1, 0], y: [6, 0, 0, -4] }}
                transition={{ duration: sec(hold), delay: sec(at + i * 70), times: [0, 0.15, 0.8, 1], ease: EASE_OUT }}
                style={{ width: glyphSize * 0.75, height: glyphSize * 0.75, filter: 'drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5))' }}
              >
                <DjinnGlyph color={TAG_INFO.djinns_mark.ink} />
              </motion.div>
            ))}
          </div>
        )}
        {id !== 'stun' && id !== 'sleep' && id !== 'djinns_mark' && (
          <div style={{ position: 'absolute', left: '50%', top: `calc(${top} - ${glyphSize * 1.05 + (marked ? 12 : 0)}px)`, transform: 'translateX(-50%)' }}>
            <motion.div
              initial={{ scale: 0.4, opacity: 0, y: 6 }}
              animate={{ scale: [0.4, 1.15, 1, 1], opacity: [0, 1, 1, 0], y: [6, 0, 0, -4] }}
              transition={{ duration: sec(hold), delay: sec(at), times: [0, 0.15, 0.8, 1], ease: EASE_OUT }}
            >
              <StatusGlyph id={id} color={ink} size={marked ? glyphSize * 1.12 : glyphSize} value={ev.value} />
            </motion.div>
          </div>
        )}
        <Stamp text={discharge ? `Discharge · ${text}` : text} sticker={ink} ink={onInk(ink)} fontSize={fontSize} at={at} dur={hold} top={top} rotate={-6 + index * 3} />
      </Fixed>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shield deflect, Unstoppable shrug.
// ---------------------------------------------------------------------------

/** A Shield ate part or all of a hit — the green glyph swings up in front
 *  of the card with the tally, sparks skid off across the table, and when it
 *  is `broken` the glyph cracks as it fades and the shield comes apart. Used
 *  by both the FX layer and the combat choreographer. */
export function ShieldDeflect({ rect, absorbed, fullyAbsorbed, broken = false, at, hold, seed = 1, z = 85 }: {
  rect: Rect; absorbed: number; fullyAbsorbed: boolean; broken?: boolean; at: number; hold: number; seed?: number; z?: number;
}) {
  const green = poster.green;
  const glyphSize = clamp(Math.round(rect.width * 0.42), 36, 72);
  const dur = hold * 0.85;
  useStage((s) => s.at(at, (stage) => stage.add(shieldSkid({ at: center(rect), r: rect.width / 2, seed, broken, density: stage.density }))));
  return (
    <Fixed rect={rect} z={z}>
      <Fixed rect={{ left: 0, top: 0, width: rect.width, height: rect.height }} clip z={0} style={{ position: 'absolute' }}>
        <Wash color={green} peak={0.55} at={at} dur={dur} holdFrac={0.7} radial />
      </Fixed>
      <motion.div
        initial={{ scale: 0.4, opacity: 0, rotateY: 80 }}
        animate={{ scale: [0.4, 1.3, 1.1, 1.1], opacity: [0, 1, 1, 0], rotateY: [80, -12, 0, 0], x: broken ? [0, 0, -3, 3] : 0 }}
        transition={{ duration: sec(dur), delay: sec(at), times: [0, 0.18, 0.7, 1], ease: EASE_OUT }}
        style={{
          position: 'absolute', left: '50%', top: '50%', width: glyphSize, height: glyphSize, marginLeft: -glyphSize / 2, marginTop: -glyphSize / 2,
          transformPerspective: 460, filter: 'drop-shadow(0 10px 5px rgba(0, 0, 0, 0.45))',
        }}
      >
        <svg viewBox="0 0 16 16" width="100%" height="100%">
          <path d="M8 1.2 L14 3 L14 8 C 14 11.5, 11.5 13.6, 8 14.8 C 4.5 13.6, 2 11.5, 2 8 L 2 3 Z" fill={green} stroke={poster.ink} strokeWidth="0.7" strokeLinejoin="round" />
          <path d="M8 2.4 L4 3.6 L4 7.5 C 4 8.4, 4.5 9.2, 5 9.8 L 5 4.4 Z" fill="rgba(242, 230, 203, 0.4)" />
          <path d="M8 2.4 L12 3.6 L12 8 C 12 10.6, 10.4 12.2, 8 13.2 Z" fill="rgba(0, 0, 0, 0.16)" />
          {broken && (
            <motion.path d="M7 2 L8.5 6 L6.5 8.5 L9 12.5 L8 14.5" fill="none" stroke={poster.ink} strokeWidth="1.1" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: sec(at + 200) }} />
          )}
        </svg>
      </motion.div>
      <Stamp
        text={`${fullyAbsorbed ? 'Blocked' : 'Absorbed'} ${absorbed}${broken ? ' · broke' : ''}`}
        sticker={poster.ink} ink={green} fontSize={clamp(rect.width * 0.075, 10, 12)}
        at={at + 60} dur={dur - 60} top={`calc(50% + ${glyphSize * 0.75}px)`} rotate={0}
      />
    </Fixed>
  );
}

export function ImmuneStamp({ rect, what, at, hold, seed = 1 }: { rect: Rect; what: 'damage' | StatusId; at: number; hold: number; seed?: number }) {
  const text = what === 'damage' ? 'Unstoppable' : `Resisted · ${statusChipText(what)}`;
  useStage((s) => s.at(at, (stage) => stage.add(goldBurst({ at: center(rect), r: rect.width / 2, seed, density: stage.density }))));
  return (
    <>
      <Fixed rect={rect} clip z={80}>
        <Wash color={FX_INK.gold} peak={0.4} at={at} dur={hold * 0.8} />
        <Ring size={rect.width * 0.6} color={FX_INK.gold} at={at} dur={640} from={0.4} to={2.1} width={3} />
        <Ring size={rect.width * 0.6} color={FX_INK.cream} at={at + 120} dur={640} from={0.4} to={1.9} width={2} />
      </Fixed>
      <Fixed rect={rect} z={86}>
        <Stamp text={text} sticker={FX_INK.gold} ink={poster.ink} fontSize={clamp(rect.width * 0.08, 10, 14)} at={at} dur={hold} rotate={-4} />
      </Fixed>
    </>
  );
}

// ---------------------------------------------------------------------------
// Revive, level-up.
// ---------------------------------------------------------------------------

export function ReviveRays({ rect, at, hold, seed }: { rect: Rect; at: number; hold: number; seed: number }) {
  const size = Math.max(rect.width, rect.height) * 1.6;
  useStage((s) => s.at(at + 60, (stage) => {
    const c = center(rect);
    stage.add(helix({ at: c, r: rect.width * 0.5, seed, count: 14, color: FX_INK.gold, density: stage.density }));
    stage.add(helix({ at: c, r: rect.width * 0.34, seed: seed + 3, count: 8, color: poster.green, density: stage.density }));
    stage.add(goldBurst({ at: c, r: rect.width / 2, seed: seed + 5, density: stage.density }));
  }));
  return (
    <>
      <Fixed rect={rect} clip z={80}>
        <Wash color={FX_INK.cream} peak={0.7} at={at} dur={400} />
        <motion.div
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: [0, 0.5, 0.45, 0], rotate: 60 }}
          transition={{ duration: sec(hold), delay: sec(at), ease: 'linear', times: [0, 0.15, 0.75, 1] }}
          style={{
            position: 'absolute', left: '50%', top: '50%', width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
            borderRadius: '50%',
            background: `repeating-conic-gradient(from 0deg, ${FX_INK.gold} 0deg 12deg, transparent 12deg 30deg)`,
            maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
          }}
        />
        <Ring size={rect.width * 0.6} color={poster.green} at={at + 80} dur={800} from={0.3} to={2.2} width={3} />
      </Fixed>
      <Fixed rect={rect} z={86}>
        <Stamp text="Respawned" sticker={poster.green} ink={poster.ink} fontSize={clamp(rect.width * 0.085, 11, 15)} at={at + 160} dur={hold - 160} rotate={-4} />
      </Fixed>
    </>
  );
}

export function LevelUpBurst({ rect, level, at, hold, seed }: { rect: Rect; level: number; at: number; hold: number; seed: number }) {
  useStage((s) => s.at(at, (stage) => {
    const c = center(rect);
    stage.add(goldBurst({ at: c, r: rect.width / 2, seed, density: stage.density }));
    stage.add(helix({ at: c, r: rect.width * 0.46, seed: seed + 3, count: 12, color: FX_INK.gold, density: stage.density }));
  }));
  return (
    <>
      <Fixed rect={rect} clip z={80}>
        <Wash color={FX_INK.gold} peak={0.45} at={at} dur={hold * 0.7} radial />
        <Ring size={rect.width * 0.6} color={FX_INK.gold} at={at} dur={700} from={0.3} to={2.4} width={3.5} />
        <Ring size={rect.width * 0.6} color={FX_INK.cream} at={at + 140} dur={700} from={0.3} to={2} width={2} />
      </Fixed>
      <Fixed rect={rect} z={86}>
        <Stamp text={`Level ${level}`} sticker={FX_INK.gold} ink={poster.ink} fontSize={clamp(rect.width * 0.1, 12, 18)} at={at + 120} dur={hold - 120} rotate={-4} />
      </Fixed>
    </>
  );
}
