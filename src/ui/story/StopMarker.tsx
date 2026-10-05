import { memo, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { StoryRun, StoryNode, NodeKind } from '@/story/types';
import { effectiveKind, stopState, type StopState } from '@/story/describe';
import { enemyRosterSize } from '@/story/content';
import { fonts, text } from '../tokens';
import { poster, chamfer, clipBoth } from '../poster';
import { KIND_INK, KIND_LABEL, StopGlyph } from './StopGlyph';
import { MAP_W, MAP_H, coverScale, toScreen, zoomProgress, type Camera, type Frame } from './mapCamera';

/**
 * The stops, as stamps printed over the sheet — drawn at a near-constant
 * screen size (≈30px at the widest view, ≈46px close in), so they stay crisp
 * and always outweigh the streets under them. Each sits on its map point
 * through the map stage's live zoom (`--s`, see StoryMapScreen's MapStage)
 * and follows its live size (`--d`), so the camera moves and sizes them
 * without React; they are drawn afresh, and their name tags placed, only
 * when it comes to rest.
 *
 *   battle / elite — a round print of the leader's face in a ring of the
 *                    kind's ink (the shared start, with no leader: swords);
 *   boss           — the face, larger, on a red starburst seal with a crown;
 *   recruit/supply — a paper disc with the kind's glyph;
 *   locked         — the same shape, flattened: paper-deep, ink-faint, grey;
 *   cleared        — a small ink coin with a gold tick, stamped.
 * Open stops add a red pulse (the only ambient motion on the map). Every
 * marker is a button: pressing it SELECTS the stop, it never acts.
 */

const HERO_BASE = `${import.meta.env.BASE_URL ?? '/'}heroes/`;
const BOSS_EXTRA = 10;
const TAG_FONT = 10;
const TAG_H = 19;
const TAG_GAP = 4;
const PENNANT_W = 35, PENNANT_H = 29;

export type TagSide = 'below' | 'above' | 'right' | 'left';

export interface StopView {
  node: StoryNode;
  kind: NodeKind;
  state: StopState;
  current: boolean;
  selected: boolean;
  /** Screen position of the stop's centre, for the camera at rest. */
  x: number;
  y: number;
  /** Its map point, in map units. */
  mx: number;
  my: number;
  /** Base diameter at this zoom; `r` is the drawn outer radius. */
  d: number;
  r: number;
  tag: TagSide | null;
  /** How far the tag slides along its side to stay on screen (px). */
  tagShift: number;
  /** A tag the player must see: open, boss, current or selected. */
  tagMust: boolean;
  foes: number;
}

// ---- name-tag placement -------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | null | undefined;
const tagWidths = new Map<string, number>();
/** A tag's width, measured once the UI face has loaded (estimated before). */
function tagWidth(label: string): number {
  const hit = tagWidths.get(label);
  if (hit !== undefined) return hit;
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  const font = `700 ${TAG_FONT}px ${fonts.ui}`;
  const upper = label.toUpperCase();
  let w = upper.length * TAG_FONT * 0.68;
  if (measureCtx) { measureCtx.font = font; w = measureCtx.measureText(upper).width; }
  w += upper.length * TAG_FONT * 0.07 + 13;
  if (document.fonts?.check?.(font)) tagWidths.set(label, w);
  return w;
}

export type Box = { x0: number; y0: number; x1: number; y1: number };
const hitsBox = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const hitsCircle = (a: Box, cx: number, cy: number, r: number) => {
  const nx = Math.max(a.x0, Math.min(cx, a.x1)), ny = Math.max(a.y0, Math.min(cy, a.y1));
  return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r;
};

/** Below / above tags slide sideways; right / left tags slide up and down. */
const along = (side: TagSide) => (side === 'below' || side === 'above' ? 'x' : 'y');

function tagBox(v: StopView, side: TagSide, w: number, shift = 0): Box {
  const g = v.r + TAG_GAP;
  const sx = along(side) === 'x' ? shift : 0, sy = along(side) === 'y' ? shift : 0;
  const b: Box =
    side === 'below' ? { x0: v.x - w / 2, y0: v.y + g, x1: v.x + w / 2, y1: v.y + g + TAG_H }
    : side === 'above' ? { x0: v.x - w / 2, y0: v.y - g - TAG_H, x1: v.x + w / 2, y1: v.y - g }
    : side === 'right' ? { x0: v.x + g, y0: v.y - TAG_H / 2, x1: v.x + g + w, y1: v.y + TAG_H / 2 }
    : { x0: v.x - g - w, y0: v.y - TAG_H / 2, x1: v.x - g, y1: v.y + TAG_H / 2 };
  return { x0: b.x0 + sx, y0: b.y0 + sy, x1: b.x1 + sx, y1: b.y1 + sy };
}

const rank = (v: StopView) =>
  v.selected ? 0 : v.state === 'open' ? 1 : v.current ? 2 : v.kind === 'boss' ? 3 : v.state === 'cleared' ? 4 : 5;

/** Give each stop that wants a tag a side and a slide along it, most
 *  important stops first. Sides are tried below, right, left, then above (a
 *  tag above a stop reads as the next stop's). A tag may slide along its side
 *  — never so far that it lets go of its stop — to stay on screen and to get
 *  out from under the HUD. Optional tags take only a spot clear of every
 *  marker, tag and HUD box, or stay hidden. Tags the player must see (open,
 *  boss, current, selected) relax step by step — first the HUD, then other
 *  tags, then markers — but are never left hanging off the screen. A stop
 *  that is itself off screen shows no tag. */
function placeTags(views: StopView[], frame: Frame, showAll: boolean, hud: readonly Box[]) {
  const placed: Box[] = [];
  for (const v of views) {
    if (v.current) placed.push({ x0: v.x - 2, y0: v.y - v.r - PENNANT_H, x1: v.x + PENNANT_W, y1: v.y - v.r });
  }
  const screen: Box = { x0: 4, y0: 4, x1: frame.w - 4, y1: frame.h - 4 };
  const grow = (b: Box): Box => ({ x0: b.x0 - 2, y0: b.y0 - 2, x1: b.x1 + 2, y1: b.y1 + 2 });
  for (const v of [...views].sort((a, b) => rank(a) - rank(b))) {
    v.tagMust = v.selected || v.state === 'open' || v.current || v.kind === 'boss';
    if (!v.tagMust && !showAll) continue;
    if (v.x < 0 || v.y < 0 || v.x > frame.w || v.y > frame.h) continue;
    const w = tagWidth(v.node.name ?? KIND_LABEL[v.kind]);
    const sides: TagSide[] = v.current ? ['below', 'right', 'left'] : ['below', 'right', 'left', 'above'];
    const hitsMarker = (b: Box) => views.some((o) => o !== v && hitsCircle(grow(b), o.x, o.y, o.r + 1));
    const hitsTag = (b: Box) => placed.some((o) => hitsBox(grow(b), o));
    const hitsHud = (b: Box) => hud.some((o) => hitsBox(grow(b), o));

    /** The slides that keep a side's tag on screen, nearest first: the least
     *  slide that fits, then slides that clear each HUD box it would sit
     *  under. Null when the side cannot fit on screen at all. */
    const slides = (side: TagSide): number[] | null => {
      const b = tagBox(v, side, w);
      const ax = along(side);
      const [lo, hi] = ax === 'x' ? [b.x0, b.x1] : [b.y0, b.y1];
      const [slo, shi] = ax === 'x' ? [screen.x0, screen.x1] : [screen.y0, screen.y1];
      const [plo, phi] = ax === 'x' ? [b.y0, b.y1] : [b.x0, b.x1];
      const [pslo, pshi] = ax === 'x' ? [screen.y0, screen.y1] : [screen.x0, screen.x1];
      if (plo < pslo || phi > pshi || hi - lo > shi - slo) return null;
      // Never slide so far that the tag lets go of its stop.
      const reach = ax === 'x' ? w / 2 + 4 : TAG_H / 2 + v.r;
      const min = Math.max(slo - lo, -reach), max = Math.min(shi - hi, reach);
      if (min > max) return null;
      const base = Math.min(max, Math.max(min, 0));
      const out = [base];
      for (const o of hud) {
        if (!hitsBox(grow(tagBox(v, side, w, base)), o)) continue;
        const [olo, ohi] = ax === 'x' ? [o.x0, o.x1] : [o.y0, o.y1];
        for (const t of [olo - 3 - hi, ohi + 3 - lo]) if (t >= min && t <= max) out.push(t);
      }
      return out.sort((a, b) => Math.abs(a - base) - Math.abs(b - base));
    };

    type Spot = { side: TagSide; shift: number };
    const find = (ok: (b: Box) => boolean): Spot | null => {
      for (const side of sides) {
        for (const shift of slides(side) ?? []) {
          if (ok(tagBox(v, side, w, shift))) return { side, shift };
        }
      }
      return null;
    };
    let spot = find((b) => !hitsMarker(b) && !hitsTag(b) && !hitsHud(b));
    if (!spot && v.tagMust) {
      spot = find((b) => !hitsMarker(b) && !hitsTag(b))
        ?? find((b) => !hitsMarker(b))
        ?? find(() => true);
    }
    if (!spot) continue;
    v.tag = spot.side;
    v.tagShift = spot.shift;
    placed.push(tagBox(v, spot.side, w, spot.shift));
  }
}

// ---- the layer ----------------------------------------------------------------

const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** A stop's base diameter at a zoom (px): ≈30 at the widest view, ≈46 close
 *  in. The map stage carries the live value as `--d`, so a marker drawn at
 *  rest follows the zoom between rests by scaling itself (see StopMarker). */
export const stopSize = (cam: Camera, frame: Frame) => 30 + 16 * zoomProgress(cam, frame);

export const StopLayer = memo(function StopLayer({
  run, cam, frame, hud, selectedId, stampId, calm, onSelect, onKeyboardFocus,
}: {
  run: StoryRun;
  /** The camera at rest: it sizes the stops and places their tags. */
  cam: Camera;
  frame: Frame;
  /** Screen boxes of the HUD over the map; optional tags keep out of them. */
  hud: readonly Box[];
  selectedId: string | null;
  /** The stop that was just cleared — its coin stamps in. */
  stampId: string | null;
  calm: boolean;
  onSelect: (node: StoryNode) => void;
  /** A stop reached with the keyboard (Tab), which may be off screen. */
  onKeyboardFocus: (node: StoryNode) => void;
}) {
  const d = stopSize(cam, frame);
  const showAll = cam.s >= coverScale(frame) * 1.9;
  const views: StopView[] = run.nodes.map((node) => {
    const kind = effectiveKind(run, node);
    const state = stopState(run, node);
    const p = toScreen(cam, frame, node.x, node.y);
    const own = kind === 'boss' ? d + BOSS_EXTRA : d;
    const r = state === 'cleared' ? coinSize(own) / 2 : kind === 'boss' ? sealSize(own) / 2 : own / 2;
    const combat = kind === 'battle' || kind === 'elite' || kind === 'boss';
    return {
      node, kind, state, x: p.x, y: p.y, mx: node.x * MAP_W, my: node.y * MAP_H, d: own, r,
      current: run.currentNodeId === node.id,
      selected: selectedId === node.id,
      tag: null,
      tagShift: 0,
      tagMust: false,
      foes: combat && state === 'open' ? enemyRosterSize(node.depth, node.kind) : 0,
    };
  });
  placeTags(views, frame, showAll, hud);
  // Fingers get the full 44px target; a phone-sized view counts as touch
  // even where the pointer query cannot tell.
  const touch = coarse || frame.w <= 767;
  return (
    <>
      {views.map((v) => (
        <StopMarker key={v.node.id} view={v} minHit={touch ? 44 : 34} stamp={!calm && stampId === v.node.id} calm={calm}
          onPress={() => onSelect(v.node)} onKeyboardFocus={() => onKeyboardFocus(v.node)} />
      ))}
    </>
  );
});

// ---- one stop -------------------------------------------------------------------

const coinSize = (d: number) => Math.round(d * 0.66);
const sealSize = (d: number) => Math.round(d * 1.34);

/** Stacking: selected > open > current > cleared > locked. */
const layerOf = (v: StopView) => (v.selected ? 60 : v.state === 'open' ? 50 : v.current ? 40 : v.state === 'cleared' ? 30 : 20);

function StopMarker({ view: v, minHit, stamp, calm, onPress, onKeyboardFocus }: {
  view: StopView;
  minHit: number;
  stamp: boolean;
  calm: boolean;
  onPress: () => void;
  onKeyboardFocus: () => void;
}) {
  const hit = Math.max(minHit, v.r * 2 + 4);
  const place = v.node.name ?? KIND_LABEL[v.kind];
  const centred: CSSProperties = { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  // Drawn at the rest zoom's size; between rests the marker follows the live
  // size (`--d`) by this factor — exactly 1 at rest. A painted scale, not a
  // composited one, so it stays crisp.
  const grow = `(var(--d) + ${v.kind === 'boss' ? BOSS_EXTRA : 0}) / ${v.d}`;
  return (
    <button
      type="button"
      onClick={onPress}
      // A pointer press focuses too, but only keyboard focus should move the
      // map (a press may be the start of a drag).
      onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) onKeyboardFocus(); }}
      aria-label={`${place} — ${KIND_LABEL[v.kind]} — ${v.state}`}
      aria-pressed={v.selected}
      data-stop={v.node.id}
      style={{
        position: 'absolute', left: 0, top: 0, width: hit, height: hit,
        // On its map point at the stage's live zoom: the camera moves it.
        transform: `translate3d(calc(var(--s) * ${v.mx.toFixed(2)}px - ${hit / 2}px), calc(var(--s) * ${v.my.toFixed(2)}px - ${hit / 2}px), 0)`,
        zIndex: layerOf(v),
        border: 'none', background: 'none', padding: 0, cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span aria-hidden style={{ position: 'absolute', inset: 0, transform: `scale(calc(${grow}))` }}>
        {v.state === 'open' && !calm && (
          <span style={{
            ...centred, width: v.r * 2 + 4, height: v.r * 2 + 4, borderRadius: '50%',
            border: `2px solid ${poster.red}`, boxSizing: 'border-box',
            animation: 'story-pulse 1.9s cubic-bezier(0.2, 0.6, 0.4, 1) infinite',
          }} />
        )}
        {v.selected && (
          <span style={{
            ...centred, width: v.r * 2 + 12, height: v.r * 2 + 12, borderRadius: '50%',
            border: `3px solid ${poster.target}`, boxSizing: 'border-box',
            boxShadow: '0 0 0 1.5px rgba(23, 20, 16, 0.55)',
          }} />
        )}

        <span style={centred}>
          {v.state === 'cleared'
            ? <ClearedCoin size={coinSize(v.d)} stamp={stamp} />
            : v.kind === 'boss'
              ? <BossSeal view={v} />
              : <Disc view={v} />}
        </span>

        {v.foes > 0 && (
          <span style={{
            position: 'absolute', left: `calc(50% + ${v.r * 0.62}px)`, top: `calc(50% + ${v.r * 0.62}px)`,
            transform: 'translate(-50%, -50%)',
            minWidth: 16, height: 16, padding: '0 3px', boxSizing: 'border-box', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: poster.ink, color: poster.paper, border: `1.5px solid ${poster.paper}`,
            fontFamily: fonts.ui, fontWeight: 800, fontSize: 10, lineHeight: 1,
          }}>{v.foes}</span>
        )}
      </span>

      {/* The pennant and the tag keep their own size; they ride the
          marker's edge as it grows. A tag that moves side is a new tag
          (it fades in where it lands). */}
      {v.current && <Pennant edge={`${v.r}px * ${grow}`} />}
      {v.tag && <NameTag key={v.tag} side={v.tag} shift={v.tagShift} must={v.tagMust} edge={`${v.r}px * ${grow}`}
        dim={v.state === 'locked'} label={place} />}
    </button>
  );
}

/** The stamped coin of a cleared stop. On arrival it lands with an
 *  overshoot and throws one ring. */
function ClearedCoin({ size, stamp }: { size: number; stamp: boolean }) {
  const coin: CSSProperties = {
    width: size, height: size, borderRadius: '50%', boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: poster.ink, border: `1.5px solid ${poster.paper}`,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
  };
  const tick = <StopGlyph kind="cleared" color={poster.gold} size={size * 0.64} />;
  if (!stamp) return <span style={coin}>{tick}</span>;
  return (
    <span style={{ position: 'relative', display: 'block', width: size, height: size }}>
      <motion.span
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: [0.8, 2.3], opacity: [0, 0.75, 0] }}
        transition={{ duration: 0.7, delay: 0.42, times: [0, 0.12, 1], ease: 'easeOut' }}
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: `2px solid ${poster.gold}`, boxSizing: 'border-box',
        }}
      />
      <motion.span
        initial={{ scale: 2.4, opacity: 0, rotate: -14 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 15, delay: 0.3 }}
        style={{ ...coin, position: 'absolute', inset: 0 }}
      >{tick}</motion.span>
    </span>
  );
}

