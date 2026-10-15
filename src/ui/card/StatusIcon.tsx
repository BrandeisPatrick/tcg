import type { StatusId } from '@/engine/types';
import { STATUSES_BY_ID } from '@/statuses';
import { fonts } from '../tokens';
import { poster } from '../poster';
import { StatusMark } from './statusMarks';

export type StatusClass = 'buff' | 'debuff' | 'utility';

/** Which of the three chip colours a status wears, read off the status's own
 *  definition (`hvalue`, src/statuses): above 0 is a buff, below 0 a debuff, 0
 *  is neither. Exported so a list of statuses can be grouped by the colour it
 *  is actually drawn in. */
export function statusClass(id: StatusId): StatusClass {
  const side = STATUSES_BY_ID[id]?.hvalue ?? 0;
  return side > 0 ? 'buff' : side < 0 ? 'debuff' : 'utility';
}

// Class colours carry meaning: green buff / red debuff / ink utility.
function colorFor(id: StatusId): string {
  return poster.status[statusClass(id)];
}

const STATUS_LABELS: Record<string, string> = {
  // Buffs
  weapon_power:  '+BP',
  spirit_power:  '+SPI',
  bullet_resist: 'Bullet Res',
  spirit_resist: 'Spirit Res',
  shield:        'Shield',
  unstoppable:   'Unstop',
  healing_boost: '+Heal',
  extra_attack:  'Extra Atk',
  casting:       'Channel',
  casting_light: 'Channel',
  // Debuffs
  stun:          'Stun',
  silenced:      'Silence',
  disarm:        'Disarm',
  bleed:         'Bleed',
  weapon_power_down:  '−BP',
  spirit_power_down:  '−SPI',
  bullet_resist_down: '−B.Res',
  spirit_resist_down: '−S.Res',
  charged:       'Charged',
  healing_boost_down: '−Heal',
};

// Magnitude statuses render the value pill; binary statuses (value=1) hide it.
// Fixation's value is its stack count and Last Stand's the damage it will deal,
// so a single stack and a strike of 1 are printed too.
const VALUE_STATUSES: Set<string> = new Set([
  'shield', 'bullet_resist', 'spirit_resist', 'weapon_power', 'spirit_power', 'bleed', 'healing_boost',
  'weapon_power_down', 'spirit_power_down', 'bullet_resist_down', 'spirit_resist_down',
  'extra_attack', 'casting', 'casting_light', 'fixation', 'last_stand',
]);

/** The words for a status: its short chip label, else the registry's display
 *  title — never a raw snake_case id (a marked hero used to show "djinns_mark").
 *  An id the registry does not know at all is spelled out from the id itself
 *  ("mystery_status" → "Mystery status"), so a chip is never blank. */
export function statusLabel(id: StatusId): string {
  const known = STATUS_LABELS[id] ?? STATUSES_BY_ID[id]?.title;
  if (known) return known;
  const spelled = String(id ?? '').replace(/[_-]+/g, ' ').trim();
  return spelled ? spelled.charAt(0).toUpperCase() + spelled.slice(1) : 'Status';
}

/** The chip's text for a status at a given magnitude — "Shield 3", "Stun",
 *  "−BP 2" — shared with the FX layer's status stamps so a stamp and the chip
 *  it lands as always read the same. */
export function statusChipText(id: StatusId, value?: number): string {
  const label = statusLabel(id);
  const showValue = typeof value === 'number' && (VALUE_STATUSES.has(id) || value > 1);
  return showValue ? `${label} ${value}` : label;
}

interface Props {
  id: StatusId;
  value?: number;
  duration?: number;
  /** 'compact' = bench portrait, 'normal' = active portrait, 'large' = preview sheet. */
  size?: 'compact' | 'normal' | 'large';
  /** Carry the browser's own tooltip ("Shield 3 (2 turns)"). Off where the
   *  chip is wrapped in an Explain, which says the same and more. */
  titled?: boolean;
}

/**
 * Status chip — a flat print: solid class colour, cream label, a 1px ink
 * edge. Mixed case at 12px so 'Bullet Res' / 'Spirit Res' stay
 * inside compact bench tiles (HeroSlot caps its rows at 36 / 54px).
 */
export function StatusIcon({ id, value, duration, size = 'normal', titled = true }: Props) {
  const color = colorFor(id);
  const label = statusLabel(id);
  const showValue = typeof value === 'number' && (VALUE_STATUSES.has(id) || value > 1);
  const showDuration = typeof duration === 'number' && duration > 0 && duration < 99;

  const padV = size === 'compact' ? 2 : size === 'large' ? 6 : 3;
  const padH = size === 'compact' ? 5 : size === 'large' ? 12 : 6;
  // The mark in front of the label, for the statuses that wear one (statusMarks.tsx).
  const markPx = size === 'compact' ? 10 : size === 'large' ? 15 : 12;

  return (
    <span
      data-status={id}
      title={titled ? `${label}${showValue ? ` ${value}` : ''}${showDuration ? ` (${duration} turns)` : ''}` : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: `${padV}px ${padH}px`,
        background: color,
        color: poster.cream,
        border: `1px solid ${poster.ink}`,
        borderRadius: 2,
        fontFamily: fonts.ui,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <StatusMark id={id} color={poster.cream} size={markPx} />
      <span>{label}</span>
      {showValue && (
        <span style={{
          padding: '0 4px',
          background: 'rgba(23, 20, 16, 0.35)',
          borderRadius: 2,
        }}>{value}</span>
      )}
      {showDuration && (
        <span style={{ opacity: 0.78 }}>({duration})</span>
      )}
    </span>
  );
}
