// Bake the story map's render-ready geometry: src/ui/story/nycSheet.ts, the
// one geometry module the app bundles. Inputs are the two baked files, which
// stay in the repo as this script's sources (the app never imports them):
//   - src/ui/story/nycGeo.ts    (scripts/geo/buildNyc.mjs: land, roads, park)
//   - src/ui/story/nycDetail.ts (scripts/geo/buildNycDetail.mjs: parks, rail,
//                                runways, ferries, the smoothed coast)
//
//   node scripts/geo/bakeNycSheet.mjs [--grid=8x10]
//
// Why: Skia walks a whole path for every tile it rasterises, and the sheet
// used to be a few giant paths (the roads were 33k two-point fragments in
// three strings), so every tile paid for the whole city. Here every stroked
// layer is cut into a grid of cells — one element per (layer, cell) — so a
// tile only pays for the geometry near it. The picture does not change:
//   - Road fragments are stitched into long polylines. Their strokes have
//     round caps, so a round join where two fragments met covers exactly what
//     the two caps did.
//   - A layer in an opaque ink gives each segment to one cell (its middle's),
//     handing over mid-segment, where the two round caps hide inside the
//     straight stroke. A see-through layer is clipped to each cell (a rect
//     clip, which meets its neighbour edge to edge), and each cell carries
//     every segment whose ink reaches it, up to the widest stroke the sheet
//     is drawn with — so nothing doubles up and nothing is cut short. The
//     dashed rule is cut where it prints nothing (in a dash's gap); the
//     bridges and the parks go in groups that never touch.
//   - Geometry that cannot show is left out: anything off the sheet, the
//     coast's halo and waterlines deep under the land fill, the roads out on
//     the water. The bridges are only the major roads' stretches near the
//     water, not the whole network stroked again.
//   - The land fills stay whole (cheap, and a cut fill would show seams).
// Deterministic: the same inputs always write the same file.
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=')[1];
const [COLS, ROWS] = arg('grid', '8x10').split('x').map(Number);
const OUT = 'src/ui/story/nycSheet.ts';

// Coordinates are integer hundredths of a map unit: the inputs are printed to
// a tenth, and the points this script adds (cuts, clip corners) get a
// hundredth, so nothing moves by more than 0.005 units.
const U = 100;
const VW = 840 * U, VH = 1080 * U;
const CW = VW / COLS, CH = VH / ROWS;

// The widest `--line` the sheet is drawn at: √(1.7 / zoom) at a zoom of 0.19
// px per unit — a 160 px wide window. (A phone's cover is ~0.78, so 1.5.)
const L_MAX = 3;
// Half the widest stroke of each layer (map units at L_MAX), plus a pixel or
// so for anti-aliasing: how far its ink can reach from its centre line.
const REACH = {
  waterline: (10.5 + 0.25 * L_MAX + 1) * U, // outermost band, 2·10.5 + 0.5·line wide
  coast: (4 * L_MAX + 1) * U,               // shore halo, 8·line wide
  keyline: (0.85 * L_MAX + 0.5) * U,        // 1.7·line
  bridge: (0.6 * L_MAX + 0.5) * U,          // 1.2·line
  road: (0.65 * L_MAX + 0.5) * U,           // majors, 1.3·line
  rail: (0.65 * L_MAX + 0.5) * U,           // ties, 1.3·line
  rule: (0.35 * L_MAX + 0.5) * U,           // dashed rule, 0.7·line
};
const RULE_PERIOD = 5.5 * U; // "3 2.5"
const TIE_PERIOD = 2.7 * U;  // "0.3 2.4"

// ---- inputs -------------------------------------------------------------------------
const geo = readFileSync('src/ui/story/nycGeo.ts', 'utf8');
const detail = readFileSync('src/ui/story/nycDetail.ts', 'utf8');
const json = (src, re) => JSON.parse(src.match(re)[1]);
const BOROUGHS = json(geo, /NYC_BOROUGHS[^=]*= (\[.*?\]);\n/s);
const ROADS = {
  minor: json(geo, /\n\s*minor: (".*?"),\n/s),
  mid: json(geo, /\n\s*mid: (".*?"),\n/s),
  major: json(geo, /\n\s*major: (".*?"),\n/s),
};
const PARK = json(geo, /NYC_PARK = (".*?");\n/s);
const RESERVOIR = json(geo, /NYC_RESERVOIR = (".*?");\n/s);
const GREEN = json(detail, /NYC_GREEN = (".*?");\n/s);
const RAIL = json(detail, /NYC_RAIL = (".*?");\n/s);
const RUNWAYS = json(detail, /NYC_RUNWAYS[^=]*= (\[.*?\]);\n/s);
const FERRIES = json(detail, /NYC_FERRIES[^=]*= (\[.*?\]);\n/s);
const COAST = json(detail, /NYC_COAST = (".*?");\n/s);

