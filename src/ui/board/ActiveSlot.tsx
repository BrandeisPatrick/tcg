import { AnimatePresence } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { HeroSlot } from './HeroSlot';
import { DealSticker, DealtTile } from './BoardIntro';
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
  isTargetable: (card: CardInstance) => boolean;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  isCurrentTurn?: boolean;
  /** Heroes here that can still do something this turn (the ready glint). */
  readyIids?: ReadonlySet<string>;
}

// One prominent Active slot centered horizontally. Larger than bench slots.
// The owner colour (rival red / your gold) only paints the empty well; the
// tile itself carries its own frame states.
export function ActiveSlot({
  ps, owner, myId, isOpponent, pending, onTapHero, onLongPressHero, onEquipmentHover,
  isTargetable, registerSlotRef, isCurrentTurn, readyIids,
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
            // the actual bench↔active travel (see DealtTile for the rationale).
            <DealtTile key={card.iid} owner={owner} slot="active" style={{ height: '100%' }}>
              <HeroSlot
                card={card}
                owner={owner}
                myId={myId}
                isOpponent={isOpponent}
                pending={pending}
                isTargetable={isTargetable(card)}
                isCurrentTurn={isCurrentTurn}
                onTap={onTapHero}
                onLongPress={onLongPressHero}
                onEquipmentHover={onEquipmentHover}
                registerSlotRef={registerSlotRef}
                ready={readyIids?.has(card.iid)}
              />
            </DealtTile>
          ) : (
            <SlotWell accent={accent} label="Active K.O." />
          )}
        </AnimatePresence>
      </div>
      {/* At the match's start, "Rival" / "You" names whose Active this is. */}
      <DealSticker rival={isOpponent} />
    </div>
  );
}
