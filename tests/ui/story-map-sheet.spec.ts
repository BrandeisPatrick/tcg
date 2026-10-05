/**
 * The story map's render-ready geometry (nycSheet.ts, baked by
 * scripts/geo/bakeNycSheet.mjs from nycGeo.ts and nycDetail.ts) must print
 * what the raw geometry printed: nothing that can show is lost, a layer
 * drawn in cells has every segment whose ink reaches a cell in that cell,
 * nothing is added, and the land is the land. And the app bundles the
 * geometry once — only the baked module.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { NYC_BOROUGHS, NYC_ROADS } from '@/ui/story/nycGeo';
import { NYC_COAST, NYC_RAIL, NYC_GREEN } from '@/ui/story/nycDetail';
import {
  SHEET_GRID, SHEET_LAND, SHEET_ROADS, SHEET_LAND_CLIP, SHEET_BRIDGES, SHEET_KEYLINE, SHEET_HALO,
  SHEET_RULE, SHEET_WATERLINE, SHEET_WATERLINE_CLIPPED, SHEET_RAIL, SHEET_GREEN,
} from '@/ui/story/nycSheet';

type Pt = [number, number];
type Sub = { pts: Pt[]; closed: boolean };
type Seg = [Pt, Pt];

/** Absolute or relative M / L / Z path data → subpaths, in integer
 *  hundredths of a unit (the bake's own precision), so sums don't drift. */
function decode(d: string): Sub[] {
  const toks = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const subs: Sub[] = [];
  let cmd = '', x = 0, y = 0, sx = 0, sy = 0;
  let cur: Sub | null = null;
  const at = (): Pt => [x / 100, y / 100];
  for (let i = 0; i < toks.length;) {
    const t = toks[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t; i++;
      if (cmd === 'z' || cmd === 'Z') { cur!.closed = true; x = sx; y = sy; }
      continue;
    }
    const a = Math.round(Number(t) * 100), b = Math.round(Number(toks[i + 1]) * 100);
    i += 2;
    if (cmd === 'M' || cmd === 'm') {
      x = cmd === 'M' ? a : x + a; y = cmd === 'M' ? b : y + b;
      sx = x; sy = y;
      cur = { pts: [at()], closed: false };
      subs.push(cur);
      cmd = cmd === 'M' ? 'L' : 'l';
    } else {
      x = cmd === 'L' ? a : x + a; y = cmd === 'L' ? b : y + b;
      cur!.pts.push(at());
    }
  }
  return subs;
}
const segsOf = (subs: Sub[]): Seg[] => subs.flatMap(({ pts, closed }) => {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i], pts[i + 1]]);
  if (closed && pts.length > 1) out.push([pts[pts.length - 1], pts[0]]);
  return out;
});
const cellSegs = (layer: string[]) => layer.map((d) => segsOf(decode(d)));

/** A grid of segments: is this point on one of them? */
function segIndex(segs: Seg[]) {
  const G = 4, E = 0.05, m = new Map<number, Seg[]>();
  for (const s of segs) {
    const [x0, x1] = [Math.min(s[0][0], s[1][0]) - E, Math.max(s[0][0], s[1][0]) + E].map((v) => Math.floor(v / G));
    const [y0, y1] = [Math.min(s[0][1], s[1][1]) - E, Math.max(s[0][1], s[1][1]) + E].map((v) => Math.floor(v / G));
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const k = i * 4099 + j;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
  }
  return (p: Pt, eps = 0.02) => (m.get(Math.floor(p[0] / G) * 4099 + Math.floor(p[1] / G)) ?? []).some(([a, b]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]) <= eps;
  });
}
const covers = (has: (p: Pt) => boolean, [a, b]: Seg) => has(a) && has(b) && has([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);

// Land as the sheet fills it: each borough even-odd, united.
const boroughRings = NYC_BOROUGHS.map((b) => decode(b.d).filter((r) => r.closed).map((r) => r.pts));
function inBorough(rings: Pt[][], x: number, y: number) {
  let inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const onLand = ([x, y]: Pt) => boroughRings.some((r) => inBorough(r, x, y));
const onSheet = ([a, b]: Seg) => [a, b].every(([x, y]) => x >= 0 && x <= 840 && y >= 0 && y <= 1080);

const { cols, rows, w: CW, h: CH } = SHEET_GRID;
/** The cells a segment's ink reaches (r units either side). */
function cellsReached([a, b]: Seg, r: number) {
  const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - r) / CW)), i1 = Math.min(cols - 1, Math.floor((Math.max(a[0], b[0]) + r) / CW));
  const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - r) / CH)), j1 = Math.min(rows - 1, Math.floor((Math.max(a[1], b[1]) + r) / CH));
  const out: number[] = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push(j * cols + i);
  return out;
}
const rawSegs = (d: string) => segsOf(decode(d)).filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1]);
// Within this of a segment its ink can reach a cell at any zoom a phone shows.
const REACH = { road: 1.5, coast: 7, waterline: 11 };

