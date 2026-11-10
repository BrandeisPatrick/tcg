import { motion } from 'framer-motion';
import { CardFrame } from '../card/CardFrame';
import { fonts, spring } from '../tokens';
import { poster, scrimStyle } from '../poster';
import { useViewport } from '../hooks/useViewport';
import { scale as T } from '../hud';

/** The full card's size (CardFrame SIZES.full) and the phone's share of it:
 *  the whole card filled a phone's width edge to edge. Fixed, not fluid — the
 *  preview is the same size every time it opens on a given screen. */
const FULL_W = 300;
const FULL_H = 420;
const PHONE_SCALE = 0.8;

/** The card at the preview's size: drawn at full size and scaled, so its
 *  type stays set as designed. */
function PreviewCard({ cardId, cost, hideCost, scale }: { cardId: string; cost?: number; hideCost?: boolean; scale: number }) {
  return (
    <div style={{ width: FULL_W * scale, height: FULL_H * scale }}>
      <div style={{ width: FULL_W, height: FULL_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <CardFrame cardId={cardId} cost={cost} hideCost={hideCost} size="full" />
      </div>
    </div>
  );
}

/** One thing the held preview offers under the card — selling a card in
 *  the hand. Greyed, with the reason under it, when it cannot be done now. */
export interface PreviewAction {
  label: string;
  ariaLabel: string;
  onPress: () => void;
  /** Why it cannot be done right now; set, the button is greyed. */
  blockedReason?: string;
}

interface Props {
  cardId: string;
  /** What this copy costs, when it is an instance (see CardFrame `cost`). */
  cost?: number;
  /** Print no cost coin (a card in the hand is paid for). */
  hideCost?: boolean;
  onClose: () => void;
  /** A peek while the pointer rests on the card: no scrim, and it blocks
   *  nothing (the owner closes it when the pointer leaves). Off, it is the
   *  held preview: a scrim, and a tap anywhere closes it. */
  hover?: boolean;
  /** What the held preview offers under the card. */
  action?: PreviewAction;
}

/**
 * The one place a card is previewed: the centre of the screen, at the full
 * card's size, wherever the preview came from (a hand card hovered or held,
 * an equipped item's chip, the story run's deck). Fixed spot, fixed size —
 * the eye learns where to look, and a phone never has it hanging off an edge.
 */
export function CardPreview({ cardId, cost, hideCost, onClose, hover = false, action }: Props) {
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
          <PreviewCard cardId={cardId} cost={cost} hideCost={hideCost} scale={scale} />
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
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
      >
        <PreviewCard cardId={cardId} cost={cost} hideCost={hideCost} scale={scale} />
        {action && (
          // The card's one move, under it. Its own tap does not close the
          // preview through the scrim: the move closes it when it is made.
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {/* A paper pill with an ink keyline; a faint outline on the scrim
                while it cannot be done. */}
            <motion.button
              type="button"
              disabled={!!action.blockedReason}
              onClick={action.onPress}
              aria-label={action.ariaLabel}
              whileTap={action.blockedReason ? undefined : { scale: 0.97 }}
              style={{
                minHeight: 44, minWidth: 140, padding: '0 22px', borderRadius: 999,
                border: `1.5px solid ${action.blockedReason ? poster.creamFaint : poster.ink}`,
                background: action.blockedReason ? 'transparent' : poster.paper,
                color: action.blockedReason ? poster.creamDim : poster.ink,
                boxShadow: action.blockedReason ? 'none' : '0 3px 0 rgba(0, 0, 0, 0.35)',
                fontFamily: fonts.display, fontSize: T.body, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1,
                cursor: action.blockedReason ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >
              {action.label}
            </motion.button>
            {action.blockedReason && (
              <span style={{ fontFamily: fonts.display, fontSize: T.label, letterSpacing: '0.14em', textTransform: 'uppercase', color: poster.cream, textAlign: 'center', maxWidth: FULL_W * scale }}>
                {action.blockedReason}
              </span>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
