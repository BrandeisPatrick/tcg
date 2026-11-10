import { AnimatePresence } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { HeroSlot } from './HeroSlot';
import { DealSticker, DealtTile } from './BoardIntro';
import { SlotWell } from './BoardTable';
import { tileStyle, useBoardLayout } from './layout';
import { poster } from '../poster';
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
}

/**
 * One Active slot, a cell of the lane (the rival's in the left column, yours
 * in the right): the hero's card, or a dashed empty outline. The owner's
 * colour (the rival's red, your gold) only paints the empty well's mark.
 */
export function ActiveSlot({
  ps, owner, myId, isOpponent, pending, onTapHero, onLongPressHero, onEquipmentHover,
  isTargetable, registerSlotRef, isCurrentTurn, readyIids, laneOpen = false, onTapSlot,
}: Props) {
  const L = useBoardLayout();
  const card = ps.active;
  return (
    // A grid cell is as tall as its row, not its content (SheetRow).
    <div style={{ position: 'relative', height: '100%', minHeight: 0 }}>
      <AnimatePresence mode="popLayout">
        {card ? (
          // Opacity-only presence — the HeroSlot's shared layoutId animates
          // the actual bench↔active travel (see DealtTile for the rationale).
          <DealtTile key={card.iid} owner={owner} slot="active" style={tileStyle}>
            <HeroSlot
              card={card}
              owner={owner}
              myId={myId}
              pending={pending}
              isTargetable={isTargetable(card)}
              isCurrentTurn={isCurrentTurn}
              tall={L.lane}
              onTap={onTapHero}
              onLongPress={onLongPressHero}
              onEquipmentHover={onEquipmentHover}
              registerSlotRef={registerSlotRef}
              ready={readyIids?.has(card.iid)}
              flexSlot={ps.flexSlot}
            />
          </DealtTile>
        ) : (
          <SlotWell key="empty-active" accent={isOpponent ? poster.rival : poster.you} lit={laneOpen} name="Active slot" onTap={onTapSlot} />
        )}
      </AnimatePresence>
      {/* At the match's start, "Rival" / "You" names whose Active this is. */}
      <DealSticker rival={isOpponent} />
    </div>
  );
}
