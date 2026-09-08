/**
 * Poster tokens — the screen-print look shared by the title sheet, the
 * draft lobby and the match board: cream paper, flat ink, one red, and the
 * state colours the lobby paints on card frames. Companion to tokens.ts
 * (whose parchment/brass ramp still serves the collection screens);
 * anything drawn in the poster idiom imports from here.
 */
export const poster = {
  // Paper — the cream sheet and its bands.
  paper: '#f2e6cb',
  paperDeep: '#e7d8b6',
  paperBand: '#ece3cf',

  // Ink — flat black type and rules on paper.
  ink: '#171410',
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
  you: '#d9b64a',        // your frames, keylines, turn marker (gold)
  rival: '#d4392c',      // the rival's (red)
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
    spirit: '#7a4a8a',
  },
  status: {
    buff: '#3f8f3a',
    debuff: '#d4392c',
    utility: 'rgba(23, 20, 16, 0.64)',
  },
} as const;

/** Flat soul coin — gold with an ink rim; `empty` is an ink outline. */
export const soulCoin = (size: number, empty = false) => ({
  width: size,
  height: size,
  borderRadius: '50%',
  flexShrink: 0,
  background: empty ? 'transparent' : poster.gold,
  border: `1.5px solid ${empty ? poster.inkFaint : poster.ink}`,
  boxSizing: 'border-box' as const,
});

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
 *  viewport above everything. Spread FIRST, then add each site's z-index. */
export const scrimStyle = {
  position: 'fixed' as const,
  inset: 0,
  background: poster.scrim,
  backdropFilter: 'blur(6px)',
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
