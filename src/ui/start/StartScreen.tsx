// Title screen — a screen-printed poster. One big cream sheet floats on a
// blurred night scene; on it, flat ink lettering (the Deadlock letterforms
// baked to solid black), a brush-script lead-in, a red starburst seal and an
// angular window onto an old New York street. Along the foot of the sheet,
// the five modes are dealt as tall framed cards in the game's own menu-card
// idiom: hero art edge to edge inside a charcoal frame, a cream label band
// beneath. Every card shows real save state (selected deck, campaign
// progress, squad picks) so the poster reads as a game that remembers you,
// not a set of links. The tutorial sits second, straight after Quick Match,
// and until it has been played its card wears the red "Start here" tag —
// the one bit of steering the sheet does.
//
// Typography: script lead-in in `fonts.script` (Caveat Brush), labels and
// titles in `fonts.display` (Saira Stencil One), body in `text.body`.

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { fonts, spring, text } from '../tokens';
import { poster, PAPER_MOTTLE, clipBoth } from '../poster';
import { PosterBackdrop } from '../PosterBackdrop';
import { StorySkyline } from './cardScenes';
import { useViewport } from '../hooks/useViewport';
import { loadPlayerData, MAX_PREFERRED_HEROES } from '@/storage/playerData';
import { loadRun } from '@/story/storyRun';
import { CARDS_BY_ID, HEROES, SPELLS, EQUIPMENT } from '@/cards';
import { heroArtFocus } from '@/cards/art/heroArt';

const BASE = import.meta.env.BASE_URL ?? '/';
const ART_BASE = `${BASE}art/`;
const HERO_BASE = `${BASE}heroes/`;

// Print palette — the sheet's own inks, deliberately flatter and blacker
// than the parlor tokens so the poster reads as printed, not upholstered.
const ink = {
  paper: poster.paper,
  black: poster.ink,
  dim: poster.inkDim,
  faint: poster.inkFaint,
  red: poster.red,
  frame: poster.frame,
  frameLit: poster.frameLit,
  band: poster.paperBand,
} as const;

// Poster hero for the Quick Match card. Drawn from the 1230×626 splash set
// (sharp enough for a portrait crop) minus the heroes that hold a fixed card
// below, so no face appears twice; rotates daily so the title never
// fossilises on one hero.
const FEATURED_HEROES = ['hero_abrams', 'hero_wraith', 'hero_yamato', 'hero_mirage'] as const;
function featuredHero(): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return FEATURED_HEROES[day % FEATURED_HEROES.length];
}

interface StartScreenProps {
  onPlay: () => void;
  onStory?: () => void;
  onTutorial?: () => void;
  onLoadout?: () => void;
}

/** Live one-liners from save data — computed once per mount (the screen
 *  remounts on every return to the title, so it's always current). */
function useTitleStatus() {
  return useMemo(() => {
    const data = loadPlayerData();
    const deck = data.selectedDeckIndex != null ? data.decks[data.selectedDeckIndex] : null;
    const picks = data.preferredHeroes.filter(Boolean).length;
    const run = loadRun();
    const active = !!run && run.status === 'active';
    const story = !run
      ? 'New run · pick a starting hero'
      : run.status === 'won'
        ? 'Campaign won · start a new run'
        : run.status === 'lost'
          ? 'Run lost · start again'
          : `Run · ${run.clearedNodeIds.length}/${run.nodes.length} blocks · ${run.heroes.length} ${run.heroes.length === 1 ? 'hero' : 'heroes'}`;
    return {
      quick: deck ? `Deck · ${deck.name}` : 'Deck · Starter',
      story,
      storyActive: active,
      // One line for both halves of the merged sheet: who you asked the draft
      // for, and what you're carrying.
      loadout: `${picks}/${MAX_PREFERRED_HEROES} squad · ${deck ? deck.name : 'no deck'}`,
      tutorial: data.tutorialDone ? 'Played · run it again' : 'Learn the moves in one match',
      tutorialDone: data.tutorialDone,
      gallery: `${HEROES.length} heroes · ${SPELLS.length} spells · ${EQUIPMENT.length} items`,
    };
  }, []);
}

