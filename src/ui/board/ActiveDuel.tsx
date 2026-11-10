import { ActiveSlot } from './ActiveSlot';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { boardStack } from './BoardTable';
import type { ArmedPlay } from '../helpers';

interface Props {
  G: GameState;
  me: PlayerID;
  opp: PlayerID;
  isMyTurn: boolean;
  pending: ArmedPlay | null;
  onTapHero: (c: CardInstance, owner: PlayerID) => void;
  onLongPressHero?: (c: CardInstance) => void;
  onEquipmentHover?: (eq: CardInstance | null) => void;
  isTargetable: (card: CardInstance) => boolean;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  /** Your heroes that can still do something this turn (the ready glint). */
  readyIids?: ReadonlySet<string>;
  /** Your empty lane may take the hero picked up from the hand (ActiveSlot). */
  laneOpen?: boolean;
  onTapLane?: () => void;
}

/**
 * The lane of the 3-1-1-3 stage: the rival's Active above the centre ring,
 * yours below, facing each other across the seam (boardRows.lane). Each slot
 * is placed from the shared geometry (boardStack). The Mid-Boss pit that
 * stood between the Actives is off for now (BossPit stays in the code,
 * unused).
 */
export function ActiveDuel({
  G, me, opp, isMyTurn,
  pending, onTapHero, onLongPressHero, onEquipmentHover, isTargetable, registerSlotRef, readyIids, laneOpen, onTapLane,
}: Props) {
  const s = boardStack();
  return (
    <>
      {/* Rival Active (above the ring) */}
      <ActiveSlot
        top={s.activeR}
        ps={G.players[opp]}
        owner={opp} myId={me}
        isOpponent
        pending={pending}
        onTapHero={onTapHero}
        onLongPressHero={onLongPressHero}
        onEquipmentHover={onEquipmentHover}
        isTargetable={isTargetable}
        registerSlotRef={registerSlotRef}
        isCurrentTurn={!isMyTurn}
      />

      {/* My Active (below the ring) */}
      <ActiveSlot
        top={s.activeY}
        ps={G.players[me]}
        owner={me} myId={me}
        isOpponent={false}
        pending={pending}
        onTapHero={onTapHero}
        onLongPressHero={onLongPressHero}
        onEquipmentHover={onEquipmentHover}
        isTargetable={isTargetable}
        registerSlotRef={registerSlotRef}
        isCurrentTurn={isMyTurn}
        readyIids={readyIids}
        laneOpen={laneOpen}
        onTapSlot={onTapLane}
      />
    </>
  );
}
