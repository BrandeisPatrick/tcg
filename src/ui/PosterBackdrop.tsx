import { memo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useSettings } from '@/storage/settings';
import { useAmbientLoop, type Loop } from './hooks/useAmbientLoop';

/**
 * Poster backdrop — a Deadlock night scene pushed far out of focus, so a
 * cream sheet floats on a dark green-teal blur the way a print sits on a
 * gallery wall. Shared by the title screen and the match board; a faint
 * push-in keeps it alive.
 *
 * Nothing here is computed per frame. The blur, the grade and the teal wash
 * are baked into the image (scripts/art/bake_backdrop.sh); the vignette and
 * the grain are a still layer laid plainly over it, with no blend mode; and
 * the push-in moves the image in steps too small to see, a few times a
 * second, so the screen is redrawn a few times a second rather than sixty.
 *
 * `position: fixed` so it stays put when a phone-height layout scrolls.
 * Only opacity is animated on the screen wrapper above, so fixed
 * positioning is not broken by an ancestor transform.
 */

const ART_BASE = `${import.meta.env.BASE_URL ?? '/'}art/`;

// The scene, blurred, desaturated, darkened and washed teal ahead of time.
// The blur leaves only low frequencies, so a small image scaled up holds.
const GROUND = `url("${ART_BASE}menu_scene_ground.png")`;

// Pulls the edges down so the sheet sits in a pool of light.
const VIGNETTE = 'radial-gradient(ellipse 80% 72% at 50% 42%, transparent 28%, rgba(0, 0, 0, 0.28) 66%, rgba(0, 0, 0, 0.58) 100%)';

// Light print grain over the blur so it reads as a surface. Laid on plainly:
// over a scene this dark, screening it read the same.
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.85  0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23n)'/%3E%3C/svg%3E")`;

/**
 * The push-in: 60s in, from scale 1.02 to 1.09 and a little up and left,
 * then 60s back, eased in and out. At its fastest the scene's far corner
 * moves about a pixel a second, so a smooth glide had the whole screen
 * redrawn sixty times a second for motion nobody could see frame to frame.
 * Instead it advances in STEPS equal steps of its path, each held until the
 * eased curve reaches the next: about a third of a CSS pixel at most, a level
 * or two in any one pixel, four or five times a second at its fastest and
 * barely at all as it turns.
 */
const STEPS = 160;
const DRIFT: Loop = { keyframes: driftKeyframes(), duration: 120_000, easing: 'step-end' };

function driftKeyframes(): Keyframe[] {
  const at = (q: number) => ({ transform: `scale(${1.02 + 0.07 * q}) translate3d(${-1.5 * q}%, ${q}%, 0)` });
  // When the ease-in-out curve, cubic-bezier(0.42, 0, 0.58, 1), reaches q.
  const bez = (a: number, b: number, u: number) => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
  const when = (q: number) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) { const u = (lo + hi) / 2; if (bez(0, 1, u) < q) lo = u; else hi = u; }
    return bez(0.42, 0.58, (lo + hi) / 2);
  };
  const t = Array.from({ length: STEPS + 1 }, (_, k) => when(k / STEPS));
  const out: Keyframe[] = [];
  for (let k = 0; k <= STEPS; k++) out.push({ ...at(k / STEPS), offset: t[k] / 2 });
  // Back the same way: the curve is symmetric, so the steps mirror in time.
  for (let k = STEPS - 1; k >= 0; k--) out.push({ ...at(k / STEPS), offset: 1 - t[k] / 2 });
  return out;
}

// Memoised: the board re-renders on every move, and the backdrop never needs to.
export const PosterBackdrop = memo(function PosterBackdrop() {
  // The push-in policy lives here rather than at each call site: every screen
  // that mounts this wants the same answer, and five copies of the same two
  // lines is five chances to disagree.
  const { reducedMotion } = useSettings();
  const osReducedMotion = useReducedMotion();
  const ambient = !reducedMotion && !osReducedMotion;
  const drift = useAmbientLoop<HTMLDivElement>(ambient ? DRIFT : null);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: '#0d1715',
      }}
    >
      <div
        ref={drift}
        style={{
          position: 'absolute',
          // Oversized so the push-in never shows an edge at the viewport.
          inset: '-6%',
          background: `${GROUND} 50% 45% / cover no-repeat`,
          transform: 'scale(1.02)',
        }}
      />
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `${GRAIN}, ${VIGNETTE}`,
        backgroundSize: '260px 260px, 100% 100%',
      }} />
    </div>
  );
});
