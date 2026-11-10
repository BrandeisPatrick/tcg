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
 * ring, your Active, your bench of three — the 3-1-1-3 stack. The two Actives
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

/** Room above each card for its floating HP. */
export const HP_ROOM = 16;

export const boardRows = {
  /** An Active's slot box: its HP room and its card. */
  active: HP_ROOM + cardHeight(boardCols.active),
  /** A bench slot box. */
  bench: HP_ROOM + cardHeight(boardCols.bench),
  /** A bench row to its side's Active row. */
  gap: 8,
  /** Between the two Actives: the seam, where the centre ring sits. */
  lane: 30,
  /** Where the stack starts, under the rival's name bar. */
  top: 48,
} as const;

/** The bench's width: three cards and their gaps. */
export const benchWidth = boardCols.bench * 3 + boardCols.benchGap * 2;

/** Where each row starts, px down the stage, and the seam. */
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

/** Where a slot's box is on the stage: the Active's (centred), or bench slot
 *  `i` (0-2, left to right). Each box includes its HP room. */
export function slotBox(row: number, kind: 'active' | 'bench', i = 0): CSSProperties {
  const w = kind === 'active' ? boardCols.active : boardCols.bench;
  const left = kind === 'active'
    ? (STAGE.w - w) / 2
    : (STAGE.w - benchWidth) / 2 + i * (boardCols.bench + boardCols.benchGap);
  return { position: 'absolute', left, top: row, width: w, height: HP_ROOM + cardHeight(w) };
}

/**
 * The HUD's seats on the stage (logical px). The rails either side of the
 * Active column hold the decks, half off the screen as Pocket's are: the
 * rival's at the upper left, yours at the right middle, each discard pile
 * just inside its deck. The name bars run along the top (the rival's) and
 * the bottom (yours); the menu button and the souls counter sit beside your
 * bench; the turn dock and the hand share the bottom band.
 */
export const DECK = { w: 64, h: 90 } as const;
export const DISCARD = { w: 40, h: 56 } as const;
export function hudSeats(tilted = false) {
  const s = boardStack();
  // The near seats sit on the plane: placed inward by the tilt's growth so
  // they project where the flat ones sit.
  const nearX = (x: number) => (tilted ? STAGE.w / 2 + (x - STAGE.w / 2) / TABLE_TILT.nearX : x);
  const activeCentre = (row: number) => row + HP_ROOM + cardHeight(boardCols.active) / 2;
  const benchCentre = s.benchY + HP_ROOM + cardHeight(boardCols.bench) / 2;
  const off = Math.round(DECK.w * 0.47);
  return {
    rivalBar: { left: 8, top: 10 },
    rivalHand: { centre: 300, top: tilted ? 38 : -24 },
    rivalDeck: { left: -off, top: activeCentre(s.activeR) - DECK.h / 2 },
    rivalDiscard: { left: DECK.w - off + 8, top: activeCentre(s.activeR) - DISCARD.h / 2 },
    ring: { centre: s.mid, size: 60 },
    yourDeck: { left: nearX(STAGE.w - DECK.w + off), top: activeCentre(s.activeY) - DECK.h / 2 },
    yourDiscard: { left: nearX(STAGE.w - DECK.w + off - 8 - DISCARD.w), top: activeCentre(s.activeY) - DISCARD.h / 2 },
    menu: { left: tilted ? 4 : 13, top: benchCentre - 20, size: 40 },
    souls: { left: STAGE.w - (tilted ? 4 : 13) - 44, top: benchCentre - 22, size: 44 },
    hand: { left: 0, top: s.bottom + 10, width: 300 },
    endTurn: { left: 304, top: s.bottom + 18, width: 80, height: 40 },
    auto: { left: 304, top: s.bottom + 66, width: 80, height: 22 },
    yourBar: { left: 8, top: STAGE.h - 30 },
  };
}

/**
 * The table's TILT — Pokémon TCG Pocket's camera: the table plane turned
 * away from the viewer about a line near its foot, so your half stays close
 * to flat and full size and the rival's half recedes, narrower and smaller
 * (its bench about three quarters of yours). Everything on the table — the
 * halves, the ring, the slots and their cards, the HP floats, the chips, the
 * decks and the discard piles — turns with it; the HUD, the hands, the
 * banner and every sheet stay flat over it. The plane is then scaled up
 * about the same line, so the receding far row still fills the stage's top
 * and the near row grows toward the hand. `angle` 0 is the flat table (the
 * "Flat table" setting).
 */
