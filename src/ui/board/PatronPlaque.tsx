import { motion } from 'framer-motion';
import type { GameState, PlayerID } from '@/engine/types';
import { fonts, text } from '../tokens';
import { poster, soulCoin } from '../poster';
import { useStatTick } from './useStatTick';

/**
 * A patron's vitals as one narrow rule across the sheet — the rival's above
 * the top bench, yours below the bottom one. It carries everything the side
 * panel used to duplicate (patron HP, deck, discard, hand, souls, skill
 * readiness) in glyphs and numerals rather than labelled rows, so the board
 * is self-sufficient and the panel is free to be just the log.
 *
 * Sits inside the board's row stack as a real flex row, so nothing overlaps
 * the sheet's edge the way the old corner plate did.
 */
export function PatronPlaque({
  label, ps, hostile, skillUsed, projectedFaceDamage, isMobile, myTurn,
}: {
  label: string;
  ps: GameState['players'][PlayerID];
  hostile?: boolean;
  /** Player-wide "a skill was used this turn" flag for this patron's side. */
  skillUsed: boolean;
  projectedFaceDamage?: number;
  /** Which end of the board this row sits at. */
  side: 'top' | 'bottom';
  isMobile: boolean;
  /** Highlight while it's this patron's turn. */
  myTurn?: boolean;
}) {
  const accent = hostile ? poster.rival : poster.you;
  const hpFrac = Math.max(0, Math.min(1, ps.hp / ps.hpMax));
  const projectedHp = Math.max(0, ps.hp - (projectedFaceDamage ?? 0));
  const projectedFrac = Math.max(0, Math.min(1, projectedHp / ps.hpMax));
  const hasIncoming = !!projectedFaceDamage && projectedFaceDamage > 0;

  // Same tick language as the hero cards: bright on heal, grey on damage.
  const hpTick = useStatTick(ps.hp);
  const hpFlash = hpTick === 'down' ? poster.stat.hpDim
    : hpTick === 'up' ? poster.stat.hpBright
    : poster.stat.hp;

  const num = isMobile ? 13 : 15;
  const glyph = isMobile ? 11 : 12;

  return (
    <div
      aria-label={`${label}: ${ps.hp} of ${ps.hpMax} HP`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? 8 : 14,
        height: '100%',
        padding: isMobile ? '0 6px' : '0 12px',
        // A hairline rule, inked in the owner's colour while it's their turn.
        borderTop: `1.5px solid ${myTurn ? accent : poster.inkRule}`,
        pointerEvents: 'none',
      }}
    >
      {/* Patron — a dot and the name, in the owner's ink. */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        ...text.label,
        fontSize: isMobile ? 9 : 10.5,
        letterSpacing: '0.18em',
        color: accent,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        {label}
      </span>

      {/* HP — numeral, then the bar taking the slack so the two rows line up. */}
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
        <motion.span
          style={{
            fontFamily: fonts.ui,
            fontWeight: 800,
            fontSize: num,
            fontVariantNumeric: 'tabular-nums',
            color: poster.stat.hp,
            lineHeight: 1,
            display: 'inline-block',
          }}
          animate={hpTick
            ? { scale: [1, 1.3, 1], color: [poster.stat.hp, hpFlash, poster.stat.hp] }
            : { scale: 1, color: poster.stat.hp }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >{ps.hp}</motion.span>
        <span style={{
          fontFamily: fonts.ui, fontWeight: 700, fontSize: glyph - 1, color: poster.inkFaint,
        }}>/{ps.hpMax}</span>
      </span>

      <span style={{
        position: 'relative',
        flex: 1,
        minWidth: 24,
        height: 5,
        background: poster.inkRule,
        overflow: 'hidden',
      }}>
        <span style={{
          position: 'absolute', inset: 0,
          width: `${hpFrac * 100}%`,
          background: poster.stat.hp,
          transition: 'width 240ms ease',
        }} />
        {/* Incoming face damage — the slice about to be lost, hatched off. */}
        {hasIncoming && (
          <span style={{
            position: 'absolute',
            top: 0, bottom: 0,
            left: `${projectedFrac * 100}%`,
            width: `${(hpFrac - projectedFrac) * 100}%`,
            background: `repeating-linear-gradient(115deg, ${poster.paperBand} 0 3px, ${poster.stat.hp} 3px 6px)`,
          }} />
        )}
      </span>

      {/* Counts — glyph plus numeral, no labels. */}
      <Stat glyph={<DeckGlyph size={glyph} />} value={ps.deck.length} title="Deck" size={glyph} />
      <Stat glyph={<DiscardGlyph size={glyph} />} value={ps.discard.length} title="Discard" size={glyph} />
      <Stat glyph={<HandGlyph size={glyph} />} value={ps.hand.length} title="Hand" size={glyph} />
      <Stat
        glyph={<span style={soulCoin(glyph - 2)} />}
        value={ps.souls}
        title="Souls"
        size={glyph}
      />

      {/* Skill readiness — the one state that isn't a number. */}
      <span
        title={skillUsed ? 'Skill used' : 'Skill ready'}
        style={{
          width: 7, height: 7, borderRadius: '50%',
          background: skillUsed ? poster.inkFaint : poster.target,
          flexShrink: 0,
        }}
      />
    </div>
  );
}

/** One glyph-and-numeral pair. The title carries the word for a hover. */
function Stat({ glyph, value, title, size }: {
  glyph: React.ReactNode;
  value: number;
  title: string;
  size: number;
}) {
  return (
    <span
      title={title}
      aria-label={`${title}: ${value}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        fontFamily: fonts.ui,
        fontWeight: 700,
        fontSize: size,
        fontVariantNumeric: 'tabular-nums',
        color: poster.ink,
        lineHeight: 1,
      }}
    >
      {glyph}
      {value}
    </span>
  );
}

/** Stacked cards, face down — the draw pile. */
function DeckGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ display: 'block' }}>
      <rect x="2.5" y="1.5" width="8" height="11" rx="1.5" fill="none" stroke={poster.inkDim} strokeWidth="1.3" />
      <rect x="5.5" y="3.5" width="8" height="11" rx="1.5" fill={poster.paperBand} stroke={poster.ink} strokeWidth="1.3" />
    </svg>
  );
}

/** A card set aside — the discard pile. */
function DiscardGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ display: 'block' }}>
      <rect x="3" y="2.5" width="10" height="11" rx="1.5" fill="none" stroke={poster.inkDim} strokeWidth="1.3" strokeDasharray="2.4 2" />
      <path d="M5.5 8.5 L10.5 8.5" stroke={poster.inkDim} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Three cards fanned — the hand. */
function HandGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ display: 'block' }}>
      <g fill={poster.paperBand} stroke={poster.ink} strokeWidth="1.2" strokeLinejoin="round">
        <rect x="1.6" y="5" width="5.2" height="8" rx="1" transform="rotate(-16 4.2 9)" />
        <rect x="5.4" y="4" width="5.2" height="8" rx="1" />
        <rect x="9.2" y="5" width="5.2" height="8" rx="1" transform="rotate(16 11.8 9)" />
      </g>
    </svg>
  );
}
