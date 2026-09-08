import type { ReactNode } from 'react';
import { fonts } from '../tokens';
import { poster, chamfer, sheetStyle, clipBoth } from '../poster';

/**
 * Shared row metrics — single source of truth for the three board rows.
 * Board.tsx sizes the live rows from these and BoardTable draws its row
 * wells from the same numbers, so the printed sheet and the interactive
 * grid can never drift apart.
 */
export const boardRows = {
  bench: (mobile: boolean) => (mobile ? 150 : 180),
  lane: (mobile: boolean) => (mobile ? 206 : 290),
  gap: (mobile: boolean) => (mobile ? 20 : 40),
  /** The patron vitals rule that caps each end of the stack. */
  vitals: (mobile: boolean) => (mobile ? 22 : 26),
} as const;

/**
 * The vitals rules cap the stack, but a full row gap around a 26px rule
 * wastes height the fit-scale then has to shrink away — so each one hugs
 * the bench row it belongs to. Board.tsx and the sheet's own spacers pull
 * by the same amount, or the wells stop lining up with the live rows.
 */
export const vitalsPull = (mobile: boolean) => boardRows.gap(mobile) - (mobile ? 6 : 10);

/**
 * The plane's side rails: a left gutter for the row plaques and a wider
 * right one for the turn dock. Board.tsx pads the live rows by these, so
 * the duel's centre sits (right - left) / 2 left of the sheet's own centre
 * — the dial mark below has to shift by the same amount to stay under the
 * compass. Exported so the two can never drift.
 */
export const boardGutter = (mobile: boolean) => (mobile
  ? { left: 0, right: 0 }
  : { left: 76, right: 150 });

/** How far the cream sheet extends beyond the rows' bounding box — the
 *  paper margin. Exported so corner fixtures (PatronPlaque) can anchor to
 *  the same edges the sheet actually occupies. */
export const tablePad = (mobile: boolean) => ({
  x: mobile ? 8 : 34,
  top: mobile ? 12 : 24,
  bottom: mobile ? 12 : 26,
});

/**
 * The board: one cream sheet — a screen print floating on the blurred
 * scene — with the three rows (rival bench / lane / your bench) drawn on
 * it as ink hairline wells. The lane well carries red corner ticks and a
 * faint dial mark behind the duel. Rendered as a decorative layer behind
 * the live rows; Board.tsx keeps the plane flat.
 */
export function BoardTable({ isMobile }: { isMobile: boolean }) {
  const pad = tablePad(isMobile);
  // The duel sits in the rows' content box, inset by the plane's gutters;
  // the wells span the whole sheet. Half the difference is how far the
  // lane's dial mark must slide to stay under the compass.
  const g = boardGutter(isMobile);
  const dialShift = (g.left - g.right) / 2;
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

      {/* Row wells — exact overlay of the live rows (same heights + gap). */}
      <div style={{
        position: 'absolute',
        top: pad.top,
        bottom: pad.bottom,
        left: pad.x,
        right: pad.x,
        display: 'flex',
        flexDirection: 'column',
        gap: boardRows.gap(isMobile),
        padding: `0 ${isMobile ? 4 : 10}px`,
      }}>
        {/* Spacers for the two vitals rules — they draw their own hairline,
            so the sheet leaves them plain and only the card rows get wells. */}
        <div style={{ flex: `0 0 ${boardRows.vitals(isMobile)}px`, marginBottom: -vitalsPull(isMobile) }} />
        <RowWell h={boardRows.bench(isMobile)} />
        <RowWell h={boardRows.lane(isMobile)} lane dialShift={dialShift} />
        <RowWell h={boardRows.bench(isMobile)} />
        <div style={{ flex: `0 0 ${boardRows.vitals(isMobile)}px`, marginTop: -vitalsPull(isMobile) }} />
      </div>
    </div>
  );
}

/** One ink hairline well on the paper, sized to its live row. The lane is
 *  the contested zone: a whisper of deeper paper, red corner ticks and the
 *  dial mark behind the duel. */
function RowWell({ h, lane, dialShift = 0 }: { h: number; lane?: boolean; dialShift?: number }) {
  const radius = 12;
  const rule = 1.5;
  return (
    <div style={{
      position: 'relative',
      flex: `0 0 ${h}px`,
      height: h,
      borderRadius: radius,
      border: `${rule}px solid ${poster.inkRule}`,
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
          {/* Dial mark — the printer's mark faintly behind the TurnCompass;
              the inner ring lands on the compass's own edge. */}
          <svg
            viewBox="0 0 40 40"
            width={170}
            height={170}
            fill="none"
            stroke={poster.ink}
            strokeWidth="0.5"
            style={{
              position: 'absolute',
              // The wells span the whole sheet, but the duel is centred in
              // the rows' content box — shift by the gutter asymmetry so the
              // mark stays concentric with the compass.
              left: `calc(50% + ${dialShift}px)`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              opacity: 0.06,
            }}
          >
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
          </svg>
          {/* Red corner ticks — mark the duel row as the contested zone. */}
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
 * Ink tag for the row labels ("Rival · Bench", "Lane", …) — a flat black
 * chamfered label printed in the sheet's left margin (the plane's
 * paddingLeft), beside the cards. Multi-word labels pass "\n" to stack
 * ("Rival\nBench"), keeping the tag narrow enough for the margin at any
 * fit-scale.
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
 * row).
 */
export function SlotWell({ accent, label }: { accent: string; label?: string }) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      borderRadius: 10,
      border: `1.5px dashed ${poster.inkFaint}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      overflow: 'hidden',
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
          color: accent,
          opacity: 0.65,
        }}>
          {label}
        </span>
      )}
    </div>
  );
}
