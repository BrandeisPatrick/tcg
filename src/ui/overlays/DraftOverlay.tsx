// Pre-match draft overlay — Deadlock's own draft-lobby composition:
//
//   ▸ a dark dial-and-halftone ground, the focused hero's splash bleeding
//     through it out of focus
//   ▸ the rival's picks along a red bar across the top (card backs for the
//     picks still to come; the next one pulses while the AI thinks)
//   ▸ the full hero roster as a fixed grid of portrait tiles — taken heroes
//     stay in place, dimmed and framed in their owner's colour, so the grid
//     never reshuffles under the cursor
//   ▸ a one-line dossier for whichever hero is focused
//   ▸ YOUR team as four numbered tarot-style cards; the slot being drafted
//     previews the focused hero in green, locked picks turn gold
//   ▸ a chamfered LOCK button (Enter works too) — the one true "draft" trigger
//
// Snake order is driven by the engine; this overlay only dispatches
// draftPick when it's the local player's turn.

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DraftState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID, HEROES } from '@/cards';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { heroArtFocus } from '@/cards/art/heroArt';
import { fonts, spring, text } from '../tokens';
import { poster, chamfer } from '../poster';
import { getMatchConfig } from '@/storage/matchConfig';
import { useViewport } from '../hooks/useViewport';

interface Props {
  draft: DraftState;
  currentPlayer: PlayerID;
  me: PlayerID;
  onPick: (heroId: string) => void;
}

const HERO_IMG_BASE = `${import.meta.env.BASE_URL ?? '/'}heroes/`;

// Lobby palette — ink ground, cream type, and the three state colours the
// mockup uses on card frames: gold for locked, green for the live pick,
// red for the rival.
const lobby = {
  ground: poster.ground,
  panel: poster.panel,
  edge: poster.edge,
  cream: poster.cream,
  dim: poster.creamDim,
  faint: poster.creamFaint,
  gold: poster.gold,
  green: poster.green,
  red: poster.red,
} as const;

const NUMERALS = ['I', 'II', 'III', 'IV'];

