import { motion } from 'framer-motion';
import type { GameState, PlayerID, CardInstance } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { heroArtFocus } from '@/cards/art/heroArt';
import { fonts, spring } from '../tokens';
import { poster, chamfer, sheetStyle, clipBoth } from '../poster';
import { PosterButton } from '../chrome';
import { PosterBackdrop } from '../PosterBackdrop';
import { useViewport } from '../hooks/useViewport';

const HERO_IMG_BASE = `${import.meta.env.BASE_URL ?? '/'}heroes/`;

/**
 * Full-screen match epilogue, printed as one cream sheet floating on the
 * blurred scene. A brush-script lead-in carries the patron flavor line into
 * an unambiguous VICTORY / DEFEAT / DRAW headline, both teams' final rosters
 * sit beneath as small charcoal-framed portraits (fallen heroes greyed under
 * a red K.O. sticker), a strip of ink tags holds the numbers, and the exits
 * are poster buttons: Rematch + Main Menu (or Return to Map for story
 * battles). Board early-returns into this screen, so it mounts its own
 * PosterBackdrop.
 */
export function MatchEndScreen({
  G, me, won, draw, isStory, isTutorial = false,
  onRematch, onMenu, onStoryReturn, lessonNumber, onNextLesson, onLessons,
}: {
  G: GameState;
  me: PlayerID;
  won: boolean;
  draw: boolean;
  isStory: boolean;
  /** A coached lesson rather than a real match — the exits funnel forward
   *  into a Quick Match instead of offering to run the lesson again. */
  isTutorial?: boolean;
  /** Which lesson this was, for the eyebrow. */
  lessonNumber?: number;
  /** Lesson exits — the following lesson (absent on the last) and the list. */
  onNextLesson?: () => void;
  onLessons?: () => void;
  onRematch: () => void;
  onMenu: (() => void) | null;
  onStoryReturn: () => void;
}) {
  const { isMobile } = useViewport();
  const opp: PlayerID = me === '0' ? '1' : '0';
  // Verdict ink: victory prints in ink, defeat in the poster's one red, a
  // draw in dimmed ink. The winning side's roster label takes the same tone.
  const tone = draw ? poster.inkDim : won ? poster.ink : poster.red;
  const headline = draw ? 'Draw' : won ? 'Victory' : 'Defeat';
  const flavor = draw
    ? 'Both patrons stand — the city holds its breath.'
    : isTutorial
      ? (won ? 'Lesson over. The real tables are downstairs.' : 'No matter — you know the moves now.')
    : isStory
      ? (won ? 'The block is yours — press on uptown.' : 'Your run ends in the old city.')
      : (won ? 'The rival patron falls.' : 'Your patron is outflanked.');

  const myPs = G.players[me];
  const opPs = G.players[opp];
  const fallen = (c: CardInstance | null) => !c || c.hp <= 0 || (c.respawnTurnsLeft ?? 0) > 0;
  const myTeam = [myPs.active, ...myPs.bench].filter(Boolean) as CardInstance[];
  const opTeam = [opPs.active, ...opPs.bench].filter(Boolean) as CardInstance[];

  const stats: Array<{ label: string; value: string }> = [
    { label: 'Turns', value: String(G.turnNumber) },
    { label: 'Your patron', value: `${Math.max(0, myPs.hp)} HP` },
    { label: 'Rival patron', value: `${Math.max(0, opPs.hp)} HP` },
    { label: 'Heroes lost', value: `${myTeam.filter(fallen).length}–${opTeam.filter(fallen).length}` },
  ];

  return (
    <div style={{
      position: 'relative',
      minHeight: '100dvh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: '#0d1715',
      color: poster.ink,
      fontFamily: fonts.ui,
      padding: isMobile ? '0 20px' : '0 32px',
      textAlign: 'center',
      overflowX: 'hidden',
    }}>
      <PosterBackdrop />

      {/* The sheet. */}
      <section
        aria-label="Match result"
        style={{
          ...sheetStyle,
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 900,
          borderRadius: isMobile ? 16 : 22,
          padding: isMobile ? '34px 18px 30px' : 'clamp(40px, 6vh, 60px) clamp(28px, 5vw, 64px) clamp(36px, 5vh, 52px)',
          margin: isMobile ? '20px 0' : '30px 0',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: isMobile ? 18 : 24,
        }}
      >
        {/* Verdict */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.bouncy}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
        >
          <div style={{
            fontFamily: fonts.display,
            fontSize: 11,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: poster.inkDim,
            paddingLeft: '0.28em', // optically recenters tracked-out caps
          }}>
            {isTutorial ? `Lesson ${lessonNumber ?? ''}`.trim() : isStory ? 'Story battle' : 'Quick match'} · Turn {G.turnNumber}
          </div>
          {/* Brush-script lead-in, tipped up like a hand-lettered overprint. */}
          <div style={{
            fontFamily: fonts.script,
            fontSize: isMobile ? 24 : 30,
            lineHeight: 1.1,
            color: poster.ink,
            transform: 'rotate(-2.5deg)',
            transformOrigin: 'center bottom',
            marginTop: 4,
          }}>
            {flavor}
          </div>
          <h1 style={{
            fontFamily: fonts.display,
            fontSize: isMobile ? 56 : 84,
            lineHeight: 1,
            textTransform: 'uppercase',
            color: tone,
            margin: 0,
          }}>{headline}</h1>
          {/* Red register rule — the poster's one accent, under the headline. */}
          <div aria-hidden style={{ width: 56, height: 3, background: poster.red, marginTop: 6 }} />
        </motion.div>

        {/* Final rosters — yours left, rival right (stacked on phones). */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.default, delay: 0.18 }}
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 10 : 44,
            alignItems: 'center',
          }}
        >
          <RosterStrip label="Your team" team={myTeam} fallen={fallen} accent={won && !draw ? tone : poster.inkDim} />
          <div aria-hidden style={{
            fontFamily: fonts.display, fontSize: 15, color: poster.inkFaint, letterSpacing: '0.2em',
          }}>VS</div>
          <RosterStrip label="Rival team" team={opTeam} fallen={fallen} accent={!won && !draw ? tone : poster.inkDim} />
        </motion.div>

        {/* Stat strip — one ink tag per number. */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.default, delay: 0.3 }}
          style={{
            display: 'flex', gap: isMobile ? 8 : 12, flexWrap: 'wrap', justifyContent: 'center',
          }}
        >
          {stats.map((s) => (
            <div key={s.label} style={{
              display: 'flex', flexDirection: 'column', gap: 4, minWidth: 64,
              padding: '8px 14px 9px',
              background: poster.ink,
              color: poster.paper,
              ...clipBoth(chamfer(4)),
            }}>
              <span style={{
                fontFamily: fonts.display, fontSize: 10,
                letterSpacing: '0.2em', textTransform: 'uppercase', color: poster.creamDim,
                lineHeight: 1,
              }}>{s.label}</span>
              <span style={{
                fontFamily: fonts.display, fontSize: 18, lineHeight: 1,
                fontVariantNumeric: 'tabular-nums', color: poster.paper,
              }}>{s.value}</span>
            </div>
          ))}
        </motion.div>

        {/* Exits */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.default, delay: 0.42 }}
          style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}
        >
          {isStory ? (
            <PosterButton variant="paper" onClick={onStoryReturn} style={{ minWidth: 190, textAlign: 'center' }}>
              Return to Map
            </PosterButton>
          ) : isTutorial ? (
            <>
              {onNextLesson && (
                <PosterButton variant="paper" onClick={onNextLesson} style={{ minWidth: 170, textAlign: 'center' }}>
                  Next Lesson
                </PosterButton>
              )}
              {onLessons && (
                <PosterButton variant={onNextLesson ? 'ink' : 'paper'} onClick={onLessons} style={{ minWidth: 150, textAlign: 'center' }}>
                  All Lessons
                </PosterButton>
              )}
            </>
          ) : (
            <PosterButton variant="paper" onClick={onRematch} style={{ minWidth: 170, textAlign: 'center' }}>
              Rematch
            </PosterButton>
          )}
          {onMenu && (
            <PosterButton variant="ink" onClick={onMenu} style={{ minWidth: 150, textAlign: 'center' }}>
              Main Menu
            </PosterButton>
          )}
        </motion.div>
      </section>
    </div>
  );
}

