import { motion, AnimatePresence } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { HeroSlot } from './HeroSlot';
import { palette, text } from '../tokens';

interface Props {
  ps: PlayerState;
  owner: PlayerID;
  myId: PlayerID;
  isOpponent: boolean;
  pending: { iid: string; kind: 'playCard' | 'useSkill'; filter: string } | null;
  onTapHero: (c: CardInstance, owner: PlayerID) => void;
  onLongPressHero?: (c: CardInstance) => void;
  onEquipmentHover?: (eq: CardInstance | null) => void;
  isTargetable: (card: CardInstance, owner: PlayerID) => boolean;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  isCurrentTurn?: boolean;
  playerSkillSpent?: boolean;
}

// One prominent Active slot centered horizontally. Larger than bench slots.
export function ActiveSlot({
  ps, owner, myId, isOpponent, pending, onTapHero, onLongPressHero, onEquipmentHover,
  isTargetable, registerSlotRef, isCurrentTurn, playerSkillSpent,
}: Props) {
  const card = ps.active;
  const accent = isOpponent ? palette.danger : palette.accent;

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
      gap: 14,
    }}>
      {/* Row label moved to ActiveDuel — sits at the left edge of the row
          (matching the Bench label style) instead of overlapping each tile. */}
      <div style={{ width: '100%', height: '100%', maxHeight: 280 }}>
        <AnimatePresence mode="popLayout">
          {card ? (
            <motion.div
              key={card.iid}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0, rotate: isOpponent ? 8 : -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{ height: '100%' }}
            >
              <HeroSlot
                card={card}
                owner={owner}
                myId={myId}
                isOpponent={isOpponent}
                pending={pending}
                isTargetable={isTargetable(card, owner)}
                isCurrentTurn={isCurrentTurn}
                onTap={onTapHero}
                onLongPress={onLongPressHero}
                onEquipmentHover={onEquipmentHover}
                registerSlotRef={registerSlotRef}
                playerSkillSpent={playerSkillSpent}
              />
            </motion.div>
          ) : (
            <EmptyActive accent={accent} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function EmptyActive({ accent }: { accent: string }) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      borderRadius: 6,
      background: 'rgba(255,255,255,0.015)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <span style={{ position: 'absolute', top: 0, left: 0, width: 12, height: 12, borderTop: `2px solid ${accent}66`, borderLeft: `2px solid ${accent}66` }} />
      <span style={{ position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderTop: `2px solid ${accent}66`, borderRight: `2px solid ${accent}66` }} />
      <span style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 12, borderBottom: `2px solid ${accent}66`, borderLeft: `2px solid ${accent}66` }} />
      <span style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderBottom: `2px solid ${accent}66`, borderRight: `2px solid ${accent}66` }} />
      <span style={{ ...text.label, color: accent, opacity: 0.5 }}>Active K.O.</span>
    </div>
  );
}
