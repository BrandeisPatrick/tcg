// Hand-drawn vintage New York City street map, rendered as SVG (no external
// image / no copyright). Styled after a laser-cut wood city map: PORTRAIT,
// deep-blue water, tan land with dense cream street grids, and ORGANIC curved
// coastlines approximating the real geography — Manhattan (asymmetric, with the
// Lower-East-Side bulge, Central Park + reservoir, Broadway) cradled by the
// Hudson & East rivers, Roosevelt Island in the East River, the Harlem River up
// top, the Upper Bay with Governors & Staten islands below, and Long Island
// (Queens + Brooklyn) to the east. The campaign path (drawn on top by the map
// screen) climbs up Manhattan. Purely decorative (aria-hidden).

const WATER_TOP = '#356491';
const WATER_BOT = '#244b6e';
const SHORE = 'rgba(150, 190, 215, 0.5)';
const LAND = '#cbb487';
const LAND_HI = '#d8c296';
const STREET = 'rgba(248, 240, 222, 0.5)';
const STREET_HI = 'rgba(250, 244, 230, 0.85)';
const EDGE = '#7a5c2c';
const PARK = '#9cb381';
const INK = '#1f3c57';

const VW = 840, VH = 1080;

// Manhattan spine (must match mapgen.ts): Battery (bottom) → Inwood (top).
const SP = { x0: 398, y0: 886, x1: 470, y1: 196 };
const DX = SP.x1 - SP.x0, DY = SP.y1 - SP.y0;
const LEN = Math.hypot(DX, DY);
const PX = -DY / LEN, PY = DX / LEN;
const spine = (t: number) => ({ x: SP.x0 + DX * t, y: SP.y0 + DY * t });
const shore = (t: number, hw: number): [number, number] => {
  const s = spine(t);
  return [s.x + PX * hw, s.y + PY * hw];
};
// Asymmetric profile: straighter/narrower west (Hudson), bulging east (LES).
const hwWest = (t: number) => 14 + 46 * Math.sin(Math.PI * t);
const hwEast = (t: number) => 14 + 60 * Math.sin(Math.PI * Math.min(1, t * 1.06)) * (0.9 + 0.18 * Math.sin(Math.PI * t * 2));
function manhattanPath(): string {
  const N = 22;
  const west: [number, number][] = [], east: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    west.push(shore(t, -hwWest(t)));
    east.push(shore(t, hwEast(t)));
  }
  const pts = [...west, ...east.reverse()];
  return 'M' + pts.map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(' L') + 'Z';
}
const MANHATTAN = manhattanPath();
const MANH_ANGLE = (Math.atan2(DY, DX) * 180) / Math.PI + 90;
const MID = spine(0.5);

// Central Park rectangle + reservoir, uptown along the island.
const PARK_PTS = [shore(0.6, -26), shore(0.78, -26), shore(0.78, 30), shore(0.6, 30)]
  .map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(' ');
const RESERVOIR = shore(0.72, 2);

// Curved coastlines for the rest of the city (the blue base shows through the
// gaps as the rivers + bay). Hand-traced beziers — recognizable, not GIS-exact.
const LANDS: { id: string; d: string; label?: { x: number; y: number; t: string; s?: number } }[] = [
  { id: 'nj',
    d: 'M0,0 L214,0 C224,120 196,210 200,300 C204,392 232,452 214,540 C198,628 168,720 150,1080 L0,1080 Z',
    label: { x: 30, y: 320, t: 'NEW JERSEY' } },
  { id: 'bronx',
    d: 'M330,0 L840,0 L840,176 C764,188 700,214 650,238 C612,256 575,214 540,188 C506,162 470,150 448,120 C432,96 392,34 360,0 Z',
    label: { x: 600, y: 70, t: 'THE BRONX' } },
  { id: 'li', // Long Island: Queens + Brooklyn (contiguous)
    d: 'M662,250 C724,238 800,232 840,230 L840,1080 L356,1080 C346,968 432,902 492,842 C536,798 566,760 566,724 C566,686 600,556 642,470 C664,424 652,318 662,250 Z',
    label: { x: 716, y: 410, t: 'QUEENS' } },
  { id: 'staten',
    d: 'M66,902 C170,876 286,876 360,914 C396,932 384,996 326,1044 C286,1078 138,1080 66,1080 Z',
    label: { x: 92, y: 1004, t: 'STATEN IS.', s: 12 } },
];
const ROOSEVELT = 'M528,300 C540,300 548,322 548,362 C548,402 540,428 530,432 C522,426 520,402 520,362 C520,322 522,304 528,300 Z';
const GOVERNORS = { cx: 426, cy: 936, r: 17 };