export function StartScreen({ onPlay, onStory, onTutorial, onLoadout }: StartScreenProps) {
  const { isMobile, width } = useViewport();
  const status = useTitleStatus();
  const featured = useMemo(featuredHero, []);
  const featuredName = CARDS_BY_ID[featured]?.name ?? '';
  // The street window sits beside the title only when there's room for it.
  const wide = width >= 1024;

  const openGallery = () => {
    window.location.href = `${BASE}?preview=1`;
  };

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? 10 : 'clamp(14px, 3vh, 30px) clamp(14px, 3vw, 40px)',
        background: '#0d1715',
        color: ink.black,
        fontFamily: fonts.ui,
        overflowX: 'hidden',
      }}
    >
      <PosterBackdrop />

      {/* The sheet. */}
      <motion.section
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
        aria-label="Main menu"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 1380,
          minHeight: isMobile ? undefined : 'min(900px, calc(100dvh - 60px))',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: isMobile ? 18 : 28,
          background: ink.paper,
          boxShadow: [
            '0 40px 90px rgba(0, 0, 0, 0.55)',
            '0 8px 24px rgba(0, 0, 0, 0.35)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.5)',
          ].join(', '),
          overflow: 'hidden',
        }}
      >
        {/* Paper — mottled sizing under everything. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: PAPER_MOTTLE,
            backgroundSize: '320px 320px',
            pointerEvents: 'none',
          }}
        />

        <TopStrip compact={isMobile} />

        {/* Title row: lettering left, the street window right, the seal
            hanging between them. */}
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'grid',
            gridTemplateColumns: wide ? 'minmax(0, 1fr) minmax(0, 0.95fr)' : '1fr',
            alignItems: 'center',
            padding: isMobile ? '14px 18px 6px' : wide ? '10px 0 8px clamp(28px, 4vw, 60px)' : '14px 36px 8px',
          }}
        >
          <TitleBlock compact={isMobile} />
          {wide && <StreetWindow />}
          {/* Narrow sheets lose the street window; the seal keeps its spot
              beside the lettering. (Phones stick it on the top card instead —
              this corner belongs to the fixed system gear there.) */}
          {!wide && !isMobile && (
            <Starburst
              size={120}
              rotate={-10}
              script="Now in"
              big="Playtest!"
              style={{ position: 'absolute', right: 30, top: 8 }}
            />
          )}
        </div>

        {/* The hand — five framed cards along the foot of the sheet. */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.06, delayChildren: 0.28 } },
          }}
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, minmax(0, 1fr))',
            gap: isMobile ? 10 : 'clamp(12px, 1.4vw, 18px)',
            padding: isMobile
              ? '16px 12px 12px'
              : 'clamp(18px, 2.6vh, 30px) clamp(22px, 3vw, 36px) clamp(22px, 3vh, 34px)',
          }}
        >
          {isMobile && (
            <Starburst
              size={84}
              rotate={-12}
              script="Now in"
              big="Playtest!"
              style={{ position: 'absolute', right: 2, top: -26, zIndex: 2 }}
            />
          )}
          <ModeCard
            title="Quick Match"
            status={status.quick}
            cta="Play"
            tag={`Featured · ${featuredName}`}
            art={{ src: `${HERO_BASE}${featured}_splash.webp`, objectPosition: heroArtFocus(featured, 'splash', '50% 18%') }}
            onClick={onPlay}
            ariaLabel="Start Quick Match vs AI"
            compact={isMobile}
            span={isMobile ? 2 : 1}
          />
          <ModeCard
            title="Tutorial"
            status={status.tutorial}
            cta={status.tutorialDone ? undefined : 'Learn'}
            tag={status.tutorialDone ? undefined : 'Start here'}
            art={{ src: `${ART_BASE}bill_heroes.webp`, objectPosition: '50% 46%' }}
            onClick={onTutorial}
            ariaLabel="Play the coached tutorial match"
            compact={isMobile}
          />
          <ModeCard
            title="Story"
            status={status.story}
            cta={status.storyActive ? 'Continue' : 'Begin'}
            art={{ node: <StorySkyline /> }}
            onClick={onStory}
            ariaLabel={status.storyActive ? 'Continue Story campaign' : 'Start Story campaign'}
            compact={isMobile}
          />
          <ModeCard
            title="Loadout"
            status={status.loadout}
            art={{ src: `${ART_BASE}bill_decks.webp`, objectPosition: '50% 34%' }}
            onClick={onLoadout}
            ariaLabel="Set your squad and deck"
            compact={isMobile}
          />
          <ModeCard
            title="Gallery"
            status={status.gallery}
            art={{ src: `${ART_BASE}bill_gallery.webp`, objectPosition: '50% 40%' }}
            onClick={openGallery}
            ariaLabel="Open the card gallery"
            compact={isMobile}
          />
        </motion.div>
      </motion.section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sheet chrome                                                        */