/** An absolute M/L/Z path → subpaths of integer points. A closed ring drops
 *  its repeated first point; repeated points in a row collapse. */
function parse(d) {
  const toks = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const subs = [];
  let cur = null, cmd = '';
  for (let i = 0; i < toks.length;) {
    const t = toks[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t; i++;
      if (cmd === 'Z') { cur.closed = true; cur = null; }
      else if (cmd !== 'M' && cmd !== 'L') throw new Error(`unexpected command ${cmd}`);
      continue;
    }
    const p = [Math.round(parseFloat(toks[i]) * U), Math.round(parseFloat(toks[i + 1]) * U)];
    i += 2;
    if (cmd === 'M') { cur = { pts: [p], closed: false }; subs.push(cur); cmd = 'L'; }
    else if (!same(cur.pts[cur.pts.length - 1], p)) cur.pts.push(p);
  }
  for (const s of subs) if (s.closed && s.pts.length > 1 && same(s.pts[0], s.pts[s.pts.length - 1])) s.pts.pop();
  return subs;
}
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

// ---- the compact encoding -------------------------------------------------------------
// Relative commands, at most two decimals (one for the inputs' own points), no
// leading zero, a separator only where the next number could not start on its
// own. Every string starts with an absolute M, so strings can be joined.
function num(n) {
  const neg = n < 0, a = Math.abs(n);
  const int = Math.floor(a / U), frac = a % U;
  let s = frac ? (frac % 10 ? `.${String(frac).padStart(2, '0')}` : `.${frac / 10}`) : '';
  s = (int || !frac ? String(int) : '') + s;
  return (neg ? '-' : '') + s;
}
function encode(subs) {
  let out = '', x = 0, y = 0, last = 'cmd', first = true;
  const put = (n) => {
    const s = num(n);
    const glue = last === 'cmd' || s[0] === '-' || (s[0] === '.' && last.includes('.')) ? '' : ' ';
    out += glue + s;
    last = s;
  };
  for (const { pts, closed } of subs) {
    out += first ? 'M' : 'm';
    last = 'cmd';
    put(first ? pts[0][0] : pts[0][0] - x);
    put(first ? pts[0][1] : pts[0][1] - y);
    // After M the implicit pairs are absolute; after m, relative.
    if (first) { out += 'l'; last = 'cmd'; }
    first = false;
    const sx = pts[0][0], sy = pts[0][1];
    x = sx; y = sy;
    if (pts.length === 1) { put(0); put(0); } // a dot: a zero-length stroke with round caps
    for (let i = 1; i < pts.length; i++) { put(pts[i][0] - x); put(pts[i][1] - y); x = pts[i][0]; y = pts[i][1]; }
    if (closed) { out += 'z'; last = 'cmd'; x = sx; y = sy; }
  }
  return out;
}

/** Order subpaths so each starts near where the last ended (shorter relative
 *  moves), flipping open ones when their far end is nearer. Deterministic. */
function tour(subs, canFlip = true) {
  const left = subs.slice();
  const out = [];
  let x = 0, y = 0;
  while (left.length) {
    let best = 0, bestD = Infinity, flip = false;
    for (let i = 0; i < left.length; i++) {
      const p = left[i].pts;
      const d0 = Math.abs(p[0][0] - x) + Math.abs(p[0][1] - y);
      if (d0 < bestD) { bestD = d0; best = i; flip = false; }
      if (canFlip && !left[i].closed) {
        const q = p[p.length - 1];
        const d1 = Math.abs(q[0] - x) + Math.abs(q[1] - y);
        if (d1 < bestD) { bestD = d1; best = i; flip = true; }
      }
    }
    const s = left.splice(best, 1)[0];
    const pts = flip ? s.pts.slice().reverse() : s.pts;
    out.push({ pts, closed: s.closed });
    const end = s.closed ? pts[0] : pts[pts.length - 1];
    x = end[0]; y = end[1];
  }
  return out;
}

// ---- segment geometry ------------------------------------------------------------------
function ptSeg2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px, ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}
const orient = (ax, ay, bx, by, cx, cy) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
function segSeg2(a, b, c, d) {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]), o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  const o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]), o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  if (o1 * o2 < 0 && o3 * o4 < 0) return 0;
  return Math.min(
    ptSeg2(a[0], a[1], c[0], c[1], d[0], d[1]), ptSeg2(b[0], b[1], c[0], c[1], d[0], d[1]),
    ptSeg2(c[0], c[1], a[0], a[1], b[0], b[1]), ptSeg2(d[0], d[1], a[0], a[1], b[0], b[1]),
  );
}

