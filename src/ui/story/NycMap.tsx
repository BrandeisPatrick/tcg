// Hand-drawn vintage New York City map, rendered as SVG so it scales cleanly
// and tints into the app's warm parchment palette (no external image / no
// copyright). Manhattan as a tilted ribbon between the Hudson and East rivers,
// an engraved street grid, Central Park, a compass rose, ink river labels and
// a decorative cartouche — the campaign node path is drawn on top by the map
// screen. Purely decorative (aria-hidden); muted so the glowing nodes pop.

const SEPIA = '#6b4a22';
const SEPIA_FAINT = 'rgba(107, 74, 34, 0.32)';
const LAND = '#e2d0a4';
const LAND_EDGE = '#8a6a32';
const WATER = '#c3cbc2';
const WATER_HATCH = 'rgba(120, 138, 128, 0.4)';
const PARK = '#aebb8c';

// Manhattan ribbon — Hudson (west) edge bottom→top, then East edge top→bottom.
const ISLAND =
  '300,648 256,545 300,432 382,322 492,220 624,140 744,96 ' +
  '802,124 724,214 632,312 540,412 450,502 372,592 332,652';

export function NycMap() {
  return (
    <svg
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        <radialGradient id="nyc-parch" cx="0.46" cy="0.42" r="0.75">
          <stop offset="0%" stopColor="#f3e6c6" />
          <stop offset="62%" stopColor="#e9d8b1" />
          <stop offset="100%" stopColor="#d8c193" />
        </radialGradient>
        <radialGradient id="nyc-vignette" cx="0.5" cy="0.5" r="0.62">
          <stop offset="60%" stopColor="rgba(60,38,12,0)" />
          <stop offset="100%" stopColor="rgba(60,38,12,0.34)" />
        </radialGradient>
        <clipPath id="nyc-island">
          <polygon points={ISLAND} />
        </clipPath>
      </defs>

      {/* Parchment base */}
      <rect width="1200" height="700" fill="url(#nyc-parch)" />

      {/* Water bodies — Hudson (left), East River (right), Upper Bay (bottom) */}
      <g>
        <path d="M0,0 L300,648 256,545 300,432 382,322 492,220 624,140 744,96 700,0 Z" fill={WATER} opacity="0.85" />
        <path d="M1200,0 L802,124 724,214 632,312 540,412 450,502 372,592 332,652 1200,700 Z" fill={WATER} opacity="0.85" />
        <path d="M0,700 L0,648 332,652 1200,700 Z" fill={WATER} opacity="0.85" />
        {/* faint river hatching */}
        {Array.from({ length: 22 }).map((_, i) => (
          <line key={`hl${i}`} x1={0} y1={30 + i * 30} x2={1200} y2={30 + i * 30} stroke={WATER_HATCH} strokeWidth="0.5" opacity="0.5" />
        ))}
      </g>

      {/* Other boroughs hinted at the corners (Jersey left, Brooklyn/Queens right) */}
      <g fill={LAND} opacity="0.55" stroke={LAND_EDGE} strokeWidth="1">
        <path d="M0,0 L150,0 90,140 0,210 Z" />
        <path d="M1200,250 L1060,300 1120,470 1200,520 Z" />
        <path d="M1200,560 L980,640 1080,700 1200,700 Z" />
      </g>

      {/* Manhattan island */}
      <polygon points={ISLAND} fill={LAND} stroke={LAND_EDGE} strokeWidth="2.5" />

      {/* Engraved street grid, clipped to the island and rotated to the
          island's NE axis. Broadway cuts a long diagonal through it. */}
      <g clipPath="url(#nyc-island)">
        <g transform="translate(545,375) rotate(-47)">
          {/* avenues (long axis) */}
          {Array.from({ length: 9 }).map((_, i) => {
            const x = -120 + i * 30;
            return <line key={`av${i}`} x1={x} y1={-380} x2={x} y2={380} stroke={SEPIA_FAINT} strokeWidth="1" />;
          })}
          {/* cross-streets */}
          {Array.from({ length: 26 }).map((_, i) => {
            const y = -380 + i * 30;
            return <line key={`st${i}`} x1={-140} y1={y} x2={140} y2={y} stroke={SEPIA_FAINT} strokeWidth="0.7" />;
          })}
          {/* Central Park */}
          <rect x={-58} y={-150} width={96} height={150} fill={PARK} stroke={LAND_EDGE} strokeWidth="1" opacity="0.85" />
          {/* Broadway diagonal */}
          <line x1={-130} y1={360} x2={120} y2={-360} stroke={SEPIA} strokeWidth="1.6" opacity="0.5" />
        </g>
      </g>

      {/* River ink labels */}
      <text x={140} y={300} transform="rotate(58 140 300)" fill={SEPIA} opacity="0.5"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 22, fontStyle: 'italic', letterSpacing: '0.32em' }}>
        HUDSON  RIVER
      </text>
      <text x={905} y={360} transform="rotate(58 905 360)" fill={SEPIA} opacity="0.5"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 20, fontStyle: 'italic', letterSpacing: '0.3em' }}>
        EAST  RIVER
      </text>

      {/* Compass rose, top-right */}
      <g transform="translate(1086,108)" opacity="0.7">
        <circle r="44" fill="none" stroke={SEPIA} strokeWidth="1.4" />
        <circle r="33" fill="none" stroke={SEPIA_FAINT} strokeWidth="0.8" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          const long = i % 2 === 0 ? 42 : 24;
          const x = Math.sin(a) * long;
          const y = -Math.cos(a) * long;
          return <line key={`cr${i}`} x1={0} y1={0} x2={x} y2={y} stroke={SEPIA} strokeWidth={i % 2 === 0 ? 1.4 : 0.8} />;
        })}
        <polygon points="0,-42 6,-6 0,0 -6,-6" fill={SEPIA} />
        <text x={0} y={-50} textAnchor="middle" fill={SEPIA}
          style={{ fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 700 }}>N</text>
      </g>

      {/* Cartouche / title, bottom-left */}
      <g transform="translate(96,596)" opacity="0.82">
        <text x={0} y={0} fill={SEPIA}
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 40, fontWeight: 700, letterSpacing: '0.06em' }}>
          New York
        </text>
        <text x={3} y={22} fill={SEPIA} opacity="0.8"
          style={{ fontFamily: 'Georgia, serif', fontSize: 13, fontStyle: 'italic', letterSpacing: '0.34em' }}>
          CITY  OF  THE  PATRON
        </text>
      </g>

      {/* Vignette + decorative double frame */}
      <rect width="1200" height="700" fill="url(#nyc-vignette)" />
      <rect x="10" y="10" width="1180" height="680" fill="none" stroke={SEPIA} strokeWidth="2.5" opacity="0.55" />
      <rect x="18" y="18" width="1164" height="664" fill="none" stroke={SEPIA} strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
