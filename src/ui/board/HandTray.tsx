import { motion } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { palette, radius, shadow, text } from '../tokens';
import { Hand } from './Hand';
import type { PendingPlay } from '../helpers';

/**
 * Bottom row: hand fan on the left, End Turn / Cancel buttons on the right.
 * Pure presentation — receives all callbacks from Board.tsx.
 */
export function HandTray({
  cards, disabled, pending, isMyTurn, busy, hasPending, mySouls,
  onTap, onLongPress, onHover, onDragEndOver, onEnd, onCancel,
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
  onEnd: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'flex-end',
      gap: 16,
      paddingBottom: 16,
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
        />
      </div>
      <div style={{ display: 'flex', gap: 10, paddingBottom: 12 }}>
        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={isMyTurn ? { scale: 1.03, y: -2 } : undefined}
          // Stay clickable while busy: the tap is queued (Board fires it once
          // the animation settles) rather than dropped, so it never feels dead.
          disabled={!isMyTurn}
          onClick={onEnd}
          animate={busy ? { opacity: [0.7, 1, 0.7] } : { opacity: isMyTurn ? 1 : 0.45 }}
          transition={busy ? { duration: 1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          style={{
            background: isMyTurn
              ? `linear-gradient(180deg, ${palette.accent}cc, ${palette.accent}55)`
              : 'rgba(255,255,255,0.04)',
            ...text.label, color: palette.text,
            padding: '20px 30px',
            border: `1px solid ${isMyTurn ? palette.accent : palette.border}`,
            borderRadius: radius.md,
            boxShadow: isMyTurn ? shadow.glowAccent : shadow.sm,
            cursor: isMyTurn ? (busy ? 'progress' : 'pointer') : 'default',
            minWidth: 160,
          }}
        >{busy ? 'Ending…' : 'End Turn'}</motion.button>
        {hasPending && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            whileTap={{ scale: 0.96 }}
            onClick={onCancel}
            style={{
              background: 'rgba(255,107,107,0.12)',
              ...text.label, color: palette.danger,
              padding: '20px 24px',
              border: `1px solid ${palette.danger}55`,
              borderRadius: radius.md,
              cursor: 'pointer',
            }}
          >Cancel</motion.button>
        )}
      </div>
    </div>
  );
}
