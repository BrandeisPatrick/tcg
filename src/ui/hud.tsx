/**
 * Deadlock's HUD pieces, shared by the match screen and its sheets, so the
 * game reads as Deadlock's own interface: souls as the soul wisp and a mint
 * number, health as a green bar cut into one segment per HP point with a
 * plain number, both on the HUD's dark green plate. The glyphs are the game's
 * own (public/hud, see public/art/CREDITS.md); the colours are poster.ts's.
 */
import type { CSSProperties } from 'react';
import { fonts } from './tokens';
import { hpBarInk, hudGlyph, poster, soulCoin } from './poster';

/** The match screen's ONE type scale, px. Nothing a player reads is set
 *  under `floor`; pick the nearest step instead of a one-off size. */
export const scale = {
  /** Corner marks on a token: a count, a turn number. */
  floor: 10,
  /** Labels, tags, chips. */
  label: 11,
  /** Running text, names, buttons. */
  body: 13,
  /** The numbers a player plays by: HP, Bullet Power, souls, a cost. */
  number: 15,
  /** A sheet's or a banner's title. */
  title: 18,
  /** The headline of a full-screen moment. */
  display: 24,
} as const;

type SoulsTone = 'mint' | 'short' | 'paper';
const SOULS_INK: Record<SoulsTone, string> = {
  mint: poster.soul,
  short: poster.soulShort,
  paper: poster.soulInk,
};

/**
 * A souls amount, the one way the game prints it: Deadlock's soul wisp and
 * the number beside it, mint on a dark ground (`tone` 'paper' on a cream
 * sheet, 'short' for a price you cannot pay yet). `plate` sets it on the
 * HUD's dark green plate — a price tag that reads on any ground.
 */
export function Souls({ n, size = scale.number, tone = 'mint', plate = false, style }: {
  n: number | string;
  size?: number;
  tone?: SoulsTone;
  plate?: boolean;
  style?: CSSProperties;
}) {
  const ink = SOULS_INK[plate && tone === 'paper' ? 'mint' : tone];
  return (
    <span data-souls style={{
      display: 'inline-flex', alignItems: 'center', gap: Math.max(2, Math.round(size * 0.2)),
      fontFamily: fonts.ui, fontWeight: 800, fontSize: size, lineHeight: 1,
      fontVariantNumeric: 'tabular-nums', color: ink, whiteSpace: 'nowrap',
      ...(plate ? {
        padding: `${Math.max(2, Math.round(size * 0.18))}px ${Math.round(size * 0.42)}px ${Math.max(2, Math.round(size * 0.18))}px ${Math.round(size * 0.34)}px`,
        background: poster.plate,
        borderRadius: Math.round(size * 0.3),
        boxShadow: `inset 0 0 0 1px ${poster.plateEdge}, 0 1px 3px rgba(0, 0, 0, 0.5)`,
      } : {}),
      ...style,
    }}>
      <span aria-hidden style={soulCoin(size, false, ink)} />
      <span>{n}</span>
    </span>
  );
}

/**
 * Deadlock's health bar: a green fill cut into segments, one per HP point
 * (two or more per segment once a bar would be too fine to count), leaning
 * as the HUD's plates do. Green over half, amber to a quarter, red under it
 * (`hpBarInk`). A Shield is its own run of pale steel segments after the
 * health, as a barrier shows on Deadlock's bar.
 */
export function HpSegments({ hp, max, shield = 0, width, height = 8, style }: {
  hp: number;
  max: number;
  shield?: number;
  width: number | string;
  height?: number;
  style?: CSSProperties;
}) {
  const per = max > 24 ? Math.ceil(max / 12) : 1;
  const cells = Math.max(1, Math.ceil(max / per));
  const shieldCells = shield > 0 ? Math.max(1, Math.ceil(shield / per)) : 0;
  const ink = hpBarInk(hp, max);
  const gap = cells + shieldCells > 12 ? 1 : 1.5;
  return (
    <span aria-hidden data-hp-bar style={{
      display: 'flex', gap, width, height, boxSizing: 'border-box',
      padding: 1.5, background: 'rgba(4, 12, 8, 0.9)', borderRadius: 2,
      boxShadow: `0 0 0 1px ${poster.plateEdge}`,
      transform: 'skewX(-14deg)',
      ...style,
    }}>
      {Array.from({ length: cells }, (_, i) => {
        // How full this segment is: whole, part (a grouped bar) or spent.
        const fill = Math.max(0, Math.min(1, (hp - i * per) / per));
        return (
          <span key={i} style={{
            flex: 1, minWidth: 0, borderRadius: 0.5,
            background: fill >= 1 ? ink
              : fill > 0 ? `linear-gradient(90deg, ${ink} ${fill * 100}%, rgba(255, 255, 255, 0.1) ${fill * 100}%)`
              : 'rgba(255, 255, 255, 0.1)',
            boxShadow: fill > 0 ? 'inset 0 1px 0 rgba(255, 255, 255, 0.45)' : undefined,
            transition: 'background 320ms ease',
          }} />
        );
      })}
      {Array.from({ length: shieldCells }, (_, i) => (
        <span key={`s${i}`} data-hp-shield style={{
          flex: 1, minWidth: 0, borderRadius: 0.5,
          background: poster.shield,
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        }} />
      ))}
    </span>
  );
}

/** The plain number beside a health bar, on the HUD's dark green plate. */
export const hpNumberStyle = (size: number): CSSProperties => ({
  fontFamily: fonts.ui, fontWeight: 800, fontSize: size, lineHeight: 1,
  fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
  color: '#ffffff',
});

/** A patron's sigil — Deadlock's own team mark, in the side's colour. */
export function PatronSigil({ side, size, color, style }: {
  side: 'you' | 'rival';
  size: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span aria-hidden style={{
      ...hudGlyph(side === 'you' ? 'team_amber.svg' : 'team_sapphire.svg', Math.round(size * 0.78), size, color ?? (side === 'you' ? poster.you : poster.rival)),
      ...style,
    }} />
  );
}

/** Deadlock's ultimate mark (the eye in a disc). */
export const ultimateGlyph = (size: number, color: string = poster.cream) => hudGlyph('ultimate.svg', size, size, color);
