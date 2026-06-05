// Hand-drawn vintage New York City map, rendered as SVG so it scales cleanly
// and tints into the app's warm parchment palette (no external image / no
// copyright). The city fills the whole frame as a top-down engraved street
// grid, framed by thin river/harbor water at the edges — so the campaign node
// path (drawn on top by the map screen) always sits ON the streets. Purely
// decorative (aria-hidden); muted so the glowing nodes pop.

const SEPIA = '#6b4a22';
const SEPIA_FAINT = 'rgba(107, 74, 34, 0.30)';
const LAND = '#e3d2a6';
const LAND_EDGE = '#8a6a32';
const WATER = '#c1cabf';
const WATER_HATCH = 'rgba(120, 138, 128, 0.4)';
const PARK = '#aebb8c';

// Big irregular landmass filling most of the panel — the city. Wavy coastline
// for an old-map feel; ~60-90px of water margin all around.
const ISLAND =
  '96,82 262,64 470,80 700,60 922,78 1108,98 1128,262 1112,442 1092,602 ' +
  '900,636 660,650 430,634 236,648 96,606 74,430 88,250';

export function NycMap() {
  return (
    <svg
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        <radialGradient id="nyc-land" cx="0.46" cy="0.42" r="0.8">
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

      {/* Water base (the rivers + harbor framing the city) */}
      <rect width="1200" height="700" fill={WATER} />
      {Array.from({ length: 24 }).map((_, i) => (
        <line key={`hl${i}`} x1={0} y1={20 + i * 30} x2={1200} y2={20 + i * 30} stroke={WATER_HATCH} strokeWidth="0.5" opacity="0.5" />
      ))}

      {/* Manhattan — fills the frame */}
      <polygon points={ISLAND} fill="url(#nyc-land)" stroke={LAND_EDGE} strokeWidth="2.5" />

      {/* Engraved street grid + Central Park, clipped to the city and tilted to
          the island's gentle NE axis. Broadway cuts a long diagonal. */}
      <g clipPath="url(#nyc-island)">
        <g transform="translate(600,360) rotate(-11)">
          {/* avenues (vertical) */}
          {Array.from({ length: 33 }).map((_, i) => {
            const x = -640 + i * 40;
            return <line key={`av${i}`} x1={x} y1={-420} x2={x} y2={420} stroke={SEPIA_FAINT} strokeWidth="1" />;
          })}
          {/* cross-streets (horizontal) */}
          {Array.from({ length: 25 }).map((_, i) => {
            const y = -420 + i * 34;
            return <line key={`st${i}`} x1={-660} y1={y} x2={660} y2={y} stroke={SEPIA_FAINT} strokeWidth="0.7" />;
          })}
          {/* Central Park */}
          <rect x={-30} y={-250} width={120} height={170} fill={PARK} stroke={LAND_EDGE} strokeWidth="1.2" opacity="0.85" />
          {/* Broadway diagonal */}
          <line x1={-560} y1={400} x2={520} y2={-400} stroke={SEPIA} strokeWidth="1.8" opacity="0.45" />
        </g>
      </g>

      {/* River ink labels in the thin water margins */}
      <text x={40} y={250} transform="rotate(90 40 250)" fill={SEPIA} opacity="0.55"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 18, fontStyle: 'italic', letterSpacing: '0.3em' }}>
        HUDSON  RIVER
      </text>
      <text x={1178} y={300} transform="rotate(90 1178 300)" fill={SEPIA} opacity="0.55"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 18, fontStyle: 'italic', letterSpacing: '0.3em' }}>
        EAST  RIVER
      </text>

      {/* Compass rose, top-right water corner */}
      <g transform="translate(1150,92)" opacity="0.7">
        <circle r="40" fill="none" stroke={SEPIA} strokeWidth="1.4" />
        <circle r="30" fill="none" stroke={SEPIA_FAINT} strokeWidth="0.8" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          const long = i % 2 === 0 ? 38 : 22;
          const x = Math.sin(a) * long;
          const y = -Math.cos(a) * long;
          return <line key={`cr${i}`} x1={0} y1={0} x2={x} y2={y} stroke={SEPIA} strokeWidth={i % 2 === 0 ? 1.4 : 0.8} />;
        })}
        <polygon points="0,-38 5,-6 0,0 -5,-6" fill={SEPIA} />
        <text x={0} y={-44} textAnchor="middle" fill={SEPIA}
          style={{ fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 700 }}>N</text>
      </g>

      {/* Title cartouche along the bottom harbor (clear of the run HUD) */}
      <g transform="translate(600,684)" textAnchor="middle" opacity="0.8">
        <text x={0} y={0} fill={SEPIA}
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 22, fontWeight: 700, letterSpacing: '0.24em' }}>
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
