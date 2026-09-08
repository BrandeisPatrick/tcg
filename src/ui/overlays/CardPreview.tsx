import { motion } from 'framer-motion';
import { CardFrame } from '../card/CardFrame';
import { spring } from '../tokens';
import { scrimStyle } from '../poster';

interface Props {
  cardId: string;
  onClose: () => void;
  hover?: boolean; // when true: floats non-blocking near the side, no backdrop
}

export function CardPreview({ cardId, onClose, hover = false }: Props) {
  if (hover) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20, scale: 0.92 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 10, scale: 0.95 }}
        transition={spring.snappy}
        style={{
          position: 'fixed',
          top: '50%',
          left: 'calc(50% - 240px)',
          transform: 'translateY(-50%)',
          zIndex: 92,
          pointerEvents: 'none',
          // One neutral drop — the print floats over the sheet with no colour cast.
          filter: 'drop-shadow(0 16px 28px rgba(0, 0, 0, 0.55))',
        }}
      >
        <CardFrame cardId={cardId} size="full" />
      </motion.div>
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
        <CardFrame cardId={cardId} size="full" />
      </motion.div>
    </motion.div>
  );
}
