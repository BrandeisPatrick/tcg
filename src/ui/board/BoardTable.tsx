import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { poster } from '../poster';
import { PatronSigil } from '../hud';

/**
 * The match scene's geometry, laid out once as a PORTRAIT STAGE of fixed
 * logical size (STAGE: 390 × 844, a phone) that Board scales to whatever the
 * screen is (useStageScale): a phone fills it edge to edge, a desktop shows
 * it centred at full height with the scene's backdrop either side. Every
 * row, pile and HUD piece is placed in these logical px, so the layout is
 * one layout and re-lays itself on resize or rotation by changing one scale.
 *
 * Down the middle: the rival's bench of three, the rival's Active, the centre
 * emblem, your Active, your bench of three — the 3-1-1-3 stack, the same card
 * sizes on both sides. The two Actives face each other across the lane
 * between the table's halves; nothing a card carries reaches into it.
 */
export const STAGE = { w: 390, h: 844 } as const;

/** The cards on the table: the Active and a bench card, at the real card's
 *  proportions (CardFrame's hand size, 134 × 188). The bench's gap is wide
 *  enough for the status tokens that hang off a card's left edge. */
export const boardCols = {
  active: 104,
  bench: 76,
  benchGap: 16,
} as const;
const CARD_RATIO = 188 / 134;
export const cardHeight = (w: number) => Math.round(w * CARD_RATIO);

export const boardRows = {
  /** An Active's slot box: its card. */
  active: cardHeight(boardCols.active),
  /** A bench slot box. */
  bench: cardHeight(boardCols.bench),
  /** A bench row to its side's Active row. */
  gap: 8,
  /** Between the two Actives: the lane, where the centre emblem sits and the
   *  turn banner and the targeting strip are shown. */
  lane: 56,
  /** Where the stack starts on the plane, under the scoreboard. */
  top: 44,
} as const;

/** The bench's width: three cards and their gaps. */
export const benchWidth = boardCols.bench * 3 + boardCols.benchGap * 2;

/** Where each row starts, px down the plane, and the seam. */
export function boardStack() {
  const r = boardRows;
  const benchR = r.top;
  const activeR = benchR + r.bench + r.gap;
  const mid = activeR + r.active + r.lane / 2;
  const activeY = activeR + r.active + r.lane;
  const benchY = activeY + r.active + r.gap;
  const bottom = benchY + r.bench;
  return { benchR, activeR, mid, activeY, benchY, bottom };
}

/** Where a slot's box is on the plane: the Active's (centred), or bench slot
 *  `i` (0-2, left to right). The box is the card. */
export function slotBox(row: number, kind: 'active' | 'bench', i = 0): CSSProperties {
  const w = kind === 'active' ? boardCols.active : boardCols.bench;
  const left = kind === 'active'
    ? (STAGE.w - w) / 2
    : (STAGE.w - benchWidth) / 2 + i * (boardCols.bench + boardCols.benchGap);
  return { position: 'absolute', left, top: row, width: w, height: cardHeight(w) };
}

/**
 * The table's PLANE and the camera on it. The default camera looks STRAIGHT
 * DOWN: the plane at its own size, your bench's foot on TABLE_FOOT, nothing
 * foreshortened, so the rival's cards and labels are the size of yours. The
 * other camera (the "Tilted table" setting) leans over the table a little:
 * the plane turned away about your bench's foot by `angle`, and scaled so
 * the stack fills the same span of the stage — a far-bench card stays over
 * nine tenths as wide as a near one. Everything on the table — the drawn
 * surface, the emblem, the slots and their cards, the decks and the discard
 * piles — turns with it; the HUD, the hand, the banner and every sheet stay
 * flat over it.
 */
export const TABLE_TILT = {
  angle: 10,
  perspective: 1000,
  scale: 1.13,
} as const;
/** Where your bench's foot lands on the stage, whatever the camera. */
export const TABLE_FOOT = 622;

