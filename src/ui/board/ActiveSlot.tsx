import { AnimatePresence } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { HeroSlot } from './HeroSlot';
import { DealSticker, DealtTile } from './BoardIntro';
import { SlotWell, slotBox } from './BoardTable';
import type { ArmedPlay } from '../helpers';

interface Props {
  ps: PlayerState;
  owner: PlayerID;
  myId: PlayerID;
  isOpponent: boolean;
  pending: ArmedPlay | null;
  onTapHero: (c: CardInstance, owner: PlayerID) => void;
  onLongPressHero?: (c: CardInstance) => void;
  onEquipmentHover?: (eq: CardInstance | null) => void;
  isTargetable: (card: CardInstance) => boolean;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  isCurrentTurn?: boolean;
  /** Heroes here that can still do something this turn (the ready glint). */
  readyIids?: ReadonlySet<string>;
  /** The empty lane may take the hero picked up from the hand: its well
   *  lights and takes the tap (`onTapSlot`). */
  laneOpen?: boolean;
  onTapSlot?: () => void;
  /** Where the row starts, px down the stage (boardStack). */
  top: number;
}

/**
 * One Active slot in the stage's centre column, a card's width wider than a
 * bench slot (the duel is the focus): the card miniature, or a plain empty
 * outline. The rival's sits above the centre ring, yours below.
 */
export function ActiveSlot({
  ps, owner, myId, isOpponent, pending, onTapHero, onLongPressHero, onEquipmentHover,
  isTargetable, registerSlotRef, isCurrentTurn, readyIids, laneOpen = false, onTapSlot, top,
}: Props) {
  const card = ps.active;
  const box = slotBox(top, 'active');
  return (
    <>
      <AnimatePresence mode="popLayout">
        {card ? (
          // Opacity-only presence — the HeroSlot's shared layoutId animates
          // the actual bench↔active travel (see DealtTile for the rationale).
          <DealtTile key={card.iid} owner={owner} slot="active" style={box}>
            <HeroSlot
              card={card}
              owner={owner}
              myId={myId}
              pending={pending}
              isTargetable={isTargetable(card)}
              isCurrentTurn={isCurrentTurn}
              onTap={onTapHero}
              onLongPress={onLongPressHero}
              onEquipmentHover={onEquipmentHover}
              registerSlotRef={registerSlotRef}
              ready={readyIids?.has(card.iid)}
              flexSlot={ps.flexSlot}
            />
          </DealtTile>
        ) : (
          <SlotWell key="empty-active" style={box} lit={laneOpen} name="Active slot" onTap={onTapSlot} />
        )}
      </AnimatePresence>
      {/* At the match's start, "Rival" / "You" names whose Active this is. */}
      <div style={{ ...box, pointerEvents: 'none' }}>
        <DealSticker rival={isOpponent} />
      </div>
    </>
  );
}
