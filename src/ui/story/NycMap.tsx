// Hand-drawn vintage New York City map, rendered as SVG (no external image / no
// copyright). The five boroughs around the harbour — New Jersey, The Bronx,
// Queens, Brooklyn, Staten Island — frame the Hudson, East and Harlem rivers,
// with Manhattan as the iconic tilted island down the middle: Battery point at
// the bottom, Central Park, the avenue grid. The campaign path (drawn on top by
// the map screen) climbs up Manhattan. Purely decorative (aria-hidden).

const SEPIA = '#6b4a22';
const SEPIA_FAINT = 'rgba(107, 74, 34, 0.30)';
const LAND_BORO = '#d8c293';   // outer boroughs (muted)
const LAND_EDGE = '#8a6a32';
const WATER = '#bcc7bd';
const WATER_HATCH = 'rgba(120, 138, 128, 0.4)';
const PARK = '#aebb8c';

// Manhattan spine (must match mapgen.ts): Battery (bottom) -> Inwood (top).
const SP = { x0: 478, y0: 632, x1: 672, y1: 92 };
const DX = SP.x1 - SP.x0, DY = SP.y1 - SP.y0;
const LEN = Math.hypot(DX, DY);
const PX = -DY / LEN, PY = DX / LEN;       // across the island
const AX = DX / LEN, AY = DY / LEN;        // along the island

const spine = (t: number) => ({ x: SP.x0 + DX * t, y: SP.y0 + DY * t });
const off = (t: number, hw: number): [number, number] => {
  const s = spine(t);
  return [s.x + PX * hw, s.y + PY * hw];
};

// Manhattan outline: a tilted leaf, narrow at the tips, wide through midtown.
function manhattan(): string {
  const N = 16, left: [number, number][] = [], right: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const hw = 22 + 96 * Math.sin(Math.PI * t);
    left.push(off(t, -hw));
    right.push(off(t, hw));
  }
  return [...left, ...right.reverse()].map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(' ');
}
const MANHATTAN = manhattan();
const MID = spine(0.5);
const TILT = (Math.atan2(DY, DX) * 180) / Math.PI + 90; // island long-axis tilt (deg)

// Central Park — a rectangle along the island, uptown.
function park(): string {
  const a = off(0.6, -34), b = off(0.78, -34), c = off(0.78, 34), d = off(0.6, 34);
  return [a, b, c, d].map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(' ');
}
const PARK_PTS = park();
const PARK_LABEL = off(0.69, 0);