export const TABLE_TILT = {
  angle: 20,
  perspective: 800,
  /** The line the plane turns about: your bench's foot, which stays put. */
  originY: boardStack().bottom / STAGE.h,
  scale: 1.2,
  shiftY: 0,
  /** How much wider the plane's near edge projects (its scale times the
   *  perspective at your Active): the near seats are placed inward by it. */
  nearX: 1.1,
} as const;

/** The style of the table's plane: the tilt, or none. */
export function tableTiltStyle(flat: boolean): CSSProperties {
  if (flat) return {};
  const t = TABLE_TILT;
  return {
    transform: `translateY(${t.shiftY}px) perspective(${t.perspective}px) rotateX(${t.angle}deg) scale(${t.scale})`,
    transformOrigin: `50% ${t.originY * 100}%`,
  };
}

/** The stage's own paper: cream with its mottled sizing. */
const paper: CSSProperties = {
  background: poster.paper,
  backgroundImage: PAPER_MOTTLE,
  backgroundSize: '320px 320px',
};

/**
 * The table — fills the stage edge to edge, no frame: the rival's half above
 * the seam, tinted its red, and yours below, tinted your gold, two cream
 * paper plates on the dark scene that meet at the seam with the centre ring
 * (the printer's dial mark from our card backs) between them. Rendered
 * behind the live rows.
 */
export function BoardTable() {
  const { ring } = hudSeats();
  const seam = 7;
  return (
    // Not clipped here: the stage clips at its own edges, and the tilted
    // plane needs the far paper to reach past the stage's top.
    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      {/* The rival's half. */}
      <div style={{
        position: 'absolute', left: -20, right: -20, top: -200, height: ring.centre - seam + 200,
        borderRadius: '0 0 22px 22px',
        ...paper,
        boxShadow: `inset 0 0 0 1.5px ${poster.inkRule}, 0 10px 24px rgba(0, 0, 0, 0.45)`,
      }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: `linear-gradient(180deg, rgba(212, 57, 44, 0.16), rgba(212, 57, 44, 0.07) 60%, rgba(212, 57, 44, 0.12))` }} />
      </div>
      {/* Your half. */}
      <div style={{
        position: 'absolute', left: -20, right: -20, top: ring.centre + seam, bottom: -40,
        borderRadius: '22px 22px 0 0',
        ...paper,
        boxShadow: `inset 0 0 0 1.5px ${poster.inkRule}, 0 -10px 24px rgba(0, 0, 0, 0.45)`,
      }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: `linear-gradient(0deg, rgba(217, 182, 74, 0.18), rgba(217, 182, 74, 0.08) 60%, rgba(217, 182, 74, 0.14))` }} />
      </div>
      {/* The centre ring — the dial mark, in ink on a paper disc at the seam. */}
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
      boxShadow: `0 0 0 2px ${poster.ink}, 0 0 0 4px ${poster.paper}, 0 6px 16px rgba(0, 0, 0, 0.5)`,
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
 * An empty slot: a faint rounded outline on the paper, nothing printed in it
 * (Pocket's empty spots). `lit`, it is a spot a hero picked up from the hand
 * may be put: the outline glows the targeting green and the well is a button
 * (`onTap` places the hero there; `name` is its accessible name, "Bench slot
 * 2"). Drawn in the slot box's card area, under the HP room.
 *
 * The ref lands on the outline itself. BenchRow and ActiveSlot render a well
 * as a direct child of `AnimatePresence mode="popLayout"`, which hands every
 * direct child a ref so it can measure an exiting one and lift it out of the
 * flow — keep it a direct child there, a plain wrapper would drop the ref.
 */
export const SlotWell = forwardRef<HTMLDivElement, {
  lit?: boolean;
  name?: string;
  onTap?: () => void;
  style?: CSSProperties;
}>(function SlotWell({ lit = false, name, onTap, style }, ref) {
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
        border: `1.5px solid ${lit ? poster.target : 'rgba(23, 20, 16, 0.16)'}`,
        background: lit ? 'rgba(98, 196, 98, 0.16)' : 'rgba(255, 255, 255, 0.14)',
        boxShadow: lit ? `0 0 0 2px ${poster.target}, 0 0 18px 2px rgba(98, 196, 98, 0.45)` : 'inset 0 1px 0 rgba(255, 255, 255, 0.25)',
        cursor: lit ? 'pointer' : undefined,
        transition: 'border-color 160ms ease, box-shadow 160ms ease, background 160ms ease',
        ...style,
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