describe('the baked sheet', () => {
  it('keeps the land exactly', () => {
    expect(SHEET_LAND.map((l) => l.name)).toEqual(NYC_BOROUGHS.map((b) => b.name));
    SHEET_LAND.forEach((l, k) => {
      const baked = decode(l.d).map((r) => r.pts);
      const raw = boroughRings[k].map((r) => r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]))
        .map((r) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r))
        .filter((r) => r.length > 1);
      expect(baked.length, l.name).toBe(raw.length);
      baked.forEach((r, i) => r.forEach((p, j) => {
        expect(Math.abs(p[0] - raw[i][j][0]) + Math.abs(p[1] - raw[i][j][1]), `${l.name} ring ${i}`).toBeLessThan(1e-6);
      }));
    });
  });

  it('has every road on land in every cell its ink reaches, and nothing else', () => {
    for (const cls of ['minor', 'mid', 'major'] as const) {
      const cells = cellSegs(SHEET_ROADS[cls]).map(segIndex);
      const raw = rawSegs(NYC_ROADS[cls]);
      let checked = 0;
      for (const s of raw) {
        if (!onSheet(s) || !onLand(s[0]) || !onLand(s[1])) continue;
        for (const c of cellsReached(s, REACH.road)) {
          expect(SHEET_LAND_CLIP[c], `${cls}: cell ${c} has no land clip`).not.toBe('');
          expect(covers(cells[c], s), `${cls} ${JSON.stringify(s)} in cell ${c}`).toBe(true);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(raw.length * 0.8);
      // (A lone point stays a dot: a zero-length stroke with round caps.)
      const onRaw = segIndex(segsOf(decode(NYC_ROADS[cls])));
      for (const segs of cellSegs(SHEET_ROADS[cls])) for (const s of segs) expect(covers(onRaw, s), `${cls} adds ${JSON.stringify(s)}`).toBe(true);
    }
  });

  it('prints the bridges: every major road over the water, and only majors', () => {
    const raw = rawSegs(NYC_ROADS.major);
    const bridges = segIndex(cellSegs(SHEET_BRIDGES).flat());
    for (const s of raw) if (onSheet(s) && (!onLand(s[0]) || !onLand(s[1]))) expect(covers(bridges, s), JSON.stringify(s)).toBe(true);
    const onRaw = segIndex(raw);
    for (const s of cellSegs(SHEET_BRIDGES).flat()) expect(covers(onRaw, s)).toBe(true);
    // Far less than the whole network.
    expect(SHEET_BRIDGES.join('').length).toBeLessThan(NYC_ROADS.major.length / 10);
  });

  it('draws every outline in the keyline and the dashed rule', () => {
    const keyline = segIndex(cellSegs(SHEET_KEYLINE).flat());
    NYC_BOROUGHS.forEach((b, k) => {
      const rule = segIndex(cellSegs(SHEET_RULE[k]).flat());
      for (const s of rawSegs(b.d)) {
        if (!onSheet(s)) continue;
        expect(covers(keyline, s), `${b.name} keyline ${JSON.stringify(s)}`).toBe(true);
        expect(covers(rule, s), `${b.name} rule ${JSON.stringify(s)}`).toBe(true);
      }
    });
  });

  it('gives each cell all the coast its see-through halo and waterline reach', () => {
    NYC_BOROUGHS.forEach((b, k) => {
      const halo = cellSegs(SHEET_HALO[k]).map(segIndex);
      for (const s of rawSegs(b.d)) {
        if (!onSheet(s) || (onLand(s[0]) && onLand(s[1]))) continue;
        for (const c of cellsReached(s, REACH.coast)) expect(covers(halo[c], s), `${b.name} halo cell ${c}`).toBe(true);
      }
    });
    const clipped = cellSegs(SHEET_WATERLINE_CLIPPED).map(segIndex);
    const opaque = segIndex(cellSegs(SHEET_WATERLINE).flat());
    for (const s of rawSegs(NYC_COAST)) {
      if (!onSheet(s) || (onLand(s[0]) && onLand(s[1]))) continue;
      expect(covers(opaque, s)).toBe(true);
      for (const c of cellsReached(s, REACH.waterline)) expect(covers(clipped[c], s), `waterline cell ${c}`).toBe(true);
    }
  });

  it('keeps the rail in every cell it reaches, and every park once', () => {
    // The rail is cut into pieces (in its ties' period), so a cell holds the
    // stretch of a long segment that comes near it: sample that stretch.
    const rail = cellSegs(SHEET_RAIL).map(segIndex);
    for (const s of rawSegs(NYC_RAIL)) {
      if (!onSheet(s)) continue;
      const [a, b] = s, n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5);
      for (const c of cellsReached(s, REACH.road)) {
        const x0 = (c % cols) * CW - REACH.road, y0 = Math.floor(c / cols) * CH - REACH.road;
        for (let k = 0; k <= n; k++) {
          const p: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
          if (p[0] < x0 || p[0] > x0 + CW + 2 * REACH.road || p[1] < y0 || p[1] > y0 + CH + 2 * REACH.road) continue;
          expect(rail[c](p), `rail ${JSON.stringify(s)} cell ${c}`).toBe(true);
        }
      }
    }
    // A ring as the bake keeps it: no repeated point, no repeated start.
    const key = (r: Pt[]) => {
      const pts = r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]);
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      return pts.map((p) => `${+p[0].toFixed(2)},${+p[1].toFixed(2)}`).join(' ');
    };
    // (A few parks share an outline; the copies stay, as in the raw path.)
    const tally = (keys: string[]) => keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>());
    const baked = tally(SHEET_GREEN.flatMap((g) => decode(g.d).map((r) => key(r.pts))));
    const raw = decode(NYC_GREEN);
    const rawTally = tally(raw.map((r) => key(r.pts)));
    for (const [k, n] of baked) expect(n, k.slice(0, 40)).toBe(rawTally.get(k));
    // Only parks wholly out on the water may go.
    for (const r of raw) if (!baked.has(key(r.pts))) expect(r.pts.some(onLand)).toBe(false);
  });
});

describe('the bundle', () => {
  it('imports the raw geometry nowhere in the app', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
    });
    for (const f of walk('src')) {
      if (/nyc(Geo|Detail)\.ts$/.test(f)) continue;
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/from ['"][^'"]*nyc(Geo|Detail)['"]/);
    }
  });

  it('keeps the sheet geometry under its budget', () => {
    // 504 kB / 171 kB gzipped as baked on an 8×10 grid; the raw inputs are
    // 906 kB / 349 kB.
    const src = readFileSync('src/ui/story/nycSheet.ts');
    expect(src.length).toBeLessThanOrEqual(560 * 1024);
    expect(gzipSync(src).length).toBeLessThanOrEqual(190 * 1024);
  });
});
