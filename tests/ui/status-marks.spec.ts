import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { STATUSES } from '@/statuses';
import type { FxEvent, StatusFx } from '@/engine/types';
import { buildFxTimeline, volleySwings } from '@/ui/effects/fx/fxTimeline';
import { StatusIcon, statusChipText, statusLabel } from '@/ui/card/StatusIcon';
import { MARKED_IDS, StatusMark, markFor } from '@/ui/card/statusMarks';
import { StatusStamp } from '@/ui/effects/fx/support';
import { Explain } from '@/ui/explain/Explain';
import { statusContent } from '@/ui/explain/content';
import { explainStore } from '@/ui/explain/store';
import { GROUPS } from '@/ui/gallery/FxShowroom';
import { StatusesTab } from '@/ui/gallery/StatusesTab';

// A status is printed twice: as a chip on the hero's tile and sheet (StatusIcon),
// and as the sticker the FX layer slaps on when it lands (StatusStamp). Every
// status in the registry has both, none is ever blank, and every one wears a
// drawn mark of its own on both, the same drawing (the two channels share the
// ring). Two ids are drawn ahead of the registry — Swift and Ricochet — so they
// print the moment they land. An id nothing has been drawn for gets a plain
// diamond tag and a label spelled out of its id, and never throws.

/** The five the new kits brought, which also have a flourish on the sticker. */
const MARKED = ['fixation', 'dome', 'rooted', 'rabbit', 'last_stand'] as const;
/** Drawn before the registry lists them. */
const AHEAD = ['swift', 'ricochet'] as const;
const UNKNOWN = 'mystery_status';
const ALL = [...new Set([...STATUSES.map((s) => s.id), ...AHEAD])];

