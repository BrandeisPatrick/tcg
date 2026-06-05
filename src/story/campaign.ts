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

export const REGIONS: Region[] = [
  {
    id: 'spine', name: 'The Spine',
    locs: [
      { id: 'battery', name: 'Battery Park', kind: 'battle', lat: 40.7033, lng: -74.0170 },
      { id: 'wallst', name: 'Wall Street', kind: 'battle', lat: 40.7074, lng: -74.0104, enemy: 'hero_wraith' },
      { id: 'cityhall', name: 'City Hall Subway', kind: 'battle', lat: 40.7127, lng: -74.0059, enemy: 'hero_mo_krill' },
      { id: 'timessq', name: 'Times Square', kind: 'supply', lat: 40.7580, lng: -73.9855 },
      { id: 'themet', name: 'The Met', kind: 'battle', lat: 40.7794, lng: -73.9632, enemy: 'hero_mirage' },
      { id: 'reservoir', name: 'Central Park Reservoir', kind: 'battle', lat: 40.7857, lng: -73.9625, enemy: 'hero_kelvin' },
      { id: 'cloisters', name: 'The Cloisters', kind: 'recruit', lat: 40.8649, lng: -73.9319 },
      { id: 'yankee', name: 'Yankee Stadium', kind: 'boss', lat: 40.8296, lng: -73.9262, enemy: 'hero_abrams' },
    ],
  },
  {
    id: 'boroughs', name: 'The Outer Boroughs',
    locs: [
      { id: 'bkbridge', name: 'Brooklyn Bridge', kind: 'battle', lat: 40.7061, lng: -73.9969, enemy: 'hero_lash' },
      { id: 'gowanus', name: 'Gowanus Canal', kind: 'battle', lat: 40.6736, lng: -73.9890, enemy: 'hero_viscous' },
      { id: 'greenwood', name: 'Green-Wood Cemetery', kind: 'battle', lat: 40.6579, lng: -73.9940, enemy: 'hero_lady_geist' },
      { id: 'botanic', name: 'Botanic Garden', kind: 'recruit', lat: 40.6680, lng: -73.9630 },
      { id: 'flushing', name: 'Flushing Meadows', kind: 'battle', lat: 40.7466, lng: -73.8444, enemy: 'hero_dynamo' },
      { id: 'citifield', name: 'Citi Field', kind: 'supply', lat: 40.7571, lng: -73.8458 },
      { id: 'coney', name: 'Coney Island', kind: 'boss', lat: 40.5745, lng: -73.9790, enemy: 'hero_sinclair' },
    ],
  },
  {
    id: 'gates', name: 'The Western Gates',
    locs: [
      { id: 'liberty_sp', name: 'Liberty State Park', kind: 'battle', lat: 40.7045, lng: -74.0530 },
      { id: 'portnewark', name: 'Port Newark', kind: 'battle', lat: 40.6850, lng: -74.1400, enemy: 'hero_drifter' },
      { id: 'jerseyflats', name: 'Jersey Flats', kind: 'supply', lat: 40.7250, lng: -74.0950 },
      { id: 'siferry', name: 'St. George Ferry', kind: 'recruit', lat: 40.6420, lng: -74.0740 },
      { id: 'todthill', name: 'Todt Hill', kind: 'battle', lat: 40.6010, lng: -74.1050, enemy: 'hero_shiv' },
      { id: 'liberty', name: 'Statue of Liberty', kind: 'boss', lat: 40.6892, lng: -74.0445, enemy: 'hero_vindicta' },
    ],
  },
];

export const BOSS_COUNT = REGIONS.length;

// Several iconic locations sit within a few blocks of each other (the Battery,
// Wall St, City Hall, the bridges, Liberty) so their projected dots overlap.
// Relax them apart with light pairwise repulsion — keeps each near its real
// spot while staying legible.
function declutter(nodes: StoryNode[], minDist = 0.052, iters = 60): void {
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

/** Flatten the regions into the StoryNode graph (linear chain per region). */
export function buildCampaign(): StoryNode[] {
  const out: StoryNode[] = [];
  for (const region of REGIONS) {
    region.locs.forEach((loc, i) => {
      const p = project(loc.lat, loc.lng);
      out.push({
        id: loc.id,
        kind: loc.kind,
        depth: i,
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
