// Pre-match draft overlay — "Select Hero" composition mirroring Deadlock's
// hero-select screen. Two-column layout:
//   Left  — compact hero portrait grid (click to pick, hover to preview)
//   Right — big preview pane (focused hero's portrait, name, keywords, ability)
//
// Both teams' pick strips run along the top edge (yours left, opponent right).
// Snake-order is driven by the engine; this overlay just dispatches draftPick
// when it's the local player's turn.

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DraftState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { getHeroIdentity } from '@/cards/art/heroPalette';
import { palette, fonts, spring, text } from '../tokens';
import { getMatchConfig } from '@/storage/matchConfig';
import { useViewport } from '../hooks/useViewport';

interface Props {
  draft: DraftState;
  currentPlayer: PlayerID;
  me: PlayerID;
  onPick: (heroId: string) => void;
}

const HERO_IMG_BASE = `${import.meta.env.BASE_URL ?? '/'}heroes/`;

export function DraftOverlay({ draft, currentPlayer, me, onPick }: Props) {
  const { isMobile } = useViewport();
  const myTurn = currentPlayer === me && draft.order[draft.currentIndex] === me;
  const aiTurn = !myTurn && draft.currentIndex < draft.order.length;
  const myPicks = draft.picks[me];
  const oppId: PlayerID = me === '0' ? '1' : '0';
  const oppPicks = draft.picks[oppId];

  // Stable hero pool order so cards don't shuffle every render.
  const pool = useMemo(() => [...draft.pool].sort(), [draft.pool]);

  // Focused hero for the preview pane. Defaults to first in pool; updates on
  // hover. If the currently focused hero gets picked (by either side), fall
  // back to the next available one automatically.
  const [focused, setFocused] = useState<string | null>(null);
  useEffect(() => {
    if (!focused || !pool.includes(focused)) {
      setFocused(pool[0] ?? null);
    }
  }, [pool, focused]);

  // Auto-draft: when it's our turn and we have preferred heroes available,
  // pick them automatically after a brief delay.
  const [autoBanner, setAutoBanner] = useState<string | null>(null);
  const autoPickedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!myTurn) return;
    const prefs = getMatchConfig().heroPreferences.filter(Boolean) as string[];
    const nextPref = prefs.find((id) => pool.includes(id) && !autoPickedRef.current.has(id));
    if (!nextPref) return;
    const heroName = CARDS_BY_ID[nextPref]?.name ?? nextPref;
    setFocused(nextPref);
    setAutoBanner(heroName);
    const t = setTimeout(() => {
      autoPickedRef.current.add(nextPref);
      setAutoBanner(null);
      onPick(nextPref);
    }, 700);
    return () => clearTimeout(t);
  }, [myTurn, pool, onPick]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: palette.bg0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 95,
        padding: isMobile ? '12px 12px 16px' : '24px 40px 28px',
        // Phones stack the picker + preview vertically and may exceed the
        // viewport, so allow scroll instead of clipping the preview pane.
        overflow: isMobile ? 'auto' : 'hidden',
      }}
    >
      <Header
        myTurn={myTurn}
        aiTurn={aiTurn}
        currentPickNumber={draft.currentIndex + 1}
      />

      <AnimatePresence>
        {autoBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            style={{
              textAlign: 'center',
              padding: '6px 20px',
              background: `${palette.accent}22`,
              border: `1px solid ${palette.accent}`,
              borderRadius: 999,
              fontFamily: fonts.ui,
              fontSize: 12,
              fontWeight: 700,
              color: palette.accent,
              alignSelf: 'center',
              marginBottom: 8,
            }}
          >
            Auto-drafting: {autoBanner}
          </motion.div>
        )}
      </AnimatePresence>

      <TeamStrips
        myPicks={myPicks}
        oppPicks={oppPicks}
        order={draft.order}
        currentIndex={draft.currentIndex}
        me={me}
        oppId={oppId}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          // Phones can't fit the picker + preview side by side (the preview
          // clips off the right edge), so stack them in one column.
          gridTemplateColumns: isMobile ? '1fr' : '0.85fr 1.15fr',
          gap: isMobile ? 14 : 32,
          marginTop: isMobile ? 10 : 18,
        }}
      >
        <HeroGrid
          pool={pool}
          focused={focused}
          myTurn={myTurn}
          onHover={(id) => id && setFocused(id)}
          onPick={onPick}
        />

        <HeroPreview heroId={focused} myTurn={myTurn} onPick={onPick} />
      </div>
    </motion.div>
  );
}

