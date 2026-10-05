import { motion } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { HeroPortrait } from '@/cards/art/heroArt';
import { effectiveAtk } from '@/engine/query';
import { fonts, spring, text } from '../tokens';
import { poster, sheetStyle, scrimStyle } from '../poster';
import { PosterButton } from '../chrome';
import { useViewport } from '../hooks/useViewport';

interface Props {
  candidates: CardInstance[];
  /** The Active leaving the lane — fallen, or retreating. */
  leavingName: string;
  /** Set when this is a paid retreat rather than a promotion off a fallen
   *  Active: the sheet says so, prints the cost, and can be backed out of. */
  retreat?: { cost: number; onCancel: () => void };
  onPick: (heroIid: string) => void;
}

/**
 * The "choose your new Active" modal. It opens when the local player's
 * Active has been KO'd and a bench hero must step up — then it blocks other
 * interactions until a choice is made (no backdrop dismiss) — and when the
 * player retreats with more than one hero able to go in, where the backdrop
 * and a Cancel button back out. A cream sheet on the dark scrim; each
 * candidate is a tappable charcoal-framed portrait card. Board wraps this in
 * its own AnimatePresence, which drives the exit fade.
 */
export function PromotionOverlay({ candidates, leavingName, retreat, onPick }: Props) {
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
        aria-label="Choose your new Active"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...sheetStyle,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: isMobile ? 18 : 24,
          padding: isMobile ? '22px 18px' : '28px 32px',
          borderRadius: isMobile ? 16 : 18,
          maxWidth: 720,
          color: poster.ink,
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: fonts.display,
            fontSize: 22,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            lineHeight: 1,
            color: retreat ? poster.ink : poster.red,
          }}>{leavingName} {retreat ? 'Retreats' : 'Fell'}</span>
          <span style={{
            fontFamily: fonts.display,
            fontSize: 13,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            lineHeight: 1,
            color: poster.ink,
          }}>Choose your new Active</span>
        </div>

        <div style={{
          display: 'grid',
          // 3-up on desktop; phones wrap to at most 2-up so the row never
          // exceeds the screen width.
          gridTemplateColumns: `repeat(${Math.min(candidates.length, isMobile ? 2 : 3)}, ${isMobile ? 140 : 156}px)`,
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
              <CandidateCard card={c} onPick={() => onPick(c.iid)} isMobile={isMobile} />
            </motion.div>
          ))}
        </div>

        <span style={{ ...text.body, color: poster.inkDim, textAlign: 'center' }}>
          {retreat
            ? `${leavingName} takes their bench slot. Retreat costs ${retreat.cost} souls.`
            : 'The fallen hero takes their bench slot to respawn.'}
        </span>
        {retreat && (
          <PosterButton variant="ink" size="sm" onClick={retreat.onCancel}>Cancel</PosterButton>
        )}
      </motion.div>
    </motion.div>
  );
}

/**
 * A bench hero as a charcoal-framed print: art edge to edge, a cream label
 * band with the name and the live BP · HP readout. The whole card is the
 * button; hover lifts it and lights the frame.
 */
function CandidateCard({ card, onPick, isMobile }: { card: CardInstance; onPick: () => void; isMobile: boolean }) {
  const data = CARDS_BY_ID[card.cardId];
  if (data?.type !== 'hero') return null;
  return (
    <motion.button
      whileHover={{ y: -6, scale: 1.03, borderColor: poster.frameLit }}
      whileTap={{ scale: 0.97 }}
      onClick={onPick}
      style={{
        position: 'relative',
        width: isMobile ? 140 : 156, height: isMobile ? 194 : 216,
        padding: 0,
        background: poster.frame,
        border: `2px solid ${poster.edge}`,
        borderRadius: 10,
        boxShadow: '0 14px 26px rgba(0, 0, 0, 0.35), 0 3px 8px rgba(0, 0, 0, 0.25)',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        color: poster.ink,
        textAlign: 'center',
      }}
    >
      <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0, background: '#0f1214' }}>
        <HeroPortrait cardId={card.cardId} full />
        {/* Inner edge — the print sits slightly recessed in its frame. */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.35), inset 0 -18px 24px -12px rgba(0, 0, 0, 0.5)',
        }} />
      </div>
      <div style={{
        padding: '8px 10px',
        background: poster.paperBand,
        borderTop: `1px solid ${poster.inkRule}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}>
        <span style={{
          fontFamily: fonts.display,
          fontSize: 13,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: 1.1,
          color: poster.ink,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{data.name}</span>
        {(() => {
          const heroData: any = data;
          const baseAtk: number = heroData.atk ?? 0;
          const baseHp: number = heroData.hp ?? 0;
          const atk = effectiveAtk(card);
          // Same ink rule as HeroSlot: each stat keeps its hue (ink for BP,
          // red for HP) and only shifts bright/dim to show drift from the
          // printed base.
          const atkColor = atk > baseAtk ? poster.stat.atkBright : atk < baseAtk ? poster.stat.atkDim : poster.stat.atk;
          const hpColor =
            card.hp < card.hpMax ? poster.stat.hpDim
            : card.hpMax > baseHp ? poster.stat.hpBright
            : poster.stat.hp;
          return (
            <div style={{ display: 'inline-flex', gap: 12, alignItems: 'baseline' }}>
              <span style={{ ...text.numeric, color: atkColor }}>{atk}</span>
              <span style={{ ...text.body, color: poster.inkFaint }}>·</span>
              <span style={{ ...text.numeric, color: hpColor }}>{card.hp}</span>
            </div>
          );
        })()}
      </div>
    </motion.button>
  );
}
