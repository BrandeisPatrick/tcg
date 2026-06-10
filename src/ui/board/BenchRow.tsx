import type { CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { HeroSlot } from './HeroSlot';
import { palette, text } from '../tokens';

interface Props {
  ps: PlayerState;
  owner: PlayerID;
  myId: PlayerID;
  isOpponent: boolean;
  pending: { iid: string; kind: 'playCard' | 'useSkill'; filter: string } | null;
  onTapHero: (c: CardInstance, owner: PlayerID) => void;
  onLongPressHero?: (c: CardInstance) => void;
  onEquipmentHover?: (eq: CardInstance | null) => void;
  isTargetable: (card: CardInstance, owner: PlayerID) => boolean;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  playerSkillSpent?: boolean;
}

// 3 small bench slots in a centered row. Used above the opponent active
// (top of screen) and below the player active (bottom).
export function BenchRow({
  ps, owner, myId, isOpponent, pending, onTapHero, onLongPressHero, onEquipmentHover,
  isTargetable, registerSlotRef, playerSkillSpent,
}: Props) {
  const slots = ps.bench;
  const accent = isOpponent ? palette.danger : palette.accent;

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      justifyContent: 'center',
      gap: 12,
      padding: '0 12px',
      height: '100%',
      minHeight: 0,
    }}>
      <span style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        ...text.label, color: palette.textDim,
      }}>
        {isOpponent ? 'Rival · Bench' : 'Your · Bench'}
      </span>
      <div style={{
        display: 'grid',
        // Matches ActiveDuel grid so all three rows column-align across
        // the board (Rival Bench → Lane → Your Bench).
        gridTemplateColumns: 'repeat(3, 180px)',
        gap: 28,
        height: '100%',
      }}>
        <AnimatePresence mode="popLayout">
          {slots.map((c, i) => c ? (
            // Wrapper presence is opacity-only and FAST: the HeroSlot inside
            // carries a shared layoutId, so when a hero changes zones
            // (promotion / retreat) the layout animation travels it between
            // rows. A scale/blur exit here used to play a "vanish" at the old
            // slot that fought the travel and read as a teleport.
            <motion.div
              key={c.iid}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.25 }}
              style={emptyDivStyle}
            >
              <HeroSlot
                card={c}
                owner={owner}
                myId={myId}
                isOpponent={isOpponent}
                pending={pending}
                isTargetable={isTargetable(c, owner)}
                compact
                onTap={onTapHero}
                onLongPress={onLongPressHero}
                onEquipmentHover={onEquipmentHover}
                registerSlotRef={registerSlotRef}
                playerSkillSpent={playerSkillSpent}
              />
            </motion.div>
          ) : (
            <EmptyBenchSlot key={`empty-bench-${i}`} accent={accent} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

const emptyDivStyle: CSSProperties = { display: 'block', height: '100%', minHeight: 0 };

function EmptyBenchSlot({ accent }: { accent: string }) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      borderRadius: 4,
      background: 'rgba(255,255,255,0.012)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <span style={{ position: 'absolute', top: 0, left: 0, width: 7, height: 7, borderTop: `1px solid ${accent}44`, borderLeft: `1px solid ${accent}44` }} />
      <span style={{ position: 'absolute', top: 0, right: 0, width: 7, height: 7, borderTop: `1px solid ${accent}44`, borderRight: `1px solid ${accent}44` }} />
      <span style={{ position: 'absolute', bottom: 0, left: 0, width: 7, height: 7, borderBottom: `1px solid ${accent}44`, borderLeft: `1px solid ${accent}44` }} />
      <span style={{ position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, borderBottom: `1px solid ${accent}44`, borderRight: `1px solid ${accent}44` }} />
      <span style={{ color: `${accent}55`, fontSize: 22, fontWeight: 400 }}>+</span>
    </div>
  );
}
