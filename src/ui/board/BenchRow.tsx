import type { CSSProperties } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { HeroSlot } from './HeroSlot';
import { DealtTile } from './BoardIntro';
import { SlotWell, boardCols, benchWidth } from './BoardTable';
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
      height: '100%',
      minHeight: 0,
    }}>
      <div style={{
        display: 'grid',
        // Three bench tiles at the board's bench width (boardCols), centred
        // under / over the single Active of the 3-1-1-3 stack.
        gridTemplateColumns: `repeat(3, ${boardCols.benchTile(isMobile)}px)`,
        gap: boardCols.benchGap(isMobile),
        width: benchWidth(isMobile),
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
