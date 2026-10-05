import type { CSSProperties } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { HeroSlot } from './HeroSlot';
import { DealtTile } from './BoardIntro';
import { RowPlaque, SlotWell } from './BoardTable';
import { poster } from '../poster';
import { useViewport } from '../hooks/useViewport';

interface Props {
  ps: PlayerState;
  owner: PlayerID;
  myId: PlayerID;
  isOpponent: boolean;
  pending: { iid: string; kind: 'playCard' | 'useSkill'; filter: string } | null;
  onTapHero: (c: CardInstance, owner: PlayerID) => void;
  onLongPressHero?: (c: CardInstance) => void;
  onEquipmentHover?: (eq: CardInstance | null) => void;
  isTargetable: (card: CardInstance) => boolean;
  registerSlotRef?: (iid: string, el: HTMLElement | null) => void;
  /** Heroes here that can still do something this turn (the ready glint). */
  readyIids?: ReadonlySet<string>;
}

// 3 small bench slots in a centered row. Used above the opponent active
// (top of screen) and below the player active (bottom). The owner colour
// (rival red / your gold) paints the empty wells' dashed outline and label.
export function BenchRow({
  ps, owner, myId, isOpponent, pending, onTapHero, onLongPressHero, onEquipmentHover,
  isTargetable, registerSlotRef, readyIids,
}: Props) {
  const slots = ps.bench;
  const accent = isOpponent ? poster.rival : poster.you;
  const { isMobile } = useViewport();

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      justifyContent: 'center',
      gap: 12,
      padding: isMobile ? 0 : '0 12px',
      height: '100%',
      minHeight: 0,
    }}>
      {/* Side label crowds the cards on a phone — desktop only. Stacked
          two-line form fits the left gutter rail. */}
      {!isMobile && (
        <RowPlaque>Bench</RowPlaque>
      )}
      <div style={{
        display: 'grid',
        // Matches ActiveDuel grid so all three rows column-align across
        // the board (Rival Bench → Lane → Your Bench). On phones the fixed
        // 180px track is replaced by a width-capped 1fr track so 3 cards fit.
        gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, 180px)',
        gap: isMobile ? 8 : 28,
        width: isMobile ? '100%' : undefined,
        maxWidth: isMobile ? 420 : undefined,
        height: '100%',
      }}>
        <AnimatePresence mode="popLayout">
          {slots.map((c, i) => c ? (
            // Opacity-only presence, so the HeroSlot's shared layoutId can
            // travel a hero between rows; dealt in at the match's start
            // (DealtTile has the rationale).
            <DealtTile key={c.iid} owner={owner} slot={i as 0 | 1 | 2} style={emptyDivStyle}>
              <HeroSlot
                card={c}
                owner={owner}
                myId={myId}
                isOpponent={isOpponent}
                pending={pending}
                isTargetable={isTargetable(c)}
                compact
                onTap={onTapHero}
                onLongPress={onLongPressHero}
                onEquipmentHover={onEquipmentHover}
                registerSlotRef={registerSlotRef}
                ready={readyIids?.has(c.iid)}
              />
            </DealtTile>
          ) : (
            <SlotWell key={`empty-bench-${i}`} accent={accent} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

const emptyDivStyle: CSSProperties = { display: 'block', height: '100%', minHeight: 0 };
