import { motion } from 'framer-motion';
import type { CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { HeroPortrait } from '@/cards/art/heroArt';
import { effectiveAtk } from '@/engine/query';
import { fonts, spring, text } from '../tokens';
import { atkInk, poster, sheetStyle, scrimStyle } from '../poster';
import { HpSegments, PatronSigil, Souls, bandStyle, hpNumberStyle, scale } from '../hud';
import { SwordIcon } from '../card/Icons';
import { PosterButton } from '../chrome';
import { useViewport } from '../hooks/useViewport';

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
  /** The fallen hero's wait before it goes back to the hand, own turns
   *  (RESPAWN_TURNS), for the promotion's footnote. */
  backIn?: number;
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
 * candidate is a tappable charcoal-framed portrait card. Board wraps this in
 * its own AnimatePresence, which drives the exit fade.
 */
export function PromotionOverlay({ candidates, leavingName, retreat, opening, backIn, ride, onPick }: Props) {
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
            : backIn
            ? `Back in your hand in ${backIn} turn${backIn === 1 ? '' : 's'}.`
            : 'Back in your hand.'}
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
        <HeroPortrait cardId={card.cardId} />
        {/* Inner edge — the print sits slightly recessed in its frame. */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.35), inset 0 -18px 24px -12px rgba(0, 0, 0, 0.5)',
        }} />
      </div>
      <div style={{
        padding: '7px 8px 8px',
        background: poster.paperBand,
        borderTop: `1px solid ${poster.inkRule}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}>
        <span style={{
          fontFamily: fonts.display,
          fontSize: scale.body,
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
          const atk = effectiveAtk(card);
          const shield = card.statuses?.find((st) => st.id === 'shield')?.value ?? 0;
          // Health the same on every candidate: the plain ink number and the
          // segmented bar, straight on the label. Bullet Power is an ink
          // number with its icon.
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box' }}>
              <span role="img" aria-label={`${card.hp} of ${card.hpMax} HP`} style={{
                flex: 1, minWidth: 0,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 0',
              }}>
                <span style={hpNumberStyle(scale.number)}>{card.hp}</span>
                <HpSegments hp={card.hp} max={card.hpMax} shield={shield} width="100%" height={8} />
              </span>
              <span role="img" aria-label={`${atk} Bullet Power`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <SwordIcon size={12} color={atkInk(atk, baseAtk)} />
                <span style={{ ...text.numeric, fontSize: scale.number, color: atkInk(atk, baseAtk) }}>{atk}</span>
              </span>
            </div>
          );
        })()}
      </div>
    </motion.button>
  );
}
