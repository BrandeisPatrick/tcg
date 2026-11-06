import type { GameState, PlayerID, TurnStep } from '@/engine/types';
import { structureHp } from '@/engine/query';
import { fonts, text } from '../tokens';
import { poster, soulCoin } from '../poster';
import { StructuresStrip } from './StructuresStrip';
import { RejuvenatorMark } from './RejuvenatorMark';

/**
 * A patron's vitals as one narrow rule across the sheet — the rival's above
 * the top bench, yours below the bottom one. It carries the side's structures
 * (Guardian · Walker · Patron, `StructuresStrip`), its Rejuvenator while it
 * holds one, souls, the step of the turn (Shop or Act, while it is this
 * patron's) and the Active's attack in glyphs and numerals rather than
 * labelled rows, so the board is self-sufficient and the panel is free to be
 * just the log.
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
  /** Structure HP the other side's open attack would push off this one: the
   *  push of the hero it would knock out. */
  projectedDamage?: number;
  isMobile: boolean;
  /** Highlight while it's this patron's turn. */
  myTurn?: boolean;
  /** The step of the turn, printed while it is this patron's. */
  step?: TurnStep;
}) {
  const accent = hostile ? poster.rival : poster.you;

  // The turn's attack has been made (or cannot be): it ends the turn's Act.
  // In the shop it waits for the shop to close.
  const attackLamp = attackOpen ? 'Ready to attack'
    : myTurn && step === 'shop' ? 'Shopping'
    : myTurn ? 'Active has attacked'
    : 'Waiting for its turn';

  const glyph = isMobile ? 11 : 12;

  return (
    <div
      aria-label={`${label}: ${structureHp(ps)} structure HP`}
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
      {/* Patron — a dot and the name, in the owner's ink. A phone keeps the
          dot alone (the rule's name says the rest), so its structures have
          the room to read at 390 px. */}
      <span title={label} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        ...text.label,
        fontSize: 10.5,
        letterSpacing: '0.18em',
        color: accent,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        {!isMobile && label}
      </span>

      {/* The structures — Guardian · Walker · Patron, each its icon and its
          HP pips, front first; what an incoming knockout would push off is
          hatched. Then the Rejuvenator, while the side holds one. */}
      <StructuresStrip ps={ps} label={label} accent={accent} projected={projectedDamage} isMobile={isMobile} />
      <RejuvenatorMark ps={ps} isMobile={isMobile} />

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
