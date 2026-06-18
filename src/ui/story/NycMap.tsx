// New York City story-map background, rendered from REAL open geo-data:
//   - borough land polygons (coastline-clipped) — NYC borough boundaries
//   - the OSM road network (major / mid / minor) + Central Park + the reservoir
// Projected into the 840x1080 board space and baked into nycGeo.ts by
// scripts/geo/buildNyc.mjs. Styled like a laser-cut wood city map: deep-blue
// water, tan land, cream streets. Purely decorative (aria-hidden).

import { NYC_VIEW, NYC_BOROUGHS, NYC_ROADS, NYC_PARK, NYC_RESERVOIR } from './nycGeo';

const VW = NYC_VIEW.w, VH = NYC_VIEW.h;
const WATER_TOP = '#37658f';
const WATER_BOT = '#244b6e';
const SHORE = 'rgba(150, 192, 218, 0.55)';
const LAND = '#cdb78c';
const LAND_MANH = '#dcc79b';
const EDGE = '#7a5c2c';
const PARK = '#93ab74';
const STREET = 'rgba(250, 244, 230, ';
const INK = '#1f3c57';

export function NycMap() {
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id="nyc-water" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor={WATER_TOP} />
          <stop offset="100%" stopColor={WATER_BOT} />
        </linearGradient>
        <radialGradient id="nyc-vig" cx="0.5" cy="0.5" r="0.62">
          <stop offset="55%" stopColor="rgba(8,18,30,0)" />
          <stop offset="100%" stopColor="rgba(6,14,24,0.5)" />
        </radialGradient>
        {/* Land mask — used to clip the road network to dry land. */}
        <clipPath id="nyc-land">
          {NYC_BOROUGHS.map((b) => <path key={b.name} d={b.d} />)}
        </clipPath>
      </defs>

      {/* Water */}
      <rect width={VW} height={VH} fill="url(#nyc-water)" />
      {Array.from({ length: 26 }).map((_, i) => (
        <path key={`w${i}`} d={`M0,${28 + i * 42} C220,${18 + i * 42} 620,${42 + i * 42} ${VW},${26 + i * 42}`}
          fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      ))}

      {/* Land: shore halo + fill */}
      {NYC_BOROUGHS.map((b) => (
        <path key={`halo-${b.name}`} d={b.d} fill="none" stroke={SHORE} strokeWidth="6" opacity="0.6" />
      ))}
      {NYC_BOROUGHS.map((b) => (
        <path key={`land-${b.name}`} d={b.d} fillRule="evenodd"
          fill={b.name === 'Manhattan' ? LAND_MANH : LAND} stroke={EDGE} strokeWidth="1.2" />
      ))}

      {/* Road network, clipped to land. Drawn fine→thick so majors sit on top.
          Bridges (roads that cross water) extend past the clip via their own layer. */}
      <g clipPath="url(#nyc-land)">
        <path d={NYC_ROADS.minor} fill="none" stroke={`${STREET}0.32)`} strokeWidth="0.7" strokeLinecap="round" />
        <path d={NYC_ROADS.mid} fill="none" stroke={`${STREET}0.52)`} strokeWidth="1.1" strokeLinecap="round" />
        <path d={NYC_ROADS.major} fill="none" stroke={`${STREET}0.85)`} strokeWidth="1.9" strokeLinecap="round" />
      </g>
      {/* Major roads again un-clipped (thin) so bridges read across the rivers. */}
      <path d={NYC_ROADS.major} fill="none" stroke={`${STREET}0.5)`} strokeWidth="1.4" strokeLinecap="round" />

      {/* Central Park + reservoir */}
      {NYC_PARK && <path d={NYC_PARK} fill={PARK} stroke={EDGE} strokeWidth="1" opacity="0.95" />}
      {NYC_RESERVOIR && <path d={NYC_RESERVOIR} fill={WATER_TOP} stroke={SHORE} strokeWidth="1" opacity="0.92" />}

      {/* Borough labels */}
      {NYC_BOROUGHS.map((b) => (
        <text key={`t-${b.name}`} x={b.lx} y={b.ly} textAnchor="middle"
          fill={b.name === 'Manhattan' ? INK : '#fbf4e4'}
          opacity={b.name === 'Manhattan' ? 0.6 : 0.9}
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: b.name === 'Manhattan' ? 15 : 17, letterSpacing: '0.14em' }}>
          {b.name.toUpperCase()}
        </text>
      ))}
      <g fill={INK} opacity="0.55" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
        <text x={110} y={560} transform="rotate(72 110 560)" style={{ fontSize: 13, letterSpacing: '0.24em' }}>HUDSON  RIVER</text>
        <text x={650} y={520} transform="rotate(70 650 520)" style={{ fontSize: 12, letterSpacing: '0.2em' }}>EAST  RIVER</text>
      </g>

      {/* Compass */}
      <g transform="translate(782,86)" opacity="0.85">
        <circle r="26" fill="none" stroke="#fbf4e4" strokeWidth="1.2" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4, long = i % 2 === 0 ? 24 : 14;
          return <line key={`cr${i}`} x1={0} y1={0} x2={Math.sin(a) * long} y2={-Math.cos(a) * long} stroke="#fbf4e4" strokeWidth={i % 2 === 0 ? 1.2 : 0.7} />;
        })}
        <polygon points="0,-24 4,-5 0,0 -4,-5" fill="#fbf4e4" />
        <text x={0} y={-30} textAnchor="middle" fill="#fbf4e4" style={{ fontFamily: 'Georgia, serif', fontSize: 10, fontWeight: 700 }}>N</text>
      </g>

      {/* Engraved title plate */}
      <g transform="translate(38,1038)">
        <rect x={-12} y={-24} width={184} height={36} rx={3} fill="rgba(10,20,32,0.55)" stroke="#fbf4e4" strokeWidth="1" opacity="0.85" />
        <text x={0} y={0} fill="#fbf4e4" style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 15, fontWeight: 700, letterSpacing: '0.2em' }}>NEW YORK CITY</text>
      </g>

      {/* OpenStreetMap data attribution (ODbL) */}
      <text x={VW - 10} y={VH - 12} textAnchor="end" fill="rgba(255,255,255,0.5)"
        style={{ fontFamily: 'Georgia, serif', fontSize: 10 }}>© OpenStreetMap contributors</text>

      <rect width={VW} height={VH} fill="url(#nyc-vig)" />
    </svg>
  );
}
