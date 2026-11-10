import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { fonts, spring } from '../tokens';
import { poster, chamfer, clipBoth } from '../poster';
import { PosterButton } from '../chrome';
import { SoulsCounter } from './SoulsCounter';

/** The turn button's name — its label and its accessible name, by which the
 *  tutorial's gate finds it. */
export const END_TURN = 'End Turn';

interface Props {
  /** `row` — one row under the hand on a phone: menu, Auto, your souls, End
   *  Turn under the right thumb. `dock` — a column in the wide sheet's right
   *  margin, beside the lane. */
  variant: 'row' | 'dock';
  isMyTurn: boolean;
  busy: boolean;
  hasPending: boolean;
  autoPlay: boolean;
  souls: number;
  /** The menu button (Board owns it and its popup). */
  menu: ReactNode;
  /** The turn button was pressed. */
  onEndTurn: () => void;
  onCancel: () => void;
  onToggleAuto: () => void;
}

/**
 * The turn controls. A button's label is always the action a press performs —
 * the turn button only ever ends the turn (the attack is made from the
 * Active's sheet), and red Cancel takes its place while a card, a skill or an
 * item is armed. It stays enabled while busy so Board can queue the press.
 */
export function BoardControls({ variant, isMyTurn, busy, hasPending, autoPlay, souls, menu, onEndTurn, onCancel, onToggleAuto }: Props) {
  const dock = variant === 'dock';
  const turnHot = isMyTurn && !busy && !autoPlay;
  const turnCursor = isMyTurn ? (busy ? 'progress' : 'pointer') : 'default';
  const w = dock ? 126 : 122;
  const h = dock ? 58 : 40;

  const cancel = (
    <motion.div key="cancel" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={spring.default} style={{ display: 'flex', width: w, height: dock ? 30 : h }}>
      <PosterButton
        variant="red"
        size="sm"
        onClick={onCancel}
        style={{ width: '100%', height: '100%', padding: 0, fontSize: 13, letterSpacing: '0.14em', textAlign: 'center' }}
      >Cancel</PosterButton>
    </motion.div>
  );

  const turn = (
    <motion.div
      key="turn"
      animate={{ opacity: isMyTurn ? 1 : 0.75 }}
      transition={{ duration: 0.25 }}
      style={{ position: 'relative', display: 'flex', width: w, height: h, flexShrink: 0 }}
    >
      {/* Ready cue — a flat keyline in your colour whose opacity pulses, on
          its own layer outside the button's chamfer clip. */}
      {turnHot && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0.35 }}
          animate={{ opacity: [0.35, 0.95, 0.35] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: -4,
            border: `1.5px solid ${poster.you}`,
            ...clipBoth(chamfer(dock ? 11 : 9)),
            pointerEvents: 'none',
          }}
        />
      )}
      <PosterButton
        variant="paper"
        size={dock ? 'md' : 'sm'}
        disabled={!isMyTurn}
        onClick={onEndTurn}
        ariaLabel={END_TURN}
        style={{
          width: '100%', height: '100%', padding: dock ? '0 0 0 0.2em' : 0,
          fontSize: dock ? 16 : 13, letterSpacing: dock ? '0.2em' : '0.14em', lineHeight: 1.15, textAlign: 'center',
          cursor: turnCursor,
          ...(busy && isMyTurn ? { color: poster.inkDim } : {}),
          // On the dark ground under the sheet a waiting button is a cream
          // outline; on the sheet it is the paper button's own ink outline.
          ...(!isMyTurn && !dock ? { color: poster.creamDim, border: `2px solid ${poster.edge}` } : {}),
        }}
      >{dock ? <>End<br />Turn</> : END_TURN}</PosterButton>
    </motion.div>
  );

  const auto = (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={onToggleAuto}
      aria-pressed={autoPlay}
      title={autoPlay ? 'Auto-play on — tap to take control' : 'Auto-play off — tap to let the AI play'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: dock ? 30 : 32, padding: '0 11px', boxSizing: 'border-box', flexShrink: 0,
        background: poster.ink,
        border: `1.5px solid ${autoPlay ? poster.gold : dock ? poster.ink : poster.edge}`,
        ...clipBoth(chamfer(4)),
        fontFamily: fonts.display,
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        lineHeight: 1,
        color: autoPlay ? poster.gold : poster.paper,
        cursor: 'pointer',
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, flexShrink: 0, borderRadius: '50%', background: autoPlay ? poster.gold : poster.creamFaint }} />
      Auto
    </motion.button>
  );

  if (dock) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ height: 30, display: 'flex', alignItems: 'center' }}>{hasPending && cancel}</div>
        <SoulsCounter souls={souls} size={30} />
        {turn}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{menu}{auto}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: '100%' }}>
      {menu}
      {auto}
      <span style={{ flex: 1 }} />
      <SoulsCounter souls={souls} size={34} />
      {hasPending ? cancel : turn}
    </div>
  );
}
