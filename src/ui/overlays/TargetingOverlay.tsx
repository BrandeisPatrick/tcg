import type { RefObject } from 'react';
import { motion } from 'framer-motion';
import type { TargetFilter } from '@/abilities';
import { fonts, spring } from '../tokens';
import { poster } from '../poster';
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
  /** Kept for callers; the tag sits on the lane, clear of the hand. */
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
 * The armed card's prompt: a small paper tag on the lane's middle column,
 * where the turn dial is — never a card and never a target, so it covers
 * neither Active, no bench, no hand and no control. What to hit (the green
 * band) over the card's name; the lit targets say the rest, and End Turn
 * turns into the red Cancel meanwhile. The tag takes no taps.
 */
export function TargetingOverlay({ title, filter, chip }: Props) {
  const lane = useLaneBox();
  return (
    <div style={{
      position: 'fixed',
      left: lane.left, width: lane.width,
      top: lane.top, height: lane.height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 50,
    }}>
      <motion.div
        data-targeting-strip
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
        transition={spring.snappy}
        style={{
          maxWidth: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          background: poster.paper,
          border: `1.5px solid ${poster.ink}`,
          borderRadius: 4,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {/* What to hit — the targeting green as the tag's header band. */}
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '5px 6px',
          background: poster.target,
          color: poster.ink,
          fontFamily: fonts.display,
          fontSize: scale.floor,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          lineHeight: 1.1,
          textAlign: 'center',
        }}>
          <Crosshair size={11} color={poster.ink} />
          <span>{chip ?? TARGET_LABELS[filter]}</span>
        </span>

        <span style={{
          padding: '5px 7px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          fontFamily: fonts.display,
          fontSize: scale.label,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          lineHeight: 1.15,
          textAlign: 'center',
          color: poster.ink,
        }}>{title}</span>
      </motion.div>
    </div>
  );
}
