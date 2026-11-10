import { AnimatePresence } from 'framer-motion';
import type { CardInstance, PlayerID, PlayerState } from '@/engine/types';
import { HeroSlot } from './HeroSlot';
import { DealtTile } from './BoardIntro';
import { SheetRow, SlotWell } from './BoardTable';
import { tileStyle, useBoardLayout } from './layout';
import { poster } from '../poster';
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

/**
 * A bench: three slots in the sheet's three columns, each a hero's card or a
 * dashed empty outline. The rival's is the row above the lane, yours the row
 * below it. The owner's colour (the rival's red, your gold) paints the empty
 * wells' mark.
 */
export function BenchRow({
  ps, owner, myId, isOpponent, pending, onTapHero, onLongPressHero, onEquipmentHover,
  isTargetable, registerSlotRef, readyIids, openSlots, onTapSlot,
}: Props) {
  const L = useBoardLayout();
  const slots = ps.bench;
  const accent = isOpponent ? poster.rival : poster.you;
  return (
    <SheetRow L={L} h={L.bench} tag="Bench">
      <AnimatePresence mode="popLayout">
        {slots.map((c, i) => c ? (
          // Opacity-only presence, so the HeroSlot's shared layoutId can
          // travel a hero between rows; dealt in at the match's start
          // (DealtTile has the rationale).
          <DealtTile key={c.iid} owner={owner} slot={i as 0 | 1 | 2} style={tileStyle}>
            <HeroSlot
              card={c}
              owner={owner}
              myId={myId}
              pending={pending}
              isTargetable={isTargetable(c)}
              compact
              tall={L.bench}
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
    </SheetRow>
  );
}
