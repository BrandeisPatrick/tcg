import { useState } from 'react';
import { motion } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CardFrame } from '../card/CardFrame';
import { fonts, spring, text } from '../tokens';
import { PosterButton } from '../chrome';
import { poster, chamfer, sheetStyle, clipBoth, scrimStyle } from '../poster';
import { useViewport } from '../hooks/useViewport';

interface Props {
  cards: CardInstance[];
  onConfirm: (swapIids: string[]) => void;
}

/** INK TAG eyebrow — black plate, cream stencil caps. */
const inkTag = {
  display: 'inline-block',
  padding: '4px 9px',
  background: poster.ink,
  color: poster.paper,
  fontFamily: fonts.display,
  fontSize: 10,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  lineHeight: 1,
  ...clipBoth(chamfer(4)),
};

export function MulliganOverlay({ cards, onConfirm }: Props) {
  const { isMobile, isTablet, width } = useViewport();
  // Tablet widths (768-1023) can't hold three full-size cards inside the
  // sheet's padding, so the deal gets the phone treatment there too:
  // hand-size cards, a wrapping row and a scrollable scrim.
  // Full-size cards are 300px: three of them plus gaps and the sheet's own
  // padding need ~1084px of viewport. Below that the deal switches to
  // hand-size cards that wrap, so the row never runs past the paper edge.
  const compact = isMobile || isTablet || width < 1100;
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
        ...scrimStyle,
        flexDirection: 'column',
        zIndex: 95,
        padding: isMobile ? 16 : 32,
        overflowY: compact ? 'auto' : undefined,
      }}
    >
      {/* The sheet — one cream print carrying the title, the deal and the lock. */}
      <section style={{
        ...sheetStyle,
        margin: 'auto',
        maxWidth: '100%',
        borderRadius: isMobile ? 16 : 18,
        padding: isMobile ? '22px 16px 20px' : '30px 36px 28px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        color: poster.ink,
      }}>
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={spring.snappy}
          style={{
            marginBottom: 28, textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}
        >
          <span style={inkTag}>Opening hand</span>
          <div style={{
            fontFamily: fonts.display,
            fontSize: isMobile ? 22 : 26,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            lineHeight: 1,
            color: poster.ink,
          }}>
            Reshuffle Your Opening
          </div>
          <span aria-hidden style={{ width: 44, height: 3, background: poster.red }} />
          <div style={{ ...text.body, color: poster.inkDim, maxWidth: 420 }}>
            Tap any cards to send them back to your deck. Then lock in your opening hand.
          </div>
        </motion.div>

        {/* Cards — dealt one after another (stagger) so the opening hand reads
            as a deal, not a wall. The outer div owns the entrance; the inner
            button keeps its own animate for the swap-toggle state. */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } } }}
          style={{
            display: 'flex',
            flexWrap: compact ? 'wrap' : 'nowrap',
            justifyContent: 'center',
            gap: isMobile ? 12 : 24,
            marginBottom: isMobile ? 20 : 32,
          }}
        >
          {cards.map((c) => {
            const isSwapping = selected.has(c.iid);
            return (
              <motion.div
                key={c.iid}
                variants={{
                  hidden: { y: 36, opacity: 0, scale: 0.92 },
                  show: { y: 0, opacity: 1, scale: 1, transition: spring.default },
                }}
              >
              <motion.button
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
                  size={compact ? 'hand' : 'full'}
                  glow={isSwapping ? 'danger' : 'accent'}
                />
                {isSwapping && (
                  // Red wash at the card's own radius, with the SWAP sticker
                  // stuck over the middle.
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 10,
                    background: 'rgba(212, 57, 44, 0.22)',
                    pointerEvents: 'none',
                  }}>
                    <span style={{
                      padding: '6px 12px 7px',
                      borderRadius: 3,
                      background: poster.red,
                      color: poster.paper,
                      fontFamily: fonts.display,
                      fontSize: 10,
                      letterSpacing: '0.24em',
                      textTransform: 'uppercase',
                      lineHeight: 1,
                      boxShadow: '0 3px 8px rgba(0, 0, 0, 0.35)',
                    }}>
                      Swap
                    </span>
                  </div>
                )}
              </motion.button>
              </motion.div>
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
          <PosterButton
            variant="paper"
            onClick={() => onConfirm([...selected])}
            style={{ minWidth: 200 }}
          >
            {swapCount === 0 ? 'Lock In' : `Reshuffle ${swapCount}`}
          </PosterButton>
        </motion.div>
      </section>
    </motion.div>
  );
}