/** A grid index over segments, for "is anything within r of this segment". */
function segIndex(segs, size) {
  const m = new Map();
  for (const s of segs) {
    const x0 = Math.floor(Math.min(s[0][0], s[1][0]) / size), x1 = Math.floor(Math.max(s[0][0], s[1][0]) / size);
    const y0 = Math.floor(Math.min(s[0][1], s[1][1]) / size), y1 = Math.floor(Math.max(s[0][1], s[1][1]) / size);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const k = i * 100003 + j;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    }
  }
  return {
    near(a, b, r) {
      const x0 = Math.floor((Math.min(a[0], b[0]) - r) / size), x1 = Math.floor((Math.max(a[0], b[0]) + r) / size);
      const y0 = Math.floor((Math.min(a[1], b[1]) - r) / size), y1 = Math.floor((Math.max(a[1], b[1]) + r) / size);
      const r2 = r * r;
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
        for (const s of m.get(i * 100003 + j) ?? []) if (segSeg2(a, b, s[0], s[1]) <= r2) return true;
      }
      return false;
    },
  };
}

// ---- land ------------------------------------------------------------------------------
// Land is what the sheet fills: each borough even-odd, the union of them.
// A two-point ring fills nothing but its outline still prints (a pier's
// spike in the keyline, a blob of halo), so it stays.
const land = BOROUGHS.map((b) => ({ name: b.name, rings: parse(b.d).filter((r) => r.closed && r.pts.length > 1) }));
const BAND = 2 * U;
for (const b of land) {
  b.bands = new Map();
  for (const r of b.rings) {
    const p = r.pts;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      const j0 = Math.floor(Math.min(a[1], c[1]) / BAND), j1 = Math.floor(Math.max(a[1], c[1]) / BAND);
      for (let j = j0; j <= j1; j++) {
        if (!b.bands.has(j)) b.bands.set(j, []);
        b.bands.get(j).push([a, c]);
      }
    }
  }
}
function inBorough(b, x, y) {
  let inside = false;
  for (const [a, c] of b.bands.get(Math.floor(y / BAND)) ?? []) {
    if ((a[1] > y) !== (c[1] > y) && x < ((c[0] - a[0]) * (y - a[1])) / (c[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const inLand = (x, y) => land.some((b) => inBorough(b, x, y));

// The coast: outline edges with water on a side (sampled every unit, a third
// of a unit out). Edges between two boroughs, land on both sides, are not.
const coastSegs = [];
for (const b of land) for (const r of b.rings) {
  const p = r.pts;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], c = p[(i + 1) % p.length];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (!len) continue;
    const nx = (-(c[1] - a[1]) / len) * 0.33 * U, ny = ((c[0] - a[0]) / len) * 0.33 * U;
    const n = Math.max(1, Math.ceil(len / U));
    let wet = false;
    for (let k = 0; k < n && !wet; k++) {
      const t = (k + 0.5) / n, x = a[0] + (c[0] - a[0]) * t, y = a[1] + (c[1] - a[1]) * t;
      wet = !inLand(x + nx, y + ny) || !inLand(x - nx, y - ny);
    }
    if (wet) coastSegs.push([a, c]);
  }
}
const coastIndex = segIndex(coastSegs, 10 * U);
/** Ink within r of this segment lands only on land (the fill covers it). */
const underLand = (a, b, r) => !coastIndex.near(a, b, r) && inLand((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
/** Ink within r of this segment lands only on water. */
const onWater = (a, b, r) => !coastIndex.near(a, b, r) && !inLand((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
const offSheet = (a, b, r) => Math.max(a[0], b[0]) < -r || Math.min(a[0], b[0]) > VW + r || Math.max(a[1], b[1]) < -r || Math.min(a[1], b[1]) > VH + r;

// ---- cells -----------------------------------------------------------------------------
const NCELL = COLS * ROWS;
const cellAt = (x, y) => {
  const i = Math.min(COLS - 1, Math.max(0, Math.floor(x / CW))), j = Math.min(ROWS - 1, Math.max(0, Math.floor(y / CH)));
  return j * COLS + i;
};
/** Cells a box (grown by r) touches. */
function cellsOf(x0, y0, x1, y1, r) {
  const i0 = Math.max(0, Math.floor((x0 - r) / CW)), i1 = Math.min(COLS - 1, Math.floor((x1 + r) / CW));
  const j0 = Math.max(0, Math.floor((y0 - r) / CH)), j1 = Math.min(ROWS - 1, Math.floor((y1 + r) / CH));
  const out = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push(j * COLS + i);
  return out;
}
const segCells = (a, b, r) => cellsOf(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), r);

/** Round-capped, round-joined polylines → per cell, the runs of segments
 *  whose ink (reach r) touches that cell and that `keep` allows. The union of
 *  the runs' strokes is the union of the kept segments' strokes, so a cell's
 *  path (and with it the whole layer) prints exactly what the original did. */
function chunkRuns(polys, r, keep) {
  const cells = Array.from({ length: NCELL }, () => []);
  for (const { pts, closed } of polys) {
    const n = closed ? pts.length : pts.length - 1;
    const runs = new Map(); // cell → { pts, first, last }
    const firsts = new Map();
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (!keep(a, b)) continue;
      for (const c of segCells(a, b, r)) {
        let run = runs.get(c);
        if (run && run.last === i - 1) { run.pts.push(b); run.last = i; continue; }
        run = { pts: [a, b], first: i, last: i };
        runs.set(c, run);
        if (!firsts.has(c)) firsts.set(c, run);
        cells[c].push(run);
      }
    }
    // A closed ring's run through its start point is one run, not two.
    if (closed) for (const [c, last] of runs) {
      const first = firsts.get(c);
      if (first !== last && first.first === 0 && last.last === n - 1) {
        last.pts.push(...first.pts.slice(1));
        cells[c].splice(cells[c].indexOf(first), 1);
      }
    }
    // A single point: a dot.
    if (pts.length === 1 && keep(pts[0], pts[0])) for (const c of segCells(pts[0], pts[0], r)) cells[c].push({ pts: [pts[0]] });
  }
  return cells.map((runs) => (runs.length ? encode(tour(runs.map((x) => ({ pts: x.pts, closed: false })))) : ''));
}

/** Round-capped, round-joined polylines in an opaque ink → per cell, the
 *  runs of segments that cell owns (the one a segment's middle falls in).
 *  Each segment is drawn once: an edge drawn twice prints its anti-aliasing
 *  twice, a hair bolder. Where the owner changes the cut is mid-segment, so
 *  the two round caps there lie inside each other's straight stroke. */
function ownRuns(polys, keep) {
  const cells = Array.from({ length: NCELL }, () => []);
  const mid = (a, b) => [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
  for (const { pts, closed } of polys) {
    const n = closed ? pts.length : pts.length - 1;
    const runs = [];
    let cur = null;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (!keep(a, b)) { cur = null; continue; }
      const cell = cellAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      if (cur && cur.cell === cell) { cur.pts.push(b); cur.last = i; continue; }
      if (cur) {
        const m = mid(a, b);
        cur.pts.push(m);
        cur = { cell, pts: [m, b], first: i, last: i, handed: true };
      } else {
        cur = { cell, pts: [a, b], first: i, last: i };
      }
      runs.push(cur);
    }
    // A closed ring's start point is not a real end: carry on through it.
    if (closed && runs.length > 1) {
      const first = runs[0], last = runs[runs.length - 1];
      if (first.first === 0 && !first.handed && last.last === n - 1) {
        if (first.cell === last.cell) { last.pts.push(...first.pts.slice(1)); runs.shift(); }
        else { const m = mid(pts[0], pts[1]); last.pts.push(m); first.pts[0] = m; }
      }
    }
    for (const r of runs) cells[r.cell].push({ pts: r.pts, closed: false });
  }
  return cells.map((runs) => (runs.length ? encode(tour(runs)) : ''));
}

/** Cut a polyline at multiples of `period` along it (a dash pattern starts
 *  over at each subpath, so a piece starting on a multiple prints the same
 *  dashes), but only where the cell changes. Returns [{ pts, cell }]. A ring
 *  that stays in one cell stays closed. */
function periodPieces(pts, closed, period) {
  const ring = closed ? [...pts, pts[0]] : pts;
  const pieces = [];
  let cur = { pts: [ring[0]], cell: cellAt(ring[0][0], ring[0][1]) };
  let along = 0, next = period;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (next < along + len) {
      const t = (next - along) / len;
      const p = [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t)];
      const cell = cellAt(p[0], p[1]);
      if (cell !== cur.cell) {
        if (!same(p, cur.pts[cur.pts.length - 1])) cur.pts.push(p);
        pieces.push(cur);
        cur = { pts: [p], cell };
      }
      next += period;
    }
    if (!same(b, cur.pts[cur.pts.length - 1])) cur.pts.push(b);
    along += len;
  }
  pieces.push(cur);
  if (closed && pieces.length === 1) return [{ pts, cell: pieces[0].cell, closed: true }];
  return pieces.filter((p) => p.pts.length > 1);
}
const boxOf = (pts) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};
const boxOff = (b, r) => b.x1 < -r || b.x0 > VW + r || b.y1 < -r || b.y0 > VH + r;

/** Sutherland–Hodgman: a ring clipped to a box. Inside the box the result
 *  winds every point as the ring did, so a clip path built from it is the
 *  original clip there. */
function clipRing(pts, x0, y0, x1, y1) {
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= y0, (p) => p[1] <= y1,
  ];
  const cut = [
    (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1],
  ];
  let out = pts;
  for (let e = 0; e < 4 && out.length; e++) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[(i + src.length - 1) % src.length], b = src[i];
      const ina = edges[e](a), inb = edges[e](b);
      if (inb) { if (!ina) out.push(cut[e](a, b)); out.push(b); }
      else if (ina) out.push(cut[e](a, b));
    }
  }
  const res = [];
  for (const p of out) {
    const q = [Math.round(p[0]), Math.round(p[1])];
    if (!res.length || !same(res[res.length - 1], q)) res.push(q);
  }
  if (res.length > 1 && same(res[0], res[res.length - 1])) res.pop();
  return res.length > 2 ? res : null;
}
/** The land inside a box, as one clip path (nonzero). The sheet's land clip
 *  was each borough nonzero, united; every ring winds the same way, so one
 *  path of them all is the same region — and one path spares the browser a
 *  union of clip children, which it gets wrong on the clipped rings' seams. */
