/**
 * The rules of the Explain popover, apart from any drawing: which one is open
 * (only ever one), and what each kind of input does to it.
 *
 *   hover device   (hover: hover) and (pointer: fine): hovering or
 *                  keyboard-focusing the trigger shows a small tooltip,
 *                  leaving hides it. A click is the page's own — a status
 *                  chip's click still opens the hero sheet.
 *   touch device   anything else: tapping the trigger opens a small popup
 *                  card; tapping anywhere else closes it; Escape closes it.
 *                  The tap belongs to the popup, not to what is underneath —
 *                  unless the board has something armed (`passTaps`), when
 *                  every tap keeps picking its target.
 *
 * `triggerHandlers` is exactly what the component spreads onto its trigger,
 * so a test that calls it tests what the page runs.
 */

export type ExplainMode = 'hover' | 'touch';

export interface Open { id: string; mode: ExplainMode }

export interface ExplainStore {
  /** The popover that is open, if any. */
  get(): Open | null;
  open(id: string, mode: ExplainMode): void;
  /** Close `id`'s popover; with no id, whichever is open. */
  close(id?: string): void;
  /** Open `id` if it is closed, close it if it is open (a tap on its trigger). */
  toggle(id: string, mode: ExplainMode): void;
  subscribe(fn: () => void): () => void;
}

export function createExplainStore(): ExplainStore {
  let current: Open | null = null;
  const listeners = new Set<() => void>();
  const set = (next: Open | null) => {
    if (next === current || (next && current && next.id === current.id && next.mode === current.mode)) return;
    current = next;
    for (const fn of [...listeners]) fn();
  };
  return {
    get: () => current,
    // One at a time: opening any popover replaces whichever was open.
    open: (id, mode) => set({ id, mode }),
    close: (id) => { if (!id || current?.id === id) set(null); },
    toggle: (id, mode) => set(current?.id === id ? null : { id, mode }),
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

/** The one store every popover on the page shares. */
export const explainStore: ExplainStore = createExplainStore();

/** The few fields of an event the handlers read — a React synthetic event
 *  has them, and so does a test's plain object. */
export interface TriggerEvent {
  stopPropagation?: () => void;
  currentTarget?: { matches?: (selector: string) => boolean } | null;
}

export interface TriggerHandlers {
  /** DOM listeners to add to the trigger, by event name. The hover ones are
   *  native on purpose: React derives mouseenter from the pair of mouseover /
   *  mouseout, and drops the enter whenever the element the pointer came from
   *  has just left the page (a Close button, a sheet that has faded out). */
  native: Record<string, (e: TriggerEvent) => void>;
  /** The tap, as a React prop: its stopPropagation is what keeps the tap from
   *  reaching the tile or the plate the trigger sits on. */
  onClick?: (e: TriggerEvent) => void;
}

/** What a trigger does with the pointer, focus and taps it gets. */
export function triggerHandlers(
  store: ExplainStore,
  id: string,
  mode: ExplainMode,
  { passTaps = false }: { passTaps?: boolean } = {},
): TriggerHandlers {
  if (mode === 'hover') {
    return {
      native: {
        mouseenter: () => store.open(id, 'hover'),
        mouseleave: () => store.close(id),
        // Keyboard focus only: a mouse click focuses the trigger too, and the
        // tooltip must go when the pointer does.
        focus: (e) => { if (e.currentTarget?.matches?.(':focus-visible') ?? true) store.open(id, 'hover'); },
        blur: () => store.close(id),
      },
    };
  }
  return {
    native: {},
    onClick: (e) => {
      if (passTaps) return; // armed: the tap picks its target, as it always has
      e.stopPropagation?.(); // …otherwise it is the popup's, not the tile's or the plate's
      store.toggle(id, 'touch');
    },
  };
}

/** A press landed somewhere: a touch popup closes unless it landed on its
 *  own trigger (whose tap toggles it). */
export function pressOutside(store: ExplainStore, id: string, onTrigger: boolean): void {
  const open = store.get();
  if (open?.id === id && open.mode === 'touch' && !onTrigger) store.close(id);
}

/** Escape closes an open popover. Returns true when it was a touch popup:
 *  that press was the popup's, and must not also close the sheet or open the
 *  pause menu beneath it. */
export function pressEscape(store: ExplainStore): boolean {
  const open = store.get();
  if (!open) return false;
  store.close();
  return open.mode === 'touch';
}

/** Listen for Escape on `target` (the window), in the capture phase and ahead
 *  of the board's own layered Escape, which closes a sheet or backs out of
 *  targeting: the popup is the innermost layer, so the first press is its.
 *  Returns the detach function. */
export function attachEscape(
  store: ExplainStore,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (pressEscape(store)) { e.stopImmediatePropagation(); e.preventDefault(); }
  };
  target.addEventListener('keydown', onKey, { capture: true });
  return () => target.removeEventListener('keydown', onKey, { capture: true });
}

// Installed when this module first loads — before any board mounts its own
// capture listener, which is what puts the popup's Escape first in line.
if (typeof window !== 'undefined') {
  const w = window as unknown as { __explainEscape?: () => void };
  w.__explainEscape?.(); // a hot reload replaces the listener, never doubles it
  w.__explainEscape = attachEscape(explainStore, window);
}

// ---- Can this device hover? --------------------------------------------------

export const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

/** Does the primary input hover, with a fine pointer — a mouse or a trackpad,
 *  not a finger? Where nothing can say (no window), a mouse is assumed. */
export function canHover(win: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  if (!win?.matchMedia) return true;
  return win.matchMedia(HOVER_QUERY).matches;
}

/** Watch the capability change (a tablet docked to a mouse). One media-query
 *  listener serves every popover on the page. */
const watchers = new Set<() => void>();
let mql: MediaQueryList | null = null;
const fire = () => { for (const fn of [...watchers]) fn(); };

export function subscribeCanHover(fn: () => void): () => void {
  watchers.add(fn);
  if (!mql && typeof window !== 'undefined' && window.matchMedia) {
    mql = window.matchMedia(HOVER_QUERY);
    mql.addEventListener?.('change', fire);
  }
  return () => {
    watchers.delete(fn);
    if (watchers.size === 0 && mql) { mql.removeEventListener?.('change', fire); mql = null; }
  };
}
