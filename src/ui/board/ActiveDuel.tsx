import { ActiveSlot } from './ActiveSlot';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { poster } from '../poster';
import { RowPlaque } from './BoardTable';
import { TurnCompass } from './TurnCompass';
import { useViewport } from '../hooks/useViewport';

interface Props {
  G: GameState;
  me: PlayerID;
  opp: PlayerID;
  isMyTurn: boolean;
  turn: number;
  pending: { iid: string; kind: 'playCard' | 'useSkill'; filter: string } | null;
  onTapHero: (c: CardInstance, owner: PlayerID) => void;
  onLongPressHero?: (c: CardInstance) => void;
  onEquipmentHover?: (eq: CardInstance | null) => void;
  isTargetable: (card: CardInstance, owner: PlayerID) => boolean;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  playerSkillSpent?: boolean;
}

// The middle row of the 3-2-3 layout. Opp Active on the left, your Active on
// the right, with a printed hairline down the centre carrying the turn compass.
export function ActiveDuel({
  G, me, opp, isMyTurn, turn,
  pending, onTapHero, onLongPressHero, onEquipmentHover, isTargetable, registerSlotRef, playerSkillSpent,
}: Props) {
  const { isMobile } = useViewport();
  return (
    <div style={{
      position: 'relative',
      display: 'grid',
      // Same 3-column track as BenchRow so the three rows (Rival Bench →
      // Lane → Your Bench) column-align across the board. Col 2 hosts the
      // turn-indicator divider; col 1 and col 3 host the active heroes.
      // Phones swap the fixed 180px track for a width-capped 1fr track.
      gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, 180px)',
      gap: isMobile ? 8 : 28,
      width: isMobile ? '100%' : undefined,
      maxWidth: isMobile ? 420 : undefined,
      margin: isMobile ? '0 auto' : undefined,
      justifyContent: 'center',
      height: '100%',
      alignItems: 'stretch',
    }}>
      {/* Lane label — sits at the left edge of the row, matching the Bench
          labels' position so the three section labels stack down the left
          side of the board. One shared label since both sides share the lane. */}
      {!isMobile && <RowPlaque>Lane</RowPlaque>}
      {/* Opp Active (left) */}
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

      {/* Vertical divider with turn indicator */}
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Ink hairline — a flat printed rule; the compass carries whose turn it is. */}
        <div aria-hidden style={{
          position: 'absolute', top: 0, bottom: 0, left: '50%',
          width: 1, transform: 'translateX(-50%)',
          background: `linear-gradient(180deg, transparent 0%, ${poster.inkFaint} 18%, ${poster.inkFaint} 82%, transparent 100%)`,
          pointerEvents: 'none',
        }} />
        <TurnCompass isMyTurn={isMyTurn} turn={turn} />
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
        playerSkillSpent={playerSkillSpent}
      />
    </div>
  );
}