// =============================================================================
// HEADER
// =============================================================================

function Header({
  myTurn,
  aiTurn,
  currentPickNumber,
}: {
  myTurn: boolean;
  aiTurn: boolean;
  currentPickNumber: number;
}) {
  const pillLabel = myTurn ? 'Your pick' : aiTurn ? 'Opponent picking…' : 'Draft complete';
  return (
    <motion.div
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={spring.snappy}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 14,
        paddingBottom: 12,
        borderBottom: `1px solid ${palette.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 22 }}>
        <div
          style={{
            fontFamily: fonts.display,
            fontSize: 38,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: palette.text,
            lineHeight: 1,
          }}
        >
          Select Hero
        </div>
        <div
          style={{
            fontFamily: fonts.display,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.42em',
            textTransform: 'uppercase',
            color: palette.accent,
          }}
        >
          Pick {currentPickNumber} of 8
        </div>
      </div>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 18px',
          background: palette.bg1,
          border: `1px solid #5a3f1c`,
          borderRadius: 999,
          boxShadow: '0 4px 12px rgba(40, 20, 0, 0.14)',
        }}
      >
        {aiTurn && (
          <motion.span
            aria-hidden
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: palette.accent,
              display: 'inline-block',
            }}
          />
        )}
        <span style={{ ...text.label, color: palette.text }}>{pillLabel}</span>
      </div>
    </motion.div>
  );
}

// =============================================================================
// PICK STRIPS (both teams, side by side at top)
// =============================================================================

function TeamStrips({
  myPicks,
  oppPicks,
  order,
  currentIndex,
  me,
  oppId,
}: {
  myPicks: string[];
  oppPicks: string[];
  order: PlayerID[];
  currentIndex: number;
  me: PlayerID;
  oppId: PlayerID;
}) {
  const { isMobile } = useViewport();
  return (
    <div
      style={{
        display: 'grid',
        // Two 4-slot strips side by side overflow a phone — stack them.
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: isMobile ? 8 : 24,
      }}
    >
      <PickStrip
        label="Your team"
        picks={myPicks}
        isActive={order[currentIndex] === me}
        align="left"
      />
      <PickStrip
        label="Opponent"
        picks={oppPicks}
        isActive={order[currentIndex] === oppId}
        align="right"
      />
    </div>
  );
}

