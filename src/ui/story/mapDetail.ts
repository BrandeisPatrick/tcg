/**
 * The story map's detail layer, hand-placed: the names printed on the sheet
 * (water, islands, neighbourhoods and towns, bridges, streets) and where the
 * landmark vignettes stand. Everything is real lat/lng, projected with the
 * same transform as the baked map (scripts/geo/buildNyc.mjs), so a name sits
 * on its place at every zoom.
 *
 * Placement rules, checked by tests/ui/story-map-detail.spec.ts:
 *   - nothing names a campaign stop, or repeats the sheet's own borough and
 *     river names — those belong to NycMap;
 *   - nothing sits where a stop's marker or name tag can fall (stopZone);
 *   - a vignette of a place that IS a stop stands beside it, not on it.
 */

// ---- projection (as buildNyc.mjs) ---------------------------------------------

const VW = 840, VH = 1080;
const BB = { S: 40.520, N: 40.910, W: -74.200, E: -73.800 };
const LAT0 = (BB.S + BB.N) / 2;
const COSL = Math.cos((LAT0 * Math.PI) / 180);
const Uw = (BB.E - BB.W) * COSL, Uh = BB.N - BB.S;
const SC = Math.min(VW / Uw, VH / Uh);
const OFFX = (VW - Uw * SC) / 2, OFFY = (VH - Uh * SC) / 2;

/** lat/lng → the sheet's 840×1080 map units. */
export function project(lat: number, lng: number): { x: number; y: number } {
  return { x: OFFX + (lng - BB.W) * COSL * SC, y: OFFY + (BB.N - lat) * SC };
}

/** Metres on the ground per map unit (~40) — the scale bar's ruler. */
export const METRES_PER_UNIT = 111320 / SC;

// ---- zoom bands ------------------------------------------------------------------

/** When a thing is printed: `always`, from the mid band, or only close in. */
export type Tier = 'always' | 'mid' | 'near';

/** The screen's `--line` (√(1.7 / px-per-unit)) at the widest zoom each tier
 *  can show at: a phone's cover (0.78) for `always`, then the band floors
 *  (2.4, 3.6). Type is sized × `--line`, so this is its largest size in map
 *  units — what the clearance checks must assume. */
export const LINE_AT: Record<Tier, number> = {
  always: Math.sqrt(1.7 / 0.78),
  mid: Math.sqrt(1.7 / 2.4),
  near: Math.sqrt(1.7 / 3.6),
};

// ---- labels ------------------------------------------------------------------------

export type LabelKind = 'water' | 'island' | 'place' | 'bridge' | 'street';

export interface MapLabel {
  text: string;
  kind: LabelKind;
  lat: number;
  lng: number;
  /** Degrees; or set `toward` and the label runs along that line. */
  rotate?: number;
  /** A second point on the street/channel: the label is set along it. */
  toward?: [number, number];
  /** Type size in map units at the 1.7 px-per-unit reference (× `--line`). */
  size?: number;
  tier?: Tier;
}

/** Default type size and tier per kind. */
export const KIND_STYLE: Record<LabelKind, { size: number; tier: Tier }> = {
  water: { size: 7, tier: 'mid' },
  island: { size: 3.4, tier: 'mid' },
  place: { size: 4.4, tier: 'mid' },
  bridge: { size: 3, tier: 'mid' },
  street: { size: 3.5, tier: 'near' },
};