function landClip(x0, y0, x1, y1) {
  const rings = [];
  for (const b of land) for (const r of b.rings) {
    const bb = boxOf(r.pts);
    if (bb.x1 < x0 || bb.x0 > x1 || bb.y1 < y0 || bb.y0 > y1) continue;
    const c = clipRing(r.pts, x0, y0, x1, y1);
    if (c) rings.push({ pts: c, closed: true });
  }
  return rings.length ? encode(rings) : '';
}
const ringArea = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return a / 2;
};
// The one-path clip above relies on this.
for (const b of land) for (const r of b.rings) {
  if (ringArea(r.pts) > 0) throw new Error(`${b.name}: a land ring winds the other way; landClip needs a union`);
}

// ---- roads: stitch -----------------------------------------------------------------------
/** Join polylines end to end where they share a point, carrying on as
 *  straight as possible. Exact for round caps + round joins. */
function stitch(polys) {
  const key = (p) => `${p[0]},${p[1]}`;
  const lines = [];
  const dots = [];
  const seen = new Set();
  for (const { pts } of polys) {
    if (pts.length === 1) { dots.push(pts[0]); continue; }
    // The same fragment twice prints once.
    const k = pts.map(key).join(';'), kr = pts.slice().reverse().map(key).join(';');
    if (seen.has(k) || seen.has(kr)) continue;
    seen.add(k);
    lines.push(pts);
  }
  const ends = new Map();
  const addEnd = (p, i) => { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); };
  lines.forEach((pts, i) => { addEnd(pts[0], i); addEnd(pts[pts.length - 1], i); });
  const used = new Uint8Array(lines.length);
  const grow = (trail) => {
    for (;;) {
      const end = trail[trail.length - 1], prev = trail[trail.length - 2];
      const dx = end[0] - prev[0], dy = end[1] - prev[1], dl = Math.hypot(dx, dy) || 1;
      let best = -1, bestDot = -Infinity, bestRev = false;
      for (const i of ends.get(key(end)) ?? []) {
        if (used[i]) continue;
        const pts = lines[i];
        const rev = !same(pts[0], end);
        const nx = rev ? pts[pts.length - 2] : pts[1];
        const ex = nx[0] - end[0], ey = nx[1] - end[1];
        const dot = (dx * ex + dy * ey) / (dl * (Math.hypot(ex, ey) || 1));
        if (dot > bestDot) { bestDot = dot; best = i; bestRev = rev; }
      }
      if (best < 0) return trail;
      used[best] = 1;
      const pts = bestRev ? lines[best].slice().reverse() : lines[best];
      for (let k = 1; k < pts.length; k++) trail.push(pts[k]);
    }
  };
  // Start at dead ends and odd junctions first: fewer, longer trails.
  const order = lines.map((_, i) => i).sort((a, b) => {
    const odd = (i) => (ends.get(key(lines[i][0])).length % 2) + (ends.get(key(lines[i][lines[i].length - 1])).length % 2);
    return odd(b) - odd(a) || a - b;
  });
  const out = [];
  for (const i of order) {
    if (used[i]) continue;
    used[i] = 1;
    let trail = grow(lines[i].slice());
    trail = grow(trail.reverse());
    out.push(dropStraight(trail));
  }
  // A dot prints only where nothing else of its class already covers it.
  const vertices = new Set();
  for (const pts of out) for (const p of pts) vertices.add(key(p));
  const lone = [...new Set(dots.map(key))].filter((k) => !vertices.has(k)).map((k) => k.split(',').map(Number));
  return [...out.map((pts) => ({ pts, closed: false })), ...lone.map((p) => ({ pts: [p], closed: false }))];
}
/** Drop a vertex that lies exactly on the straight line through its
 *  neighbours, between them — its round join adds nothing. */
