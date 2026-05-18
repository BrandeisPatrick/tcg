import type { CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameState, PlayerID, PlayerState, CardInstance } from '@/engine/types';
import { HeroSlot } from './HeroSlot';
import { palette, fonts, radius, shadow } from './tokens';

interface Props {
  G: GameState;
  owner: PlayerID;
  ps: PlayerState;
  isOpponent: boolean;
  myId: PlayerID;
  pending: { iid: string; kind: 'playCard' | 'useSkill'; filter: string } | null;
  onTapHero: (c: CardInstance, owner: PlayerID) => void;
  onLongPressHero?: (c: CardInstance) => void;
  isTargetable: (card: CardInstance, owner: PlayerID) => boolean;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  attackingIids?: Set<string>;
}

export function PlayerArea({ G, owner, ps, isOpponent, pending, myId, onTapHero, onLongPressHero, isTargetable, registerSlotRef, attackingIids }: Props) {
  const slots: (CardInstance | null)[] = [ps.active, ...ps.bench];
  const accent = isOpponent ? palette.danger : palette.accent;

  return (
    <div style={{
      position: 'relative',
      borderRadius: 4,
      background: 'transparent',
      padding: '8px 10px 10px',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      height: '100%',
    }}>
      {/* Sci-fi HUD corner brackets */}
      <CornerBrackets color={accent} />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between',
        padding: '0 6px 4px', fontFamily: fonts.ui, fontSize: 11,
      }}>
        <span style={{
          fontFamily: fonts.display, fontSize: 12, fontWeight: 600,
          color: accent, letterSpacing: '0.2em', textTransform: 'uppercase',
        }}>
          {isOpponent ? 'Opponent' : 'You'}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 12,
        width: '100%',
        flex: 1,
        minHeight: 0,
      }}>
        <AnimatePresence mode="popLayout">
          {slots.map((c, i) => c ? (
            <motion.div
              key={c.iid}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0, rotate: isOpponent ? 8 : -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: 'block', height: '100%', minHeight: 0 }}
            >
              <HeroSlot
                card={c}
                owner={owner}
                myId={myId}
                isOpponent={isOpponent}
                pending={pending}
                isTargetable={isTargetable(c, owner)}
                onTap={onTapHero}
                onLongPress={onLongPressHero}
                registerSlotRef={registerSlotRef}
                attackPulse={attackingIids?.has(c.iid)}
              />
            </motion.div>
          ) : (
            <EmptySlot key={`empty-${i}`} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CornerBrackets({ color }: { color: string }) {
  const size = 14;
  const stroke = `${color}99`;
  const bracket: CSSProperties = {
    position: 'absolute',
    width: size, height: size,
    pointerEvents: 'none',
    zIndex: 1,
  };
  return (
    <>
      <div style={{ ...bracket, top: 0, left: 0, borderTop: `1.5px solid ${stroke}`, borderLeft: `1.5px solid ${stroke}` }} />
      <div style={{ ...bracket, top: 0, right: 0, borderTop: `1.5px solid ${stroke}`, borderRight: `1.5px solid ${stroke}` }} />
      <div style={{ ...bracket, bottom: 0, left: 0, borderBottom: `1.5px solid ${stroke}`, borderLeft: `1.5px solid ${stroke}` }} />
      <div style={{ ...bracket, bottom: 0, right: 0, borderBottom: `1.5px solid ${stroke}`, borderRight: `1.5px solid ${stroke}` }} />
    </>
  );
}

function CardBackStack({ count }: { count: number }) {
  const visible = Math.min(count, 5);
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 26, position: 'relative' }}>
      {Array.from({ length: visible }, (_, i) => (
        <div
          key={i}
          style={{
            width: 18, height: 24,
            marginLeft: i === 0 ? 0 : -10,
            borderRadius: 3,
            background: `linear-gradient(160deg, ${palette.bg3}, ${palette.bg2})`,
            border: `1px solid ${palette.border}`,
            boxShadow: '0 2px 6px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)',
            transform: `rotate(${(i - visible / 2) * 4}deg)`,
            transformOrigin: 'bottom center',
          }}
        />
      ))}
      <span style={{
        marginLeft: 8, fontSize: 11, color: palette.textDim,
        fontVariantNumeric: 'tabular-nums', fontWeight: 600,
      }}>{count}</span>
    </div>
  );
}

function EmptySlot() {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      borderRadius: 4,
      background: 'rgba(255,255,255,0.015)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: palette.textFaint,
      fontFamily: fonts.ui,
      overflow: 'hidden',
    }}>
      {/* Corner brackets on the empty slot — quieter than the outer ones */}
      <span style={{ position: 'absolute', top: 0, left: 0, width: 8, height: 8, borderTop: `1px solid ${palette.border}`, borderLeft: `1px solid ${palette.border}` }} />
      <span style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderTop: `1px solid ${palette.border}`, borderRight: `1px solid ${palette.border}` }} />
      <span style={{ position: 'absolute', bottom: 0, left: 0, width: 8, height: 8, borderBottom: `1px solid ${palette.border}`, borderLeft: `1px solid ${palette.border}` }} />
      <span style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderBottom: `1px solid ${palette.border}`, borderRight: `1px solid ${palette.border}` }} />
      {/* The "+" affordance */}
      <span style={{
        width: 30, height: 30, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${palette.border}`,
        color: palette.textFaint,
        fontSize: 20, fontWeight: 300, lineHeight: 1,
      }}>+</span>
    </div>
  );
}