export function DraftOverlay({ draft, currentPlayer, me, onPick }: Props) {
  // The roster grid + four cards need real width; below this everything
  // stacks tighter and the page may scroll.
  const { width } = useViewport();
  const isMobile = width < 860;
  const myTurn = currentPlayer === me && draft.order[draft.currentIndex] === me;
  const aiTurn = !myTurn && draft.currentIndex < draft.order.length;
  const complete = draft.currentIndex >= draft.order.length;
  const myPicks = draft.picks[me];
  const oppId: PlayerID = me === '0' ? '1' : '0';
  const oppPicks = draft.picks[oppId];
  const pool = draft.pool;

  // Fixed roster order (data order) so tiles never move; ownership of taken
  // heroes comes from the pick lists.
  const roster = useMemo(() => HEROES.map((h) => h.id), []);
  const owner = useMemo(() => {
    const m = new Map<string, 'me' | 'rival'>();
    myPicks.forEach((id) => m.set(id, 'me'));
    oppPicks.forEach((id) => m.set(id, 'rival'));
    return m;
  }, [myPicks, oppPicks]);

  // Focused hero — previewed in the live card + dossier. Defaults to the
  // first available hero; if the focused one gets taken, fall back.
  const [focused, setFocused] = useState<string | null>(null);
  useEffect(() => {
    if (!focused || !pool.includes(focused)) {
      setFocused(roster.find((id) => pool.includes(id)) ?? null);
    }
  }, [pool, focused, roster]);

  const lock = () => {
    if (myTurn && focused && pool.includes(focused)) onPick(focused);
  };

  // Auto-draft: when it's our turn and a preferred hero is available, pick
  // it automatically after a brief beat (the live card announces it).
  const [autoName, setAutoName] = useState<string | null>(null);
  const autoPickedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!myTurn) return;
    const prefs = getMatchConfig().heroPreferences.filter(Boolean) as string[];
    const nextPref = prefs.find((id) => pool.includes(id) && !autoPickedRef.current.has(id));
    if (!nextPref) return;
    setFocused(nextPref);
    setAutoName(CARDS_BY_ID[nextPref]?.name ?? nextPref);
    const t = setTimeout(() => {
      autoPickedRef.current.add(nextPref);
      setAutoName(null);
      onPick(nextPref);
    }, 700);
    return () => clearTimeout(t);
  }, [myTurn, pool, onPick]);

  // Enter locks the focused hero — the lobby's "LOCK" key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      lock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const preferred = useMemo(
    () => (getMatchConfig().heroPreferences.filter(Boolean) as string[]).slice(0, 4),
    [],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: lobby.ground,
        color: lobby.cream,
        fontFamily: fonts.ui,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 95,
        padding: isMobile ? '12px 12px 14px' : 'clamp(14px, 2.4vh, 24px) clamp(18px, 3vw, 44px) clamp(12px, 2vh, 20px)',
        gap: isMobile ? 12 : 'clamp(10px, 1.8vh, 18px)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <LobbyBackdrop focused={focused} />

      {/* Header row — pick counter left, status capsule docked beside the
          system gear on the right. */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingRight: isMobile ? 52 : 60,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: isMobile ? 10 : 18 }}>
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: isMobile ? 20 : 26,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: lobby.cream,
              lineHeight: 1,
            }}
          >
            Draft
          </span>
          <span style={{ ...text.label, fontSize: isMobile ? 10 : 11, letterSpacing: isMobile ? '0.18em' : '0.3em', color: lobby.dim, whiteSpace: 'nowrap' }}>
            {complete ? 'Complete' : `${draft.currentIndex + 1}/${draft.order.length}`}
          </span>
        </div>
        <StatusCapsule
          tone={myTurn ? 'green' : aiTurn ? 'red' : 'dim'}
          pulse={aiTurn}
          label={myTurn ? 'Your pick' : aiTurn ? (isMobile ? 'Rival…' : 'Rival picking…') : 'Complete'}
          compact={isMobile}
        />
      </div>

      <PickStrips mine={myPicks} rival={oppPicks} myTurn={myTurn} aiTurn={aiTurn} compact={isMobile} />

      {/* Roster + preferred cluster */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          gap: isMobile ? 10 : 22,
          alignItems: 'flex-start',
          justifyContent: 'center',
        }}
      >
        <RosterGrid
          roster={roster}
          pool={pool}
          owner={owner}
          focused={focused}
          myTurn={myTurn}
          compact={isMobile}
          onFocus={setFocused}
          onLock={(id) => { setFocused(id); if (myTurn && pool.includes(id)) onPick(id); }}
        />
        {!isMobile && preferred.length > 0 && (
          <PreferredCluster ids={preferred} pool={pool} />
        )}
      </div>

      <Dossier heroId={focused} compact={isMobile} />

      {/* Team line + cards */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isMobile ? 8 : 12,
        }}
      >
        <TeamCards
          picks={myPicks}
          focused={focused}
          myTurn={myTurn}
          aiTurn={aiTurn}
          autoName={autoName}
          compact={isMobile}
        />
      </div>

      {/* Foot — the LOCK plate, centred and alone. */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 4,
        }}
      >
        <LockButton
          enabled={myTurn && !!focused && !autoName}
          state={complete ? 'done' : myTurn ? 'ready' : 'waiting'}
          onClick={lock}
          compact={isMobile}
        />
      </div>
    </motion.div>
  );
}

// =============================================================================
// BACKDROP
// =============================================================================

/** Ink ground with the lobby's dial off to the left, the focused hero's
 *  splash bleeding through out of focus, and a vignette. */
