// Start / play-mode select screen. Borrows the composition + torn-paper card
// metaphor from Deadlock's "SELECT PLAY MODE" screen, recoloured into the
// app's warm parchment palette. One functional primary tile (Quick Match vs
// AI), one secondary tile linking into the existing preview gallery, and
// one greyed "coming soon" placeholder to preserve the busy-menu composition.
//
// Typography: header + tile labels use `fonts.display` (Saira Stencil One)
// — the brand-display stack from tokens.ts; stencil-cut letterforms give
// the menu a "stamped on a crate" feel that mirrors Deadlock's industrial
// UI flavor. Body / subtitle text follows `text.body` (Saira).

import { motion } from 'framer-motion';
import { palette, fonts, spring, text } from '../tokens';
import { TornTile } from './TornTile';
import { NycMap } from '../story/NycMap';

const ART_BASE = `${import.meta.env.BASE_URL ?? '/'}art/`;

interface StartScreenProps {
  onPlay: () => void;
  onStory?: () => void;
  onHeroes?: () => void;
  onDecks?: () => void;
}

export function StartScreen({ onPlay, onStory, onHeroes, onDecks }: StartScreenProps) {
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
          flex: 1,
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
            gridTemplateRows: '1.4fr 1fr',
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
            style={{ gridRow: '1', gridColumn: '1', minHeight: 0 }}
          >
            <TornTile
              variant="primary"
              rotation={-0.6}
              eyebrow="Vs AI"
              title="Quick Match"
              subtitle="Best of one. Solo against the computer."
              cta={{ label: 'Play' }}
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
            style={{ gridRow: '2', gridColumn: '1', minHeight: 0 }}
          >
            <TornTile
              variant="primary"
              rotation={0.8}
              eyebrow="Campaign"
              title="Story"
              subtitle="Fight uptown across old New York. Recruit, build, survive."
              cta={{ label: 'Begin' }}
              onClick={onStory}
              ariaLabel="Start Story campaign"
            >
              <StoryMapTeaser />
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
              rotation={1.2}
              eyebrow="QA Tool"
              title="Preview"
              subtitle="Every card and animation, in one room."
              onClick={() => {
                const base = import.meta.env.BASE_URL ?? '/';
                window.location.href = `${base}?preview=1`;
              }}
              ariaLabel="Open preview gallery"
            >
              <HeroPortraitFan />
            </TornTile>
          </motion.div>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 24 },
              show: { opacity: 1, y: 0, transition: spring.default },
            }}
            style={{ gridRow: '2', gridColumn: '2', minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}
          >
            <TornTile
              variant="wide"
              rotation={-1.2}
              eyebrow="Collection"
              title="Heroes"
              subtitle="Set preferred draft picks."
              onClick={onHeroes}
              ariaLabel="Manage preferred heroes"
            >
              <HeroPrefsIcon />
            </TornTile>
            <TornTile
              variant="wide"
              rotation={1.4}
              eyebrow="Collection"
              title="Decks"
              subtitle="Build spell & item decks."
              onClick={onDecks}
              ariaLabel="Manage decks"
            >
              <DeckIcon />
            </TornTile>
          </motion.div>
        </motion.div>

        <Footer />
      </motion.div>
    </div>
  );
}

function StoryMapTeaser() {
  // A framed vintage-NYC-map vignette pinned to the right of the Story tile,
  // previewing the campaign's overworld. Reuses the same SVG map as the mode.
  return (
    <div
      style={{
        position: 'absolute',
        right: 22,
        top: '50%',
        transform: 'translateY(-50%) rotate(-1.5deg)',
        width: '46%',
        aspectRatio: '1200 / 700',
        borderRadius: 6,
        overflow: 'hidden',
        border: `5px solid ${palette.bg2}`,
        boxShadow:
          '0 14px 28px rgba(40,20,0,0.35), 0 2px 6px rgba(40,20,0,0.20), inset 0 0 0 1px rgba(120,80,30,0.25)',
        pointerEvents: 'none',
        filter: 'sepia(0.12) saturate(0.95)',
      }}
    >
      <NycMap />
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
        top: 80,
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
          // Subtle sepia pulls the cold teal sky into the warm parchment register.
          filter: 'sepia(0.10) saturate(0.95)',
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
        top: 60,
        bottom: 220,
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
          // Near-noop on this already-warm keyart; kept for parity with
          // OldGodsBanner so the pair of posters tints together.
          filter: 'sepia(0.10) saturate(0.95)',
          boxShadow:
            '0 14px 28px rgba(40,20,0,0.35), 0 2px 6px rgba(40,20,0,0.20), inset 0 0 0 1px rgba(120,80,30,0.25)',
          userSelect: 'none',
        }}
      />
    </div>
  );
}

