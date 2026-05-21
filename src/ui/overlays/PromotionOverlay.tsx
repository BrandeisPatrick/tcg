import { motion, AnimatePresence } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { HeroPortrait } from '@/cards/art/heroArt';
import { palette, radius, shadow, spring, text } from '../tokens';

interface Props {
  candidates: CardInstance[];
  fallenName: string;
  onPick: (heroIid: string) => void;
}

/**
 * Modal that appears when the local player's Active hero has been KO'd and
 * they need to choose a bench hero to step up. Blocks other interactions until
 * a choice is made. Each candidate is a tappable portrait card.
 */
export function PromotionOverlay({ candidates, fallenName, onPick }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20, 12, 4, 0.78)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: 32,
        }}
      >
        <motion.div
          initial={{ y: 20, scale: 0.95 }}
          animate={{ y: 0, scale: 1 }}
          transition={spring.snappy}
          style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 24,
            padding: '28px 32px',
            background: palette.bg1,
            border: `2px solid ${palette.accent}`,
            borderRadius: radius.lg,
            boxShadow: shadow.xl,
            maxWidth: 720,
          }}
        >
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ ...text.label, color: palette.danger }}>{fallenName} Fell</span>
            <span style={{ ...text.label, color: palette.text }}>Choose your new Active</span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(candidates.length, 3)}, 156px)`,
            gap: 16,
          }}>
            {candidates.map((c) => (
              <CandidateCard key={c.iid} card={c} onPick={() => onPick(c.iid)} />
            ))}
          </div>

          <span style={{ ...text.body, color: palette.textDim }}>
            The fallen hero takes their bench slot to respawn.
          </span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function CandidateCard({ card, onPick }: { card: CardInstance; onPick: () => void }) {
  const data = CARDS_BY_ID[card.cardId];
  if (data?.type !== 'hero') return null;
  return (
    <motion.button
      whileHover={{ y: -6, scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onPick}
      style={{
        position: 'relative',
        width: 156, height: 216,
        padding: 0,
        background: '#3a2810',
        border: `2px solid ${palette.accent}aa`,
        borderRadius: radius.md,
        boxShadow: `0 0 18px ${palette.accent}66, ${shadow.md}`,
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{
        flex: '1 1 auto', minHeight: 0,
        background: 'linear-gradient(180deg, rgba(20,28,48,0.95), rgba(8,12,22,0.98))',
      }}>
        <HeroPortrait cardId={card.cardId} full />
      </div>
      <div style={{
        padding: '8px 10px',
        background: palette.card.body,
        borderTop: `1px solid ${palette.card.bodyBorder}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}>
        <span style={{ ...text.label, color: palette.card.bodyText }}>{data.name}</span>
        <div style={{ display: 'inline-flex', gap: 12, alignItems: 'baseline' }}>
          <span style={{ ...text.numeric, color: palette.atk }}>{data.atk}</span>
          <span style={{ ...text.body, color: palette.textFaint }}>·</span>
          <span style={{ ...text.numeric, color: palette.hp }}>{card.hp}</span>
        </div>
      </div>
    </motion.button>
  );
}
