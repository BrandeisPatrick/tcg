// The map's quiet print: the detail that rewards a closer look and never
// competes with the stops or the route drawn over the sheet. Two static
// layers in the sheet's 840×1080 map space, mounted by NycMap:
//   - MapUnderlay, on the water under the land: chart waterlines along every
//     coast, ferry lines, depth soundings and a scale bar;
//   - MapOverlay, on the land: the big parks, rail lines, runways, a few
//     landmark vignettes, and the names (water, islands, places, bridges,
//     streets).
// Everything is printed in the ground's own inks — ink at a low alpha on the
// paper, cream at a low alpha on the water — with no new colour and nothing
// that moves. Smaller names wait for the zoom: the screen sets `data-zoom`
// (far | mid | near) on the sheet's wrapper and the tier classes below key
// off it. Data: nycSheet.ts (OpenStreetMap, baked in grid cells — see
// NycMap) and mapDetail.ts (placed by hand).

import { memo, Fragment, type ReactNode } from 'react';
import {
  SHEET_GRID, SHEET_WATERLINE, SHEET_WATERLINE_CLIPPED, SHEET_GREEN, SHEET_RAIL, SHEET_RUNWAYS, SHEET_FERRIES,
} from './nycSheet';
import {
  LABELS, LANDMARKS, SOUNDINGS, SCALE_BAR, KIND_STYLE, METRES_PER_UNIT,
  placeLabel, project, type MapLabel, type Tier, type VignetteId,
} from './mapDetail';
import { poster } from '../poster';
import { fonts } from '../tokens';

/** The water the waterlines are cut back to: NycMap's MAP_WATER (importing
 *  it would loop the two modules; a test keeps them equal). */
export const DETAIL_WATER = '#1f3f3d';

/** Every cell of the sheet's grid, and the clip (defined by NycMap) that
 *  keeps a see-through layer's cell to its own square. */
export const CELLS = Array.from({ length: SHEET_GRID.cols * SHEET_GRID.rows }, (_, i) => i);
export const cellClip = (i: number) => `url(#nyc-cell-${i})`;

const INK = (a: number) => `rgba(23, 20, 16, ${a})`;
const CREAM = (a: number) => `rgba(242, 230, 203, ${a})`;
/** Central Park's green, so every park is printed from the same screen —
 *  laid as a tint, so the many big parks stay nearer the paper's tone than
 *  the one park the stops sit in. */
const GREEN = '#a9bd8f';
const GREEN_TINT = 0.72;

// Weights and type follow the screen's `--line` (√ of the zoom), like the
// rest of the sheet: close in a line stays a hairline, far out it holds.
const line = (w: number) => `calc(${w} * var(--line, 1))`;
const type = (u: number) => `calc(${u}px * var(--line, 1))`;

const TIERS = `
.md-mid, .md-near { transition: opacity .3s ease, visibility .3s; }
.md-near { opacity: 0; visibility: hidden; }
[data-zoom="near"] .md-near { opacity: 1; visibility: visible; }
[data-zoom="far"] .md-mid { opacity: 0; visibility: hidden; }
`;

// ---- under the land -----------------------------------------------------------

/** Chart waterlines: offset from the coast (map units) and ink, outer first.
 *  Each is a wide cream band cut back by a narrower water band, so only a
 *  thin line is left; the land covers the inner half. The outer line lies on
 *  the sea's swell lines, so it stays see-through and each cell is clipped
 *  to itself; the inner two lie on the outer band's flat water, so they are
 *  printed in the opaque colour that cream at 0.085 and 0.11 makes over
 *  DETAIL_WATER (as the raster rounds it) and draw like the water bands. */
const WATERLINES = [
  { off: 10.5, ink: CREAM(0.06), clip: true },
  { off: 7.6, ink: 'rgb(49, 77, 73)', clip: false },
  { off: 5.2, ink: 'rgb(54, 81, 76)', clip: false },
];
/** The two pre-blended inks and the alphas they stand for (a test checks them). */
export const WATERLINE_BLENDS = [{ alpha: 0.085, ink: WATERLINES[1].ink }, { alpha: 0.11, ink: WATERLINES[2].ink }];
const WATERLINE_W = 0.5;

