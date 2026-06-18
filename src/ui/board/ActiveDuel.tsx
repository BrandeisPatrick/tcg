import { ActiveSlot } from './ActiveSlot';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { palette, text } from '../tokens';
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

// The middle row of the 3-2-3 layout. Opp Active on the left, your Active on the right,
// with a vertical battlefield divider in the center carrying the turn indicator.
export function ActiveDuel({
  G, me, opp, isMyTurn, turn,
  pending, onTapHero, onLongPressHero, onEquipmentHover, isTargetable, registerSlotRef, playerSkillSpent,
}: Props) {
  // One accent (Soul cyan) used only when the focus is the player.
  // When it's the rival's turn, the pill fades to dim gray — no red noise.
  const accent = isMyTurn ? palette.accent : palette.textFaint;
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
      {!isMobile && (
        <span style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          ...text.label, color: palette.textDim,
        }}>
          Lane
        </span>
      )}
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
        {/* Vertical glow line */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: '50%',
          width: 1, transform: 'translateX(-50%)',
          background: `linear-gradient(180deg, transparent 0%, ${accent}66 30%, ${accent} 50%, ${accent}66 70%, transparent 100%)`,
          boxShadow: `0 0 20px ${accent}55`,
        }} />
        {/* Glow blob */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 80, height: 140, transform: 'translate(-50%, -50%)',
          background: `radial-gradient(ellipse at center, ${accent}28, transparent 70%)`,
          filter: 'blur(10px)',
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
