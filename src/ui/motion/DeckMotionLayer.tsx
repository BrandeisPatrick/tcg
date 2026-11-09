/**
 * Plays a `DeckMotionPlan` (deckMotionPlan.ts) over the board: cards in the
 * air between the deck, the hand, the discard pile and the table. Fixed over
 * the viewport, under the sheets and prompts (zIndex 90 < 100), taking no
 * pointer events — nothing here blocks input or touches the game.
 *
 * A ghost is the real card (CardFrame, or the phone hand's HandThumb when it
 * is to or from your hand there) on a two-sided plate that can turn over in
 * flight: your draws leave the deck as a back and land face up, the rival's
 * stay backs, a discard lands face up on the pile. Each frame of a flight
 * the ghost chases its destination's live box (the hand closes up, a strip
 * scrolls), so it lands on the card it becomes; the real card is kept out of
 * sight until then. Starting boxes are measured as the batch arrives, while
 * a card leaving the hand is still in it.
 *
 * The riffle after a shuffle is three backs splaying off the deck and back.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { PlayerID } from '@/engine/types';
import { CardFrame, SIZES } from '../card/CardFrame';
import { HandThumb, THUMB_H, THUMB_W } from '../board/HandThumb';
import { CardBack } from '../board/OpponentHand';
import { restRect, type Rect } from '../effects/fx/geometry';
import { useViewport } from '../hooks/useViewport';
import type { Anchor, DeckMotionPlan, Face, Flight, Riffle } from './deckMotionPlan';
import type { PileTicker } from './pileTicker';

const Z = 90;
/** An upgrade or a drafted hero shown over the table: the hand card's size, times this. */
const STAGE_SCALE = { desk: 1.2, phone: 0.8 } as const;
/** The pop as an upgrade appears, ms. */
const APPEAR_POP_MS = 180;

type Owner = 'you' | 'rival';

interface Props {
  plan: DeckMotionPlan;
  /** Changes with each batch; 0 for none. */
  planKey: number;
  me: PlayerID;
  /** Where each card of your hand is (Board's registry). */
  handRefs: Map<string, HTMLElement>;
  /** Where each hero's slot is (Board's registry). */
  slotRefs: Map<string, HTMLElement>;
  ticker: PileTicker;
}

interface Live {
  f: Flight;
  t0: number;
  from: Rect;
  /** The destination's last known box, when it cannot be measured any more. */
  lastTo: Rect | null;
  /** Rendered at this natural size and scaled to its box each frame. */
  natural: { w: number; h: number };
  thumb: boolean;
  done: boolean;
}

interface LiveRiffle { r: Riffle; key: string; rect: Rect }

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const toRect = (el: Element): Rect => {
  const b = el.getBoundingClientRect();
  return { left: b.left, top: b.top, width: b.width, height: b.height };
};
const faceAngle = (f: Face) => (f === 'back' ? 180 : 0);

/** A card-shaped box of `natural`'s proportions, `h` tall, centred on (cx, cy). */
function boxAt(cx: number, cy: number, natural: { w: number; h: number }, h: number): Rect {
  const w = (natural.w / natural.h) * h;
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
}

function pileEl(pile: 'deck' | 'discard', owner: Owner): Element | null {
  const box = document.querySelector(`[data-pile="${pile}-${owner}"]`);
  return box ? (box.firstElementChild ?? box) : null;
}

