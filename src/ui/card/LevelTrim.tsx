import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { useFxCalm } from '../effects/fx/FxMotionContext';

/**
 * The level bezel — a hero's level printed into its frame. The tile's 2px
 * outer border is the STATE channel (gold yours, red the rival's, green a
 * legal target, red armed), so the level never takes a border colour: it is
 * a solid band hugging the inside of the frame, with a 1px dark line along
 * its inner edge so it reads over the portrait and the cream label band
 * alike. Level 1 draws nothing.
 *
 * The level also reads by FORM, so it never rests on hue alone:
 *   Lv2  a plain band;
 *   Lv3  the band with photo corners — the triangles an album holds a
 *        print by — tucked into the frame's four corners;
 *   Lv4  a heavier band and larger corners in foil, with a slow sheen
 *        running round the band itself (still under calm motion).
 *
 * When the level rises under a mounted tile the new band strikes in — a
 * wide cream ring snaps out into the frame over it and fades (under half a
 * second; under calm motion it only flashes) — so the upgrade is seen.
 *
 * Mount as the last child of the frame (`position: relative; overflow:
 * hidden`); `radius` is the frame's inner corner radius.
 */

interface Foil { base: string; light: string; deep: string }

// Steel, blue, violet: the tier ramp games already teach (common, rare,
// epic), and none of it is a state colour. Each ink is mid-light so it holds
// on the charcoal frame; the keyline carries it over the cream band.
const INKS: { 2: string; 3: string; 4: Foil } = {
  2: '#9eadbc',
  3: '#3d86e3',
  4: { base: '#8a5cf0', light: '#cdb6ff', deep: '#5b33c2' },
};

// Sizes in px: [Active tile and sheet card, compact bench tile]. A photo
// corner's legs stop short of the level ring in the top-right corner and of
// the stat row along the bottom.
const BAND: Record<2 | 3 | 4, [number, number]> = { 2: [3, 2], 3: [3, 2], 4: [4, 3] };
const CORNER: Record<3 | 4, [number, number]> = { 3: [16, 12], 4: [18, 13] };
const KEYLINE = 'rgba(12, 10, 8, 0.72)';
const FLASH = '#fff4d8';
/** Overshoots its target once — the band snaps past flush and back. */
const SNAP = [0.34, 1.56, 0.64, 1] as const;

/** A ring the width of its padding: the fill shows only between the box's
 *  edge and its content box (the foil edge's mask, styles.css). */
const RING: CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 'inherit',
  overflow: 'hidden',
  WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
  WebkitMaskComposite: 'xor',
  mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
  maskComposite: 'exclude',   // must follow the shorthand, which resets it
};

/** How far in from the frame the bezel reaches, keyline included — content
 *  that must stay clear of it (the role band's identity key) steps in by
 *  this much. */
export function trimInset(level: number, compact: boolean): number {
  if (level < 2) return 0;
  return BAND[Math.min(4, level) as 2 | 3 | 4][compact ? 1 : 0] + 1;
}

export function LevelTrim({ level, radius, compact = false }: {
  level: number;
  radius: number;
  compact?: boolean;
}) {
  // The level this trim last drew. A rise strikes the new band in; the
  // first draw (a tile dealt, a hero respawning) does not.
  const seen = useRef<number | null>(null);
  const rose = seen.current !== null && level > seen.current;
  useEffect(() => { seen.current = level; }, [level]);
  if (level < 2) return null;
  const lv = Math.min(4, level) as 2 | 3 | 4;
  // Keyed by level, so a rise mounts a fresh bezel that reads `strike` once.
  return <Bezel key={lv} lv={lv} radius={radius} compact={compact} strike={rose} />;
}

function Bezel({ lv, radius, compact, strike }: {
  lv: 2 | 3 | 4; radius: number; compact: boolean; strike: boolean;
}) {
  const calm = useFxCalm();
  const [flash, setFlash] = useState(strike);
  const size = compact ? 1 : 0;
  const band = BAND[lv][size];
  const foil = lv === 4 ? INKS[4] : null;
  const ink = foil ? foil.base : INKS[lv as 2 | 3];
  const leg = lv === 2 ? 0 : CORNER[lv][size];
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: radius, pointerEvents: 'none' }}>
      <div style={{
        ...RING,
        padding: band,
        background: foil
          ? `linear-gradient(135deg, ${foil.deep}, ${foil.base} 28%, ${foil.light} 50%, ${foil.base} 72%, ${foil.deep})`
          : ink,
      }}>
        {foil && <Sheen calm={calm} />}
      </div>
      {/* The dark line along the band's inner edge. */}
      <div style={{
        position: 'absolute', inset: band,
        borderRadius: Math.max(0, radius - band),
        boxShadow: `inset 0 0 0 1px ${KEYLINE}`,
      }} />
      {leg > 0 && (['tl', 'tr', 'br', 'bl'] as const).map((c) => (
        <PhotoCorner key={c} corner={c} leg={leg} fill={foil ? foil.light : ink} />
      ))}
      {/* The strike: a wide cream ring over the new band, snapping out from
          inside the frame into it, then fading off it. */}
      {flash && (
        <motion.div
          initial={calm ? { opacity: 1 } : { opacity: 1, scale: 0.94 }}
          animate={calm ? { opacity: [1, 1, 0] } : { opacity: [1, 1, 0], scale: 1 }}
          transition={{
            opacity: { duration: 0.45, times: [0, 0.3, 1], ease: 'easeIn' },
            scale: { duration: 0.3, ease: SNAP },
          }}
          onAnimationComplete={() => setFlash(false)}
          style={{ ...RING, padding: band + 3, background: FLASH }}
        />
      )}
    </div>
  );
}

/** The foil's light: a soft arc of cream turning slowly round the band. The
 *  ring's mask keeps it on the band — nothing spills onto the print. */
function Sheen({ calm }: { calm: boolean }) {
  return (
    <motion.div
      animate={calm ? undefined : { rotate: 360 }}
      transition={calm ? undefined : { duration: 5, repeat: Infinity, ease: 'linear' }}
      style={{
        position: 'absolute', inset: '-100%',
        background: 'conic-gradient(transparent 0deg 270deg, rgba(255, 248, 232, 0.9) 318deg, transparent 352deg)',
      }}
    />
  );
}

/** A photo corner: a triangle of the band's ink tucked into one corner of
 *  the frame (whose rounded clip trims its point), with the keyline along
 *  its long edge. Drawn top-left and mirrored into place. */
function PhotoCorner({ corner, leg, fill }: { corner: 'tl' | 'tr' | 'br' | 'bl'; leg: number; fill: string }) {
  const top = corner[0] === 't';
  const left = corner[1] === 'l';
  return (
    <svg width={leg} height={leg} viewBox={`0 0 ${leg} ${leg}`} style={{
      position: 'absolute',
      ...(top ? { top: 0 } : { bottom: 0 }),
      ...(left ? { left: 0 } : { right: 0 }),
      transform: `scale(${left ? 1 : -1}, ${top ? 1 : -1})`,
    }}>
      <path d={`M0 0H${leg}L0 ${leg}Z`} fill={fill} />
      <path d={`M${leg} 0L0 ${leg}`} stroke={KEYLINE} strokeWidth={1.2} />
    </svg>
  );
}
