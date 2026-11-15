import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { BankForecast } from '@/engine/bank';
import { KILL_BOUNTY_STEP_ROUNDS, ROUND_CAP } from '@/engine/constants';
import { bountyAtRound } from '@/engine/rounds';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';
import { Souls, panelStyle, scale } from '../hud';
import { useStatTick } from './useStatTick';

/** What the bank sheet says under its rows: how the kill bounty grows — what
 *  it becomes next round when that is more, and its pace; at its most (the
 *  last rounds), that it is. */
export function bankFootnote(bank: BankForecast): string {
  if (bank.bounty >= bountyAtRound(ROUND_CAP)) return 'The most a kill pays.';
  const pace = `1 more every ${KILL_BOUNTY_STEP_ROUNDS === 2 ? 'two' : KILL_BOUNTY_STEP_ROUNDS} rounds.`;
  return bank.bountyNext > bank.bounty ? `${bank.bountyNext} from next round. ${pace}` : pace;
}

/** The bank sheet's rows, top to bottom: what the next turn pays, what that
 *  makes with nothing spent, and what a kill pays now. On a side's last turn
 *  the lane has nothing more to pay, and the sheet says so. Pure, so the
 *  board and its tests read the same lines. */
export function bankRows(bank: BankForecast): { label: string; value: string }[] {
  return [
    bank.last ? { label: 'Next turn', value: 'Last round' } : { label: 'Next turn', value: `+${bank.income}` },
    ...(bank.last ? [] : [{ label: 'You will hold', value: String(bank.next) }]),
    { label: 'A kill pays', value: String(bank.bounty) },
  ];
}

/**
 * Your souls, beside End Turn: Deadlock's soul wisp and the number in ink on
 * a paper tag with an ink keyline, `size` px tall. It pulses as the count
 * changes. With a `bank` it is a button: hover it with a mouse, or tap it,
 * and the bank sheet opens above it — what the next turn pays, what you will
 * hold then, and what a kill pays now. A tap pins the sheet open until the
 * next tap, a press anywhere else, or Escape.
 */
export function SoulsCounter({ souls, size, bank, onOpenChange }: {
  souls: number;
  size: number;
  /** The bank's forecast (engine/bank.ts); left out, the tag is a plain readout. */
  bank?: BankForecast;
  /** Told as the sheet opens and closes, so the board can lift it over its neighbours. */
  onOpenChange?: (open: boolean) => void;
}) {
  const tick = useStatTick(souls);
  const root = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const open = !!bank && (pinned || hover);

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  // A pinned sheet closes on a press anywhere else, or Escape.
  useEffect(() => {
    if (!pinned) return;
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setPinned(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPinned(false); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [pinned]);

  const plate = (
    <motion.div
      role={bank ? undefined : 'img'}
      aria-label={bank ? undefined : `Your souls: ${souls}`}
      title={bank ? undefined : 'Souls'}
      data-souls-plate
      animate={tick ? { scale: [1, 1.1, 1] } : { scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{
        height: size,
        minWidth: size + 18,
        boxSizing: 'border-box',
        flexShrink: 0,
        padding: '0 10px 0 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: poster.paper,
        borderRadius: 6,
        boxShadow: `inset 0 0 0 1.5px ${poster.ink}${open ? `, 0 0 0 2px ${poster.you}` : ''}`,
      }}
    >
      <Souls n={souls} size={scale.title} tone="paper" />
    </motion.div>
  );
  if (!bank) return plate;

  return (
    <div
      ref={root}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(true); }}
      onPointerLeave={() => setHover(false)}
      style={{ position: 'relative', display: 'flex', flexShrink: 0 }}
    >
      <button
        type="button"
        aria-label={`Your bank: ${souls} souls`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setPinned((v) => !v)}
        style={{ display: 'flex', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
      >
        {plate}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Your bank"
            data-bank-sheet
            initial={{ opacity: 0, y: 8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.94, transition: { duration: 0.12 } }}
            transition={spring.snappy}
            style={{
              ...panelStyle,
              position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 12,
              transformOrigin: 'right bottom',
              width: 188, boxSizing: 'border-box', padding: '9px 12px 10px',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingBottom: 6,
              fontFamily: fonts.display, fontSize: scale.label, letterSpacing: '0.14em', textTransform: 'uppercase', color: poster.inkDim,
            }}>
              <span>Bank</span>
              <Souls n={bank.held} size={scale.number} tone="paper" />
            </div>
            {bankRows(bank).map((row) => (
              <div key={row.label} style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
                padding: '6px 0', borderTop: `1px solid ${poster.inkRule}`,
                fontFamily: fonts.ui, fontSize: scale.body, lineHeight: 1.1, color: poster.ink, whiteSpace: 'nowrap',
              }}>
                <span>{row.label}</span>
                <span style={{ fontWeight: 800, fontSize: /^[+\d]/.test(row.value) ? scale.title : scale.body, fontVariantNumeric: 'tabular-nums', color: poster.soulInk }}>{row.value}</span>
              </div>
            ))}
            <div style={{
              paddingTop: 6, borderTop: `1px solid ${poster.inkRule}`,
              fontFamily: fonts.ui, fontSize: scale.label, lineHeight: 1.2, color: poster.inkDim,
            }}>
              {bankFootnote(bank)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