function dropStraight(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (cross === 0 && dot > 0) continue;
    out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---- bake ------------------------------------------------------------------------------
const stats = {};
const count = (s) => (s.match(/[Mm]/g) ?? []).length;

// Land fills, park and reservoir: whole, re-encoded.
const LAND_OUT = land.map((b) => ({ name: b.name, d: encode(b.rings) }));
const PARK_OUT = encode(parse(PARK));
const RESERVOIR_OUT = encode(parse(RESERVOIR));

// Chart waterlines: the smoothed coast, where its bands can reach the water.
// The opaque bands own their segments; the see-through outer line is
// clipped to each cell, so every cell carries all that reaches it.
const coastRings = parse(COAST).filter((r) => r.closed);
const reachesWater = (r) => (a, b) => !offSheet(a, b, r) && !underLand(a, b, r);
const WATERLINE = ownRuns(coastRings, reachesWater(REACH.waterline));
const WATERLINE_CLIPPED = chunkRuns(coastRings, REACH.waterline, reachesWater(REACH.waterline));

// Keyline (opaque, owned): every outline on the sheet. Where two boroughs
// meet on land their fills' anti-aliased edges let a quarter of what is
// under them through, and the keyline is what lies there. The shore halo
// (see-through, per borough, each cell clipped) only where it can reach the
// water — on land, the keyline over it is all that shows through a seam.
const KEYLINE_OUT = ownRuns(land.flatMap((b) => b.rings), (a, b) => !offSheet(a, b, REACH.keyline));
const HALO_OUT = land.map((b) => chunkRuns(b.rings, REACH.coast, reachesWater(REACH.coast)));

// The dashed rule: every outline on the sheet, cut in a dash's gap where it
// passes into another cell. Pieces never touch, so no cell needs a clip.
const RULE_OUT = land.map((b) => {
  const cells = Array.from({ length: NCELL }, () => []);
  for (const r of b.rings) {
    for (const p of periodPieces(r.pts, true, RULE_PERIOD)) {
      if (boxOff(boxOf(p.pts), REACH.rule)) continue;
      cells[p.cell].push({ pts: p.pts, closed: !!p.closed });
    }
  }
  return cells.map((s) => (s.length ? encode(tour(s, false)) : ''));
});

// Roads, stitched, per class; each cell is clipped to its own land.
const ROADS_OUT = {};
const majorLines = [];
for (const cls of ['minor', 'mid', 'major']) {
  const polys = stitch(parse(ROADS[cls]));
  if (cls === 'major') majorLines.push(...polys);
  stats[`${cls} fragments → polylines`] = `${parse(ROADS[cls]).length} → ${polys.length}`;
  ROADS_OUT[cls] = chunkRuns(polys, REACH.road, (a, b) => !offSheet(a, b, REACH.road) && !onWater(a, b, REACH.road));
}
// A cell's roads are clipped twice: to the cell's square (a rect clip, which
// meets its neighbour's edge to edge) and to the land around the cell. The
// land clip's box reaches past the cell so that only its coast ever shows —
// two polygon clips meeting along a cell edge leave a faint seam — and well
// past the sheet's own edge, where a second soft edge would fade the ink.
const LAND_CLIP = Array.from({ length: NCELL }, (_, c) => {
  const has = ROADS_OUT.minor[c] || ROADS_OUT.mid[c] || ROADS_OUT.major[c];
  if (!has) return '';
  const i = c % COLS, j = Math.floor(c / COLS), m = 3 * U, edge = 20 * U;
  return landClip(
    i === 0 ? -edge : Math.round(i * CW) - m, j === 0 ? -edge : Math.round(j * CH) - m,
    i === COLS - 1 ? VW + edge : Math.round((i + 1) * CW) + m, j === ROWS - 1 ? VH + edge : Math.round((j + 1) * CH) + m,
  );
});

// Bridges: the majors only where their stroke can reach the water. Strokes
// that could touch are one group, and a group is printed by one cell, so a
// see-through cream never doubles where two bridges meet.
const BRIDGES_OUT = (() => {
  const segs = [];
  for (const { pts } of majorLines) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!offSheet(a, b, REACH.bridge) && !underLand(a, b, REACH.bridge)) segs.push({ a, b, line: pts, i });
    }
  }
  const parent = segs.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const idx = new Map();
  const G = 4 * U;
  const span = (s, r) => {
    const x0 = Math.floor((Math.min(s.a[0], s.b[0]) - r) / G), x1 = Math.floor((Math.max(s.a[0], s.b[0]) + r) / G);
    const y0 = Math.floor((Math.min(s.a[1], s.b[1]) - r) / G), y1 = Math.floor((Math.max(s.a[1], s.b[1]) + r) / G);
    const keys = [];
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) keys.push(i * 100003 + j);
    return keys;
  };
  segs.forEach((s, n) => {
    for (const k of span(s, 0)) { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(n); }
  });
  const near = 2 * REACH.bridge;
  segs.forEach((s, n) => {
    for (const k of span(s, near)) {
      for (const m of idx.get(k) ?? []) {
        if (m !== n && find(m) !== find(n) && segSeg2(s.a, s.b, segs[m].a, segs[m].b) <= near * near) parent[find(m)] = find(n);
      }
    }
  });
  const groups = new Map();
  segs.forEach((s, n) => { const g = find(n); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(s); });
  const cells = Array.from({ length: NCELL }, () => []);
  for (const list of groups.values()) {
    // Runs of consecutive segments along their line (segs is in line order).
    const runs = [];
    for (const s of list) {
      const last = runs[runs.length - 1];
      if (last && last.line === s.line && last.i === s.i - 1) { last.pts.push(s.b); last.i = s.i; }
      else runs.push({ line: s.line, i: s.i, pts: [s.a, s.b] });
    }
    const bb = boxOf(runs.flatMap((r) => r.pts));
    cells[cellAt((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2)].push(...runs.map((r) => ({ pts: r.pts, closed: false })));
  }
  stats['bridge segments'] = segs.length;
  return cells.map((s) => (s.length ? encode(tour(s)) : ''));
})();

