/**
 * The upgrade a play makes, when Deadlock builds the item into more than one
 * (docs/deck-plan.md: Extra Health → Fortitude or Colossus). The player picks
 * one; it is made and shuffled into the deck as the item goes on. Cancel backs
 * out of the play altogether: the card stays in the hand.
 */
import { motion } from 'framer-motion';
import type { CardId } from '@/engine/types';
import { cardName } from '@/cards';
import { CardFrame } from '../card/CardFrame';
import { ItemLine } from './ItemLine';
import { PosterButton } from '../chrome';
import { fonts, spring } from '../tokens';
import { poster, scrimStyle, sheetStyle } from '../poster';
import { useViewport } from '../hooks/useViewport';

/** The sheet's accessible name. */
export const UPGRADE_SHEET = 'Choose the upgrade';

export function UpgradePicker({ itemId, options, onPick, onCancel }: {
  /** The item being played. */
  itemId: CardId;
  options: readonly CardId[];
  onPick: (upgradeId: CardId) => void;
  onCancel: () => void;
}) {
  const { isMobile } = useViewport();
  const scale = isMobile ? 0.62 : 0.8;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onCancel}
      style={{ ...scrimStyle, zIndex: 100, padding: isMobile ? 12 : 32, overflowY: 'auto' }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        transition={spring.snappy}
        role="dialog"
        aria-label={UPGRADE_SHEET}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...sheetStyle,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 14 : 20,
          padding: isMobile ? '18px 14px' : '26px 30px',
          borderRadius: isMobile ? 16 : 18,
          maxWidth: 760,
          ...(isMobile ? { width: 'min(100%, 460px)', boxSizing: 'border-box' as const } : null),
          color: poster.ink,
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: fonts.display, fontSize: 22, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1 }}>
            {cardName(itemId)}
          </span>
          <span style={{ fontFamily: fonts.display, fontSize: isMobile ? 11.5 : 13, letterSpacing: isMobile ? '0.16em' : '0.18em', textTransform: 'uppercase', lineHeight: 1.2 }}>
            Choose the upgrade to shuffle into your deck
          </span>
        </div>
        {/* A phone has no room for two or three whole cards at a size their
            rules can be read at: there each upgrade is a line with its art,
            name and whole rule. A wide screen keeps the cards. */}
        <div style={isMobile
          ? { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, width: '100%' }
          : { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18 }}>
          {options.map((id) => (
            <motion.button
              key={id}
              type="button"
              aria-label={`Make ${cardName(id)}`}
              onClick={() => onPick(id)}
              whileHover={isMobile ? undefined : { y: -6 }}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
              style={isMobile
                ? { display: 'block', width: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', font: 'inherit' }
                : { padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', lineHeight: 0 }}
            >
              {isMobile ? <ItemLine cardId={id} /> : (
                <div style={{ width: 300 * scale * 0.75, height: 420 * scale * 0.75 }}>
                  <div style={{ width: 300, height: 420, transform: `scale(${scale * 0.75})`, transformOrigin: 'top left' }}>
                    <CardFrame cardId={id} size="full" tapExplains={false} />
                  </div>
                </div>
              )}
            </motion.button>
          ))}
        </div>
        <PosterButton variant="ink" size="sm" onClick={onCancel}>Cancel</PosterButton>
      </motion.div>
    </motion.div>
  );
}
