import { ActiveSlot } from './ActiveSlot';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { poster } from '../poster';
import { SheetRow } from './BoardTable';
import { TurnCompass, type TurnPhase } from './TurnCompass';
import { useBoardLayout } from './layout';
import type { ArmedPlay } from '../helpers';

interface Props {
  G: GameState;
  me: PlayerID;
  opp: PlayerID;
  isMyTurn: boolean;
  turn: number;
  /** Where the turn stands — shown by the dial. */
  phase: TurnPhase;
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
 * The lane, the sheet's middle row: the rival's Active in the left column,
 * yours in the right, and between them a printed hairline carrying the turn
 * dial. The centre column (`data-lane-mid`) is also where the turn banner,
 * the targeting tag and a refused move's notice are shown, so none of them
 * lands on a card or a control. The Mid-Boss pit that stood here is off for
 * now (BossPit stays in the code, unused).
 */
export function ActiveDuel({
  G, me, opp, isMyTurn, turn, phase,
  pending, onTapHero, onLongPressHero, onEquipmentHover, isTargetable, registerSlotRef, readyIids, laneOpen, onTapLane,
}: Props) {
  const L = useBoardLayout();
  return (
    <SheetRow L={L} h={L.lane} lane tag="Lane">
      {/* Rival Active (left) */}
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

      {/* The line between the two, and the turn dial on it. */}
      <div data-lane-mid style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
      }}>
        <div aria-hidden style={{
          position: 'absolute', top: 0, bottom: 0, left: '50%',
          width: 1, transform: 'translateX(-50%)',
          background: `linear-gradient(180deg, transparent 0%, ${poster.inkFaint} 18%, ${poster.inkFaint} 82%, transparent 100%)`,
          pointerEvents: 'none',
        }} />
        <TurnCompass isMyTurn={isMyTurn} turn={turn} phase={phase} beats={!G.draft} />
      </div>

      {/* My Active (right) */}
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
    </SheetRow>
  );
}
