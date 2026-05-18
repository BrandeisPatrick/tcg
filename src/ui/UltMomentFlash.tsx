import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameState } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { palette, fonts } from './tokens';

/**
 * Watches the engine log for "played <Ultimate Name>" events and surfaces a
 * dramatic screen-fill flash + nameplate when an ultimate is cast.
 *
 * The flash is fire-and-forget: 1.4s total, non-interactive, doesn't block.
 */
interface Props {
  G: GameState;
}

interface UltMoment {
  id: number;
  name: string;
  caster: string; // 'P0' or 'P1'
}

let nextId = 1;

export function UltMomentFlash({ G }: Props) {
  const [moments, setMoments] = useState<UltMoment[]>([]);
  const lastSeenLen = useRef(G.log.length);

  useEffect(() => {
    const newEntries = G.log.slice(lastSeenLen.current);
    lastSeenLen.current = G.log.length;

    const ultNamesById = new Set(
      Object.values(CARDS_BY_ID).filter((c) => c?.type === 'ultimate').map((c) => c!.name),
    );

    const additions: UltMoment[] = [];
    for (const e of newEntries) {
      // Engine logs as: "P0 played <Card Name>." or "P0 played <Card Name> on <Target>."
      const m = e.text.match(/^(P[01]) played ([^.]+?)(?:\s+on\s+|\.$)/);
      if (!m) continue;
      const caster = m[1];
      const cardName = m[2].trim();
      if (ultNamesById.has(cardName)) {
        additions.push({ id: nextId++, name: cardName, caster });
      }
    }
    if (additions.length) {
      setMoments((prev) => [...prev, ...additions]);
      for (const a of additions) {
        setTimeout(() => {
          setMoments((prev) => prev.filter((m) => m.id !== a.id));
        }, 1500);
      }
    }
  }, [G.log]);

  return (
    <AnimatePresence>
      {moments.map((m) => (
        <UltFlashOverlay key={m.id} name={m.name} caster={m.caster} />
      ))}
    </AnimatePresence>
  );
}

function UltFlashOverlay({ name, caster }: { name: string; caster: string }) {
  // Tint by caster: gold for you, wine for rival.
  const accent = caster === 'P0' ? palette.accent : palette.danger;

  return (
    <>
      {/* Screen-fill flash */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0.4, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.2, times: [0, 0.15, 0.4, 1] }}
        style={{
          position: 'fixed', inset: 0,
          background: `radial-gradient(ellipse at center, ${accent}, transparent 70%)`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          zIndex: 98,
        }}
      />
      {/* Diagonal slash bars (Kingdom Hearts / FGO vibe) */}
      <motion.div
        initial={{ x: '-110%', opacity: 0 }}
        animate={{ x: '120%', opacity: [0, 0.85, 0.5, 0] }}
        transition={{ duration: 0.9, ease: [0.2, 0.7, 0.5, 1] }}
        style={{
          position: 'fixed', top: 0, bottom: 0, left: 0, right: 0,
          background: `linear-gradient(115deg, transparent 38%, ${accent}99 47%, ${accent} 50%, ${accent}99 53%, transparent 62%)`,
          pointerEvents: 'none',
          zIndex: 99,
        }}
      />
      {/* Name plate */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6, y: 20 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.06, 1, 0.96], y: [20, 0, 0, -10] }}
        transition={{ duration: 1.35, times: [0, 0.25, 0.75, 1] }}
        style={{
          position: 'fixed',
          left: 0, right: 0,
          top: '38%',
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 100,
        }}
      >
        <div style={{
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
          padding: '14px 36px',
          background: `linear-gradient(180deg, rgba(40,20,0,0.85), rgba(20,10,0,0.92))`,
          border: `2px solid ${accent}`,
          borderRadius: 8,
          boxShadow: `0 12px 36px rgba(0,0,0,0.6), 0 0 30px ${accent}aa`,
          backdropFilter: 'blur(6px)',
        }}>
          <span style={{
            fontFamily: fonts.display, fontSize: 10, fontWeight: 800,
            letterSpacing: '0.4em', textTransform: 'uppercase',
            color: accent,
            textShadow: `0 0 12px ${accent}`,
            marginBottom: 4,
          }}>
            Ultimate · {caster === 'P0' ? 'You' : 'Rival'}
          </span>
          <span style={{
            fontFamily: fonts.display, fontSize: 32, fontWeight: 800,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: '#fff',
            textShadow: `0 2px 8px rgba(0,0,0,0.9), 0 0 18px ${accent}`,
          }}>
            {name}
          </span>
        </div>
      </motion.div>
    </>
  );
}
