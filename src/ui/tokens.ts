// Design tokens — warm parchment / Belle Époque inversion of the original
// dark HUD. Cream surfaces, mahogany text, brass + wine accents. Cyan dropped.

export const palette = {
  // Surface ramp — warm parchment
  bg0: '#e8d8b4',          // page bg
  bg1: '#f0e2c2',          // panel bg
  bg2: '#f5e8cc',          // raised surface
  bg3: '#ddc99b',          // hover / pressed
  border: 'rgba(120, 80, 30, 0.28)',
  borderStrong: 'rgba(120, 80, 30, 0.5)',
  overlay: 'rgba(240, 226, 194, 0.88)',

  // Text — mahogany ramp
  text: '#2a1f12',
  textDim: '#7a5f3a',
  textFaint: '#a89572',

  // Accents — brass + wine (no cyan)
  accent: '#b07825',       // action focus
  accentWarm: '#cc6630',   // secondary warm
  danger: '#8a2e2a',       // wine red
  success: '#4a7030',      // forest, darker for cream contrast
  hp: '#c04a30',           // warm vermillion
  atk: '#996018',          // dark brass
  spirit: '#7a4a8a',       // muted plum
  pure: '#3a7a86',         // deep teal — desaturated

  // Rarity gems — re-pitched for visibility on cream
  rarity: {
    1: { fill: '#8e7e65', glow: 'rgba(142, 126, 101, 0.4)' },     // common - warm gray
    2: { fill: '#3a7030', glow: 'rgba(58, 112, 48, 0.45)' },      // uncommon - forest
    3: { fill: '#2a4870', glow: 'rgba(42, 72, 112, 0.5)' },       // rare - deep blue
    4: { fill: '#b07825', glow: 'rgba(176, 120, 37, 0.55)' },     // mythic - brass
  },

  // Card-type ribbons — cream-frame friendly
  type: {
    hero:      { from: '#3d2a14', to: '#1a0f06', accent: '#cc8932', ribbon: '#996018' },  // dark brass
    spell:     { from: '#2a1840', to: '#120822', accent: '#c878f0', ribbon: '#7a4a8a' },  // muted plum
    equipment: { from: '#1a3320', to: '#0a1a0d', accent: '#6dc04b', ribbon: '#4a7030' },  // forest
    ultimate:  { from: '#0a3a35', to: '#031a18', accent: '#98ffde', ribbon: '#b07825' },  // brass (accent)
  },

  // Cream/parchment for card description bodies — same as before, page now matches
  card: {
    body: '#f7e7d1',
    bodyDim: '#dec9a8',
    bodyText: '#1a1410',
    bodyTextDim: '#544a3b',
    bodyBorder: '#8a6d3a',   // stronger dark sepia frame
    flavor: '#7a6e58',
  },

  // Status categories
  status: {
    buff:    '#4a7030',
    debuff:  '#8a2e2a',
    utility: '#b07825',      // brass instead of cyan
  },
} as const;

export const fonts = {
  ui:      '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  /** @deprecated Use `fonts.ui` everywhere. Kept defined so the import keeps
   *  resolving while remaining usages get cleaned up; do not introduce new ones. */
  display: '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono:    'ui-monospace, "SF Mono", Menlo, monospace',
} as const;

// Shadows are now warm brown drops onto parchment, not black on dark.
export const shadow = {
  sm: '0 1px 2px rgba(40, 20, 0, 0.18)',
  md: '0 4px 12px rgba(40, 20, 0, 0.22)',
  lg: '0 12px 32px rgba(40, 20, 0, 0.28)',
  xl: '0 20px 60px rgba(40, 20, 0, 0.34)',
  glowAccent: '0 0 0 1px rgba(176, 120, 37, 0.55), 0 0 24px rgba(176, 120, 37, 0.4)',
  glowGold:   '0 0 0 1px rgba(176, 120, 37, 0.6), 0 0 28px rgba(176, 120, 37, 0.45)',
  glowDanger: '0 0 0 1px rgba(138, 46, 42, 0.5), 0 0 18px rgba(138, 46, 42, 0.4)',
} as const;

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  pill: 999,
} as const;

export const ease = {
  spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
  back:   'cubic-bezier(0.34, 1.56, 0.64, 1)',
  smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export const spring = {
  default: { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.8 },
  soft:    { type: 'spring' as const, stiffness: 220, damping: 26, mass: 1 },
  snappy:  { type: 'spring' as const, stiffness: 480, damping: 26, mass: 0.6 },
  bouncy:  { type: 'spring' as const, stiffness: 380, damping: 14, mass: 0.6 },
} as const;

export function rarityStyle(rarity: 1 | 2 | 3 | 4) {
  return palette.rarity[rarity];
}

export function typeTint(t: 'hero' | 'spell' | 'equipment' | 'ultimate') {
  return palette.type[t];
}

/**
 * UI typography — one-family system. Hierarchy by color + weight; size used
 * sparingly as the contrast register.
 *
 * CONSTRAINTS (enforced by code review, not by compiler):
 *   - Family: ONLY `fonts.ui` (Inter Variable). No `fonts.display`, no hardcoded family.
 *   - Weights: ONLY `400` (regular) or `700` (bold).
 *   - Transforms: NEVER `textTransform: 'uppercase'`, NEVER non-zero `letterSpacing`,
 *     NEVER `fontStyle: 'italic'`.
 *
 * Approved size scale (use the nearest tier, do not invent new sizes):
 *   - 11  — chrome / metadata (DLK identifier line, hand-card body)
 *   - 12  — default (labels, ribbons, names, body, log entries)
 *   - 14  — full-card name (preview / hover surface)
 *   - 16  — panel counters (patron HP, Souls, turn pip, respawn count, hand count)
 *   - 22  — large display (in-game stats: ATK/HP/SPI on hero detail + promotion modal,
 *           KO line, level ring centroid, ULT badge)
 *   - 28  — damage popup (the hit-landed beat; bigger than other display to read as IMPACT)
 *
 * Tokens (spread onto `style`; override `fontSize` inline where the scale demands):
 *   - `text.label`   12 / 700 — bold label
 *   - `text.body`    12 / 400 — regular prose
 *   - `text.numeric` 22 / 700 — tabular large display (override to 16 for panel counters)
 */
/** Shared hero stat-pair style (ATK / Lv / HP). Spread onto the inline-flex
 *  container; only size + colour vary per surface. */
export const statRow = {
  pair: (sizePx: number) => ({
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: Math.max(2, Math.round(sizePx * 0.22)),
    fontFamily: fonts.ui,
    fontWeight: 700,
    fontSize: sizePx,
    fontVariantNumeric: 'tabular-nums' as const,
    lineHeight: 1,
  }),
} as const;

export const text = {
  label: {
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0',
    textTransform: 'none' as const,
    lineHeight: 1.2,
  },
  body: {
    fontFamily: fonts.ui,
    fontSize: 12,
    fontWeight: 400,
    letterSpacing: '0',
    textTransform: 'none' as const,
    lineHeight: 1.45,
  },
  numeric: {
    fontFamily: fonts.ui,
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '0',
    fontVariantNumeric: 'tabular-nums' as const,
    lineHeight: 1,
  },
} as const;