function Face({ id, size, flat }: { id: string; size: number; flat: boolean }) {
  return (
    <img src={`${HERO_BASE}${id}_mm.webp`} alt="" draggable={false}
      style={{
        width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block',
        filter: flat ? 'grayscale(1)' : undefined, opacity: flat ? 0.5 : 1,
      }} />
  );
}

/** An open or selected stop wears a thin paper keyline outside its ring, so
 *  it holds on the dark water as well as on the paper land. */
const keyline = (v: StopView) => v.state === 'open' || v.selected;
const LIFT = '0 3px 7px rgba(0, 0, 0, 0.38)';

/** The fill, ring and glyph inks of a disc stop. Open stops print as solid
 *  stamps — the strongest marks on the sheet; locked ones as flat paper. */
function discInks(v: StopView): { fill: string; ring: string; glyph: string } {
  if (v.state === 'locked') return { fill: poster.paperDeep, ring: poster.inkFaint, glyph: poster.inkFaint };
  switch (v.kind) {
    // The shared start has no leader: crossed swords in cream on an ink disc.
    case 'battle': case 'elite': return { fill: poster.ink, ring: KIND_INK[v.kind], glyph: poster.paper };
    case 'recruit': return { fill: KIND_INK.recruit, ring: poster.ink, glyph: poster.paper };
    default: return { fill: poster.gold, ring: poster.ink, glyph: poster.ink };
  }
}

