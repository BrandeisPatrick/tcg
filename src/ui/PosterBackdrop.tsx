/**
 * Poster backdrop — a Deadlock night scene pushed far out of focus, so a
 * cream sheet floats on a dark green-teal blur the way a print sits on a
 * gallery wall. Shared by the title screen and the match board; a faint
 * push-in keeps it alive.
 *
 * `position: fixed` so it stays put when a phone-height layout scrolls.
 * Only opacity is animated on the screen wrapper above, so fixed
 * positioning is not broken by an ancestor transform.
 */

const ART_BASE = `${import.meta.env.BASE_URL ?? '/'}art/`;

// Light print grain screened over the blur so it reads as a surface.
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.85  0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23n)'/%3E%3C/svg%3E")`;

export function PosterBackdrop({
  ambient,
  scene = 'menu_scene.jpg',
  focus = '50% 45%',
}: {
  /** Run the slow push-in (off under reduced motion). */
  ambient: boolean;
  /** File under public/art to blur. */
  scene?: string;
  /** objectPosition for the cover crop. */
  focus?: string;
}) {
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
      <img
        src={`${ART_BASE}${scene}`}
        alt=""
        draggable={false}
        className={ambient ? 'ss-drift' : undefined}
        style={{
          position: 'absolute',
          // Oversized so the blur never shows a soft edge at the viewport.
          inset: '-6%',
          width: '112%',
          height: '112%',
          objectFit: 'cover',
          objectPosition: focus,
          filter: 'blur(18px) saturate(0.85) brightness(0.6)',
          transform: 'scale(1.02)',
          userSelect: 'none',
        }}
      />
      {/* Cool wash + vignette — pulls the scene to one dark green-teal. */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(6, 24, 20, 0.36)' }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 80% 72% at 50% 42%, transparent 28%, rgba(0, 0, 0, 0.28) 66%, rgba(0, 0, 0, 0.58) 100%)',
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: GRAIN,
        backgroundSize: '260px 260px',
        mixBlendMode: 'screen',
      }} />
    </div>
  );
}
