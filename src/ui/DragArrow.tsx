import { useEffect, useState } from 'react';
import { palette } from './tokens';

interface Props {
  source: { x: number; y: number } | null;
  active: boolean;
  color?: string;
}

// Curved SVG arrow from `source` to the live pointer position.
// Mount when targeting is active; the cursor is tracked via a window pointermove listener.
export function DragArrow({ source, active, color = palette.success }: Props) {
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!active) { setPt(null); return; }
    const onMove = (e: PointerEvent) => setPt({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [active]);

  if (!active || !source || !pt) return null;

  const sx = source.x;
  const sy = source.y;
  const ex = pt.x;
  const ey = pt.y;

  // Bezier control point — sit above the midpoint to give the curve a nice arc.
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  // Perpendicular offset for curve depth
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const nx = -dy / len; // perpendicular unit
  const ny = dx / len;
  const arc = Math.min(120, len * 0.3);
  const cx = mx + nx * arc;
  const cy = my + ny * arc - Math.min(80, len * 0.2);

  // Arrow head — compute tangent at end of curve
  const tx = ex - cx;
  const ty = ey - cy;
  const tl = Math.max(1, Math.sqrt(tx * tx + ty * ty));
  const ux = tx / tl;
  const uy = ty / tl;
  const headLen = 18;
  const headSpread = 8;
  const baseX = ex - ux * headLen;
  const baseY = ey - uy * headLen;
  const leftX = baseX + uy * headSpread;
  const leftY = baseY - ux * headSpread;
  const rightX = baseX - uy * headSpread;
  const rightY = baseY + ux * headSpread;

  const w = window.innerWidth;
  const h = window.innerHeight;

  return (
    <svg
      aria-hidden
      style={{
        position: 'fixed', inset: 0,
        width: w, height: h,
        pointerEvents: 'none',
        zIndex: 85,
      }}
    >
      <defs>
        <filter id="arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer glow line */}
      <path
        d={`M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`}
        stroke={`${color}88`}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
        filter="url(#arrow-glow)"
      />
      {/* Inner crisp line */}
      <path
        d={`M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`}
        stroke={color}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* Arrow head */}
      <polygon
        points={`${ex},${ey} ${leftX},${leftY} ${rightX},${rightY}`}
        fill={color}
        filter="url(#arrow-glow)"
      />
      {/* Origin dot */}
      <circle cx={sx} cy={sy} r="6" fill={color} opacity="0.9" />
      <circle cx={sx} cy={sy} r="12" fill={`${color}33`} />
    </svg>
  );
}
