import { motion } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { palette, spring, text } from '../tokens';
import { Hand } from './Hand';
import type { PendingPlay } from '../helpers';
import { useViewport } from '../hooks/useViewport';

/**
 * Bottom row: hand fan on the left, End Turn / Cancel buttons on the right.
 * Pure presentation — receives all callbacks from Board.tsx.
 */
export function HandTray({
  cards, disabled, pending, isMyTurn, busy, hasPending, mySouls,
  onTap, onLongPress, onHover, onDragEndOver, onUnaffordable, onEnd, onCancel,
  autoPlay, onToggleAuto,
}: {
  cards: CardInstance[];
  disabled: boolean;
  pending: PendingPlay | null;
  isMyTurn: boolean;
  busy?: boolean;
  hasPending: boolean;
  mySouls: number;
  onTap: (c: CardInstance) => void;
  onLongPress: (c: CardInstance) => void;
  onHover: (c: CardInstance | null) => void;
  onDragEndOver: (c: CardInstance, x: number, y: number) => void;
  onUnaffordable?: (c: CardInstance, cost: number) => void;
  onEnd: () => void;
  onCancel: () => void;
  autoPlay: boolean;
  onToggleAuto: () => void;
}) {
  const { isMobile } = useViewport();
  return (
    <div style={isMobile ? {
      display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8,
    } : {
      display: 'grid', gridTemplateColumns: '1fr auto',
      alignItems: 'flex-end', gap: 16, paddingBottom: 16,
    }}>
      <div style={{ minWidth: 0 }}>
        <Hand
          cards={cards}
          disabled={disabled}
          pending={pending}
          mySouls={mySouls}
          onTap={onTap}
          onLongPress={onLongPress}
          onHover={onHover}
          onDragEndOver={onDragEndOver}
          onUnaffordable={onUnaffordable}
        />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        justifyContent: 'flex-end',
        paddingBottom: isMobile ? 0 : 12,
        paddingRight: isMobile ? 8 : 0,
      }}>
        {/* Auto-play toggle — plain grey text, no outline or dot. On-state is
            shown by the label going brighter; off it's dimmed back. */}
        <motion.button
          whileTap={{ scale: 0.94 }}
          whileHover={{ y: -1, color: 'rgba(58, 56, 50, 1)' }}
          onClick={onToggleAuto}
          title={autoPlay
            ? 'Auto-play on — click to take control'
            : 'Auto-play off — click to let the AI play'}
          style={{
            background: 'transparent',
            border: 'none',
            ...text.label,
            color: autoPlay ? 'rgba(92, 90, 84, 0.95)' : 'rgba(92, 90, 84, 0.42)',
            padding: '10px 12px',
            cursor: 'pointer',
          }}
        >Auto</motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={isMyTurn ? { scale: 1.03, y: -2, color: 'rgba(58, 56, 50, 1)' } : undefined}
          // Stay clickable while busy: the tap is queued (Board fires it once
          // the animation settles) rather than dropped, so it never feels dead.
          disabled={!isMyTurn}
          onClick={onEnd}
          // `active` = it's my turn AND no animation in flight. While busy the
          // button greys out (not actionable yet) — but the tap is still queued
          // underneath, so a press during the animation isn't dropped.
          // Three states: busy pulse (animation in flight), rival's-turn slow
          // breathe (signals the AI is acting, not a frozen UI), idle steady.
          animate={busy
            ? { opacity: [0.4, 0.55, 0.4] }
            : isMyTurn
              ? { opacity: 1 }
              : { opacity: [0.45, 0.62, 0.45] }}
          transition={busy
            ? { duration: 1, repeat: Infinity, ease: 'easeInOut' }
            : isMyTurn
              ? { duration: 0.2 }
              : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            // Plain grey text, no outline — recedes into the parchment. Active
            // is a touch brighter so it still reads as pressable.
            background: 'transparent',
            border: 'none',
            ...text.label,
            color: (isMyTurn && !busy) ? 'rgba(92, 90, 84, 0.9)' : 'rgba(92, 90, 84, 0.5)',
            padding: '10px 14px',
            cursor: isMyTurn ? (busy ? 'progress' : 'pointer') : 'default',
          }}
        >{!isMyTurn ? "Rival's Move" : busy ? 'Resolving…' : 'End Turn'}</motion.button>
        {hasPending && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={spring.default}
            whileTap={{ scale: 0.96 }}
            whileHover={{ y: -1, color: palette.danger }}
            onClick={onCancel}
            style={{
              // Plain text like the others, but wine-tinted so it still reads
              // as the cancel action.
              background: 'transparent',
              border: 'none',
              ...text.label, color: `${palette.danger}cc`,
              padding: '10px 12px',
              cursor: 'pointer',
            }}
          >Cancel</motion.button>
        )}
      </div>
    </div>
  );
}
