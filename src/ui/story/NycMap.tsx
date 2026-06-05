// Hand-drawn vintage New York City street map, rendered as SVG (no external
// image / no copyright). Modelled on a laser-cut wood city map: PORTRAIT
// orientation, deep-blue water, tan land with dense cream street grids across
// every borough, and the real river geography — the Hudson & East rivers
// cradling Manhattan (the tilted central island with Central Park), the Harlem
// River up top, the Upper Bay below. The campaign path (drawn on top by the map
// screen) climbs up Manhattan. Purely decorative (aria-hidden).

const WATER_TOP = '#2f5d86';
const WATER_BOT = '#244b6e';
const LAND = '#cbb487';
const LAND_HI = '#d6c094';
const STREET = 'rgba(248, 240, 222, 0.55)';
const STREET_HI = 'rgba(250, 244, 230, 0.85)';
const EDGE = '#6f5326';
const PARK = '#9fb583';
const INK = '#23425e';

const VW = 840, VH = 1080;

// Manhattan spine (must match mapgen.ts): Battery (bottom) → Inwood (top).
const SP = { x0: 398, y0: 886, x1: 470, y1: 196 };
const DX = SP.x1 - SP.x0, DY = SP.y1 - SP.y0;
const LEN = Math.hypot(DX, DY);
const PX = -DY / LEN, PY = DX / LEN;
const spine = (t: number) => ({ x: SP.x0 + DX * t, y: SP.y0 + DY * t });
const offPt = (t: number, hw: number): [number, number] => {
  const s = spine(t);
  return [s.x + PX * hw, s.y + PY * hw];
};
function manhattan(): string {
  const N = 18, left: [number, number][] = [], right: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const hw = 22 + 104 * Math.sin(Math.PI * t);
    left.push(offPt(t, -hw));
    right.push(offPt(t, hw));
  }
  return [...left, ...right.reverse()].map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(' ');
}
const MANHATTAN = manhattan();
const MANH_ANGLE = (Math.atan2(DY, DX) * 180) / Math.PI + 90;
const MID = spine(0.5);
function park(): string {
  return [offPt(0.6, -36), offPt(0.78, -36), offPt(0.78, 36), offPt(0.6, 36)]
    .map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(' ');
}

// Borough land polygons (rough but recognizable). The blue base shows through
// the gaps as the Hudson / East / Harlem rivers and the Upper Bay.
const BOROUGHS: { id: string; pts: string; cx: number; cy: number; ang: number; sp: number; ext: number }[] = [
  { id: 'nj',       pts: '0,0 196,0 214,150 176,300 210,460 168,300 150,640 176,820 120,1080 0,1080', cx: 95, cy: 480, ang: 8, sp: 22, ext: 720 },
  { id: 'bronx',    pts: '372,0 840,0 840,196 656,236 560,176 470,150 430,74', cx: 620, cy: 110, ang: -12, sp: 20, ext: 520 },
  { id: 'queens',   pts: '648,250 840,224 840,648 712,668 648,560 626,430 654,318', cx: 760, cy: 440, ang: 14, sp: 20, ext: 480 },
  { id: 'brooklyn', pts: '512,690 840,664 840,1080 372,1080 352,946 470,828 566,748', cx: 660, cy: 900, ang: -6, sp: 20, ext: 520 },
  { id: 'staten',   pts: '70,902 296,876 366,1000 300,1080 92,1080', cx: 210, cy: 990, ang: 10, sp: 22, ext: 320 },
];

/** Dense street grid for a borough — two crossing line families, rotated and
 *  clipped to the land polygon. */