// Parks: rings that overlap (or nearly touch) are one group — the green is
// see-through, so overlapping parks must share a path. A group wholly on
// land needs no clip; one that reaches the water is clipped to the land in
// its own box. Each group is printed by the cell its middle falls in.
const GREEN_OUT = (() => {
  const rings = parse(GREEN).filter((r) => r.closed);
  const boxes = rings.map((r) => boxOf(r.pts));
  const parent = rings.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const m = U;
  for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x0 - m <= b.x1 && b.x0 - m <= a.x1 && a.y0 - m <= b.y1 && b.y0 - m <= a.y1) parent[find(i)] = find(j);
  }
  const groups = new Map();
  rings.forEach((r, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
  const free = Array.from({ length: NCELL }, () => []);
  const clipped = Array.from({ length: NCELL }, () => []);
  for (const list of [...groups.values()].sort((a, b) => a[0] - b[0])) {
    const segs = list.flatMap((i) => rings[i].pts.map((p, k, a) => [p, a[(k + 1) % a.length]]));
    const wet = segs.some(([a, b]) => !underLand(a, b, 0.5 * U));
    const bb = boxOf(list.flatMap((i) => rings[i].pts));
    const c = cellAt((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
    (wet ? clipped : free)[c].push(...list.map((i) => rings[i]));
  }
  const out = [];
  for (let c = 0; c < NCELL; c++) {
    if (free[c].length) out.push({ d: encode(free[c]) });
    if (clipped[c].length) {
      const bb = boxOf(clipped[c].flatMap((r) => r.pts));
      // A box well clear of the parks, so only its coast ever shows.
      const clip = landClip(bb.x0 - 3 * U, bb.y0 - 3 * U, bb.x1 + 3 * U, bb.y1 + 3 * U);
      // Parks out on the water print nothing.
      if (clip) out.push({ d: encode(clipped[c]), clip });
    }
  }
  stats['green rings / groups / elements'] = `${rings.length} / ${groups.size} / ${out.length}`;
  return out;
})();
// No roads in a cell → no clip; a road cell with no land → no roads printed.
for (let c = 0; c < NCELL; c++) {
  if (!LAND_CLIP[c]) for (const cls of ['minor', 'mid', 'major']) ROADS_OUT[cls][c] = '';
}

// Rail: the line and its ties share one geometry, cut at a tie's period
// where the cell changes (the ties start over at each piece, as they did at
// each original piece), and each cell is clipped to itself.
const RAIL_OUT = (() => {
  const cells = Array.from({ length: NCELL }, () => []);
  for (const r of parse(RAIL)) {
    for (const p of periodPieces(r.pts, false, TIE_PERIOD)) {
      const bb = boxOf(p.pts);
      for (const c of cellsOf(bb.x0, bb.y0, bb.x1, bb.y1, REACH.rail)) cells[c].push({ pts: p.pts, closed: false });
    }
  }
  return cells.map((s) => (s.length ? encode(tour(s, false)) : ''));
})();

const RUNWAYS_OUT = RUNWAYS.map((r) => ({ w: r.w, d: encode(parse(r.d)) }));
const FERRIES_OUT = FERRIES.map((f) => ({ name: f.name, d: encode(parse(f.d)) }));

// ---- write -------------------------------------------------------------------------------
const J = (v) => JSON.stringify(v);
const out = `// AUTO-GENERATED by scripts/geo/bakeNycSheet.mjs from nycGeo.ts and
// nycDetail.ts (NYC borough boundaries + OpenStreetMap © OpenStreetMap
// contributors, ODbL). Do not edit by hand — re-run the bake to regenerate.
// The story map's only geometry module: the same 840x1080 map space, cut into
// a ${COLS}x${ROWS} grid of cells so a tile of the sheet only rasterises what
// is near it. Per-cell arrays are row-major, '' where a cell has nothing.
// Paths are relative with up to two decimals; every string starts with an
// absolute M, so strings can be joined.
export const SHEET_VIEW = { w: 840, h: 1080 } as const;
export const SHEET_GRID = { cols: ${COLS}, rows: ${ROWS}, w: ${CW / U}, h: ${CH / U} } as const;
/** Each borough's land, whole (filled even-odd). */
export const SHEET_LAND: { name: string; d: string }[] = ${J(LAND_OUT)};
export const SHEET_PARK = ${J(PARK_OUT)};
export const SHEET_RESERVOIR = ${J(RESERVOIR_OUT)};
/** The smoothed coast where the chart waterlines can show, per cell: each
 *  segment once (the opaque bands), and everything reaching the cell (the
 *  see-through outer line, clipped to the cell). */
export const SHEET_WATERLINE: string[] = ${J(WATERLINE)};
export const SHEET_WATERLINE_CLIPPED: string[] = ${J(WATERLINE_CLIPPED)};
/** Every outline where the keyline can show, per cell, each segment once. */
export const SHEET_KEYLINE: string[] = ${J(KEYLINE_OUT)};
/** Each borough's outline reaching each cell, for its halo: [borough][cell]. */
export const SHEET_HALO: string[][] = ${J(HALO_OUT)};
/** Each borough's whole outline for the dashed rule, cut in the dashes' gaps: [borough][cell]. */
export const SHEET_RULE: string[][] = ${J(RULE_OUT)};
/** The major roads near the water — the bridges — per cell. */
export const SHEET_BRIDGES: string[] = ${J(BRIDGES_OUT)};
/** Stitched roads per class, per cell; a cell is clipped to SHEET_LAND_CLIP. */
export const SHEET_ROADS: { minor: string[]; mid: string[]; major: string[] } = ${J(ROADS_OUT)};
/** The land inside each cell that has roads (nonzero). */
export const SHEET_LAND_CLIP: string[] = ${J(LAND_CLIP)};
/** The big parks in groups that never overlap; \`clip\` is the land around a group that reaches the water. */
export const SHEET_GREEN: { d: string; clip?: string }[] = ${J(GREEN_OUT)};
/** Rail per cell: the line and its ties, clipped to the cell. */
export const SHEET_RAIL: string[] = ${J(RAIL_OUT)};
export const SHEET_RUNWAYS: { w: number; d: string }[] = ${J(RUNWAYS_OUT)};
export const SHEET_FERRIES: { name: string; d: string }[] = ${J(FERRIES_OUT)};
`;
writeFileSync(OUT, out);

const kb = (s) => `${(s.length / 1024).toFixed(1)}kB`;
const cellsUsed = (a) => a.filter(Boolean).length;
const sum = (a) => a.reduce((n, s) => n + s.length, 0);
console.log(`grid ${COLS}x${ROWS} (${CW / U}x${CH / U} units)`);
for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`);
console.log(`  land ${kb(LAND_OUT.map((l) => l.d).join(''))}`);
console.log(`  waterline ${cellsUsed(WATERLINE)} cells ${(sum(WATERLINE) / 1024).toFixed(1)}kB ${WATERLINE.reduce((n, s) => n + count(s), 0)} subpaths; clipped ${(sum(WATERLINE_CLIPPED) / 1024).toFixed(1)}kB`);
console.log(`  keyline ${cellsUsed(KEYLINE_OUT)} cells ${(sum(KEYLINE_OUT) / 1024).toFixed(1)}kB`);
console.log(`  halo ${HALO_OUT.reduce((n, b) => n + cellsUsed(b), 0)} cells ${(HALO_OUT.reduce((n, b) => n + sum(b), 0) / 1024).toFixed(1)}kB`);
console.log(`  rule ${RULE_OUT.reduce((n, b) => n + cellsUsed(b), 0)} cells ${(RULE_OUT.reduce((n, b) => n + sum(b), 0) / 1024).toFixed(1)}kB`);
console.log(`  bridges ${cellsUsed(BRIDGES_OUT)} cells ${(sum(BRIDGES_OUT) / 1024).toFixed(1)}kB`);
for (const cls of ['minor', 'mid', 'major']) console.log(`  ${cls} ${cellsUsed(ROADS_OUT[cls])} cells ${(sum(ROADS_OUT[cls]) / 1024).toFixed(1)}kB ${ROADS_OUT[cls].reduce((n, s) => n + count(s), 0)} subpaths`);
console.log(`  land clips ${cellsUsed(LAND_CLIP)} cells ${(sum(LAND_CLIP) / 1024).toFixed(1)}kB`);
console.log(`  green ${GREEN_OUT.length} elements ${(GREEN_OUT.reduce((n, g) => n + g.d.length + (g.clip ?? '').length, 0) / 1024).toFixed(1)}kB`);
console.log(`  rail ${cellsUsed(RAIL_OUT)} cells ${(sum(RAIL_OUT) / 1024).toFixed(1)}kB`);
console.log(`wrote ${OUT} ${kb(out)}`);
