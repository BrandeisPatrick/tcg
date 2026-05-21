import { motion } from 'framer-motion';
import type { GameState, PlayerID } from '@/engine/types';
import { palette, radius, text } from '../tokens';
import { OrderBadge } from './OrderBadge';
import { SoulGem } from './SoulGem';

/**
 * Side-panel block for one patron: HP bar (with projected-damage stripe),
 * Souls counter, and Skill availability dot. Used for both "Sapphire Flame"
 * (opponent) and "Amber Hand" (you).
 */
export function PlayerCard({
  label, ps, hostile, active, order, projectedFaceDamage,
}: {
  label: string;
  ps: GameState['players'][PlayerID];
  hostile?: boolean;
  active?: boolean;
  order?: '1st' | '2nd';
  projectedFaceDamage?: number;
}) {
  const color = hostile ? palette.danger : palette.accent;
  const hpFrac = Math.max(0, Math.min(1, ps.hp / ps.hpMax));
  const projectedHp = Math.max(0, ps.hp - (projectedFaceDamage ?? 0));
  const projectedFrac = Math.max(0, Math.min(1, projectedHp / ps.hpMax));
  const hasIncoming = !!projectedFaceDamage && projectedFaceDamage > 0;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: 10,
      borderRadius: radius.md,
      border: `1px solid ${palette.border}`,
      background: 'transparent',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            ...text.label, color: palette.textDim, whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: active ? palette.accent : palette.textFaint,
            }} />
            {label}
          </span>
          {order && <OrderBadge order={order} color={palette.textFaint} />}
        </div>
        <span style={{ ...text.body, color: palette.textFaint }}>
          deck {ps.deck.length} · disc {ps.discard.length}{hostile ? ` · hand ${ps.hand.length}` : ''}
        </span>
      </div>
      <div style={{
        position: 'relative', height: 8, borderRadius: 4,
        background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, width: `${hpFrac * 100}%`,
          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
          transition: 'width 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        }} />
        {/* Predicted HP drop overlay (dimmer red wash on the slice that's about to be lost) */}
        {hasIncoming && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${projectedFrac * 100}%`,
            width: `${(hpFrac - projectedFrac) * 100}%`,
            background: `repeating-linear-gradient(45deg, ${palette.danger}cc 0 4px, ${palette.danger}88 4px 8px)`,
            transition: 'all 200ms ease',
          }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ ...text.label, color: palette.textFaint }}>HP</span>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
          {hasIncoming && (
            <span style={{
              padding: '1px 6px', borderRadius: 4,
              background: `${palette.danger}cc`, color: '#fff',
              textShadow: '0 1px 1px rgba(0,0,0,0.5)',
              ...text.label,
            }}>▼{projectedFaceDamage}</span>
          )}
          <span style={{ ...text.numeric, fontSize: 16, color: palette.textDim }}>
            {ps.hp}<span style={{ ...text.body, color: palette.textFaint, marginLeft: 2 }}> / {ps.hpMax}</span>
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        <span style={{ ...text.label, color: palette.textFaint }}>Souls</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <SoulGem />
          <span style={{ ...text.numeric, fontSize: 16, color: palette.accentWarm }}>{ps.souls}</span>
        </span>
      </div>
      {/* Skill availability dot + respawn queue */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, minHeight: 16 }}>
        <span style={{ ...text.label, color: palette.textFaint }}>Skill</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {ps.skillUsedThisTurn ? (
            <span style={{
              display: 'inline-block',
              width: 8, height: 8, borderRadius: '50%',
              background: palette.textFaint,
            }} />
          ) : (
            <motion.span
              animate={{ opacity: [0.6, 1, 0.6], scale: [0.92, 1.08, 0.92] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                display: 'inline-block',
                width: 8, height: 8, borderRadius: '50%',
                background: palette.success,
                boxShadow: `0 0 8px ${palette.success}`,
              }}
            />
          )}
          <span style={{ ...text.label, color: ps.skillUsedThisTurn ? palette.textFaint : palette.success }}>
            {ps.skillUsedThisTurn ? 'Used' : 'Ready'}
          </span>
        </span>
      </div>
    </div>
  );
}