/* ------------------------------------------------------------------ */

const stripText = {
  fontFamily: fonts.display,
  fontSize: 10.5,
  letterSpacing: '0.24em',
  textTransform: 'uppercase' as const,
  color: ink.dim,
  whiteSpace: 'nowrap' as const,
} as const;

/** Top strip — attribution, the dial emblem, and the build tag. The right
 *  slot leaves room for the fixed system gear that lives in that corner. */
function TopStrip({ compact }: { compact: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: compact ? '12px 12px 0 14px' : '18px 34px 0',
      }}
    >
      <span style={{ ...stripText, justifySelf: 'start' }}>
        Fan project
      </span>
      <Emblem />
      <span style={{ ...stripText, justifySelf: 'end', paddingRight: compact ? 42 : 40 }}>
        v0.1
      </span>
    </div>
  );
}

/** Ink square with a dial — the poster's printer's mark. */
function Emblem() {
  return (
    <span
      aria-hidden
      style={{
        width: 44,
        height: 44,
        borderRadius: 9,
        background: ink.black,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 3px 0 rgba(23, 20, 16, 0.18)',
      }}
    >
      <svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke={ink.paper} strokeWidth="1.6">
        <circle cx="20" cy="20" r="15.5" />
        <circle cx="20" cy="20" r="6.5" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={20 + Math.cos(a) * 6.5}
              y1={20 + Math.sin(a) * 6.5}
              x2={20 + Math.cos(a) * 15.5}
              y2={20 + Math.sin(a) * 15.5}
            />
          );
        })}
        <circle cx="20" cy="20" r="2.2" fill={ink.paper} stroke="none" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Title block + street window                                         */
/* ------------------------------------------------------------------ */

const WORDMARK_INK = `${ART_BASE}deadlock_wordmark_ink.png`;

function TitleBlock({ compact }: { compact: boolean }) {
  const rise = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: spring.soft },
  };
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } } }}
      style={{
        position: 'relative',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        paddingTop: compact ? 6 : 10,
        paddingBottom: compact ? 4 : 10,
        // Keep clear of the fixed system gear in the sheet's top-right corner.
        paddingRight: compact ? 48 : 0,
      }}
    >
      {/* Brush-script lead-in, tipped up like a hand-lettered overprint. */}
      <motion.div
        variants={rise}
        style={{
          fontFamily: fonts.script,
          fontSize: compact ? 28 : 'clamp(30px, 3vw, 44px)',
          lineHeight: 1,
          color: ink.black,
          transform: 'rotate(-3.5deg)',
          transformOrigin: 'left bottom',
          marginLeft: compact ? 4 : 8,
          marginBottom: compact ? 2 : 4,
        }}
      >
        Get dealt into
      </motion.div>

      <motion.img
        variants={rise}
        src={WORDMARK_INK}
        alt="Deadlock"
        draggable={false}
        style={{
          display: 'block',
          width: '100%',
          maxWidth: compact ? 300 : 'min(600px, 46vw)',
          height: 'auto',
          userSelect: 'none',
        }}
      />

      <motion.div
        variants={rise}
        style={{
          fontFamily: fonts.display,
          fontSize: compact ? 9.5 : 12,
          letterSpacing: compact ? '0.2em' : '0.42em',
          textTransform: 'uppercase',
          color: ink.dim,
          marginTop: compact ? 10 : 16,
          paddingLeft: 3,
          whiteSpace: 'nowrap',
        }}
      >
        Tabletop card battles · Old New York
      </motion.div>

    </motion.div>
  );
}

