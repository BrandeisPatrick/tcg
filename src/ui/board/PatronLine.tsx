import type { PlayerState } from '@/engine/types';
import { structureHp } from '@/engine/query';
import { text } from '../tokens';
import { poster } from '../poster';
import { Souls } from '../hud';
import { StructuresStrip } from './StructuresStrip';
import { RejuvenatorMark } from './RejuvenatorMark';

/**
 * A patron's line along the sheet's edge — the rival's on the top edge, yours
 * on the foot. A dot in the patron's colour (and its name on a wide sheet),
 * the side's structures (Guardian · Walker · Patron, `StructuresStrip`), its
 * Rejuvenator while it holds one, the rival's souls (yours are beside End
 * Turn), and a lamp that is lit while this side's Active can still attack.
 * Numerals and glyphs, no labelled rows.
 */
export function PatronLine({ label, ps, hostile = false, attackOpen, projectedDamage, wide, height, souls = false }: {
  label: string;
  ps: PlayerState;
  hostile?: boolean;
  /** It is this patron's turn and its attack can still be made. */
  attackOpen: boolean;
  /** Structure HP the other side's open attack would push off this one. */
  projectedDamage?: number;
  wide: boolean;
  height: number;
  /** Print the side's souls on the line. */
  souls?: boolean;
}) {
  const accent = hostile ? poster.rival : poster.you;
  const attackLamp = attackOpen ? 'Ready to attack' : 'No attack to make';
  return (
    <div
      aria-label={`${label}: ${structureHp(ps)} structure HP`}
      style={{
        flex: `0 0 ${height}px`,
        height,
        display: 'flex',
        alignItems: 'center',
        gap: wide ? 14 : 8,
        padding: wide ? '0 4px' : '0 2px',
        pointerEvents: 'none',
      }}
    >
      <span title={label} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        ...text.label,
        fontSize: 10.5,
        letterSpacing: '0.18em',
        color: hostile ? poster.rivalInk : poster.inkSoft,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, boxShadow: `0 0 0 1px ${poster.ink}`, flexShrink: 0 }} />
        {wide && label}
      </span>

      <StructuresStrip ps={ps} label={label} accent={accent} projected={projectedDamage} isMobile={!wide} />
      <RejuvenatorMark ps={ps} isMobile={!wide} />

      {souls && (
        <span role="img" aria-label={`${label} souls: ${ps.souls}`} title="Souls" style={{ display: 'inline-flex', flexShrink: 0 }}>
          <Souls n={ps.souls} size={wide ? 14 : 13} tone="paper" />
        </span>
      )}

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