const MILE = 1609.34 / METRES_PER_UNIT;

export const MapUnderlay = memo(function MapUnderlay() {
  const bar = project(SCALE_BAR.lat, SCALE_BAR.lng);
  // A cell's clipped set carries all that reaches it; the opaque bands draw
  // each segment once (see nycSheet.ts).
  const coast = (key: string, clip: boolean) => (clip ? SHEET_WATERLINE_CLIPPED : SHEET_WATERLINE).map((d, i) => d && (
    <path key={`${key}${i}`} d={d} clipPath={clip ? cellClip(i) : undefined} />
  ));
  return (
    <g>
      <style>{TIERS}</style>

      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {WATERLINES.map(({ off, ink, clip }) => (
          <Fragment key={off}>
            <g stroke={ink} style={{ strokeWidth: `calc(${2 * off} + ${WATERLINE_W} * var(--line, 1))` }}>
              {coast('c', clip)}
            </g>
            <g stroke={DETAIL_WATER} style={{ strokeWidth: `calc(${2 * off} - ${WATERLINE_W} * var(--line, 1))` }}>
              {coast('w', false)}
            </g>
          </Fragment>
        ))}
      </g>

      <g className="md-mid">
        {/* Ferry lines: fine cream dots — finer and fainter than any route. */}
        <g fill="none" stroke={CREAM(0.3)} strokeLinecap="round" strokeDasharray="0 1.7"
          style={{ strokeWidth: line(0.5) }}>
          {SHEET_FERRIES.map((f) => <path key={f.name} d={f.d} />)}
        </g>

        {/* Soundings, in a chart's italic figures. */}
        <g fill={CREAM(0.3)} textAnchor="middle"
          style={{ fontFamily: fonts.ui, fontStyle: 'italic', fontSize: type(3.2) }}>
          {SOUNDINGS.map((s) => {
            const p = project(s.lat, s.lng);
            return <text key={`${s.lat},${s.lng}`} x={p.x} y={p.y}>{s.depth}</text>;
          })}
        </g>

        {/* Scale bar: two miles, the first filled. */}
        <g transform={`translate(${bar.x} ${bar.y})`} stroke={CREAM(0.32)} style={{ strokeWidth: line(0.35) }}>
          <rect x={0} y={-0.6} width={MILE} height={1.2} fill={CREAM(0.22)} />
          <rect x={MILE} y={-0.6} width={MILE} height={1.2} fill="none" />
          <g fill={CREAM(0.34)} stroke="none" textAnchor="middle"
            style={{ fontFamily: fonts.ui, fontWeight: 600, fontSize: type(2.4), letterSpacing: '0.12em' }}>
            <text x={0} y={-2.4}>0</text>
            <text x={MILE} y={-2.4}>1</text>
            <text x={MILE * 2} y={-2.4}>2</text>
            <text x={MILE} y={5}>MILES</text>
          </g>
        </g>
      </g>
    </g>
  );
});

// ---- over the land --------------------------------------------------------------

const RAIL_LINE = { strokeWidth: line(0.4) };
const RAIL_TIES = { strokeWidth: line(1.3) };

