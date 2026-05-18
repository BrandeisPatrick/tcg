import { palette } from './tokens';

// Warm parchment backdrop: soft cream gradient with a barely-visible
// brown sunburst from center and a brown edge vignette. Replaces the dark
// HUD backdrop with a Belle Époque ledger-page feel.
export function ArenaBackdrop() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Soft parchment gradient — warmer center, slightly darker at edges */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 90% 50% at 50% 40%, rgba(255, 244, 210, 0.65), transparent 75%),
          radial-gradient(ellipse 80% 50% at 50% 100%, rgba(120, 80, 30, 0.06), transparent 65%),
          ${palette.bg0}
        `,
      }} />

      {/* Faint brown sunburst from center divider */}
      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          opacity: 0.05,
        }}
      >
        <defs>
          <radialGradient id="ad-fade" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#5a3f1c" stopOpacity="1" />
            <stop offset="100%" stopColor="#5a3f1c" stopOpacity="0" />
          </radialGradient>
          <mask id="ad-mask">
            <rect width="1600" height="1000" fill="url(#ad-fade)" />
          </mask>
        </defs>
        <g transform="translate(800 500)" mask="url(#ad-mask)">
          {Array.from({ length: 24 }).map((_, i) => {
            const a = (i * Math.PI) / 12;
            const x = Math.cos(a) * 1200;
            const y = Math.sin(a) * 1200;
            return <line key={i} x1={0} y1={0} x2={x} y2={y} stroke="#5a3f1c" strokeWidth="0.6" />;
          })}
        </g>
      </svg>

      {/* Warm brown edge vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse 100% 100% at 50% 55%, transparent 50%, rgba(80, 50, 15, 0.18) 100%)`,
      }} />
    </div>
  );
}