export const LABELS: MapLabel[] = [
  // Water — brush script, cream. The big bodies print at every zoom.
  { text: 'Upper Bay', kind: 'water', lat: 40.6608, lng: -74.0419, size: 12, tier: 'always', rotate: -10 },
  { text: 'Lower Bay', kind: 'water', lat: 40.5543, lng: -74.0238, size: 15, tier: 'always' },
  { text: 'Jamaica Bay', kind: 'water', lat: 40.5854, lng: -73.8357, size: 10, tier: 'always', rotate: -14 },
  { text: 'Atlantic Ocean', kind: 'water', lat: 40.5308, lng: -73.8714, size: 14, tier: 'always', rotate: -8 },
  { text: 'The Narrows', kind: 'water', lat: 40.6247, lng: -74.0486, rotate: -69 },
  { text: 'Kill Van Kull', kind: 'water', lat: 40.6478, lng: -74.1239, rotate: -3 },
  { text: 'Flushing Bay', kind: 'water', lat: 40.7719, lng: -73.8535, size: 6, rotate: 71 },
  { text: 'Gravesend Bay', kind: 'water', lat: 40.5904, lng: -74.0143 },
  { text: 'Long Island Sound', kind: 'water', lat: 40.8031, lng: -73.8066, size: 6, rotate: -90 },

  // Islands.
  { text: 'Governors\nIsland', kind: 'island', lat: 40.6890, lng: -74.0191, size: 3 },
  { text: 'Roosevelt Island', kind: 'island', lat: 40.7601, lng: -73.9519, size: 2.6, rotate: -62 },
  { text: 'Randalls\nIsland', kind: 'island', lat: 40.7923, lng: -73.9209 },
  { text: 'Rikers Island', kind: 'island', lat: 40.7883, lng: -73.8842, size: 3 },

  // Neighbourhoods — Manhattan.
  { text: 'Harlem', kind: 'place', lat: 40.8125, lng: -73.9400 },
  { text: 'Upper West Side', kind: 'place', lat: 40.7865, lng: -73.9771, rotate: -61 },
  { text: 'Upper East Side', kind: 'place', lat: 40.7684, lng: -73.9533, rotate: -61 },
  { text: "Hell's Kitchen", kind: 'place', lat: 40.7663, lng: -73.9905 },
  { text: 'Chelsea', kind: 'place', lat: 40.7464, lng: -74.0014 },
  { text: 'Gramercy', kind: 'place', lat: 40.7377, lng: -73.9800 },
  { text: 'East\nVillage', kind: 'place', lat: 40.7284, lng: -73.9771 },
  { text: 'Lower\nEast Side', kind: 'place', lat: 40.7186, lng: -73.9824 },
  { text: 'Inwood', kind: 'place', lat: 40.8703, lng: -73.9247 },
  // Brooklyn.
  { text: 'Williamsburg', kind: 'place', lat: 40.7092, lng: -73.9547 },
  { text: 'Greenpoint', kind: 'place', lat: 40.7294, lng: -73.9495 },
  { text: 'Bushwick', kind: 'place', lat: 40.6944, lng: -73.9200 },
  { text: 'Bed-Stuy', kind: 'place', lat: 40.6872, lng: -73.9404 },
  { text: 'Crown Heights', kind: 'place', lat: 40.6688, lng: -73.9390 },
  { text: 'Park Slope', kind: 'place', lat: 40.6753, lng: -73.9705 },
  { text: 'Red Hook', kind: 'place', lat: 40.6800, lng: -74.0096 },
  { text: 'Sunset Park', kind: 'place', lat: 40.6453, lng: -74.0124 },
  { text: 'Bay Ridge', kind: 'place', lat: 40.6262, lng: -74.0300 },
  { text: 'Bensonhurst', kind: 'place', lat: 40.5994, lng: -73.9976 },
  { text: 'Brighton Beach', kind: 'place', lat: 40.5760, lng: -73.9524 },
  { text: 'Sheepshead Bay', kind: 'place', lat: 40.5868, lng: -73.9452 },
  { text: 'East New York', kind: 'place', lat: 40.6659, lng: -73.8818 },
  { text: 'Canarsie', kind: 'place', lat: 40.6319, lng: -73.8942 },
  // Queens.
  { text: 'Astoria', kind: 'place', lat: 40.7645, lng: -73.9238 },
  { text: 'Long Island\nCity', kind: 'place', lat: 40.7446, lng: -73.9428 },
  { text: 'Sunnyside', kind: 'place', lat: 40.7432, lng: -73.9181 },
  { text: 'Jackson Heights', kind: 'place', lat: 40.7638, lng: -73.8880 },
  { text: 'Flushing', kind: 'place', lat: 40.7648, lng: -73.8323 },
  { text: 'Forest Hills', kind: 'place', lat: 40.7175, lng: -73.8452 },
  { text: 'Ridgewood', kind: 'place', lat: 40.7002, lng: -73.9057 },
  { text: 'Howard Beach', kind: 'place', lat: 40.6561, lng: -73.8356 },
  { text: 'Rockaway', kind: 'place', lat: 40.5724, lng: -73.8571, rotate: -23 },
  // The Bronx.
  { text: 'Riverdale', kind: 'place', lat: 40.8937, lng: -73.9085 },
  { text: 'Fordham', kind: 'place', lat: 40.8551, lng: -73.8809 },
  { text: 'Hunts Point', kind: 'place', lat: 40.8089, lng: -73.8799 },
  { text: 'Soundview', kind: 'place', lat: 40.8154, lng: -73.8571 },
  { text: 'Mott Haven', kind: 'place', lat: 40.8053, lng: -73.9152 },
  // Staten Island.
  { text: 'Port Richmond', kind: 'place', lat: 40.6348, lng: -74.1253 },
  { text: 'New Dorp', kind: 'place', lat: 40.5738, lng: -74.1158 },
  { text: 'Midland Beach', kind: 'place', lat: 40.5832, lng: -74.0810 },
  // New Jersey.
  { text: 'Hoboken', kind: 'place', lat: 40.7432, lng: -74.0310 },
  { text: 'Jersey City', kind: 'place', lat: 40.7215, lng: -74.0467 },
  { text: 'Newark', kind: 'place', lat: 40.7349, lng: -74.1715 },
  { text: 'Bayonne', kind: 'place', lat: 40.6753, lng: -74.1215 },
  { text: 'Union City', kind: 'place', lat: 40.7793, lng: -74.0229 },
  { text: 'Fort Lee', kind: 'place', lat: 40.8558, lng: -73.9752 },
  { text: 'Secaucus', kind: 'place', lat: 40.7894, lng: -74.0572 },
  { text: 'Hackensack', kind: 'place', lat: 40.8862, lng: -74.0429 },
  { text: 'Kearny', kind: 'place', lat: 40.7710, lng: -74.1477 },
  { text: 'Rutherford', kind: 'place', lat: 40.8266, lng: -74.1067 },

  // Bridges — cream caps on the water beside the span.
  { text: 'Verrazzano Br.', kind: 'bridge', lat: 40.6002, lng: -74.0443 },
  { text: 'Bayonne Br.', kind: 'bridge', lat: 40.6442, lng: -74.1467 },
  { text: 'Williamsburg Br.', kind: 'bridge', lat: 40.7222, lng: -73.9709, rotate: -79 },
  { text: 'Whitestone Br.', kind: 'bridge', lat: 40.8017, lng: -73.8356 },

  // Streets — only close in, set along the street.
  { text: 'Broadway', kind: 'street', lat: 40.7727, lng: -73.9822, toward: [40.7770, -73.9820] },
  { text: 'Fifth Ave', kind: 'street', lat: 40.7660, lng: -73.9717, toward: [40.7698, -73.9690] },
  { text: '42nd St', kind: 'street', lat: 40.7506, lng: -73.9739, toward: [40.7484, -73.9690] },
  { text: '34th St', kind: 'street', lat: 40.7469, lng: -73.9808, toward: [40.7447, -73.9758] },
  { text: '57th St', kind: 'street', lat: 40.7644, lng: -73.9773, toward: [40.7622, -73.9723] },
  { text: '125th St', kind: 'street', lat: 40.8129, lng: -73.9572, toward: [40.8105, -73.9525] },
  { text: 'FDR Drive', kind: 'street', lat: 40.7720, lng: -73.9459, toward: [40.7754, -73.9424] },
  { text: 'Flatbush Ave', kind: 'street', lat: 40.6875, lng: -73.9799, toward: [40.6837, -73.9772] },
  { text: 'Atlantic Ave', kind: 'street', lat: 40.6805, lng: -73.9503, toward: [40.6801, -73.9446] },
  { text: 'Grand Concourse', kind: 'street', lat: 40.8375, lng: -73.9142, toward: [40.8416, -73.9124] },
  { text: 'Queens Blvd', kind: 'street', lat: 40.7395, lng: -73.8920, toward: [40.7384, -73.8864] },
  { text: 'Hylan Blvd', kind: 'street', lat: 40.5797, lng: -74.1002, toward: [40.5829, -74.0964] },
];