export const MapOverlay = memo(function MapOverlay() {
  const tiers: Record<Tier, MapLabel[]> = { always: [], mid: [], near: [] };
  for (const l of LABELS) tiers[l.tier ?? KIND_STYLE[l.kind].tier].push(l);
  return (
    <g>
      <style>{TIERS}</style>
      <defs>
        {/* The land around each group of parks that reaches the water. */}
        {SHEET_GREEN.map((g, k) => g.clip && (
          <clipPath key={k} id={`md-green-${k}`}><path d={g.clip} /></clipPath>
        ))}
      </defs>

      {/* Parks, cemeteries, golf: flat green, kept to the land. A group of
          parks that overlap shares one path, so the tint never doubles. */}
      <g fill={GREEN} fillOpacity={GREEN_TINT}>
        {SHEET_GREEN.map((g, k) => (
          <path key={k} d={g.d} clipPath={g.clip ? `url(#md-green-${k})` : undefined} />
        ))}
      </g>

      {/* Runways: paper strips with a faint ink edge. */}
      <g fill="none" strokeLinecap="butt">
        {SHEET_RUNWAYS.map((r, i) => (
          <Fragment key={i}>
            <path d={r.d} stroke={INK(0.16)} style={{ strokeWidth: `calc(${r.w} + 0.5 * var(--line, 1))` }} />
            <path d={r.d} stroke={poster.paper} strokeWidth={r.w} />
          </Fragment>
        ))}
      </g>

      {/* Rail: a fine ink line with cross-ties, each cell clipped to itself
          (where two lines overlap at a junction the ink must not double). */}
      <g fill="none" stroke={INK(0.22)}>
        {SHEET_RAIL.map((d, i) => d && (
          <g key={i} clipPath={cellClip(i)}>
            <path d={d} style={RAIL_LINE} />
            <path d={d} strokeDasharray="0.3 2.4" style={RAIL_TIES} />
          </g>
        ))}
      </g>

      {LANDMARKS.map((m) => {
        const p = project(m.lat, m.lng);
        return (
          <g key={m.id} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
            fill="none" stroke={m.tone === 'ink' ? INK(0.36) : CREAM(0.38)}
            strokeLinecap="round" strokeLinejoin="round" style={{ strokeWidth: line(0.4) }}>
            {VIGNETTES[m.id]}
          </g>
        );
      })}

      <g>{tiers.always.map((l) => <Label key={l.text} l={l} />)}</g>
      <g className="md-mid">{tiers.mid.map((l) => <Label key={l.text} l={l} />)}</g>
      <g className="md-near">{tiers.near.map((l) => <Label key={l.text} l={l} />)}</g>
    </g>
  );
});

// ---- names ------------------------------------------------------------------------

const LABEL_LOOK: Record<MapLabel['kind'], { font: string; caps: boolean; track: string; weight?: number; ink: string }> = {
  water: { font: fonts.script, caps: false, track: '0.05em', ink: CREAM(0.34) },
  island: { font: fonts.ui, caps: true, track: '0.16em', weight: 600, ink: INK(0.36) },
  place: { font: fonts.ui, caps: true, track: '0.22em', weight: 600, ink: INK(0.34) },
  bridge: { font: fonts.ui, caps: true, track: '0.14em', weight: 600, ink: CREAM(0.36) },
  street: { font: fonts.ui, caps: true, track: '0.14em', weight: 500, ink: INK(0.4) },
};

function Label({ l }: { l: MapLabel }) {
  const at = placeLabel(l);
  const x = Math.round(at.x * 10) / 10, y = Math.round(at.y * 10) / 10;
  const look = LABEL_LOOK[l.kind];
  const size = l.size ?? KIND_STYLE[l.kind].size;
  const lines = l.text.split('\n');
  return (
    <text x={x} y={y} textAnchor="middle" fill={look.ink}
      transform={at.rotate ? `rotate(${at.rotate} ${x} ${y})` : undefined}
      style={{
        fontFamily: look.font, fontWeight: look.weight, fontSize: type(size),
        letterSpacing: look.track, textTransform: look.caps ? 'uppercase' : undefined,
      }}>
      {lines.map((s, i) => (
        // Centre the block on its point (the first line rises by half the
        // stack; 0.35em drops a cap line onto its middle) — except a street
        // name, which rides just above its street rather than over it.
        <tspan key={s} x={x}
          dy={i > 0 ? '1.1em' : l.kind === 'street' ? '-0.45em' : `${0.35 - ((lines.length - 1) * 1.1) / 2}em`}>{s}</tspan>
      ))}
    </text>
  );
}