function LobbyBackdrop({ focused }: { focused: string | null }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <AnimatePresence>
        {focused && (
          <motion.img
            key={focused}
            src={`${HERO_IMG_BASE}${focused}_splash.webp`}
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = `${HERO_IMG_BASE}${focused}_card.webp`;
              }
            }}
            alt=""
            draggable={false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.22 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              position: 'absolute',
              inset: '-8%',
              width: '116%',
              height: '116%',
              objectFit: 'cover',
              objectPosition: '60% 30%',
              filter: 'blur(28px) saturate(1.1)',
            }}
          />
        )}
      </AnimatePresence>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(12, 15, 17, 0.45)' }} />

      {/* The dial — rings, spokes, node dots — centred left like the mockup. */}
      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.16 }}
      >
        <defs>
          <radialGradient id="dl-fade" cx="0.22" cy="0.5" r="0.55">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="dl-mask"><rect width="1600" height="1000" fill="url(#dl-fade)" /></mask>
        </defs>
        <g transform="translate(350 500)" mask="url(#dl-mask)" stroke={lobby.cream} fill="none">
          {[120, 220, 340, 480, 640, 820].map((r, i) => (
            <circle key={r} r={r} strokeWidth={i % 2 === 0 ? 1 : 0.6} strokeDasharray={i % 2 === 1 ? '3 9' : undefined} />
          ))}
          {Array.from({ length: 24 }).map((_, i) => {
            const a = (i * Math.PI) / 12;
            return <line key={i} x1={Math.cos(a) * 120} y1={Math.sin(a) * 120} x2={Math.cos(a) * 1000} y2={Math.sin(a) * 1000} strokeWidth={i % 4 === 0 ? 1 : 0.5} />;
          })}
          {Array.from({ length: 24 }).flatMap((_, i) => {
            const a = (i * Math.PI) / 12;
            return [340, 640].map((r) => (
              <circle key={`${i}-${r}`} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={2.4} fill={lobby.cream} stroke="none" />
            ));
          })}
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 90% 90% at 50% 45%, transparent 40%, rgba(0, 0, 0, 0.45) 100%)',
        }}
      />
    </div>
  );
}

// =============================================================================
// HEADER PIECES
// =============================================================================

function StatusCapsule({ tone, pulse, label, compact }: { tone: 'green' | 'red' | 'dim'; pulse: boolean; label: string; compact: boolean }) {
  const color = tone === 'green' ? lobby.green : tone === 'red' ? lobby.red : lobby.dim;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 7 : 9,
        padding: compact ? '6px 10px' : '7px 14px',
        background: lobby.panel,
        flexShrink: 0,
        border: `1px solid ${lobby.edge}`,
        clipPath: chamfer(6),
        WebkitClipPath: chamfer(6),
      }}
    >
      <motion.span
        aria-hidden
        animate={pulse ? { opacity: [0.35, 1, 0.35] } : { opacity: 1 }}
        transition={pulse ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : undefined}
        style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }}
      />
      <span style={{ ...text.label, fontSize: compact ? 10 : 11, letterSpacing: compact ? '0.14em' : '0.2em', color: lobby.cream, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

// =============================================================================
// RIVAL STRIP
// =============================================================================

/**
 * Both crews' picks along the top: yours in the left corner, the rival's in
 * the right, each running toward the centre. Corner and colour together say
 * whose row it is before you read a word.
 */
function PickStrips({ mine, rival, myTurn, aiTurn, compact }: {
  mine: string[];
  rival: string[];
  myTurn: boolean;
  aiTurn: boolean;
  compact: boolean;
}) {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 18,
      }}
    >
      <PickSide picks={mine} side="left" tone="gold" live={myTurn} compact={compact} />
      <PickSide picks={rival} side="right" tone="red" live={aiTurn} compact={compact} />
    </div>
  );
}

