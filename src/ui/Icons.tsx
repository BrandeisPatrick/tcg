import type { CSSProperties } from 'react';

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

export function StatPill({ icon, value, color, big }: { icon: React.ReactNode; value: string | number; color: string; big?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      color,
      fontWeight: 800,
      fontSize: big ? 16 : 13,
      fontVariantNumeric: 'tabular-nums',
      textShadow: '0 1px 3px rgba(0,0,0,0.85)',
    }}>
      {icon}
      <span>{value}</span>
    </span>
  );
}
