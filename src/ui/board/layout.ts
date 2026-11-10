import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * The match screen's measures. Nothing here is a fixed stage: the board is
 * laid out for the box it is given, from its width AND its height, so a
 * phone's browser (a short box under the toolbars) and a tall phone both
 * fill the screen with nothing scrolled, cut or stacked on anything else.
 *
 * A phone is one column, top to bottom: the rival's strip (its piles and its
 * hand, small), the cream sheet (the rival's line, its bench, the lane, your
 * bench, your line), your hand with your piles either side, and one row of
 * controls. A wide screen is the wide sheet: row tags in its left margin, the
 * turn controls in its right margin beside the lane, your hand under it.
 */

/** A box at least this wide and tall gets the wide sheet. */
const WIDE = { w: 768, h: 560 } as const;
/** The widest the phone column is laid out (a phone on its side keeps a
 *  column this wide, centred). */
const COLUMN_MAX = 460;
/** Below these the phone column is scaled down as one (a box far smaller
 *  than any phone's); at or above them nothing is scaled. */
const FLOOR = { w: 340, h: 600 } as const;

export type PileSize = 'full' | 'small' | 'chip';

export interface BoardLayout {
  /** The wide sheet (row tags left, the turn dock right). */
  wide: boolean;
  /** 1 on every real screen; under 1 only below FLOOR. */
  k: number;
  /** The box the board is laid out in, px (the measured box over `k`). */
  w: number;
  h: number;
  /** The column the rows stack in, centred in the box. */
  column: number;
  /** The sheet: its width, its padding, its side margins for the row tags
   *  and the dock, a patron line's height, the gap between its rows and
   *  between its three columns, a column's width. */
  sheetW: number;
  padX: number;
  padY: number;
  gutterL: number;
  gutterR: number;
  line: number;
  rowGap: number;
  colGap: number;
  colW: number;
  /** A bench row's height and the lane's. */
  bench: number;
  lane: number;
  /** The rival's strip above the sheet. */
  strip: number;
  /** The gaps down the column: above the strip, under it, above the hand,
   *  above the controls, under the last row. */
  gapTop: number;
  gapStrip: number;
  gapHand: number;
  gapControls: number;
  gapBottom: number;
  /** A hand card's height, the room the lift takes above it, and the width
   *  the fan may take between the two piles. */
  handH: number;
  handLift: number;
  handAvail: number;
  /** The control row's height (0 on the wide sheet: the dock has them). */
  controls: number;
  /** Your piles beside the hand, and the rival's in its strip. */
  pile: PileSize;
  rivalPile: PileSize;
}

/** A pile's box, px wide (CardPiles: the card and its stack's offset). */
const PILE_W: Record<PileSize, number> = { full: 50, small: 44, chip: 30 };

function phone(w: number, h: number): BoardLayout {
  const k = Math.min(1, w / FLOOR.w, h / FLOOR.h);
  const W = w / k;
  const H = h / k;
  const column = Math.min(W, COLUMN_MAX);
  const margin = 8;
  const padX = 8;
  const padY = 6;
  const line = 22;
  const colGap = 8;
  const strip = 40;
  const controls = 44;
  const handLift = 4;
  const sheetW = column - margin * 2;
  const colW = (sheetW - padX * 2 - colGap * 2) / 3;
  let rowGap = 6;
  let gapTop = 6, gapStrip = 4, gapHand = 6, gapControls = 6, gapBottom = 6;

  const HAND = { min: 96, max: 150 };
  const chrome = gapTop + strip + gapStrip + gapHand + handLift + gapControls + controls + gapBottom
    + padY * 2 + line * 2 + rowGap * 4;
  // What is left for the two benches, the lane and the hand.
  const room = Math.max(0, H - chrome);
  const rows = Math.max(0, room - HAND.min);
  const bench = Math.min(colW * 1.4, rows / 3.35);
  const lane = Math.min(colW * 1.62, rows - bench * 2);
  let left = rows - bench * 2 - lane;
  const handH = Math.min(HAND.max, HAND.min + left);
  left -= handH - HAND.min;
  // A tall screen's spare height opens the rows, then the column's gaps.
  const open = Math.min(6, left / 4);
  rowGap += open;
  left -= open * 4;
  const each = Math.max(0, left) / 5;
  gapTop += each; gapStrip += each; gapHand += each; gapControls += each; gapBottom += each;

  const pile: PileSize = 'small';
  return {
    wide: false, k, w: W, h: H, column,
    sheetW, padX, padY, gutterL: 0, gutterR: 0, line, rowGap, colGap, colW,
    bench, lane, strip,
    gapTop, gapStrip, gapHand, gapControls, gapBottom,
    handH, handLift,
    handAvail: sheetW - (PILE_W[pile] + 6) * 2,
    controls,
    pile, rivalPile: 'chip',
  };
}

