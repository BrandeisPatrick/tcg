/**
 * Everything that happens on a card that is not a hit: a caster's skill
 * trigger (flare + ability plate), healing, a status landing as a stamp
 * (with a glyph or a flourish per status), a Shield deflect, an Unstoppable
 * shrug, a revive, a level-up, an equipment attach.
 */
import { motion } from 'framer-motion';
import type { FxTag, StatusFx, StatusId } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { poster } from '../../poster';
import { statusChipText } from '../../card/StatusIcon';
import { FX_INK, TAG_INFO } from './fxCatalog';
import { type Rect } from './geometry';
import { EASE_OUT, Fixed, LightningArc, Motes, Plate, Ring, Stamp, Wash, sec } from './primitives';
import { DjinnGlyph, SleepLetters, onInk } from './hits';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The name to print on a caster's plate — a hero's ability, a card's name. */
export function castLabel(cardId: string): string {
  const data = CARDS_BY_ID[cardId];
  if (!data) return '';
  return data.type === 'hero' ? (data.abilityName ?? 'Skill') : data.name;
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

export function CastFlare({ rect, ink, label, at, hold, heavy = false }: {
  rect: Rect; ink: string; label: string; at: number; hold: number; heavy?: boolean;
}) {
  const fontSize = clamp(rect.width * 0.075, 10, 13);
  return (
    <>
      <Fixed rect={rect} clip z={80}>
        <Wash color={ink} peak={heavy ? 0.6 : 0.45} at={at} dur={hold * 0.7} radial />
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
  return (
    <>
      <Fixed rect={rect} clip z={80}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, quiet ? 0.4 : 0.6, quiet ? 0.35 : 0.5, 0] }}
          transition={{ duration: sec(hold * 0.9), delay: sec(at), times: [0, 0.15, 0.6, 1] }}
          style={{ position: 'absolute', inset: 0, background: `linear-gradient(0deg, ${FX_INK.heal}, ${FX_INK.heal}44 55%, transparent 90%)` }}
        />
        {drawn && <Wash color={poster.red} peak={0.35} at={at} dur={320} />}
        {!quiet && <Ring size={rect.width * 0.6} color={FX_INK.heal} at={at} dur={600} from={0.5} to={1.5} width={2.5} />}
      </Fixed>
      <Fixed rect={rect} z={83}>
        <Motes origin={{ x: rect.width / 2, y: rect.height * 0.7 }} count={clamp(2 + amount, 3, 8)} seed={seed} color={FX_INK.heal} alt={FX_INK.cream}
          shape="cross" at={at} dur={quiet ? 1000 : 800} spread={[10, 50]} rise={quiet ? 20 : 40} size={10} angle={{ center: -Math.PI / 2, span: 1.6 }} />
      </Fixed>
    </>
  );
}

// ---------------------------------------------------------------------------
// Status stamps.
// ---------------------------------------------------------------------------

const UTILITY: Set<string> = new Set(['siphon_drain', 'siphon_gain', 'reverb', 'casting', 'casting_light']);

function statusInk(ev: StatusFx): string {
  if (UTILITY.has(ev.statusId)) return ev.statusId === 'casting' || ev.statusId === 'casting_light' ? FX_INK.spirit : poster.inkDim;
  return ev.debuff ? poster.status.debuff : poster.status.buff;
}

/** A small printed glyph over the stamp for the statuses that have one. */
function StatusGlyph({ id, color, size }: { id: StatusId; color: string; size: number }) {
  const s = { width: size, height: size, display: 'block' as const, filter: 'drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5))' };
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

/** Three stars circling above a stunned hero. */
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
        const xs = Array.from({ length: steps }, (_, k) => cx + Math.cos(a0 + (k / (steps - 1)) * Math.PI * 1.5) * r - size / 2);
        const ys = Array.from({ length: steps }, (_, k) => cy + Math.sin(a0 + (k / (steps - 1)) * Math.PI * 1.5) * r * 0.45 - size / 2);
        return (
          <motion.div key={i}
            initial={{ x: xs[0], y: ys[0], opacity: 0, scale: 0.6 }}
            animate={{ x: xs, y: ys, opacity: [0, 1, 1, 1, 0], scale: [0.6, 1, 0.9, 1, 0.6] }}
            transition={{ duration: sec(hold * 0.9), delay: sec(at), ease: 'linear' }}
            style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, filter: 'drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5))' }}
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

