import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { CardId } from '@/engine/types';
import type { StoryRun, StoryNode } from '@/story/types';
import { randomStartingHeroes, recruitChoices, supplyChoices } from '@/story/content';
import { newRun, clearNode, isReachable } from '@/story/storyRun';
import { effectiveKind, stopState } from '@/story/describe';
import { useSettings } from '@/storage/settings';
import { PosterButton } from '../chrome';
import { PAPER_MOTTLE } from '../poster';
import { fonts } from '../tokens';
import { useViewport } from '../hooks/useViewport';
import { NycMap, MAP_WATER } from './NycMap';
import { PickOverlay } from './PickOverlay';
import { StopCard } from './StopCard';
import { RunPanel } from './RunPanel';
import { StorySheet } from './StorySheet';
import { RouteLines, routeLegs } from './RouteLines';
import { StopLayer, type Box } from './StopMarker';
import { MapControls, OsmCredit } from './MapControls';
import {
  MAP_W, MAP_H, coverScale, scaleLimits, frameStops, revealPoint, lodBand,
  type Camera, type Frame, type Pad,
} from './mapCamera';
import { useMapCamera, useCamera, useRaster, type MapCamera } from './useMapCamera';

interface StoryMapScreenProps {
  run: StoryRun | null;
  onUpdateRun: (run: StoryRun | null) => void;
  onBattle: (node: StoryNode) => void;
  onExit: () => void;
}

type PickState =
  | { mode: 'start'; options: CardId[] }
  | { mode: 'node'; node: StoryNode; kind: 'hero' | 'card'; options: CardId[] }
  | null;

/** The opening view comes no closer than this (× cover). */
const FRONTIER_ZOOM = 2.2;
/** A stop picked from the run panel is shown at least this close (× cover). */
const FOCUS_ZOOM = 2;
/** Keep a nudged stop this far inside the free area, so its tag shows too. */
const STOP_MARGIN = 40;
/** Desktop docks (the layout rule shared with the panels). */
const DOCK = { top: 64, runW: 288, cardW: 340, edge: 16 };
const CREDIT_H = 18;
/** The zoom (px per map unit) at which NycMap's line weights are as drawn. */
const LINE_REF = 1.7;

/** How many stops each run (by seed) had cleared the last time the map was
 *  on screen. Growth since then means we just came back from a won battle,
 *  and the stop that fell gets stamped. Module scope: it outlives the screen
 *  being unmounted for the match. */
const seenCleared = new Map<number, number>();

/** Where the player can act: every open stop, plus where they stand. */
function frontier(run: StoryRun): StoryNode[] {
  return run.nodes.filter((n) => n.id === run.currentNodeId || stopState(run, n) === 'open');
}

const inset = (p: Pad, m: number): Pad => ({ top: p.top + m, right: p.right + m, bottom: p.bottom + m, left: p.left + m });

