// New York City story-map sheet, rendered from REAL open geo-data:
//   - borough land polygons (coastline-clipped) — NYC borough boundaries
//   - the OSM road network (major / mid / minor) + Central Park + the reservoir
// Projected into the 840x1080 board space and baked into nycGeo.ts by
// scripts/geo/buildNyc.mjs. Printed like a screen-printed city sheet from the
// same press as the title poster: cream paper land, one deep teal for the
// water, the streets as ink hairlines that stay well under the stops and the
// route drawn over them. Purely decorative (aria-hidden).
//
// The OpenStreetMap credit is NOT drawn here: the sheet pans off-screen, and
// the ODbL wants the credit always in view, so the screen pins it instead.
//
// Line weights and the printed names read `--line` from the screen's map
// layer: sqrt(1.7 / px-per-unit), so they grow with the square root of the
// zoom instead of linearly. Close in, a coast stays a keyline and a street a
// hairline rather than swelling into bands; far out, they don't vanish.

import { memo } from 'react';
import { NYC_VIEW, NYC_BOROUGHS, NYC_ROADS, NYC_PARK, NYC_RESERVOIR } from './nycGeo';
import { MapUnderlay, MapOverlay } from './MapDetails';
import { poster } from '../poster';
import { fonts } from '../tokens';

const VW = NYC_VIEW.w, VH = NYC_VIEW.h;

// The press's inks. Water and paper are flat; everything else is ink or
// cream at an alpha, so the stops (full-strength ink, red, gold) always win.
export const MAP_WATER = '#1f3f3d';
const WAVE = 'rgba(242, 230, 203, 0.045)';
const HALO = 'rgba(242, 230, 203, 0.16)';
const LAND = poster.paperDeep;       // boroughs and New Jersey
const LAND_STAGE = poster.paper;     // Manhattan — the stage
const KEYLINE = poster.ink;
const STREET = 'rgba(23, 20, 16, ';  // + alpha
const BRIDGE = 'rgba(242, 230, 203, 0.42)';
const PARK = '#a9bd8f';
const NAME = 'rgba(23, 20, 16, 0.2)';
const RIVER = 'rgba(242, 230, 203, 0.42)';

/** A stroke weight that follows `--line` (map units at the 1.7 reference). */
const line = (w: number) => ({ strokeWidth: `calc(${w} * var(--line, 1))` });
const type = (px: number) => `calc(${px}px * var(--line, 1))`;

// Borough names printed on the sheet like a watermark: stencil caps, wide
// tracking, set where they sit clear of the stops (the baked label points
// land on the reservoir and Todt Hill). Staten Island takes two lines.
const NAMES: { lines: string[]; x: number; y: number; size: number; rotate?: number }[] = [
  { lines: ['NEW JERSEY'], x: 165, y: 420, size: 26 },
  { lines: ['MANHATTAN'], x: 537, y: 250, size: 14, rotate: -66.5 },
  { lines: ['BRONX'], x: 752, y: 222, size: 24 },
  { lines: ['QUEENS'], x: 712, y: 446, size: 26 },
  { lines: ['BROOKLYN'], x: 576, y: 748, size: 24 },
  { lines: ['STATEN', 'ISLAND'], x: 104, y: 968, size: 19 },
];

// River names in the poster's brush script, cream, laid along the water.
const RIVERS: { text: string; x: number; y: number; size: number; rotate: number }[] = [
  { text: 'Hudson River', x: 491, y: 226, size: 15, rotate: -68 },
  { text: 'East River', x: 501, y: 452, size: 12, rotate: -63 },
];