export function StatusStamp({ rect, ev, at, hold, index = 0 }: { rect: Rect; ev: StatusFx; at: number; hold: number; index?: number }) {
  const ink = statusInk(ev);
  const text = statusChipText(ev.statusId, ev.value);
  const fontSize = clamp(rect.width * 0.085, 10, 15);
  const glyphSize = clamp(rect.width * 0.2, 18, 34);
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
          <div style={{ position: 'absolute', left: '50%', top: `calc(${top} - ${glyphSize * 1.05}px)`, transform: 'translateX(-50%)' }}>
            <motion.div
              initial={{ scale: 0.4, opacity: 0, y: 6 }}
              animate={{ scale: [0.4, 1.15, 1, 1], opacity: [0, 1, 1, 0], y: [6, 0, 0, -4] }}
              transition={{ duration: sec(hold), delay: sec(at), times: [0, 0.15, 0.8, 1], ease: EASE_OUT }}
            >
              <StatusGlyph id={id} color={ink} size={glyphSize} />
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

/** A Shield ate part or all of a hit — the green glyph pops with the tally.
 *  `broken` cracks the glyph as it fades. Used by both the FX layer and the
 *  combat choreographer. */
export function ShieldDeflect({ rect, absorbed, fullyAbsorbed, broken = false, at, hold, z = 85 }: {
  rect: Rect; absorbed: number; fullyAbsorbed: boolean; broken?: boolean; at: number; hold: number; z?: number;
}) {
  const green = poster.green;
  const glyphSize = clamp(Math.round(rect.width * 0.42), 36, 72);
  const dur = hold * 0.85;
  return (
    <Fixed rect={rect} z={z}>
      <Fixed rect={{ left: 0, top: 0, width: rect.width, height: rect.height }} clip z={0} style={{ position: 'absolute' }}>
        <Wash color={green} peak={0.55} at={at} dur={dur} holdFrac={0.7} />
      </Fixed>
      <motion.div
        initial={{ scale: 0.55, opacity: 0 }}
        animate={{ scale: [0.55, 1.18, 1.05, 1.05], opacity: [0, 1, 1, 0], x: broken ? [0, 0, -3, 3, 0] : 0 }}
        transition={{ duration: sec(dur), delay: sec(at), times: [0, 0.18, 0.7, 1], ease: EASE_OUT }}
        style={{ position: 'absolute', left: '50%', top: '50%', width: glyphSize, height: glyphSize, marginLeft: -glyphSize / 2, marginTop: -glyphSize / 2, filter: 'drop-shadow(0 2px 0 rgba(0, 0, 0, 0.45))' }}
      >
        <svg viewBox="0 0 16 16" width="100%" height="100%">
          <path d="M8 1.2 L14 3 L14 8 C 14 11.5, 11.5 13.6, 8 14.8 C 4.5 13.6, 2 11.5, 2 8 L 2 3 Z" fill={green} stroke={poster.ink} strokeWidth="0.7" strokeLinejoin="round" />
          <path d="M8 2.4 L4 3.6 L4 7.5 C 4 8.4, 4.5 9.2, 5 9.8 L 5 4.4 Z" fill="rgba(242, 230, 203, 0.4)" />
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

export function ImmuneStamp({ rect, what, at, hold }: { rect: Rect; what: 'damage' | StatusId; at: number; hold: number }) {
  const text = what === 'damage' ? 'Unstoppable' : `Resisted · ${statusChipText(what)}`;
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
        <Motes origin={{ x: rect.width / 2, y: rect.height * 0.75 }} count={8} seed={seed} color={FX_INK.gold} alt={poster.green}
          shape="star" at={at + 60} dur={900} spread={[20, 70]} rise={50} size={10} angle={{ center: -Math.PI / 2, span: 2 }} />
        <Stamp text="Respawned" sticker={poster.green} ink={poster.ink} fontSize={clamp(rect.width * 0.085, 11, 15)} at={at + 160} dur={hold - 160} rotate={-4} />
      </Fixed>
    </>
  );
}

export function LevelUpBurst({ rect, level, at, hold, seed }: { rect: Rect; level: number; at: number; hold: number; seed: number }) {
  return (
    <>
      <Fixed rect={rect} clip z={80}>
        <Wash color={FX_INK.gold} peak={0.45} at={at} dur={hold * 0.7} radial />
        <Ring size={rect.width * 0.6} color={FX_INK.gold} at={at} dur={700} from={0.3} to={2.4} width={3.5} />
        <Ring size={rect.width * 0.6} color={FX_INK.cream} at={at + 140} dur={700} from={0.3} to={2} width={2} />
      </Fixed>
      <Fixed rect={rect} z={86}>
        <Motes origin={{ x: rect.width / 2, y: rect.height / 2 }} count={10} seed={seed} color={FX_INK.gold} alt={FX_INK.cream}
          shape="star" at={at} dur={850} spread={[30, 90]} rise={30} size={10} />
        <Stamp text={`Level ${level}`} sticker={FX_INK.gold} ink={poster.ink} fontSize={clamp(rect.width * 0.1, 12, 18)} at={at + 120} dur={hold - 120} rotate={-4} />
      </Fixed>
    </>
  );
}
