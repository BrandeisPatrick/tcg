import { motion } from 'framer-motion';
import type { PlayerState, Structure, StructureKind } from '@/engine/types';
import { structureHp } from '@/engine/query';
import { fonts } from '../tokens';
import { poster, soulCoin } from '../poster';
import { MapIcon } from './MapIcon';
import { RejuvenatorMark } from './RejuvenatorMark';
import { useStatTick } from './useStatTick';

const NAME: Record<StructureKind, string> = { guardian: 'Guardian', walker: 'Walker', patron: 'Patron' };

/**
 * A side's name bar — Pokémon TCG Pocket's thin bar at the top (the rival's)
 * and the bottom (yours), where it shows the name, three point dots and a
 * timer. Ours carries the name, the side's MAP TRACK as three small marks
 * with their HP (Guardian · Walker · Patron, front first; a fallen one is
 * struck through), the Rejuvenator while the side holds one, the rival's
 * souls, and the turn number. An ink pill on the paper, in the owner's ink.
 */
export function NameBar({ label, ps, hostile, turn, souls, myTurn, style }: {
  label: string;
  ps: PlayerState;
  hostile?: boolean;
  /** The turn number, printed small at the bar's end. */
  turn?: number;
  /** The side's souls, printed as a coin and a numeral (the rival's bar;
   *  yours has the round counter). */
  souls?: number;
  /** Whose turn it is: the dot lights in the owner's ink. */
  myTurn?: boolean;
  style?: React.CSSProperties;
}) {
  const accent = hostile ? poster.rival : poster.you;
  const track = ps.structures.filter((s) => s.max > 0);
  const said = track.map((s) => `${NAME[s.kind]} ${s.hp <= 0 ? 'down' : `${s.hp} of ${s.max}`}`).join(', ');
  return (
    <div
      role="img"
      aria-label={`${label}: ${structureHp(ps)} structure HP — ${said}${turn ? `. Turn ${turn}` : ''}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        height: 26,
        padding: '0 9px 0 8px',
        background: 'rgba(23, 20, 16, 0.9)',
        color: poster.cream,
        borderRadius: 13,
        boxShadow: `0 0 0 1px ${accent}66, 0 3px 8px rgba(0, 0, 0, 0.35)`,
        fontFamily: fonts.ui,
        fontSize: 11,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {/* The side: a dot in its ink (lit while it is its turn) and its name. */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <motion.span
          aria-hidden
          animate={myTurn ? { opacity: [0.55, 1, 0.55] } : { opacity: 0.45 }}
          transition={myTurn ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }}
        />
        <span style={{ fontFamily: fonts.display, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent }}>
          {label}
        </span>
      </span>

      {/* The map track: three marks, front first. */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flex: '1 1 auto', minWidth: 0 }}>
        {track.map((s) => <Mark key={s.kind} s={s} accent={accent} />)}
        <RejuvenatorMark ps={ps} isMobile />
      </span>

      {souls !== undefined && (
        <span title="Souls" aria-label={`Souls: ${souls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          <span style={{ ...soulCoin(9), borderColor: poster.cream }} />
          {souls}
        </span>
      )}
      {turn !== undefined && (
        <span style={{ fontFamily: fonts.display, fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: poster.creamDim, flexShrink: 0 }}>
          T{turn}
        </span>
      )}
    </div>
  );
}

/** One structure: its icon and its HP, struck through once it has fallen;
 *  the number jolts as a push lands. */
function Mark({ s, accent }: { s: Structure; accent: string }) {
  const down = s.hp <= 0;
  const tick = useStatTick(s.hp);
  return (
    <span title={`${NAME[s.kind]}: ${down ? 'down' : `${s.hp} of ${s.max}`}`} style={{
      position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
      opacity: down ? 0.5 : 1,
    }}>
      <MapIcon kind={s.kind} size={14} ink={down ? poster.creamFaint : accent} grey={down} ground={poster.panel} />
      <motion.span
        animate={tick === 'down' ? { scale: [1, 1.25, 1], x: [0, -1, 1, 0] } : { scale: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: 'inline-block', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: down ? poster.creamDim : poster.cream, minWidth: 8 }}
      >
        {Math.max(0, s.hp)}
      </motion.span>
      {down && (
        <span aria-hidden data-struck={s.kind} style={{
          position: 'absolute', left: -1, right: -1, top: '50%', height: 1.5, marginTop: -0.75,
          background: poster.cream, opacity: 0.8, pointerEvents: 'none',
        }} />
      )}
    </span>
  );
}
