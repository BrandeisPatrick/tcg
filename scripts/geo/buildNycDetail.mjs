// The story map's detail layer, from OpenStreetMap via Overpass:
//   - the big parks, cemeteries and golf courses (multipolygon outers joined)
//   - surface main-line railways (no tunnels, no yards, no subway)
//   - airport runways
//   - a few ferry routes
// Projected with the SAME transform as scripts/geo/buildNyc.mjs, simplified
// (Douglas–Peucker) and written to src/ui/story/nycDetail.ts. Raw Overpass
// answers are cached in the OS temp dir, so a re-run never refetches; pass
// --refresh to fetch again.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VW = 840, VH = 1080;
const BB = { S: 40.520, N: 40.910, W: -74.200, E: -73.800 };
const LAT0 = (BB.S + BB.N) / 2;
const COSL = Math.cos((LAT0 * Math.PI) / 180);
const Uw = (BB.E - BB.W) * COSL;
const Uh = BB.N - BB.S;
const S = Math.min(VW / Uw, VH / Uh);
const OFFX = (VW - Uw * S) / 2;
const OFFY = (VH - Uh * S) / 2;
const project = (lon, lat) => [OFFX + (lon - BB.W) * COSL * S, OFFY + (BB.N - lat) * S];
const inView = (x, y, m = 20) => x >= -m && x <= VW + m && y >= -m && y <= VH + m;
// One map unit is ~40 m on the ground.
const METRES_PER_UNIT = 111320 / S;

