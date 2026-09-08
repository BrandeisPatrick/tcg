import { motion } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { CardFrame } from '../card/CardFrame';
import { fonts, spring, text } from '../tokens';
import { PosterButton } from '../chrome';
import { poster, sheetStyle, scrimStyle } from '../poster';

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

/** The 156×216 modal card box — a charcoal frame the hand-size CardFrame
 *  sits centred inside. Shared with PromotionOverlay's candidate cards. */
const cardBox = {
  width: 156, height: 216,
  boxSizing: 'border-box' as const,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: poster.frame,
  border: `2px solid ${poster.edge}`,
  borderRadius: 10,
  boxShadow: '0 14px 26px rgba(0, 0, 0, 0.35), 0 3px 8px rgba(0, 0, 0, 0.25)',
};

/**
 * Modal shown when the player tries to attach a 4th piece of equipment to a
 * hero. The hero's existing 3 items are rendered alongside the incoming item
 * on a cream sheet; tap an existing one to discard it and complete the play.
 * Board wraps this in its own AnimatePresence, which drives the exit fade.
 */
export function EquipmentReplaceOverlay({ incoming, hero, onPick, onCancel }: Props) {
  const heroName = CARDS_BY_ID[hero.cardId]?.name ?? hero.cardId;
  const incomingName = CARDS_BY_ID[incoming.cardId]?.name ?? incoming.cardId;
  const attached = hero.attached ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onCancel}
      style={{
        ...scrimStyle,
        zIndex: 100, padding: 32,
      }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        transition={spring.snappy}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...sheetStyle,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 22,
          padding: '28px 32px',
          borderRadius: 18,
          maxWidth: 880,
          color: poster.ink,
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{
            fontFamily: fonts.display,
            fontSize: 18,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            lineHeight: 1.1,
            color: poster.ink,
          }}>
            <span style={{ color: poster.red }}>{heroName}</span> is at the equipment cap (3)
          </span>
          <span style={{ ...text.body, color: poster.inkDim }}>
            Choose an existing item to discard so {incomingName} can be equipped.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {/* Staggered entrance — existing items present themselves one by
              one, then the incoming card arrives last as the payoff. */}
          {attached.map((eq, i) => (
            <motion.div
              key={eq.iid}
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ ...spring.default, delay: 0.08 + i * 0.06 }}
            >
              <ReplaceableCard card={eq} onPick={() => onPick(eq.iid)} />
            </motion.div>
          ))}
          <div style={{
            width: 1, alignSelf: 'stretch',
            background: poster.inkRule,
            margin: '0 4px',
          }} />
          <motion.div
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...spring.default, delay: 0.08 + attached.length * 0.06 + 0.06 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
          >
            {/* Red sticker — marks the card that wants a slot. */}
            <span style={{
              padding: '4px 9px 5px',
              borderRadius: 3,
              background: poster.red,
              color: poster.paper,
              fontFamily: fonts.display,
              fontSize: 10,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              lineHeight: 1,
              boxShadow: '0 3px 8px rgba(0, 0, 0, 0.35)',
            }}>Incoming</span>
            <div style={cardBox}>
              <CardFrame cardId={incoming.cardId} size="hand" />
            </div>
          </motion.div>
        </div>

        <PosterButton variant="red" size="sm" onClick={onCancel}>
          Cancel
        </PosterButton>
      </motion.div>
    </motion.div>
  );
}

/** An attached item in its charcoal box — tap to discard it. Hover lifts the
 *  box and lights its frame. */
function ReplaceableCard({ card, onPick }: { card: CardInstance; onPick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -6, scale: 1.03, borderColor: poster.frameLit }}
      whileTap={{ scale: 0.97 }}
      onClick={onPick}
      style={{
        ...cardBox,
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <CardFrame cardId={card.cardId} size="hand" />
    </motion.button>
  );
}
