import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { fonts, spring } from './tokens';
import { poster, chamfer, posterButtonSkins, type PosterButtonVariant } from './poster';

/**
 * Shared chrome. Every screen outside the card art itself is now printed in
 * the poster idiom, so this file holds exactly one primitive: the button.
 *
 * (It used to carry a parlor set — MenuShell, BackPlaque, ScreenHeading,
 * GameButton — for the parchment collection screens. Those screens moved to
 * the poster sheet, and the parlor set went with them.)
 */

/**
 * The poster's button — the draft lobby's LOCK plate, generalised. Chamfered
 * silhouette, stencil caps; 'paper' is the primary (cream fill, ink text),
 * 'ink' the secondary, 'red' the destructive/cancel, 'ghost' for dark chrome.
 * Disabled renders as an outline. Used across the match screen (End Turn,
 * modal actions, match-end exits) and the menu sheets, so every press-me in
 * the game is one voice.
 */
export function PosterButton({
  variant = 'paper', size = 'md', onClick, disabled, children, style, title, ariaLabel,
}: {
  variant?: PosterButtonVariant;
  size?: 'sm' | 'md';
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  title?: string;
  ariaLabel?: string;
}) {
  const skin = posterButtonSkins[variant];
  const n = size === 'sm' ? 7 : 9;
  const disabledSkin: CSSProperties = {
    background: 'transparent',
    color: variant === 'ghost' ? poster.creamDim : poster.inkDim,
    border: `2px solid ${variant === 'ghost' ? poster.edge : poster.inkFaint}`,
  };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      whileHover={!disabled ? { y: -1, scale: 1.03 } : undefined}
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      transition={spring.snappy}
      style={{
        padding: size === 'sm' ? '9px 18px' : '13px 30px',
        ...skin,
        ...(disabled ? disabledSkin : {}),
        clipPath: chamfer(n),
        WebkitClipPath: chamfer(n),
        fontFamily: fonts.display,
        fontSize: size === 'sm' ? 13 : 17,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {children}
    </motion.button>
  );
}
