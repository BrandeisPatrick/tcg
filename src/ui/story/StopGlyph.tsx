/**
 * The story map's stop glyphs — one line drawing per kind of stop, plus the
 * two states a stop can be in besides open (a tick when cleared, a padlock
 * when it is still out of reach). Drawn on a 24-unit grid in a single ink so
 * the same glyph prints on a map marker, a sticker and the stop card.
 *
 * Also home to the few printed pieces every story panel shares — the
 * sticker, the charcoal-framed portrait and the eyebrow — so the stop card,
 * the run panel and the sheets read as one set.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { NodeKind } from '@/story/types';
import { HeroPortrait } from '@/cards/art/heroArt';
import { fonts, text } from '../tokens';
import { poster } from '../poster';

/** The accent each kind of stop prints in. */
export const KIND_INK: Record<NodeKind, string> = {
  battle: poster.red,
  boss: poster.redDeep,
  elite: poster.stat.spirit,
  recruit: '#3f8f3a',
  supply: poster.ink,
};

export const KIND_LABEL: Record<NodeKind, string> = {
  battle: 'Battle',
  elite: 'Elite',
  recruit: 'Recruit',
  supply: 'Supply',
  boss: 'Boss',
};

export function StopGlyph({ kind, color, size }: {
  kind: NodeKind | 'cleared' | 'locked';
  color: string;
  size: number;
}) {
  const c = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      {kind === 'cleared' && <path d="M5 12.5l4.2 4.2L19 7" {...c} strokeWidth={2.8} />}
      {kind === 'battle' && (
        // Two crossed swords: blade, guard, grip.
        <path
          d="M4.5 4.5l10 10M12.5 17l4.5-4.5M15.5 15.5l4 4M19.5 4.5l-10 10M7 12.5l4.5 4.5M8.5 15.5l-4 4"
          {...c}
        />
      )}
      {kind === 'elite' && <path d="M12 3.5l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z" {...c} />}
      {kind === 'recruit' && (
        <>
          <circle cx="10" cy="8" r="3.4" {...c} />
          <path d="M4 19.5c0-3.4 2.6-5.8 6-5.8s6 2.4 6 5.8" {...c} />
          <path d="M18.5 6.5v5M16 9h5" {...c} />
        </>
      )}
      {kind === 'supply' && (
        <>
          <rect x="4" y="9" width="16" height="10.5" rx="1.2" {...c} />
          <path d="M4 9l2.5-4h11L20 9M12 9v10.5M9.5 12.5h5" {...c} />
        </>
      )}
      {kind === 'boss' && <path d="M4 18.5h16M4.5 18.5L3.5 8.5l4.8 4L12 5.5l3.7 7 4.8-4-1 10z" {...c} />}
      {kind === 'locked' && (
        <>
          <rect x="5" y="10.5" width="14" height="9.5" rx="1.5" {...c} />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14v2.5" {...c} />
        </>
      )}
    </svg>
  );
}

/** The small tracked caps over a title: "THE SPINE · STOP 2 OF 7". */
export const eyebrow: CSSProperties = {
  ...text.label,
  fontSize: 10,
  letterSpacing: '0.2em',
  lineHeight: 1.3,
};

/** The Lessons sheet's sticker — a stencil word on a flat plate, optionally
 *  led by a glyph. `outline` prints it as an ink keyline instead. */
export function Sticker({ label, ink, outline, glyph, small }: {
  label: string;
  ink: string;
  outline?: boolean;
  glyph?: NodeKind | 'cleared' | 'locked';
  small?: boolean;
}) {
  const fg = outline ? ink : poster.paper;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: small ? '4px 7px 4px' : '5px 9px 5px',
        background: outline ? 'transparent' : ink,
        color: fg,
        border: `1.5px solid ${ink}`,
        borderRadius: 3,
        fontFamily: fonts.display,
        fontSize: small ? 9.5 : 10.5,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {glyph && <StopGlyph kind={glyph} color={fg} size={small ? 11 : 12} />}
      {label}
    </span>
  );
}

/** A hero in the charcoal frame every card on the table wears (LessonRow's
 *  portrait). With no hero, `children` prints in the frame instead. */
export function FramedPortrait({ hero, w, h, border, children, style }: {
  hero?: string;
  w: number;
  h: number;
  /** A keyline round the frame: gold for your heroes, red for a boss. */
  border?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        flexShrink: 0,
        width: w,
        height: h,
        padding: border ? 2 : 3,
        borderRadius: 8,
        background: poster.frame,
        border: border ? `2px solid ${border}` : undefined,
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.25)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <span
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          borderRadius: 5,
          overflow: 'hidden',
          background: poster.ground,
        }}
      >
        {hero ? <HeroPortrait cardId={hero} full /> : children}
      </span>
    </span>
  );
}
