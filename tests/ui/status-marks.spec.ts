import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { STATUSES } from '@/statuses';
import type { FxEvent, StatusFx } from '@/engine/types';
import { buildFxTimeline, volleySwings } from '@/ui/effects/fx/fxTimeline';
import { StatusIcon, statusChipText, statusLabel } from '@/ui/card/StatusIcon';
import { StatusMark, markFor } from '@/ui/card/statusMarks';
import { StatusStamp } from '@/ui/effects/fx/support';
import { GROUPS } from '@/ui/gallery/FxShowroom';
import { StatusesTab } from '@/ui/gallery/StatusesTab';

// A status is printed twice: as a chip on the hero's tile and sheet (StatusIcon),
// and as the sticker the FX layer slaps on when it lands (StatusStamp). Every
// status in the registry has both, none is ever blank, and the five the new kits
// bring — Fixation, Dome, Rooted, Rabbit, Last Stand — wear a mark of their own
// on both, the same drawing; an id the registry has never heard of gets a plain
// diamond tag and a label spelled out of its id, and never throws.

const MARKED = ['fixation', 'dome', 'rooted', 'rabbit', 'last_stand'] as const;
const UNKNOWN = 'mystery_status';

/** What React prints for text: the apostrophe of "Djinn's Mark" is an entity. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

const chip = (id: string, value = 2, size?: 'compact' | 'normal' | 'large') =>
  renderToStaticMarkup(createElement(StatusIcon, { id, value, duration: 2, size }));
const sticker = (id: string, value = 2) => {
  const ev: StatusFx = { kind: 'status', seq: 7, iid: 'card', statusId: id, value, duration: 2, debuff: false };
  return renderToStaticMarkup(createElement(StatusStamp, { rect: { left: 40, top: 60, width: 180, height: 240 }, ev, at: 0, hold: 1050 }));
};

describe('which statuses wear a mark', () => {
  it('the five new ones have a mark of their own', () => {
    for (const id of MARKED) expect(markFor(id), id).toBe(id);
  });

  it('an id the registry does not know wears the diamond tag, and the rest of the registry wears none (their label or flourish says it)', () => {
    expect(markFor(UNKNOWN)).toBe('unknown');
    expect(markFor('')).toBe('unknown');
    const unmarked = STATUSES.filter((s) => !(MARKED as readonly string[]).includes(s.id));
    expect(unmarked.length).toBeGreaterThan(0);
    for (const s of unmarked) expect(markFor(s.id), s.id).toBeNull();
  });

  it('a mark is drawn for the ones that wear one and for nothing else', () => {
    for (const s of STATUSES) {
      const svg = renderToStaticMarkup(createElement(StatusMark, { id: s.id, color: '#fff', size: 12 }));
      if (markFor(s.id)) expect(svg, s.id).toContain(`data-mark="${markFor(s.id)}"`);
      else expect(svg, s.id).toBe('');
    }
  });

  it('every mark is a different drawing', () => {
    const drawings = [...MARKED, UNKNOWN].map((id) => renderToStaticMarkup(createElement(StatusMark, { id, color: '#fff', size: 12 })).replace(/data-mark="[a-z_]+"/, ''));
    expect(new Set(drawings).size).toBe(drawings.length);
  });
});

describe('every status has a chip and a sticker, and neither is blank', () => {
  for (const s of STATUSES) {
    it(`${s.id}: the chip reads its label${markFor(s.id) ? ' behind its mark' : ''}, the sticker its chip text`, () => {
      const c = chip(s.id);
      expect(c.length).toBeGreaterThan(0);
      expect(c).toContain(esc(statusLabel(s.id)));
      expect(statusLabel(s.id).trim().length).toBeGreaterThan(0);
      if (markFor(s.id)) expect(c).toContain(`data-mark="${s.id}"`);
      else expect(c).not.toContain('data-mark');

      const st = sticker(s.id, 3);
      expect(st.length).toBeGreaterThan(0);
      expect(st).toContain(esc(statusChipText(s.id, 3)));
      if (markFor(s.id)) expect(st).toContain(`data-mark="${s.id}"`);
    });
  }

  it('the chip prints in all three sizes, with its stack and its turns', () => {
    for (const size of ['compact', 'normal', 'large'] as const) {
      for (const id of MARKED) {
        const c = chip(id, 3, size);
        expect(c, `${id} ${size}`).toContain(`data-mark="${id}"`);
        expect(c, `${id} ${size}`).toContain('(2)'); // turns left
      }
    }
  });

  it('Fixation always prints its stack, one stack included; Last Stand its strike; the on-or-off ones no number', () => {
    expect(statusChipText('fixation', 1)).toBe('Fixation 1');
    expect(statusChipText('fixation', 3)).toBe('Fixation 3');
    expect(statusChipText('last_stand', 1)).toBe('Last Stand 1');
    expect(statusChipText('last_stand', 5)).toBe('Last Stand 5');
    for (const id of ['dome', 'rooted', 'rabbit']) expect(statusChipText(id, 1), id).toBe(statusLabel(id));
  });

  it('the reticle on the sticker carries the stack count; on a chip the pill does', () => {
    const st = sticker('fixation', 3);
    expect(st).toMatch(/data-mark="fixation"[\s\S]*?<text[^>]*>3<\/text>/);
    const pill = renderToStaticMarkup(createElement(StatusMark, { id: 'fixation', color: '#fff', size: 12 }));
    expect(pill).not.toContain('<text');
  });
});

describe('an id nobody has registered', () => {
  it('prints a chip and a sticker — spelled out, with the diamond — and never throws', () => {
    expect(statusLabel(UNKNOWN)).toBe('Mystery status');
    expect(statusLabel('some-other_one')).toBe('Some other one');
    expect(statusLabel('')).toBe('Status');
    const c = chip(UNKNOWN, 1);
    expect(c).toContain('Mystery status');
    expect(c).toContain('data-mark="unknown"');
    const st = sticker(UNKNOWN, 1);
    expect(st).toContain('Mystery status');
    expect(st).toContain('data-mark="unknown"');
    // …with a magnitude too, and for the empty id.
    expect(chip(UNKNOWN, 4)).toContain('Mystery status');
    expect(() => chip('')).not.toThrow();
    expect(() => sticker('')).not.toThrow();
    expect(chip('')).toContain('Status');
  });
});

describe('the Gallery lists every status', () => {
  const tab = renderToStaticMarkup(createElement(StatusesTab));

  it('the Statuses tab has a row, and a chip, for every status in the registry — the new ones included', () => {
    expect(tab.match(/gal-status__row/g)).toHaveLength(STATUSES.length);
    for (const s of STATUSES) {
      expect(tab, s.id).toContain(`<span class="gal-status__id">${s.id}</span>`);
    }
    for (const id of MARKED) expect(tab, id).toContain(`data-mark="${id}"`);
  });

  it('each new status is under the class its definition gives it', () => {
    const section = (title: string) => tab.split('<section').find((part) => part.includes(`aria-label="${title}"`)) ?? '';
    expect(section('Buffs')).not.toBe('');
    expect(section('Debuffs')).not.toBe('');
    for (const id of ['dome', 'last_stand']) expect(section('Buffs'), id).toContain(`>${id}<`);
    for (const id of ['fixation', 'rooted', 'rabbit']) expect(section('Debuffs'), id).toContain(`>${id}<`);
  });
});

describe('the Combat showroom has a demo for each of them', () => {
  const demos = GROUPS.flatMap((g) => g.demos);
  /** The showroom's events, stamped as the engine would. */
  const stamped = (label: string): FxEvent[] => demos.find((d) => d.label === label)!.events.map((e, i) => ({ ...e, seq: i + 1 }) as FxEvent);
  const statusOf = (label: string) => stamped(label).filter((e): e is StatusFx => e.kind === 'status');

  it('a Dome going up, a Fixation stack landing, Rooted and Rabbit landing, a Last Stand taking hold', () => {
    expect(statusOf('Dome').map((e) => e.statusId)).toEqual(['dome']);
    expect(statusOf('Fixation ×2').map((e) => [e.statusId, e.value])).toEqual([['fixation', 2]]);
    expect(statusOf('Rooted').map((e) => e.statusId)).toEqual(['rooted']);
    expect(statusOf('Rabbit').map((e) => e.statusId)).toEqual(['rabbit']);
    expect(statusOf('Last Stand 5').map((e) => [e.statusId, e.value])).toEqual([['last_stand', 5]]);
    for (const label of ['Dome', 'Fixation ×2', 'Rooted', 'Rabbit', 'Last Stand 5']) {
      expect(buildFxTimeline(stamped(label)).items, label).toHaveLength(1);
    }
  });

  it('Last Stand going off: the shape of the engine\'s start-of-turn batch (a channel hit on each enemy from the bearer, then its heal)', () => {
    const events = stamped('Last Stand goes off (Kelvin → all, then heals)');
    expect(events.map((e) => e.kind)).toEqual(['hit', 'hit', 'hit', 'heal']);
    for (const e of events.slice(0, 3)) expect(e).toMatchObject({ kind: 'hit', type: 'spirit', tag: 'channel', cast: 'tick', source: { iid: 'y0' } });
    expect(events[3]).toMatchObject({ kind: 'heal', iid: 'y0', tag: undefined, from: undefined });
  });

  it('the volley (3): a cast, then a swing at each hero and its hit (cast attack), as `attackAll` reports it', () => {
    const events = stamped('Volley · Bullet Dance — a swing at each hero (3)');
    expect(events.map((e) => (e.kind === 'hit' ? `hit:${e.cast}` : e.kind))).toEqual(['cast', 'swing', 'hit:attack', 'swing', 'hit:attack', 'swing', 'hit:attack']);
    expect(volleySwings(events)).toHaveLength(3);
    // Each swing is at the hero its hit lands on, from the card that cast.
    const cast = events[0] as Extract<FxEvent, { kind: 'cast' }>;
    for (let i = 1; i < events.length; i += 2) {
      const swing = events[i] as Extract<FxEvent, { kind: 'swing' }>;
      const hit = events[i + 1] as Extract<FxEvent, { kind: 'hit' }>;
      expect(swing.iid).toBe(cast.iid);
      expect(hit.iid).toBe(swing.targetIid);
      expect(hit.source?.iid).toBe(cast.iid);
    }
    expect(buildFxTimeline(events).items.filter((i) => i.ev.kind === 'swing')).toHaveLength(3);
  });

  it('a volley with a Shield and a knockout in it', () => {
    const events = stamped('Volley · a Shield soaks one, another falls (3)');
    expect(events.map((e) => (e.kind === 'hit' || e.kind === 'shield' ? `${e.kind}:${e.cast}` : e.kind)))
      .toEqual(['cast', 'swing', 'shield:attack', 'swing', 'hit:attack', 'swing', 'hit:attack']);
    expect(volleySwings(events)).toHaveLength(3);
  });
});
