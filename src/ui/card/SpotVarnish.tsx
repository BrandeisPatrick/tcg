/**
 * Spot varnish / metallic ink — the premium print treatment for rarity 4,
 * built as an alternative to holofoil rather than an imitation of it.
 *
 * The idea is a real print-shop one: a premium sheet gets an extra plate.
 * Metallic ink over selected type (the keyline, the type band, the name) and
 * a clear varnish over selected panels. Everything else — crucially the art
 * window — stays matte, so the card is still a screen print that happens to
 * have been finished expensively, not a laminated slab.
 *
 * Two rules keep it on the right side of that line, and both are load-bearing:
 *   1. One hue. Metal is light/dark reversals in a single gold; a hue sweep
 *      is holofoil and reads as a different game.
 *   2. Masked, never washed. Each layer is confined to the plate it models.
 *
 * Layer CSS lives in styles.css under "Spot varnish"; this file is the
 * markup, the pointer plumbing, and the policy about when to move.
 */
import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useSettings } from '@/storage/settings';

/** Which plates the premium sheet got.
 *  - `stamp` — metallic ink only (keyline + type band + name)
 *  - `gloss` — clear spot varnish only (the two bands)
 *  - `both`  — the full premium finish */
export type Foil = 'stamp' | 'gloss' | 'both';

/** Iridescence. Three, because "holo" names three different physical things:
 *  - `split`    — a split-fountain rainbow roll, a real one-pass screen print.
 *                 Pigment in the sheet, so it shifts but never outshines ink.
 *  - `halftone` — the spectrum masked into a dot screen: the print's own
 *                 halftone carrying the iridescence instead of a coating.
 *  - `rainbow`  — the laminated holofoil. Full spectrum, color-dodge. */
export type Holo =
  // Washes — the iridescence covers the plate evenly.
  | 'split' | 'halftone' | 'rainbow'
  // Patterns — the iridescence lives inside a repeated motif, which is what
  // makes a card read as foil-STAMPED rather than laminated.
  | 'cosmos' | 'sigil' | 'tinsel' | 'wordmark';

/** The pattern holos all share one implementation and differ only by mask. */
const PATTERNS: Holo[] = ['cosmos', 'sigil', 'tinsel', 'wordmark'];
export const isPattern = (h: Holo) => PATTERNS.includes(h);

/** Where the iridescence was applied. `art` is the classic holo-in-the-art-box:
 *  it keeps the effect entirely off the rules text, which is the only part of
 *  the card with a contrast budget to lose. */
export type HoloScope = 'art' | 'card';

export const hasStamp = (f: Foil | null | undefined) => f === 'stamp' || f === 'both';
export const hasGloss = (f: Foil | null | undefined) => f === 'gloss' || f === 'both';

/**
 * Pointer plumbing for a foiled card. Returns handlers to spread on the card
 * container plus the ref to attach to it; the vars are written straight to
 * the node because a metallic ramp that re-rendered React on every mousemove
 * would cost a frame for nothing.
 *
 * Tracking the pointer is direct manipulation — the card turning as you move
 * over it, the way you tilt a real foiled card into the light — so it is not
 * gated on reduced motion. What *is* gated is `sweep()`, the scripted turn
 * that moves on its own.
 */
export function useFoilPointer(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);

  const set = (px: number, py: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--px', px.toFixed(4));
    el.style.setProperty('--py', py.toFixed(4));
  };

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, [active]);

  // Drop the local override on leave rather than pinning 0.5, so the card
  // falls back to whatever an ancestor supplies (the gallery sweeps a whole
  // grid that way) and otherwise to the 0.5 rest baked into the CSS.
  const clear = () => {
    const el = ref.current;
    if (!el) return;
    el.style.removeProperty('--px');
    el.style.removeProperty('--py');
  };
  const onPointerLeave = useCallback(() => { if (active) clear(); }, [active]);

  /** Turn the card through the light once, for call sites with no pointer:
   *  a phone, or the cast reveal. Autonomous motion, so reduced motion skips
   *  it and leaves the static ramp. */
  const sweep = useCallback((ms = 900) => {
    if (!active) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      // Ease out so the metal slows as it settles rather than stopping dead.
      const e = 1 - Math.pow(1 - k, 3);
      set(e, 0.5);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else { raf.current = null; clear(); }
    };
    raf.current = requestAnimationFrame(step);
  }, [active]);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  return { ref, onPointerMove, onPointerLeave, sweep };
}

