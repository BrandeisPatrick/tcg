import type { CSSProperties } from 'react';
import { poster } from '../poster';

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

const wrap = (size: number, style?: CSSProperties): CSSProperties => ({
  display: 'inline-block',
  width: size,
  height: size,
  verticalAlign: 'middle',
  ...style,
});

/** Bullet cartridge — the ATK / bullet-damage mark, printed flat: tip
 *  pointing up, casing below, a darker band at the base. `color` is the
 *  fill, so consumers carry meaning by hue (neutral ink for BP). Reads
 *  cleanly at the 11px stat-chip size. */
export function SwordIcon({ size = 14, color = poster.stat.atk, style }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" style={wrap(size, style)}>
      {/* Bullet tip (pointed up) */}
      <path d="M5 5 L8 1 L11 5 Z" fill={color} />
      {/* Casing */}
      <rect x="5" y="5" width="6" height="9" rx="0.6" fill={color} />
      {/* Darker band at the base */}
      <rect x="5" y="12" width="6" height="2" fill={poster.ink} opacity="0.35" />
    </svg>
  );
}

/** Heart — the HP mark. A single flat fill in the stat's red. */
export function HeartIcon({ size = 14, color = poster.stat.hp, style }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" style={wrap(size, style)}>
      <path
        d="M8 14 C 4 11, 1 9, 1 5.5 C 1 3, 3 1, 5 1 C 6.5 1, 7.5 2, 8 3 C 8.5 2, 9.5 1, 11 1 C 13 1, 15 3, 15 5.5 C 15 9, 12 11, 8 14 Z"
        fill={color}
      />
    </svg>
  );
}

/** Heater shield — the Shield-status readout on the hero tile. Defaults to
 *  the shield green. */
export function ShieldIcon({ size = 14, color = poster.stat.shield, style }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" style={wrap(size, style)}>
      <path
        d="M8 1.2 L14 3 L14 8 C 14 11.5, 11.5 13.6, 8 14.8 C 4.5 13.6, 2 11.5, 2 8 L 2 3 Z"
        fill={color}
      />
    </svg>
  );
}

/** Spirit flame — the spirit-damage mark; a cream knock-out dot keeps the
 *  flame legible at log-line size. */
export function SpiritIcon({ size = 14, color = poster.stat.spirit, style }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" style={wrap(size, style)}>
      <path d="M8 1 C 11 4, 12 7, 8 13 C 4 7, 5 4, 8 1 Z" fill={color} />
      <circle cx="8" cy="9" r="1.5" fill={poster.cream} opacity="0.85" />
    </svg>
  );
}
