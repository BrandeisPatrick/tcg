import { useState, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CardId } from '@/engine/types';
import type { StoryRun, StoryNode, NodeKind } from '@/story/types';
import { CARDS_BY_ID } from '@/cards';
import { HeroBadge } from '@/cards/art/heroArt';
import {
  randomStartingHeroes, recruitChoices, supplyChoices, nodeLabel,
  enemyRosterSize, enemyBuff,
} from '@/story/content';
import { newRun, clearNode, isReachable } from '@/story/storyRun';
import { palette, fonts, text, spring, shadow, radius } from '../tokens';
import { NycMap } from './NycMap';
import { PickOverlay } from './PickOverlay';

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

// The map's intrinsic coordinate space (node x/y are normalised against this).
const MAP_W = 840, MAP_H = 1080;
// Zoom = "cover the screen" × this multiplier (1 = exactly fills). Adjustable
// in-game via the +/− buttons, clamped to [ZOOM_MIN, ZOOM_MAX].
const ZOOM_INITIAL = 1.7, ZOOM_MIN = 1, ZOOM_MAX = 3.2, ZOOM_STEP = 1.3;

export function StoryMapScreen({ run, onUpdateRun, onBattle, onExit }: StoryMapScreenProps) {
  const [pick, setPick] = useState<PickState>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The map is interactive (draggable, nodes shown) only during an active run.
  const active = !!run && run.status !== 'won' && run.status !== 'lost';
  const [zoom, setZoom] = useState(ZOOM_INITIAL);

  // Measure the frame so we can give the pannable world EXPLICIT drag bounds.
  // (Framer's ref-based dragConstraints mis-measures a child larger than the
  // ref and snaps it back to centre — numeric bounds pan reliably.) The world
  // is centred and MAP_ZOOM× the frame, so it overflows half the excess on each
  // side: that half-excess is exactly the allowed pan distance per axis.
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Size the map world to COVER the full-screen frame (like background cover),
  // then multiply by the current zoom. Keeping the world at the map's native
  // aspect is what keeps the nodes aligned to the city. Pan range = half the
  // overflow.
  const cover = frame.w && frame.h ? Math.max(frame.w / MAP_W, frame.h / MAP_H) : 0;
  const scale = cover * zoom;
  const worldW = MAP_W * scale, worldH = MAP_H * scale;
  const panX = Math.max(0, (worldW - frame.w) / 2);
  const panY = Math.max(0, (worldH - frame.h) / 2);

  // Manual drag-to-pan (own pointer handlers rather than Framer's drag, which is
  // finicky and hard to verify). A small threshold distinguishes a pan from a
  // node tap, so clicking a node still works.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);
  const clampPan = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  const onPointerDown = (e: React.PointerEvent) => {
    if (!active) return;
    drag.current = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* non-active pointer */ }
    }
    if (d.moved) setPan({ x: clampPan(d.ox + dx, panX), y: clampPan(d.oy + dy, panY) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current?.moved) { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* */ } }
    drag.current = null;
  };

  // Zoom buttons: scale the multiplier and scale the pan offset by the same
  // ratio so the screen-centre map point stays put, then re-clamp to new bounds.
  const applyZoom = (factor: number) => {
    const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
    if (nz === zoom) return;
    const ns = cover * nz;
    const nPanX = Math.max(0, (MAP_W * ns - frame.w) / 2);
    const nPanY = Math.max(0, (MAP_H * ns - frame.h) / 2);
    const ratio = nz / zoom;
    setZoom(nz);
    setPan((p) => ({ x: clampPan(p.x * ratio, nPanX), y: clampPan(p.y * ratio, nPanY) }));
  };

  const startRun = (hero: CardId) => { onUpdateRun(newRun(hero)); setPick(null); };

  const handleNode = (node: StoryNode) => {
    if (!run || !isReachable(run, node)) return;
    // Roster full → a recruit node hands out supplies instead of a 5th hero.
    const kind: NodeKind = node.kind === 'recruit' && run.heroes.length >= 4 ? 'supply' : node.kind;
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
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#1a1206', fontFamily: fonts.ui, overflow: 'hidden',
    }}>
      <BackdropGlow />

      {/* Full-screen map viewport — the world inside is sized to cover this and
          is dragged around; the viewport clips (overflow hidden). */}
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={spring.soft}
        style={{
          position: 'absolute', inset: 0,
          overflow: 'hidden',
          background: palette.bg0,
          touchAction: 'none', // let the drag handler own touch panning
        }}
      >
        {/* Pannable, zoomed-in world: the city map, route edges and node markers
            live here, rendered MAP_ZOOM× larger than the frame so the nodes are
            well-separated. Drag to move around; the frame clips (overflow hidden). */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            position: 'absolute',
            width: worldW, height: worldH,
            left: (frame.w - worldW) / 2, top: (frame.h - worldH) / 2,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
            cursor: active ? 'grab' : 'default',
            touchAction: 'none',
          }}
        >
          <NycMap />
          {active && (
            <>
              <Edges run={run!} />
              {run!.nodes.map((n) => (
                <NodeMarker key={n.id} run={run!} node={n} onClick={() => handleNode(n)} />
              ))}
            </>
          )}
        </div>
      </motion.div>

      {/* Fixed overlays — siblings of the map panel, NOT children of it. Framer
          applies a compositing transform to the motion.div panel, and a
          transformed ancestor mis-positions absolutely-placed descendants on
          fractional-DPR displays (the map's world div escapes only because it has
          its own translate3d). Anchoring the HUD/zoom/intro to the plain
          position:fixed root instead keeps them pinned to the real corners. */}
      {active && (
        <RunHud run={run!} onExit={onExit} onAbandon={() => onUpdateRun(null)} />
      )}

      {/* Zoom controls — bottom-right corner, fixed (not pannable). */}
      {active && (
        <div style={{
          position: 'absolute', right: 14, bottom: 14, zIndex: 6,
          display: 'flex', flexDirection: 'column', gap: 8,
          // Own compositing layer → correct corner paint even on fractional-DPR
          // displays (matches the map world div, which never mis-positions).
          transform: 'translateZ(0)',
        }}>
          <ZoomBtn label="+" title="Zoom in" onClick={() => applyZoom(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX - 1e-3} />
          <ZoomBtn label="−" title="Zoom out" onClick={() => applyZoom(1 / ZOOM_STEP)} disabled={zoom <= ZOOM_MIN + 1e-3} />
        </div>
      )}

      {/* Intro / start-of-run panel */}
      {(!run || run.status === 'lost' || run.status === 'won') && (
        <CenterPanel
          run={run}
          onBegin={() => setPick({ mode: 'start', options: randomStartingHeroes() })}
          onExit={onExit}
        />
      )}

      <AnimatePresence>
        {pick?.mode === 'start' && (
          <PickOverlay
            kind="hero"
            title="Choose your first hero"
            subtitle="Recruit more allies and build your deck as you fight uptown."
            options={pick.options}
            onPick={startRun}
            onCancel={() => setPick(null)}
          />
        )}
        {pick?.mode === 'node' && (
          <PickOverlay
            kind={pick.kind}
            title={pick.kind === 'hero' ? 'Recruit a hero' : 'Take a supply'}
            subtitle={pick.kind === 'hero' ? 'Add one to your roster (up to four).' : 'Add one card to your deck.'}
            options={pick.options}
            onPick={resolveChoice}
            onCancel={() => setPick(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- map edges ---------------------------------------------------------------
function Edges({ run }: { run: StoryRun }) {
  const byId = new Map(run.nodes.map((n) => [n.id, n]));
  return (
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {run.nodes.flatMap((a) =>
        a.next.map((bid) => {
          const b = byId.get(bid);
          if (!b) return null;
          const live = run.clearedNodeIds.includes(a.id) && isReachable(run, b);
          const traversed = run.clearedNodeIds.includes(a.id) && run.clearedNodeIds.includes(bid);
          // Edges into not-yet-available ground are grey (the route is visible
          // but clearly locked).
          const color = live ? '#ffcf5a' : traversed ? '#6f96d6' : 'rgba(70,62,48,0.5)';
          return (
            <line key={a.id + bid}
              x1={a.x * 1000} y1={a.y * 1000} x2={b.x * 1000} y2={b.y * 1000}
              stroke={color} strokeWidth={live ? 2.2 : 1.4}
              strokeDasharray={live ? '0' : traversed ? '0' : '6 9'}
              strokeLinecap="round"
              opacity={live ? 0.95 : traversed ? 0.85 : 0.5}
              style={live ? { filter: 'drop-shadow(0 0 4px rgba(255,200,90,0.85))' } : undefined}
            />
          );
        }),
      )}
    </svg>
  );
}

// Per-kind accent so the map reads at a glance (reachable rings + hover chips).
const KIND_ACCENT: Record<NodeKind, string> = {
  battle: palette.danger,     // wine
  elite: palette.spirit,      // plum
  recruit: palette.success,   // forest
  supply: palette.accent,     // brass
  boss: '#e6b94a',            // gold
};
const CURRENT_GOLD = '#e6b94a';

/** Hover scouting text for a node — location name + what's there. `kind` is the
 *  effective kind (a recruit becomes a supply once the roster is full). */
function nodeTip(node: StoryNode, kind: NodeKind): string {
  const place = node.name ? `${node.name} · ` : '';
  if (kind === 'recruit') return `${place}Recruit a hero`;
  if (kind === 'supply') return `${place}Supply cache`;
  const size = enemyRosterSize(node.depth, node.kind);
  const led = node.enemy ? ` · ${CARDS_BY_ID[node.enemy]?.name ?? ''}` : '';
  return `${place}${kind === 'boss' ? 'Boss' : 'Battle'} — ${size} foe${size > 1 ? 's' : ''}${led}`;
}

// ---- node marker -------------------------------------------------------------
/** Beveled-metal palette for the medallion body, keyed by state/kind. hi = top
 *  highlight, mid = body, lo = lower shade, rim = edge stroke. */
type Metal = { hi: string; mid: string; lo: string; rim: string };
const KIND_METAL: Record<NodeKind, Metal> = {
  battle:  { hi: '#c2ccd6', mid: '#737e8a', lo: '#3a424c', rim: '#23282f' }, // gunmetal
  elite:   { hi: '#d9b8e0', mid: '#8a5a9a', lo: '#46294e', rim: '#2c1834' }, // plum steel
  recruit: { hi: '#c4e0a2', mid: '#5e8442', lo: '#2e4422', rim: '#1c2c16' }, // forest bronze
  supply:  { hi: '#ffe7a6', mid: '#d2a23e', lo: '#7a5410', rim: '#503709' }, // brass
  boss:    { hi: '#ffe9ad', mid: '#e0b24c', lo: '#8a5e16', rim: '#5a3d0c' }, // rich gold
};
const GOLD_METAL: Metal    = { hi: '#ffeeb5', mid: '#e6b94a', lo: '#8a5e16', rim: '#5a3d0c' }; // current
const CLEARED_METAL: Metal = { hi: '#a9d2b4', mid: '#5e8e6e', lo: '#2e4a38', rim: '#1c3024' }; // verdigris
const LOCKED_METAL: Metal  = { hi: '#cfc9bc', mid: '#a39c8c', lo: '#736c5c', rim: '#5a5446' }; // pale dormant stone — recedes into the map

function NodeMarker({ run, node, onClick }: { run: StoryRun; node: StoryNode; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const cleared = run.clearedNodeIds.includes(node.id);
  const current = run.currentNodeId === node.id;
  const reachable = isReachable(run, node);
  const muted = !reachable && !current && !cleared;
  const effKind: NodeKind = node.kind === 'recruit' && run.heroes.length >= 4 ? 'supply' : node.kind;
  const size = effKind === 'boss' ? 50 : effKind === 'elite' ? 42 : 38;
  const accent = KIND_ACCENT[effKind];
  const pulse = reachable;

  // The medallion's metal finish reads its state at a glance: brass for "you
  // are here", vivid kind-metal when reachable, verdigris-tarnished when done,
  // faded grey when locked.
  const metal: Metal = current ? GOLD_METAL : cleared ? CLEARED_METAL : muted ? LOCKED_METAL : KIND_METAL[effKind];
  const emblem = cleared && !current ? 'cleared' : effKind;
  const emblemColor = muted ? '#8f897c' : cleared && !current ? '#d6efdd' : '#f3e6c6';

  const combat = effKind === 'battle' || effKind === 'elite' || effKind === 'boss';
  const foes = combat ? enemyRosterSize(node.depth, node.kind) : 0;
  const showBadge = combat && (reachable || current) && foes > 0;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={!reachable}
      aria-label={`${node.name ?? nodeLabel(node.kind)}`}
      style={{
        position: 'absolute',
        left: `${node.x * 100}%`, top: `${node.y * 100}%`,
        width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
        border: 'none', background: 'none', padding: 0,
        cursor: reachable ? 'pointer' : 'default',
        opacity: muted ? 0.5 : 1,
        zIndex: hover ? 6 : current ? 3 : 1,
        // hover lift handled by transform so the medallion feels picked up
        transform: hover && reachable ? 'translateY(-2px)' : 'none',
        transition: 'transform 140ms cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {/* Ground shadow — anchors the medallion onto the map. */}
      <span aria-hidden style={{
        position: 'absolute', left: '50%', bottom: -size * 0.16, transform: 'translateX(-50%)',
        width: size * 0.78, height: size * 0.22, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(0,0,0,0.5), rgba(0,0,0,0) 70%)',
        pointerEvents: 'none',
      }} />

      {/* Pulse — only on actionable nodes. */}
      {pulse && (
        <motion.span
          aria-hidden
          animate={{ scale: [1, 1.4], opacity: [0.45, 0] }}
          transition={{ duration: 1.7, repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: -2, borderRadius: '50%', border: `2px solid ${accent}` }}
        />
      )}

      {/* Medallion body — beveled metal ring. */}
      <span style={{
        position: 'relative', width: '100%', height: '100%', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(155deg, ${metal.hi}, ${metal.mid} 48%, ${metal.lo})`,
        border: `1.5px solid ${metal.rim}`,
        boxShadow: `inset 0 2px 2px rgba(255,255,255,0.45), inset 0 -3px 5px rgba(0,0,0,0.5), 0 5px 12px rgba(0,0,0,0.5)`
          // Actionable nodes get a soft colored halo + thin ring so "you are
          // here" and "you can go here" pop against the busy map at a glance.
          + ((pulse || current) ? `, 0 0 13px 1px ${(current ? CURRENT_GOLD : accent)}88, 0 0 0 2px ${(current ? CURRENT_GOLD : accent)}55` : ''),
      }}>
        {/* Recessed inner disc the emblem is struck into. */}
        <span style={{
          width: '72%', height: '72%', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 36%, #2b2218, #15100a)',
          border: `1px solid ${metal.rim}`,
          boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.75), inset 0 -1px 1px rgba(255,255,255,0.06)',
        }}>
          <span aria-hidden style={{ display: 'flex', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))' }}>
            <NodeIcon kind={emblem} color={emblemColor} size={size * 0.56} />
          </span>
        </span>
      </span>

      {/* Foe-count badge — a small struck coin (no "N foes" text). */}
      {showBadge && (
        <span aria-hidden style={{
          position: 'absolute', right: -3, bottom: -3,
          minWidth: 17, height: 17, padding: '0 3px', borderRadius: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 35%, #241a0f, #120c06)',
          border: `1.5px solid ${metal.mid}`,
          color: '#f3e6c6', fontFamily: fonts.ui, fontWeight: 800, fontSize: 10, lineHeight: 1,
          boxShadow: '0 1px 3px rgba(0,0,0,0.6)',
        }}>{foes}</span>
      )}

      {/* Name + scouting details — on hover only (keeps the harbour uncluttered). */}
      <AnimatePresence>
        {hover && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
              marginBottom: 9, whiteSpace: 'nowrap', pointerEvents: 'none',
              background: 'rgba(18,11,3,0.95)', border: `1px solid ${current ? CURRENT_GOLD : accent}`,
              color: palette.bg1, padding: '5px 10px', borderRadius: radius.md,
              fontFamily: fonts.ui, fontSize: 11, fontWeight: 700,
              boxShadow: shadow.md,
            }}
          >{nodeTip(node, effKind)}</motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

// ---- node icons --------------------------------------------------------------
function NodeIcon({ kind, color, size }: { kind: NodeKind | 'cleared'; color: string; size: number }) {
  const sw = 2;
  const c = { stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (kind) {
    case 'cleared':
      return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" {...c} strokeWidth={3} /></svg>;
    case 'battle':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path d="M4 4l11 11M15 13l3 3-2 2-3-3M20 4L9 15M9 11l-3 3 2 2 3-3" {...c} />
        </svg>
      );
    case 'elite':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.3 7.2 18.7l.9-5.4L4.2 8.7l5.4-.8z" {...c} fill={color} />
        </svg>
      );
    case 'recruit':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <circle cx="10" cy="8" r="3.4" {...c} />
          <path d="M4.5 19c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" {...c} />
          <path d="M18.5 6.5v5M16 9h5" {...c} />
        </svg>
      );
    case 'supply':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <rect x="4" y="9" width="16" height="10" rx="1.5" {...c} />
          <path d="M4 9l2.5-4h11L20 9M12 9v10" {...c} />
          <rect x="10.5" y="11.5" width="3" height="3" rx="0.6" {...c} fill={color} />
        </svg>
      );
    case 'boss':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path d="M4 18h16M4 18l-1-9 5 4 4-7 4 7 5-4-1 9z" {...c} fill={color} />
        </svg>
      );
  }
}

// ---- run HUD -----------------------------------------------------------------
function RunHud({ run, onExit, onAbandon }: { run: StoryRun; onExit: () => void; onAbandon: () => void }) {
  const bosses = run.nodes.filter((n) => n.kind === 'boss');
  const bossesDown = bosses.filter((b) => run.clearedNodeIds.includes(b.id)).length;
  return (
    <>
      <button
        onClick={onExit}
        aria-label="Back to menu"
        style={{
          position: 'absolute', top: 14, left: 14, width: 38, height: 38, borderRadius: '50%',
          background: 'rgba(18,11,3,0.9)', border: `1.5px solid ${palette.accent}`,
          color: palette.bg1, cursor: 'pointer', fontSize: 18, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: 'translateZ(0)',
        }}
      >‹</button>

      <button
        onClick={onAbandon}
        aria-label="Abandon run and start over"
        style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(18,11,3,0.9)', border: `1.5px solid ${palette.danger}`,
          color: palette.bg1, cursor: 'pointer', borderRadius: radius.pill,
          padding: '8px 16px', fontFamily: fonts.ui, fontSize: 12, fontWeight: 700,
          transform: 'translateZ(0)',
        }}
      >Abandon Run</button>

      <div style={{
        position: 'absolute', left: 14, bottom: 14,
        display: 'flex', alignItems: 'center', gap: 14,
        // Near-solid so the tan map underneath can't bleed through and wash out
        // the text contrast.
        background: 'rgba(16,10,3,0.94)', border: `1px solid ${palette.borderStrong}`,
        borderRadius: radius.pill, padding: '7px 16px 7px 10px',
        boxShadow: shadow.md, transform: 'translateZ(0)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {run.heroes.map((id, i) => (
            <div key={id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: '50%', border: `2px solid #120b03` }}>
              <HeroBadge cardId={id} size={30} />
            </div>
          ))}
          {Array.from({ length: Math.max(0, 4 - run.heroes.length) }).map((_, i) => (
            <div key={`e${i}`} style={{
              marginLeft: -8, width: 30, height: 30, borderRadius: '50%',
              border: `2px dashed rgba(176,120,37,0.5)`, background: 'rgba(0,0,0,0.25)',
            }} />
          ))}
        </div>
        <Stat label="Deck" value={`${run.deck.length}`} />
        <Stat label="Bosses" value={`${bossesDown}/${bosses.length}`} />
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 40 }}>
      <span style={{ fontFamily: fonts.ui, fontSize: 16, fontWeight: 700, color: palette.bg1, lineHeight: 1 }}>{value}</span>
      <span style={{ fontFamily: fonts.ui, fontSize: 10, fontWeight: 600, color: 'rgba(240,226,194,0.82)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>{label}</span>
    </div>
  );
}

function ZoomBtn({ label, title, onClick, disabled }: { label: string; title: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
      style={{
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(18,11,3,0.9)', border: `1.5px solid ${palette.accent}`,
        color: palette.bg1, cursor: disabled ? 'default' : 'pointer',
        fontSize: 24, fontWeight: 700, lineHeight: 1, paddingBottom: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.4 : 1, boxShadow: shadow.md, userSelect: 'none',
      }}
    >{label}</button>
  );
}

// ---- center panel (intro / win / loss) --------------------------------------
function CenterPanel({ run, onBegin, onExit }: { run: StoryRun | null; onBegin: () => void; onExit: () => void }) {
  const won = run?.status === 'won';
  const lost = run?.status === 'lost';
  const title = won ? 'The City Is Yours' : lost ? 'Outflanked' : 'Streets of New York';
  const body = won
    ? 'You toppled the rival Patron and claimed the city. A new run awaits.'
    : lost
      ? 'Your run ends in the gutters of the old city. Regroup and try again.'
      : 'A roguelike campaign. Begin with a single hero, recruit allies, build your deck, and fight uptown to the rival Patron — who grows stronger with every block.';
  const cta = won ? 'New Run' : lost ? 'Try Again' : 'Enter the City';
  const tone = won ? palette.success : lost ? palette.danger : palette.accent;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center',
        background: 'radial-gradient(ellipse at 50% 45%, rgba(20,12,2,0.55), rgba(20,12,2,0.82))',
        padding: 32,
      }}
    >
      <motion.h1
        initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.soft}
        style={{ fontFamily: fonts.display, fontSize: 'clamp(28px, 5vw, 48px)', color: tone, margin: 0, letterSpacing: '0.03em', textShadow: '0 3px 18px rgba(0,0,0,0.6)' }}
      >{title}</motion.h1>
      <p style={{ ...text.body, color: palette.bg1, maxWidth: 460, margin: 0 }}>{body}</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button
          onClick={onBegin}
          style={{
            background: `linear-gradient(180deg, ${tone}, ${tone}aa)`, color: '#fff7e8',
            padding: '13px 34px', border: 'none', borderRadius: radius.pill,
            fontFamily: fonts.display, fontSize: 15, letterSpacing: '0.06em',
            cursor: 'pointer', boxShadow: shadow.lg,
          }}
        >{cta}</button>
        <button
          onClick={onExit}
          style={{
            background: 'transparent', color: palette.bg1, padding: '13px 26px',
            border: `1px solid ${palette.textFaint}`, borderRadius: radius.pill,
            fontFamily: fonts.ui, fontSize: 13, cursor: 'pointer',
          }}
        >Menu</button>
      </div>
    </motion.div>
  );
}

function BackdropGlow() {
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(176,120,37,0.10), transparent 70%)',
    }} />
  );
}