/** The angular photo window — an old New York street at dusk, cut like a
 *  shard and bleeding off the sheet's right edge, with the seal hanging
 *  from its lower-left corner. Decorative. */
function StreetWindow() {
  const clip = 'polygon(17% 5%, 100% 0, 100% 100%, 27% 100%, 0 62%)';
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...spring.soft, delay: 0.22 }}
      style={{
        position: 'relative',
        height: 'clamp(180px, 27vh, 270px)',
        marginLeft: 24,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          ...clipBoth(clip),
          overflow: 'hidden',
          background: '#0c1210',
        }}
      >
        <img
          src={`${ART_BASE}menu_street.jpg`}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: '55% 60%',
            filter: 'saturate(0.9) contrast(1.06)',
            userSelect: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(10, 16, 14, 0.55), transparent 55%)',
          }}
        />
        
      </div>
      <Starburst
        size={140}
        rotate={-10}
        script="Now in"
        big="Playtest!"
        style={{ position: 'absolute', left: '6%', bottom: -16 }}
      />
    </motion.div>
  );
}

/** Red screen-print starburst seal with script + display text. */
function Starburst({
  size, rotate, script, big, style,
}: {
  size: number;
  rotate: number;
  script: string;
  big: string;
  style?: CSSProperties;
}) {
  const points = 26;
  const star = (outer: number, inner: number) =>
    Array.from({ length: points * 2 }, (_, i) => {
      const a = (i * Math.PI) / points - Math.PI / 2;
      const r = i % 2 === 0 ? outer : inner;
      return `${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)}`;
    }).join(' ');

  return (
    <motion.div
      aria-hidden
      initial={{ scale: 0.3, rotate: rotate - 50, opacity: 0 }}
      animate={{ scale: 1, rotate, opacity: 1 }}
      transition={{ ...spring.bouncy, delay: 0.55 }}
      style={{
        width: size,
        height: size,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 10px 16px rgba(23, 20, 16, 0.32))',
        ...style,
      }}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <polygon points={star(50, 43)} fill={ink.red} />
        <polygon points={star(45, 38.7)} fill="none" stroke={ink.paper} strokeWidth="0.9" strokeOpacity="0.9" />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: ink.paper,
          transform: 'rotate(-4deg)',
        }}
      >
        <span style={{ fontFamily: fonts.script, fontSize: size * 0.18, lineHeight: 1, marginBottom: size * 0.02 }}>
          {script}
        </span>
        <span
          style={{
            fontFamily: fonts.display,
            fontSize: size * 0.2,
            lineHeight: 1,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          {big}
        </span>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Mode cards                                                          */
/* ------------------------------------------------------------------ */

/**
 * A card's art window. Either a photographic print (`src`, cover-cropped)
 * or a drawn scene / collage (`node`) — the screen-print illustrations
 * below, which suit the flat poster idiom better than a 3D render.
 */
type CardArt =
  | { src: string; objectPosition?: string; node?: never }
  | { node: ReactNode; src?: never; objectPosition?: never };

/**
 * A framed menu card in the game's own idiom: charcoal frame, hero art
 * printed edge to edge, a cream label band beneath with the title, a line
 * of copy and the live status. The whole card is the button; hover lifts
 * it, lights the frame and pushes into the art.
 */
function ModeCard({
  title, status, cta, tag, art, onClick, ariaLabel, compact, span = 1,
}: {
  title: string;
  status: string;
  cta?: string;
  tag?: string;
  art: CardArt;
  onClick?: () => void;
  ariaLabel: string;
  compact: boolean;
  span?: number;
}) {
  const height = compact ? (span > 1 ? 210 : 224) : 'clamp(240px, 38vh, 380px)';
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      variants={{
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: spring.default },
        hover: { y: -7 },
        tap: { y: -2, scale: 0.99 },
      }}
      whileHover="hover"
      whileTap="tap"
      transition={spring.snappy}
      style={{
        position: 'relative',
        gridColumn: span > 1 ? `span ${span}` : undefined,
        display: 'block',
        height,
        margin: 0,
        padding: 0,
        border: 'none',
        background: 'none',
        color: ink.black,
        textAlign: 'left',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      {/* Frame */}
      <motion.div
        variants={{
          hidden: { backgroundColor: ink.frame },
          show: { backgroundColor: ink.frame },
          hover: {
            backgroundColor: ink.frameLit,
            boxShadow: '0 26px 40px rgba(23, 20, 16, 0.4), 0 6px 12px rgba(23, 20, 16, 0.22)',
          },
          tap: { backgroundColor: ink.frameLit },
        }}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 14,
          padding: compact ? 5 : 7,
          backgroundColor: ink.frame,
          boxShadow: '0 14px 26px rgba(23, 20, 16, 0.3), 0 3px 8px rgba(23, 20, 16, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: 9,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: '#0f1214',
          }}
        >
          {/* Art */}
          <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {art.node ? (
              <motion.div
                aria-hidden
                variants={{ hidden: { scale: 1 }, show: { scale: 1 }, hover: { scale: 1.06 }, tap: { scale: 1.04 } }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                style={{ position: 'absolute', inset: 0 }}
              >
                {art.node}
              </motion.div>
            ) : (
              <motion.img
                src={art.src}
                alt=""
                aria-hidden
                draggable={false}
                variants={{ hidden: { scale: 1 }, show: { scale: 1 }, hover: { scale: 1.06 }, tap: { scale: 1.04 } }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: art.objectPosition ?? '50% 20%',
                  filter: 'saturate(0.94) contrast(1.05)',
                  userSelect: 'none',
                }}
              />
            )}
            {/* Inner edge — the print sits slightly recessed in its frame. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.35), inset 0 -18px 24px -12px rgba(0, 0, 0, 0.5)',
              }}
            />
            {/* Action sticker — the mode's verb, stuck to the print's corner. */}
            {cta && (
              <div
                style={{
                  position: 'absolute',
                  right: 10,
                  bottom: 10,
                  padding: '4px 9px 5px',
                  borderRadius: 3,
                  background: ink.red,
                  color: ink.paper,
                  fontFamily: fonts.display,
                  fontSize: 10,
                  letterSpacing: '0.24em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 3px 8px rgba(0, 0, 0, 0.35)',
                }}
              >
                {cta} ▸
              </div>
            )}
            {tag && (
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                  padding: '3px 8px',
                  background: ink.paper,
                  color: ink.black,
                  fontFamily: fonts.display,
                  fontSize: 9.5,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {tag}
              </div>
            )}
          </div>

          {/* Label band */}
          <div
            style={{
              position: 'relative',
              flexShrink: 0,
              padding: compact ? '9px 11px 10px' : '11px 14px 12px',
              background: ink.band,
              color: ink.black,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            <div
              style={{
                fontFamily: fonts.display,
                fontSize: compact ? 19 : 'clamp(18px, 1.7vw, 25px)',
                lineHeight: 1.1,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                // One line: "Quick Match" wraps on a narrow card, and a
                // two-line title would lift its band above the others.
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </div>
            {/* Two lines here as well: the status strings differ wildly in
                length ("No picks set" against "19 heroes · 16 spells · 44
                items"), and on a narrow card the longer ones wrap and would
                shift that title too. */}
            <div
              style={{
                ...text.label,
                fontSize: 10,
                color: ink.dim,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                marginTop: 2,
                minHeight: `${2 * 1.35 * 10}px`,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: ink.red, flexShrink: 0, marginTop: 3.5 }} />
              <span
                style={{
                  minWidth: 0,
                  lineHeight: 1.35,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {status}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.button>
  );
}