/** A label's anchor and angle on the sheet. With `toward`, the anchor is the
 *  midpoint of the two points and the angle runs along them, turned so the
 *  type never reads upside down. */
export function placeLabel(l: MapLabel): { x: number; y: number; rotate: number } {
  const a = project(l.lat, l.lng);
  if (!l.toward) return { ...a, rotate: l.rotate ?? 0 };
  const b = project(l.toward[0], l.toward[1]);
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, rotate: Math.round(deg * 10) / 10 };
}

// ---- landmark vignettes ------------------------------------------------------------

export type VignetteId =
  | 'liberty' | 'chrysler' | 'brooklynBridge' | 'gwb' | 'verrazzano'
  | 'wonderWheel' | 'unisphere' | 'ballpark' | 'lighthouse' | 'ferry';

export interface Landmark {
  id: VignetteId;
  lat: number;
  lng: number;
  /** Line ink: ink on the paper, cream where it stands on the water. */
  tone: 'ink' | 'cream';
  /** The campaign stop it illustrates — it stands beside that stop. */
  stop?: string;
}

/** Each drawing's base centre. The real spot unless noted. */
export const LANDMARKS: Landmark[] = [
  // Liberty Island, beside the decluttered "Statue of Liberty" stop.
  { id: 'liberty', lat: 40.6892, lng: -74.0445, tone: 'cream', stop: 'liberty' },
  // A few doors east of Lexington, clear of the Times Square stop's tag.
  { id: 'chrysler', lat: 40.7511, lng: -73.9714, tone: 'ink' },
  // Over the river just above its stop, where the real span crosses.
  { id: 'brooklynBridge', lat: 40.7067, lng: -73.9930, tone: 'cream', stop: 'bkbridge' },
  { id: 'gwb', lat: 40.8517, lng: -73.9527, tone: 'cream' },
  { id: 'verrazzano', lat: 40.6066, lng: -74.0447, tone: 'cream' },
  // Off the Coney Island stop's right shoulder, clear of its seal and tag.
  { id: 'wonderWheel', lat: 40.5771, lng: -73.9695, tone: 'ink', stop: 'coney' },
  // In Flushing Meadows, a little south of its real spot, clear of QUEENS.
  { id: 'unisphere', lat: 40.7403, lng: -73.8449, tone: 'ink' },
  // A ballpark off the "Yankee Stadium" stop's right shoulder (the stop is
  // not on the real stadium; above it would be the Harlem River).
  { id: 'ballpark', lat: 40.8627, lng: -73.8914, tone: 'ink', stop: 'yankee' },
  // Robbins Reef light.
  { id: 'lighthouse', lat: 40.6574, lng: -74.0656, tone: 'cream' },
  // A ferry on the Staten Island Ferry's line.
  { id: 'ferry', lat: 40.6825, lng: -74.0333, tone: 'cream' },
];