export function DeckMotionLayer({ plan, planKey, me, handRefs, slotRefs, ticker }: Props) {
  const { isMobile } = useViewport();
  const [live, setLive] = useState<Live[]>([]);
  const [riffles, setRiffles] = useState<LiveRiffle[]>([]);
  const boxes = useRef(new Map<string, HTMLDivElement>());
  const plates = useRef(new Map<string, HTMLDivElement>());
  /** The real cards kept out of sight, by the flight hiding them. */
  const hidden = useRef(new Map<string, HTMLElement>());
  const ownerOf = (pid: PlayerID): Owner => (pid === me ? 'you' : 'rival');

  /** The hand card a flight hides: yours by Board's registry, the rival's
   *  back by its data attribute. */
  const hideTarget = (iid: string): HTMLElement | null =>
    handRefs.get(iid) ?? document.querySelector<HTMLElement>(`[data-hand-card="${iid}"]`);

  const hide = (key: string, iid: string): boolean => {
    if (hidden.current.has(key)) return true;
    const el = hideTarget(iid);
    if (!el) return false;
    el.style.visibility = 'hidden';
    hidden.current.set(key, el);
    return true;
  };
  const unhide = (key: string) => {
    const el = hidden.current.get(key);
    if (el) el.style.visibility = '';
    hidden.current.delete(key);
  };

  /** Where an anchor is on screen now, as a box for a card of `natural`'s shape. */
  const measure = (a: Anchor, natural: { w: number; h: number }): Rect | null => {
    switch (a.kind) {
      case 'pile': {
        const el = pileEl(a.pile, ownerOf(a.pid));
        return el ? toRect(el) : null;
      }
      case 'hand': {
        const owner = ownerOf(a.pid);
        const card = a.iid ? (handRefs.get(a.iid) ?? document.querySelector(`[data-hand-card="${a.iid}"]`)) : null;
        if (card) return toRect(card);
        const root = document.querySelector(`[data-hand="${owner}"]`);
        if (!root) return null;
        const r = toRect(root);
        return boxAt(r.left + r.width / 2, r.top + r.height / 2, natural, Math.max(40, r.height * 0.9));
      }
      case 'slot': {
        const el = slotRefs.get(a.iid);
        return el ? restRect(el) : null;
      }
      case 'stage': {
        const you = pileEl('deck', 'you');
        const rival = pileEl('deck', 'rival');
        const vh = window.innerHeight;
        const yYou = you ? toRect(you).top + toRect(you).height / 2 : vh * 0.78;
        const yRival = rival ? toRect(rival).top + toRect(rival).height / 2 : vh * 0.16;
        const mine = a.pid === me;
        const cy = lerp(yRival, yYou, mine ? 0.66 : 0.34);
        const scale = isMobile ? STAGE_SCALE.phone : STAGE_SCALE.desk;
        const h = natural.h * scale;
        const w = natural.w * scale;
        const cx = window.innerWidth / 2 + (a.i - (a.n - 1) / 2) * w * 0.82;
        return boxAt(cx, cy, natural, h);
      }
    }
  };

  // A new batch: schedule the piles' ticks, measure where every flight
  // starts (now, while a card leaving the hand is still in it), hide the real
  // cards the flights stand in for, and put the ghosts up.
  useLayoutEffect(() => {
    if (planKey === 0 || (plan.flights.length === 0 && plan.riffles.length === 0 && plan.ticks.length === 0)) return;
    const t0 = performance.now();
    ticker.schedule(plan.ticks, ownerOf);
    const fresh: Live[] = [];
    for (const f of plan.flights) {
      const thumb = isMobile && f.pid === me && (f.to.kind === 'hand' || f.from.kind === 'hand');
      const natural = thumb ? { w: THUMB_W, h: THUMB_H } : SIZES.hand;
      const from = measure(f.from, natural) ?? measure(f.to, natural);
      if (!from) continue;
      if (f.hide) hide(f.key, f.hide);
      fresh.push({ f, t0, from, lastTo: null, natural, thumb, done: false });
    }
    const freshRiffles: LiveRiffle[] = [];
    for (const r of plan.riffles) {
      const el = pileEl('deck', ownerOf(r.pid));
      if (el) freshRiffles.push({ r, key: `${planKey}-${r.pid}-${r.at}`, rect: toRect(el) });
    }
    if (fresh.length) setLive((l) => [...l, ...fresh]);
    if (freshRiffles.length) setRiffles((l) => [...l, ...freshRiffles]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  // The frame loop, while anything is in the air.
  useEffect(() => {
    if (live.length === 0) return;
    let raf = 0;
    const frame = () => {
      const now = performance.now();
      let finished = false;
      for (const lf of live) {
        if (lf.done) continue;
        const box = boxes.current.get(lf.f.key);
        const plate = plates.current.get(lf.f.key);
        const t = now - lf.t0 - lf.f.at;
        if (!box || !plate) continue;
        if (t < 0) { box.style.visibility = 'hidden'; continue; }
        if (lf.f.hide) hide(lf.f.key, lf.f.hide);
        box.style.visibility = 'visible';
        let rect: Rect;
        let angle = faceAngle(lf.f.faces.start);
        let rot = 0;
        let alpha = 1;
        if (t < lf.f.hold) {
          // Shown where it appears: a pop as it comes.
          const pop = easeOut(clamp01(t / APPEAR_POP_MS));
          const s = lerp(0.72, 1, pop);
          alpha = pop;
          rect = {
            left: lf.from.left + (lf.from.width * (1 - s)) / 2,
            top: lf.from.top + (lf.from.height * (1 - s)) / 2,
            width: lf.from.width * s,
            height: lf.from.height * s,
          };
        } else {
          const p = clamp01((t - lf.f.hold) / lf.f.dur);
          const to = measure(lf.f.to, lf.natural) ?? lf.lastTo ?? lf.from;
          lf.lastTo = to;
          const e = easeInOut(p);
          const dx = to.left - lf.from.left;
          const lift = Math.min(40, Math.hypot(dx, to.top - lf.from.top) * 0.12);
          rect = {
            left: lerp(lf.from.left, to.left, e),
            top: lerp(lf.from.top, to.top, e) - lift * Math.sin(Math.PI * p),
            width: lerp(lf.from.width, to.width, e),
            height: lerp(lf.from.height, to.height, e),
          };
          angle = lerp(faceAngle(lf.f.faces.start), faceAngle(lf.f.faces.end), clamp01((p - 0.2) / 0.6));
          rot = 5 * Math.sin(Math.PI * p) * (dx < 0 ? -1 : 1);
          if (p >= 1) { lf.done = true; finished = true; unhide(lf.f.key); }
        }
        const s = rect.width / lf.natural.w;
        box.style.opacity = String(alpha);
        box.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) scale(${s}) rotate(${rot}deg)`;
        plate.style.transform = `rotateY(${angle}deg)`;
      }
      if (finished) setLive((l) => l.filter((x) => !x.done));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // Leaving: nothing stays hidden.
  useEffect(() => () => {
    for (const el of hidden.current.values()) el.style.visibility = '';
    hidden.current.clear();
  }, []);

  if (live.length === 0 && riffles.length === 0) return null;
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: Z, pointerEvents: 'none', overflow: 'hidden' }}>
      {live.map((lf) => (
        <div
          key={lf.f.key}
          data-deck-flight={lf.f.what}
          ref={(el) => { if (el) boxes.current.set(lf.f.key, el); else boxes.current.delete(lf.f.key); }}
          style={{
            position: 'absolute', left: 0, top: 0,
            width: lf.natural.w, height: lf.natural.h,
            transformOrigin: '0 0', willChange: 'transform', visibility: 'hidden',
            perspective: 900,
          }}
        >
          <div
            ref={(el) => { if (el) plates.current.set(lf.f.key, el); else plates.current.delete(lf.f.key); }}
            style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d' }}
          >
            <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
              {lf.f.cardId && (lf.f.faces.start === 'face' || lf.f.faces.end === 'face') && (
                lf.thumb
                  ? <HandThumb cardId={lf.f.cardId} />
                  : <CardFrame cardId={lf.f.cardId} size="hand" physical={false} tapExplains={false} />
              )}
            </div>
            <div style={{
              position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}>
              <CardBack radius={lf.thumb ? 6 : 10} />
            </div>
          </div>
        </div>
      ))}
      {riffles.map((lr) => (
        <RiffleGhost key={lr.key} live={lr} onDone={() => setRiffles((l) => l.filter((x) => x.key !== lr.key))} />
      ))}
    </div>
  );
}

/** Three backs splaying off the deck and back: the shuffle. */
function RiffleGhost({ live, onDone }: { live: LiveRiffle; onDone: () => void }) {
  const { rect, r } = live;
  const spread = Math.max(8, rect.width * 0.3);
  return (
    <>
      {[-1, 0, 1].map((k, i) => (
        <motion.div
          key={k}
          initial={{ x: rect.left, y: rect.top, rotate: 0, opacity: 0 }}
          // Out, a shorter counter-splay, and home: the cut and the square-up.
          animate={{
            x: [rect.left, rect.left + k * spread, rect.left - k * spread * 0.5, rect.left],
            y: [rect.top, rect.top - 4 - Math.abs(k) * 2, rect.top - 2, rect.top],
            rotate: [0, k * 9, -k * 4, 0],
            opacity: [0, 1, 1, 0],
          }}
          transition={{ delay: r.at / 1000, duration: r.dur / 1000, times: [0, 0.4, 0.7, 1], ease: 'easeInOut' }}
          onAnimationComplete={i === 2 ? onDone : undefined}
          style={{ position: 'absolute', left: 0, top: 0, width: rect.width, height: rect.height, zIndex: 1 - Math.abs(k) }}
        >
          <CardBack radius={rect.width > 36 ? 7 : 4} />
        </motion.div>
      ))}
    </>
  );
}
