import type { CardId } from '@/engine/types';
import type { StoryNode, NodeKind } from './types';

// Designed campaign: three routes across the metro, each a sequence of named
// NYC locations climbing to a regional boss. Locations carry real lat/lng and
// are projected with the SAME transform as the baked map (scripts/geo/buildNyc.mjs)
// so every node lands on the actual place. Combat nodes name a themed enemy
// hero (chosen for that hero's lore — e.g. Mo & Krill underground at City Hall).

const BB = { S: 40.520, N: 40.910, W: -74.200, E: -73.800 };
const VW = 840, VH = 1080;
const LAT0 = (BB.S + BB.N) / 2;
const COSL = Math.cos((LAT0 * Math.PI) / 180);
const Uw = (BB.E - BB.W) * COSL, Uh = BB.N - BB.S;
const SC = Math.min(VW / Uw, VH / Uh);
const OFFX = (VW - Uw * SC) / 2, OFFY = (VH - Uh * SC) / 2;
const project = (lat: number, lng: number) => ({
  x: (OFFX + (lng - BB.W) * COSL * SC) / VW,
  y: (OFFY + (BB.N - lat) * SC) / VH,
});

interface Loc { id: string; name: string; kind: NodeKind; lat: number; lng: number; enemy?: CardId }
interface Region { id: string; name: string; locs: Loc[] }

// Each route opens with a RECRUIT and carries three recruit nodes total, so a
// player committing to any single route can always build to a full 4-hero
// roster (1 start + 3 recruits) before its boss. Recruits come early; the
// themed battles ramp up after you've had a chance to grow.
// Routes are laid out as clean radial fans from the shared Battery start — each
// node sits further from the centre than the last, so a path spans OUTWARD to a
// far-edge boss and never doubles back. Spine runs north up Manhattan into the
// Bronx; Boroughs runs south through Brooklyn to Coney Island; Gates runs
// south-west across NJ to Staten Island. Each route opens with a recruit and
// holds three, so any single path can build a full roster.
export const REGIONS: Region[] = [
  {
    id: 'spine', name: 'The Spine',
    locs: [
      { id: 'wallst', name: 'Wall Street', kind: 'recruit', lat: 40.7120, lng: -74.0095 },
      { id: 'cityhall', name: 'City Hall Subway', kind: 'battle', lat: 40.7260, lng: -73.9990, enemy: 'hero_mo_krill' },
      { id: 'timessq', name: 'Times Square', kind: 'recruit', lat: 40.7560, lng: -73.9860 },
      { id: 'themet', name: 'The Met', kind: 'recruit', lat: 40.7790, lng: -73.9630 },
      { id: 'reservoir', name: 'Central Park Reservoir', kind: 'battle', lat: 40.8010, lng: -73.9560, enemy: 'hero_kelvin' },
      { id: 'cloisters', name: 'The Cloisters', kind: 'supply', lat: 40.8400, lng: -73.9340 },
      { id: 'yankee', name: 'Yankee Stadium', kind: 'boss', lat: 40.8620, lng: -73.9080, enemy: 'hero_abrams' },
    ],
  },
  {
    id: 'boroughs', name: 'The Outer Boroughs',
    locs: [
      { id: 'bkbridge', name: 'Brooklyn Bridge', kind: 'recruit', lat: 40.7000, lng: -73.9930 },
      { id: 'gowanus', name: 'Gowanus Canal', kind: 'battle', lat: 40.6760, lng: -73.9895, enemy: 'hero_viscous' },
      { id: 'botanic', name: 'Botanic Garden', kind: 'recruit', lat: 40.6620, lng: -73.9660 },
      { id: 'greenwood', name: 'Green-Wood Cemetery', kind: 'battle', lat: 40.6470, lng: -73.9870, enemy: 'hero_lady_geist' },
      { id: 'flushing', name: 'Prospect Park', kind: 'recruit', lat: 40.6300, lng: -73.9690 },
      { id: 'citifield', name: 'Barclays Center', kind: 'supply', lat: 40.6080, lng: -73.9790 },
      { id: 'coney', name: 'Coney Island', kind: 'boss', lat: 40.5740, lng: -73.9830, enemy: 'hero_sinclair' },
    ],
  },
  {
    id: 'gates', name: 'The Western Gates',
    locs: [
      { id: 'liberty_sp', name: 'Liberty State Park', kind: 'recruit', lat: 40.7080, lng: -74.0500 },
      { id: 'liberty', name: 'Statue of Liberty', kind: 'recruit', lat: 40.6905, lng: -74.0620 },
      { id: 'portnewark', name: 'Port Newark', kind: 'battle', lat: 40.6670, lng: -74.0950, enemy: 'hero_drifter' },
      { id: 'siferry', name: 'St. George Ferry', kind: 'recruit', lat: 40.6440, lng: -74.0740 },
      { id: 'jerseyheights', name: 'Stapleton', kind: 'battle', lat: 40.6180, lng: -74.0920, enemy: 'hero_shiv' },
      { id: 'todthill', name: 'Todt Hill', kind: 'boss', lat: 40.5880, lng: -74.1180, enemy: 'hero_vindicta' },
    ],
  },
];

export const BOSS_COUNT = REGIONS.length;

// All three routes branch from one shared origin at the Battery (lower
// Manhattan), where the three boroughs meet across the harbour.
const START = { id: 'battery', name: 'Battery Park', kind: 'battle' as NodeKind, lat: 40.7033, lng: -74.0170 };

// Several iconic locations sit within a few blocks of each other (the Battery,
// Wall St, City Hall, the bridges, Liberty) so their projected dots overlap.
// Relax them apart with light pairwise repulsion — keeps each near its real
// spot while staying legible.
function declutter(nodes: StoryNode[], minDist = 0.05, iters = 90): void {
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < minDist) {
          if (d < 1e-4) { dx = 0.001 * (i + 1); dy = 0.001 * (j + 1); d = Math.hypot(dx, dy); }
          const push = (minDist - d) / 2, ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
        }
      }
    }
  }
  for (const n of nodes) {
    n.x = Math.min(0.97, Math.max(0.03, n.x));
    n.y = Math.min(0.97, Math.max(0.03, n.y));
  }
}

/** Flatten the campaign into the StoryNode graph: one shared start node that
 *  branches into three linear regional routes (each ending in a boss). */
export function buildCampaign(): StoryNode[] {
  const out: StoryNode[] = [];
  const sp = project(START.lat, START.lng);
  out.push({
    id: START.id, kind: START.kind, depth: 0, x: sp.x, y: sp.y,
    next: REGIONS.map((r) => r.locs[0].id), // branch into each route
    name: START.name, region: 'start',
  });
  for (const region of REGIONS) {
    region.locs.forEach((loc, i) => {
      const p = project(loc.lat, loc.lng);
      out.push({
        id: loc.id,
        kind: loc.kind,
        depth: i + 1,
        x: p.x,
        y: p.y,
        next: i < region.locs.length - 1 ? [region.locs[i + 1].id] : [],
        name: loc.name,
        region: region.id,
        enemy: loc.enemy,
      });
    });
  }
  declutter(out);
  return out;
}
