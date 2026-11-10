/**
 * A draw card's discard (docs/deck-plan.md): the player has drawn, and now
 * picks `count` cards from anywhere in the hand to go to the discard pile.
 * Nothing else can be done until it is paid, so the sheet cannot be backed out
 * of. Tap a card to mark it (again to unmark); the button discards the marked
 * cards once exactly `count` are marked.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import type { CardId, CardInstance } from '@/engine/types';
import { cardName } from '@/cards';
import { CardFrame } from '../card/CardFrame';
import { PosterButton } from '../chrome';
import { fonts, spring } from '../tokens';
import { poster, scrimStyle, sheetStyle } from '../poster';
import { PatronSigil, bandStyle, scale as type } from '../hud';
import { useViewport } from '../hooks/useViewport';
import { HandThumb } from '../board/HandThumb';

/** The sheet's accessible name, by which the tutorial and the QA scripts find it. */
export const DISCARD_SHEET = 'Discard from your hand';

export function DiscardOverlay({ hand, count, drawCard, onDiscard }: {
  hand: CardInstance[];
  count: number;
  /** The draw card that asked for the discard. */
  drawCard: CardId;
  onDiscard: (iids: string[]) => void;
}) {
  const { isMobile } = useViewport();
  const [marked, setMarked] = useState<string[]>([]);
  const toggle = (iid: string) => setMarked((m) => (m.includes(iid) ? m.filter((x) => x !== iid) : m.length >= count ? [...m.slice(1), iid] : [...m, iid]));
  const ready = marked.length === count;
  // Desktop: the hand's own cards at two thirds; a phone: the strip's thumbs.
  const scale = 0.66;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ ...scrimStyle, zIndex: 100, padding: isMobile ? 12 : 32, overflowY: 'auto' }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        transition={spring.snappy}
        role="dialog"
        aria-label={DISCARD_SHEET}
        style={{
          ...sheetStyle,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isMobile ? 14 : 20,
          padding: isMobile ? '0 0 18px' : '0 0 26px',
          borderRadius: 12,
          overflow: 'hidden',
          maxWidth: 860,
          color: poster.ink,
        }}
      >
        {/* The header band, in your patron's amber: the card that asked, and
            how many to let go. */}
        <div style={{
          ...bandStyle(poster.you),
          alignSelf: 'stretch',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          padding: '11px 16px 10px', textAlign: 'center',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: type.title }}>
            <PatronSigil side="you" size={18} color={poster.ink} />
            Discard {count}
          </span>
          <span style={{ fontFamily: fonts.ui, fontWeight: 700, fontSize: type.label, letterSpacing: '0.12em' }}>
            {cardName(drawCard)}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: isMobile ? 8 : 12, padding: isMobile ? '10px 12px 0' : '10px 26px 0' }}>
          {hand.map((c) => {
            const on = marked.includes(c.iid);
            return (
              <motion.button
                key={c.iid}
                type="button"
                aria-label={`${cardName(c.cardId)}${on ? ', marked to discard' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(c.iid)}
                whileTap={{ scale: 0.96 }}
                animate={{ y: on ? -8 : 0, opacity: on ? 0.75 : 1 }}
                transition={spring.snappy}
                style={{ position: 'relative', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', lineHeight: 0 }}
              >
                {isMobile ? (
                  <HandThumb cardId={c.cardId} armed={on} />
                ) : (
                  <div style={{ width: 134 * scale, height: 188 * scale }}>
                    <div style={{ width: 134, height: 188, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                      <CardFrame cardId={c.cardId} size="hand" glow={on ? 'danger' : null} tapExplains={false} />
                    </div>
                  </div>
                )}
                {on && (
                  <span aria-hidden style={{
                    position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                    background: poster.red, color: poster.paper, fontSize: type.label, lineHeight: '20px', textAlign: 'center',
                    fontFamily: fonts.display, boxShadow: `0 0 0 2px ${poster.paper}`,
                  }}>✕</span>
                )}
              </motion.button>
            );
          })}
        </div>
        <PosterButton variant="ink" size="sm" disabled={!ready} onClick={() => ready && onDiscard(marked)}>
          {ready ? 'Discard' : `Pick ${count - marked.length}`}
        </PosterButton>
      </motion.div>
    </motion.div>
  );
}
