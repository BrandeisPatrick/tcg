import { motion } from 'framer-motion';
import { CardFrame } from '../card/CardFrame';
import { spring } from '../tokens';
import { scrimStyle } from '../poster';
import { useViewport } from '../hooks/useViewport';

/** The full card's size (CardFrame SIZES.full) and the phone's share of it:
 *  the whole card filled a phone's width edge to edge. Fixed, not fluid — the
 *  preview is the same size every time it opens on a given screen. */
const FULL_W = 300;
const FULL_H = 420;
const PHONE_SCALE = 0.8;

/** The card at the preview's size: drawn at full size and scaled, so its
 *  type stays set as designed. */
function PreviewCard({ cardId, cost, scale }: { cardId: string; cost?: number; scale: number }) {
  return (
    <div style={{ width: FULL_W * scale, height: FULL_H * scale }}>
      <div style={{ width: FULL_W, height: FULL_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <CardFrame cardId={cardId} cost={cost} size="full" />
      </div>
    </div>
  );
}

interface Props {
  cardId: string;
  /** What this copy costs, when it is an instance (see CardFrame `cost`). */
  cost?: number;
  onClose: () => void;
  /** A peek while the pointer rests on the card: no scrim, and it blocks
   *  nothing (the owner closes it when the pointer leaves). Off, it is the
   *  held preview: a scrim, and a tap anywhere closes it. */
  hover?: boolean;
}

/**
 * The one place a card is previewed: the centre of the screen, at the full
 * card's size, wherever the preview came from (a hand card hovered or held,
 * an equipped item's chip, the story run's deck). Fixed spot, fixed size —
 * the eye learns where to look, and a phone never has it hanging off an edge.
 */
export function CardPreview({ cardId, cost, onClose, hover = false }: Props) {
  const { isMobile } = useViewport();
  const scale = isMobile ? PHONE_SCALE : 1;
  if (hover) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 92, pointerEvents: 'none' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={spring.snappy}
          // One neutral drop — the print floats over the sheet with no colour cast.
          style={{ filter: 'drop-shadow(0 16px 28px rgba(0, 0, 0, 0.55))' }}
        >
          <PreviewCard cardId={cardId} cost={cost} scale={scale} />
        </motion.div>
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        // Dark scrim over the blurred scene; the card is the only lit thing.
        ...scrimStyle,
        zIndex: 90,
      }}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={spring.snappy}
      >
        <PreviewCard cardId={cardId} cost={cost} scale={scale} />
      </motion.div>
    </motion.div>
  );
}
