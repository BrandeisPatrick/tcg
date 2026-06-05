// Build accurate NYC geometry for the story map from real open data:
//   - borough land polygons (coastline-clipped) from click_that_hood GeoJSON
//   - the OSM road network + Central Park (Overpass `out geom`)
// Projects lon/lat → the board's 840x1080 viewBox (equirectangular, cos-lat),
// simplifies (Douglas–Peucker), and emits src/ui/story/nycGeo.ts. Roads are
// merged into a few combined <path> strings per class so the SVG stays light.
//
// Inputs (fetched separately into /tmp): nyc_boroughs.geojson, nyc_roads.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const VW = 840, VH = 1080;
// View window (lon/lat) — the whole metro: NJ (west), Staten Island (south),
// the five boroughs. Sized to the portrait board aspect.
const BB = { S: 40.520, N: 40.910, W: -74.200, E: -73.800 };
const LAT0 = (BB.S + BB.N) / 2;
const COSL = Math.cos((LAT0 * Math.PI) / 180);

const Uw = (BB.E - BB.W) * COSL;
const Uh = BB.N - BB.S;
const S = Math.min(VW / Uw, VH / Uh);
const OFFX = (VW - Uw * S) / 2;
const OFFY = (VH - Uh * S) / 2;

const project = (lon, lat) => [
  OFFX + (lon - BB.W) * COSL * S,
  OFFY + (BB.N - lat) * S,
];
const inView = (x, y, m = 40) => x >= -m && x <= VW + m && y >= -m && y <= VH + m;

// Douglas–Peucker on projected points.
function simplify(pts, eps = 0.8) {
  if (pts.length < 3) return pts;
  const sqd = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ex = a[0] + t * dx - p[0], ey = a[1] + t * dy - p[1];
    return ex * ex + ey * ey;
  };
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  const e2 = eps * eps;
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = sqd(pts[i], pts[a], pts[b]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > e2 && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const ring2path = (pts, close) => {
  if (pts.length < 2) return '';
  const d = 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L');
  return close ? d + 'Z' : d;
};

// ---- land (NYC boroughs + New Jersey) ----
const boroughs = [];
const bgeo = JSON.parse(readFileSync('/tmp/nyc_boroughs.geojson', 'utf8'));
const landFeatures = bgeo.features.map((f) => ({ name: f.properties.name || f.properties.boro_name || '?', geom: f.geometry }));
const sgeo = JSON.parse(readFileSync('/tmp/us_states.json', 'utf8'));
const nj = sgeo.features.find((f) => f.properties.name === 'New Jersey');
if (nj) landFeatures.push({ name: 'New Jersey', geom: nj.geometry });
for (const f of landFeatures) {
  const name = f.name;
  const polys = f.geom.type === 'MultiPolygon' ? f.geom.coordinates : [f.geom.coordinates];
  const subpaths = [];
  let best = null, bestLen = 0;
  for (const poly of polys) {
    for (const ring of poly) {
      const proj = ring.map(([lon, lat]) => project(lon, lat));
      if (!proj.some((p) => inView(p[0], p[1], 120))) continue;
      if (ring.length > bestLen) { bestLen = ring.length; best = proj; }
      const s = simplify(proj, 0.9);
      if (s.length >= 3) subpaths.push(ring2path(s, true));
    }
  }
  if (subpaths.length) {
    // Label anchor: centroid of the largest visible ring, clamped into view.
    const vis = best.filter((p) => inView(p[0], p[1], 0));
    const src = vis.length ? vis : best;
    let cx = src.reduce((a, p) => a + p[0], 0) / src.length;
    let cy = src.reduce((a, p) => a + p[1], 0) / src.length;
    cx = Math.max(70, Math.min(VW - 90, cx));
    cy = Math.max(40, Math.min(VH - 40, cy));
    boroughs.push({ name, d: subpaths.join(''), lx: Math.round(cx), ly: Math.round(cy) });
  }
}

// ---- roads + park (Overpass) ----
const road = JSON.parse(readFileSync('/tmp/metro_roads.json', 'utf8'));
const CLASS = {
  motorway: 'major', trunk: 'major', primary: 'major',
  secondary: 'mid',
  motorway_link: 'minor', trunk_link: 'minor', primary_link: 'minor', secondary_link: 'minor',
};
const seg = { major: [], mid: [], minor: [] };
let park = '', reservoir = '';
for (const e of road.elements) {
  if (e.type !== 'way' || !e.geometry) continue;
  const proj = e.geometry.map((g) => project(g.lon, g.lat));
  if (!proj.some((p) => inView(p[0], p[1]))) continue;
  const t = e.tags || {};
  if (t.highway) {
    const cls = CLASS[t.highway];
    if (!cls) continue;
    const s = simplify(proj, cls === 'minor' ? 1.1 : 0.7);
    if (s.length >= 2) seg[cls].push(ring2path(s, false));
  } else if (t.leisure === 'park' && t.name === 'Central Park') {
    park = ring2path(simplify(proj, 0.8), true);
  } else if (t.natural === 'water' && /Reservoir/i.test(t.name || '')) {
    reservoir = ring2path(simplify(proj, 0.8), true);
  }
}

// Manhattan spine (Battery → Inwood) in viewBox space, for node placement.
const battery = project(-74.0135, 40.7012);
const inwood = project(-73.9215, 40.8720);

const out = `// AUTO-GENERATED by scripts/geo/buildNyc.mjs from open data
// (NYC borough boundaries + OpenStreetMap roads © OpenStreetMap contributors,
// ODbL). Do not edit by hand — re-run the build script to regenerate.
export const NYC_VIEW = { w: ${VW}, h: ${VH} } as const;
export const NYC_SPINE = { x0: ${battery[0].toFixed(0)}, y0: ${battery[1].toFixed(0)}, x1: ${inwood[0].toFixed(0)}, y1: ${inwood[1].toFixed(0)} } as const;
export const NYC_BOROUGHS: { name: string; d: string; lx: number; ly: number }[] = ${JSON.stringify(boroughs)};
export const NYC_ROADS = {
  major: ${JSON.stringify(seg.major.join(''))},
  mid: ${JSON.stringify(seg.mid.join(''))},
  minor: ${JSON.stringify(seg.minor.join(''))},
};
export const NYC_PARK = ${JSON.stringify(park)};
export const NYC_RESERVOIR = ${JSON.stringify(reservoir)};
`;

mkdirSync('src/ui/story', { recursive: true });
writeFileSync('src/ui/story/nycGeo.ts', out);
const kb = (s) => (s.length / 1024).toFixed(0) + 'kb';
console.log('boroughs:', boroughs.map((b) => `${b.name}(${kb(b.d)})`).join(', '));
console.log('roads major/mid/minor segs:', seg.major.length, seg.mid.length, seg.minor.length);
console.log('park:', !!park, 'reservoir:', !!reservoir, 'spine:', battery.map(Math.round), inwood.map(Math.round));
console.log('wrote src/ui/story/nycGeo.ts', kb(out));
