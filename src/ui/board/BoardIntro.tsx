import {
  createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import {
  animate, motion,
  type AnimationOptions, type AnimationPlaybackControls, type DOMKeyframesDefinition,
} from 'framer-motion';
import type { PlayerID } from '@/engine/types';
import { useFxCalm } from '../effects/fx/FxMotionContext';
import { LIFT_VAR } from '../effects/fx/FxImpulse';
import { EASE_OUT, sec } from '../effects/fx/primitives';
import { useViewport } from '../hooks/useViewport';
import { fonts } from '../tokens';
import { poster } from '../poster';

/**
 * The deal-in — how a match opens. When the board first shows (after the
 * draft, or straight away in a Story or tutorial match) the heroes are dealt
 * onto it instead of fading up: the rival's side first, its Active into the
 * lane and then its bench left to right, each card coming down from the
 * rival's hand above the sheet; a beat; then yours, rising from your hand
 * below. While a side deals, a sticker slapped on its Active names it —
 * "Rival" in red, "You" in gold — so a new player learns which half of the
 * lane is whose. Both hold a second past the last card, then fade.
 *
 * The travel rides the keyed wrapper BenchRow and ActiveSlot put round each
 * HeroSlot (DealtTile), never the tile: the tile carries the shared layoutId
 * that moves heroes between rows, and the rest box the FX layer measures. A
 * wrapper reads its entrance once, as it mounts, and only while its card's
 * moment in the deal is still ahead — so a promotion, a retreat or a respawn
 * later in the match gets the plain quick fade, and nothing replays.
 *
 * Under calm motion nothing travels (the tiles fade up as they always have),
 * but the stickers still name the sides.
 */

/** Where a tile sits: its side's Active, or a bench slot left to right. */
export type DealSlot = 'active' | 0 | 1 | 2;

// The timeline, in ms from the board first showing.
const LEAD_MS = 160;      // the board settles before the first card leaves
const STAGGER_MS = 110;   // one card to the next on a side
const LAND_MS = 320;      // one card's flight, settle included
const BEAT_MS = 250;      // the rival's last card down → your first away
const HOLD_MS = 1000;     // the stickers stay this long past the last card
const FADE_MS = 300;
const PER_SIDE = 4;       // the Active, then three bench slots

const sideStart = (rival: boolean) =>
  LEAD_MS + (rival ? 0 : (PER_SIDE - 1) * STAGGER_MS + LAND_MS + BEAT_MS);
/** The last card down: ~1.7 s. */
const DEAL_END_MS = sideStart(false) + (PER_SIDE - 1) * STAGGER_MS + LAND_MS;

// How far a card travels, in the board's own px. It leaves its owner's hand
// (off the top or bottom edge of the sheet) — the lane sits a row further in
// than the bench — and starts toward the middle, where the hand is held.
const REACH = {
  desk:  { bench: 150, lane: 300, col: 104 },
  phone: { bench: 105, lane: 215, col: 60 },
} as const;
/** Each column's tilt in flight (degrees), mirrored for your side. */
const TILT = [6, -3, -6] as const;

interface Deal { me: PlayerID; calm: boolean; mobile: boolean; t0: number }

const DealContext = createContext<Deal | null>(null);

/** Mount around the board once it shows: the deal starts with the mount. */
export function BoardIntro({ me, children }: { me: PlayerID; children: ReactNode }) {
  const calm = useFxCalm();
  const { isMobile } = useViewport();
  const [t0] = useState(() => performance.now());
  const deal = useMemo(() => ({ me, calm, mobile: isMobile, t0 }), [me, calm, isMobile, t0]);
  return <DealContext.Provider value={deal}>{children}</DealContext.Provider>;
}

interface Entrance { delay: number; flight: DOMKeyframesDefinition; transition: AnimationOptions }

/** A tile's flight onto the board and how long until it leaves the hand,
 *  or null when its moment has passed. */
function entranceFor(deal: Deal, owner: PlayerID, slot: DealSlot): Entrance | null {
  if (deal.calm) return null;
  const rival = owner !== deal.me;
  const order = slot === 'active' ? 0 : slot + 1;
  const delay = sideStart(rival) + order * STAGGER_MS - (performance.now() - deal.t0);
  if (delay < 0) return null;
  const reach = deal.mobile ? REACH.phone : REACH.desk;
  // The rival's Active holds the lane's left column, yours its right.
  const col = slot === 'active' ? (rival ? 0 : 2) : slot;
  const y = (rival ? -1 : 1) * (slot === 'active' ? reach.lane : reach.bench);
  const x = (1 - col) * reach.col;
  const tilt = TILT[col] * (rival ? 1 : -1);
  return {
    delay,
    // Out of the hand lifted off the table — a touch large, its shadow fallen
    // away (the tile's drop reads the lift variable, as a kick's does) — and
    // set down like a card: a hair past the slot, a small counter-tilt and a
    // press, then flat.
    flight: {
      opacity: 1,
      x: [x, 0, 0],
      y: [y, -Math.sign(y) * 4, 0],
      rotate: [tilt, -tilt * 0.3, 0],
      scale: [1.08, 0.985, 1],
      [LIFT_VAR]: [0.9, 0, 0],
    },
    transition: {
      duration: sec(LAND_MS), times: [0, 0.7, 1], ease: [EASE_OUT, 'easeInOut'],
      opacity: { duration: 0.1, ease: 'linear' },
    },
  };
}

/**
 * The keyed wrapper round a board HeroSlot. Its presence is opacity-only and
 * fast: the HeroSlot inside carries a shared layoutId, so when a hero changes
 * zones (promotion / retreat) the layout animation travels it between rows,
 * and a scale/blur exit here used to play a "vanish" at the old slot that
 * fought the travel and read as a teleport. During the deal-in, and only
 * then, it carries the card's flight instead. Forwards its ref: the rows'
 * AnimatePresence pops exiting tiles out of layout through it (popLayout).
 */
export const DealtTile = forwardRef<HTMLDivElement, {
  owner: PlayerID;
  slot: DealSlot;
  style: CSSProperties;
  children: ReactNode;
}>(function DealtTile({ owner, slot, style, children }, ref) {
  const deal = useContext(DealContext);
  // Read once, at mount: a tile that mounts after its moment never deals.
  const [entrance] = useState(() => (deal ? entranceFor(deal, owner, slot) : null));
  // Until its moment the card waits unseen in its own slot — where anything
  // that measures it (the coach's spotlight, a drag's drop test) finds it —
  // then leaves the hand. The flight is played on the node rather than
  // declared, so the wrapper's declared presence stays the opacity-only one
  // above and carries nothing that could run again later in the match.
  const node = useRef<HTMLDivElement | null>(null);
  const setNode = useCallback((el: HTMLDivElement | null) => {
    node.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  }, [ref]);
  useEffect(() => {
    if (!entrance) return;
    let flight: AnimationPlaybackControls | undefined;
    const t = setTimeout(() => {
      if (node.current) flight = animate(node.current, entrance.flight, entrance.transition);
    }, entrance.delay);
    return () => { clearTimeout(t); flight?.stop(); };
  }, [entrance]);
  return (
    <motion.div
      ref={setNode}
      initial={{ opacity: 0 }}
      animate={entrance ? undefined : { opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.25 }}
      style={style}
    >
      {children}
    </motion.div>
  );
});

/**
 * "Rival" / "You", slapped on a side's Active as its first card lands — the
 * FX layer's sticker (Stamp), held for the deal. Mount inside the Active's
 * positioned row; it never takes a tap.
 */
export function DealSticker({ rival }: { rival: boolean }) {
  const deal = useContext(DealContext);
  const [plan] = useState(() => {
    if (!deal) return null;
    const land = sideStart(rival) + LAND_MS;
    const delay = land - (performance.now() - deal.t0);
    return delay < 0 ? null : { delay, hold: DEAL_END_MS + HOLD_MS - land, dur: DEAL_END_MS + HOLD_MS + FADE_MS - land };
  });
  const [done, setDone] = useState(false);
  if (!deal || !plan || done) return null;
  const t = (ms: number) => ms / plan.dur;
  const landed = '0 3px 8px rgba(0, 0, 0, 0.35)';
  const fontSize = deal.mobile ? 12 : 16;
  return (
    <div aria-hidden style={{
      position: 'absolute', left: '50%', top: '34%', transform: 'translate(-50%, -50%)',
      zIndex: 2, pointerEvents: 'none',
    }}>
      <motion.div
        initial={deal.calm ? { opacity: 0, scale: 0.8 } : { opacity: 0, scale: 2.2, rotateX: 40 }}
        animate={deal.calm
          ? { opacity: [0, 1, 1, 0], scale: [0.8, 1.06, 1, 1] }
          : {
            opacity: [0, 1, 1, 1, 0],
            scale: [2.2, 0.92, 1.04, 1, 1],
            rotateX: [40, -7, 0, 0, 0],
            boxShadow: ['0 26px 22px rgba(0, 0, 0, 0.22)', '0 1px 3px rgba(0, 0, 0, 0.5)', landed, landed, landed],
          }}
        transition={{
          duration: sec(plan.dur), delay: sec(plan.delay), ease: EASE_OUT,
          times: deal.calm ? [0, t(120), t(plan.hold), 1] : [0, t(100), t(180), t(plan.hold), 1],
        }}
        onAnimationComplete={() => setDone(true)}
        style={{
          display: 'inline-block',
          padding: `${Math.round(fontSize * 0.3)}px ${Math.round(fontSize * 0.55)}px`,
          background: rival ? poster.rival : poster.you,
          color: rival ? poster.paper : poster.ink,
          borderRadius: 3,
          rotate: rival ? -6 : 5,
          transformPerspective: 520,
          boxShadow: landed,
          fontFamily: fonts.display, fontSize,
          letterSpacing: '0.1em', whiteSpace: 'nowrap', lineHeight: 1,
          textTransform: 'uppercase',
        }}
      >
        {rival ? 'Rival' : 'You'}
      </motion.div>
    </div>
  );
}
