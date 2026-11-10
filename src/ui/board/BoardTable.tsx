import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { fonts } from '../tokens';
import { poster, chamfer, sheetStyle, clipBoth } from '../poster';

/**
 * The board's geometry — single source of truth for the 3-1-1-3 stack
 * (Pokémon TCG Pocket's table): the rival's bench of three, the rival's
 * Active, your Active, your bench of three, one above the other down the
 * middle of the sheet, a vitals rule capping each end. The two Actives face
 * each other across the middle line: that is the lane. Board.tsx lays the
 * live rows out from these numbers and BoardTable draws the wells from the
 * same ones, so the printed sheet and the interactive grid never drift.
 */
export const boardRows = {
  bench: (mobile: boolean) => (mobile ? 118 : 150),
  active: (mobile: boolean) => (mobile ? 184 : 236),
  /** A bench row to its side's Active row. */
  gap: (mobile: boolean) => (mobile ? 10 : 20),
  /** Between the two Actives: the middle line. */
  lane: (mobile: boolean) => (mobile ? 16 : 26),
  /** The patron vitals rule that caps each end of the stack. */
  vitals: (mobile: boolean) => (mobile ? 22 : 26),
  /** A vitals rule hugs its bench row by this much. */
  hug: (mobile: boolean) => (mobile ? 6 : 10),
} as const;

/** The tiles' widths: a bench tile, the gap between bench tiles, and the
 *  Active tile (wider — the duel is the focus). A phone's bench is narrow
 *  enough to leave the rails beside the Actives room for the piles and the
 *  dial on a 360px screen. */
export const boardCols = {
  benchTile: (mobile: boolean) => (mobile ? 88 : 150),
  benchGap: (mobile: boolean) => (mobile ? 8 : 20),
  active: (mobile: boolean) => (mobile ? 140 : 190),
  /** Desktop: the sheet's side rails, where the piles, the dial and the turn
   *  dock sit. A phone's rails are whatever width the screen leaves. */
  rail: (mobile: boolean) => (mobile ? 0 : 128),
} as const;

/** The bench's width: three tiles and their gaps. */
export const benchWidth = (mobile: boolean) => boardCols.benchTile(mobile) * 3 + boardCols.benchGap(mobile) * 2;

/** The stage's width on desktop (the rows' box). Phones are fluid. */
export const stageWidth = (mobile: boolean) => benchWidth(mobile) + boardCols.rail(mobile) * 2;

/** Where each row starts, px down the rows' box, and the box's height. */
export function boardStack(mobile: boolean) {
  const r = boardRows;
  const vitalsR = 0;
  const benchR = vitalsR + r.vitals(mobile) + r.hug(mobile);
  const activeR = benchR + r.bench(mobile) + r.gap(mobile);
  const activeY = activeR + r.active(mobile) + r.lane(mobile);
  const benchY = activeY + r.active(mobile) + r.gap(mobile);
  const vitalsY = benchY + r.bench(mobile) + r.hug(mobile);
  const height = vitalsY + r.vitals(mobile);
  /** The middle line, between the two Actives. */
  const mid = activeR + r.active(mobile) + r.lane(mobile) / 2;
  return { vitalsR, benchR, activeR, activeY, benchY, vitalsY, height, mid };
}

/** How far the cream sheet extends beyond the rows' bounding box — the
 *  paper margin. Exported so Board can tuck the rival's hand under the
 *  same top edge the sheet actually occupies. */
export const tablePad = (mobile: boolean) => ({
  x: mobile ? 8 : 30,
  top: mobile ? 12 : 22,
  bottom: mobile ? 12 : 24,
});

/** A live row's box: absolute in the rows' box, at its top, its height,
 *  across the whole width (the row centres its own tiles). */
export function rowBox(top: number, height: number): CSSProperties {
  return { position: 'absolute', left: 0, right: 0, top, height, zIndex: 1 };
}

/**
 * The board: one cream sheet — a screen print floating on the blurred
 * scene — with the 3-1-1-3 stack drawn on it as ink hairline wells: a well
 * round each bench, and the lane well round both Actives with the middle
 * line ruled across it and red corner ticks marking the contested zone.
 * Rendered as a decorative layer behind the live rows; Board.tsx keeps the
 * plane flat.
 */