/** True when scripted, self-starting foil motion is allowed. */
export function useFoilSweepAllowed() {
  const { reducedMotion } = useSettings();
  return !reducedMotion && !useReducedMotion();
}

/** The foil-stamped keyline: a metal ring masked into the card's 2px border. */
export function FoilEdge() {
  return <div aria-hidden className="foil-edge" />;
}

/** Clear varnish over one panel. Mount inside a `position: relative` band.
 *  `paper` switches the blend for cream stock, which `screen` would blow out. */
export function GlossPanel({ paper = false }: { paper?: boolean }) {
  return <div aria-hidden className={`foil-gloss${paper ? ' foil-gloss--paper' : ''}`} />;
}

/** Class for foil-stamped type. `deep` is the darker ramp that stays legible
 *  on cream paper; the full ramp is for type on the ink band. */
export const foilTextClass = (deep = false) => `foil-text${deep ? ' foil-text--deep' : ''}`;

/** What the bands are made of. `amber` is the game's own world — teal night
 *  against amber lamps, sampled from the backdrop scene. `rainbow` is the
 *  Pokémon palette and stays only as the reference look. */
export type HoloPalette = 'amber' | 'brass' | 'inks' | 'rainbow';

/** How hard the iridescence is pushed. 1 is the tuned default; `strong` is
 *  where the art starts losing to the effect, which is a taste call rather
 *  than a bug, so it is exposed instead of forbidden. */
export const HOLO_STRENGTH = { subtle: 0.55, medium: 1, strong: 1.8 } as const;
export type HoloStrength = keyof typeof HOLO_STRENGTH;

/** The iridescent layer — four sub-layers, see the Holo block in styles.css:
 *  two counter-travelling band layers, glitter near the light, and the glare.
 *  Mount inside whatever box it should be confined to — the art window for
 *  `art` scope, the card for `card`. */
export function HoloLayer({ variant, strength = 'medium', markScale = 1, palette = 'amber' }: {
  variant: Holo; strength?: HoloStrength; palette?: HoloPalette;
  /** Scales a pattern's tile. Ignored by the wash variants. */
  markScale?: number;
}) {
  const style = { '--holo-strength': HOLO_STRENGTH[strength] } as CSSProperties & Record<string, string | number>;
  if (isPattern(variant) && markScale !== 1) {
    // Each pattern declares its own base tile in CSS; scaling multiplies it
    // here rather than duplicating four more rules per size.
    style['--holo-mark-scale'] = markScale;
  }
  if (variant === 'wordmark') {
    // The asset path depends on the build base (GitHub Pages serves /tcg/),
    // which CSS cannot read — so the mask URL is injected rather than declared.
    const base = import.meta.env.BASE_URL ?? '/';
    style['--holo-mark'] = `url("${base}art/deadlock_wordmark_ink.png")`;
    style['--holo-mark-w'] = `${Math.round(150 * markScale)}px`;
  }
  return (
    <div aria-hidden className={`holo holo--${variant} holo--pal-${palette}`} style={style}>
      <i className="holo__shine" />
      <i className="holo__shine holo__shine--b" />
      <i className="holo__glitter" />
      <i className="holo__glare" />
    </div>
  );
}

/** The transform that turns the card to follow the pointer. Composed into
 *  CardFrame's existing transform rather than applied to a wrapper, so the
 *  card keeps the single compositor layer its lift animation depends on. */
export const TILT_TRANSFORM =
  'perspective(760px)' +
  ' rotateY(calc((var(--px, 0.5) - 0.5) * var(--tilt-max, 0deg)))' +
  ' rotateX(calc((0.5 - var(--py, 0.5)) * var(--tilt-max, 0deg)))';