const HERO_BASE = `${import.meta.env.BASE_URL ?? '/'}heroes/`;

function HeroPortraitFan() {
  // Three hero card portraits fanned to the right side of the Preview tile —
  // a literal preview of what the gallery shows when clicked. Plain <img> on
  // the hero card webp, mirroring DraftOverlay's HeroThumb pattern.
  const heroes = [
    { id: 'hero_haze', rotate: -12, dx: -68 },
    { id: 'hero_vindicta', rotate: 0, dx: 0, focused: true },
    { id: 'hero_abrams', rotate: 12, dx: 68 },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        right: 32,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 320,
        height: 200,
        pointerEvents: 'none',
      }}
    >
      {heroes.map((h, i) => (
        <motion.img
          key={h.id}
          src={`${HERO_BASE}${h.id}_card.webp`}
          alt=""
          aria-hidden
          draggable={false}
          initial={{ opacity: 0, y: 14, rotate: h.rotate * 0.3 }}
          animate={{ opacity: h.focused ? 1 : 0.88, y: 0, rotate: h.rotate }}
          transition={{ ...spring.soft, delay: 0.9 + i * 0.08 }}
          style={{
            position: 'absolute',
            left: '50%',
            top: 8,
            width: 122,
            height: 162,
            marginLeft: -61 + h.dx,
            objectFit: 'cover',
            objectPosition: '50% 14%',
            borderRadius: 3,
            border: h.focused
              ? `2px solid ${palette.accent}`
              : `1px solid rgba(176, 120, 37, 0.5)`,
            background: '#1a0f06',
            // Sepia + desaturate pulls cold hero hues (Vindicta blue-purple,
            // Abrams steel-blue) into the warm parchment/brass palette so the
            // fan reads as tinted prints, not full-color renders.
            filter: 'sepia(0.22) saturate(0.85) contrast(1.04)',
            boxShadow: h.focused
              ? '0 10px 24px rgba(40,20,0,0.42), 0 0 0 1px rgba(176,120,37,0.5)'
              : '0 6px 16px rgba(40,20,0,0.32)',
            zIndex: h.focused ? 2 : 1,
            userSelect: 'none',
          }}
        />
      ))}
    </div>
  );
}

function HeroPrefsIcon() {
  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-55%)',
        pointerEvents: 'none',
      }}
    >
      {['hero_haze', 'hero_abrams'].map((id, i) => (
        <img
          key={id}
          src={`${HERO_BASE}${id}_card.webp`}
          alt=""
          aria-hidden
          draggable={false}
          style={{
            width: 52,
            height: 68,
            objectFit: 'cover',
            objectPosition: '50% 14%',
            borderRadius: 3,
            border: `1px solid ${palette.accent}`,
            background: '#1a0f06',
            filter: 'sepia(0.15) saturate(0.9)',
            boxShadow: '0 4px 12px rgba(40,20,0,0.35)',
            position: i === 0 ? 'relative' as const : 'absolute' as const,
            ...(i === 1 ? { top: -12, left: 36 } : {}),
            zIndex: 2 - i,
            userSelect: 'none' as const,
          }}
        />
      ))}
    </div>
  );
}

function DeckIcon() {
  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        top: '50%',
        transform: 'translateY(-55%)',
        pointerEvents: 'none',
      }}
    >
      <svg viewBox="0 0 80 80" width="64" height="64" aria-hidden>
        {[0, 4, 8].map((offset, i) => (
          <rect
            key={i}
            x={10 + offset}
            y={8 + offset}
            width="48"
            height="64"
            rx="4"
            fill={i === 2 ? palette.bg2 : palette.bg3}
            stroke={palette.accent}
            strokeWidth="1.5"
            opacity={0.6 + i * 0.2}
          />
        ))}
        <text
          x="34"
          y="52"
          textAnchor="middle"
          fill={palette.accent}
          fontSize="22"
          fontWeight="700"
          fontFamily={fonts.display}
        >
          5
        </text>
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
      <motion.img
        src={`${ART_BASE}deadlock_wordmark.png`}
        alt="Deadlock"
        draggable={false}
        variants={{
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: spring.soft },
        }}
        style={{
          height: 64,
          width: 'auto',
          filter: 'drop-shadow(0 2px 6px rgba(40,20,0,0.18))',
          userSelect: 'none',
        }}
      />

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
        textAlign: 'center',
        marginTop: 'auto',
        paddingTop: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ ...text.body, color: palette.textFaint }}>
        A fan-made tabletop adaptation. Not affiliated with Valve.
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 11,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color: palette.textFaint,
          opacity: 0.75,
        }}
      >
        v0.1 · build
      </div>
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