function PickSide({ picks, side, tone, live, compact }: {
  picks: string[];
  side: 'left' | 'right';
  tone: 'gold' | 'red';
  live: boolean;
  compact: boolean;
}) {
  const w = compact ? 30 : 52;
  const h = compact ? 40 : 70;
  const next = picks.length;
  const colour = tone === 'gold' ? lobby.gold : lobby.red;
  const deep = tone === 'gold' ? '#8a6d1f' : '#7f1e1c';
  // Each banner runs from its own corner toward the middle, cut off at the
  // inner end so the two point at each other across the roster.
  const clip = side === 'left'
    ? 'polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%)'
    : 'polygon(10px 0, 100% 0, 100% 100%, 0 100%)';

  const slots = (
    <div style={{ display: 'flex', gap: compact ? 4 : 10, flexDirection: side === 'left' ? 'row' : 'row-reverse' }}>
      {[0, 1, 2, 3].map((s) => {
        const id = picks[s];
        return id ? (
          <motion.div
            key={`${tone}-${id}`}
            initial={{ opacity: 0, y: -10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={spring.default}
            title={CARDS_BY_ID[id]?.name ?? id}
            style={{
              width: w,
              height: h,
              overflow: 'hidden',
              border: `2px solid ${colour}`,
              background: lobby.panel,
              clipPath: chamfer(4),
              WebkitClipPath: chamfer(4),
            }}
          >
            <img
              src={`${HERO_IMG_BASE}${id}_card.webp`}
              alt=""
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 14%', userSelect: 'none' }}
            />
          </motion.div>
        ) : (
          <CardBack key={`${tone}-empty-${s}`} w={w} h={h} live={live && s === next} tone={tone} />
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 4 : 10,
        flexDirection: side === 'left' ? 'row' : 'row-reverse',
      }}
    >
      {slots}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: compact ? 8 : 14,
          background: side === 'left'
            ? `linear-gradient(90deg, ${colour}, ${deep})`
            : `linear-gradient(270deg, ${colour}, ${deep})`,
          clipPath: clip,
          WebkitClipPath: clip,
          display: 'flex',
          alignItems: 'center',
          justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
        }}
      />
    </div>
  );
}

/** A face-down card: ink plate, thin edge, the dial mark in the middle. */
function CardBack({ w, h, live, tone, numeral, label }: {
  w: number | string;
  h: number | string;
  live?: boolean;
  tone: 'red' | 'green' | 'gold' | 'dim';
  numeral?: string;
  label?: string;
}) {
  const color = tone === 'red' ? lobby.red
    : tone === 'green' ? lobby.green
    : tone === 'gold' ? lobby.gold
    : lobby.edge;
  return (
    <motion.div
      animate={live ? { borderColor: [color, lobby.cream, color] } : { borderColor: live ? color : lobby.edge }}
      transition={live ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      style={{
        position: 'relative',
        width: w,
        height: h,
        border: `2px solid ${lobby.edge}`,
        background: `linear-gradient(180deg, ${lobby.panel}, #0f1214)`,
        clipPath: chamfer(4),
        WebkitClipPath: chamfer(4),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        flexShrink: 0,
      }}
    >
      {numeral && (
        <span style={{ position: 'absolute', top: 8, left: 0, right: 0, textAlign: 'center', fontFamily: fonts.display, fontSize: 14, color: lobby.dim, letterSpacing: '0.1em' }}>
          {numeral}
        </span>
      )}
      <svg viewBox="0 0 40 40" width="38%" height="38%" fill="none" stroke={lobby.faint} strokeWidth="1.4" aria-hidden>
        <circle cx="20" cy="20" r="15" />
        <circle cx="20" cy="20" r="6" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={20 + Math.cos(a) * 6} y1={20 + Math.sin(a) * 6} x2={20 + Math.cos(a) * 15} y2={20 + Math.sin(a) * 15} />;
        })}
        <circle cx="20" cy="20" r="2" fill={lobby.faint} stroke="none" />
      </svg>
      {label && (
        <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.22em', color: live ? lobby.cream : lobby.dim, textAlign: 'center', padding: '0 6px' }}>
          {label}
        </span>
      )}
    </motion.div>
  );
}