/** Each vignette's extent around its base centre, in map units — for the
 *  clearance checks (the drawings live in MapDetails.tsx). */
export const VIGNETTE_BOX: Record<VignetteId, { x0: number; y0: number; x1: number; y1: number }> = {
  liberty: { x0: -3.4, y0: -18.4, x1: 3.4, y1: 0 },
  chrysler: { x0: -3, y0: -20, x1: 3, y1: 0 },
  brooklynBridge: { x0: -10, y0: -7.4, x1: 10, y1: 0.4 },
  gwb: { x0: -11, y0: -9.4, x1: 11, y1: 0.8 },
  verrazzano: { x0: -13, y0: -10.4, x1: 13, y1: 1 },
  wonderWheel: { x0: -6.8, y0: -15.4, x1: 6.8, y1: 0 },
  unisphere: { x0: -7.6, y0: -14.8, x1: 7.6, y1: 1.4 },
  ballpark: { x0: -9, y0: -12.8, x1: 9, y1: 0.6 },
  lighthouse: { x0: -5, y0: -11.8, x1: 5, y1: 0.4 },
  ferry: { x0: -8.2, y0: -5.8, x1: 8.2, y1: 1.4 },
};

// ---- soundings + scale bar -----------------------------------------------------

/** Chart depths (feet) scattered over open water, as on a harbour chart. */
export const SOUNDINGS: { lat: number; lng: number; depth: number }[] = [
  { lat: 40.6717, lng: -74.0305, depth: 43 },
  { lat: 40.6735, lng: -74.0572, depth: 32 },
  { lat: 40.6507, lng: -74.0357, depth: 38 },
  { lat: 40.6471, lng: -74.0548, depth: 27 },
  { lat: 40.5706, lng: -74.0429, depth: 24 },
  { lat: 40.5615, lng: -74.0000, depth: 19 },
  { lat: 40.5446, lng: -74.0572, depth: 21 },
  { lat: 40.5388, lng: -74.0119, depth: 26 },
  { lat: 40.5478, lng: -73.9762, depth: 17 },
  { lat: 40.5344, lng: -73.9404, depth: 23 },
  { lat: 40.5251, lng: -73.9142, depth: 34 },
  { lat: 40.5265, lng: -73.8261, depth: 38 },
  { lat: 40.6059, lng: -73.8761, depth: 12 },
  { lat: 40.8876, lng: -73.9452, depth: 51 },
  { lat: 40.5832, lng: -74.0276, depth: 31 },
];