/**
 * The camera's projection: where a point of the plane lands on the stage.
 * `y(py)` is the stage y of plane row `py`; `k(py)` the horizontal growth at
 * that row (a plane width times it is a stage width); `x(px, py)` the stage
 * x of a point and `planeX(sx, py)` its inverse — where on the plane a piece
 * must sit to show at stage x. The flat HUD beside the table reads its seats
 * through these, so it stays put beside what it belongs to under either
 * camera.
 */
export function tablePlane(tilted: boolean) {
  const o = boardStack().bottom;
  const t = TABLE_TILT;
  const rad = (t.angle * Math.PI) / 180;
  const f = (py: number) => (tilted ? t.perspective / (t.perspective - (py - o) * t.scale * Math.sin(rad)) : 1);
  const k = (py: number) => (tilted ? t.scale * f(py) : 1);
  const y = (py: number) => TABLE_FOOT + (py - o) * (tilted ? t.scale * Math.cos(rad) * f(py) : 1);
  const x = (px: number, py: number) => STAGE.w / 2 + (px - STAGE.w / 2) * k(py);
  const planeX = (sx: number, py: number) => STAGE.w / 2 + (sx - STAGE.w / 2) / k(py);
  return { x, y, k, planeX };
}

/** The style of the table's plane under either camera. */
export function tableTiltStyle(tilted: boolean): CSSProperties {
  const t = TABLE_TILT;
  const o = boardStack().bottom;
  const shift = TABLE_FOOT - o;
  return {
    transform: tilted
      ? `translateY(${shift}px) perspective(${t.perspective}px) rotateX(${t.angle}deg) scale(${t.scale})`
      : `translateY(${shift}px)`,
    transformOrigin: `50% ${o}px`,
  };
}

/**
 * The HUD's seats (logical px). The piles sit ON THE PLANE, whole, beside
 * each Active: the rival's deck and discard pile at its left, yours at your
 * right — their plane seats are worked back from where they should show
 * (`planeX`), so neither camera pushes one off the stage. Everything else is
 * FLAT, in stage px: the scoreboard across the top; and the turn row under
 * your bench's foot — the menu and the Auto switch at the left, your souls
 * and End Turn at the right, under the right thumb — with the hand owning
 * the whole width below it. Nothing flat stands on the table itself. `skip`
 * is the free table left of your Active, where a combat walk's Skip waits.
 */
export const DECK = { w: 52, h: 73 } as const;
export const DISCARD = { w: 40, h: 56 } as const;
const END_TURN_W = 104;
const TURN_ROW_H = 34;
export function hudSeats(tilted = false) {
  const s = boardStack();
  const plane = tablePlane(tilted);
  const activeCentre = (row: number) => row + boardRows.active / 2;
  // A pile's plane seat from the stage x its centre should show at.
  const pile = (row: number, box: { w: number; h: number }, stageCentreX: number) => {
    const cy = activeCentre(row);
    return { left: plane.planeX(stageCentreX, cy) - (box.w + 4) / 2, top: cy - (box.h + 4) / 2 };
  };
  const rowTop = TABLE_FOOT + 6;
  return {
    scoreboard: { left: 6, right: 6, top: 6, height: 30 },
    rivalDeck: pile(s.activeR, DECK, 42),
    rivalDiscard: pile(s.activeR, DISCARD, 104),
    ring: { centre: s.mid, size: 34 },
    yourDeck: pile(s.activeY, DECK, STAGE.w - 42),
    yourDiscard: pile(s.activeY, DISCARD, STAGE.w - 104),
    menu: { left: 8, top: rowTop, size: TURN_ROW_H },
    auto: { left: 8 + TURN_ROW_H + 8, top: rowTop + 5, width: 48, height: 24 },
    souls: { right: 8 + END_TURN_W + 8, top: rowTop, height: TURN_ROW_H },
    skip: { left: 8, top: plane.y(activeCentre(s.activeY)) + 30 },
    endTurn: { left: STAGE.w - 8 - END_TURN_W, top: rowTop, width: END_TURN_W, height: TURN_ROW_H },
    hand: { left: 0, top: rowTop + TURN_ROW_H + 4, width: STAGE.w },
  };
}