export function BoardTable({ isMobile }: { isMobile: boolean }) {
  const pad = tablePad(isMobile);
  const s = boardStack(isMobile);
  const w = benchWidth(isMobile);
  const breathe = isMobile ? 5 : 8;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: -pad.top,
        bottom: -pad.bottom,
        left: -pad.x,
        right: -pad.x,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      {/* The sheet — cream paper with its mottled sizing and the drop
          shadow that floats it over the scene. */}
      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: isMobile ? 16 : 22,
        ...sheetStyle,
      }} />

      {/* Row wells — exact overlay of the live rows. */}
      <div style={{ position: 'absolute', top: pad.top, bottom: pad.bottom, left: pad.x, right: pad.x }}>
        <Well top={s.benchR - breathe} height={boardRows.bench(isMobile) + breathe * 2} width={w + breathe * 2} />
        <Well
          top={s.activeR - breathe}
          height={boardRows.active(isMobile) * 2 + boardRows.lane(isMobile) + breathe * 2}
          width={w + breathe * 2}
          lane
          mid={s.mid - (s.activeR - breathe)}
        />
        <Well top={s.benchY - breathe} height={boardRows.bench(isMobile) + breathe * 2} width={w + breathe * 2} />
      </div>
    </div>
  );
}

/** One ink hairline well on the paper, centred, sized to its live row(s).
 *  The lane is the contested zone: a whisper of deeper paper, the middle
 *  line ruled across it where the two Actives meet, and red corner ticks. */
