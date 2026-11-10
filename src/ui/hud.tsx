/**
 * The match screen's shared pieces, printed flat in the paper idiom: souls as
 * Deadlock's soul wisp and a number in ink, health as a bar cut into one
 * block per HP point, and the paper panels, plates and bands its sheets
 * stand on. The glyphs are the game's own (public/hud, see
 * public/art/CREDITS.md); the colours are poster.ts's.
 */
import type { CSSProperties } from 'react';
import { fonts } from './tokens';
import { PAPER_MOTTLE, hudGlyph, poster, soulCoin } from './poster';

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

type SoulsTone = 'mint' | 'short' | 'paper' | 'paperShort';
const SOULS_INK: Record<SoulsTone, string> = {
  mint: poster.soul,
  short: poster.soulShort,
  paper: poster.soulInk,
  paperShort: poster.redDeep,
};

/**
 * A souls amount, the one way the game prints it: Deadlock's soul wisp and
 * the number beside it — mint on a dark ground, `tone` 'paper' (ink green) on
 * a cream sheet, 'short' for a price you cannot pay yet ('paperShort' for
 * one printed on paper). `plate` sets it on a
 * small paper tag with an ink keyline — a price that reads on any ground.
 */
export function Souls({ n, size = scale.number, tone = 'mint', plate = false, style }: {
  n: number | string;
  size?: number;
  tone?: SoulsTone;
  plate?: boolean;
  style?: CSSProperties;
}) {
  // On the paper tag the number is ink green, or the red of a short price.
  const ink = plate ? (tone === 'short' || tone === 'paperShort' ? poster.redDeep : poster.soulInk) : SOULS_INK[tone];
  return (
    <span data-souls style={{
      display: 'inline-flex', alignItems: 'center', gap: Math.max(2, Math.round(size * 0.2)),
      fontFamily: fonts.ui, fontWeight: 800, fontSize: size, lineHeight: 1,
      fontVariantNumeric: 'tabular-nums', color: ink, whiteSpace: 'nowrap',
      ...(plate ? {
        padding: `${Math.max(2, Math.round(size * 0.18))}px ${Math.round(size * 0.42)}px ${Math.max(2, Math.round(size * 0.18))}px ${Math.round(size * 0.34)}px`,
        background: poster.paper,
        borderRadius: Math.round(size * 0.3),
        boxShadow: `inset 0 0 0 1px ${poster.ink}`,
      } : {}),
      ...style,
    }}>
      <span aria-hidden style={soulCoin(size, false, ink)} />
      <span>{n}</span>
    </span>
  );
}

/** The health bar's flat inks: one colour a side, plain grey for what is
 *  lost, pale steel with a keyline for a Shield. */
export const HP_INK = {
  you: '#57b84f',
  rival: poster.red,
  lost: '#7d8185',
  shield: '#d9e3ee',
  shieldEdge: '#7f93a8',
  track: poster.ink,
} as const;

/**
 * A health bar cut into blocks, one per HP point (two or more per block once
 * a bar would be too fine to count), printed flat: your heroes' health in
 * green, the rival's in red (`side`), what is lost as plain grey blocks, and
 * a Shield as its own run of pale steel blocks with a keyline after them.
 */
