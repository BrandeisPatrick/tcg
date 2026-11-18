import { motion } from 'framer-motion';
import type { CardInstance, PlayerID } from '@/engine/types';
import { fonts, spring, text } from '../tokens';
import { poster, sheetStyle, scrimStyle } from '../poster';
import { PatronSigil, Souls, bandStyle, scale } from '../hud';
import { PosterButton } from '../chrome';
import { useViewport } from '../hooks/useViewport';
import { HeroSlot } from '../board/HeroSlot';

/** A candidate's card: the board's Active card's measures (HeroSlot), a
 *  step smaller on a phone. */
const CARD_W = 150;
const CARD_H = 206;
const CARD_W_PHONE = 128;
const CARD_H_PHONE = 176;

interface Props {
  candidates: CardInstance[];
  /** The Active leaving the lane — fallen, or retreating. */
  leavingName: string;
  /** Set when this is a paid retreat rather than a promotion off a fallen
   *  Active: the sheet says so, prints the cost, and can be backed out of. */
  retreat?: { cost: number; onCancel: () => void };
  /** Set at the match's opening: the candidates are the heroes in the
   *  opening hand, and the one picked is the side's first Active. */
  opening?: true;
  /** Set when the lane was left empty by a ride rather than a fall (Rem's Tag
   *  Along from the Active slot): `leavingName` rides on `bearerName`, and the
   *  sheet says so. */
  ride?: { bearerName: string };
  onPick: (heroIid: string) => void;
}

/**
 * The "choose your new Active" modal. It opens when the local player's
 * Active has been KO'd (or has ridden off on an ally: Rem's Tag Along) and a
 * bench hero must step up — then it blocks other
 * interactions until a choice is made (no backdrop dismiss) — and when the
 * player retreats with more than one hero able to go in, where the backdrop
 * and a Cancel button back out. A cream sheet on the dark scrim; each
 * candidate is the hero's own card as the board prints it (HeroSlot: its
 * health, level, items, statuses and numbers; Patrick, 2026-11-18: "here we
 * should just use normal card UI (card UI on board)"), and a tap on it picks
 * it. Board wraps this in its own AnimatePresence, which drives the exit
 * fade.
 */
export function PromotionOverlay({ candidates, leavingName, retreat, opening, ride, onPick }: Props) {
  const { isMobile } = useViewport();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={retreat?.onCancel}
      style={{
        ...scrimStyle,
        zIndex: 100, padding: isMobile ? 16 : 32,
        overflowY: isMobile ? 'auto' : undefined,
      }}
    >
      <motion.div
        initial={{ y: 20, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        transition={spring.snappy}
        role="dialog"
        aria-label={opening ? 'Choose your first Active' : 'Choose your new Active'}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...sheetStyle,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: isMobile ? 16 : 20,
          padding: isMobile ? '0 0 18px' : '0 0 24px',
          borderRadius: 12,
          overflow: 'hidden',
          maxWidth: 720,
          color: poster.ink,
        }}
      >
        {/* The header band, in your patron's amber: who left the lane, then
            the ask. */}
        <div style={{
          ...bandStyle(poster.you),
          alignSelf: 'stretch',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          padding: '11px 16px 10px',
          textAlign: 'center',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: scale.title }}>
            <PatronSigil side="you" size={18} color={poster.ink} />
            {opening ? 'Your opening hand' : `${leavingName} ${retreat ? 'retreats' : ride ? 'rides off' : 'fell'}`}
          </span>
          <span style={{ fontFamily: fonts.ui, fontWeight: 700, fontSize: scale.label, letterSpacing: '0.12em' }}>
            {opening ? 'Choose your first Active' : 'Choose your new Active'}
          </span>
        </div>

        <div style={{
          display: 'grid',
          // 3-up on desktop; phones wrap to at most 2-up so the row never
          // exceeds the screen width.
          gridTemplateColumns: `repeat(${Math.min(candidates.length, isMobile ? 2 : 3)}, ${isMobile ? CARD_W_PHONE : CARD_W}px)`,
          gap: isMobile ? 12 : 16,
          justifyContent: 'center',
        }}>
          {/* Staggered entrance — candidates rise in one after another so the
              modal reads as a choice being presented, not a static wall. */}
          {candidates.map((c, i) => (
            <motion.div
              key={c.iid}
              initial={{ y: 22, opacity: 0, scale: 0.94 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ ...spring.default, delay: 0.1 + i * 0.07 }}
            >
              <div style={{ width: isMobile ? CARD_W_PHONE : CARD_W, height: isMobile ? CARD_H_PHONE : CARD_H }}>
                <HeroSlot
                  card={c}
                  owner={c.ownerId as PlayerID}
                  myId={c.ownerId as PlayerID}
                  pending={null}
                  isTargetable={false}
                  tall={isMobile ? CARD_H_PHONE : CARD_H}
                  offBoard
                  onTap={() => onPick(c.iid)}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* One short line: what happens to the hero leaving the lane. */}
        <span style={{ ...text.body, fontSize: scale.body, color: poster.inkSoft, textAlign: 'center', padding: '0 18px', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {opening
            ? 'The rest stay in your hand.'
            : retreat
            ? (retreat.cost > 0
              ? <>{leavingName} goes to the bench for <Souls n={retreat.cost} size={scale.body} tone="paper" /></>
              : `${leavingName} goes to the bench, free.`)
            : ride
            ? `Back on your bench when the ride ends.`
            : `${leavingName} is shuffled into your deck.`}
        </span>
        {retreat && (
          <PosterButton variant="ink" size="sm" onClick={retreat.onCancel}>Cancel</PosterButton>
        )}
      </motion.div>
    </motion.div>
  );
}
