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
// Extra zoom ON TOP of "cover the screen", so nodes spread out and there's room
// to drag around. 1 = exactly fills the screen; higher = more zoomed.
const MAP_ZOOM = 1.7;

export function StoryMapScreen({ run, onUpdateRun, onBattle, onExit }: StoryMapScreenProps) {
  const [pick, setPick] = useState<PickState>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The map is interactive (draggable, nodes shown) only during an active run.
  const active = !!run && run.status !== 'won' && run.status !== 'lost';

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
  // then multiply by MAP_ZOOM. Keeping the world at the map's native aspect is
  // what keeps the nodes aligned to the city. Pan range = half the overflow.
  const cover = frame.w && frame.h ? Math.max(frame.w / MAP_W, frame.h / MAP_H) : 0;
  const scale = cover * MAP_ZOOM;
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
            well-separated. Drag to move around; the frame clips (overflow hidden).
            The HUD / intro panel below sit OUTSIDE this and stay fixed. */}
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

        {/* Fixed overlays (do NOT pan with the map). */}
        {active && (
          <RunHud run={run!} onExit={onExit} onAbandon={() => onUpdateRun(null)} />
        )}

        {/* Intro / start-of-run panel */}
        {(!run || run.status === 'lost' || run.status === 'won') && (
          <CenterPanel
            run={run}
            onBegin={() => setPick({ mode: 'start', options: randomStartingHeroes() })}
            onExit={onExit}
          />
        )}
      </motion.div>

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
              stroke={color} strokeWidth={live ? 4 : 2.4}
              strokeDasharray={live ? '0' : traversed ? '0' : '7 10'}
              strokeLinecap="round"
              opacity={live ? 0.95 : traversed ? 0.9 : 0.55}
              style={live ? { filter: 'drop-shadow(0 0 6px rgba(255,200,90,0.9))' } : undefined}
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
function NodeMarker({ run, node, onClick }: { run: StoryRun; node: StoryNode; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const cleared = run.clearedNodeIds.includes(node.id);
  const current = run.currentNodeId === node.id;
  const reachable = isReachable(run, node);
  // Unavailable spots (locked — not reachable, not done) are greyed out so only
  // what you can act on stands out.
  const muted = !reachable && !current && !cleared;
  // A recruit becomes a supply pick once the roster is full — reflect that in
  // the icon/label/tooltip so the map matches what the click will do.
  const effKind: NodeKind = node.kind === 'recruit' && run.heroes.length >= 4 ? 'supply' : node.kind;
  const size = effKind === 'boss' ? 48 : effKind === 'elite' ? 40 : 36;
  const accent = KIND_ACCENT[effKind];

  const ring = current ? CURRENT_GOLD : reachable ? accent : cleared ? '#6b8f4a' : 'rgba(124,114,94,0.55)';
  const fill = muted ? '#23201a' : current || reachable ? '#251a0c' : '#2a2414';
  const iconColor = muted ? 'rgba(150,142,120,0.5)'
    : reachable || current ? '#f3e6c6' : '#9db884';
  const pulse = reachable;
  // Only the actionable (reachable) nodes get a name label — cleared/locked
  // nodes are name-on-hover, which keeps the busy harbour readable.
  const showLabel = !!node.name && reachable;

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
        borderRadius: '50%',
        border: `2.5px solid ${ring}`,
        background: fill,
        boxShadow: pulse
          ? `0 0 0 4px ${accent}33, 0 6px 16px rgba(0,0,0,0.5)`
          : current ? `0 0 0 4px ${CURRENT_GOLD}33, 0 6px 16px rgba(0,0,0,0.5)`
          : '0 4px 12px rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: reachable ? 'pointer' : 'default',
        padding: 0,
        opacity: muted ? 0.5 : 1,
        zIndex: hover ? 5 : 1,
      }}
    >
      {pulse && (
        <motion.span
          aria-hidden
          animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            border: `2px solid ${accent}`,
          }}
        />
      )}
      <NodeIcon kind={cleared && !current ? 'cleared' : effKind} color={iconColor} size={size * 0.5} />

      <AnimatePresence>
        {hover && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
              marginBottom: 8, whiteSpace: 'nowrap', pointerEvents: 'none',
              background: 'rgba(18,11,3,0.95)', border: `1px solid ${accent}`,
              color: palette.bg1, padding: '5px 10px', borderRadius: radius.md,
              fontFamily: fonts.ui, fontSize: 11, fontWeight: 700,
              boxShadow: shadow.md,
            }}
          >{nodeTip(node, effKind)}</motion.span>
        )}
      </AnimatePresence>

      {/* Location name + a scouting sub-line (foe count & enemy for fights) —
          only for actionable nodes. The sub-line is touch-friendly: no hover
          needed on iPad. A dark chip keeps it legible over streets/water. */}
      {showLabel && (() => {
        const combat = effKind === 'battle' || effKind === 'elite' || effKind === 'boss';
        const foes = combat ? enemyRosterSize(node.depth, node.kind) : 0;
        const enemyName = node.enemy ? CARDS_BY_ID[node.enemy]?.name : undefined;
        const sub = combat
          ? `${foes} foe${foes > 1 ? 's' : ''}${enemyName ? ` · ${enemyName}` : ''}`
          : effKind === 'recruit' ? 'recruit a hero' : 'supply cache';
        return (
          <span style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            marginTop: 4, whiteSpace: 'nowrap', pointerEvents: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
            background: 'rgba(12,14,20,0.7)', padding: '2px 7px', borderRadius: 4,
            textShadow: '0 1px 2px rgba(0,0,0,0.9)',
          }}>
            <span style={{ fontFamily: fonts.ui, fontSize: 10, fontWeight: 700, color: '#fbf4e4' }}>{node.name}</span>
            <span style={{ fontFamily: fonts.ui, fontSize: 8.5, fontWeight: 700, color: combat ? '#e89a86' : '#bfe6ff' }}>{sub}</span>
          </span>
        );
      })()}
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
          background: 'rgba(18,11,3,0.78)', border: `1.5px solid ${palette.accent}`,
          color: palette.bg1, cursor: 'pointer', fontSize: 18, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >‹</button>

      <button
        onClick={onAbandon}
        aria-label="Abandon run and start over"
        style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(18,11,3,0.78)', border: `1.5px solid ${palette.danger}`,
          color: palette.bg1, cursor: 'pointer', borderRadius: radius.pill,
          padding: '8px 16px', fontFamily: fonts.ui, fontSize: 12, fontWeight: 700,
        }}
      >Abandon Run</button>

      <div style={{
        position: 'absolute', left: 14, bottom: 14,
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'rgba(18,11,3,0.82)', border: `1px solid ${palette.borderStrong}`,
        borderRadius: radius.pill, padding: '7px 16px 7px 10px',
        boxShadow: shadow.md,
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
      <span style={{ fontFamily: fonts.ui, fontSize: 9, color: palette.textFaint, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</span>
    </div>
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