export function NycMap() {
  return (
    <svg
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        <radialGradient id="nyc-manh" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0%" stopColor="#f1e4c5" />
          <stop offset="100%" stopColor="#e3d2a6" />
        </radialGradient>
        <radialGradient id="nyc-vignette" cx="0.5" cy="0.5" r="0.62">
          <stop offset="56%" stopColor="rgba(60,38,12,0)" />
          <stop offset="100%" stopColor="rgba(60,38,12,0.4)" />
        </radialGradient>
        <clipPath id="nyc-manh-clip"><polygon points={MANHATTAN} /></clipPath>
      </defs>

      {/* Water: the rivers + harbour */}
      <rect width="1200" height="700" fill={WATER} />
      {Array.from({ length: 24 }).map((_, i) => (
        <line key={`w${i}`} x1={0} y1={18 + i * 30} x2={1200} y2={18 + i * 30} stroke={WATER_HATCH} strokeWidth="0.5" opacity="0.5" />
      ))}

      {/* Outer boroughs (muted, behind Manhattan) */}
      <g fill={LAND_BORO} stroke={LAND_EDGE} strokeWidth="1.5" opacity="0.92">
        {/* New Jersey — left bank of the Hudson */}
        <polygon points="0,0 232,0 250,150 196,300 232,470 188,700 0,700" />
        {/* The Bronx — north, above the Harlem River */}
        <polygon points="556,0 1200,0 1200,150 980,150 812,96 690,70 612,40" />
        {/* Queens + Brooklyn — east bank of the East River */}
        <polygon points="1200,176 1010,214 902,300 854,430 838,560 902,700 1200,700" />
        {/* Staten Island — lower bay */}
        <polygon points="250,700 318,648 430,654 470,700" />
      </g>

      {/* Manhattan */}
      <polygon points={MANHATTAN} fill="url(#nyc-manh)" stroke={LAND_EDGE} strokeWidth="2.5" />

      {/* Avenue/street grid + Central Park, clipped to Manhattan and tilted to
          the island's long axis. */}
      <g clipPath="url(#nyc-manh-clip)">
        <g transform={`translate(${MID.x},${MID.y}) rotate(${TILT.toFixed(1)})`}>
          {Array.from({ length: 11 }).map((_, i) => {
            const x = -100 + i * 20;
            return <line key={`av${i}`} x1={x} y1={-320} x2={x} y2={320} stroke={SEPIA_FAINT} strokeWidth="1" />;
          })}
          {Array.from({ length: 31 }).map((_, i) => {
            const y = -320 + i * 21;
            return <line key={`st${i}`} x1={-120} y1={y} x2={120} y2={y} stroke={SEPIA_FAINT} strokeWidth="0.7" />;
          })}
        </g>
        <polygon points={PARK_PTS} fill={PARK} stroke={LAND_EDGE} strokeWidth="1.2" opacity="0.9" />
      </g>
      <text x={PARK_LABEL[0]} y={PARK_LABEL[1]} textAnchor="middle"
        transform={`rotate(${TILT.toFixed(1)} ${PARK_LABEL[0].toFixed(0)} ${PARK_LABEL[1].toFixed(0)})`}
        fill={SEPIA} opacity="0.6"
        style={{ fontFamily: 'Georgia, serif', fontSize: 11, fontStyle: 'italic', letterSpacing: '0.16em' }}>
        CENTRAL PARK
      </text>

      {/* Manhattan label, along the island axis */}
      <text x={spine(0.34).x} y={spine(0.34).y} textAnchor="middle"
        transform={`rotate(${TILT.toFixed(1)} ${spine(0.34).x.toFixed(0)} ${spine(0.34).y.toFixed(0)})`}
        fill={SEPIA} opacity="0.45"
        style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, letterSpacing: '0.3em' }}>
        MANHATTAN
      </text>

      {/* Borough + river ink labels */}
      <g fill={SEPIA} style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
        <text x={70} y={250} transform="rotate(90 70 250)" opacity="0.5" style={{ fontSize: 16, fontStyle: 'italic', letterSpacing: '0.28em' }}>HUDSON  RIVER</text>
        <text x={1064} y={420} transform="rotate(58 1064 420)" opacity="0.5" style={{ fontSize: 15, fontStyle: 'italic', letterSpacing: '0.26em' }}>EAST  RIVER</text>
        <text x={760} y={64} opacity="0.45" style={{ fontSize: 12, fontStyle: 'italic', letterSpacing: '0.2em' }}>HARLEM R.</text>
        <text x={70} y={110} opacity="0.55" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.16em' }}>NEW JERSEY</text>
        <text x={900} y={40} opacity="0.55" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.16em' }}>THE BRONX</text>
        <text x={1040} y={300} opacity="0.55" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.16em' }}>QUEENS</text>
        <text x={1030} y={640} opacity="0.55" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.16em' }}>BROOKLYN</text>
        <text x={250} y={690} opacity="0.5" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em' }}>STATEN IS.</text>
        <text x={600} y={690} textAnchor="middle" opacity="0.5" style={{ fontSize: 11, fontStyle: 'italic', letterSpacing: '0.2em' }}>UPPER  BAY</text>
      </g>

      {/* Compass rose, top-right */}
      <g transform="translate(1140,86)" opacity="0.7">
        <circle r="34" fill="none" stroke={SEPIA} strokeWidth="1.3" />
        <circle r="25" fill="none" stroke={SEPIA_FAINT} strokeWidth="0.8" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          const long = i % 2 === 0 ? 32 : 19;
          return <line key={`cr${i}`} x1={0} y1={0} x2={Math.sin(a) * long} y2={-Math.cos(a) * long} stroke={SEPIA} strokeWidth={i % 2 === 0 ? 1.3 : 0.8} />;
        })}
        <polygon points="0,-32 5,-6 0,0 -5,-6" fill={SEPIA} />
        <text x={0} y={-38} textAnchor="middle" fill={SEPIA} style={{ fontFamily: 'Georgia, serif', fontSize: 11, fontWeight: 700 }}>N</text>
      </g>

      {/* Title cartouche, top-left */}
      <text x={250} y={150} fill={SEPIA} opacity="0.8"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 22, fontWeight: 700, letterSpacing: '0.12em' }}>
        New York City
      </text>

      {/* Vignette + decorative double frame */}
      <rect width="1200" height="700" fill="url(#nyc-vignette)" />
      <rect x="10" y="10" width="1180" height="680" fill="none" stroke={SEPIA} strokeWidth="2.5" opacity="0.55" />
      <rect x="18" y="18" width="1164" height="664" fill="none" stroke={SEPIA} strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