function Well({ top, height, width, lane, mid = 0 }: { top: number; height: number; width: number; lane?: boolean; mid?: number }) {
  const radius = 12;
  const rule = 1.5;
  return (
    <div style={{
      position: 'absolute',
      top,
      height,
      left: '50%',
      width,
      marginLeft: -width / 2,
      borderRadius: radius,
      border: `${rule}px solid ${poster.inkRule}`,
      boxSizing: 'border-box',
    }}>
      {lane && (
        <>
          {/* Deeper paper at half strength so the sheet's mottle shows
              through — a translucent layer of the token itself, so the
              lane can never drift from poster.paperDeep. */}
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: radius - rule,
            background: poster.paperDeep,
            opacity: 0.5,
          }} />
          {/* The middle line — where the Actives face each other. */}
          <div style={{
            position: 'absolute',
            left: 10, right: 10,
            top: mid - rule,
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, ${poster.inkFaint} 12%, ${poster.inkFaint} 88%, transparent 100%)`,
          }} />
          {/* Red corner ticks — mark the duel rows as the contested zone. */}
          {([
            { top: 6, left: 6, borderTop: true, borderLeft: true },
            { top: 6, right: 6, borderTop: true, borderRight: true },
            { bottom: 6, left: 6, borderBottom: true, borderLeft: true },
            { bottom: 6, right: 6, borderBottom: true, borderRight: true },
          ] as const).map((c, i) => (
            <span key={i} style={{
              position: 'absolute',
              top: 'top' in c ? c.top : undefined,
              left: 'left' in c ? c.left : undefined,
              right: 'right' in c ? c.right : undefined,
              bottom: 'bottom' in c ? c.bottom : undefined,
              width: 14,
              height: 14,
              borderTop: 'borderTop' in c ? `2px solid ${poster.red}` : undefined,
              borderLeft: 'borderLeft' in c ? `2px solid ${poster.red}` : undefined,
              borderRight: 'borderRight' in c ? `2px solid ${poster.red}` : undefined,
              borderBottom: 'borderBottom' in c ? `2px solid ${poster.red}` : undefined,
            }} />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * A seat in one of the sheet's side rails: the strip of paper beside the
 * Active column, left or right, centred on `y` (px down the rows' box). The
 * piles, the turn dial and the turn dock sit in these — the rail is as wide
 * as the Active column leaves it (capped on desktop, so the seat stays near
 * the sheet's edge rather than drifting to the middle of a wide rail).
 */
export function RailSeat({ side, y, isMobile, children, zIndex = 2 }: {
  side: 'left' | 'right';
  y: number;
  isMobile: boolean;
  children: ReactNode;
  zIndex?: number;
}) {
  const inset = boardCols.active(isMobile) / 2 + (isMobile ? 4 : 10);
  const width = isMobile ? `calc(50% - ${inset}px)` : `min(calc(50% - ${inset}px), ${boardCols.rail(isMobile) + 10}px)`;
  return (
    <div style={{
      position: 'absolute',
      top: y,
      [side]: 0,
      width,
      transform: 'translateY(-50%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex,
      pointerEvents: 'none',
    }}>
      {children}
    </div>
  );
}

/**
 * Ink tag for a row label — a flat black chamfered label. Multi-word labels
 * pass "\n" to stack ("Rival\nBench"). The 3-1-1-3 board prints none (the
 * stack reads itself); kept for the gallery and anything that wants one.
 */
export function RowPlaque({ children }: { children: ReactNode }) {
  return (
    <span style={{
      position: 'absolute',
      left: -64,
      width: 56,
      top: '50%',
      transform: 'translateY(-50%)',
      padding: '5px 4px',
      background: poster.ink,
      color: poster.paper,
      ...clipBoth(chamfer(4)),
      fontFamily: fonts.display,
      fontSize: 10.5,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      lineHeight: 1.25,
      textAlign: 'center',
      whiteSpace: 'pre-line',
      zIndex: 1,
      pointerEvents: 'none',
    }}>
      {children}
    </span>
  );
}

/**
 * An empty slot drawn as a dashed ink outline on the paper, with the dial
 * mark in the owner's colour. `accent` follows the owner (poster.rival for
 * the rival, poster.you for you); `label` prints under the mark (Active
 * row). `lit`, it is a spot a hero picked up from the hand may be put: the
 * outline glows the targeting green and the well is a button (`onTap` places
 * the hero there; `name` is its accessible name, "Bench slot 2").
 *
 * The ref lands on the outline itself. BenchRow and ActiveSlot render a well
 * as a direct child of `AnimatePresence mode="popLayout"`, which hands every
 * direct child a ref so it can measure an exiting one and lift it out of the
 * flow — keep it a direct child there, a plain wrapper would drop the ref.
 */
export const SlotWell = forwardRef<HTMLDivElement, {
  accent: string;
  label?: string;
  lit?: boolean;
  name?: string;
  onTap?: () => void;
}>(function SlotWell({ accent, label, lit = false, name, onTap }, ref) {
  return (
    <div
      ref={ref}
      role={lit ? 'button' : undefined}
      tabIndex={lit ? 0 : undefined}
      aria-label={lit ? name : undefined}
      onClick={lit ? onTap : undefined}
      onKeyDown={lit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap?.(); } } : undefined}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: 10,
        border: `1.5px dashed ${lit ? poster.target : poster.inkFaint}`,
        boxShadow: lit ? `0 0 0 2px ${poster.target}, 0 0 18px 2px rgba(98, 196, 98, 0.45)` : undefined,
        background: lit ? 'rgba(98, 196, 98, 0.12)' : undefined,
        cursor: lit ? 'pointer' : undefined,
        transition: 'border-color 160ms ease, box-shadow 160ms ease, background 160ms ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}>
      {/* Dial mark — same mark as the card backs, in the owner's ink. */}
      <svg viewBox="0 0 40 40" width={40} height={40} fill="none" stroke={accent} strokeWidth="1.4" style={{ opacity: 0.35 }}>
        <circle cx="20" cy="20" r="15.5" />
        <circle cx="20" cy="20" r="6.5" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={20 + Math.cos(a) * 6.5}
              y1={20 + Math.sin(a) * 6.5}
              x2={20 + Math.cos(a) * 15.5}
              y2={20 + Math.sin(a) * 15.5}
            />
          );
        })}
        <circle cx="20" cy="20" r="2.2" fill={accent} stroke="none" />
      </svg>
      {label && (
        <span style={{
          fontFamily: fonts.display,
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          lineHeight: 1.2,
          color: lit ? poster.ink : accent,
          opacity: lit ? 0.9 : 0.65,
        }}>
          {label}
        </span>
      )}
    </div>
  );
});