// ---- vignettes -------------------------------------------------------------------
// Single-line drawings, base centre at the origin, up is −y, ~14–20 units.

const spokes = (cx: number, cy: number, r0: number, r1: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI) / n;
    const c = Math.cos(a), s = Math.sin(a);
    return `M${(cx + c * r0).toFixed(2)},${(cy + s * r0).toFixed(2)}L${(cx + c * r1).toFixed(2)},${(cy + s * r1).toFixed(2)}`;
  }).join('');

const VIGNETTES: Record<VignetteId, ReactNode> = {
  liberty: (
    <>
      {/* Pedestal, robe, tablet, the raised torch and the crown's rays. */}
      <path d="M-3.4,0H3.4M-3,0L-2.5,-5.2M3,0L2.5,-5.2M-2.9,-5.2H2.9M-2.75,-2.6H2.75
        M-1.5,-5.2C-1.6,-8 -1.3,-10 -1.1,-11.6M1.5,-5.2C1.6,-8 1.4,-10 1.2,-11.6M-0.3,-5.2L0.1,-9
        M-1.1,-11.6Q0,-12.1 1.2,-11.6
        M-1.2,-11.3L-2.1,-16.2M-0.7,-11.7L-1.5,-16.2M-2.3,-16.2H-1.3L-1.5,-16.9H-2.1Z
        M-1.8,-16.9Q-2.4,-17.6 -1.8,-18.4Q-1.2,-17.6 -1.8,-16.9
        M1.2,-10.2L2.2,-10.7L2.6,-8.5L1.6,-8Z
        M0,-13.6V-14.8M-0.65,-13.4L-1.35,-14.3M0.65,-13.4L1.35,-14.3M-0.8,-13L-1.7,-13.3M0.8,-13L1.7,-13.3" />
      <circle cx={0} cy={-12.8} r={0.75} />
    </>
  ),
  chrysler: (
    // Shaft and setback, the stacked arches of the crown, the needle.
    <path d="M-3,0H3M-2.2,0V-10.4M2.2,0V-10.4M-2.2,-10.4H2.2M-1.7,-10.4V-12M1.7,-10.4V-12
      M-1.7,-12L-0.8,-15.5M1.7,-12L0.8,-15.5
      M-1.7,-12Q0,-14.4 1.7,-12M-1.4,-13.1Q0,-15.3 1.4,-13.1M-1.05,-14.3Q0,-16.1 1.05,-14.3
      M-0.8,-15.5L0,-20L0.8,-15.5M-0.9,-1V-9.6M0.9,-1V-9.6" />
  ),
  brooklynBridge: (
    // Two towers with their pointed arches, the cables and the diagonal stays.
    <path d="M-10,0H10
      M-6.2,0.4V-7H-3.8V0.4M-5.6,0.4V-3.8Q-5.6,-5 -5,-5.4Q-4.4,-5 -4.4,-3.8V0.4
      M3.8,0.4V-7H6.2V0.4M4.4,0.4V-3.8Q4.4,-5 5,-5.4Q5.6,-5 5.6,-3.8V0.4
      M-10,-0.4Q-7.6,-3.4 -5,-7Q0,-1 5,-7Q7.6,-3.4 10,-0.4
      M-5,-6.6L-1.6,0M-5,-6.6L-8.4,0M5,-6.6L1.6,0M5,-6.6L8.4,0
      M-2.5,-4.75V0M0,-4V0M2.5,-4.75V0" />
  ),
  gwb: (
    // Lattice towers, the long sagging span.
    <path d="M-11,0H11
      M-6.9,0.8V-9.2M-5.1,0.8V-9.2M-6.9,-9.2H-5.1M-6.9,-9.2L-5.1,-6.2L-6.9,-3.2L-5.1,-0.2M-5.1,-9.2L-6.9,-6.2L-5.1,-3.2L-6.9,-0.2
      M5.1,0.8V-9.2M6.9,0.8V-9.2M5.1,-9.2H6.9M5.1,-9.2L6.9,-6.2L5.1,-3.2L6.9,-0.2M6.9,-9.2L5.1,-6.2L6.9,-3.2L5.1,-0.2
      M-11,-0.6L-6,-9.2Q0,-2.4 6,-9.2L11,-0.6
      M-3,-6.65V0M0,-5.8V0M3,-6.65V0" />
  ),
  verrazzano: (
    // Slender portal towers, the arched deck, the longest span in the harbour.
    <path d="M-13,0.4Q0,-1.4 13,0.4
      M-9,1V-10.2M-8,1V-10.2M-9,-10.2H-8M-9,-6.8H-8M-9,-3.6H-8
      M8,1V-10.2M9,1V-10.2M8,-10.2H9M8,-6.8H9M8,-3.6H9
      M-13,-0.2L-8.5,-10.2Q0,-0.6 8.5,-10.2L13,-0.2
      M-4.25,-6.6V-0.4M0,-5.4V-0.5M4.25,-6.6V-0.4" />
  ),
  wonderWheel: (
    <>
      <circle cx={0} cy={-8.6} r={6.6} />
      <circle cx={0} cy={-8.6} r={4.8} />
      <circle cx={0} cy={-8.6} r={0.9} />
      <path d={`${spokes(0, -8.6, 0.9, 6.6, 16)}M-4.6,0L-0.7,-8M4.6,0L0.7,-8M-6,0H6`} />
    </>
  ),
  unisphere: (
    <>
      <circle cx={0} cy={-9} r={5.6} />
      <ellipse cx={0} cy={-9} rx={2.5} ry={5.6} />
      <path d="M-5.6,-9H5.6M-4.85,-11.8H4.85M-4.85,-6.2H4.85M-2.4,0L0,-3.4L2.4,0" />
      <ellipse cx={0} cy={-9} rx={7.6} ry={1.7} transform="rotate(-22 0 -9)" />
      <ellipse cx={0} cy={0.3} rx={6.4} ry={1.1} />
    </>
  ),
  ballpark: (
    <>
      {/* The field from above: foul lines, the outfield wall, the bleachers
          behind it, the diamond and the mound. */}
      <path d="M0,0L-7.4,-7.4A10.5,10.5 0 0 1 7.4,-7.4Z
        M-7.4,-7.4L-8.84,-8.84A12.5,12.5 0 0 1 8.84,-8.84L7.4,-7.4
        M0,-0.6L-2.7,-3.3L0,-6L2.7,-3.3Z" />
      <circle cx={0} cy={-3.3} r={0.45} />
    </>
  ),
  lighthouse: (
    <path d="M-3.6,0.2Q0,-1.4 3.6,0.2M-1.9,-0.7H1.9M-1.9,-0.7L-1.3,-7.4M1.9,-0.7L1.3,-7.4
      M-1.75,-2.6H1.75M-1.55,-4.9H1.55M-2.1,-7.4H2.1M-0.9,-7.4V-9.2M0.9,-7.4V-9.2
      M-1.3,-9.2L0,-10.5L1.3,-9.2ZM0,-10.5V-11
      M-2.6,-8.4L-4.8,-8.9M2.6,-8.4L4.8,-8.9M-2.4,-9.4L-4.3,-10.8M2.4,-9.4L4.3,-10.8" />
  ),
  ferry: (
    <>
      {/* A double-ended ferry, its wake on both sides. */}
      <path d="M-7.6,-1.4L-6.6,0H6.6L7.6,-1.4ZM-6.4,-1.4V-2.9H6.4V-1.4M-4,-2.9V-4.2H4V-2.9M0,-4.2V-5.6
        M-8.2,0.9Q-7,0.3 -5.8,0.9M5.8,0.9Q7,0.3 8.2,0.9" />
      <path d="M-5.6,-2.15H5.6" strokeDasharray="0.6 0.5" strokeLinecap="butt" />
    </>
  ),
};
