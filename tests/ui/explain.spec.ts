import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Explain } from '@/ui/explain/Explain';
import {
  attachEscape, canHover, createExplainStore, explainStore, HOVER_QUERY, pressEscape, pressOutside,
  subscribeCanHover, triggerHandlers, type ExplainMode, type TriggerEvent,
} from '@/ui/explain/store';
import { numberContent, statusContent } from '@/ui/explain/content';

// Hover a coloured number or a status on a device that hovers and a tooltip
// shows; leave and it goes. Tap it on a touch device and a popup card opens;
// tap anywhere else, or press Escape, and it closes; only one is ever open.
// `triggerHandlers` is exactly what the component binds to its trigger, and the
// store is the one the page shares, so these drive the real thing — the click
// of a finger and the pointer of a mouse are the only parts a browser run
// (scripts/qa/legality.mjs, case k) adds.

/** A trigger as a test drives it: the DOM listeners and the tap, by event name. */
function trigger(store = createExplainStore(), id = 'a', mode: ExplainMode = 'hover', passTaps = false) {
  const h = triggerHandlers(store, id, mode, { passTaps });
  const fire = (type: string, e: TriggerEvent = {}) => h.native[type]?.(e);
  const tap = () => {
    const e = { stopPropagation: vi.fn() };
    h.onClick?.(e);
    return e;
  };
  return { store, id, h, fire, tap };
}