function PickStrip({
  label,
  picks,
  isActive,
  align,
}: {
  label: string;
  picks: string[];
  isActive: boolean;
  align: 'left' | 'right';
}) {
  const slots = [0, 1, 2, 3];
  const nextSlot = picks.length;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: align === 'left' ? 'row' : 'row-reverse',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          minWidth: 96,
          textAlign: align === 'left' ? 'left' : 'right',
          fontFamily: fonts.display,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: palette.accent,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: 8, flexDirection: align === 'left' ? 'row' : 'row-reverse' }}>
        {slots.map((s) => {
          const heroId = picks[s];
          const isActiveSlot = s === 0;
          const isNext = isActive && s === nextSlot;
          if (heroId) {
            return (
              <motion.div
                key={`filled-${s}`}
                layout
                initial={{ opacity: 0, scale: 0.7, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={spring.default}
                style={{
                  width: 56,
                  height: 76,
                  borderRadius: 6,
                  overflow: 'hidden',
                  border: isActiveSlot
                    ? `2px solid ${palette.accent}`
                    : `1px solid ${palette.borderStrong}`,
                  boxShadow: '0 3px 8px rgba(40,20,0,0.22)',
                  background: '#1a0f06',
                  position: 'relative',
                }}
                title={CARDS_BY_ID[heroId]?.name ?? heroId}
              >
                <img
                  src={`${HERO_IMG_BASE}${heroId}_card.webp`}
                  alt=""
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: '50% 14%',
                    userSelect: 'none',
                  }}
                />
              </motion.div>
            );
          }
          return (
            <motion.div
              key={`empty-${s}`}
              layout
              animate={
                isNext
                  ? { borderColor: palette.accent, boxShadow: `0 0 0 1px ${palette.accent}, 0 0 10px rgba(176,120,37,0.32)` }
                  : { borderColor: palette.border, boxShadow: 'none' }
              }
              transition={{ duration: 0.3 }}
              style={{
                width: 56,
                height: 76,
                borderRadius: 6,
                border: `2px dashed ${palette.border}`,
                background: 'rgba(245, 232, 204, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fonts.ui,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: palette.textFaint,
              }}
            >
              {s === 0 ? 'Active' : `B${s}`}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// HERO GRID (left column)
// =============================================================================

function HeroGrid({
  pool,
  focused,
  myTurn,
  onHover,
  onPick,
}: {
  pool: string[];
  focused: string | null;
  myTurn: boolean;
  onHover: (heroId: string | null) => void;
  onPick: (heroId: string) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
        gap: 10,
        alignContent: 'start',
        padding: '4px 4px 16px',
        overflow: 'auto',
      }}
    >
      <AnimatePresence mode="popLayout">
        {pool.map((id) => {
          const data = CARDS_BY_ID[id];
          if (!data || data.type !== 'hero') return null;
          const isFocused = focused === id;
          return (
            <motion.button
              key={id}
              layout
              onMouseEnter={() => onHover(id)}
              onFocus={() => onHover(id)}
              onClick={() => myTurn && onPick(id)}
              disabled={!myTurn}
              aria-label={`Draft ${data.name}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, y: -12 }}
              whileHover={myTurn ? { y: -4 } : undefined}
              whileTap={myTurn ? { scale: 0.96 } : undefined}
              transition={spring.snappy}
              style={{
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: myTurn ? 'pointer' : 'default',
                outline: 'none',
                position: 'relative',
                aspectRatio: '3 / 4',
              }}
            >
              <HeroThumb heroId={id} focused={isFocused} interactive={myTurn} />
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function HeroThumb({ heroId, focused, interactive }: { heroId: string; focused: boolean; interactive: boolean }) {
  const identity = getHeroIdentity(heroId);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 8,
        overflow: 'hidden',
        background: '#1a0f06',
        border: focused
          ? `2px solid ${palette.accent}`
          : `1px solid ${palette.borderStrong}`,
        boxShadow: focused
          ? `0 0 0 1px ${palette.accent}, 0 6px 18px rgba(40,20,0,0.32)`
          : '0 3px 8px rgba(40,20,0,0.22)',
        opacity: interactive ? 1 : 0.6,
        transition: 'border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease',
      }}
    >
      <img
        src={`${HERO_IMG_BASE}${heroId}_card.webp`}
        alt=""
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: '50% 14%',
          userSelect: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '4px 6px',
          background: `linear-gradient(to top, ${identity.accent}, transparent)`,
          color: '#fff',
          fontFamily: fonts.ui,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textShadow: '0 1px 2px rgba(0,0,0,0.7)',
          textAlign: 'center',
        }}
      >
        {CARDS_BY_ID[heroId]?.name ?? heroId}
      </div>
    </div>
  );
}

// =============================================================================
// HERO PREVIEW (right column)
// =============================================================================

function HeroPreview({
  heroId,
  myTurn,
  onPick,
}: {
  heroId: string | null;
  myTurn: boolean;
  onPick: (heroId: string) => void;
}) {
  if (!heroId) return <div />;
  const data = CARDS_BY_ID[heroId];
  if (!data || data.type !== 'hero') return <div />;
  const identity = getHeroIdentity(heroId);

  return (
    <motion.div
      key={heroId}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22 }}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        borderRadius: 10,
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${identity.accent}, #1a0f06)`,
        border: `1px solid ${palette.borderStrong}`,
        boxShadow: '0 12px 32px rgba(40,20,0,0.32), inset 0 0 0 1px rgba(176,120,37,0.18)',
      }}
    >
      <img
        src={`${HERO_IMG_BASE}${heroId}_card.webp`}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: '50% 12%',
          userSelect: 'none',
        }}
      />

      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to top, rgba(10,5,2,0.92) 0%, rgba(10,5,2,0.55) 35%, transparent 60%)`,
        }}
      />

      <div
        style={{
          position: 'relative',
          padding: '32px 40px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          color: '#fff',
        }}
      >
        <div
          style={{
            fontFamily: fonts.display,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.36em',
            textTransform: 'uppercase',
            color: identity.primary,
            textShadow: '0 1px 4px rgba(0,0,0,0.6)',
          }}
        >
          Hero
        </div>

        <div
          style={{
            fontFamily: fonts.display,
            fontSize: 'clamp(48px, 5vw, 76px)',
            fontWeight: 700,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            lineHeight: 0.95,
            color: '#fff',
            textShadow: '0 2px 8px rgba(0,0,0,0.55)',
          }}
        >
          {data.name}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
          {identity.keywords.map((kw, i) => (
            <span
              key={i}
              style={{
                padding: '5px 12px',
                borderRadius: 4,
                background: identity.primary,
                color: identity.accent,
                fontFamily: fonts.display,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                boxShadow: '0 2px 4px rgba(0,0,0,0.35)',
              }}
            >
              {kw}
            </span>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 26,
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <Stat label="ATK" value={data.atk} />
          <Stat label="HP" value={data.hp} />
          {data.abilityName && <AbilityChip label={data.skill ? 'Skill' : 'Passive'} name={data.abilityName} />}
        </div>

        {data.text && (
          <div
            style={{
              ...text.body,
              marginTop: 4,
              maxWidth: 560,
              color: 'rgba(255,255,255,0.88)',
              textShadow: '0 1px 4px rgba(0,0,0,0.6)',
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {data.text}
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <motion.button
            disabled={!myTurn}
            onClick={() => myTurn && onPick(heroId)}
            whileHover={myTurn ? { scale: 1.03, y: -2 } : undefined}
            whileTap={myTurn ? { scale: 0.97 } : undefined}
            transition={spring.snappy}
            style={{
              padding: '14px 38px',
              border: 'none',
              borderRadius: 6,
              background: myTurn ? identity.primary : 'rgba(255,255,255,0.18)',
              color: myTurn ? identity.accent : 'rgba(255,255,255,0.6)',
              fontFamily: fonts.display,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              cursor: myTurn ? 'pointer' : 'default',
              boxShadow: myTurn ? '0 8px 18px rgba(0,0,0,0.32)' : 'none',
            }}
          >
            {myTurn ? `Draft ${data.name}` : 'Waiting…'}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.65)',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 34,
          fontWeight: 700,
          color: '#fff',
          lineHeight: 1,
          textShadow: '0 2px 4px rgba(0,0,0,0.55)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function AbilityChip({ label, name }: { label: string; name: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.65)',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 20,
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '0.02em',
          lineHeight: 1,
          textShadow: '0 2px 4px rgba(0,0,0,0.55)',
        }}
      >
        {name}
      </div>
    </div>
  );
}
