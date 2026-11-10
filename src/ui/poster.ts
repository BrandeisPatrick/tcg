/**
 * Poster tokens — the screen-print look shared by the title sheet, the
 * draft lobby and the match board: cream paper, flat ink, one red, and the
 * state colours the lobby paints on card frames. Companion to tokens.ts
 * (whose parchment/brass ramp still serves the collection screens);
 * anything drawn in the poster idiom imports from here.
 */
import { BASE } from '@/art/assets';

export const poster = {
  // Paper — the cream sheet and its bands.
  paper: '#f2e6cb',
  paperDeep: '#e7d8b6',
  paperBand: '#ece3cf',

  // Ink — flat black type and rules on paper.
  ink: '#171410',
  inkSoft: 'rgba(23, 20, 16, 0.78)',   // running prose on paper (8:1); a step under full ink
  inkDim: 'rgba(23, 20, 16, 0.64)',
  inkFaint: 'rgba(23, 20, 16, 0.3)',
  inkRule: 'rgba(23, 20, 16, 0.18)',

  // Chrome — the dark lobby surfaces around the paper.
  ground: '#0c0f11',
  panel: '#15191c',
  edge: '#2a2f34',
  frame: '#25272a',
  frameLit: '#3a3d41',
  cream: '#e8e0cc',
  creamDim: 'rgba(232, 224, 204, 0.62)',
  creamFaint: 'rgba(232, 224, 204, 0.3)',

  // Accents — one red, plus the lobby's frame states.
  red: '#d4392c',
  redDeep: '#a9281f',
  gold: '#d9b64a',
  green: '#62c462',

  // Semantics — who owns what on the board, and what a number means.
  // Each side wears its PATRON's colour (board/patrons.ts): you are the
  // Amber Hand's gold, the rival the one red, as the paper board prints them.
  you: '#d9b64a',        // your frames, keylines, turn marker (amber gold)
  rival: '#d4392c',      // the rival's (the one red)
  rivalInk: '#a9281f',   // the rival's red, deep enough to print on paper
  target: '#62c462',     // a legal target / ready state (green)
  scrim: 'rgba(6, 24, 20, 0.78)',   // modal backdrop over the scene

  // Stat inks on paper. Bright = buffed above base, dim = reduced/damaged.
  stat: {
    atk: '#171410',
    atkBright: '#3f8f3a',
    atkDim: '#8a8378',
    hp: '#d4392c',
    hpBright: '#e8633a',
    hpDim: '#9a6f68',
    shield: '#3f8f3a',
    // What a printed number scales with (RuleText's `{sp:3}` / `{bp:3}`):
    // plum grows with Spirit Power, a saddle brown with Bullet Power; plain
    // ink is a flat number. Both read on the cream card (4.6:1 or better on
    // paper, deep paper and the label band) and sit apart from the poster
    // red and the ink.
    spirit: '#7a4a8a',
    bullet: '#8a4f14',
  },
  status: {
    buff: '#3f8f3a',
    debuff: '#d4392c',
    utility: 'rgba(23, 20, 16, 0.64)',
  },

  // Deadlock's own HUD colours (its souls counter, its health frame, its
  // scoreboard): souls are a mint number beside the soul wisp, on a plate of
  // the HUD's dark green; the table under the cards is its teal-black.
  soul: '#60f8b3',        // the souls mint, on a dark ground
  soulInk: '#12714c',     // the same green pressed dark enough for cream paper
  soulShort: '#ff8a76',   // a price you cannot pay yet
  plate: '#0d2418',       // the HUD's dark green plate (health, souls)
  plateEdge: '#2a6a45',   // its lit edge
  shield: '#d9e3ee',      // a barrier's pale steel on the health bar
  slate: '#0b1716',       // the table's teal-black
  slateLit: '#17302d',
} as const;

/** The level greens: a hero card's frame from Level 1 (the lightest) to the
 *  cap (the darkest; MAX_LEVEL is 4 — engine/constants.ts). Chosen to read on
 *  the cream sheet and on the dark scene alike: each step is a clear jump,
 *  and the frame carries its own keylines (`levelFrame`) so the lightest
 *  holds on paper and the darkest on charcoal. */
export const levelGreens = ['#a9de8e', '#6ec75a', '#35973f', '#176130'] as const;
export const levelGreen = (level: number): string =>
  levelGreens[Math.max(0, Math.min(levelGreens.length - 1, Math.round(level) - 1))];
/** The frame of a hero card at `level`: a solid green border `width` px
 *  wide. Spread onto the card's style with `levelFrameKeylines` in its
 *  box-shadow — the ink hairline outside and the dark line inside keep the
 *  green apart from the paper and from the portrait's charcoal frame. */
export const levelFrame = (level: number, width = 3) => ({
  borderWidth: width,
  borderStyle: 'solid' as const,
  borderColor: levelGreen(level),
});
export const levelFrameKeylines = 'inset 0 0 0 1px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(23, 20, 16, 0.4)';

/** A shop category's inks, read off its token (styles.css: `--shop-weapon`,
 *  `--shop-vitality`, `--shop-spirit` — Deadlock's own amber, green and
 *  purple): the ink itself (a tile's frame, a lit tab's rule), `deep` — the
 *  ink pressed darker, for a keyline or a word drawn on it — and `wash`, a
 *  faint film of it on the shop's graphite panel. */