export function StoryMapScreen({ run, onUpdateRun, onBattle, onExit }: StoryMapScreenProps) {
  const { isMobile } = useViewport();
  const { reducedMotion } = useSettings();
  const osReduced = useReducedMotion();
  const calm = reducedMotion || !!osReduced;
  // The map takes gestures and shows stops only during an active run; behind
  // the intro and ending sheets it is scenery.
  const active = !!run && run.status === 'active';
  const [pick, setPick] = useState<PickState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = active ? run.nodes.find((n) => n.id === selectedId) ?? null : null;

  // Phone: the bottom slot's height decides what the map keeps clear.
  const slotRef = useRef<HTMLDivElement>(null);
  const [slotH, setSlotH] = useState(0);
  useLayoutEffect(() => {
    const el = slotRef.current;
    if (!el) { setSlotH(0); return; }
    const measure = () => setSlotH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, active]);

  // Screen boxes of everything floating over the map, so optional name tags
  // can keep out from under them.
  const rootRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Box[]>([]);
  const [hudEpoch, setHudEpoch] = useState(0);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !active) return;
    const els = [...root.querySelectorAll<HTMLElement>('[data-dock], [data-hud]')];
    const read = () => {
      const boxes = els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
      });
      // The System gear (SystemLayer, top right, 40×40 at 12px).
      boxes.push({ x0: window.innerWidth - 56, y0: 8, x1: window.innerWidth - 8, y1: 56 });
      setHud((prev) => (JSON.stringify(prev) === JSON.stringify(boxes) ? prev : boxes));
    };
    read();
    const ro = new ResizeObserver(read);
    els.forEach((el) => ro.observe(el));
    window.addEventListener('resize', read);
    return () => { ro.disconnect(); window.removeEventListener('resize', read); };
  }, [active, isMobile, selectedId, slotH, hudEpoch]);

  /** The viewport minus everything docked over it. */
  const padsRef = useRef<(cardOpen: boolean) => Pad>(() => ({ top: 0, right: 0, bottom: 0, left: 0 }));
  padsRef.current = (cardOpen: boolean): Pad => isMobile
    ? { top: 64, left: 20, right: 64, bottom: (slotH || 84) + 12 + CREDIT_H + 8 }
    : {
        top: DOCK.top,
        left: DOCK.edge + DOCK.runW + 16,
        right: cardOpen ? DOCK.edge + DOCK.cardW + 16 : 76,
        bottom: 32,
      };

  const frontierCamera = (r: StoryRun, frame: Frame, cardOpen = false): Camera =>
    frameStops(frontier(r), frame, inset(padsRef.current(cardOpen), STOP_MARGIN), coverScale(frame) * FRONTIER_ZOOM);

  // Back from a won battle? Then the opening shot is the stop that fell.
  const [arrival] = useState<StoryNode | null>(() => {
    if (!run || run.status !== 'active' || calm) return null;
    const before = seenCleared.get(run.seed);
    if (before === undefined || run.clearedNodeIds.length <= before) return null;
    return run.nodes.find((n) => n.id === run.currentNodeId) ?? null;
  });
  const [stampId, setStampId] = useState<string | null>(arrival?.id ?? null);
  useEffect(() => {
    if (run) seenCleared.set(run.seed, run.clearedNodeIds.length);
  }, [run]);

  const camera = useMapCamera({
    enabled: active && !pick,
    reduced: calm,
    initial: (frame) => {
      if (run && arrival) {
        return frameStops([arrival], frame, padsRef.current(false), coverScale(frame) * FRONTIER_ZOOM);
      }
      if (run && active) return frontierCamera(run, frame);
      // Scenery behind a sheet: the harbour, the Battery at its heart.
      const here = run?.nodes.find((n) => n.id === run.currentNodeId);
      return frameStops([here ?? { x: 376 / MAP_W, y: 585 / MAP_H }], frame,
        { top: 0, right: 0, bottom: 0, left: 0 }, coverScale(frame) * 1.5);
    },
    onTapEmpty: () => setSelectedId(null),
  });

  // The opening shot of an arrival holds on the stamped stop, then flies on
  // to the new frontier.
  useEffect(() => {
    if (!arrival || !run) return;
    const t = window.setTimeout(() => camera.flyTo(frontierCamera(run, camera.frame), 800), 520);
    return () => window.clearTimeout(t);
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A run that has just begun (from the intro or an ending) flies in on its
  // first stop.
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current && run) camera.flyTo(frontierCamera(run, camera.frame), 700);
    wasActive.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // A stop that opens its card from under a dock is nudged into the clear.
  useEffect(() => {
    if (!selected) return;
    const next = revealPoint(camera.dest(), camera.frame, selected.x, selected.y,
      inset(padsRef.current(true), STOP_MARGIN));
    if (next) camera.flyTo(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, slotH]);

  // Escape lets go of the selected stop (the pick sheets handle their own).
  // Captured and stopped, like every overlay that needs the key first, so the
  // same press does not also open the System menu.
  useEffect(() => {
    if (!selectedId || pick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selectedId, pick]);

  const select = useCallback((node: StoryNode) => setSelectedId(node.id), []);

  // Tabbing onto a stop off screen brings it into view.
  const cardOpen = useRef(false);
  cardOpen.current = !!selected;
  const reveal = useCallback((node: StoryNode) => {
    const next = revealPoint(camera.dest(), camera.frame, node.x, node.y,
      inset(padsRef.current(cardOpen.current), STOP_MARGIN));
    if (next) camera.flyTo(next);
  }, [camera]);

  const focusStop = useCallback((node: StoryNode) => {
    const f = camera.frame;
    const s = Math.max(camera.dest().s, coverScale(f) * FOCUS_ZOOM);
    // On a phone the card replaces the run bar; until it is measured, assume
    // it takes about half the screen.
    const pad = padsRef.current(true);
    if (isMobile) pad.bottom = Math.max(pad.bottom, f.h * 0.5);
    camera.flyTo(frameStops([node], f, pad, s));
    setSelectedId(node.id);
  }, [camera, isMobile]);

  const locate = useCallback(() => {
    if (run) camera.flyTo(frontierCamera(run, camera.frame, !!selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, camera, selected]);

  const startRun = (hero: CardId) => { onUpdateRun(newRun(hero)); setPick(null); };

  // The stop card's one action — today's node handling, unchanged.
  const go = (node: StoryNode) => {
    if (!run || !isReachable(run, node)) return;
    const kind = effectiveKind(run, node); // a full roster turns a recruit into supplies
    if (kind === 'recruit') {
      setPick({ mode: 'node', node, kind: 'hero', options: recruitChoices(run, node) });
    } else if (kind === 'supply') {
      setPick({ mode: 'node', node, kind: 'card', options: supplyChoices(run, node) });
    } else {
      onBattle(node); // battle / elite / boss
    }
  };

  const resolveChoice = (id: CardId) => {
    if (!run || !pick || pick.mode !== 'node') return;
    let next = clearNode(run, pick.node.id);
    next = pick.kind === 'hero'
      ? { ...next, heroes: [...next.heroes, id] }
      : { ...next, deck: [...next.deck, id] };
    onUpdateRun(next);
    setPick(null);
    setSelectedId(null);
    if (!calm) setStampId(pick.node.id);
  };

  const abandon = useCallback(() => {
    setSelectedId(null);
    onUpdateRun(null);
  }, [onUpdateRun]);

  const legs = useMemo(() => (run ? routeLegs(run.nodes) : []), [run?.nodes]);
  // The legs a just-cleared stop opened draw themselves in.
  const drawIn = useMemo(() => new Set(
    stampId ? legs.filter((l) => l.from.id === stampId).map((l) => l.key) : [],
  ), [legs, stampId]);

  const creditBottom = isMobile ? (active ? slotH + 12 + 6 : 8) : 12;

  return (
    <div ref={rootRef} style={{
      position: 'fixed', inset: 0, overflow: 'clip',
      background: MAP_WATER, fontFamily: fonts.ui,
    }}>
      {/* Fixed HUD — siblings of the map, NOT children of it. A transformed
          ancestor mis-positions absolutely-placed descendants on fractional-
          DPR displays (and would trap the panels' own fixed sheets), so the
          docks and controls hang off this plain position:fixed root, and the
          dock slots themselves never carry a transform. They come first in
          the DOM so Tab reaches Back and the run panel before the 21 stops;
          the map's own stacking context keeps it underneath. */}
      {active && (
        <>
          <div data-hud="back" style={{ position: 'fixed', top: 12, left: 12, zIndex: 30 }}>
            <PosterButton variant="ink" size="sm" onClick={onExit} ariaLabel="Back to the title screen">
              ← Back
            </PosterButton>
          </div>

          {isMobile ? (
            <div ref={slotRef} data-dock="bottom" style={{
              position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 20,
              maxHeight: '62dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column',
            }}>
              {selected
                ? <StopCard run={run!} node={selected} compact onGo={() => go(selected)} onClose={() => setSelectedId(null)} />
                : <MemoRunPanel run={run!} compact onFocusStop={focusStop} onAbandon={abandon} />}
            </div>
          ) : (
            <>
              <div data-dock="run" style={{
                position: 'fixed', left: DOCK.edge, top: DOCK.top, width: DOCK.runW, zIndex: 20,
                maxHeight: 'calc(100dvh - 96px)', overflowY: 'auto', display: 'flex', flexDirection: 'column',
              }}>
                <MemoRunPanel run={run!} compact={false} onFocusStop={focusStop} onAbandon={abandon} />
              </div>
              <AnimatePresence onExitComplete={() => setHudEpoch((n) => n + 1)}>
                {selected && (
                  <motion.div key="card" data-dock="card"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    style={{
                      position: 'fixed', right: DOCK.edge, top: DOCK.top, width: DOCK.cardW, zIndex: 21,
                      maxHeight: 'calc(100dvh - 260px)', overflowY: 'auto', display: 'flex', flexDirection: 'column',
                    }}>
                    <StopCard run={run!} node={selected} compact={false} onGo={() => go(selected)} onClose={() => setSelectedId(null)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          <Controls camera={camera} onLocate={locate} style={{
            position: 'fixed', zIndex: 20,
            right: isMobile ? 12 : 16,
            bottom: creditBottom + CREDIT_H + 8,
          }} />
        </>
      )}

      {/* The map viewport — takes the gestures. The sheet inside is moved by
          one transform; the routes and stops are drawn over it in screen
          space from the same camera. */}
      <div
        ref={camera.viewportRef}
        style={{
          // Its own stacking context: the stops' z-order stays inside the map
          // and never climbs over the docks. Clipped, not hidden: a hidden
          // overflow is still a scroll container, and focusing a stop off
          // screen would scroll the whole map out from under the camera.
          position: 'absolute', inset: 0, zIndex: 0, overflow: 'clip',
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
          cursor: active ? 'grab' : 'default',
          pointerEvents: active ? 'auto' : 'none',
        }}
      >
        <MapLayer camera={camera} />
        {active && (
          <MapStage camera={camera} run={run!} legs={legs} drawIn={drawIn} hud={hud} selectedId={selectedId}
            stampId={stampId} calm={calm} onSelect={select} onKeyboardFocus={reveal} />
        )}
      </div>

      <OsmCredit style={{ position: 'fixed', right: isMobile ? 12 : 16, bottom: creditBottom, zIndex: 70 }} />

      <AnimatePresence>
        {!active && pick?.mode !== 'start' && (
          <StorySheet key="sheet" run={run}
            onBegin={() => setPick({ mode: 'start', options: randomStartingHeroes() })}
            onExit={onExit} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pick?.mode === 'start' && (
          <PickOverlay
            key="start"
            kind="hero"
            title="Choose your first hero"
            subtitle="Recruit more allies and build your deck as you fight uptown."
            options={pick.options}
            confirmVerb="Start with"
            onPick={startRun}
            onCancel={() => setPick(null)}
          />
        )}
        {pick?.mode === 'node' && (
          <PickOverlay
            key="node"
            kind={pick.kind}
            title={pick.kind === 'hero' ? 'Recruit a hero' : 'Take a supply'}
            subtitle={pick.kind === 'hero' ? 'Add one to your roster (up to four).' : 'Add one card to your deck.'}
            options={pick.options}
            confirmVerb={pick.kind === 'hero' ? 'Recruit' : 'Take'}
            onPick={resolveChoice}
            onCancel={() => setPick(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// The run panel is the heaviest thing docked on the map; it only needs to
// redraw when the run changes, not when the selection does.
const MemoRunPanel = memo(RunPanel);

/** Lay the 840×1080 sheet out at `raster` px per unit and move it with one
 *  transform. While the camera moves only the transform changes (cheap); once
 *  it rests, raster catches up with the zoom and the scale returns to exactly
 *  1, so the print is re-rasterised crisp. NycMap is memo'd and never
 *  re-renders here.
 *
 *  The detail band (`data-zoom`) follows the same committed raster scale, not
 *  the live zoom: a band change repaints the whole sheet (~100ms on a
 *  desktop), and it belongs with the re-layout at rest — detail that settles
 *  in a moment after the zoom stops is fine, a stall mid-gesture is not. */
function MapLayer({ camera }: { camera: MapCamera }) {
  const cam = useCamera(camera);
  const raster = useRaster(camera);
  const { frame } = camera;
  const k = cam.s / raster;
  const tx = Math.round(frame.w / 2 - cam.cx * cam.s);
  const ty = Math.round(frame.h / 2 - cam.cy * cam.s);
  return (
    <div
      data-map-layer
      data-zoom={lodBand(raster)}
      style={{
        position: 'absolute', left: 0, top: 0,
        width: MAP_W * raster, height: MAP_H * raster,
        transform: `translate3d(${tx}px, ${ty}px, 0) scale(${k})`,
        transformOrigin: '0 0',
        willChange: 'transform',
        // NycMap's line weights follow the square root of the zoom.
        ['--line' as string]: Math.sqrt(LINE_REF / raster),
      }}
    >
      <NycMap />
      {/* The paper's tooth, printed with the sheet (so it pans and zooms
          with it). */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: PAPER_MOTTLE,
        backgroundSize: `${200 * raster}px ${200 * raster}px`,
        mixBlendMode: 'multiply',
      }} />
    </div>
  );
}

/** Everything drawn from the live camera in screen space. */
function MapStage({ camera, run, legs, drawIn, hud, selectedId, stampId, calm, onSelect, onKeyboardFocus }: {
  camera: MapCamera;
  run: StoryRun;
  legs: ReturnType<typeof routeLegs>;
  drawIn: ReadonlySet<string>;
  hud: readonly Box[];
  selectedId: string | null;
  stampId: string | null;
  calm: boolean;
  onSelect: (node: StoryNode) => void;
  onKeyboardFocus: (node: StoryNode) => void;
}) {
  const cam = useCamera(camera);
  return (
    <>
      <RouteLines run={run} legs={legs} cam={cam} frame={camera.frame} drawIn={drawIn} calm={calm} />
      <StopLayer run={run} cam={cam} frame={camera.frame} hud={hud} selectedId={selectedId} stampId={stampId}
        calm={calm} onSelect={onSelect} onKeyboardFocus={onKeyboardFocus} />
    </>
  );
}

function Controls({ camera, onLocate, style }: {
  camera: MapCamera;
  onLocate: () => void;
  style: CSSProperties;
}) {
  const cam = useCamera(camera);
  const { min, max } = scaleLimits(camera.frame);
  return (
    <MapControls
      canZoomIn={cam.s < max - 1e-3}
      canZoomOut={cam.s > min + 1e-3}
      onZoomIn={() => camera.zoomBy(1.4)}
      onZoomOut={() => camera.zoomBy(1 / 1.4)}
      onLocate={onLocate}
      style={style}
    />
  );
}