/** The scale bar's left end, in the open water of the Lower Bay. */
export const SCALE_BAR = { lat: 40.5287, lng: -73.9952 };

// ---- clearance -----------------------------------------------------------------------

export type Box = { x0: number; y0: number; x1: number; y1: number };

/** The ground a stop's marker and its name tag can cover at the mid band's
 *  widest zoom (2.4 px per unit): the marker, and the tag above or below it
 *  (StopMarker sets tags 10px caps, 19px tall, 4px off the rim). Nothing
 *  printed here may fall inside it. */
export function stopZone(x: number, y: number, name: string, boss = false): Box {
  const S = 2.4;
  const d = 35 + (boss ? 10 : 0);
  const r = (boss ? d * 1.34 : d) / 2;
  const tagW = name.length * 7.2 + 13;
  const hw = Math.max(r, tagW / 2) / S;
  const h = (r + 4 + 19) / S;
  return { x0: x - hw, y0: y - h, x1: x + hw, y1: y + h };
}

/** Points spread over a label's (rotated) box — enough to test it against
 *  the stop zones. Widths are estimates: caps with tracking run ~0.78 em a
 *  letter, the brush script ~0.46 em. */
export function labelPoints(l: MapLabel): { x: number; y: number }[] {
  const { x, y, rotate } = placeLabel(l);
  const style = KIND_STYLE[l.kind];
  const size = (l.size ?? style.size) * LINE_AT[l.tier ?? style.tier];
  const lines = l.text.split('\n');
  const em = l.kind === 'water' ? 0.46 : 0.78;
  const w = Math.max(...lines.map((s) => s.length)) * size * em;
  const h = lines.length * size * 1.15;
  // A street name rides above its street (MapDetails sets it 0.45em up).
  const lift = l.kind === 'street' ? -0.8 * size : 0;
  const c = Math.cos((rotate * Math.PI) / 180), s = Math.sin((rotate * Math.PI) / 180);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 2; j++) {
      const u = (i / 8 - 0.5) * w;
      const v = (j / 2 - 0.5) * h + lift;
      out.push({ x: x + u * c - v * s, y: y + u * s + v * c });
    }
  }
  return out;
}

export const inBox = (p: { x: number; y: number }, b: Box) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