export const NycMap = memo(function NycMap() {
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
      <defs>
        {/* Land mask — used to clip the road network to dry land. */}
        <clipPath id="nyc-land">
          {NYC_BOROUGHS.map((b) => <path key={b.name} d={b.d} />)}
        </clipPath>
      </defs>

      {/* Water — one flat ink, with barely-there swell lines. */}
      <rect width={VW} height={VH} fill={MAP_WATER} />
      {Array.from({ length: 26 }).map((_, i) => (
        <path key={`w${i}`} d={`M0,${28 + i * 42} C220,${18 + i * 42} 620,${42 + i * 42} ${VW},${26 + i * 42}`}
          fill="none" stroke={WAVE} style={line(1)} />
      ))}

      <MapUnderlay />

      {/* Bridges: the major roads un-clipped, in cream, UNDER the land — so
          they only show where they cross the water. */}
      <path d={NYC_ROADS.major} fill="none" stroke={BRIDGE} style={line(1.2)} strokeLinecap="round" />

      {/* Shore halo — a soft cream band along every coast. */}
      {NYC_BOROUGHS.map((b) => (
        <path key={`halo-${b.name}`} d={b.d} fill="none" stroke={HALO} style={line(8)} strokeLinejoin="round" />
      ))}

      {/* Keyline: the ink outline is laid down first and the paper printed
          over it, so only its outer half shows at the coast — and where two
          boroughs meet on land, their fills cover it entirely. */}
      {NYC_BOROUGHS.map((b) => (
        <path key={`key-${b.name}`} d={b.d} fill="none" stroke={KEYLINE} style={line(1.7)} strokeLinejoin="round" />
      ))}
      {NYC_BOROUGHS.map((b) => (
        <path key={`land-${b.name}`} d={b.d} fillRule="evenodd"
          fill={b.name === 'Manhattan' ? LAND_STAGE : LAND} />
      ))}
      {/* Borough lines on land: a faint dashed rule, the print's only nod to
          the boundaries that the keyline no longer draws. */}
      {NYC_BOROUGHS.map((b) => (
        <path key={`line-${b.name}`} d={b.d} fill="none" stroke="rgba(23, 20, 16, 0.22)"
          style={line(0.7)} strokeDasharray="3 2.5" />
      ))}

      {/* Road network, clipped to land, in ink hairlines. Drawn fine→thick
          so majors sit on top. */}
      <g clipPath="url(#nyc-land)" fill="none" strokeLinecap="round">
        <path d={NYC_ROADS.minor} stroke={`${STREET}0.07)`} style={line(0.6)} />
        <path d={NYC_ROADS.mid} stroke={`${STREET}0.12)`} style={line(0.9)} />
        <path d={NYC_ROADS.major} stroke={`${STREET}0.2)`} style={line(1.3)} />
      </g>

      {/* Central Park + reservoir */}
      {NYC_PARK && <path d={NYC_PARK} fill={PARK} stroke={KEYLINE} style={line(0.8)} />}
      {NYC_RESERVOIR && <path d={NYC_RESERVOIR} fill={MAP_WATER} stroke={KEYLINE} style={line(0.6)} />}

      <MapOverlay />

      {/* Borough names — watermark caps. */}
      <g fill={NAME} textAnchor="middle" style={{ fontFamily: fonts.display }}>
        {NAMES.map((n) => (
          <text key={n.lines[0]} x={n.x} y={n.y}
            transform={n.rotate ? `rotate(${n.rotate} ${n.x} ${n.y})` : undefined}
            style={{ fontSize: type(n.size), letterSpacing: '0.3em' }}>
            {n.lines.map((text, i) => (
              // The tracking trails the last letter; nudge each line back by
              // half of it so the word sits centred on its point.
              <tspan key={text} x={n.x} dx="0.15em" dy={i === 0 ? 0 : '1.15em'}>{text}</tspan>
            ))}
          </text>
        ))}
      </g>

      {/* River names — brush script on the water. */}
      <g fill={RIVER} textAnchor="middle" style={{ fontFamily: fonts.script }}>
        {RIVERS.map((r) => (
          <text key={r.text} x={r.x} y={r.y} transform={`rotate(${r.rotate} ${r.x} ${r.y})`}
            style={{ fontSize: type(r.size), letterSpacing: '0.04em' }}>{r.text}</text>
        ))}
      </g>

      {/* Compass rose — ink on the sheet. */}
      <g transform="translate(782,86)" opacity="0.6">
        <circle r="25" fill="none" stroke={KEYLINE} strokeWidth="1" />
        <circle r="21" fill="none" stroke={KEYLINE} strokeWidth="0.5" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4, long = i % 2 === 0 ? 21 : 12;
          return <line key={`cr${i}`} x1={0} y1={0} x2={Math.sin(a) * long} y2={-Math.cos(a) * long}
            stroke={KEYLINE} strokeWidth={i % 2 === 0 ? 1 : 0.6} />;
        })}
        <polygon points="0,-21 4.5,-4 0,0 -4.5,-4" fill={KEYLINE} />
        <polygon points="0,21 4.5,4 0,0 -4.5,4" fill={poster.paper} stroke={KEYLINE} strokeWidth="0.8" />
        <text x={0} y={-30} textAnchor="middle" fill={KEYLINE}
          style={{ fontFamily: fonts.display, fontSize: 11 }}>N</text>
      </g>

      {/* Title cartouche — a paper plate with a double ink rule. */}
      <g transform="translate(26,1006)">
        <rect width={196} height={50} fill={poster.paper} stroke={KEYLINE} strokeWidth="1.6" />
        <rect x={4} y={4} width={188} height={42} fill="none" stroke={KEYLINE} strokeWidth="0.6" />
        <text x={98} y={26} textAnchor="middle" fill={KEYLINE}
          style={{ fontFamily: fonts.display, fontSize: 16, letterSpacing: '0.24em' }}>NEW YORK CITY</text>
        <text x={98} y={39} textAnchor="middle" fill="rgba(23, 20, 16, 0.6)"
          style={{ fontFamily: fonts.script, fontSize: 10, letterSpacing: '0.04em' }}>the five boroughs &amp; the harbour</text>
      </g>
    </svg>
  );
});
