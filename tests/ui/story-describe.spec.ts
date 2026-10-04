import { describe, it, expect } from 'vitest';
import type { StoryRun } from '@/story/types';
import { newRun, clearNode } from '@/story/storyRun';
import { enemyRosterSize, enemyBuff, patronHpForDepth } from '@/story/content';
import { effectiveKind, stopState, stopFacts, routeProgress } from '@/story/describe';

// The panels print these facts, so they are pinned against the campaign as
// designed: the Battery opens three routes, each numbered from 1 and ending
// at its boss, and a fight's numbers are the ones content.ts will field.

const node = (run: StoryRun, id: string) => run.nodes.find((n) => n.id === id)!;
const clearAll = (run: StoryRun, ids: string[]) => ids.reduce(clearNode, run);

describe('effectiveKind', () => {
  it('reads a recruit stop as supply once the roster has four heroes', () => {
    const run = newRun('hero_kelvin');
    expect(effectiveKind(run, node(run, 'wallst'))).toBe('recruit');
    const full = { ...run, heroes: ['hero_kelvin', 'hero_haze', 'hero_abrams', 'hero_yamato'] };
    expect(effectiveKind(full, node(full, 'wallst'))).toBe('supply');
    // Other kinds are untouched.
    expect(effectiveKind(full, node(full, 'cityhall'))).toBe('battle');
    expect(effectiveKind(full, node(full, 'cloisters'))).toBe('supply');
  });
});

describe('stopState', () => {
  it('opens only the Battery on a fresh run', () => {
    const run = newRun('hero_kelvin');
    expect(stopState(run, node(run, 'battery'))).toBe('open');
    expect(stopState(run, node(run, 'wallst'))).toBe('locked');
  });

  it('marks cleared stops and opens the next stop on every route', () => {
    const run = clearAll(newRun('hero_kelvin'), ['battery', 'wallst']);
    expect(stopState(run, node(run, 'battery'))).toBe('cleared');
    expect(stopState(run, node(run, 'wallst'))).toBe('cleared');
    expect(stopState(run, node(run, 'cityhall'))).toBe('open');
    expect(stopState(run, node(run, 'bkbridge'))).toBe('open');
    expect(stopState(run, node(run, 'liberty_sp'))).toBe('open');
    expect(stopState(run, node(run, 'timessq'))).toBe('locked');
  });

  it('locks every uncleared stop once the run is over', () => {
    const run = { ...clearAll(newRun('hero_kelvin'), ['battery']), status: 'lost' as const };
    expect(stopState(run, node(run, 'wallst'))).toBe('locked');
    expect(stopState(run, node(run, 'battery'))).toBe('cleared');
  });
});

describe('stopFacts', () => {
  it('names the shared start as the Battery, stop 0', () => {
    const run = newRun('hero_kelvin');
    const f = stopFacts(run, node(run, 'battery'));
    expect(f.routeName).toBe('The Battery');
    expect(f.place).toBe('Battery Park');
    expect(f.stopNumber).toBe(0);
    expect(f.routeStops).toBe(0);
    expect(f.state).toBe('open');
    expect(f.combat).toBe(true);
    expect(f.leader).toBeUndefined();
  });

  it('numbers stops along their route', () => {
    const run = newRun('hero_kelvin');
    const wall = stopFacts(run, node(run, 'wallst'));
    expect(wall.routeName).toBe('The Spine');
    expect(wall.stopNumber).toBe(1);
    expect(wall.routeStops).toBe(7);
    const yankee = stopFacts(run, node(run, 'yankee'));
    expect(yankee.stopNumber).toBe(7);
    const todt = stopFacts(run, node(run, 'todthill'));
    expect(todt.routeName).toBe('The Western Gates');
    expect(todt.stopNumber).toBe(6);
    expect(todt.routeStops).toBe(6);
  });

  it('carries the fight numbers content.ts fields', () => {
    const run = newRun('hero_kelvin');
    for (const id of ['battery', 'cityhall', 'reservoir', 'yankee', 'coney']) {
      const n = node(run, id);
      const f = stopFacts(run, n);
      expect(f.combat).toBe(true);
      expect(f.foes).toBe(enemyRosterSize(n.depth, n.kind));
      expect(f.buff).toEqual(enemyBuff(n.depth, n.kind));
      expect(f.patronHp).toBe(patronHpForDepth(n.depth));
    }
    const city = stopFacts(run, node(run, 'cityhall'));
    expect(city.leader).toBe('hero_mo_krill');
    expect(city.foes).toBe(2);
    expect(city.patronHp).toBe(3);
    const boss = stopFacts(run, node(run, 'yankee'));
    expect(boss.foes).toBe(4);
    expect(boss.buff).toEqual({ atk: 4, hp: 8 });
  });

  it('gives non-combat stops no fight numbers', () => {
    const run = newRun('hero_kelvin');
    const f = stopFacts(run, node(run, 'timessq'));
    expect(f.combat).toBe(false);
    expect(f.foes).toBe(0);
    expect(f.patronHp).toBe(0);
    expect(f.buff).toEqual({ atk: 0, hp: 0 });
  });

  it('points a locked stop at the earliest uncleared stop before it', () => {
    const fresh = newRun('hero_kelvin');
    expect(stopFacts(fresh, node(fresh, 'timessq')).lockedBy?.id).toBe('battery');
    expect(stopFacts(fresh, node(fresh, 'battery')).lockedBy).toBeUndefined();
    const run = clearAll(fresh, ['battery', 'wallst']);
    expect(stopFacts(run, node(run, 'timessq')).lockedBy?.id).toBe('cityhall');
    expect(stopFacts(run, node(run, 'yankee')).lockedBy?.id).toBe('cityhall');
    expect(stopFacts(run, node(run, 'cityhall')).lockedBy).toBeUndefined();
  });
});

describe('routeProgress', () => {
  it('lists the three routes in campaign order, none open before the Battery', () => {
    const run = newRun('hero_kelvin');
    const routes = routeProgress(run);
    expect(routes.map((r) => r.id)).toEqual(['spine', 'boroughs', 'gates']);
    expect(routes.map((r) => r.boss.id)).toEqual(['yankee', 'coney', 'todthill']);
    for (const r of routes) {
      expect(r.cleared).toBe(0);
      expect(r.bossDown).toBe(false);
      expect(r.next?.id).toBe(r.stops[0].id);
      expect(r.open).toBe(false);
      expect(r.stops.some((n) => n.id === 'battery')).toBe(false);
    }
  });

  it('counts cleared stops and moves `next` along', () => {
    const run = clearAll(newRun('hero_kelvin'), ['battery', 'wallst', 'cityhall', 'bkbridge']);
    const [spine, boroughs, gates] = routeProgress(run);
    expect(spine.cleared).toBe(2);
    expect(spine.next?.id).toBe('timessq');
    expect(spine.open).toBe(true);
    expect(boroughs.cleared).toBe(1);
    expect(boroughs.next?.id).toBe('gowanus');
    expect(gates.cleared).toBe(0);
    expect(gates.open).toBe(true);
  });

  it('reports a fallen boss and a finished route', () => {
    const spine = ['wallst', 'cityhall', 'timessq', 'themet', 'reservoir', 'cloisters', 'yankee'];
    const run = clearAll(newRun('hero_kelvin'), ['battery', ...spine]);
    const [r] = routeProgress(run);
    expect(r.cleared).toBe(7);
    expect(r.bossDown).toBe(true);
    expect(r.next).toBeNull();
    expect(r.open).toBe(false);
  });
});