/** Each half's inks, from its side's patron colour: the wash over the
 *  table's teal-black, the light pooled under its Active, the inlaid line,
 *  an empty slot's outline and fill. The two halves carry the same weight. */
export const HALF = {
  you: {
    wash: 'rgba(214, 128, 40, 0.27)',
    pool: 'rgba(255, 190, 96, 0.30)',
    line: 'rgba(255, 206, 128, 1)',
    well: 'rgba(255, 206, 128, 0.42)',
    fill: 'rgba(0, 0, 0, 0.22)',
  },
  rival: {
    wash: 'rgba(58, 124, 210, 0.25)',
    pool: 'rgba(120, 176, 255, 0.28)',
    line: 'rgba(160, 200, 255, 1)',
    well: 'rgba(160, 200, 255, 0.42)',
    fill: 'rgba(0, 0, 0, 0.22)',
  },
} as const;
export type Side = keyof typeof HALF;

/** How far the surface reaches past the stage: under the hand at the foot,
 *  and a margin for the tilted camera at the top and the sides. */
const BLEED = { x: 60, top: 120, bottom: 250 };

/** The side streets' offsets from the seam, px: an uneven run, as blocks of
 *  a real plan are, mirrored into both halves. */
const SIDE_STREETS = [46, 118, 164, 232, 268];

/**
 * The table — a DRAWN SURFACE in the plane: Deadlock's city plan inlaid in a
 * teal-black table top. Your half is washed the Amber Hand's warm amber, the
 * rival's the Sapphire Flame's blue, at the same weight; the light is
 * brightest under the two Actives and falls away to dark edges and corners.
 * The plan is a few thin inlaid lines: an avenue down each gutter between
 * the columns, a street between each bench and its Active, one long diagonal
 * and uneven side streets in the gutters. Each patron's sigil lies faint on
 * the free side of its half. The seam is a soft rule fading out toward the
 * edges, with our small emblem on it. Rendered behind the live rows.
 */