/** Battle, elite, recruit and supply: one disc, filled by kind. */
function Disc({ view: v }: { view: StopView }) {
  const flat = v.state === 'locked';
  const combat = v.kind === 'battle' || v.kind === 'elite';
  const leader = combat ? v.node.enemy : undefined;
  const { fill, ring, glyph } = discInks(v);
  const shadows = [keyline(v) && `0 0 0 1.5px ${poster.paper}`, v.state === 'open' && LIFT].filter(Boolean);
  return (
    <span style={{
      width: v.d, height: v.d, borderRadius: '50%', boxSizing: 'border-box', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: fill, border: `2.5px solid ${ring}`,
      boxShadow: shadows.length ? shadows.join(', ') : undefined,
    }}>
      {leader
        ? <Face id={leader} size={v.d - 5} flat={flat} />
        : <StopGlyph kind={v.kind} color={glyph} size={v.d * 0.56} />}
    </span>
  );
}

/** Scalloped star, as on the title poster's "Now in PLAYTEST!" seal. */
const star = (outer: number, inner: number) => {
  const points = 22;
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    return `${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
};
const STAR = star(50, 44);
// The keyed seal: a paper star with the red one printed 1.5px inside it.
const STAR_KEY = star(50, 44.4);
const STAR_INSET = star(47.6, 41.8);

/** The boss: its face on a red seal, with a crown tab. Still — the seal does
 *  not turn; on the map only the open stops move. */
function BossSeal({ view: v }: { view: StopView }) {
  const flat = v.state === 'locked';
  const seal = sealSize(v.d);
  const tabW = Math.round(v.d * 0.52), tabH = Math.round(v.d * 0.3);
  return (
    <span style={{ position: 'relative', display: 'block', width: seal, height: seal }}>
      <svg viewBox="0 0 100 100" width={seal} height={seal} style={{
        position: 'absolute', inset: 0, display: 'block',
        filter: v.state === 'open' ? 'drop-shadow(0 3px 4px rgba(0, 0, 0, 0.38))' : undefined,
      }}>
        {keyline(v) && <polygon points={STAR_KEY} fill={poster.paper} />}
        <polygon points={keyline(v) ? STAR_INSET : STAR} fill={flat ? poster.paperDeep : poster.red}
          stroke={flat ? poster.inkFaint : 'none'} strokeWidth="1.6" />
      </svg>
      <span style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: v.d, height: v.d, borderRadius: '50%', boxSizing: 'border-box', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: flat ? poster.paperDeep : poster.ink,
        border: `2.5px solid ${flat ? poster.inkFaint : poster.paper}`,
      }}>
        {v.node.enemy
          ? <Face id={v.node.enemy} size={v.d - 5} flat={flat} />
          : <StopGlyph kind="boss" color={flat ? poster.inkFaint : poster.paper} size={v.d * 0.56} />}
      </span>
      <span style={{
        position: 'absolute', left: '50%', top: (seal - v.d) / 2 - tabH * 0.55, transform: 'translateX(-50%)',
        width: tabW, height: tabH, boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: flat ? poster.paperDeep : poster.ink,
        border: flat ? `1.5px solid ${poster.inkFaint}` : undefined,
        ...clipBoth(chamfer(3)),
      }}>
        <StopGlyph kind="boss" color={flat ? poster.inkFaint : poster.gold} size={tabH * 0.95} />
      </span>
    </span>
  );
}

/** "You are here": a small gold pennant planted on the last stop cleared.
 *  `edge` is the marker's live radius, as a calc() term. */
function Pennant({ edge }: { edge: string }) {
  return (
    <svg aria-hidden width={PENNANT_W} height={PENNANT_H} viewBox={`0 0 ${PENNANT_W} ${PENNANT_H}`}
      style={{
        // Its foot on the marker's edge, by transform (the edge follows the zoom).
        position: 'absolute', left: '50%', top: '50%', marginLeft: -1.5,
        transform: `translateY(calc(-100% - ${edge} + 3px))`,
        overflow: 'visible', pointerEvents: 'none',
      }}>
      <line x1={1.5} y1={1} x2={1.5} y2={PENNANT_H} stroke={poster.ink} strokeWidth={2} />
      <polygon points={`1.5,1 ${PENNANT_W},1 ${PENNANT_W - 6},8.5 ${PENNANT_W},16 1.5,16`}
        fill={poster.you} stroke={poster.ink} strokeWidth={1.5} strokeLinejoin="round" />
      <text x={(PENNANT_W - 4) / 2 + 1} y={12.5} textAnchor="middle" fill={poster.ink}
        style={{ fontFamily: fonts.display, fontSize: 10.5, letterSpacing: '0.06em' }}>YOU</text>
    </svg>
  );
}

/** A stop's name, `edge` (the marker's live radius, a calc() term) plus a
 *  gap off its centre on one side. */
function NameTag({ side, shift, must, edge, dim, label }: {
  side: TagSide;
  shift: number;
  must: boolean;
  edge: string;
  dim: boolean;
  label: string;
}) {
  // Offsets by transform, not top / left: the edge moves with the zoom, and
  // a transform moves the tag without laying anything out.
  const g = `(${edge} + ${TAG_GAP}px)`;
  const along = `calc(-50% + ${shift}px)`;
  const transform =
    side === 'below' ? `translate(${along}, calc${g})`
    : side === 'above' ? `translate(${along}, calc(-100% - ${g}))`
    : side === 'right' ? `translate(calc${g}, ${along})`
    : `translate(calc(-100% - ${g}), ${along})`;
  return (
    <span aria-hidden data-tag={must ? 'must' : 'more'} style={{
      position: 'absolute', left: '50%', top: '50%', transform, height: TAG_H, boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', padding: '0 5px', whiteSpace: 'nowrap',
      ...text.label, fontSize: TAG_FONT, lineHeight: 1,
      background: dim ? poster.paperDeep : poster.paper,
      color: dim ? poster.inkDim : poster.ink,
      border: `1.5px solid ${dim ? poster.inkFaint : poster.ink}`,
    }}>{label}</span>
  );
}