export const shopInk = (slot: 'weapon' | 'vitality' | 'spirit'): { ink: string; deep: string; wash: string } => {
  const ink = `var(--shop-${slot})`;
  return {
    ink,
    deep: `color-mix(in srgb, ${ink} 50%, ${poster.ink})`,
    wash: `color-mix(in srgb, ${ink} 16%, transparent)`,
  };
};

/** The ink a hero's Bullet Power prints in: the stat ink at its printed base,
 *  bright above it, dim below. */
export const atkInk = (atk: number, base: number): string =>
  atk > base ? poster.stat.atkBright : atk < base ? poster.stat.atkDim : poster.stat.atk;

/** The ink a hero's HP prints in: dim while it is hurt, bright while its max
 *  HP is raised above the printed base, else the stat ink. */
export const hpInk = (hp: number, hpMax: number, base: number): string =>
  hp < hpMax ? poster.stat.hpDim : hpMax > base ? poster.stat.hpBright : poster.stat.hp;

/** Deadlock's HUD glyphs (public/hud): the game's own white marks, painted
 *  in any colour through a mask. `soul.svg` is the soul wisp, `team_amber` /
 *  `team_sapphire` the two patrons' sigils, `ultimate.svg` the ultimate eye. */
export const HUD_IMG_BASE = `${BASE}hud/`;
export const hudGlyph = (file: string, width: number, height: number, color: string) => {
  const url = `url("${HUD_IMG_BASE}${file}")`;
  return {
    display: 'inline-block' as const,
    flexShrink: 0,
    width,
    height,
    backgroundColor: color,
    WebkitMaskImage: url,
    maskImage: url,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
  };
};

/** The soul wisp beside a souls number — Deadlock's souls icon, `size` px
 *  tall, in the souls mint (`ink` for another ground: `poster.soulInk` on
 *  paper). `empty` is a soul not yet earned: the wisp, faint. The name is
 *  from when this was a gold coin; every souls number in the game calls it. */
export const soulCoin = (size: number, empty = false, ink: string = poster.soul) =>
  hudGlyph('soul.svg', Math.round(size * 0.56), Math.round(size * 1.08), empty ? 'rgba(96, 248, 179, 0.3)' : ink);

/** Button skins for PosterButton (chrome.tsx). */
export const posterButtonSkins = {
  paper: { background: poster.paper, color: poster.ink, border: `2px solid ${poster.ink}` },
  ink:   { background: poster.ink, color: poster.paper, border: `2px solid ${poster.ink}` },
  red:   { background: poster.red, color: poster.paper, border: `2px solid ${poster.red}` },
  ghost: { background: 'transparent', color: poster.cream, border: `2px solid ${poster.edge}` },
} as const;
export type PosterButtonVariant = keyof typeof posterButtonSkins;

/** Spread a clip-path onto a style with its WebKit twin. Every chamfered
 *  surface needs both, and 38 hand-copied pairs is 38 chances to set one. */
export const clipBoth = (path: string | undefined) => ({
  clipPath: path,
  WebkitClipPath: path,
});

/** Chamfered corners — the poster's button, plate and card silhouette. */
export const chamfer = (n: number) =>
  `polygon(${n}px 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% calc(100% - ${n}px), calc(100% - ${n}px) 100%, ${n}px 100%, 0 calc(100% - ${n}px), 0 ${n}px)`;

/** Soft low-frequency mottling — the uneven sizing of a handmade sheet.
 *  Tile it under any paper surface. */
export const PAPER_MOTTLE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.035' numOctaves='3' seed='5' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.30  0 0 0 0 0.12  0 0 0 0.075 0'/%3E%3C/filter%3E%3Crect width='320' height='320' filter='url(%23p)'/%3E%3C/svg%3E")`;

/** The drop shadow under a framed tile — menu cards, hero slots, the framed
 *  portraits on the match-end sheet. */
export const tileShadow = '0 14px 26px rgba(0, 0, 0, 0.35), 0 3px 8px rgba(0, 0, 0, 0.25)';

/** The inner edge that makes a print sit slightly recessed in its frame. */
export const printEdge = 'inset 0 0 0 1px rgba(0, 0, 0, 0.35), inset 0 -18px 24px -12px rgba(0, 0, 0, 0.5)';

/** The modal backdrop: the scene dimmed to the poster's scrim, filling the
 *  viewport above everything. Spread FIRST, then add each site's z-index.
 *  Blurred behind on wider screens; a phone dims a little harder instead
 *  (styles.css, "Modal scrim"). */
export const scrimStyle = {
  position: 'fixed' as const,
  inset: 0,
  background: `var(--scrim, ${poster.scrim})`,
  backdropFilter: 'var(--scrim-blur, blur(6px))',
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

/** The cream sheet: paper + mottle + the drop shadow that floats it over
 *  the blurred scene. Spread onto a container's style. */
export const sheetStyle = {
  background: poster.paper,
  backgroundImage: PAPER_MOTTLE,
  backgroundSize: '320px 320px',
  boxShadow: [
    '0 40px 90px rgba(0, 0, 0, 0.55)',
    '0 8px 24px rgba(0, 0, 0, 0.35)',
    'inset 0 1px 0 rgba(255, 255, 255, 0.5)',
  ].join(', '),
} as const;

/** The HP bar's ink on its dark track: green while the hero has over half
 *  its HP, amber down to a quarter, red under it. */
export function hpBarInk(hp: number, hpMax: number): string {
  const frac = hpMax > 0 ? hp / hpMax : 0;
  return frac > 0.5 ? '#5fd35f' : frac > 0.25 ? '#f0b83a' : '#e8492f';
}
