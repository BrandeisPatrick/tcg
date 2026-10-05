/**
 * The story map's detail layer must stay background: every name and vignette
 * sits on the sheet, on the right ground (water names on water, places on
 * land), clear of every stop's marker and name tag, and never repeats a
 * stop's name or the sheet's own borough and river names.
 */
import { describe, it, expect } from 'vitest';
import { buildCampaign } from '@/story/campaign';
import { NYC_BOROUGHS } from '@/ui/story/nycGeo';
import {
  LABELS, LANDMARKS, VIGNETTE_BOX, SOUNDINGS, SCALE_BAR,
  project, placeLabel, labelPoints, stopZone, inBox, type Box,
} from '@/ui/story/mapDetail';
import { DETAIL_WATER, WATERLINE_BLENDS } from '@/ui/story/MapDetails';
import { MAP_WATER } from '@/ui/story/NycMap';

const W = 840, H = 1080;
const stops = buildCampaign().map((n) => ({
  name: n.name ?? n.id,
  x: n.x * W,
  y: n.y * H,
  zone: stopZone(n.x * W, n.y * H, n.name ?? n.id, n.kind === 'boss'),
}));

// NycMap's own names: the boroughs, New Jersey, the two rivers, the title.
const SHEET_NAMES = ['Manhattan', 'Bronx', 'Queens', 'Brooklyn', 'Staten Island', 'New Jersey', 'Hudson River', 'East River', 'New York City'];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();

// Land, as the sheet fills it (evenodd over every borough's rings).
const rings = NYC_BOROUGHS.flatMap((b) => b.d.split('Z').map((sub) =>
  [...sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]),
).filter((r) => r.length > 2));
function onLand(x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

const boxesHit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('map detail labels', () => {
  it('sit on the sheet', () => {
    for (const l of LABELS) {
      for (const p of labelPoints(l)) {
        expect(p.x, l.text).toBeGreaterThanOrEqual(0);
        expect(p.x, l.text).toBeLessThanOrEqual(W);
        expect(p.y, l.text).toBeGreaterThanOrEqual(0);
        expect(p.y, l.text).toBeLessThanOrEqual(H);
      }
    }
  });

  it('keep clear of every stop and its name tag', () => {
    for (const l of LABELS) {
      for (const p of labelPoints(l)) {
        for (const s of stops) {
          expect(inBox(p, s.zone), `${l.text} under ${s.name}`).toBe(false);
          expect(Math.hypot(p.x - s.x, p.y - s.y), `${l.text} near ${s.name}`).toBeGreaterThanOrEqual(12);
        }
      }
    }
  });

  it('never name a stop or repeat the sheet’s own names', () => {
    // "St. George" would name the "St. George Ferry" stop; "Newark" (the
    // city) is not "Port Newark", nor "Queens Blvd" the borough.
    for (const l of LABELS) {
      const t = norm(l.text);
      for (const name of stops.map((s) => norm(s.name))) {
        expect(name === t || name.startsWith(`${t} `) || t.includes(name), `${l.text} vs ${name}`).toBe(false);
      }
      for (const name of SHEET_NAMES.map(norm)) expect(t, l.text).not.toBe(name);
    }
    const texts = LABELS.map((l) => norm(l.text));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('print water names on the water and place names on the land', () => {
    for (const l of LABELS) {
      const { x, y } = placeLabel(l);
      const wet = l.kind === 'water' || l.kind === 'bridge';
      expect(onLand(x, y), `${l.text} at ${x.toFixed(0)},${y.toFixed(0)}`).toBe(!wet);
    }
  });
});

describe('map detail vignettes and chart marks', () => {
  const boxOf = (m: (typeof LANDMARKS)[number]) => {
    const p = project(m.lat, m.lng), b = VIGNETTE_BOX[m.id];
    return { x0: p.x + b.x0, y0: p.y + b.y0, x1: p.x + b.x1, y1: p.y + b.y1 };
  };

  it('stay on the sheet and clear of the stops', () => {
    expect(LANDMARKS.length).toBeLessThanOrEqual(12);
    for (const m of LANDMARKS) {
      const b = boxOf(m);
      expect(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= W && b.y1 <= H, m.id).toBe(true);
      for (const s of stops) expect(boxesHit(b, s.zone), `${m.id} under ${s.name}`).toBe(false);
    }
  });

  it('stand beside the stop they illustrate', () => {
    for (const m of LANDMARKS.filter((m) => m.stop)) {
      const s = buildCampaign().find((n) => n.id === m.stop);
      expect(s, m.id).toBeDefined();
      const b = boxOf(m);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      expect(Math.hypot(cx - s!.x * W, cy - s!.y * H), m.id).toBeLessThan(60);
    }
  });

  it('keep the soundings and the scale bar out on open water', () => {
    for (const s of [...SOUNDINGS, SCALE_BAR]) {
      const p = project(s.lat, s.lng);
      expect(p.x > 0 && p.x < W && p.y > 0 && p.y < H).toBe(true);
      expect(onLand(p.x, p.y), `${s.lat},${s.lng}`).toBe(false);
    }
  });
});

describe('map detail data', () => {
  // The bundled geometry's budget is in story-map-sheet.spec.ts; nycDetail.ts
  // is only a bake input now.

  it('cuts its waterlines back to the sheet’s own water', () => {
    expect(DETAIL_WATER).toBe(MAP_WATER);
  });

  it('prints the inner waterlines in the colour their cream made over that water', () => {
    const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    const water = hex(MAP_WATER), cream = [242, 230, 203];
    for (const { alpha, ink } of WATERLINE_BLENDS) {
      const rgb = ink.match(/\d+/g)!.map(Number);
      // Within a level of the exact blend: the raster rounds its alpha to 8 bits.
      rgb.forEach((c, k) => expect(Math.abs(c - (water[k] + (cream[k] - water[k]) * alpha)), ink).toBeLessThan(1));
    }
  });
});
