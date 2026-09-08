/**
 * The tutorial's lesson list — numbered rows on a cream sheet, each its
 * own short match. Finished lessons wear an ink tick; the first unfinished
 * one wears the red "Start" sticker. Any row can be played again.
 *
 * Printed in the poster idiom so it reads as the same object as the title
 * screen and the loadout sheet.
 */
import { motion } from 'framer-motion';
import { fonts, spring, text } from '../tokens';
import { poster, chamfer, sheetStyle, clipBoth } from '../poster';
import { PosterBackdrop } from '../PosterBackdrop';
import { PosterButton } from '../chrome';
import { useViewport } from '../hooks/useViewport';
import { HeroPortrait } from '@/cards/art/heroArt';
import { loadPlayerData } from '@/storage/playerData';
import { LESSONS, type LessonId } from '@/tutorial/lessons';

const COVER = `${import.meta.env.BASE_URL ?? '/'}art/bill_tutorial.webp`;

interface Props {
  onBack: () => void;
  onStart: (id: LessonId) => void;
}

export function LessonsScreen({ onBack, onStart }: Props) {
  const { isMobile } = useViewport();
  const done = new Set(loadPlayerData().lessonsDone);
  const next = LESSONS.find((l) => !done.has(l.id));

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: isMobile ? 10 : 'clamp(14px, 3vh, 30px) clamp(14px, 3vw, 40px)',
        background: poster.ground,
        color: poster.ink,
        fontFamily: fonts.ui,
        overflowX: 'hidden',
      }}
    >
      <PosterBackdrop />

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
        aria-label="Lessons"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 960,
          borderRadius: isMobile ? 18 : 28,
          overflow: 'hidden',
          padding: isMobile ? '14px 14px 20px' : 'clamp(18px, 2.4vh, 28px) clamp(22px, 3vw, 38px) clamp(24px, 3vh, 34px)',
          ...sheetStyle,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            paddingBottom: isMobile ? 12 : 16,
            marginBottom: isMobile ? 12 : 16,
            borderBottom: `1.5px solid ${poster.ink}`,
            paddingRight: 44, // clear of the fixed system gear
          }}
        >
          <PosterButton variant="paper" size="sm" onClick={onBack} ariaLabel="Back to the title screen">
            ← Back
          </PosterButton>
          <h1
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: isMobile ? 26 : 'clamp(28px, 3vw, 40px)',
              fontWeight: 400,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            Lessons
          </h1>
          <span
            style={{
              ...text.label,
              marginLeft: 'auto',
              fontSize: 10.5,
              letterSpacing: '0.2em',
              color: poster.inkDim,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {done.size}/{LESSONS.length} done
          </span>
        </header>

        {/* Cover: the tutorial's own bill — a framed print beside the intro on
            desktop, a banner across the top of the sheet on phones. */}
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center',
            gap: isMobile ? 12 : 24,
            marginBottom: isMobile ? 14 : 20,
          }}
        >
          <CoverPrint compact={isMobile} />
          <p style={{ ...text.body, margin: 0, color: poster.inkDim, maxWidth: 560 }}>
            {LESSONS.length} short lessons, one thing each. Every lesson is its own small
            fight, set up so the move it teaches is the move that wins it. Take them in
            order, or jump to the one you need.
          </p>
        </div>

        <ol
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: isMobile ? 10 : 12,
          }}
        >
          {LESSONS.map((l, i) => (
            <LessonRow
              key={l.id}
              number={l.number}
              title={l.title}
              blurb={l.blurb}
              face={l.face}
              done={done.has(l.id)}
              next={next?.id === l.id}
              delay={0.06 * i}
              compact={isMobile}
              onClick={() => onStart(l.id)}
            />
          ))}
        </ol>
      </motion.section>
    </div>
  );
}

