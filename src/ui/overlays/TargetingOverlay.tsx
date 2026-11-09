import { useLayoutEffect, useState, type RefObject } from 'react';
import { motion } from 'framer-motion';
import type { TargetFilter } from '@/abilities';
import { fonts, spring, text } from '../tokens';
import { poster, chamfer, clipBoth } from '../poster';

interface Props {
  title: string;
  desc: string;
  filter: TargetFilter;
  onCancel: () => void;
  /** Extra right-edge inset (px) — the open side panel's width on desktop,
   *  so the banner centres over the visible board instead of the full
   *  viewport (where its right end slides under the panel sheet). */
  rightInset?: number;
  /** Phones: the hand row a bottom-docked banner sits above. The phone hand
   *  is a full-size strip, taller than the fixed 220px dock allows for. */
  dockAbove?: RefObject<HTMLElement>;
  /** The chip's words, when not the filter's ("Spot" for a hero picked up). */
  chip?: string;
  /** The trailing hint, when not "tap or drag onto a glowing target". */
  hint?: string;
}

/** The System menu's gear: fixed top 12 / right 12, 40px across, drawn above
 *  everything. A top-docked banner stops short of it with 8px to spare, or
 *  on a phone its Cancel sits under the gear and a tap opens the menu. */
const GEAR_CLEAR = 12 + 40 + 8;

const TARGET_LABELS: Record<TargetFilter, string> = {
  noTarget: 'No Target',
  self: 'Self',
  allyAny: 'Any Ally',
  allyHero: 'Ally Hero',
  enemyAny: 'Any Enemy',
  enemyHero: 'Enemy Hero',
  enemyActive: 'Enemy Active',
  allyBench: 'Ally on Bench',
  enemyBench: 'Enemy on Bench',
  anyBoard: 'Any Hero',
};

export function TargetingOverlay({ title, desc, filter, onCancel, rightInset = 0, dockAbove, chip, hint }: Props) {
  // Anchor the banner AWAY from the rows it asks the player to tap: ally
  // targeting docks under the rival's hand (your rows stay clear), enemy
  // targeting docks above your hand (the rival's rows stay clear).
  const anchorTop = filter === 'allyAny' || filter === 'allyHero' || filter === 'allyBench' || filter === 'self';
  // How far up the hand row reaches, measured before paint, so the bottom
  // dock clears it whatever the strip's height on this phone.
  const [handTop, setHandTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = dockAbove?.current;
    if (anchorTop || !el) { setHandTop(null); return; }
    const measure = () => setHandTop(window.innerHeight - el.getBoundingClientRect().top);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [anchorTop, dockAbove]);
  return (
    // Outer strip: spans the VISIBLE board area (viewport minus the open
    // panel via rightInset). Only left+right are set — adding a width would
    // over-constrain the box and CSS silently drops `right`, which is how
    // the plate used to end up centred on the full viewport with its tail
    // under the panel sheet. The plate centres inside via flex and may
    // shrink below its natural width (the text span ellipsizes).
    <div style={{
      position: 'fixed',
      left: 16,
      right: anchorTop ? Math.max(16 + rightInset, GEAR_CLEAR) : 16 + rightInset,
      ...(anchorTop
        ? { top: 14 }
        : { bottom: handTop != null ? handTop + 6 : 'calc(220px + env(safe-area-inset-bottom))' }),
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 50,
      // The plate is chamfer-clipped, which would clip its own box-shadow,
      // so the drop lives on this pointer-transparent strip instead.
      filter: 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.4))',
    }}>
    <motion.div
      initial={{ opacity: 0, y: anchorTop ? -20 : 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: anchorTop ? -10 : 10, scale: 0.96 }}
      transition={spring.snappy}
      style={{
        // Single-line ink plate: the old three-row card was ~110px tall and
        // buried a whole board row (including rows that can hold targets).
        maxWidth: 'min(680px, 100%)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        pointerEvents: 'auto',
        background: poster.panel,
        border: `1px solid ${poster.edge}`,
        ...clipBoth(chamfer(6)),
        padding: '7px 8px 7px 8px',
      }}
    >
      {/* Filter chip — the targeting green, printed flat on the plate. */}
      <span style={{
        flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '5px 10px',
        background: poster.target,
        color: poster.ink,
        ...clipBoth(chamfer(4)),
        fontFamily: fonts.display,
        fontSize: 10.5,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        <span aria-hidden>◎</span>
        <span>{chip ?? TARGET_LABELS[filter]}</span>
      </span>

      <span style={{
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...text.body,
        color: poster.creamDim,
      }}>
        <span style={{
          fontFamily: fonts.display,
          fontSize: 12,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: poster.cream,
        }}>{title}</span>
        {desc ? <> — {desc}</> : null}
        <span style={{ color: poster.creamFaint }}> · {hint ?? 'tap or drag onto a glowing target'}</span>
      </span>

      {/* Cancel — the red sticker, stuck to the plate's right end. */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
        onClick={onCancel}
        aria-label="Cancel"
        title="Cancel"
        style={{
          flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '6px 9px 7px',
          background: poster.red,
          color: poster.paper,
          border: 'none',
          borderRadius: 3,
          cursor: 'pointer',
          fontFamily: fonts.display,
          fontSize: 10,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        <span aria-hidden>✕</span>
        <span>Cancel</span>
      </motion.button>
    </motion.div>
    </div>
  );
}