export function BoardTable() {
  const { ring } = hudSeats();
  const s = boardStack();
  const cx = STAGE.w / 2;
  const x0 = -BLEED.x, x1 = STAGE.w + BLEED.x;
  const y0 = -BLEED.top, y1 = s.bottom + BLEED.bottom;
  const W = x1 - x0;
  const midR = s.activeR + boardRows.active / 2;
  const midY = s.activeY + boardRows.active / 2;
  const laneEdge = boardRows.lane / 2;
  // Avenues: the gutters between the bench's columns and outside them.
  const pitch = boardCols.bench + boardCols.benchGap;
  const avenues = [-1.5, -0.5, 0.5, 1.5].map((n) => cx + n * pitch);
  const outer = { l: avenues[0], r: avenues[3] };
  const line = (side: Side) => HALF[side].line;
  const sideY = (side: Side, d: number) => (side === 'rival' ? s.mid - laneEdge - d : s.mid + laneEdge + d);
  const full: CSSProperties = { position: 'absolute', left: x0, width: W };
  return (
    // Not clipped here: the stage clips at its own edges.
    <div aria-hidden data-table-surface style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <div style={{ ...full, top: y0, height: y1 - y0, background: poster.slate }} />
      {/* The halves, each in its patron's colour, with its pool of light. */}
      <div style={{
        ...full, top: y0, height: s.mid - y0,
        background: `radial-gradient(ellipse 230px 200px at 50% ${midR - y0}px, ${HALF.rival.pool} 0%, transparent 74%), ${HALF.rival.wash}`,
      }} />
      <div style={{
        ...full, top: s.mid, height: y1 - s.mid,
        background: `radial-gradient(ellipse 230px 200px at 50% ${midY - s.mid}px, ${HALF.you.pool} 0%, transparent 74%), ${HALF.you.wash}`,
      }} />
      <svg
        viewBox={`${x0} ${y0} ${W} ${y1 - y0}`}
        width={W} height={y1 - y0}
        style={{ position: 'absolute', left: x0, top: y0, overflow: 'visible' }}
        fill="none" strokeLinecap="round"
      >
        {(['rival', 'you'] as const).map((side) => {
          const far = side === 'rival' ? y0 : y1;
          const near = sideY(side, 0);
          const benchLine = side === 'rival' ? s.activeR - boardRows.gap / 2 : s.benchY - boardRows.gap / 2;
          return (
            <g key={side} stroke={line(side)}>
              {/* Avenues, stopping short of the lane. */}
              {avenues.map((x) => (
                <line key={x} x1={x} y1={far} x2={x} y2={near} strokeOpacity={0.2} strokeWidth={1} />
              ))}
              {/* The street between this side's bench and its Active. */}
              <line x1={x0} y1={benchLine} x2={x1} y2={benchLine} strokeOpacity={0.2} strokeWidth={1} />
              {/* Side streets, in the gutters only, at an uneven pitch. */}
              {SIDE_STREETS.map((d, i) => (
                <g key={d} strokeOpacity={0.16} strokeWidth={1}>
                  <line x1={x0} y1={sideY(side, d)} x2={i % 2 ? outer.l - 22 : outer.l} y2={sideY(side, d)} />
                  <line x1={i % 2 ? outer.r : outer.r + 22} y1={sideY(side, d)} x2={x1} y2={sideY(side, d)} />
                </g>
              ))}
              {/* A hatched block or two in the outer gutters. */}
              {[0, 2].map((i) => {
                const a = sideY(side, SIDE_STREETS[i]), b = sideY(side, SIDE_STREETS[i + 1]);
                const top = Math.min(a, b) + 5, h = Math.abs(a - b) - 10;
                const x = side === 'rival' ? (i ? x0 + 66 : outer.r + 8) : (i ? outer.r + 8 : x0 + 66);
                return (
                  <rect key={i} x={x} y={top} width={outer.l - 8 - (x0 + 66)} height={h} rx={1.5}
                    fill={line(side)} fillOpacity={0.05} strokeOpacity={0.18} strokeWidth={0.9} />
                );
              })}
            </g>
          );
        })}
        {/* The long diagonal — the plan's one street off the grid. */}
        <line x1={x0} y1={s.mid + 300} x2={cx - 62} y2={s.mid + laneEdge + 6} stroke={line('you')} strokeOpacity={0.17} strokeWidth={1.2} />
        <line x1={cx + 62} y1={s.mid - laneEdge - 6} x2={x1} y2={s.mid - 300} stroke={line('rival')} strokeOpacity={0.17} strokeWidth={1.2} />
      </svg>
      {/* The patrons' sigils, faint, on the free side of each half. */}
      <PatronSigil side="rival" size={74} color="rgba(160, 200, 255, 0.13)"
        style={{ position: 'absolute', left: cx + 96, top: midR - 37 }} />
      <PatronSigil side="you" size={74} color="rgba(255, 206, 128, 0.13)"
        style={{ position: 'absolute', left: cx - 96 - 58, top: midY - 37 }} />
      {/* The edges and corners fall away; the hand's ground is the darkest. */}
      <div style={{
        ...full, top: y0, height: y1 - y0,
        background: [
          `radial-gradient(ellipse 300px 440px at 50% ${s.mid - y0}px, transparent 58%, rgba(0, 0, 0, 0.5) 100%)`,
          `linear-gradient(180deg, rgba(0, 0, 0, 0.5) 0px, rgba(0, 0, 0, 0.5) ${-y0}px, transparent ${boardRows.top + 40 - y0}px, transparent ${s.bottom - 30 - y0}px, rgba(0, 0, 0, 0.5) ${s.bottom + 60 - y0}px)`,
        ].join(', '),
      }} />
      {/* The seam: a soft rule that fades out toward the edges. */}
      <div style={{
        position: 'absolute', left: 0, width: STAGE.w, top: s.mid - 0.5, height: 1,
        background: 'linear-gradient(90deg, transparent 0%, rgba(232, 224, 204, 0.34) 16%, rgba(232, 224, 204, 0.34) 84%, transparent 100%)',
      }} />
      <CentreRing size={ring.size} top={ring.centre - ring.size / 2} />
    </div>
  );
}

