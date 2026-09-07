import type { CSSProperties } from 'react';
import { LEVEL_THRESHOLDS, MAX_LEVEL, START_LEVEL } from '@/engine/expSystem';
import { fonts } from '../tokens';
import { poster } from '../poster';

/**
 * Hero level-progress ring (top-right of hero card). Segment count tracks
 * the per-level threshold (5 / 7 / 9 pieces); each piece = 1 exp earned
 * toward the next level. Ring lights clockwise from 12 o'clock and fills
 * fully at Lv4 max. Printed flat: gold segments on a faint cream track over
 * a charcoal disc, with the level numeral stencilled in cream.
 */
export function LevelRing({
  level,
  exp,
  size = 26,
  style,
}: {
  level: number;
  exp: number;
  size?: number;
  style?: CSSProperties;
}) {
  const clampedLevel = Math.max(START_LEVEL, Math.min(MAX_LEVEL, level)) as 1 | 2 | 3 | 4;
  const atMax = clampedLevel >= MAX_LEVEL;
  const totalSegments = atMax
    ? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]            // 9 pieces — fully lit at Lv4
    : LEVEL_THRESHOLDS[(clampedLevel - 1) as 0 | 1 | 2];       // 5 / 7 / 9
  const filled = atMax ? totalSegments : Math.max(0, Math.min(totalSegments, exp));

  // Gold ink, not the ownership token — the ring sits on both players' heroes.
  const LIT_COLOR = poster.gold;
  const TRACK_COLOR = poster.creamFaint;
  const strokeWidth = Math.max(2, size * 0.105);
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Gaps stay legible at high segment counts: cap as an absolute angle so a
  // 9-piece ring keeps each piece distinct without becoming a dashed ring.
  const segSpan = (2 * Math.PI) / totalSegments;
  const gap = Math.min(segSpan * 0.32, 0.30);

  const segments: { d: string; lit: boolean }[] = [];
  for (let i = 0; i < totalSegments; i++) {
    const start = -Math.PI / 2 + i * segSpan + gap / 2;
    const end = -Math.PI / 2 + (i + 1) * segSpan - gap / 2;
    const x1 = cx + Math.cos(start) * r;
    const y1 = cy + Math.sin(start) * r;
    const x2 = cx + Math.cos(end) * r;
    const y2 = cy + Math.sin(end) * r;
    const largeArc = end - start > Math.PI ? 1 : 0;
    segments.push({
      d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      lit: i < filled,
    });
  }

  return (
    <div
      aria-label={atMax ? `Level ${MAX_LEVEL} (max)` : `Level ${clampedLevel} — ${exp}/${totalSegments} exp`}
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-block',
        ...style,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        {/* Charcoal backing disc so the numeral contrasts on any portrait */}
        <circle cx={cx} cy={cy} r={r + strokeWidth * 0.6} fill={poster.panel} />
        {segments.map((seg, i) => (
          <path
            key={i}
            d={seg.d}
            fill="none"
            stroke={seg.lit ? LIT_COLOR : TRACK_COLOR}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <span style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: poster.cream,
        fontFamily: fonts.display,
        fontSize: Math.min(22, Math.round(size * 0.46)),
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        pointerEvents: 'none',
      }}>{clampedLevel}</span>
    </div>
  );
}
