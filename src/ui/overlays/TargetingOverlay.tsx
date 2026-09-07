import { motion } from 'framer-motion';
import type { TargetFilter } from '@/abilities';
import { fonts, spring, text } from '../tokens';
import { poster, chamfer } from '../poster';

interface Props {
  title: string;
  desc: string;
  filter: TargetFilter;
  onCancel: () => void;
  /** Extra right-edge inset (px) — the open side panel's width on desktop,
   *  so the banner centres over the visible board instead of the full
   *  viewport (where its right end slides under the panel sheet). */
  rightInset?: number;
}

const TARGET_LABELS: Record<TargetFilter, string> = {
  noTarget: 'No Target',
  self: 'Self',
  allyAny: 'Any Ally',
  allyHero: 'Ally Hero',
  enemyAny: 'Any Enemy',
  enemyHero: 'Enemy Hero',
  enemyActive: 'Enemy Active',
  anyBoard: 'Any Hero',
};

export function TargetingOverlay({ title, desc, filter, onCancel, rightInset = 0 }: Props) {
  // Anchor the banner AWAY from the rows it asks the player to tap: ally
  // targeting docks under the rival's hand (your rows stay clear), enemy
  // targeting docks above your hand (the rival's rows stay clear).
  const anchorTop = filter === 'allyAny' || filter === 'allyHero' || filter === 'self';
  return (
    // Outer strip: spans the VISIBLE board area (viewport minus the open
    // panel via rightInset). Only left+right are set — adding a width would
    // over-constrain the box and CSS silently drops `right`, which is how
    // the plate used to end up centred on the full viewport with its tail
    // under the panel sheet. The plate centres inside via flex and may
    // shrink below its natural width (the text span ellipsizes).
    <div style={{
      position: 'fixed',
      left: 16, right: 16 + rightInset,
      ...(anchorTop
        ? { top: 14 }
        : { bottom: 'calc(220px + env(safe-area-inset-bottom))' }),
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
        clipPath: chamfer(6),
        WebkitClipPath: chamfer(6),
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
        clipPath: chamfer(4),
        WebkitClipPath: chamfer(4),
        fontFamily: fonts.display,
        fontSize: 10.5,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        <span aria-hidden>◎</span>
        <span>{TARGET_LABELS[filter]}</span>
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
        <span style={{ color: poster.creamFaint }}> · tap or drag onto a glowing target</span>
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