describe('the store: one at a time', () => {
  it('opens, closes and toggles', () => {
    const s = createExplainStore();
    expect(s.get()).toBeNull();
    s.open('a', 'hover');
    expect(s.get()).toEqual({ id: 'a', mode: 'hover' });
    s.close('b'); // someone else's: nothing
    expect(s.get()?.id).toBe('a');
    s.close('a');
    expect(s.get()).toBeNull();
    s.toggle('a', 'touch');
    expect(s.get()).toEqual({ id: 'a', mode: 'touch' });
    s.toggle('a', 'touch');
    expect(s.get()).toBeNull();
    s.open('a', 'touch');
    s.close(); // no id: whichever is open
    expect(s.get()).toBeNull();
  });

  it('opening one closes the other', () => {
    const s = createExplainStore();
    s.open('a', 'touch');
    s.open('b', 'touch');
    expect(s.get()?.id).toBe('b');
    s.toggle('a', 'touch');
    expect(s.get()?.id).toBe('a');
  });

  it('tells its subscribers once per change, and not at all for a no-op', () => {
    const s = createExplainStore();
    const seen = vi.fn();
    const off = s.subscribe(seen);
    s.open('a', 'hover'); s.open('a', 'hover'); s.close('b'); s.close('a'); s.close('a');
    expect(seen).toHaveBeenCalledTimes(2);
    off();
    s.open('a', 'hover');
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe('a device that hovers: a tooltip', () => {
  it('shows on mouse enter and hides on leave', () => {
    const { store, fire } = trigger();
    fire('mouseenter');
    expect(store.get()).toEqual({ id: 'a', mode: 'hover' });
    fire('mouseleave');
    expect(store.get()).toBeNull();
  });

  it('shows on keyboard focus and hides on blur', () => {
    const { store, fire } = trigger();
    fire('focus', { currentTarget: { matches: (q) => q === ':focus-visible' } });
    expect(store.get()?.mode).toBe('hover');
    fire('blur');
    expect(store.get()).toBeNull();
  });

  it('does not show for the focus a mouse click leaves behind', () => {
    const { store, fire } = trigger();
    fire('focus', { currentTarget: { matches: () => false } });
    expect(store.get()).toBeNull();
  });

  it('only one tooltip at a time as the pointer moves from one to the next', () => {
    const store = createExplainStore();
    const a = trigger(store, 'a'), b = trigger(store, 'b');
    a.fire('mouseenter');
    b.fire('mouseenter'); // the pointer is on b before a's leave is heard
    expect(store.get()?.id).toBe('b');
    a.fire('mouseleave'); // a's leave must not close b's
    expect(store.get()?.id).toBe('b');
    b.fire('mouseleave');
    expect(store.get()).toBeNull();
  });

  it('a click is the page\'s own: it neither opens anything nor stops the click', () => {
    const { store, tap } = trigger();
    const e = tap();
    expect(store.get()).toBeNull();
    expect(e.stopPropagation).not.toHaveBeenCalled(); // a chip\'s click still opens the sheet
  });
});

describe('a touch device: a popup card', () => {
  it('opens on a tap, and the tap is the popup\'s: it goes no further', () => {
    const { store, tap } = trigger(undefined, 'a', 'touch');
    const e = tap();
    expect(store.get()).toEqual({ id: 'a', mode: 'touch' });
    expect(e.stopPropagation).toHaveBeenCalled(); // not the tile's, not the skill plate's
  });

  it('a second tap on it closes it', () => {
    const { store, tap } = trigger(undefined, 'a', 'touch');
    tap(); tap();
    expect(store.get()).toBeNull();
  });

  it('hovering does nothing on a touch device', () => {
    const { store, fire } = trigger(undefined, 'a', 'touch');
    fire('mouseenter');
    fire('focus');
    expect(store.get()).toBeNull();
  });

  it('closes on a tap anywhere else, but not on its own trigger', () => {
    const { store, id, tap } = trigger(undefined, 'a', 'touch');
    tap();
    pressOutside(store, id, true); // the press on the trigger: its tap will toggle it
    expect(store.get()?.id).toBe('a');
    pressOutside(store, id, false);
    expect(store.get()).toBeNull();
  });

  it('a press outside closes only the popup it was heard by, and never a tooltip', () => {
    const store = createExplainStore();
    store.open('a', 'touch');
    pressOutside(store, 'b', false);
    expect(store.get()?.id).toBe('a');
    store.open('h', 'hover');
    pressOutside(store, 'h', false);
    expect(store.get()?.id).toBe('h');
  });

  it('closes on Escape, and says that press was the popup\'s', () => {
    const s = createExplainStore();
    s.open('a', 'touch');
    expect(pressEscape(s)).toBe(true);
    expect(s.get()).toBeNull();
    expect(pressEscape(s)).toBe(false); // nothing open: the key belongs to the board
  });

  it('Escape closes a tooltip too, but does not take the press from the sheet', () => {
    const s = createExplainStore();
    s.open('a', 'hover');
    expect(pressEscape(s)).toBe(false);
    expect(s.get()).toBeNull();
  });

  it('only one is open at a time: a tap on another trigger closes the first', () => {
    const store = createExplainStore();
    const a = trigger(store, 'a', 'touch'), b = trigger(store, 'b', 'touch');
    a.tap();
    expect(store.get()?.id).toBe('a');
    pressOutside(store, 'a', false); // the press lands on b: outside a
    b.tap();
    expect(store.get()?.id).toBe('b');
    // Even without the press, opening b replaces a.
    a.tap();
    b.tap();
    expect(store.get()?.id).toBe('b');
  });

  it('with a card or skill armed the tap is not the popup\'s: it reaches the tile and picks the target', () => {
    const { store, tap } = trigger(undefined, 'a', 'touch', true);
    const e = tap();
    expect(store.get()).toBeNull();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });
});

describe('Escape, ahead of the board\'s', () => {
  it('a listener on the window, in the capture phase, that takes a popup\'s Escape and no other key', () => {
    const s = createExplainStore();
    let listener: ((e: KeyboardEvent) => void) | undefined;
    let options: unknown;
    const target = {
      addEventListener: (type: string, fn: EventListenerOrEventListenerObject, opts?: unknown) => { if (type === 'keydown') { listener = fn as (e: KeyboardEvent) => void; options = opts; } },
      removeEventListener: vi.fn(),
    } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>;
    const off = attachEscape(s, target);
    expect(options).toEqual({ capture: true }); // before the board's own layered Escape

    const key = (k: string) => ({ key: k, stopImmediatePropagation: vi.fn(), preventDefault: vi.fn() });
    s.open('a', 'touch');
    const other = key('Enter');
    listener!(other as unknown as KeyboardEvent);
    expect(s.get()?.id).toBe('a');
    expect(other.stopImmediatePropagation).not.toHaveBeenCalled();

    const esc = key('Escape');
    listener!(esc as unknown as KeyboardEvent);
    expect(s.get()).toBeNull();
    expect(esc.stopImmediatePropagation).toHaveBeenCalled(); // the sheet under it stays up

    const second = key('Escape');
    listener!(second as unknown as KeyboardEvent);
    expect(second.stopImmediatePropagation).not.toHaveBeenCalled(); // the board's turn

    off();
    expect(target.removeEventListener).toHaveBeenCalledWith('keydown', listener, { capture: true });
  });
});

describe('which kind of device this is', () => {
  it('hovers when the primary input is a mouse (hover: hover and pointer: fine)', () => {
    const asked: string[] = [];
    const win = (matches: boolean) => ({ matchMedia: (q: string) => { asked.push(q); return { matches } as MediaQueryList; } });
    expect(canHover(win(true))).toBe(true);
    expect(canHover(win(false))).toBe(false);
    expect(asked.every((q) => q === HOVER_QUERY)).toBe(true);
    expect(HOVER_QUERY).toBe('(hover: hover) and (pointer: fine)');
  });

  it('assumes a mouse where nothing can say', () => {
    expect(canHover(undefined)).toBe(true);
    expect(canHover({} as Pick<Window, 'matchMedia'>)).toBe(true);
  });

  describe('and notices when that changes', () => {
    const real = (globalThis as { window?: unknown }).window;
    afterEach(() => { (globalThis as { window?: unknown }).window = real; });

    it('one media-query listener serves every popover, and goes with the last', () => {
      const listeners = new Set<() => void>();
      const mql = {
        matches: true,
        addEventListener: vi.fn((_: string, fn: () => void) => listeners.add(fn)),
        removeEventListener: vi.fn((_: string, fn: () => void) => listeners.delete(fn)),
      };
      (globalThis as { window?: unknown }).window = { matchMedia: () => mql };
      const a = vi.fn(), b = vi.fn();
      const offA = subscribeCanHover(a), offB = subscribeCanHover(b);
      expect(mql.addEventListener).toHaveBeenCalledTimes(1);
      [...listeners].forEach((fn) => fn());
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
      offA();
      expect(mql.removeEventListener).not.toHaveBeenCalled();
      offB();
      expect(mql.removeEventListener).toHaveBeenCalledTimes(1);
    });
  });
});

describe('the component', () => {
  const real = (globalThis as { window?: unknown }).window;
  afterEach(() => { explainStore.close(); (globalThis as { window?: unknown }).window = real; });

  const content = numberContent({ kind: 'sp', base: 1, per: 1 }, { spirit: 2, who: 'Kelvin' });
  const render = () => renderToStaticMarkup(createElement(Explain, { content, underline: true, children: '3' }));
  const idOf = (markup: string) => /data-explain="([^"]+)"/.exec(markup)?.[1] ?? '';
  const asTouch = () => { (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false }) }; };

  it('is an inline trigger around what it explains, with no card until asked', () => {
    const out = render();
    expect(out).toMatch(/^<span data-explain="[^"]+" tabindex="0"[^>]*>3<\/span>$/); // a keyboard stop on a device that hovers
    expect(out).not.toMatch(/tooltip|dialog/);
    expect(out).toContain('text-decoration:underline dotted');
  });

  it('on a device that hovers, an open one is a tooltip that does not take the pointer', () => {
    explainStore.open(idOf(render()), 'hover');
    const out = render();
    expect(out).toMatch(/role="tooltip"/);
    expect(out).toContain("1 + Kelvin&#x27;s Spirit Power 2 = 3");
    expect(out).toContain('pointer-events:none');
    expect(out).toMatch(/aria-describedby="[^"]+-card"/);
    expect(out).not.toContain('Tap anywhere to close');
  });

  it('on a touch device it has no keyboard stop, and an open one is a popup card that says how to close it', () => {
    asTouch();
    const closed = render();
    expect(closed).not.toContain('tabindex');
    explainStore.open(idOf(closed), 'touch');
    const out = render();
    expect(out).toMatch(/role="dialog"/);
    expect(out).toMatch(/aria-labelledby="[^"]+-card-title"/);
    expect(out).toContain('Tap anywhere to close');
    expect(out).toContain('pointer-events:auto');
    expect(out).toContain("1 + Kelvin&#x27;s Spirit Power 2 = 3");
  });

  it('a status says its title, its text and the turns left', () => {
    const chip = statusContent('bleed', { value: 2, duration: 2 });
    const out = (() => {
      const markup = (c: typeof chip) => renderToStaticMarkup(createElement(Explain, { content: c, children: 'chip' }));
      explainStore.open(idOf(markup(chip)), 'hover');
      return markup(chip);
    })();
    expect(out).toContain('Bleed');
    expect(out).toContain('Take 2 Pure dmg at start of turn (stacks, max 3).');
    expect(out).toContain('2 turns left.');
  });
});
