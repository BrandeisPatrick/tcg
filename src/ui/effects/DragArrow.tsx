import { useEffect, useState } from 'react';
import { poster } from '../poster';

interface Props {
  source: { x: number; y: number } | null;
  active: boolean;
  /** Head + origin dot colour; the shaft is always cream on an ink keyline. */
  color?: string;
}

// Curved SVG arrow from `source` to the live pointer position — a cream
// ribbon with ink edges and a red head, printed flat over the sheet.
// Mount when targeting is active; the cursor is tracked via a window pointermove listener.
export function DragArrow({ source, active, color = poster.red }: Props) {
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!active) { setPt(null); return; }
    // Coalesce pointermove to one state update per frame — high-rate mice
    // (120Hz+) otherwise re-render the whole SVG per event and steal frames
    // from card animations while targeting.
    let raf = 0;
    let next: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      next = { x: e.clientX, y: e.clientY };
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (next) setPt(next);
        });
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
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
  const curve = `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;

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
        {/* Flat offset shadow — the print's register drop, no blur. */}
        <filter id="arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="0" floodColor="rgba(0,0,0,0.45)" />
        </filter>
      </defs>

      {/* Ink keyline under the shaft */}
      <path
        d={curve}
        stroke={poster.ink}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
        filter="url(#arrow-glow)"
      />
      {/* Cream shaft */}
      <path
        d={curve}
        stroke={poster.cream}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* Arrow head — red with an ink edge */}
      <polygon
        points={`${ex},${ey} ${leftX},${leftY} ${rightX},${rightY}`}
        fill={color}
        stroke={poster.ink}
        strokeWidth="1.5"
        strokeLinejoin="round"
        filter="url(#arrow-glow)"
      />
      {/* Origin dot */}
      <circle cx={sx} cy={sy} r="6" fill={color} stroke={poster.ink} strokeWidth="1.5" opacity="0.9" />
    </svg>
  );
}