/** The cover bill in the charcoal frame the title cards wear. Decorative. */
function CoverPrint({ compact }: { compact: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        flexShrink: 0,
        width: compact ? '100%' : 300,
        height: compact ? 200 : 210,
        padding: compact ? 5 : 6,
        borderRadius: 12,
        background: poster.frame,
        boxShadow: '0 12px 24px rgba(23, 20, 16, 0.3), 0 3px 8px rgba(23, 20, 16, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden', background: '#0f1214' }}>
        <img
          src={COVER}
          alt=""
          draggable={false}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: compact ? '50% 42%' : '50% 40%',
            filter: 'contrast(1.04)',
            userSelect: 'none',
          }}
        />
        <div aria-hidden style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.35), inset 0 -18px 24px -12px rgba(0, 0, 0, 0.5)' }} />
      </div>
    </div>
  );
}

/** One lesson: number, charcoal-framed portrait, title and line, and the
 *  sticker that says where it stands. The whole row is the button. */
function LessonRow({
  number, title, blurb, face, done, next, delay, compact, onClick,
}: {
  number: number;
  title: string;
  blurb: string;
  face: string;
  done: boolean;
  next: boolean;
  delay: number;
  compact: boolean;
  onClick: () => void;
}) {
  const sticker = done
    ? { label: 'Done · Replay', background: poster.ink, color: poster.paper }
    : next
      ? { label: 'Start ▸', background: poster.red, color: poster.paper }
      : { label: 'Play ▸', background: 'transparent', color: poster.ink, border: `1.5px solid ${poster.ink}` };

  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.default, delay }}
    >
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={`Lesson ${number}: ${title}${done ? ' — done, play again' : next ? ' — start here' : ''}`}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.995 }}
        transition={spring.snappy}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: compact ? '44px 52px minmax(0, 1fr)' : '64px 64px minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: compact ? 10 : 18,
          margin: 0,
          padding: compact ? '10px 12px' : '12px 18px',
          textAlign: 'left',
          cursor: 'pointer',
          color: poster.ink,
          background: next ? poster.paperBand : 'transparent',
          border: `1.5px solid ${next ? poster.ink : poster.inkRule}`,
          ...clipBoth(chamfer(10)),
          fontFamily: fonts.ui,
        }}
      >
        <span
          aria-hidden
          style={{
            fontFamily: fonts.display,
            fontSize: compact ? 26 : 34,
            lineHeight: 1,
            color: done || next ? poster.ink : poster.inkFaint,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {String(number).padStart(2, '0')}
        </span>

        {/* Portrait in the charcoal frame every card on the table wears. */}
        <span
          aria-hidden
          style={{
            display: 'block',
            width: compact ? 52 : 64,
            height: compact ? 68 : 84,
            padding: 3,
            borderRadius: 8,
            background: poster.frame,
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.25)',
          }}
        >
          <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: 5, overflow: 'hidden' }}>
            <HeroPortrait cardId={face} full />
          </span>
        </span>

        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: fonts.display,
                fontSize: compact ? 17 : 22,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                lineHeight: 1.1,
              }}
            >
              {title}
            </span>
            <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.22em', color: poster.inkDim, whiteSpace: 'nowrap' }}>
              Lesson {number}
            </span>
          </span>
          <span style={{ ...text.body, fontSize: compact ? 11.5 : 13, color: poster.inkDim, lineHeight: 1.4 }}>
            {blurb}
          </span>
          {compact && <Sticker {...sticker} small />}
        </span>

        {!compact && <Sticker {...sticker} />}
      </motion.button>
    </motion.li>
  );
}

function Sticker({ label, background, color, border, small }: {
  label: string;
  background: string;
  color: string;
  border?: string;
  small?: boolean;
}) {
  return (
    <span
      style={{
        alignSelf: small ? 'flex-start' : 'center',
        marginTop: small ? 4 : 0,
        padding: small ? '4px 8px 5px' : '7px 12px 8px',
        background,
        color,
        border: border ?? '1.5px solid transparent',
        borderRadius: 3,
        fontFamily: fonts.display,
        fontSize: small ? 9.5 : 10.5,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