function wide(w: number, h: number): BoardLayout {
  const margin = 16;
  const padX = 24;
  const padY = 14;
  const gutterL = 76;
  const gutterR = 150;
  const line = 26;
  const rowGap = 12;
  const colGap = 28;
  const strip = 46;
  const handLift = 6;
  const gapTop = 10, gapStrip = 6, gapHand = 10, gapBottom = 10;

  const HAND = { min: 116, max: 176 };
  const chrome = gapTop + strip + gapStrip + gapHand + handLift + gapBottom + padY * 2 + line * 2 + rowGap * 4;
  const room = Math.max(0, h - chrome);
  const rows = Math.max(0, room - HAND.min);
  // A column is never wider than the sheet allows, nor than its bench is tall.
  const colRoom = (w - margin * 2 - padX * 2 - gutterL - gutterR - colGap * 2) / 3;
  const bench = Math.min(180, rows / 3.45);
  const colW = Math.max(96, Math.min(180, colRoom, bench));
  const lane = Math.min(colW * 1.62, rows - bench * 2);
  const left = rows - bench * 2 - lane;
  const handH = Math.min(HAND.max, HAND.min + left);
  const spare = Math.max(0, left - (handH - HAND.min)) / 4;

  const sheetW = colW * 3 + colGap * 2 + gutterL + gutterR + padX * 2;
  const pile: PileSize = 'full';
  return {
    wide: true, k: 1, w, h, column: sheetW,
    sheetW, padX, padY, gutterL, gutterR, line, rowGap, colGap, colW,
    bench, lane, strip,
    gapTop: gapTop + spare, gapStrip: gapStrip + spare, gapHand: gapHand + spare, gapControls: 0, gapBottom: gapBottom + spare,
    handH, handLift,
    handAvail: Math.max(420, sheetW) - (PILE_W[pile] + 10) * 2,
    controls: 0,
    pile, rivalPile: 'chip',
  };
}

/** The board's measures for a box `w` × `h` px. */
export function boardLayout(w: number, h: number): BoardLayout {
  return w >= WIDE.w && h >= WIDE.h ? wide(w, h) : phone(w, h);
}

/** The measures the board is laid out with, for the rows on it. Outside a
 *  match (the gallery) it is a phone's. */
export const BoardLayoutContext = createContext<BoardLayout>(boardLayout(390, 844));
export const useBoardLayout = () => useContext(BoardLayoutContext);

/** A card's wrapper in its cell: the cell's whole box. */
export const tileStyle: CSSProperties = { display: 'block', height: '100%', minHeight: 0 };

/**
 * The size of the box the board has, measured (not the window: a phone's
 * toolbars, a split view and a rotation all change it). `ref` goes on the
 * box; the size is read again on its ResizeObserver and on the window's
 * resize and orientationchange, for browsers that report a rotation before
 * the box has settled.
 */
export function useBoardBox(): { ref: (el: HTMLDivElement | null) => void; w: number; h: number } {
  const [box, setBox] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    h: typeof window !== 'undefined' ? window.innerHeight : 844,
  }));
  const host = useRef<HTMLDivElement | null>(null);
  const ro = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const el = host.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    setBox((prev) => (Math.abs(prev.w - w) > 0.5 || Math.abs(prev.h - h) > 0.5 ? { w, h } : prev));
  }, []);

  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    host.current = el;
    if (!el || typeof ResizeObserver === 'undefined') { measure(); return; }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    ro.current = observer;
    measure();
  }, [measure]);

  useEffect(() => {
    const onChange = () => { measure(); requestAnimationFrame(measure); };
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    window.visualViewport?.addEventListener('resize', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
      window.visualViewport?.removeEventListener('resize', onChange);
      ro.current?.disconnect();
    };
  }, [measure]);

  return { ref, ...box };
}