function StreetGrid({ id, cx, cy, ang, sp, ext, hi }: { id: string; cx: number; cy: number; ang: number; sp: number; ext: number; hi?: number }) {
  const n = Math.ceil(ext / sp);
  const lines = [];
  for (let i = -n; i <= n; i++) {
    const major = hi && i % hi === 0;
    const c = major ? STREET_HI : STREET;
    const w = major ? 1.4 : 0.7;
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
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        <linearGradient id="nyc-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={WATER_TOP} />
          <stop offset="100%" stopColor={WATER_BOT} />
        </linearGradient>
        <radialGradient id="nyc-vig" cx="0.5" cy="0.5" r="0.62">
          <stop offset="55%" stopColor="rgba(10,22,36,0)" />
          <stop offset="100%" stopColor="rgba(8,18,30,0.5)" />
        </radialGradient>
        <clipPath id="clip-manh"><polygon points={MANHATTAN} /></clipPath>
        {BOROUGHS.map((b) => (
          <clipPath key={b.id} id={`clip-${b.id}`}><polygon points={b.pts} /></clipPath>
        ))}
      </defs>

      {/* Water */}
      <rect width={VW} height={VH} fill="url(#nyc-water)" />
      {Array.from({ length: 34 }).map((_, i) => (
        <line key={`wv${i}`} x1={0} y1={16 + i * 32} x2={VW} y2={16 + i * 32} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}

      {/* Boroughs: land + dense street grid */}
      {BOROUGHS.map((b) => (
        <g key={b.id}>
          <polygon points={b.pts} fill={LAND} stroke={EDGE} strokeWidth="1.5" />
          <StreetGrid id={b.id} cx={b.cx} cy={b.cy} ang={b.ang} sp={b.sp} ext={b.ext} hi={5} />
        </g>
      ))}

      {/* Manhattan — the focus: brighter land, denser grid, Central Park */}
      <polygon points={MANHATTAN} fill={LAND_HI} stroke={EDGE} strokeWidth="2" />
      <StreetGrid id="manh" cx={MID.x} cy={MID.y} ang={MANH_ANGLE} sp={15} ext={760} hi={4} />
      <g clipPath="url(#clip-manh)">
        <polygon points={park()} fill={PARK} stroke={EDGE} strokeWidth="1" opacity="0.92" />
      </g>

      {/* Bridges across the rivers */}
      <g stroke={STREET_HI} strokeWidth="2.2" opacity="0.85">
        <line x1="430" y1="312" x2="206" y2="300" /> {/* George Washington (NJ↔Manhattan) */}
        <line x1="486" y1="560" x2="650" y2="548" /> {/* Queensboro (Manhattan↔Queens) */}
        <line x1="476" y1="724" x2="600" y2="712" /> {/* Williamsburg */}
        <line x1="436" y1="822" x2="560" y2="792" /> {/* Manhattan / Brooklyn bridges */}
        <line x1="424" y1="848" x2="548" y2="826" />
      </g>

      {/* Borough + river labels */}
      <g fill={STREET_HI} style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700 }} opacity="0.92">
        <text x={28} y={300} style={{ fontSize: 17, letterSpacing: '0.14em' }}>NEW JERSEY</text>
        <text x={600} y={70} style={{ fontSize: 17, letterSpacing: '0.14em' }}>THE BRONX</text>
        <text x={720} y={430} style={{ fontSize: 17, letterSpacing: '0.14em' }}>QUEENS</text>
        <text x={636} y={930} style={{ fontSize: 17, letterSpacing: '0.14em' }}>BROOKLYN</text>
        <text x={96} y={1000} style={{ fontSize: 12, letterSpacing: '0.1em' }}>STATEN IS.</text>
      </g>
      <text x={spine(0.42).x} y={spine(0.42).y} textAnchor="middle"
        transform={`rotate(${MANH_ANGLE.toFixed(1)} ${spine(0.42).x.toFixed(0)} ${spine(0.42).y.toFixed(0)})`}
        fill={INK} opacity="0.55"
        style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, letterSpacing: '0.34em' }}>
        MANHATTAN
      </text>
      <g fill={INK} opacity="0.6" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
        <text x={252} y={520} transform="rotate(90 252 520)" style={{ fontSize: 14, letterSpacing: '0.24em' }}>HUDSON  RIVER</text>
        <text x={600} y={640} transform="rotate(62 600 640)" style={{ fontSize: 13, letterSpacing: '0.22em' }}>EAST  RIVER</text>
        <text x={470} y={150} style={{ fontSize: 11, letterSpacing: '0.16em' }}>HARLEM R.</text>
        <text x={360} y={1014} style={{ fontSize: 12, letterSpacing: '0.2em' }}>UPPER  BAY</text>
      </g>

      {/* Compass rose, top-right */}
      <g transform="translate(770,86)" opacity="0.85">
        <circle r="30" fill="none" stroke={STREET_HI} strokeWidth="1.3" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          const long = i % 2 === 0 ? 28 : 16;
          return <line key={`cr${i}`} x1={0} y1={0} x2={Math.sin(a) * long} y2={-Math.cos(a) * long} stroke={STREET_HI} strokeWidth={i % 2 === 0 ? 1.3 : 0.8} />;
        })}
        <polygon points="0,-28 4,-5 0,0 -4,-5" fill={STREET_HI} />
        <text x={0} y={-34} textAnchor="middle" fill={STREET_HI} style={{ fontFamily: 'Georgia, serif', fontSize: 11, fontWeight: 700 }}>N</text>
      </g>

      {/* Engraved title plate, bottom-left (like the laser-cut original) */}
      <g transform="translate(40,1034)">
        <rect x={-14} y={-26} width={196} height={40} rx={3} fill="rgba(12,24,38,0.55)" stroke={STREET_HI} strokeWidth="1" opacity="0.9" />
        <text x={0} y={2} fill={STREET_HI} style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 17, fontWeight: 700, letterSpacing: '0.22em' }}>NEW YORK CITY</text>
      </g>

      {/* Vignette */}
      <rect width={VW} height={VH} fill="url(#nyc-vig)" />
    </svg>
  );
}
