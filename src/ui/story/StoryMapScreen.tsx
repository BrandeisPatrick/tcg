import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CardId } from '@/engine/types';
import type { StoryRun, StoryNode, NodeKind } from '@/story/types';
import { CARDS_BY_ID } from '@/cards';
import { HeroBadge } from '@/cards/art/heroArt';
import {
  STARTING_HERO_CHOICES, recruitChoices, supplyChoices, nodeLabel,
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
  | { mode: 'start' }
  | { mode: 'node'; node: StoryNode; kind: 'hero' | 'card'; options: CardId[] }
  | null;

export function StoryMapScreen({ run, onUpdateRun, onBattle, onExit }: StoryMapScreenProps) {
  const [pick, setPick] = useState<PickState>(null);

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
      position: 'relative', minHeight: '100dvh', width: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#1a1206', padding: 18, fontFamily: fonts.ui, overflow: 'hidden',
    }}>
      <BackdropGlow />

      {/* Map panel — fixed 1200:700 aspect so the SVG map, edges and node
          buttons all share one coordinate space. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring.soft}
        style={{
          position: 'relative',
          width: 'min(94vw, 72dvh)',
          aspectRatio: '840 / 1080',
          borderRadius: 12,
          overflow: 'hidden',
          // Pale-wood frame, like the laser-cut original.
          border: '12px solid #c9ad74',
          boxShadow: '0 28px 80px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(90,64,22,0.5)',
          background: palette.bg0,
        }}
      >
        <NycMap />
        {run && run.status !== 'won' && run.status !== 'lost' && (
          <>
            <Edges run={run} />
            {run.nodes.map((n) => (
              <NodeMarker key={n.id} run={run} node={n} onClick={() => handleNode(n)} />
            ))}
            <RunHud run={run} onExit={onExit} />
          </>
        )}

        {/* Intro / start-of-run panel */}
        {(!run || run.status === 'lost' || run.status === 'won') && (
          <CenterPanel
            run={run}
            onBegin={() => setPick({ mode: 'start' })}
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
            options={STARTING_HERO_CHOICES}
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
          const color = live ? '#ffcf5a' : traversed ? '#6f96d6' : 'rgba(34,24,10,0.7)';
          return (
            <line key={a.id + bid}
              x1={a.x * 1000} y1={a.y * 1000} x2={b.x * 1000} y2={b.y * 1000}
              stroke={color} strokeWidth={live ? 4 : 2.8}
              strokeDasharray={live ? '0' : traversed ? '0' : '7 9'}
              strokeLinecap="round"
              opacity={live ? 0.95 : traversed ? 0.9 : 0.7}
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

/** Hover scouting text for a node — location name + what's there. */
function nodeTip(node: StoryNode): string {
  const place = node.name ? `${node.name} · ` : '';
  if (node.kind === 'recruit') return `${place}Recruit a hero`;
  if (node.kind === 'supply') return `${place}Supply cache`;
  const size = enemyRosterSize(node.depth, node.kind);
  const led = node.enemy ? ` · ${CARDS_BY_ID[node.enemy]?.name ?? ''}` : '';
  const kind = node.kind === 'boss' ? 'Boss' : 'Battle';
  return `${place}${kind} — ${size} foe${size > 1 ? 's' : ''}${led}`;
}

// ---- node marker -------------------------------------------------------------
function NodeMarker({ run, node, onClick }: { run: StoryRun; node: StoryNode; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const cleared = run.clearedNodeIds.includes(node.id);
  const current = run.currentNodeId === node.id;
  const reachable = isReachable(run, node);
  const size = node.kind === 'boss' ? 48 : node.kind === 'elite' ? 40 : 36;
  const accent = KIND_ACCENT[node.kind];

  const ring = current ? CURRENT_GOLD : reachable ? accent : cleared ? '#6b8f4a' : 'rgba(60,40,16,0.5)';
  const fill = current || reachable ? '#251a0c' : cleared ? '#2a2414' : '#1d160b';
  const iconColor = reachable || current ? '#f3e6c6' : cleared ? '#9db884' : 'rgba(180,150,100,0.55)';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={!reachable}
      aria-label={`${nodeLabel(node.kind)} (depth ${node.depth})`}
      style={{
        position: 'absolute',
        left: `${node.x * 100}%`, top: `${node.y * 100}%`,
        width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
        borderRadius: '50%',
        border: `2.5px solid ${ring}`,
        background: fill,
        boxShadow: reachable
          ? `0 0 0 4px ${accent}33, 0 6px 16px rgba(0,0,0,0.5)`
          : current ? `0 0 0 4px ${CURRENT_GOLD}33, 0 6px 16px rgba(0,0,0,0.5)`
          : '0 4px 12px rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: reachable ? 'pointer' : 'default',
        padding: 0,
        zIndex: hover ? 5 : 1,
      }}
    >
      {reachable && (
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
      <NodeIcon kind={cleared && !current ? 'cleared' : node.kind} color={iconColor} size={size * 0.5} />

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
          >{nodeTip(node)}</motion.span>
        )}
      </AnimatePresence>

      {/* Always-on location name so the routes read at a glance. */}
      {node.name && (
        <span style={{
          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
          marginTop: 3, whiteSpace: 'nowrap', pointerEvents: 'none',
          fontFamily: fonts.ui, fontSize: 9.5, fontWeight: 700, color: '#fbf4e4',
          textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.95)',
          opacity: reachable || current || cleared ? 1 : 0.7,
        }}>{node.name}</span>
      )}
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
function RunHud({ run, onExit }: { run: StoryRun; onExit: () => void }) {
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
