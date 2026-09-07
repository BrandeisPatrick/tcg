/**
 * Menu-card art — drawn, not photographed.
 *
 * The title sheet is a flat screen print, and a 3D render dropped into it
 * reads as a screenshot pasted on a poster. The Story card is built in the
 * poster's own inks instead: a dusk skyline over the city the campaign
 * crosses, with the run's route climbing it. The other cards carry painted
 * bills from public/art (see CREDITS.md).
 *
 * Each fills its art window (absolute inset 0) and is purely decorative —
 * ModeCard supplies the frame, hover zoom, sticker and label band.
 */

import { poster } from '../poster';

/** Screen-print halftone — a dot field that fades out, as a reusable def. */
function Halftone({ id, from, to = 0 }: { id: string; from: number; to?: number }) {
  return (
    <>
      <pattern id={`${id}-dots`} width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="1.1" fill={poster.paper} />
      </pattern>
      <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity={from} />
        <stop offset="100%" stopColor="#fff" stopOpacity={to} />
      </linearGradient>
      <mask id={`${id}-mask`}>
        <rect width="400" height="260" fill={`url(#${id}-fade)`} />
      </mask>
    </>
  );
}

/** Building silhouettes: [x, width, height, spire]. Heights are large on
 *  purpose — the card's art window is short and wide on a desktop and tall
 *  and narrow on a tablet, so the skyline has to fill either crop. */
const FAR: Array<[number, number, number, number]> = [
  [-4, 52, 118, 0], [42, 38, 162, 0], [74, 58, 100, 0], [124, 34, 186, 1],
  [152, 50, 132, 0], [196, 42, 168, 0], [232, 62, 110, 0], [288, 36, 178, 1],
  [318, 54, 140, 0], [366, 46, 116, 0],
];
const NEAR: Array<[number, number, number, number]> = [
  [-8, 68, 86, 0], [54, 50, 66, 0], [96, 64, 104, 1], [154, 54, 74, 0],
  [200, 72, 96, 0], [264, 48, 62, 0], [304, 66, 110, 1], [362, 74, 80, 0],
];

export function StorySkyline() {
  const H = 260;
  return (
    <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
      <defs>
        {/* Dusk: cold overhead, warm at the rooftops — the value shift is
            what makes the silhouettes read at card size. */}
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16283a" />
          <stop offset="40%" stopColor="#2f4358" />
          <stop offset="66%" stopColor="#8d5f43" />
          <stop offset="84%" stopColor="#d68f52" />
          <stop offset="100%" stopColor="#efb069" />
        </linearGradient>
        <Halftone id="st" from={0.22} />
        <radialGradient id="moonGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={poster.paper} stopOpacity="0.42" />
          <stop offset="100%" stopColor={poster.paper} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="400" height={H} fill="url(#sky)" />
      <rect width="400" height={H} fill="url(#st-dots)" mask="url(#st-mask)" opacity="0.35" />

      {/* Moon, low and large over the avenue */}
      <circle cx="296" cy="56" r="70" fill="url(#moonGlow)" />
      <circle cx="296" cy="56" r="31" fill={poster.paper} opacity="0.95" />
      <circle cx="284" cy="47" r="5" fill="#2f4358" opacity="0.16" />
      <circle cx="306" cy="66" r="7" fill="#2f4358" opacity="0.12" />

      {/* Far skyline — dark enough to separate from the warm horizon */}
      <g fill="#16222c">
        {FAR.map(([x, w, h, spire], i) => (
          <g key={i}>
            <rect x={x} y={H - h} width={w} height={h} />
            {spire ? <polygon points={`${x + w / 2},${H - h - 26} ${x + w / 2 - 7},${H - h} ${x + w / 2 + 7},${H - h}`} /> : null}
          </g>
        ))}
      </g>
      <g fill={poster.gold} opacity="0.5">
        {FAR.flatMap(([x, w, h], i) =>
          Array.from({ length: Math.max(1, Math.floor(w / 15)) }).flatMap((_, cx) =>
            Array.from({ length: Math.max(1, Math.floor(h / 26)) }).map((_, cy) =>
              (cx + cy + i) % 3 === 0
                ? <rect key={`${i}-${cx}-${cy}`} x={x + 5 + cx * 15} y={H - h + 12 + cy * 26} width="3.5" height="5.5" />
                : null,
            ),
          ),
        )}
      </g>

      {/* Near blocks — almost black, so the street reads as shadow */}
      <g fill="#0a1114">
        {NEAR.map(([x, w, h, spire], i) => (
          <g key={i}>
            <rect x={x} y={H - h} width={w} height={h} />
            {spire ? <polygon points={`${x + w / 2},${H - h - 20} ${x + w / 2 - 6},${H - h} ${x + w / 2 + 6},${H - h}`} /> : null}
          </g>
        ))}
      </g>

      {/* The campaign route climbing uptown, with its nodes */}
      <path
        d="M 18 246 C 62 226, 52 198, 100 188 S 166 176, 184 148 S 248 138, 266 108 S 328 98, 350 68"
        fill="none"
        stroke={poster.red}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1 8"
      />
      {([[18, 246], [100, 188], [184, 148], [266, 108], [350, 68]] as const).map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={i === 4 ? 8 : 5.5} fill={poster.red} />
          <circle cx={cx} cy={cy} r={i === 4 ? 3.5 : 2.2} fill={poster.paper} />
        </g>
      ))}
    </svg>
  );
}
