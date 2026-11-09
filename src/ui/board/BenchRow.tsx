import type { CSSProperties } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { HeroSlot } from './HeroSlot';
import { DealtTile } from './BoardIntro';
import { RowPlaque, SlotWell } from './BoardTable';
import { poster } from '../poster';
import { useViewport } from '../hooks/useViewport';
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
  /** Heroes here that can still do something this turn (the ready glint). */
  readyIids?: ReadonlySet<string>;
  /** The bench slots (1-3) a hero picked up from the hand may be put in:
   *  their empty wells light and take the tap (`onTapSlot`). */
  openSlots?: ReadonlySet<number>;
  onTapSlot?: (slot: 1 | 2 | 3) => void;
}

// 3 small bench slots in a centered row. Used above the opponent active
// (top of screen) and below the player active (bottom). The owner colour
// (rival red / your gold) paints the empty wells' dashed outline and label.
export function BenchRow({
  ps, owner, myId, isOpponent, pending, onTapHero, onLongPressHero, onEquipmentHover,
  isTargetable, registerSlotRef, readyIids, openSlots, onTapSlot,
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
        // The row is the bench's height; a tile never grows it (ActiveDuel
        // says why).
        gridTemplateRows: 'minmax(0, 1fr)',
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
                pending={pending}
                isTargetable={isTargetable(c)}
                compact
                onTap={onTapHero}
                onLongPress={onLongPressHero}
                onEquipmentHover={onEquipmentHover}
                registerSlotRef={registerSlotRef}
                ready={readyIids?.has(c.iid)}
                flexSlot={ps.flexSlot}
              />
            </DealtTile>
          ) : (
            <SlotWell
              key={`empty-bench-${i}`}
              accent={accent}
              lit={openSlots?.has(i + 1) ?? false}
              name={`Bench slot ${i + 1}`}
              onTap={() => onTapSlot?.((i + 1) as 1 | 2 | 3)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

const emptyDivStyle: CSSProperties = { display: 'block', height: '100%', minHeight: 0 };
