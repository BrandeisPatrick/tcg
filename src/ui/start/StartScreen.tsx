// Start / play-mode select screen. Borrows the composition + torn-paper card
// metaphor from Deadlock's "SELECT PLAY MODE" screen, recoloured into the
// app's warm parchment palette. One functional primary tile (Quick Match vs
// AI), one secondary tile linking into the existing preview gallery, and
// one greyed "coming soon" placeholder to preserve the busy-menu composition.
//
// Typography note: header + tile labels use Exo 2 uppercase + letter-spacing.
// tokens.ts explicitly forbids those for in-game card UI; the start screen
// is a branding surface that deliberately deviates to match the source game.
// Body / subtitle text continues to follow `text.body` from tokens.

import { motion } from 'framer-motion';
import { palette, fonts, spring, text } from '../tokens';
import { TornTile } from './TornTile';

const ART_BASE = `${import.meta.env.BASE_URL ?? '/'}art/`;

interface StartScreenProps {
  onPlay: () => void;
}

export function StartScreen({ onPlay }: StartScreenProps) {
  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '56px 64px 80px',
        background: palette.bg0,
        color: palette.text,
        fontFamily: fonts.ui,
        overflow: 'hidden',
      }}
    >
      <Backdrop />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 1440,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 36,
        }}
      >
        <Header />

        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.12, delayChildren: 0.5 } },
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: '1.35fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: 24,
            minHeight: 600,
            maxHeight: 720,
          }}
        >
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 24 },
              show: { opacity: 1, y: 0, transition: spring.default },
            }}
            style={{ gridRow: '1 / span 2', gridColumn: '1', minHeight: 0 }}
          >
            <TornTile
              variant="primary"
              rotation={-0.6}
              eyebrow="Vs AI"
              title="Quick Match"
              subtitle="Best of one. Solo against the computer."
              onClick={onPlay}
              ariaLabel="Start Quick Match vs AI"
            >
              <OldGodsBanner />
              <KeyartPoster />
            </TornTile>
          </motion.div>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 24 },
              show: { opacity: 1, y: 0, transition: spring.default },
            }}
            style={{ gridRow: '1', gridColumn: '2', minHeight: 0 }}
          >
            <TornTile
              variant="wide"
              rotation={0.8}
              eyebrow="QA Tool"
              title="Preview"
              subtitle="Every card and animation, in one room."
              onClick={() => {
                const base = import.meta.env.BASE_URL ?? '/';
                window.location.href = `${base}?preview=1`;
              }}
              ariaLabel="Open preview gallery"
            >
              <CardStackSigil />
            </TornTile>
          </motion.div>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 24 },
              show: { opacity: 1, y: 0, transition: spring.default },
            }}
            style={{ gridRow: '2', gridColumn: '2', minHeight: 0 }}
          >
            <TornTile
              variant="wide"
              rotation={-0.4}
              eyebrow="Mode"
              title="Ranked"
              subtitle="Climb the ladder. Coming soon."
              comingSoon
            >
              <RankedSigil />
            </TornTile>
          </motion.div>
        </motion.div>

        <Footer />
      </motion.div>
    </div>
  );
}

function OldGodsBanner() {
  // "Old Gods, New Blood" Deadlock keyart (the six-heroes revamp update).
  // Wide landscape JPG; placed upper-left inside the primary tile as the
  // dominant visual. Counter-tilted from KeyartPoster for a hand-pinned
  // collage feel.
  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        top: 40,
        width: '58%',
        pointerEvents: 'none',
      }}
    >
      <motion.img
        src={`${ART_BASE}old_gods_new_blood.jpg`}
        alt=""
        aria-hidden
        draggable={false}
        initial={{ opacity: 0, x: -40, y: 8, rotate: 8 }}
        animate={{ opacity: 1, x: 0, y: 0, rotate: 2.5 }}
        transition={{ ...spring.soft, delay: 0.95 }}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          objectFit: 'cover',
          border: `6px solid ${palette.bg2}`,
          background: palette.bg2,
          boxShadow:
            '0 14px 28px rgba(40,20,0,0.35), 0 2px 6px rgba(40,20,0,0.20), inset 0 0 0 1px rgba(120,80,30,0.25)',
          userSelect: 'none',
        }}
      />
    </div>
  );
}

