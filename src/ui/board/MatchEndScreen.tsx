import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { GameState, PlayerID, CardInstance } from '@/engine/types';
import { cardName } from '@/cards';
import { isRespawning, otherPlayer, standingVerdict, structureHp } from '@/engine/query';
import { ROUND_CAP } from '@/engine/constants';
import { heroArtFocus } from '@/cards/art/heroArt';
import { HERO_IMG_BASE } from '@/art/assets';
import { fonts, spring } from '../tokens';
import { chamfer, clipBoth, poster, sheetStyle } from '../poster';
import { DecoRule, PatronSigil, bandStyle, scale } from '../hud';
import { PosterButton } from '../chrome';
import { PosterBackdrop } from '../PosterBackdrop';
import { useViewport } from '../hooks/useViewport';
import { MapIcon } from './MapIcon';

/**
 * Full-screen match epilogue, printed as one cream sheet floating on the
 * blurred scene. A header band in the winner's patron colour (amber for
 * you, sapphire for the rival) with its sigil, then an unambiguous VICTORY /
 * DEFEAT headline, both teams' final rosters as small charcoal-framed
 * portraits (fallen heroes greyed under a red K.O. sticker), a strip of
 * Deadlock's dark plates for the numbers, and the exits
 * are poster buttons: Rematch + Main Menu (or Return to Map for story
 * battles). Board early-returns into this screen, so it mounts its own
 * PosterBackdrop.
 */
