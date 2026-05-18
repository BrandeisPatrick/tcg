import { ActiveSlot } from './ActiveSlot';
import type { CardInstance, GameState, PlayerID } from '@/engine/types';
import { palette, fonts } from './tokens';

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
  attackingIids?: Set<string>;
  playerSkillSpent?: boolean;
}

// The middle row of the 3-2-3 layout. Opp Active on the left, your Active on the right,
// with a vertical battlefield divider in the center carrying the turn indicator.
export function ActiveDuel({
  G, me, opp, isMyTurn, turn,
  pending, onTapHero, onLongPressHero, onEquipmentHover, isTargetable, registerSlotRef, attackingIids, playerSkillSpent,
}: Props) {
  // One accent (Soul cyan) used only when the focus is the player.
  // When it's the rival's turn, the pill fades to dim gray — no red noise.
  const accent = isMyTurn ? palette.accent : palette.textFaint;
  return (
    <div style={{
      position: 'relative',
      display: 'grid',
      gridTemplateColumns: '1fr 56px 1fr',
      gap: 0,
      height: '100%',
      alignItems: 'stretch',
    }}>
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
        attackingIids={attackingIids}
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
          width: 80, height: 200, transform: 'translate(-50%, -50%)',
          background: `radial-gradient(ellipse at center, ${accent}28, transparent 70%)`,
          filter: 'blur(10px)',
          pointerEvents: 'none',
        }} />
        {/* Turn pill - vertical */}
        <div style={{
          position: 'relative',
          zIndex: 2,
          padding: '14px 6px',
          background: `linear-gradient(180deg, ${palette.bg1}, ${palette.bg2})`,
          border: `1px solid ${isMyTurn ? accent : '#5a3f1c'}`,
          borderRadius: 999,
          boxShadow: isMyTurn
            ? `0 0 18px ${accent}55, 0 2px 6px rgba(40,20,0,0.25)`
            : `0 2px 6px rgba(40,20,0,0.22)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: accent,
            boxShadow: isMyTurn ? `0 0 8px ${accent}` : 'none',
          }} />
          <span style={{
            fontFamily: fonts.display, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.24em', textTransform: 'uppercase',
            color: palette.text,
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}>
            {isMyTurn ? 'Your Move' : "Rival's Move"}
          </span>
          <span style={{
            fontFamily: fonts.display, fontSize: 9,
            color: palette.textDim, letterSpacing: '0.18em',
            fontVariantNumeric: 'tabular-nums',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}>
            T{turn}
          </span>
        </div>
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
        attackingIids={attackingIids}
        isCurrentTurn={isMyTurn}
        playerSkillSpent={playerSkillSpent}
      />
    </div>
  );
}
