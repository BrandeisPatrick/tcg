import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { poster, PAPER_MOTTLE } from '../poster';

/**
 * The match scene's geometry — Pokémon TCG Pocket's battle screen, laid out
 * once as a PORTRAIT STAGE of fixed logical size (STAGE: 390 × 844, a phone)
 * that Board scales to whatever the screen is (useStageScale): a phone fills
 * it edge to edge, a desktop shows it centred at full height with the scene's
 * backdrop either side. Every row, pile and HUD piece is placed in these
 * logical px, so the layout is one layout and re-lays itself on resize or
 * rotation by changing one scale.
 *
 * Down the middle: the rival's bench of three, the rival's Active, the centre
 * emblem, your Active, your bench of three — the 3-1-1-3 stack. The two Actives
 * face each other across the seam between the table's halves. Each slot box
 * leaves HP_ROOM above its card for the HP number that floats over the
 * card's top-right corner (HeroSlot).
 */
export const STAGE = { w: 390, h: 844 } as const;

/** The cards on the table: the Active (a third of the stage's width) and a
 *  bench card (a fifth), at the real card's proportions (CardFrame's hand
 *  size, 134 × 188). */
export const boardCols = {
  active: 116,
  bench: 80,
  benchGap: 8,
} as const;
const CARD_RATIO = 188 / 134;
export const cardHeight = (w: number) => Math.round(w * CARD_RATIO);

/** Room above each card for its floating HP: the number stands in it and
 *  its bar rides the card's top edge. */
export const HP_ROOM = 24;

