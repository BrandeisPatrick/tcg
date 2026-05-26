import type { StatusId } from '@/engine/types';
import { palette, fonts } from '../tokens';

const BUFFS: Set<StatusId> = new Set(['weapon_power','spirit_power','bullet_resist','spirit_resist','shield','unstoppable','healing_boost']);
const DEBUFFS: Set<StatusId> = new Set(['stun','silenced','disarm','bleed','weapon_power_down','spirit_power_down','bullet_resist_down','spirit_resist_down','charged','healing_boost_down','djinns_mark']);

function colorFor(id: StatusId): string {
  if (BUFFS.has(id)) return palette.status.buff;
  if (DEBUFFS.has(id)) return palette.status.debuff;
  return palette.status.utility;
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
]);

interface Props {
  id: StatusId;
  value?: number;
  duration?: number;
  /** 'compact' = bench portrait, 'normal' = active portrait, 'large' = preview sheet. */
  size?: 'compact' | 'normal' | 'large';
}

export function StatusIcon({ id, value, duration, size = 'normal' }: Props) {
  const color = colorFor(id);
  const label = STATUS_LABELS[id] ?? id;
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
        background: `linear-gradient(180deg, ${color}, ${color}d0)`,
        color: '#fff',
        border: `1px solid rgba(0,0,0,0.45)`,
        borderRadius: 4,
        fontFamily: fonts.ui,
        fontSize: 12,
        fontWeight: 700,
        textShadow: '0 1px 1px rgba(0,0,0,0.55)',
        boxShadow: `0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18)`,
        whiteSpace: 'nowrap',
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span>{label}</span>
      {showValue && (
        <span style={{
          padding: '0 4px',
          background: 'rgba(0,0,0,0.32)',
          borderRadius: 6,
        }}>{value}</span>
      )}
      {showDuration && (
        <span style={{ opacity: 0.78 }}>({duration})</span>
      )}
    </span>
  );
}
