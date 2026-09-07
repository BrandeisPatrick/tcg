import type { StatusId } from '@/engine/types';
import { STATUSES_BY_ID } from '@/statuses';
import { fonts } from '../tokens';
import { poster } from '../poster';

const BUFFS: Set<StatusId> = new Set(['weapon_power','spirit_power','bullet_resist','spirit_resist','shield','unstoppable','healing_boost','extra_attack','casting','casting_light']);
const DEBUFFS: Set<StatusId> = new Set(['stun','silenced','disarm','bleed','weapon_power_down','spirit_power_down','bullet_resist_down','spirit_resist_down','charged','healing_boost_down','djinns_mark']);

// Class colours carry meaning: green buff / red debuff / ink utility.
function colorFor(id: StatusId): string {
  if (BUFFS.has(id)) return poster.status.buff;
  if (DEBUFFS.has(id)) return poster.status.debuff;
  return poster.status.utility;
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
const VALUE_STATUSES: Set<string> = new Set([
  'shield', 'bullet_resist', 'spirit_resist', 'weapon_power', 'spirit_power', 'bleed', 'healing_boost',
  'weapon_power_down', 'spirit_power_down', 'bullet_resist_down', 'spirit_resist_down',
  'extra_attack', 'casting', 'casting_light',
]);

interface Props {
  id: StatusId;
  value?: number;
  duration?: number;
  /** 'compact' = bench portrait, 'normal' = active portrait, 'large' = preview sheet. */
  size?: 'compact' | 'normal' | 'large';
}

/**
 * Status chip — a flat print: solid class colour, cream label, a 1px ink
 * edge. Mixed case at 12px so 'Bullet Res' / 'Spirit Res' stay
 * inside compact bench tiles (HeroSlot caps its rows at 36 / 54px).
 */
export function StatusIcon({ id, value, duration, size = 'normal' }: Props) {
  const color = colorFor(id);
  // Short chip label if we have one, else the registry's display title —
  // never the raw snake_case id (a marked hero used to show "djinns_mark").
  const label = STATUS_LABELS[id] ?? STATUSES_BY_ID[id]?.title ?? id;
  const showValue = typeof value === 'number' && (VALUE_STATUSES.has(id) || value > 1);
  const showDuration = typeof duration === 'number' && duration > 0 && duration < 99;

  const padV = size === 'compact' ? 2 : size === 'large' ? 6 : 3;
  const padH = size === 'compact' ? 5 : size === 'large' ? 12 : 6;

  return (
    <span
      title={`${label}${showValue ? ` ${value}` : ''}${showDuration ? ` (${duration} turns)` : ''}`}
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
