import { motion, AnimatePresence } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { HeroSlot } from './HeroSlot';
import { SlotWell } from './BoardTable';
import { poster } from '../poster';

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
// The owner colour (rival red / your gold) only paints the empty well; the
// tile itself carries its own frame states.
export function ActiveSlot({
  ps, owner, myId, isOpponent, pending, onTapHero, onLongPressHero, onEquipmentHover,
  isTargetable, registerSlotRef, isCurrentTurn, playerSkillSpent,
}: Props) {
  const card = ps.active;
  const accent = isOpponent ? poster.rival : poster.you;

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
    }}>
      {/* The 'Lane' plaque lives in ActiveDuel, in the sheet's left gutter. */}
      <div style={{ width: '100%', height: '100%', maxHeight: 280 }}>
        <AnimatePresence mode="popLayout">
          {card ? (
            // Opacity-only presence — the HeroSlot's shared layoutId animates
            // the actual bench↔active travel (see BenchRow for the rationale).
            <motion.div
              key={card.iid}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.25 }}
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
  return <SlotWell accent={accent} label="Active K.O." />;
}