/** What React prints for text: the apostrophe of "Djinn's Mark" is an entity. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

const chip = (id: string, value = 2, size?: 'compact' | 'normal' | 'large') =>
  renderToStaticMarkup(createElement(StatusIcon, { id, value, duration: 2, size }));
const sticker = (id: string, value = 2) => {
  const ev: StatusFx = { kind: 'status', seq: 7, iid: 'card', statusId: id, value, duration: 2, debuff: false };
  return renderToStaticMarkup(createElement(StatusStamp, { rect: { left: 40, top: 60, width: 180, height: 240 }, ev, at: 0, hold: 1050 }));
};

describe('which statuses wear a mark', () => {
  it('every status in the registry wears a drawing of its own, not the diamond', () => {
    for (const s of STATUSES) expect(markFor(s.id), s.id).not.toBe('unknown');
  });

  it('each wears the drawing named for it; the light channel wears the channel ring', () => {
    for (const id of ALL) expect(markFor(id), id).toBe(id === 'casting_light' ? 'casting' : id);
    for (const id of MARKED) expect(markFor(id), id).toBe(id);
  });

  it('Swift and Ricochet have their marks whether or not the registry lists them yet', () => {
    expect(markFor('swift')).toBe('swift');
    expect(markFor('ricochet')).toBe('ricochet');
    for (const id of AHEAD) expect(MARKED_IDS, id).toContain(id);
  });

  it('an id nothing has been drawn for wears the diamond tag — an Object key included', () => {
    expect(markFor(UNKNOWN)).toBe('unknown');
    expect(markFor('')).toBe('unknown');
    expect(markFor('constructor')).toBe('unknown');
    expect(markFor('toString')).toBe('unknown');
  });

  it('every status prints its mark; nothing prints blank', () => {
    for (const id of [...ALL, UNKNOWN]) {
      const svg = renderToStaticMarkup(createElement(StatusMark, { id, color: '#fff', size: 12 }));
      expect(svg, id).toContain(`data-mark="${markFor(id)}"`);
      expect(svg, id).toMatch(/<(path|circle|rect|ellipse)\b/);
    }
  });

  it('every mark is a different drawing', () => {
    const kinds = [...new Set([...ALL, UNKNOWN].map((id) => markFor(id)))];
    const drawings = kinds.map((k) => renderToStaticMarkup(createElement(StatusMark, { id: k === 'unknown' ? UNKNOWN : k, color: '#fff', size: 12 })).replace(/data-mark="[a-z_]+"/, ''));
    expect(new Set(drawings).size).toBe(drawings.length);
  });

  it('every mark is line art on the 16-unit grid in the colour it is given: round caps and joins, 1.7 on a chip, 2 over its ink underlay', () => {
    for (const id of [...ALL, UNKNOWN]) {
      const chipMark = renderToStaticMarkup(createElement(StatusMark, { id, color: '#fff', size: 12 }));
      expect(chipMark, id).toContain('viewBox="0 0 16 16"');
      expect(chipMark, id).toContain('stroke-linecap="round"');
      expect(chipMark, id).toContain('stroke-linejoin="round"');
      expect(chipMark, id).toContain('stroke-width="1.7"');
      // Nothing but the colour it was handed: every other paint is currentColor.
      expect(chipMark.replace('color="#fff"', ''), id).not.toMatch(/#[0-9a-f]{3,8}\b|rgb/i);
      const sticker = renderToStaticMarkup(createElement(StatusMark, { id, color: '#fff', outline: '#000', size: 40 }));
      expect(sticker, id).toContain('stroke-width="2"');
      expect(sticker, id).toContain('stroke-width="4"');
    }
  });
});

describe('every status has a chip and a sticker, and neither is blank', () => {
  for (const id of ALL) {
    it(`${id}: the chip reads its label behind its mark, the sticker its chip text under the same mark`, () => {
      const c = chip(id);
      expect(c.length).toBeGreaterThan(0);
      expect(c).toContain(esc(statusLabel(id)));
      expect(statusLabel(id).trim().length).toBeGreaterThan(0);
      expect(c).toContain(`data-mark="${markFor(id)}"`);
      // The mark comes first, then the label.
      expect(c.indexOf('data-mark')).toBeLessThan(c.indexOf(`>${esc(statusLabel(id))}<`));

      const st = sticker(id, 3);
      expect(st.length).toBeGreaterThan(0);
      expect(st).toContain(esc(statusChipText(id, 3)));
      expect(st).toContain(`data-mark="${markFor(id)}"`);
    });
  }

  it('the chip prints in all three sizes, with its mark and its turns', () => {
    for (const size of ['compact', 'normal', 'large'] as const) {
      for (const id of ALL) {
        const c = chip(id, 3, size);
        expect(c, `${id} ${size}`).toContain(`data-mark="${markFor(id)}"`);
        expect(c, `${id} ${size}`).toContain('(2)'); // turns left
      }
    }
  });

  it('the sticker prints the turns a status lasts beside its mark ("2t"), and none for one with no end', () => {
    for (const id of ALL) {
      expect(sticker(id, 3), id).toMatch(/data-turns="2"[^>]*>2t</);
    }
    const lasting = (id: string, duration: number) => {
      const ev: StatusFx = { kind: 'status', seq: 7, iid: 'card', statusId: id, value: 2, duration, debuff: false };
      return renderToStaticMarkup(createElement(StatusStamp, { rect: { left: 40, top: 60, width: 180, height: 240 }, ev, at: 0, hold: 1050 }));
    };
    expect(lasting('shield', 999)).not.toContain('data-turns');
    expect(lasting('fixation', 99)).not.toContain('data-turns');
    expect(lasting('stun', 0)).not.toContain('data-turns');
    expect(lasting('stun', 1)).toMatch(/>1t</);
    // Djinn's Mark: a pip of the mark per stack, the turns once, beside them.
    const djinn = sticker('djinns_mark', 3);
    expect(djinn.match(/data-mark="djinns_mark"/g)).toHaveLength(3);
    expect(djinn.match(/data-turns=/g)).toHaveLength(1);
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

describe('hover or tap a marked chip: it still says what it does and the turns left', () => {
  afterEach(() => { explainStore.close(); (globalThis as { window?: unknown }).window = realWindow; });
  const realWindow = (globalThis as { window?: unknown }).window;
  /** The chip as a hero's tile wraps it (HeroSlot): an Explain round the chip, opened. */
  const opened = (id: string, mode: 'hover' | 'touch') => {
    const content = statusContent(id, { value: 2, duration: 2 });
    const markup = () => renderToStaticMarkup(createElement(Explain, {
      content, children: createElement(StatusIcon, { id, value: 2, duration: 2, size: 'compact', titled: false }),
    }));
    const key = /data-explain="([^"]+)"/.exec(markup())?.[1] ?? '';
    explainStore.open(key, mode);
    return { out: markup(), content };
  };

  for (const mode of ['hover', 'touch'] as const) {
    it(`on a device that ${mode === 'hover' ? 'hovers' : 'taps'}, every status: its mark, its title, its description and "2 turns left."`, () => {
      if (mode === 'touch') (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false }) };
      for (const s of STATUSES) {
        const { out, content } = opened(s.id, mode);
        expect(out, s.id).toContain(`data-mark="${markFor(s.id)}"`);
        expect(out, s.id).toMatch(mode === 'hover' ? /role="tooltip"/ : /role="dialog"/);
        expect(out, s.id).toContain(esc(content.title));
        expect(out, s.id).toContain(esc(s.desc.replace(/<value>/g, '2')));
        expect(out, s.id).toContain('2 turns left.');
        explainStore.close();
      }
    });
  }
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
      expect(tab, s.id).toContain(`data-mark="${markFor(s.id)}"`);
    }
  });

  it('…and lays out every drawn mark, the ones ahead of the registry too', () => {
    for (const id of [...MARKED_IDS, ...AHEAD]) expect(tab, id).toContain(`data-mark-sample="${id}"`);
    expect(tab).not.toContain('data-mark="unknown"');
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

  it('every mark can be seen landing: some demo lands each status, Swift and Ricochet included', () => {
    const landed = new Set(demos.flatMap((d) => d.events).filter((e) => e.kind === 'status').map((e) => (e as StatusFx).statusId));
    for (const id of ALL) expect(landed.has(id), id).toBe(true);
  });

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