function KeyartPoster() {
  // Deadlock community keyart (steamgriddb by user "Lovely") placed on the
  // primary tile like a polaroid pinned to torn paper. The PNG is the brand
  // image — industrial building + DEADLOCK wordmark + compass emblem in warm
  // amber/brass tones. Sits inside the clipped tile so hover lifts it with
  // the parent.
  // Anchored top-right with bottom padding so it occupies the upper ~70% of
  // the right side, leaving the bottom-left label stack clear of any overlap.
  return (
    <div
      style={{
        position: 'absolute',
        right: 22,
        top: 22,
        bottom: 180,
        width: '32%',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      <motion.img
        src={`${ART_BASE}deadlock_keyart.png`}
        alt=""
        aria-hidden
        draggable={false}
        initial={{ opacity: 0, x: 40, y: 12, rotate: -8 }}
        animate={{ opacity: 1, x: 0, y: 0, rotate: -2 }}
        transition={{ ...spring.soft, delay: 0.85 }}
        style={{
          width: 'auto',
          height: '100%',
          maxWidth: '100%',
          objectFit: 'contain',
          border: `6px solid ${palette.bg2}`,
          background: palette.bg2,
          boxShadow:
            '0 14px 28px rgba(40,20,0,0.35), 0 2px 6px rgba(40,20,0,0.20), inset 0 0 0 1px rgba(120,80,30,0.25)',
          userSelect: 'none',
        }}
      />
    </div>
  );
}

function CardStackSigil() {
  // Three fanned cards rendered as a simple SVG sigil — same visual register
  // as the trophy sigil on the Ranked tile. Communicates "card library /
  // preview" without the noise of three full CardFrame components.
  return (
    <div
      style={{
        position: 'absolute',
        right: 24,
        top: '50%',
        transform: 'translateY(-50%) rotate(-4deg)',
        width: 170,
        height: 170,
        pointerEvents: 'none',
      }}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id="ps-card" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f5e8cc" />
            <stop offset="100%" stopColor="#ddc99b" />
          </linearGradient>
        </defs>
        {/* Back card */}
        <g transform="rotate(-14 50 90)">
          <rect
            x="22" y="22" width="46" height="62" rx="3"
            fill="url(#ps-card)" stroke="#5a3f1c" strokeWidth="1.1"
          />
          <rect x="28" y="28" width="34" height="22" rx="1.5" fill="#7a4f1a" opacity="0.35" />
          <line x1="28" y1="56" x2="60" y2="56" stroke="#5a3f1c" strokeWidth="0.6" />
          <line x1="28" y1="62" x2="56" y2="62" stroke="#5a3f1c" strokeWidth="0.5" />
          <line x1="28" y1="68" x2="50" y2="68" stroke="#5a3f1c" strokeWidth="0.5" />
        </g>
        {/* Middle card */}
        <g transform="rotate(2 50 86)">
          <rect
            x="28" y="20" width="46" height="62" rx="3"
            fill="url(#ps-card)" stroke="#5a3f1c" strokeWidth="1.1"
          />
          <rect x="34" y="26" width="34" height="22" rx="1.5" fill="#b07825" opacity="0.55" />
          <circle cx="51" cy="37" r="6" fill="#7a4f1a" opacity="0.6" />
          <line x1="34" y1="54" x2="66" y2="54" stroke="#5a3f1c" strokeWidth="0.6" />
          <line x1="34" y1="60" x2="62" y2="60" stroke="#5a3f1c" strokeWidth="0.5" />
          <line x1="34" y1="66" x2="56" y2="66" stroke="#5a3f1c" strokeWidth="0.5" />
        </g>
        {/* Front card */}
        <g transform="rotate(16 50 90)">
          <rect
            x="34" y="18" width="46" height="62" rx="3"
            fill="url(#ps-card)" stroke="#5a3f1c" strokeWidth="1.2"
          />
          <rect x="40" y="24" width="34" height="22" rx="1.5" fill="#4a7030" opacity="0.55" />
          <path d="M 47 36 l 4 -8 l 4 8 l 8 1 l -6 6 l 2 9 l -8 -4 l -8 4 l 2 -9 l -6 -6 z"
                fill="rgba(176,120,37,0.6)" stroke="#5a3f1c" strokeWidth="0.6" />
          <line x1="40" y1="52" x2="72" y2="52" stroke="#5a3f1c" strokeWidth="0.6" />
          <line x1="40" y1="58" x2="68" y2="58" stroke="#5a3f1c" strokeWidth="0.5" />
          <line x1="40" y1="64" x2="62" y2="64" stroke="#5a3f1c" strokeWidth="0.5" />
        </g>
      </svg>
    </div>
  );
}

function RankedSigil() {
  // Trophy / ladder sigil for the coming-soon Ranked tile. Pure SVG so it
  // doesn't depend on any hero art and stays palette-coherent on parchment.
  return (
    <div
      style={{
        position: 'absolute',
        right: 24,
        top: '50%',
        transform: 'translateY(-50%) rotate(2deg)',
        width: 160,
        height: 160,
        pointerEvents: 'none',
        opacity: 0.85,
      }}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
        <defs>
          <radialGradient id="rank-fill" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0%" stopColor="#cc9a44" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#7a4f1a" stopOpacity="0.55" />
          </radialGradient>
        </defs>
        <g stroke="#5a3f1c" strokeWidth="1.2" fill="none">
          <circle cx="50" cy="42" r="22" fill="url(#rank-fill)" />
          <path d="M 28 42 q -10 4 -10 -10 q 0 -8 10 -8" />
          <path d="M 72 42 q 10 4 10 -10 q 0 -8 -10 -8" />
          <path d="M 40 64 v 8 q 0 4 -4 6 h 28 q -4 -2 -4 -6 v -8" fill="rgba(176,120,37,0.18)" />
          <path d="M 30 84 h 40" strokeWidth="1.6" />
          <path d="M 35 88 h 30" strokeWidth="1" />
          <path d="M 42 18 l 4 8 l 8 1 l -6 6 l 2 9 l -8 -4 l -8 4 l 2 -9 l -6 -6 l 8 -1 z"
                fill="rgba(176,120,37,0.5)" strokeWidth="0.8" transform="translate(4 0)" />
        </g>
      </svg>
    </div>
  );
}

function Header() {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: spring.soft },
        }}
        style={{
          fontFamily: '"Exo 2 Variable", "Exo 2", ' + fonts.ui,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '0.42em',
          textTransform: 'uppercase',
          color: palette.accent,
        }}
      >
        Select Play Mode
      </motion.div>

      <motion.img
        src={`${ART_BASE}deadlock_wordmark.png`}
        alt="Deadlock"
        draggable={false}
        variants={{
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: spring.soft },
        }}
        style={{
          height: 56,
          width: 'auto',
          filter: 'drop-shadow(0 2px 6px rgba(40,20,0,0.18))',
          userSelect: 'none',
        }}
      />

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: spring.soft },
        }}
        style={{
          fontFamily: '"Exo 2 Variable", "Exo 2", ' + fonts.ui,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.42em',
          textTransform: 'uppercase',
          color: palette.textDim,
          marginTop: -2,
        }}
      >
        TCG
      </motion.div>

      <motion.div
        aria-hidden
        variants={{
          hidden: { opacity: 0, scaleX: 0.4 },
          show: { opacity: 1, scaleX: 1, transition: spring.soft },
        }}
        style={{
          position: 'relative',
          width: 220,
          height: 1,
          background: palette.accent,
          marginTop: 6,
          transformOrigin: 'center',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: -3,
            left: -3,
            width: 7,
            height: 7,
            borderTop: `1px solid ${palette.accent}`,
            borderLeft: `1px solid ${palette.accent}`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 7,
            height: 7,
            borderTop: `1px solid ${palette.accent}`,
            borderRight: `1px solid ${palette.accent}`,
          }}
        />
      </motion.div>
    </motion.div>
  );
}

