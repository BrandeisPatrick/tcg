import { ActiveSlot } from './ActiveSlot';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { boardRows } from './BoardTable';
import { useViewport } from '../hooks/useViewport';
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
 * The lane of the 3-1-1-3 board: the rival's Active above, yours below,
 * facing each other across the middle line (boardRows.lane). Mounted in a
 * box two Active rows and the line tall; the turn dial and the dock sit in
 * the sheet's rails beside it (Board.tsx), not between the tiles. The
 * Mid-Boss pit that stood between the Actives is off for now (BossPit stays
 * in the code, unused).
 */
export function ActiveDuel({
  G, me, opp, isMyTurn,
  pending, onTapHero, onLongPressHero, onEquipmentHover, isTargetable, registerSlotRef, readyIids, laneOpen, onTapLane,
}: Props) {
  const { isMobile } = useViewport();
  const h = boardRows.active(isMobile);
  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: boardRows.lane(isMobile),
      height: '100%',
    }}>
      {/* Rival Active (above the line) */}
      <div style={{ flex: `0 0 ${h}px`, height: h, minHeight: 0 }}>
        <ActiveSlot
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
      </div>

      {/* My Active (below the line) */}
      <div style={{ flex: `0 0 ${h}px`, height: h, minHeight: 0 }}>
        <ActiveSlot
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
      </div>
    </div>
  );
}