export function MatchEndScreen({
  G, me, won, isStory, isTutorial = false,
  onRematch, onMenu, onStoryReturn, lessonNumber, lessonOutro, onNextLesson, onLessons,
}: {
  G: GameState;
  me: PlayerID;
  won: boolean;
  isStory: boolean;
  /** A coached lesson rather than a real match — the exits funnel forward
   *  into a Quick Match instead of offering to run the lesson again. */
  isTutorial?: boolean;
  /** Which lesson this was, for the eyebrow. */
  lessonNumber?: number;
  /** The lesson's own closing line, printed over the verdict on a win. */
  lessonOutro?: string;
  /** Lesson exits — the following lesson (absent on the last) and the list. */
  onNextLesson?: () => void;
  onLessons?: () => void;
  onRematch: () => void;
  onMenu: (() => void) | null;
  onStoryReturn: () => void;
}) {
  const { isMobile } = useViewport();
  const opp: PlayerID = otherPlayer(me);
  // Verdict ink: victory prints in ink, defeat in the winner's sapphire
  // (pressed for paper). The band over the sheet is the winner's patron.
  const tone = won ? poster.ink : poster.rivalInk;
  const winner = won ? 'you' : 'rival';
  const headline = won ? 'Victory' : 'Defeat';
  // The round cap decided it: nobody's Patron fell, and what stood won.
  const cap = G.capped ? standingVerdict(G) : null;
  const capLine = cap ? `Round ${ROUND_CAP} over · ${cap.by === 'structures' ? 'more structure HP' : cap.by === 'netWorth' ? 'structures tied, more net worth' : 'all tied, the second mover'}` : null;
  // A lesson keeps its own closing line; a match lets the headline speak.
  const flavor = isTutorial && won ? lessonOutro : undefined;

  const myPs = G.players[me];
  const opPs = G.players[opp];
  const fallen = (c: CardInstance | null) => !c || c.hp <= 0 || isRespawning(c);
  const myTeam = [myPs.active, ...myPs.bench].filter(Boolean) as CardInstance[];
  const opTeam = [opPs.active, ...opPs.bench].filter(Boolean) as CardInstance[];

  const trackOf = (ps: typeof myPs) => ps.structures.reduce((n, s) => n + s.max, 0);
  // A side's track as its icons, a fallen one greyed (the strip's own look).
  const trackIcons = (ps: typeof myPs, ink: string) => ps.structures.filter((s) => s.max > 0).map((s) => (
    <MapIcon key={s.kind} kind={s.kind} size={16} ink={s.hp > 0 ? ink : poster.creamFaint} grey={s.hp <= 0} />
  ));
  const stats: Array<{ label: string; value: string; icons?: ReactNode }> = [
    { label: 'Your structures', value: `${structureHp(myPs)}/${trackOf(myPs)}`, icons: trackIcons(myPs, poster.you) },
    { label: 'Rival structures', value: `${structureHp(opPs)}/${trackOf(opPs)}`, icons: trackIcons(opPs, poster.rival) },
    // The Mid-Boss row only in a match that has one (MID_BOSS_ENABLED / the setup's midBoss).
    ...(G.midBoss ? [{ label: 'Mid-Boss', value: `${G.record[me].bossKills}–${G.record[opp].bossKills}`, icons: <MapIcon kind="mid_boss" size={16} zoom={1.2} /> }] : []),
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
          borderRadius: 12,
          padding: isMobile ? '0 0 26px' : '0 0 clamp(32px, 5vh, 48px)',
          overflow: 'hidden',
          margin: isMobile ? '20px 0' : '30px 0',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: isMobile ? 18 : 24,
        }}
      >
        {/* The header band, in the winner's patron colour. */}
        <div style={{
          ...bandStyle(won ? poster.you : poster.rival),
          alignSelf: 'stretch',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '11px 16px 10px',
          fontSize: scale.body,
        }}>
          <PatronSigil side={winner} size={16} color={poster.ink} />
          {isTutorial ? `Lesson ${lessonNumber ?? ''}`.trim() : isStory ? 'Story battle' : 'Quick match'} · Turn {G.turnNumber}
        </div>

        {/* Verdict */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.bouncy}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: isMobile ? '6px 18px 0' : '10px 32px 0' }}
        >
          {flavor && (
            <div style={{
              fontFamily: fonts.script,
              fontSize: scale.display,
              lineHeight: 1.1,
              color: poster.ink,
              transform: 'rotate(-2.5deg)',
              transformOrigin: 'center bottom',
            }}>
              {flavor}
            </div>
          )}
          <h1 style={{
            fontFamily: fonts.display,
            fontSize: isMobile ? 56 : 84,
            lineHeight: 1,
            textTransform: 'uppercase',
            color: tone,
            margin: 0,
          }}>{headline}</h1>
          <DecoRule color={poster.inkFaint} width={150} style={{ marginTop: 4 }} />
          {/* The round cap's verdict, when it decided the match. */}
          {capLine && (
            <div style={{
              fontFamily: fonts.display, fontSize: scale.label, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: poster.inkDim, marginTop: 4,
            }}>{capLine}</div>
          )}
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
          {myTeam.length > 0 && <RosterStrip side="you" team={myTeam} fallen={fallen} />}
          {myTeam.length > 0 && opTeam.length > 0 && (
            <div aria-hidden style={{
              fontFamily: fonts.display, fontSize: scale.number, color: poster.inkFaint, letterSpacing: '0.2em',
            }}>VS</div>
          )}
          {opTeam.length > 0 && <RosterStrip side="rival" team={opTeam} fallen={fallen} />}
        </motion.div>

        {/* Stat strip — one ink tag per number. */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.default, delay: 0.3 }}
          style={{
            display: 'flex', gap: isMobile ? 8 : 12, flexWrap: 'wrap', justifyContent: 'center',
            padding: isMobile ? '0 14px' : '0 28px',
          }}
        >
          {stats.map((s) => (
            <div key={s.label} style={{
              display: 'flex', flexDirection: 'column', gap: 5, minWidth: 64,
              padding: '8px 12px 9px',
              background: poster.ink, color: poster.paper,
              ...clipBoth(chamfer(4)),
            }}>
              <span style={{
                fontFamily: fonts.ui, fontWeight: 700, fontSize: scale.label,
                letterSpacing: '0.1em', textTransform: 'uppercase', color: poster.creamDim,
                lineHeight: 1,
              }}>{s.label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.icons && <span style={{ display: 'inline-flex', gap: 3 }}>{s.icons}</span>}
                <span style={{
                  fontFamily: fonts.display, fontSize: scale.title, lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums', color: poster.paper,
                }}>{s.value}</span>
              </span>
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

function RosterStrip({ side, team, fallen }: {
  side: 'you' | 'rival';
  team: CardInstance[];
  fallen: (c: CardInstance | null) => boolean;
}) {
  // The side's patron colour, pressed dark enough for paper.
  const ink = side === 'you' ? '#8a6a12' : poster.rivalInk;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: fonts.display, fontSize: scale.label,
        letterSpacing: '0.2em', textTransform: 'uppercase', color: ink,
      }}>
        <PatronSigil side={side} size={14} color={ink} />
        {side === 'you' ? 'You' : 'Rival'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {team.map((c, i) => {
          const dead = fallen(c);
          const name = cardName(c.cardId);
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
                      fontFamily: fonts.display, fontSize: scale.floor,
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
