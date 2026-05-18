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

export function SwordIcon({ size = 14, color = '#ffd166', style }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" style={wrap(size, style)}>
      <path d="M3 12 L6 9 M2 14 L4 12 L6 14 L4 16 Z" fill={color} stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 10 L13 3 L13.5 1 L11 1.5 L4 8.5 Z" fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round" />
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
