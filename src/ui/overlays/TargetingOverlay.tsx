import type { RefObject } from 'react';
import { motion } from 'framer-motion';
import type { TargetFilter } from '@/abilities';
import { fonts, spring } from '../tokens';
import { poster, chamfer, clipBoth } from '../poster';
import { scale } from '../hud';
import { useLaneBox } from '../board/TurnBanner';

interface Props {
  title: string;
  /** The card's effect. Not printed: the lit targets say what to do. */
  desc: string;
  filter: TargetFilter;
  /** Kept for callers: the turn row's red Cancel (BoardControls) backs out. */
  onCancel: () => void;
  /** Extra right-edge inset (px) — the open side panel's width on desktop. */
  rightInset?: number;
  /** Kept for callers; the strip sits in the lane, clear of the hand. */
  dockAbove?: RefObject<HTMLElement>;
  /** The chip's words, when not the filter's ("Spot" for a hero picked up). */
  chip?: string;
  /** Kept for callers; the strip prints no hint line. */
  hint?: string;
}

const TARGET_LABELS: Record<TargetFilter, string> = {
  noTarget: 'No Target',
  self: 'Self',
  allyAny: 'Ally',
  allyHero: 'Ally Hero',
  enemyAny: 'Enemy',
  enemyHero: 'Enemy Hero',
  enemyActive: 'Enemy Active',
  allyBench: 'Ally Bench',
  enemyBench: 'Enemy Bench',
  anyBoard: 'Any Hero',
};

/** A crosshair: Deadlock's aim mark, drawn, in the chip's ink. */
function Crosshair({ size, color }: { size: number; color: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8} style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="5" />
      <path d="M8 0.5v4M8 11.5v4M0.5 8h4M11.5 8h4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The armed card's prompt: a short dark strip in the lane between the two
 * Actives — the seam is never a card and never a target, so the strip covers
 * neither Active, no bench, no hand and not the turn row (your name, souls,
 * End Turn) under your bench. What to hit (the green chip) and the card's
 * name; the lit targets say the rest, and the turn row's End Turn turns into
 * the red Cancel meanwhile. The strip takes no taps.
 */
export function TargetingOverlay({ title, filter, rightInset = 0, chip }: Props) {
  const lane = useLaneBox();
  const h = Math.max(30, Math.min(36, lane.height - 8));
  const width = Math.max(0, Math.min(lane.width, window.innerWidth - rightInset) - 16);
  return (
    <div style={{
      position: 'fixed',
      left: lane.left + 8, width,
      top: lane.top + lane.height / 2 - h / 2, height: h,
      display: 'flex', justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 50,
      // The plate is chamfer-clipped, which would clip its own box-shadow,
      // so the drop lives on this pointer-transparent strip instead.
      filter: 'drop-shadow(0 6px 14px rgba(0, 0, 0, 0.45))',
    }}>
      <motion.div
        data-targeting-strip
        initial={{ opacity: 0, scaleX: 0.85 }}
        animate={{ opacity: 1, scaleX: 1 }}
        exit={{ opacity: 0, scaleX: 0.9, transition: { duration: 0.12 } }}
        transition={spring.snappy}
        style={{
          maxWidth: '100%', height: '100%', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 12px 0 0',
          background: `linear-gradient(180deg, ${poster.slateLit} 0%, ${poster.slate} 100%)`,
          boxShadow: `inset 0 0 0 1px rgba(98, 196, 98, 0.55)`,
          ...clipBoth(chamfer(6)),
          pointerEvents: 'none',
        }}
      >
        {/* What to hit — the targeting green as the strip's header band. */}
        <span style={{
          flexShrink: 0, alignSelf: 'stretch',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '0 9px 0 8px',
          background: poster.target,
          color: poster.ink,
          fontFamily: fonts.display,
          fontSize: scale.label,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}>
          <Crosshair size={12} color={poster.ink} />
          <span>{chip ?? TARGET_LABELS[filter]}</span>
        </span>

        <span style={{
          minWidth: 0, flex: '0 1 auto',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: fonts.display,
          fontSize: scale.body,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: 1,
          color: poster.cream,
        }}>{title}</span>

      </motion.div>
    </div>
  );
}