function StreetGrid({ id, cx, cy, ang, sp, ext, hi }: { id: string; cx: number; cy: number; ang: number; sp: number; ext: number; hi?: number }) {
  const n = Math.ceil(ext / sp);
  const lines = [];
  for (let i = -n; i <= n; i++) {
    const major = hi && i % hi === 0;
    const c = major ? STREET_HI : STREET;
    const w = major ? 1.3 : 0.6;
    lines.push(<line key={`v${i}`} x1={i * sp} y1={-ext} x2={i * sp} y2={ext} stroke={c} strokeWidth={w} />);
    lines.push(<line key={`h${i}`} x1={-ext} y1={i * sp} x2={ext} y2={i * sp} stroke={c} strokeWidth={w * 0.85} />);
  }
  return (
    <g clipPath={`url(#clip-${id})`}>
      <g transform={`translate(${cx},${cy}) rotate(${ang})`}>{lines}</g>
    </g>
  );
}

export function NycMap() {
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="nyc-water" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor={WATER_TOP} />
          <stop offset="100%" stopColor={WATER_BOT} />
        </linearGradient>
        <radialGradient id="nyc-vig" cx="0.5" cy="0.5" r="0.62">
          <stop offset="55%" stopColor="rgba(8,18,30,0)" />
          <stop offset="100%" stopColor="rgba(6,14,24,0.5)" />
        </radialGradient>
        <clipPath id="clip-manh"><path d={MANHATTAN} /></clipPath>
        {LANDS.map((l) => <clipPath key={l.id} id={`clip-${l.id}`}><path d={l.d} /></clipPath>)}
      </defs>

      {/* Water + faint current lines */}
      <rect width={VW} height={VH} fill="url(#nyc-water)" />
      {Array.from({ length: 26 }).map((_, i) => (
        <path key={`w${i}`} d={`M0,${30 + i * 40} C220,${20 + i * 40} 620,${44 + i * 40} ${VW},${28 + i * 40}`}
          fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="1" />
      ))}

      {/* Outer boroughs: shore halo + land + dense streets */}
      {LANDS.map((l) => (
        <g key={l.id}>
          <path d={l.d} fill="none" stroke={SHORE} strokeWidth="6" opacity="0.6" />
          <path d={l.d} fill={LAND} stroke={EDGE} strokeWidth="1.4" />
        </g>
      ))}
      <StreetGrid id="nj" cx={95} cy={460} ang={6} sp={22} ext={760} hi={5} />
      <StreetGrid id="bronx" cx={600} cy={110} ang={-14} sp={20} ext={520} hi={5} />
      <StreetGrid id="li" cx={720} cy={520} ang={20} sp={19} ext={620} hi={5} />
      <StreetGrid id="staten" cx={210} cy={990} ang={10} sp={22} ext={340} hi={5} />

      {/* Roosevelt Island + Governors Island */}
      <path d={ROOSEVELT} fill={LAND} stroke={EDGE} strokeWidth="1" />
      <circle cx={GOVERNORS.cx} cy={GOVERNORS.cy} r={GOVERNORS.r} fill={LAND} stroke={EDGE} strokeWidth="1" />

      {/* Manhattan — the focus */}
      <path d={MANHATTAN} fill="none" stroke={SHORE} strokeWidth="6" opacity="0.7" />
      <path d={MANHATTAN} fill={LAND_HI} stroke={EDGE} strokeWidth="1.8" />
      <StreetGrid id="manh" cx={MID.x} cy={MID.y} ang={MANH_ANGLE} sp={13} ext={760} hi={4} />
      {/* Broadway — the diagonal that breaks the grid */}
      <g clipPath="url(#clip-manh)">
        <line x1={shore(0.02, 40)[0]} y1={shore(0.02, 40)[1]} x2={shore(0.95, -30)[0]} y2={shore(0.95, -30)[1]}
          stroke={STREET_HI} strokeWidth="1.8" opacity="0.8" />
        <polygon points={PARK_PTS} fill={PARK} stroke={EDGE} strokeWidth="1" opacity="0.95" />
        <ellipse cx={RESERVOIR[0]} cy={RESERVOIR[1]} rx={20} ry={26} transform={`rotate(${MANH_ANGLE} ${RESERVOIR[0]} ${RESERVOIR[1]})`}
          fill={WATER_TOP} stroke={SHORE} strokeWidth="1.5" opacity="0.9" />
      </g>

      {/* Bridges */}
      <g stroke={STREET_HI} strokeWidth="2.2" opacity="0.85" strokeLinecap="round">
        <line x1="430" y1="312" x2="206" y2="300" /> {/* George Washington */}
        <line x1="492" y1="540" x2="650" y2="528" /> {/* Queensboro */}
        <line x1="486" y1="700" x2="606" y2="688" /> {/* Williamsburg */}
        <line x1="452" y1="800" x2="566" y2="772" /> {/* Manhattan Bridge */}
        <line x1="438" y1="828" x2="552" y2="804" /> {/* Brooklyn Bridge */}
      </g>

      {/* Labels */}
      {LANDS.map((l) => l.label && (
        <text key={`lb-${l.id}`} x={l.label.x} y={l.label.y} fill={STREET_HI} opacity="0.92"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: l.label.s ?? 17, letterSpacing: '0.12em' }}>
          {l.label.t}
        </text>
      ))}
      <text x={770} y={930} fill={STREET_HI} opacity="0.92"
        style={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 17, letterSpacing: '0.12em' }}>BROOKLYN</text>
      <text x={spine(0.43).x} y={spine(0.43).y} textAnchor="middle"
        transform={`rotate(${MANH_ANGLE.toFixed(1)} ${spine(0.43).x.toFixed(0)} ${spine(0.43).y.toFixed(0)})`}
        fill={INK} opacity="0.6" style={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.34em' }}>
        MANHATTAN
      </text>
      <g fill={INK} opacity="0.6" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
        <text x={250} y={520} transform="rotate(90 250 520)" style={{ fontSize: 13, letterSpacing: '0.24em' }}>HUDSON  RIVER</text>
        <text x={600} y={648} transform="rotate(62 600 648)" style={{ fontSize: 12, letterSpacing: '0.22em' }}>EAST  RIVER</text>
        <text x={478} y={150} style={{ fontSize: 11, letterSpacing: '0.14em' }}>HARLEM R.</text>
        <text x={350} y={1018} style={{ fontSize: 12, letterSpacing: '0.2em' }}>UPPER  BAY</text>
      </g>

      {/* Compass */}
      <g transform="translate(786,84)" opacity="0.85">
        <circle r="28" fill="none" stroke={STREET_HI} strokeWidth="1.2" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4, long = i % 2 === 0 ? 26 : 15;
          return <line key={`cr${i}`} x1={0} y1={0} x2={Math.sin(a) * long} y2={-Math.cos(a) * long} stroke={STREET_HI} strokeWidth={i % 2 === 0 ? 1.2 : 0.7} />;
        })}
        <polygon points="0,-26 4,-5 0,0 -4,-5" fill={STREET_HI} />
        <text x={0} y={-32} textAnchor="middle" fill={STREET_HI} style={{ fontFamily: 'Georgia, serif', fontSize: 10, fontWeight: 700 }}>N</text>
      </g>

      {/* Engraved title plate (laser-cut style) */}
      <g transform="translate(40,1036)">
        <rect x={-14} y={-25} width={188} height={38} rx={3} fill="rgba(10,20,32,0.55)" stroke={STREET_HI} strokeWidth="1" opacity="0.9" />
        <text x={0} y={1} fill={STREET_HI} style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 16, fontWeight: 700, letterSpacing: '0.2em' }}>NEW YORK CITY</text>
      </g>

      <rect width={VW} height={VH} fill="url(#nyc-vig)" />
    </svg>
  );
}