// =============================================================================
// ROSTER GRID
// =============================================================================

function RosterGrid({
  roster, pool, owner, focused, myTurn, compact, onFocus, onLock,
}: {
  roster: string[];
  pool: string[];
  owner: Map<string, 'me' | 'rival'>;
  focused: string | null;
  myTurn: boolean;
  compact: boolean;
  onFocus: (id: string) => void;
  onLock: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 48 : 64}px, 1fr))`,
        gap: compact ? 5 : 7,
        width: '100%',
        maxWidth: compact ? undefined : 880,
      }}
    >
      {roster.map((id) => {
        const data = CARDS_BY_ID[id];
        if (!data || data.type !== 'hero') return null;
        const available = pool.includes(id);
        const who = owner.get(id);
        const isFocused = focused === id;
        const frame = isFocused
          ? lobby.green
          : who === 'me' ? lobby.gold : who === 'rival' ? lobby.red : lobby.edge;
        return (
          <motion.button
            key={id}
            type="button"
            disabled={!available}
            onMouseEnter={() => available && onFocus(id)}
            onFocus={() => available && onFocus(id)}
            onClick={() => available && onFocus(id)}
            onDoubleClick={() => available && myTurn && onLock(id)}
            aria-label={available ? `Select ${data.name}` : `${data.name} (taken)`}
            whileHover={available ? { y: -3 } : undefined}
            whileTap={available ? { scale: 0.96 } : undefined}
            transition={spring.snappy}
            title={data.name}
            style={{
              position: 'relative',
              aspectRatio: '3 / 4',
              padding: 0,
              border: `2px solid ${frame}`,
              background: lobby.panel,
              cursor: available ? 'pointer' : 'default',
              outline: 'none',
              overflow: 'hidden',
              boxShadow: isFocused ? `0 0 0 1px ${lobby.green}, 0 0 16px rgba(98, 196, 98, 0.45)` : 'none',
              transition: 'border-color 160ms ease, box-shadow 160ms ease',
            }}
          >
            <img
              src={`${HERO_IMG_BASE}${id}_card.webp`}
              alt=""
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: '50% 14%',
                display: 'block',
                filter: available ? 'none' : 'grayscale(0.85) brightness(0.45)',
                userSelect: 'none',
              }}
            />
            {/* Taken — the owner's colour wash. The frame colour already
                says whose it is, so it carries no label. */}
            {!available && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: who === 'me' ? 'rgba(217, 182, 74, 0.22)' : 'rgba(201, 48, 47, 0.28)',
                }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

/** Your preferred draft picks (from the Heroes screen) — the ones the lobby
 *  will auto-lock when they're available. */
function PreferredCluster({ ids, pool }: { ids: string[]; pool: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.22em', color: lobby.gold }}>Preferred</span>
      {ids.map((id) => (
        <img
          key={id}
          src={`${HERO_IMG_BASE}${id}_sm.webp`}
          alt={CARDS_BY_ID[id]?.name ?? id}
          title={CARDS_BY_ID[id]?.name ?? id}
          draggable={false}
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            objectFit: 'cover',
            border: `2px solid ${lobby.gold}`,
            opacity: pool.includes(id) ? 1 : 0.35,
            filter: pool.includes(id) ? 'none' : 'grayscale(1)',
            userSelect: 'none',
          }}
        />
      ))}
    </div>
  );
}

// =============================================================================
// DOSSIER
// =============================================================================

function Dossier({ heroId, compact }: { heroId: string | null; compact: boolean }) {
  const data = heroId ? CARDS_BY_ID[heroId] : null;
  if (!heroId || !data || data.type !== 'hero') return <div style={{ minHeight: compact ? 40 : 48 }} />;
  const identity = getHeroIdentity(heroId);
  return (
    <motion.div
      key={heroId}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'relative',
        zIndex: 1,
        alignSelf: 'center',
        width: '100%',
        maxWidth: 980,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: compact ? '6px 12px' : '8px 22px',
        padding: compact ? '8px 12px' : '10px 18px',
        background: 'rgba(21, 25, 28, 0.8)',
        border: `1px solid ${lobby.edge}`,
        borderLeft: `3px solid ${identity.primary}`,
        clipPath: chamfer(6),
        WebkitClipPath: chamfer(6),
      }}
    >
      <span style={{ fontFamily: fonts.display, fontSize: compact ? 18 : 22, letterSpacing: '0.04em', textTransform: 'uppercase', color: lobby.cream, lineHeight: 1 }}>
        {data.name}
      </span>
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {identity.keywords.map((kw) => (
          <span key={kw} style={{ padding: '3px 8px', background: identity.primary, color: identity.accent, ...text.label, fontSize: 9.5, letterSpacing: '0.18em' }}>
            {kw}
          </span>
        ))}
      </span>
      <span style={{ display: 'flex', gap: 14 }}>
        <Stat label="ATK" value={data.atk} />
        <Stat label="HP" value={data.hp} />
      </span>
      {data.abilityName && (
        <span style={{ ...text.body, fontSize: compact ? 12 : 13, color: lobby.dim, flex: '1 1 260px', minWidth: 0 }}>
          <span style={{ color: lobby.cream, fontWeight: 700 }}>{data.abilityName}</span>
          {data.text ? ` — ${data.text}` : ''}
        </span>
      )}
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.22em', color: lobby.dim }}>{label}</span>
      <span style={{ fontFamily: fonts.display, fontSize: 20, lineHeight: 1, color: lobby.cream }}>{value}</span>
    </span>
  );
}

// =============================================================================
// TEAM CARDS
// =============================================================================

function TeamCards({
  picks, focused, myTurn, aiTurn, autoName, compact,
}: {
  picks: string[];
  focused: string | null;
  myTurn: boolean;
  aiTurn: boolean;
  autoName: string | null;
  compact: boolean;
}) {
  const live = picks.length;
  const w = compact ? 'calc((100% - 24px) / 4)' : 'clamp(136px, min(15vw, 30vh), 224px)';
  return (
    <div
      style={{
        display: 'flex',
        gap: compact ? 8 : 16,
        width: compact ? '100%' : undefined,
        justifyContent: 'center',
      }}
    >
      {[0, 1, 2, 3].map((s) => {
        const id = picks[s];
        if (id) {
          return <TeamCard key={`t-${id}`} w={w} numeral={NUMERALS[s]} heroId={id} tone="gold" role={s === 0 ? 'Active' : ''} />;
        }
        if (s === live && myTurn && focused) {
          return (
            <TeamCard
              key="live"
              w={w}
              numeral={NUMERALS[s]}
              heroId={focused}
              tone="green"
              role={autoName ? 'Auto' : ''}
              preview
            />
          );
        }
        if (s === live && aiTurn) {
          return (
            <div key="wait" style={{ width: w, aspectRatio: '5 / 7', display: 'flex' }}>
              <CardBack w="100%" h="100%" live tone="red" numeral={NUMERALS[s]} />
            </div>
          );
        }
        return (
          <div key={`e-${s}`} style={{ width: w, aspectRatio: '5 / 7', display: 'flex' }}>
            <CardBack w="100%" h="100%" tone="dim" numeral={NUMERALS[s]} />
          </div>
        );
      })}
    </div>
  );
}

/** A tarot-style team card: numbered, framed in its state colour, the
 *  hero's splash edge to edge and a cream name plate at the foot. */
function TeamCard({ w, numeral, heroId, tone, role, preview }: {
  w: string;
  numeral: string;
  heroId: string;
  tone: 'gold' | 'green';
  role: string;
  preview?: boolean;
}) {
  const color = tone === 'gold' ? lobby.gold : lobby.green;
  const name = CARDS_BY_ID[heroId]?.name ?? heroId;
  return (
    <motion.div
      layout
      initial={preview ? { opacity: 0, scale: 0.96 } : { opacity: 0, rotateY: 90 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      transition={preview ? { duration: 0.18 } : spring.soft}
      style={{
        position: 'relative',
        width: w,
        aspectRatio: '5 / 7',
        border: `2.5px solid ${color}`,
        background: lobby.panel,
        clipPath: chamfer(6),
        WebkitClipPath: chamfer(6),
        overflow: 'hidden',
        boxShadow: preview ? `0 0 0 1px ${color}, 0 0 24px rgba(98, 196, 98, 0.35)` : 'none',
        flexShrink: 0,
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.img
          key={heroId}
          src={`${HERO_IMG_BASE}${heroId}_splash.webp`}
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.dataset.fallback) {
              img.dataset.fallback = '1';
              img.src = `${HERO_IMG_BASE}${heroId}_card.webp`;
            }
          }}
          alt=""
          draggable={false}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: heroArtFocus(heroId, 'splash', '50% 20%'),
            userSelect: 'none',
          }}
        />
      </AnimatePresence>
      {/* Numeral plate + role tag */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          background: 'linear-gradient(to bottom, rgba(12, 15, 17, 0.85), transparent)',
        }}
      >
        <span style={{ fontFamily: fonts.display, fontSize: 14, color, letterSpacing: '0.1em', flexShrink: 0 }}>{numeral}</span>
        <motion.span
          animate={preview ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
          transition={preview ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
          style={{
            ...text.label,
            fontSize: 9,
            letterSpacing: '0.2em',
            color,
            // On a phone-width card the tag used to wrap onto the numeral.
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            marginLeft: 6,
          }}
        >
          {role}
        </motion.span>
      </div>
      {/* Name plate */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '7px 8px 8px',
          background: lobby.cream,
          color: '#171410',
          textAlign: 'center',
          fontFamily: fonts.display,
          fontSize: 'clamp(11px, 1.05vw, 15px)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </div>
    </motion.div>
  );
}

// =============================================================================
// LOCK
// =============================================================================

function LockButton({ enabled, state, onClick, compact }: {
  enabled: boolean;
  state: 'ready' | 'waiting' | 'done';
  onClick: () => void;
  compact: boolean;
}) {
  const label = state === 'done' ? 'Locked in' : state === 'waiting' ? 'Waiting…' : 'Lock';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Bracket side="left" dim={!enabled} />
      <motion.button
        type="button"
        disabled={!enabled}
        onClick={onClick}
        whileHover={enabled ? { scale: 1.04, y: -1 } : undefined}
        whileTap={enabled ? { scale: 0.97 } : undefined}
        transition={spring.snappy}
        style={{
          minWidth: compact ? 200 : 180,
          padding: compact ? '13px 28px' : '13px 34px',
          border: `2px solid ${enabled ? lobby.cream : lobby.edge}`,
          background: enabled ? lobby.cream : 'transparent',
          color: enabled ? '#171410' : lobby.dim,
          clipPath: chamfer(9),
          WebkitClipPath: chamfer(9),
          fontFamily: fonts.display,
          fontSize: 20,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          lineHeight: 1,
          cursor: enabled ? 'pointer' : 'default',
        }}
      >
        {label}
      </motion.button>
      <Bracket side="right" dim={!enabled} />
    </div>
  );
}

function Bracket({ side, dim }: { side: 'left' | 'right'; dim: boolean }) {
  const c = dim ? lobby.edge : lobby.cream;
  return (
    <span
      aria-hidden
      style={{
        width: 12,
        height: 30,
        borderTop: `2px solid ${c}`,
        borderBottom: `2px solid ${c}`,
        [side === 'left' ? 'borderLeft' : 'borderRight']: `2px solid ${c}`,
        transform: side === 'left' ? 'skewX(-14deg)' : 'skewX(14deg)',
        flexShrink: 0,
      }}
    />
  );
}
