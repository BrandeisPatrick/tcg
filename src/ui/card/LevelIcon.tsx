import type { CSSProperties } from 'react';

interface LevelIconProps {
  /** Used only for aria-label; the visual is identical at every rank. */
  level?: number;
  size?: number;
  color?: string;
  style?: CSSProperties;
}

/** Gold up-chevron used inline in the hero stat row next to "Lv N" text. */
const GOLD_FILL = '#d4a93c';
const GOLD_STROKE = 'rgba(0,0,0,0.55)';

const wrap = (size: number, style?: CSSProperties): CSSProperties => ({
  display: 'inline-block',
  width: size,
  height: size,
  verticalAlign: 'middle',
  ...style,
});

export function LevelIcon({ level, size = 14, color = GOLD_FILL, style }: LevelIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      style={wrap(size, style)}
      aria-label={level != null ? `Level ${level}` : undefined}
    >
      <path
        d="M 2 12 L 8 4 L 14 12 L 11.5 12 L 8 7.3 L 4.5 12 Z"
        fill={color}
        stroke={GOLD_STROKE}
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