function Footer() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.soft, delay: 1.0 }}
      style={{
        ...text.body,
        color: palette.textFaint,
        textAlign: 'center',
        marginTop: 8,
      }}
    >
      A fan-made tabletop adaptation. Not affiliated with Valve.
    </motion.div>
  );
}

function Backdrop() {
  // Sparse parchment engraving + corner vignettes + center wash. Same
  // visual language as the in-game ArenaBackdrop so menu and match share
  // a backdrop feel; only the radial-line motif is denser to fill empty
  // landing-page real estate.
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse 70% 50% at 50% 38%, rgba(255, 244, 210, 0.55), transparent 70%),
            radial-gradient(circle at 8% 8%, rgba(176, 120, 37, 0.10), transparent 22%),
            radial-gradient(circle at 92% 8%, rgba(176, 120, 37, 0.10), transparent 22%),
            radial-gradient(circle at 8% 92%, rgba(120, 80, 30, 0.08), transparent 22%),
            radial-gradient(circle at 92% 92%, rgba(120, 80, 30, 0.08), transparent 22%)
          `,
        }}
      />
      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.07 }}
      >
        <defs>
          <radialGradient id="ss-bg-fade" cx="0.5" cy="0.5" r="0.55">
            <stop offset="0%" stopColor="#5a3f1c" stopOpacity="1" />
            <stop offset="100%" stopColor="#5a3f1c" stopOpacity="0" />
          </radialGradient>
          <mask id="ss-bg-mask">
            <rect width="1600" height="1000" fill="url(#ss-bg-fade)" />
          </mask>
        </defs>
        <g transform="translate(800 500) rotate(7)" mask="url(#ss-bg-mask)">
          {Array.from({ length: 36 }).map((_, i) => {
            const a = (i * Math.PI) / 18;
            const x = Math.cos(a) * 1200;
            const y = Math.sin(a) * 1200;
            return (
              <line
                key={i}
                x1={0}
                y1={0}
                x2={x}
                y2={y}
                stroke="#5a3f1c"
                strokeWidth="0.6"
              />
            );
          })}
          {[260, 420, 600].map((r) => (
            <circle key={r} cx={0} cy={0} r={r} fill="none" stroke="#5a3f1c" strokeWidth="0.6" />
          ))}
        </g>
      </svg>
    </div>
  );
}
