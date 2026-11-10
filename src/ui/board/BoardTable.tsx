import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { fonts } from '../tokens';
import { poster, chamfer, clipBoth, sheetStyle } from '../poster';
import type { BoardLayout } from './layout';

/**
 * The board: one cream sheet — a screen print on the dark scene — with the
 * rival's line along its top edge, three rows drawn on it as ink hairline
 * wells (the rival's bench, the lane, your bench) and your line along its
 * foot. The lane well carries red corner ticks and a faint dial mark behind
 * the turn dial. Every measure comes from the layout (layout.ts), which is
 * worked out from the screen's width and height.
 */

/** A phone's row measures, for pages that stand a rail or a sample beside a
 *  board of their own (the gallery). The live board reads the layout. */
export const boardRows = { bench: 150, lane: 206, gap: 8 } as const;

/** The sheet. Its children are its rows, top to bottom. */
export function BoardSheet({ L, children }: { L: BoardLayout; children: ReactNode }) {
  return (
    <div
      data-sheet
      style={{
        position: 'relative',
        flex: '0 0 auto',
        width: L.sheetW,
        boxSizing: 'border-box',
        borderRadius: L.wide ? 22 : 16,
        ...sheetStyle,
        padding: `${L.padY}px ${L.padX + L.gutterR}px ${L.padY}px ${L.padX + L.gutterL}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: L.rowGap,
      }}
    >
      {children}
    </div>
  );
}

/**
 * One row of the sheet: its well (drawn across the whole sheet, margins
 * included), its tag in the left margin on a wide sheet, and its three
 * columns — the same three in every row, so the benches and the lane line
 * up down the board.
 */
export function SheetRow({ L, h, lane = false, tag, children }: {
  L: BoardLayout;
  h: number;
  lane?: boolean;
  tag?: string;
  children: ReactNode;
}) {
  // The well reaches past the columns into the sheet's padding and margins.
  const out = L.wide ? 14 : 4;
  return (
    <div style={{ position: 'relative', flex: `0 0 ${h}px`, height: h }}>
      <RowWell lane={lane} left={-(L.gutterL + out)} right={-(L.gutterR + out)} dialShift={(L.gutterL - L.gutterR) / 2} />
      {L.wide && tag && <RowPlaque left={-(L.gutterL + out) + 10}>{tag}</RowPlaque>}
      <div style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `repeat(3, ${L.colW}px)`,
        // The row is its own height whatever a tile would rather be.
        gridTemplateRows: 'minmax(0, 1fr)',
        gap: L.colGap,
        justifyContent: 'center',
        height: '100%',
      }}>
        {children}
      </div>
    </div>
  );
}

/** One ink hairline well on the paper. The lane is the contested row: a
 *  whisper of deeper paper, red corner ticks and the dial mark. */
function RowWell({ lane, left, right, dialShift }: { lane: boolean; left: number; right: number; dialShift: number }) {
  const radius = 12;
  const rule = 1.5;
  return (
    <div aria-hidden style={{
      position: 'absolute', top: 0, bottom: 0, left, right,
      boxSizing: 'border-box',
      borderRadius: radius,
      border: `${rule}px solid ${poster.inkRule}`,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      {lane && (
        <>
          <div style={{ position: 'absolute', inset: 0, background: poster.paperDeep, opacity: 0.5 }} />
          <DialMark size={170} color={poster.ink} stroke={0.5} style={{
            position: 'absolute', left: `calc(50% + ${dialShift}px)`, top: '50%',
            transform: 'translate(-50%, -50%)', opacity: 0.06,
          }} />
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
              width: 12,
              height: 12,
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

/** The dial mark from our card backs: two rings and eight spokes. */
export function DialMark({ size, color, stroke = 1.4, dot = false, style }: {
  size: number;
  color: string;
  stroke?: number;
  dot?: boolean;
  style?: CSSProperties;
}) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} fill="none" stroke={color} strokeWidth={stroke} style={style} aria-hidden>
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
      {dot && <circle cx="20" cy="20" r="2.2" fill={color} stroke="none" />}
    </svg>
  );
}

/** A row's ink tag ("Bench", "Lane") in the wide sheet's left margin. */
function RowPlaque({ left, children }: { left: number; children: ReactNode }) {
  return (
    <span style={{
      position: 'absolute',
      left,
      width: 56,
      top: '50%',
      transform: 'translateY(-50%)',
      padding: '5px 4px',
      boxSizing: 'border-box',
      background: poster.ink,
      color: poster.paper,
      ...clipBoth(chamfer(4)),
      fontFamily: fonts.display,
      fontSize: 10.5,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      lineHeight: 1.25,
      textAlign: 'center',
      zIndex: 1,
      pointerEvents: 'none',
    }}>
      {children}
    </span>
  );
}

/**
 * An empty slot: a dashed ink outline on the paper with the dial mark, faint,
 * in its owner's colour (`accent`). `lit`, it is a spot a hero picked up from
 * the hand may be put: the outline turns the targeting green and the well is
 * a button (`onTap` places the hero there; `name` is its accessible name,
 * "Bench slot 2"). It fills its cell.
 *
 * The ref lands on the outline itself. BenchRow and ActiveSlot render a well
 * as a direct child of `AnimatePresence mode="popLayout"`, which hands every
 * direct child a ref so it can measure an exiting one and lift it out of the
 * flow — keep it a direct child there, a plain wrapper would drop the ref.
 */
export const SlotWell = forwardRef<HTMLDivElement, {
  accent: string;
  lit?: boolean;
  name?: string;
  onTap?: () => void;
}>(function SlotWell({ accent, lit = false, name, onTap }, ref) {
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
        minHeight: 0,
        boxSizing: 'border-box',
        borderRadius: 10,
        border: lit ? `2px solid ${poster.target}` : `1.5px dashed ${poster.inkFaint}`,
        background: lit ? 'rgba(98, 196, 98, 0.16)' : undefined,
        cursor: lit ? 'pointer' : undefined,
        transition: 'border-color 160ms ease, background 160ms ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <DialMark size={40} color={lit ? poster.target : accent} dot style={{ opacity: lit ? 0.8 : 0.35 }} />
    </div>
  );
});

/** A round charcoal button on the dark scene: the menu. */
export function RoundPlate({ size, children, style }: { size: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', boxSizing: 'border-box',
      background: poster.ink, color: poster.paper,
      border: `1.5px solid ${poster.edge}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}>
      {children}
    </div>
  );
}
