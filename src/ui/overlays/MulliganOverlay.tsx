import { useState } from 'react';
import { motion } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CardFrame } from '../card/CardFrame';
import { palette, radius, shadow, spring, text } from '../tokens';

interface Props {
  cards: CardInstance[];
  onConfirm: (swapIids: string[]) => void;
}

export function MulliganOverlay({ cards, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(iid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iid)) next.delete(iid);
      else next.add(iid);
      return next;
    });
  }

  const swapCount = selected.size;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(232, 216, 180, 0.92)',
        backdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 95,
        padding: 32,
      }}
    >
      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={spring.snappy}
        style={{ marginBottom: 28, textAlign: 'center' }}
      >
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 14,
          padding: '10px 32px',
          background: palette.bg1,
          border: `1px solid #5a3f1c`,
          borderRadius: 999,
          boxShadow: '0 4px 12px rgba(40, 20, 0, 0.18)',
        }}>
          <span style={{ ...text.label, color: palette.text }}>
            Reshuffle Your Opening
          </span>
        </div>
        <div style={{ marginTop: 12, ...text.body, color: palette.textDim }}>
          Tap any cards to send them back to your deck. Then lock in your opening hand.
        </div>
      </motion.div>

      {/* Cards */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...spring.snappy, delay: 0.05 }}
        style={{ display: 'flex', gap: 24, marginBottom: 32 }}
      >
        {cards.map((c) => {
          const isSwapping = selected.has(c.iid);
          return (
            <motion.button
              key={c.iid}
              onClick={() => toggle(c.iid)}
              whileTap={{ scale: 0.96 }}
              whileHover={{ y: -8 }}
              animate={{
                y: isSwapping ? -12 : 0,
                scale: isSwapping ? 0.95 : 1,
                opacity: isSwapping ? 0.55 : 1,
                rotate: isSwapping ? -3 : 0,
              }}
              transition={spring.snappy}
              style={{
                padding: 0, border: 'none', background: 'transparent',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              <CardFrame
                cardId={c.cardId}
                size="full"
                glow={isSwapping ? 'danger' : 'accent'}
              />
              {isSwapping && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 10,
                  background: 'rgba(255,107,107,0.18)',
                  pointerEvents: 'none',
                }}>
                  <span style={{
                    background: palette.danger,
                    padding: '6px 14px',
                    borderRadius: 999,
                    boxShadow: shadow.lg,
                    ...text.label, color: '#1a1410',
                  }}>
                    Swap
                  </span>
                </div>
              )}
            </motion.button>
          );
        })}
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...spring.snappy, delay: 0.1 }}
        style={{ display: 'flex', gap: 14 }}
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.03, y: -2 }}
          onClick={() => onConfirm([...selected])}
          style={{
            background: swapCount === 0
              ? `linear-gradient(180deg, ${palette.success}cc, ${palette.success}55)`
              : `linear-gradient(180deg, ${palette.accent}cc, ${palette.accent}55)`,
            padding: '14px 32px',
            border: `1px solid ${swapCount === 0 ? palette.success : palette.accent}`,
            borderRadius: radius.md,
            boxShadow: swapCount === 0 ? `0 0 18px ${palette.success}55` : `0 0 18px ${palette.accent}55`,
            cursor: 'pointer',
            minWidth: 200,
            ...text.label, color: palette.text,
          }}
        >
          {swapCount === 0 ? 'Lock In' : `Reshuffle ${swapCount}`}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
