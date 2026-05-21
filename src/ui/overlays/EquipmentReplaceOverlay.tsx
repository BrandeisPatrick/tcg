import { motion, AnimatePresence } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { CardFrame } from '../card/CardFrame';
import { palette, radius, shadow, spring, text } from '../tokens';

interface Props {
  /** The piece of equipment trying to be played from hand. */
  incoming: CardInstance;
  /** Hero already wearing the max (3) items. */
  hero: CardInstance;
  /** Player picks which of the three to send to discard. */
  onPick: (discardIid: string) => void;
  /** Player cancels the play and the card stays in hand. */
  onCancel: () => void;
}

/**
 * Modal shown when the player tries to attach a 4th piece of equipment to a
 * hero. The hero's existing 3 items are rendered alongside the incoming item;
 * tap an existing one to discard it and complete the play.
 */
export function EquipmentReplaceOverlay({ incoming, hero, onPick, onCancel }: Props) {
  const heroName = CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId;
  const incomingName = CARDS_BY_ID[incoming.cardId]?.name ?? incoming.cardId;
  const attached = hero.attached ?? [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onCancel}
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
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 22,
            padding: '28px 32px',
            background: palette.bg1,
            border: `2px solid ${palette.accent}`,
            borderRadius: radius.lg,
            boxShadow: shadow.xl,
            maxWidth: 880,
          }}
        >
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ ...text.label, color: palette.accent }}>
              {heroName} is at the equipment cap (3)
            </span>
            <span style={{ ...text.body, color: palette.textDim }}>
              Choose an existing item to discard so {incomingName} can be equipped.
            </span>
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {attached.map((eq) => (
              <ReplaceableCard key={eq.iid} card={eq} onPick={() => onPick(eq.iid)} />
            ))}
            <div style={{
              width: 1, alignSelf: 'stretch',
              background: `${palette.border}aa`,
              margin: '0 4px',
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ ...text.label, color: palette.success }}>Incoming</span>
              <div style={{ width: 156, height: 216 }}>
                <CardFrame cardId={incoming.cardId} size="hand" footer={null} />
              </div>
            </div>
          </div>

          <motion.button
            onClick={onCancel}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              padding: '8px 18px',
              background: 'transparent',
              border: `1px solid ${palette.border}`,
              borderRadius: radius.md,
              color: palette.textDim,
              cursor: 'pointer',
              ...text.label,
            }}
          >
            Cancel
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ReplaceableCard({ card, onPick }: { card: CardInstance; onPick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -6, scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onPick}
      style={{
        width: 156, height: 216,
        padding: 0,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <CardFrame cardId={card.cardId} size="hand" footer={null} />
    </motion.button>
  );
}
