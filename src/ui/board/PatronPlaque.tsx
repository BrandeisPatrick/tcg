import { motion } from 'framer-motion';
import type { GameState, PlayerID, TurnStep } from '@/engine/types';
import { fonts, text } from '../tokens';
import { poster, soulCoin } from '../poster';
import { useStatTick } from './useStatTick';

/**
 * A patron's vitals as one narrow rule across the sheet — the rival's above
 * the top bench, yours below the bottom one. It carries patron HP, souls, the
 * step of the turn (Shop or Act, while it is this patron's) and the Active's
 * attack in glyphs and numerals rather than labelled rows, so the board is
 * self-sufficient and the panel is free to be just the log.
 *
 * Sits inside the board's row stack as a real flex row, so nothing overlaps
 * the sheet's edge the way the old corner plate did.
 */
export function PatronPlaque({
  label, ps, hostile, attackOpen, projectedDamage, isMobile, myTurn, step,
}: {
  label: string;
  ps: GameState['players'][PlayerID];
  hostile?: boolean;
  /** It is this patron's turn and its attack can still be made. */
  attackOpen: boolean;
  /** Patron HP the other side's open attack would cost this one: the life a
   *  knocked-out Active takes with it. */
  projectedDamage?: number;
  isMobile: boolean;
  /** Highlight while it's this patron's turn. */
  myTurn?: boolean;
  /** The step of the turn, printed while it is this patron's. */
  step?: TurnStep;
}) {
  const accent = hostile ? poster.rival : poster.you;
  const hpFrac = Math.max(0, Math.min(1, ps.hp / ps.hpMax));
  const projectedHp = Math.max(0, ps.hp - (projectedDamage ?? 0));
  const projectedFrac = Math.max(0, Math.min(1, projectedHp / ps.hpMax));
  const hasIncoming = !!projectedDamage && projectedDamage > 0;

  // Same tick language as the hero cards: bright on heal, grey on damage.
  const hpTick = useStatTick(ps.hp);
  const hpFlash = hpTick === 'down' ? poster.stat.hpDim
    : hpTick === 'up' ? poster.stat.hpBright
    : poster.stat.hp;

  // The turn's attack has been made (or cannot be): it ends the turn's Act.
  // In the shop it waits for the shop to close.
  const attackLamp = attackOpen ? 'Ready to attack'
    : myTurn && step === 'shop' ? 'Shopping'
    : myTurn ? 'Active has attacked'
    : 'Waiting for its turn';

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
        {/* What an incoming knockout would cost — the slice about to be lost,
            hatched off. */}
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

      {/* The step of this patron's turn, in words. */}
      {myTurn && step && (
        <span style={{ ...text.label, fontSize: glyph - 2, letterSpacing: '0.2em', color: accent, flexShrink: 0 }}>
          {step === 'shop' ? 'Shop' : 'Act'}
        </span>
      )}

      {/* Souls — glyph plus numeral, no label. */}
      <Stat
        glyph={<span style={soulCoin(glyph - 2)} />}
        value={ps.souls}
        title="Souls"
        size={glyph}
      />

      {/* The Active's attack — the one state that isn't a number. Lit while
          the patron whose turn it is has an Active that can still make one
          (each hero swings once a turn: a Retreat after a swing relights it). */}
      <span
        role="img"
        aria-label={attackLamp}
        title={attackLamp}
        style={{
          width: 7, height: 7, borderRadius: '50%',
          background: attackOpen ? poster.target : poster.inkFaint,
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