// ---- Overpass ----
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const HEAD = `[out:json][timeout:180][bbox:${BB.S},${BB.W},${BB.N},${BB.E}];`;
const QUERIES = {
  green: `${HEAD}(
    way[leisure=park][name]; relation[leisure=park][name];
    way[landuse=cemetery]; relation[landuse=cemetery];
    way[amenity=grave_yard][name];
    way[leisure=golf_course]; relation[leisure=golf_course];
    way[leisure=nature_reserve][name]; relation[leisure=nature_reserve][name];
  ); out geom;`,
  rail: `${HEAD}way[railway=rail][!service]; out geom;`,
  runway: `${HEAD}way[aeroway=runway]; out geom;`,
  ferry: `${HEAD}way[route=ferry]; out geom;`,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refresh = process.argv.includes('--refresh');

async function overpass(name, query) {
  const cache = join(tmpdir(), `nyc-detail-${name}.json`);
  if (!refresh && existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  // Every endpoint, round-robin, with a growing pause: the public servers
  // answer 429/504 when busy and come back a minute later.
  for (let attempt = 0; attempt < 9; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'deadlock-tcg map builder (scripts/geo/buildNycDetail.mjs)',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'data=' + encodeURIComponent(query),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = JSON.parse(text);
      if (json.remark && /error|timed out/i.test(json.remark)) throw new Error(json.remark);
      writeFileSync(cache, text);
      console.log(`${name}: ${json.elements.length} elements from ${url}`);
      return json;
    } catch (e) {
      const wait = 4000 * (attempt + 1);
      console.log(`${name}: ${url} failed (${e.message}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error(`${name}: every Overpass endpoint failed`);
}

// ---- geometry ----
// Douglas–Peucker on projected points (as in buildNyc.mjs).
function simplify(pts, eps) {
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
const signedArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return a / 2;
};
const area = (ring) => Math.abs(signedArea(ring));
// Wind a ring one way (outers) or the other (holes), so every park can share
// one nonzero-filled path: overlapping parks stay filled, holes stay open.
const wind = (ring, positive) => (signedArea(ring) > 0 === positive ? ring : [...ring].reverse());
const fmt = (n) => String(Math.round(n * 10) / 10);
const toPath = (pts, close) => 'M' + pts.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join('L') + (close ? 'Z' : '');
const projectGeom = (geom) => geom.map((g) => project(g.lon, g.lat));
// Points every `step` units along a polyline.
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    let t = step - carry;
    while (t <= len) { out.push([ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len]); t += step; }
    carry = len - (t - step);
  }
  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

// Stitch a relation's outer ways into closed rings (they come in any order
// and direction; shared end nodes have identical coordinates).
function joinRings(ways) {
  const key = (g) => `${g.lat},${g.lon}`;
  const left = ways.filter((w) => w.length > 1).map((w) => [...w]);
  const rings = [];
  while (left.length) {
    let ring = left.shift();
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      const end = key(ring[ring.length - 1]);
      for (let i = 0; i < left.length; i++) {
        const w = left[i];
        if (key(w[0]) === end) ring = ring.concat(w.slice(1));
        else if (key(w[w.length - 1]) === end) ring = ring.concat([...w].reverse().slice(1));
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (key(ring[0]) === key(ring[ring.length - 1]) && ring.length > 3) rings.push(ring);
  }
  return rings;
}

// ---- green: parks, cemeteries, golf courses ----
// Only the big ones: a park under ~0.2 km² is a speck at any zoom and would
// only add noise (and bytes). Central Park is the base map's own; the
// estuary sanctuaries are open water, the wildlife refuge is mostly bay, and
// Hudson River Park is piers and river (on this sheet it would paint the
// Hudson green where New Jersey's outline meets Manhattan's).
const MIN_AREA = 0.2e6 / (METRES_PER_UNIT * METRES_PER_UNIT);
const NOT_GREEN = /^Central Park$|^Hudson River Park$|Estuarine|Sanctuary|Wildlife Refuge/i;
const green = [];
{
  const json = await overpass('green', QUERIES.green);
  const seen = new Set();
  for (const e of json.elements) {
    const t = e.tags || {};
    if (NOT_GREEN.test(t.name || '')) continue;
    let outers = [];
    let inners = [];
    if (e.type === 'way' && e.geometry) {
      const g = e.geometry;
      if (g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon) outers = [g];
    } else if (e.type === 'relation' && e.members) {
      outers = joinRings(e.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => m.geometry));
      inners = joinRings(e.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => m.geometry));
    }
    const rings = [];
    let total = 0;
    for (const g of outers) {
      const p = projectGeom(g);
      if (!p.some(([x, y]) => inView(x, y))) continue;
      const a = area(p);
      if (a < MIN_AREA / 3) continue;
      const s = simplify(p, 0.7);
      if (s.length < 4) continue;
      total += a;
      rings.push(wind(s, true));
    }
    if (!rings.length || total < MIN_AREA) continue;
    // Big holes only (a lake, a reservoir): they read as the park's own shape.
    for (const g of inners) {
      const p = projectGeom(g);
      if (area(p) < MIN_AREA / 2) continue;
      const s = simplify(p, 0.7);
      if (s.length >= 4) rings.push(wind(s, false));
    }
    const d = rings.map((r) => toPath(r, true)).join('');
    if (seen.has(d)) continue;
    seen.add(d);
    green.push({ name: t.name || t.landuse || t.leisure, area: Math.round(total), d });
  }
  green.sort((a, b) => b.area - a.area);
}

// ---- rail: surface main lines ----
// OSM maps every track of a corridor as its own way; drawn with cross-ties,
// four parallel tracks print as a zip. So each corridor is drawn once: ways
// go longest first, resampled, and a stretch is dropped where it runs
// alongside a line already kept (within RAIL_MERGE units, roughly parallel,
// beside it rather than beyond its end — so short links between kept lines
// survive and the line stays whole).
const RAIL_MERGE = 1.6;
const rail = [];
{
  const json = await overpass('rail', QUERIES.rail);
  const ways = [];
  for (const e of json.elements) {
    const t = e.tags || {};
    if (e.type !== 'way' || !e.geometry) continue;
    if (t.tunnel && t.tunnel !== 'no') continue;
    // Main lines only (plus Staten Island's passenger line): the freight
    // branches wander between the stops like one more route.
    if (t.usage !== 'main' && !/^Staten Island Rail/.test(t.name || '')) continue;
    const p = projectGeom(e.geometry);
    if (!p.some(([x, y]) => inView(x, y))) continue;
    ways.push(resample(p, 0.8));
  }
  ways.sort((a, b) => b.length - a.length);
  const grid = new Map(); // cell → kept segments [a, b]
  const key = (cx, cy) => `${cx},${cy}`;
  const addSeg = (a, b) => {
    const x0 = Math.floor((Math.min(a[0], b[0]) - RAIL_MERGE) / RAIL_MERGE), x1 = Math.floor((Math.max(a[0], b[0]) + RAIL_MERGE) / RAIL_MERGE);
    const y0 = Math.floor((Math.min(a[1], b[1]) - RAIL_MERGE) / RAIL_MERGE), y1 = Math.floor((Math.max(a[1], b[1]) + RAIL_MERGE) / RAIL_MERGE);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const k = key(i, j);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push([a, b]);
    }
  };
  const alongside = (p, dir) => {
    for (const [a, b] of grid.get(key(Math.floor(p[0] / RAIL_MERGE), Math.floor(p[1] / RAIL_MERGE))) ?? []) {
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      if (!l2) continue;
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
      if (t < -0.1 || t > 1.1) continue;
      if (Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / Math.sqrt(l2) >= RAIL_MERGE) continue;
      if (Math.abs(dx * dir[0] + dy * dir[1]) / Math.sqrt(l2) > 0.8) return true;
    }
    return false;
  };
  for (const w of ways) {
    if (w.length < 2) continue;
    const free = w.map((p, i) => {
      const a = w[Math.max(0, i - 1)], b = w[Math.min(w.length - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return !alongside(p, [(b[0] - a[0]) / len, (b[1] - a[1]) / len]);
    });
    let i0 = -1;
    for (let i = 0; i <= w.length; i++) {
      const ok = i < w.length && free[i];
      if (ok && i0 < 0) i0 = i;
      if (!ok && i0 >= 0) {
        // Each run reaches two samples into its neighbours so the line meets
        // the kept track it hands over to.
        const run = w.slice(Math.max(0, i0 - 2), Math.min(w.length, i + 2));
        if (run.length >= 2) {
          for (let k = 1; k < run.length; k++) addSeg(run[k - 1], run[k]);
          rail.push(simplify(run, 0.9));
        }
        i0 = -1;
      }
    }
  }
}

// ---- runways ----
const runways = [];
{
  const json = await overpass('runway', QUERIES.runway);
  for (const e of json.elements) {
    if (e.type !== 'way' || !e.geometry) continue;
    const t = e.tags || {};
    const p = projectGeom(e.geometry);
    if (!p.some(([x, y]) => inView(x, y, 0))) continue;
    // Drawn as a stroke at the runway's real width (~45 m when untagged).
    const metres = parseFloat(t.width) || 45;
    const closed = p.length > 3 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1];
    if (closed) continue; // an outline duplicate of a centre line
    runways.push({ w: Math.round((metres / METRES_PER_UNIT) * 10) / 10, d: toPath(simplify(p, 0.5), false) });
  }
}

// ---- ferries ----
// Hand-picked by name: a few routes are a pleasant thread across the harbour;
// all of them would be a hairball.
const FERRIES = [/^Staten Island Ferry$/, /^Sunset Park – Rockaway$/, /^Atlantic Highlands – Battery Maritime Building$/];
const ferries = [];
{
  const json = await overpass('ferry', QUERIES.ferry);
  const names = new Set();
  for (const e of json.elements) {
    const t = e.tags || {};
    if (e.type !== 'way' || !e.geometry) continue;
    names.add(t.name || '(unnamed)');
    if (!FERRIES.some((re) => re.test(t.name || ''))) continue;
    const p = projectGeom(e.geometry);
    if (!p.some(([x, y]) => inView(x, y))) continue;
    ferries.push({ name: t.name, d: toPath(simplify(p, 0.6), false) });
  }
  if (process.argv.includes('--list-ferries')) console.log([...names].sort().join('\n'));
}

// Rail is one combined path (it is drawn with one stroke + one tick stroke).
const railD = rail.filter((s) => s.length >= 2).map((s) => toPath(s, false)).join('');

// ---- coast, for the waterlines ----
// The base map's land outlines (nycGeo.ts), smoothed harder and without the
// piers and specks: waterlines drawn around every pier knot into a scribble.
const COAST_MIN_AREA = 40;
let coastD = '';
{
  const geo = readFileSync('src/ui/story/nycGeo.ts', 'utf8');
  const boroughs = JSON.parse(geo.match(/NYC_BOROUGHS[^=]*= (\[.*?\]);\n/s)[1]);
  const rings = [];
  for (const b of boroughs) {
    for (const sub of b.d.split('Z')) {
      const pts = [...sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      if (pts.length < 4 || area(pts) < COAST_MIN_AREA) continue;
      const s = simplify(pts, 1.6);
      if (s.length >= 4) rings.push(toPath(s, true));
    }
  }
  coastD = rings.join('');
}

const out = `// AUTO-GENERATED by scripts/geo/buildNycDetail.mjs from OpenStreetMap data
// (© OpenStreetMap contributors, ODbL). Do not edit by hand — re-run the
// build script to regenerate. Same 840x1080 map space as nycGeo.ts.
/** Every big park, cemetery and golf course — one path, filled nonzero. */
export const NYC_GREEN = ${JSON.stringify(green.map((g) => g.d).join(''))};
export const NYC_RAIL = ${JSON.stringify(railD)};
export const NYC_RUNWAYS: { w: number; d: string }[] = ${JSON.stringify(runways)};
export const NYC_FERRIES: { name: string; d: string }[] = ${JSON.stringify(ferries)};
/** nycGeo's coast, smoothed and without piers — the waterlines follow it. */
export const NYC_COAST = ${JSON.stringify(coastD)};
`;
writeFileSync('src/ui/story/nycDetail.ts', out);
const kb = (s) => (s.length / 1024).toFixed(1) + 'kb';
console.log('green:', green.length, kb(green.map((g) => g.d).join('')));
console.log('  ', green.slice(0, 40).map((g) => `${g.name}(${g.area})`).join(', '));
console.log('rail:', rail.length, kb(railD));
console.log('runways:', runways.length, 'ferries:', ferries.map((f) => f.name).join(', '), 'coast:', kb(coastD));
console.log('wrote src/ui/story/nycDetail.ts', kb(out));
