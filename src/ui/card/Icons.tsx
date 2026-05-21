import type { CSSProperties } from 'react';
import { statRow } from '../tokens';

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

/** Bullet cartridge icon — used for ATK / bullet damage stat. Drawn as a
 *  vertical cartridge with the tip pointing up: nose at top, brass casing
 *  below, rim mark at the base. Matches Deadlock's bullet-damage terminology
 *  and reads cleanly at the small stat-pill size. */
export function SwordIcon({ size = 14, color = '#ffd166', style }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" style={wrap(size, style)}>
      {/* Bullet tip (pointed up) */}
      <path d="M5 5 L8 1 L11 5 Z" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" strokeLinejoin="round" />
      {/* Casing */}
      <rect x="5" y="5" width="6" height="9" rx="0.6" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />
      {/* Rim mark near base */}
      <rect x="5" y="12" width="6" height="2" fill="rgba(0,0,0,0.25)" />
      {/* Highlight stripe (left edge of casing) */}
      <rect x="5.6" y="6" width="0.7" height="6.5" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}

export function HeartIcon({ size = 14, color = '#ff7d7d', style }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" style={wrap(size, style)}>
      <path
        d="M8 14 C 4 11, 1 9, 1 5.5 C 1 3, 3 1, 5 1 C 6.5 1, 7.5 2, 8 3 C 8.5 2, 9.5 1, 11 1 C 13 1, 15 3, 15 5.5 C 15 9, 12 11, 8 14 Z"
        fill={color}
        stroke="rgba(0,0,0,0.4)"
        strokeWidth="0.5"
      />
    </svg>
  );
}

export function SpiritIcon({ size = 14, color = '#c08bff', style }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" style={wrap(size, style)}>
      <path d="M8 1 C 11 4, 12 7, 8 13 C 4 7, 5 4, 8 1 Z" fill={color} stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
      <circle cx="8" cy="9" r="1.5" fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}

/** Five-point gold star — used as the hero level indicator. The fill carries
 *  the rank colour; the dark stroke gives it punch on bright portraits. */
export function StarIcon({ size = 14, color = '#d4a93c', style }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" style={wrap(size, style)}>
      <path
        d="M8 1.3 L9.95 5.65 L14.7 6.25 L11.1 9.45 L12.05 14.15 L8 11.85 L3.95 14.15 L4.9 9.45 L1.3 6.25 L6.05 5.65 Z"
        fill={color}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      {/* subtle inner highlight on the upper face */}
      <path d="M8 2.6 L9.4 5.7 L8 6.8 Z" fill="rgba(255,235,180,0.55)" />
    </svg>
  );
}

export function StatPill({ icon, value, color, big }: { icon: React.ReactNode; value: string | number; color: string; big?: boolean }) {
  return (
    <span style={{ ...statRow.pair(big ? 16 : 11), color }}>
      {icon}
      <span>{value}</span>
    </span>
  );
}
