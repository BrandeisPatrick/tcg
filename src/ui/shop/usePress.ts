import { useEffect, useRef } from 'react';

/** A press held this long is a long-press: it opens the tooltip instead of
 *  tapping. */
export const LONG_PRESS_MS = 450;
/** A mouse resting this long on a tile opens its tooltip (desktop only: a
 *  touch has no hover). */
export const HOVER_MS = 320;

/**
 * Tap, long-press and (under a mouse) hover on one control. A press held
 * LONG_PRESS_MS fires `onLong` and swallows the click that ends it; a mouse
 * resting HOVER_MS fires `onHover(true)` and leaving fires `onHover(false)`.
 * A right-click is a long-press too, so a desktop has the same tooltip a
 * thumb gets.
 */
export function usePress(onTap: () => void, onLong: () => void, onHover?: (on: boolean) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const fired = useRef(false);
  const hovering = useRef(false);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = undefined; } };
  const clearHover = () => { if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = undefined; } };
  useEffect(() => () => { clear(); clearHover(); }, []);
  const leave = () => {
    clear();
    clearHover();
    if (hovering.current) { hovering.current = false; onHover?.(false); }
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      // Every press starts clean (a right-click's long-press included); only
      // the primary button is timed for one.
      fired.current = false;
      clear();
      if (e.button !== 0) return;
      timer.current = setTimeout(() => { fired.current = true; clearHover(); onLong(); }, LONG_PRESS_MS);
      // A press ends wherever it is let go — off the tile too, when the
      // layout moves the tile from under a resting finger (a buy grows the
      // hand row): a quick tap never turns into a hold.
      if (typeof window !== 'undefined') {
        const end = () => { clear(); window.removeEventListener('pointerup', end, true); window.removeEventListener('pointercancel', end, true); };
        window.addEventListener('pointerup', end, true);
        window.addEventListener('pointercancel', end, true);
      }
    },
    onPointerUp: clear,
    onPointerCancel: leave,
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse' || !onHover) return;
      clearHover();
      hoverTimer.current = setTimeout(() => { hovering.current = true; onHover(true); }, HOVER_MS);
    },
    onPointerLeave: leave,
    onClick: () => {
      clear();
      clearHover();
      if (fired.current) { fired.current = false; return; }
      onTap();
    },
    // A held press on a phone opens the browser's own menu otherwise; a
    // right-click is the desktop's long-press.
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (fired.current) return;
      clear();
      clearHover();
      fired.current = true;
      onLong();
    },
  };
}