function RosterStrip({ label, team, fallen, accent }: {
  label: string;
  team: CardInstance[];
  fallen: (c: CardInstance | null) => boolean;
  accent: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <div style={{
        fontFamily: fonts.display, fontSize: 10,
        letterSpacing: '0.32em', textTransform: 'uppercase', color: accent,
      }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {team.map((c, i) => {
          const dead = fallen(c);
          const name = CARDS_BY_ID[c.cardId]?.name ?? c.cardId;
          return (
            // Charcoal frame around the portrait; a fallen hero's frame goes
            // flat (no lift, edge-grey border) under the K.O. sticker.
            <motion.div
              key={c.iid}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.default, delay: 0.22 + i * 0.06 }}
              title={dead ? `${name} — fell in battle` : name}
              style={{
                position: 'relative',
                width: 58, height: 78,
                boxSizing: 'border-box',
                padding: 2,
                borderRadius: 7,
                border: `2px solid ${dead ? poster.edge : poster.frameLit}`,
                background: poster.frame,
                boxShadow: dead ? 'none' : '0 14px 26px rgba(0,0,0,0.35), 0 3px 8px rgba(0,0,0,0.25)',
              }}
            >
              <div style={{
                position: 'relative',
                width: '100%', height: '100%',
                borderRadius: 4,
                overflow: 'hidden',
                background: '#0f1214',
              }}>
                <img
                  src={`${HERO_IMG_BASE}${c.cardId}_card.webp`}
                  alt={name}
                  draggable={false}
                  style={{
                    display: 'block',
                    width: '100%', height: '100%',
                    objectFit: 'cover', objectPosition: heroArtFocus(c.cardId, 'card', '50% 14%'),
                    filter: dead ? 'grayscale(1) brightness(0.55)' : undefined,
                    userSelect: 'none',
                  }}
                />
                {/* Inner edge — the print sits slightly recessed in its frame. */}
                <div aria-hidden style={{
                  position: 'absolute', inset: 0,
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.35), inset 0 -18px 24px -12px rgba(0,0,0,0.5)',
                }} />
                {dead && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{
                      padding: '3px 6px 4px',
                      borderRadius: 3,
                      background: poster.red,
                      color: poster.paper,
                      fontFamily: fonts.display, fontSize: 10,
                      letterSpacing: '0.24em', textTransform: 'uppercase', lineHeight: 1,
                      transform: 'rotate(-8deg)',
                      boxShadow: '0 3px 8px rgba(0,0,0,0.35)',
                    }}>K.O.</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
