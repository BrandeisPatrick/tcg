// Hand-drawn vintage New York City map, rendered as SVG so it scales cleanly
// and tints into the app's warm parchment palette (no external image / no
// copyright). The island fills the frame in PORTRAIT orientation — uptown at
// the top, the Battery at the bottom point — framed by the Hudson & East
// rivers and the harbor, so the campaign path (drawn on top by the map screen)
// climbs bottom-to-top up the city. Purely decorative (aria-hidden).

const SEPIA = '#6b4a22';
const SEPIA_FAINT = 'rgba(107, 74, 34, 0.30)';
const LAND_EDGE = '#8a6a32';
const WATER = '#c1cabf';
const WATER_HATCH = 'rgba(120, 138, 128, 0.4)';
const PARK = '#aebb8c';

// Manhattan as a vertical island: arched uptown at the top, tapering to the
// Battery point at the bottom; wide midtown to hold the branching path.
const ISLAND =
  '600,56 822,82 1012,150 1098,300 1110,362 1096,474 1010,560 ' +
  '802,632 600,652 398,632 190,560 104,474 90,362 102,300 188,150 378,82';

export function NycMap() {
  return (
    <svg
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        <radialGradient id="nyc-land" cx="0.5" cy="0.46" r="0.8">
          <stop offset="0%" stopColor="#efe2c2" />
          <stop offset="62%" stopColor="#e4d3aa" />
          <stop offset="100%" stopColor="#d6bf90" />
        </radialGradient>
        <radialGradient id="nyc-vignette" cx="0.5" cy="0.5" r="0.62">
          <stop offset="58%" stopColor="rgba(60,38,12,0)" />
          <stop offset="100%" stopColor="rgba(60,38,12,0.38)" />
        </radialGradient>
        <clipPath id="nyc-island">
          <polygon points={ISLAND} />
        </clipPath>
      </defs>

      {/* Water base (Hudson + East rivers + harbor) */}
      <rect width="1200" height="700" fill={WATER} />
      {Array.from({ length: 24 }).map((_, i) => (
        <line key={`hl${i}`} x1={0} y1={20 + i * 30} x2={1200} y2={20 + i * 30} stroke={WATER_HATCH} strokeWidth="0.5" opacity="0.5" />
      ))}

      {/* Manhattan */}
      <polygon points={ISLAND} fill="url(#nyc-land)" stroke={LAND_EDGE} strokeWidth="2.5" />

      {/* Engraved grid — vertical avenues + denser cross-streets, gently tilted;
          Central Park (tall) uptown; Broadway cuts a long diagonal. */}
      <g clipPath="url(#nyc-island)">
        <g transform="translate(600,356) rotate(-5)">
          {/* avenues (vertical) */}
          {Array.from({ length: 23 }).map((_, i) => {
            const x = -550 + i * 50;
            return <line key={`av${i}`} x1={x} y1={-330} x2={x} y2={330} stroke={SEPIA_FAINT} strokeWidth="1" />;
          })}
          {/* cross-streets (horizontal, denser) */}
          {Array.from({ length: 27 }).map((_, i) => {
            const y = -330 + i * 25;
            return <line key={`st${i}`} x1={-560} y1={y} x2={560} y2={y} stroke={SEPIA_FAINT} strokeWidth="0.7" />;
          })}
          {/* Central Park (tall rectangle, uptown) */}
          <rect x={-52} y={-250} width={104} height={186} fill={PARK} stroke={LAND_EDGE} strokeWidth="1.2" opacity="0.85" />
          <text x={0} y={-150} textAnchor="middle" transform="rotate(-90 0 -150)" fill={SEPIA} opacity="0.6"
            style={{ fontFamily: 'Georgia, serif', fontSize: 11, fontStyle: 'italic', letterSpacing: '0.18em' }}>
            CENTRAL  PARK
          </text>
          {/* Broadway */}
          <line x1={-300} y1={330} x2={260} y2={-330} stroke={SEPIA} strokeWidth="1.8" opacity="0.45" />
        </g>
      </g>

      {/* River + harbor ink labels in the water margins */}
      <text x={44} y={250} transform="rotate(90 44 250)" fill={SEPIA} opacity="0.55"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 17, fontStyle: 'italic', letterSpacing: '0.3em' }}>
        HUDSON  RIVER
      </text>
      <text x={1176} y={300} transform="rotate(90 1176 300)" fill={SEPIA} opacity="0.55"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 17, fontStyle: 'italic', letterSpacing: '0.3em' }}>
        EAST  RIVER
      </text>

      {/* Compass rose, top-right harbor corner */}
      <g transform="translate(1126,92)" opacity="0.7">
        <circle r="38" fill="none" stroke={SEPIA} strokeWidth="1.4" />
        <circle r="28" fill="none" stroke={SEPIA_FAINT} strokeWidth="0.8" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          const long = i % 2 === 0 ? 36 : 21;
          const x = Math.sin(a) * long;
          const y = -Math.cos(a) * long;
          return <line key={`cr${i}`} x1={0} y1={0} x2={x} y2={y} stroke={SEPIA} strokeWidth={i % 2 === 0 ? 1.4 : 0.8} />;
        })}
        <polygon points="0,-36 5,-6 0,0 -5,-6" fill={SEPIA} />
        <text x={0} y={-42} textAnchor="middle" fill={SEPIA}
          style={{ fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 700 }}>N</text>
      </g>

      {/* Title cartouche in the bottom harbor */}
      <g transform="translate(600,686)" textAnchor="middle" opacity="0.82">
        <text x={0} y={0} fill={SEPIA}
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 21, fontWeight: 700, letterSpacing: '0.24em' }}>
          NEW  YORK
        </text>
      </g>

      {/* Vignette + decorative double frame */}
      <rect width="1200" height="700" fill="url(#nyc-vignette)" />
      <rect x="10" y="10" width="1180" height="680" fill="none" stroke={SEPIA} strokeWidth="2.5" opacity="0.55" />
      <rect x="18" y="18" width="1164" height="664" fill="none" stroke={SEPIA} strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