export const boardRows = {
  /** An Active's slot box: its HP room and its card. */
  active: HP_ROOM + cardHeight(boardCols.active),
  /** A bench slot box. */
  bench: HP_ROOM + cardHeight(boardCols.bench),
  /** A bench row to its side's Active row. */
  gap: 6,
  /** Between the two Actives: the seam, where the centre emblem sits. */
  lane: 26,
  /** Where the stack starts on the plane. */
  top: 36,
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
 *  `i` (0-2, left to right). Each box includes its HP room. */
export function slotBox(row: number, kind: 'active' | 'bench', i = 0): CSSProperties {
  const w = kind === 'active' ? boardCols.active : boardCols.bench;
  const left = kind === 'active'
    ? (STAGE.w - w) / 2
    : (STAGE.w - benchWidth) / 2 + i * (boardCols.bench + boardCols.benchGap);
  return { position: 'absolute', left, top: row, width: w, height: HP_ROOM + cardHeight(w) };
}

/**
 * The table's PLANE and the camera on it — Pokémon TCG Pocket's: the plane
 * turned away from the viewer about your bench's foot, so your half stays
 * close to flat and full size and the rival's half recedes, narrower and
 * smaller (its bench about three quarters of yours). Everything on the table
 * — the drawn surface, the emblem, the slots and their cards, the HP floats,
 * the tokens, the decks and the discard piles — turns with it; the HUD, the
 * hands, the banner and every sheet stay flat over it. The plane is scaled
 * about the same line, and then the whole of it is moved so your bench's
 * foot lands on TABLE_FOOT: the far bench's HP clears the top strip and the
 * hand and the turn dock get the rest of the stage. `angle` 0 is the flat
 * table (the "Flat table" setting): the same plane, only scaled to the same
 * span.
 */
export const TABLE_TILT = {
  angle: 20,
  perspective: 800,
  scale: 1.2,
  /** The flat table's scale: the stack fitted between the top strip and
   *  TABLE_FOOT. */
  flatScale: 0.85,
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
  const k = (py: number) => (tilted ? t.scale * f(py) : t.flatScale);
  const y = (py: number) => TABLE_FOOT + (py - o) * (tilted ? t.scale * Math.cos(rad) * f(py) : t.flatScale);
  const x = (px: number, py: number) => STAGE.w / 2 + (px - STAGE.w / 2) * k(py);
  const planeX = (sx: number, py: number) => STAGE.w / 2 + (sx - STAGE.w / 2) / k(py);
  return { x, y, k, planeX };
}

/** The style of the table's plane under either camera. */
export function tableTiltStyle(flat: boolean): CSSProperties {
  const t = TABLE_TILT;
  const o = boardStack().bottom;
  const shift = TABLE_FOOT - o;
  return {
    transform: flat
      ? `translateY(${shift}px) scale(${t.flatScale})`
      : `translateY(${shift}px) perspective(${t.perspective}px) rotateX(${t.angle}deg) scale(${t.scale})`,
    transformOrigin: `50% ${o}px`,
  };
}

/**
 * The HUD's seats (logical px). The piles sit ON THE PLANE, beside each
 * Active, half off the stage's edge as Pocket's are: the rival's deck at the
 * upper left, yours at the right middle, each discard pile just inside its
 * deck — their plane seats are worked back from where they should show
 * (`planeX`). Everything else is FLAT, in stage px: the top strip (the
 * rival's name at the left, its card backs peeking from the top edge at the
 * centre, its map track and souls at the right); the menu button with the
 * small Auto toggle under it and the souls coin, left and right of your
 * side (above the bench's corners when the table is tilted, beside the
 * bench when it lies flat); the turn row under your bench's foot (your name bar at the left,
 * End Turn at the right, under the right thumb); and the hand, which owns
 * the whole width below it. `skip` is the
 * free paper left of your Active, where a combat walk's Skip waits.
 */
export const DECK = { w: 64, h: 90 } as const;
export const DISCARD = { w: 40, h: 56 } as const;
const END_TURN_W = 104;
export function hudSeats(tilted = false) {
  const s = boardStack();
  const plane = tablePlane(tilted);
  const activeCentre = (row: number) => row + HP_ROOM + cardHeight(boardCols.active) / 2;
  const benchCentre = s.benchY + HP_ROOM + cardHeight(boardCols.bench) / 2;
  // A pile's plane seat from the stage x its centre should show at.
  const pile = (row: number, box: { w: number; h: number }, stageCentreX: number) => {
    const cy = activeCentre(row);
    return { left: plane.planeX(stageCentreX, cy) - box.w / 2, top: cy - box.h / 2 };
  };
  const rowTop = TABLE_FOOT + 6;
  // Tilted, a full near bench runs almost edge to edge, so the side buttons
  // stand above its corners, on the free paper beside your Active; flat, the
  // bench is narrow and they stand beside it.
  const benchTop = plane.y(s.benchY + HP_ROOM);
  const benchMid = plane.y(benchCentre);
  return {
    rivalBar: { left: 8, right: 8, top: 8 },
    rivalHand: { centre: STAGE.w / 2, top: -16 },
    rivalDeck: pile(s.activeR, DECK, 2),
    rivalDiscard: pile(s.activeR, DISCARD, 62),
    ring: { centre: s.mid, size: 44 },
    yourDeck: pile(s.activeY, DECK, STAGE.w - 4),
    yourDiscard: pile(s.activeY, DISCARD, STAGE.w - 68),
    menu: { left: 4, top: tilted ? benchTop - 66 : benchMid - 30, size: 40 },
    auto: { left: 4, top: tilted ? benchTop - 22 : benchMid + 16, width: 40, height: 22 },
    souls: tilted
      ? { left: STAGE.w - 2 - 40, top: benchTop - 48, size: 40 }
      : { left: STAGE.w - 4 - 44, top: benchMid - 22, size: 44 },
    skip: { left: 8, top: plane.y(activeCentre(s.activeY)) + 14 },
    yourBar: { left: 8, top: rowTop + 4, maxWidth: STAGE.w - 8 - END_TURN_W - 8 - 8 },
    endTurn: { left: STAGE.w - 8 - END_TURN_W, top: rowTop, width: END_TURN_W, height: 34 },
    hand: { left: 0, top: rowTop + 34 + 4, width: STAGE.w },
  };
}

/** The stage's own paper: cream with its mottled sizing. */
const paper: CSSProperties = {
  background: poster.paper,
  backgroundImage: PAPER_MOTTLE,
  backgroundSize: '320px 320px',
};

/** Each half's inks, from its side's patron colour: the wash over the
 *  paper, the engraving's line, an empty slot's outline and fill. */
export const HALF = {
  you: { wash: 'rgba(217, 160, 50, 0.42)', line: 'rgba(112, 74, 10, 1)', well: 'rgba(132, 88, 12, 0.5)', fill: 'rgba(217, 160, 50, 0.10)' },
  rival: { wash: 'rgba(74, 143, 224, 0.50)', line: 'rgba(22, 58, 112, 1)', well: 'rgba(30, 72, 138, 0.5)', fill: 'rgba(74, 143, 224, 0.10)' },
} as const;
export type Side = keyof typeof HALF;

/** How far the surface reaches past the stage: the far rows shrink under the
 *  tilt, so the paper there must be far wider than the stage to cover it at
 *  every size, and reach far above it. */
const BLEED = { x: 280, top: 560, bottom: 270 };
/** The street grid's pitch: half a bench column, so an avenue runs down
 *  every gap between the columns. */
const BLOCK = (boardCols.bench + boardCols.benchGap) / 2;

/**
 * The table — a DRAWN SURFACE in the plane, so it foreshortens with the
 * tilt: the Cursed Apple's street map engraved on paper. Three lanes run
 * away from you down the three columns of the stack and converge toward the
 * rival's end, kerbed by the avenues in the gaps; the blocks either side are
 * a grid of streets, some hatched. The far
 * half is washed the rival's sapphire, dimmer and hazier with distance, the
 * near half your amber; the seam between them is an ink rule with our small
 * emblem (the printer's dial mark from our card backs) on it; a soft
 * vignette darkens the corners. It reaches well past the stage on every
 * side (the stage clips it). Rendered behind the live rows.
 */
export function BoardTable() {
  const { ring } = hudSeats();
  const s = boardStack();
  const cx = STAGE.w / 2;
  const x0 = -BLEED.x, x1 = STAGE.w + BLEED.x;
  const y0 = -BLEED.top, y1 = s.bottom + BLEED.bottom;
  const laneW = boardCols.bench;
  const lanes = [cx - 2 * BLOCK, cx, cx + 2 * BLOCK];
  // Avenues: the kerbs in the gaps and outside the outer lanes, then one
  // every two blocks out to the surface's edge.
  const avenues: number[] = [];
  for (let x = cx - BLOCK; x > x0; x -= 2 * BLOCK) avenues.push(x);
  for (let x = cx + BLOCK; x < x1; x += 2 * BLOCK) avenues.push(x);
  const streets: number[] = [];
  for (let y = s.mid - BLOCK; y > y0; y -= BLOCK) streets.push(y);
  for (let y = s.mid + BLOCK; y < y1; y += BLOCK) streets.push(y);
  // The side blocks, outside the outer kerbs: some hatched, some left open.
  const blocks: { x: number; y: number }[] = [];
  for (let n = 0; n < 5; n++) {
    for (let j = -22; j < 10; j++) {
      if ((n + j) % 2 === 0 || (n * 3 + j) % 5 === 0) continue;
      const y = s.mid + j * BLOCK;
      blocks.push({ x: cx - 3 * BLOCK - 2 * BLOCK * (n + 1), y }, { x: cx + 3 * BLOCK + 2 * BLOCK * n, y });
    }
  }
  const half = (side: Side, top: number, height: number) => (
    <div style={{ position: 'absolute', left: x0, width: x1 - x0, top, height, ...paper }}>
      <div style={{ position: 'absolute', inset: 0, background: HALF[side].wash }} />
    </div>
  );
  const ink = (y: number) => (y < s.mid ? HALF.rival.line : HALF.you.line);
  return (
    // Not clipped here: the stage clips at its own edges, and the tilted
    // plane needs the far paper to reach past the stage's top and sides.
    <div aria-hidden data-table-surface style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      {half('rival', y0, s.mid - y0)}
      {half('you', s.mid, y1 - s.mid)}
      <svg
        viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
        width={x1 - x0} height={y1 - y0}
        style={{ position: 'absolute', left: x0, top: y0, overflow: 'visible' }}
        fill="none"
      >
        {/* The lanes: three pale roads down the columns, each with its
            zipline — a centre line with pylon ticks. */}
        {lanes.map((x) => (
          <g key={x}>
            <rect x={x - laneW / 2} y={y0} width={laneW} height={y1 - y0} fill="rgba(255, 250, 235, 0.24)" />
            <line x1={x} y1={y0} x2={x} y2={s.mid} stroke={HALF.rival.line} strokeOpacity={0.42} strokeWidth={1.6} strokeDasharray="14 8" />
            <line x1={x} y1={s.mid} x2={x} y2={y1} stroke={HALF.you.line} strokeOpacity={0.42} strokeWidth={1.6} strokeDasharray="14 8" />
          </g>
        ))}
        {/* Cross streets, each half in its own ink. */}
        {streets.map((y) => (
          <line key={y} x1={x0} y1={y} x2={x1} y2={y} stroke={ink(y)} strokeOpacity={0.24} strokeWidth={1} />
        ))}
        {/* Avenues — double rules running away from you. */}
        {avenues.map((x) => (
          <g key={x} strokeWidth={1.4}>
            <line x1={x - 1.8} y1={y0} x2={x - 1.8} y2={s.mid} stroke={HALF.rival.line} strokeOpacity={0.5} />
            <line x1={x + 1.8} y1={y0} x2={x + 1.8} y2={s.mid} stroke={HALF.rival.line} strokeOpacity={0.5} />
            <line x1={x - 1.8} y1={s.mid} x2={x - 1.8} y2={y1} stroke={HALF.you.line} strokeOpacity={0.5} />
            <line x1={x + 1.8} y1={s.mid} x2={x + 1.8} y2={y1} stroke={HALF.you.line} strokeOpacity={0.5} />
          </g>
        ))}
        {/* The hatched blocks either side of the lanes. */}
        {blocks.map((b, i) => (
          <rect key={i} x={b.x + 5} y={b.y + 5} width={2 * BLOCK - 10} height={BLOCK - 10} rx={2}
            fill={ink(b.y + 1)} fillOpacity={0.12} stroke={ink(b.y + 1)} strokeOpacity={0.3} strokeWidth={0.9} />
        ))}
      </svg>
      {/* Distance: the far half dims a little, and hazes toward its far end. */}
      <div style={{ position: 'absolute', left: x0, width: x1 - x0, top: y0, height: -140 - y0, background: 'rgba(196, 212, 230, 0.62)' }} />
      <div style={{
        position: 'absolute', left: x0, width: x1 - x0, top: -140, height: s.mid + 140,
        background: 'linear-gradient(180deg, rgba(196, 212, 230, 0.62) 0%, rgba(196, 212, 230, 0.26) 38%, rgba(24, 40, 64, 0.05) 70%, rgba(24, 40, 64, 0.13) 100%)',
      }} />
      {/* The vignette: the corners fall away into the scene. */}
      <div style={{
        position: 'absolute', left: x0, width: x1 - x0, top: -120, height: s.bottom + BLEED.bottom + 120,
        background: `radial-gradient(ellipse 290px 560px at 50% ${s.mid + 150}px, transparent 62%, rgba(12, 15, 17, 0.34) 100%)`,
      }} />
      {/* The seam: an ink rule between the halves, keylined in paper. */}
      <div style={{
        position: 'absolute', left: x0, width: x1 - x0, top: s.mid - 2, height: 4,
        background: poster.ink, boxShadow: `0 0 0 1.5px ${poster.paper}, 0 2px 8px rgba(0, 0, 0, 0.35)`,
      }} />
      {/* The centre emblem — the dial mark, in ink on a paper disc on the seam. */}
      <CentreRing size={ring.size} top={ring.centre - ring.size / 2} />
    </div>
  );
}

function CentreRing({ size, top }: { size: number; top: number }) {
  return (
    <div style={{
      position: 'absolute', left: '50%', top, width: size, height: size, marginLeft: -size / 2,
      borderRadius: '50%',
      ...paper,
      boxShadow: `0 0 0 2px ${poster.ink}, 0 0 0 4px ${poster.paper}, 0 4px 10px rgba(0, 0, 0, 0.45)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg viewBox="0 0 40 40" width={size * 0.72} height={size * 0.72} fill="none" stroke={poster.ink} strokeWidth="1.4" style={{ opacity: 0.8 }}>
        <circle cx="20" cy="20" r="15.5" />
        <circle cx="20" cy="20" r="6.5" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={20 + Math.cos(a) * 6.5} y1={20 + Math.sin(a) * 6.5} x2={20 + Math.cos(a) * 15.5} y2={20 + Math.sin(a) * 15.5} />;
        })}
        <circle cx="20" cy="20" r="2.4" fill={poster.red} stroke="none" />
      </svg>
    </div>
  );
}

/**
 * An empty slot: a quiet rounded outline in its half's ink, nothing printed
 * in it (Pocket's empty spots) — the surface shows through. `lit`, it is a
 * spot a hero picked up from the hand may be put: the outline glows the
 * targeting green and the well is a button (`onTap` places the hero there;
 * `name` is its accessible name, "Bench slot 2"). Drawn in the slot box's
 * card area, under the HP room.
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
  // `style` is the slot's whole box (slotBox): the outline is its card
  // area, so it starts under the HP room.
  const { top, height, ...rest } = style ?? {};
  const box: CSSProperties = typeof top === 'number' && typeof height === 'number'
    ? { top: top + HP_ROOM, height: height - HP_ROOM }
    : {};
  return (
    <div
      ref={ref}
      role={lit ? 'button' : undefined}
      tabIndex={lit ? 0 : undefined}
      aria-label={lit ? name : undefined}
      onClick={lit ? onTap : undefined}
      onKeyDown={lit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap?.(); } } : undefined}
      style={{
        position: 'absolute', left: 0, right: 0, top: HP_ROOM, bottom: 0,
        borderRadius: 8,
        border: `1.5px ${lit ? 'solid' : 'dashed'} ${lit ? poster.target : HALF[side].well}`,
        background: lit ? 'rgba(98, 196, 98, 0.18)' : HALF[side].fill,
        boxShadow: lit ? `0 0 0 2px ${poster.target}, 0 0 18px 2px rgba(98, 196, 98, 0.45)` : 'none',
        cursor: lit ? 'pointer' : undefined,
        transition: 'border-color 160ms ease, box-shadow 160ms ease, background 160ms ease',
        ...rest,
        ...box,
      }}
    />
  );
});

/** A round ink button on the paper: the menu, the souls counter's shell. */
export function RoundPlate({ size, children, style }: { size: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: poster.ink, color: poster.cream,
      boxShadow: `0 0 0 1.5px ${poster.paper}, 0 4px 10px rgba(0, 0, 0, 0.45)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...style,
    }}>
      {children}
    </div>
  );
}