/** The centre emblem — the dial mark from our card backs, cream on a small
 *  dark plate on the seam. Nothing on the table touches it. */
function CentreRing({ size, top }: { size: number; top: number }) {
  return (
    <div style={{
      position: 'absolute', left: '50%', top, width: size, height: size, marginLeft: -size / 2,
      borderRadius: '50%',
      background: `radial-gradient(circle at 50% 35%, ${poster.slateLit} 0%, ${poster.slate} 100%)`,
      boxShadow: '0 0 0 1px rgba(232, 224, 204, 0.5), 0 0 0 4px rgba(11, 23, 22, 0.9), 0 3px 8px rgba(0, 0, 0, 0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg viewBox="0 0 40 40" width={size * 0.74} height={size * 0.74} fill="none" stroke={poster.cream} strokeWidth="1.5" style={{ opacity: 0.72 }}>
        <circle cx="20" cy="20" r="15.5" />
        <circle cx="20" cy="20" r="6.5" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={20 + Math.cos(a) * 6.5} y1={20 + Math.sin(a) * 6.5} x2={20 + Math.cos(a) * 15.5} y2={20 + Math.sin(a) * 15.5} />;
        })}
        <circle cx="20" cy="20" r="2.4" fill={poster.cream} stroke="none" />
      </svg>
    </div>
  );
}

/**
 * An empty slot: a quiet well inlaid in the table, outlined in its half's
 * ink, nothing printed in it. `lit`, it is a spot a hero picked up from the
 * hand may be put: the outline glows the targeting green and the well is a
 * button (`onTap` places the hero there; `name` is its accessible name,
 * "Bench slot 2"). It fills the slot's box.
 *
 * The ref lands on the outline itself. BenchRow and ActiveSlot render a well
 * as a direct child of `AnimatePresence mode="popLayout"`, which hands every
 * direct child a ref so it can measure an exiting one and lift it out of the
 * flow — keep it a direct child there, a plain wrapper would drop the ref.
 */
export const SlotWell = forwardRef<HTMLDivElement, {
  lit?: boolean;
  /** Whose half it is on: its outline's ink. */
  side?: Side;
  name?: string;
  onTap?: () => void;
  style?: CSSProperties;
}>(function SlotWell({ lit = false, side = 'you', name, onTap, style }, ref) {
  return (
    <div
      ref={ref}
      role={lit ? 'button' : undefined}
      tabIndex={lit ? 0 : undefined}
      aria-label={lit ? name : undefined}
      onClick={lit ? onTap : undefined}
      onKeyDown={lit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap?.(); } } : undefined}
      style={{
        position: 'absolute', inset: 0,
        boxSizing: 'border-box',
        borderRadius: 7,
        border: `1px ${lit ? 'solid' : 'dashed'} ${lit ? poster.target : HALF[side].well}`,
        background: lit ? 'rgba(98, 196, 98, 0.2)' : HALF[side].fill,
        boxShadow: lit ? `0 0 0 2px ${poster.target}, 0 0 18px 2px rgba(98, 196, 98, 0.45)` : 'inset 0 2px 6px rgba(0, 0, 0, 0.35)',
        cursor: lit ? 'pointer' : undefined,
        transition: 'border-color 160ms ease, box-shadow 160ms ease, background 160ms ease',
        ...style,
      }}
    />
  );
});

/** A round dark button of the HUD: the menu. */
export function RoundPlate({ size, children, style }: { size: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', boxSizing: 'border-box',
      background: `linear-gradient(180deg, ${poster.slateLit} 0%, ${poster.slate} 100%)`, color: poster.cream,
      border: '1px solid rgba(232, 224, 204, 0.34)',
      boxShadow: '0 3px 8px rgba(0, 0, 0, 0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}>
      {children}
    </div>
  );
}