export function HpSegments({ hp, max, shield = 0, width, height = 8, side = 'you', style }: {
  hp: number;
  max: number;
  shield?: number;
  width: number | string;
  height?: number;
  /** Whose hero it is: the colour of the health left. */
  side?: 'you' | 'rival';
  style?: CSSProperties;
}) {
  const per = max > 24 ? Math.ceil(max / 12) : 1;
  const cells = Math.max(1, Math.ceil(max / per));
  const shieldCells = shield > 0 ? Math.max(1, Math.ceil(shield / per)) : 0;
  const ink = HP_INK[side];
  const gap = cells + shieldCells > 12 ? 1 : 1.5;
  return (
    <span aria-hidden data-hp-bar={side} style={{
      display: 'flex', gap, width, height, boxSizing: 'border-box',
      padding: 1.5, background: HP_INK.track, borderRadius: 2,
      ...style,
    }}>
      {Array.from({ length: cells }, (_, i) => {
        // How full this block is: whole, part (a grouped bar) or spent.
        const fill = Math.max(0, Math.min(1, (hp - i * per) / per));
        return (
          <span key={i} style={{
            flex: 1, minWidth: 0, borderRadius: 0.5,
            background: fill >= 1 ? ink
              : fill > 0 ? `linear-gradient(90deg, ${ink} ${fill * 100}%, ${HP_INK.lost} ${fill * 100}%)`
              : HP_INK.lost,
            transition: 'background 320ms ease',
          }} />
        );
      })}
      {Array.from({ length: shieldCells }, (_, i) => (
        <span key={`s${i}`} data-hp-shield style={{
          flex: 1, minWidth: 0, borderRadius: 0.5, boxSizing: 'border-box',
          background: HP_INK.shield,
          border: `1px solid ${HP_INK.shieldEdge}`,
        }} />
      ))}
    </span>
  );
}

/** The plain number beside a health bar: ink on paper (pass the colour for
 *  another ground). */
export const hpNumberStyle = (size: number, color: string = poster.ink): CSSProperties => ({
  fontFamily: fonts.ui, fontWeight: 800, fontSize: size, lineHeight: 1,
  fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
  color,
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

/**
 * A paper panel — the ground of the match screen's sheets, lists and menus:
 * cream paper with its mottled sizing, an ink keyline and ink type, floated
 * a hair off the scene by one soft drop.
 */
export const panelStyle: CSSProperties = {
  backgroundColor: poster.paper,
  backgroundImage: PAPER_MOTTLE,
  border: `1.5px solid ${poster.ink}`,
  borderRadius: 10,
  color: poster.ink,
  boxShadow: '0 18px 44px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.3)',
};

/** A smaller plate on a paper panel: deeper paper inside an ink rule — a
 *  tile's body, a chip, a boxed line. */
export const plateStyle: CSSProperties = {
  background: poster.paperDeep,
  border: `1px solid ${poster.inkRule}`,
  borderRadius: 6,
  color: poster.ink,
};

/**
 * A panel's header band: a flat run of one colour (an item's category, a
 * patron, an ability's kind) with ink stamped type on it. Pass the colour;
 * the band sets its own type.
 */
export const bandStyle = (ink: string): CSSProperties => ({
  background: ink,
  color: poster.ink,
  fontFamily: fonts.display,
  fontSize: scale.body,
  lineHeight: 1,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
});

/** The mark of a charged ultimate: a flat double ring of the ability's
 *  colour (print has no glow). */
export const chargedGlow = (ink: string): string =>
  `0 0 0 2px ${ink}, 0 0 0 3.5px ${poster.ink}`;

/**
 * An art-deco rule: two hairlines meeting a small diamond — the one line
 * ornament the match screen uses (a sheet's title, a section break).
 */
export function DecoRule({ color = poster.inkFaint, width = '100%', style }: {
  color?: string;
  width?: number | string;
  style?: CSSProperties;
}) {
  const line: CSSProperties = { flex: 1, height: 1, background: color };
  return (
    <span aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 6, width, ...style }}>
      <span style={line} />
      <span style={{ width: 5, height: 5, transform: 'rotate(45deg)', background: color, flexShrink: 0 }} />
      <span style={line} />
    </span>
  );
}

/**
 * A count chip — how many cards a pile or a hand holds: a small ink badge
 * edged in its side's colour (your gold, the rival's red), a paper number.
 * Pinned to a pile's corner, or set beside a card back.
 */
export const countChipStyle = (accent: string, size: number = scale.label): CSSProperties => ({
  minWidth: Math.round(size * 1.7),
  height: Math.round(size * 1.6),
  padding: `0 ${Math.round(size * 0.4)}px`,
  boxSizing: 'border-box',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: poster.ink,
  border: `1.5px solid ${accent}`,
  borderRadius: 4,
  color: poster.paper,
  fontFamily: fonts.ui, fontWeight: 800, fontSize: size, lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
});
