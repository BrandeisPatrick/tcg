// Reusable torn-paper tile for the start screen. The outer wrapper handles
// rotation and drop-shadow (filter), the clipped surface handles the parchment
// fill and content. Splitting these layers avoids the Safari clip-path +
// filter + rotate flicker.
//
// Typography note: this surface uses Exo 2 + uppercase + letter-spacing on
// its eyebrow / title. tokens.ts forbids those for in-game card UI; the start
// screen is a branding surface and deliberately deviates. Body / subtitle
// text continues to follow the tokens.

import type { ReactNode, CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { palette, fonts, spring, text } from '../tokens';

export type TornTileVariant = 'primary' | 'wide';

export interface TornTileProps {
  variant: TornTileVariant;
  rotation: number;
  eyebrow: string;
  title: string;
  subtitle?: string;
  art?: {
    src: string;
    objectPosition?: string;
    widthPct?: number;
    /** Center the radial fade-to-transparent mask. Defaults to '50% 35%'. */
    maskCenter?: string;
  };
  comingSoon?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  children?: ReactNode;
}

const CLIP_BY_VARIANT: Record<TornTileVariant, string> = {
  primary: 'url(#torn-edge-primary)',
  wide: 'url(#torn-edge-wide)',
};

export function TornTile({
  variant,
  rotation,
  eyebrow,
  title,
  subtitle,
  art,
  comingSoon = false,
  disabled = false,
  onClick,
  ariaLabel,
  children,
}: TornTileProps) {
  const interactive = !disabled && !comingSoon;
  const titleSize = variant === 'primary'
    ? 'clamp(40px, 4vw, 64px)'
    : 'clamp(24px, 2vw, 32px)';

  // Outer wrapper carries the entrance + base rotation through framer-motion
  // (raw `transform` would be overridden by motion). Inner wrapper carries the
  // drop-shadow filter so Safari doesn't blur the clipped edges when rotated.
  const shadowStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    filter: 'drop-shadow(0 12px 24px rgba(40, 20, 0, 0.28))',
  };

  // The clipped element. All visible parchment, art, and labels sit inside.
  const clippedStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    clipPath: CLIP_BY_VARIANT[variant],
    WebkitClipPath: CLIP_BY_VARIANT[variant],
    background: palette.bg2,
    overflow: 'hidden',
    cursor: interactive ? 'pointer' : 'default',
    opacity: disabled || comingSoon ? 0.55 : 1,
    pointerEvents: interactive ? 'auto' : 'none',
  };

  return (
    <motion.div
      style={{ width: '100%', height: '100%', transformOrigin: 'center' }}
      initial={{ opacity: 0, y: 24, scale: 0.96, rotate: rotation }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: rotation }}
      transition={spring.default}
    >
      <motion.div
        style={shadowStyle}
        whileHover={interactive ? { y: -4, scale: 1.015 } : undefined}
        whileTap={interactive ? { scale: 0.99 } : undefined}
        transition={spring.snappy}
      >
        <div
          style={clippedStyle}
          onClick={interactive ? onClick : undefined}
          role={interactive ? 'button' : undefined}
          aria-disabled={disabled || comingSoon}
          aria-label={ariaLabel ?? title}
          tabIndex={interactive ? 0 : -1}
          onKeyDown={(e) => {
            if (!interactive) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick?.();
            }
          }}
        >
          {/* Sepia inset edge — sits above the parchment fill, below content */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              boxShadow:
                'inset 0 0 0 1px rgba(120, 80, 30, 0.5), inset 0 6px 18px rgba(60, 30, 5, 0.18)',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          />

          {/* Brass radial behind any art */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(ellipse at 60% 50%, rgba(176,120,37,0.35), transparent 60%)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />

          {/* Hero / art layer. Hero card webps were drawn against the dark
              in-game frame; on parchment we radial-mask the dark surround out
              so only the centered figure reads. */}
          {art && (() => {
            const maskCenter = art.maskCenter ?? '50% 38%';
            const mask = `radial-gradient(ellipse 82% 92% at ${maskCenter}, #000 62%, rgba(0,0,0,0.88) 80%, transparent 98%)`;
            return (
              <img
                src={art.src}
                alt=""
                aria-hidden
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: `${art.widthPct ?? 78}%`,
                  height: 'auto',
                  maxHeight: '108%',
                  objectFit: 'cover',
                  objectPosition: art.objectPosition ?? '50% 15%',
                  filter: 'sepia(0.18) saturate(0.92) contrast(1.04)',
                  WebkitMaskImage: mask,
                  maskImage: mask,
                  pointerEvents: 'none',
                  zIndex: 2,
                  userSelect: 'none',
                }}
                draggable={false}
              />
            );
          })()}

          {/* Bottom veil for label legibility (only when there's art) */}
          {art && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(to top, ${palette.bg2} 0%, rgba(245, 232, 204, 0.85) 22%, transparent 48%)`,
                pointerEvents: 'none',
                zIndex: 2,
              }}
            />
          )}

          {/* Custom decorations (e.g. preview-gallery thumbnail) */}
          {children && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
              {children}
            </div>
          )}

          {/* Coming-soon brass pill, top-right */}
          {comingSoon && (
            <div
              style={{
                position: 'absolute',
                top: 18,
                right: 22,
                padding: '4px 10px',
                borderRadius: 999,
                background: 'rgba(176, 120, 37, 0.18)',
                border: `1px solid ${palette.accent}`,
                color: palette.accent,
                fontFamily: '"Exo 2 Variable", "Exo 2", ' + fonts.ui,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                zIndex: 4,
              }}
            >
              Soon
            </div>
          )}

          {/* Label stack — bottom-left */}
          <div
            style={{
              position: 'absolute',
              left: variant === 'primary' ? 36 : 26,
              right: variant === 'primary' ? 36 : 26,
              bottom: variant === 'primary' ? 36 : 22,
              zIndex: 4,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                fontFamily: '"Exo 2 Variable", "Exo 2", ' + fonts.ui,
                fontSize: variant === 'primary' ? 14 : 12,
                fontWeight: 700,
                letterSpacing: '0.32em',
                textTransform: 'uppercase',
                color: palette.accent,
                marginBottom: 8,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                fontFamily: '"Exo 2 Variable", "Exo 2", ' + fonts.ui,
                fontSize: titleSize,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: palette.text,
                lineHeight: 1,
                marginBottom: subtitle ? (variant === 'primary' ? 14 : 8) : 0,
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                style={{
                  ...text.body,
                  color: palette.textDim,
                  maxWidth: variant === 'primary' ? 360 : 320,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
