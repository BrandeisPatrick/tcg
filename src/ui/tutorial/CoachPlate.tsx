/**
 * The tutorial coach — a small cream plate printed in the poster's voice that
 * walks a first-time player through one lesson, step by step: a row of pips
 * (one a step), the tap the step is as its heading ("Tap Warden"), and one
 * line under it.
 *
 * It never drives a move. Every step is one tap: it watches the game state
 * and ticks itself off when the player makes it. Around it sits the gate:
 * while a step is up, only what it allows can be touched. A player who
 * dismisses the plate gets an ordinary (very winnable) match with the whole
 * board back.
 *
 * Each render the plate is in exactly one mode:
 *   wait     — the rival is moving (or a stated step is holding for a
 *              moment). Light scrim, nothing tappable, no Next.
 *   blocked  — the task cannot be done right now. The plate says so and
 *              opens the turn button (End Turn) instead, so the player is
 *              never boxed in.
 *   ticked   — the task just landed. A short beat, sealed, before moving on.
 *   live     — the step's own spot and allow.
 *
 * When the script runs out the plate turns into the lesson's closing card:
 * what it taught (three lines at most), then the next lesson, the list, or ×
 * to keep playing this match.
 *
 * Mounted by Board only when the match config names a lesson.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CardId, GameState, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { TYPE, fonts, spring, text } from '../tokens';
import { poster, chamfer, PAPER_MOTTLE, clipBoth } from '../poster';
import { useViewport } from '../hooks/useViewport';
import { markLessonDone } from '@/storage/playerData';
import {
  LESSONS, RIVAL_TURN, TURN_BUTTON, emptySeen, hasEquipment,
  type CoachSeen, type CoachView, type GateSpec, type Lesson,
} from '@/tutorial/lessons';
import { TutorialGate } from './TutorialGate';
import { Learned } from './Learned';
import { useAmbientLoop } from '../hooks/useAmbientLoop';
import { PATRON_NAMES } from '../board/patrons';

/** Beat between a task ticking off and the next step sliding in, so the
 *  completion is legible rather than a jump-cut. */
const TICK_MS = 900;
const NONE: GateSpec[] = [];

export function CoachPlate({ G, me, isMyTurn, targeting, placing = false, attacking, sheetHero, choosing = false, lesson, onNextLesson, onLessons }: {
  G: GameState;
  me: PlayerID;
  isMyTurn: boolean;
  /** A skill or item is armed and waiting for its target. */
  targeting: boolean;
  /** A hero from the hand is picked up and waiting for its spot. */
  placing?: boolean;
  /** Your attack is being walked (the engine makes it once the walk ends). */
  attacking: boolean;
  /** The hero whose detail sheet is open (where Skill and Retreat live), or null. */
  sheetHero: CardId | null;
  /** One of the game's own choice sheets is up — the upgrade a play makes, a
   *  draw card's discard, the first Active: the gate steps aside for it. */
  choosing?: boolean;
  lesson: Lesson;
  /** Start the following lesson fresh; absent on the last one. */
  onNextLesson?: () => void;
  /** Back to the list. */
  onLessons?: () => void;
}) {
  const { isMobile } = useViewport();
  const steps = lesson.steps;
  const [step, setStep] = useState(0);
  const [ticked, setTicked] = useState(false);
  const [open, setOpen] = useState(true);
  const [seen, setSeen] = useState<CoachSeen>(emptySeen);
  // Set when a tap lands on the sealed area, so the plate can answer it with
  // a flick rather than letting the press feel broken. Self-clearing, so the
  // shake plays once per blocked tap.
  const [nudge, setNudge] = useState(false);

  const myPs = G.players[me];
  const actionId = G.action?.by === me ? G.action.id : null;
  const actionKind = G.action?.by === me ? G.action.kind : null;
  const activeIid = myPs.active?.iid ?? null;

  // ---- watchers: monotonic latches, so a step never un-completes ----
  const lastActionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!actionId || !actionKind || actionId === lastActionRef.current) return;
    lastActionRef.current = actionId;
    setSeen((s) => ({
      ...s,
      usedItem: s.usedItem || actionKind === 'item',
      castUlt: s.castUlt || actionKind === 'ult',
      usedSkill: s.usedSkill || actionKind === 'skill',
    }));
  }, [actionId, actionKind]);

  // Count the turns you have ended: each my-turn → rival-turn edge is one.
  const wasMyTurn = useRef(isMyTurn);
  useEffect(() => {
    if (wasMyTurn.current && !isMyTurn) setSeen((s) => ({ ...s, turnsEnded: s.turnsEnded + 1 }));
    wasMyTurn.current = isMyTurn;
  }, [isMyTurn]);

  // Count the turns you have attacked in: each time your turn goes from no
  // attack made to one (`G.attackUsed`) is one, however many it then makes.
  const myAttackMade = isMyTurn && G.attackUsed;
  const wasMade = useRef(myAttackMade);
  useEffect(() => {
    if (myAttackMade && !wasMade.current) setSeen((s) => ({ ...s, attacks: s.attacks + 1 }));
    wasMade.current = myAttackMade;
  }, [myAttackMade]);

  // Items are read off the board rather than off the action feed.
  const equipped = hasEquipment(G, me);
  useEffect(() => {
    if (equipped) setSeen((s) => (s.equipped ? s : { ...s, equipped: true }));
  }, [equipped]);

  // Active swaps come from retreat (souls) or a promotion off a corpse; both
  // read as "you moved a hero into the fight". A hero dying leaves the corpse
  // in the Active slot, so the iid only changes on a real swap.
  const firstActiveRef = useRef<string | null>(activeIid);
  useEffect(() => {
    if (activeIid && firstActiveRef.current && activeIid !== firstActiveRef.current) {
      firstActiveRef.current = activeIid;
      setSeen((s) => (s.swapped ? s : { ...s, swapped: true }));
    } else if (activeIid && !firstActiveRef.current) {
      firstActiveRef.current = activeIid;
    }
  }, [activeIid]);

  // Heroes you put on the board from your hand: a hero that was in the hand
  // and now stands in the lane or on the bench is one (a hero that has stood
  // there all along, or stepped in off the bench, is not).
  const heroesInHand = myPs.hand.filter((c) => CARDS_BY_ID[c.cardId]?.type === 'hero').map((c) => c.iid).join(',');
  const heroesOnBoard = [myPs.active, ...myPs.bench].filter((c): c is NonNullable<typeof c> => !!c).map((c) => c.iid).join(',');
  const wasInHand = useRef<string[]>([]);
  useEffect(() => {
    const board = new Set(heroesOnBoard.split(',').filter(Boolean));
    const n = wasInHand.current.filter((iid) => board.has(iid)).length;
    if (n > 0) setSeen((s) => ({ ...s, placed: s.placed + n }));
    wasInHand.current = heroesInHand.split(',').filter(Boolean);
  }, [heroesInHand, heroesOnBoard]);

  // ---- the step, and which mode it is in ----
  const current = steps[step];
  const done = step >= steps.length;
  const view: CoachView = { G, me, seen, targeting, placing, attacking, sheetOpen: sheetHero !== null, sheetHero };
  const complete = !!current?.task && current.task(view);
  /** A card or skill reveal is still on screen. */
  const revealUp = G.action?.state === 'begin';

  // Every step is something to do, so by default a step waits out the
  // rival's turn; a step may say otherwise (ending the turn completes during it).
  const waitText: string | null = !current || done || complete ? null
    : current.wait ? current.wait(view)
    : !isMyTurn ? pick(current.rival ?? RIVAL_TURN, view)
    : null;
  const blocked = !!current && !waitText && !complete && !!current.ready && !current.ready(view);

  // The heading is the tap the step is; while the rival moves or the move is
  // out of reach it says that instead, so it never names a tap that cannot
  // be made.
  const titleText = done ? 'You learned'
    : waitText ? "Rival's turn"
    : blocked ? 'Not yet'
    : pick(current.title, view);
  const bodyText = done ? ''
    : waitText ? waitText
    : blocked ? pick(current.blocked ?? current.body, view)
    : pick(current.body, view);

  // What the gate lights and lets through. Memoised on contents so the
  // gate's measuring effect is not restarted every frame by a fresh array.
  // A promotion you owe is the game's own modal, and the rival waits on it —
  // so are the upgrade a play makes, a draw card's discard and the first
  // Active: the gate steps aside so the choice can always be made. A hero
  // picked up from the hand is the same, unless placing it is the step.
  const gated = !done && open && !!current.spot && G.pendingPromotion !== me && !choosing && !(placing && !current.placing);
  // Hold through a task's landing beat, the rival's turn, and any reveal or
  // attack still in flight — the next thing to tap lights up only once the
  // board can actually take the tap.
  const hold = ticked || !!waitText || revealUp || attacking;
  const spotList = !gated ? NONE
    : hold ? NONE
    : blocked ? [TURN_BUTTON]
    : current.spot!(view);
  const allowList = !gated || hold ? NONE
    : blocked ? [TURN_BUTTON]
    : (current.allow ?? current.spot!)(view);
  const spotKey = spotList.join('|');
  const allowKey = allowList.join('|');
  const spot = useMemo(() => (spotKey ? spotKey.split('|') : NONE), [spotKey]);
  const allow = useMemo(() => (allowKey ? allowKey.split('|') : NONE), [allowKey]);

  // Deps are (complete, step) on purpose. `ticked` must stay out of them:
  // setting it re-renders, and if the effect re-ran it would clear its own
  // pending timeout and never advance. Keying on `step` as well means a task
  // the player happened to satisfy early still ticks when its step comes up.
  // The tick shows at once; the step turns over only once the beat has
  // passed AND no reveal is still on screen, so the next thing to tap never
  // lights up under a card the player would otherwise tap through.
  const revealRef = useRef(revealUp);
  revealRef.current = revealUp;
  useEffect(() => {
    if (!complete) return;
    setTicked(true);
    let t: ReturnType<typeof setTimeout>;
    const advance = () => {
      if (revealRef.current) { t = setTimeout(advance, 150); return; }
      setTicked(false);
      setStep((i) => i + 1);
    };
    t = setTimeout(advance, steps[step]?.beat ?? TICK_MS);
    return () => clearTimeout(t);
    // `steps` is the lesson's own list: it never changes under a match.
  }, [complete, step]);

  // The script running out is what "finished the lesson" means — the match
  // result is beside the point, and a player who reads every card and then
  // loses has still had the lesson.
  useEffect(() => { if (done) markLessonDone(lesson.id, LESSONS.length); }, [done, lesson.id]);

  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(false), 420);
    return () => clearTimeout(t);
  }, [nudge]);

  /** Next / Skip — both just move on; clamped so the closing card stays. */
  const next = () => setStep((i) => Math.min(i + 1, steps.length));

  const status = ticked ? 'Done'
    : waitText ? 'Rival moves'
    : blocked ? 'Not yet'
    : 'Your move';
  // The action button: Skip, except while the plate is holding for the
  // rival (there is nothing to skip to yet). On the closing card the
  // actions are the lesson's exits.
  const action = done || waitText ? null : { label: 'Skip', muted: true };

  // On a phone the plate sits over the rival's rule, where its structures are
  // printed. A step that lights that rule (the map lesson's) needs it seen:
  // the plate drops to just under it, over the rival's bench, for as long as
  // the step is up and no hero sheet is open.
  const lightsRule = isMobile && !done && sheetHero === null
    && current.spot(view).some((spec) => spec.startsWith(PATRON_NAMES.rival));
  const [ruleFoot, setRuleFoot] = useState<number | null>(null);
  useEffect(() => {
    if (!lightsRule) { setRuleFoot(null); return; }
    const measure = () => {
      const rule = [...document.querySelectorAll<HTMLElement>('[aria-label]')]
        .find((e) => (e.getAttribute('aria-label') ?? '').startsWith(`${PATRON_NAMES.rival}:`));
      setRuleFoot(rule ? Math.round(rule.getBoundingClientRect().bottom) : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [lightsRule]);

  // Phones: a bar in the strip above the board, stopping short of the fixed
  // system gear in that corner (its hit area would otherwise swallow the
  // plate's own Next / dismiss). Desktop: bottom-left, clear of everything.
  const shell: CSSProperties = isMobile
    ? { left: 8, right: 56, top: ruleFoot !== null ? ruleFoot + 8 : 4, transition: 'top 220ms ease' }
    : { left: 18, bottom: 18, width: 306 };

  const exits = done ? (
    <>
      {onNextLesson && <PlateAction label="Next lesson" onClick={onNextLesson} />}
      {onLessons && <PlateAction label={onNextLesson ? 'Lessons' : 'All lessons'} onClick={onLessons} muted={!!onNextLesson} />}
    </>
  ) : null;

  return (
    <>
      {/* Dismissing the coach also lifts the gate — a player who opts out of
          the lesson gets their whole board back. */}
      {gated && (
        <TutorialGate
          spot={spot}
          allow={allow}
          dim={hold ? 0.3 : 0.62}
          onBlocked={() => setNudge(true)}
        />
      )}
    <AnimatePresence>
      {open && (
        <motion.aside
          key="coach"
          aria-live="polite"
          aria-label="Tutorial"
          initial={{ opacity: 0, y: isMobile ? -14 : 14 }}
          animate={nudge
            ? { opacity: 1, y: 0, x: [0, -5, 5, -3, 0] }
            : { opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: isMobile ? -14 : 14 }}
          transition={spring.soft}
          style={{
            position: 'fixed',
            // Above TutorialGate's scrim (200): the plate is the one control a
            // sealed step must still accept, or the lesson cannot be advanced.
            zIndex: 210,
            ...shell,
            background: poster.paper,
            backgroundImage: PAPER_MOTTLE,
            backgroundSize: '320px 320px',
            color: poster.ink,
            ...clipBoth(chamfer(12)),
            boxShadow: '0 18px 40px rgba(0, 0, 0, 0.5)',
            padding: isMobile ? '7px 12px 8px' : '13px 16px 14px',
            fontFamily: fonts.ui,
          }}
        >
          {/* Rail: the lesson, its steps as pips (the one you are on ringed
              red), and the dismiss. On phones the action rides up here too —
              the plate sits in the strip above the board, and a third row
              would push it down over the rival's rule. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isMobile ? 3 : 7 }}>
            <span
              style={{
                ...text.label,
                fontSize: TYPE.small,
                letterSpacing: '0.2em',
                color: poster.inkDim,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {`Lesson ${lesson.number}`}
            </span>
            <StepPips count={steps.length} at={done ? steps.length : step} ticked={ticked} label={done ? `Lesson ${lesson.number}, done` : `Step ${step + 1} of ${steps.length}`} />
            {isMobile && action && (
              <PlateAction label={action.label} onClick={next} muted={action.muted} />
            )}
            {isMobile && done && (onNextLesson
              ? <PlateAction label="Next lesson" onClick={onNextLesson} />
              : onLessons ? <PlateAction label="Lessons" onClick={onLessons} /> : null)}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={done ? 'Close the coach and keep playing' : 'Dismiss the tutorial coach'}
              style={{
                border: 'none',
                background: 'none',
                padding: 2,
                margin: 0,
                cursor: 'pointer',
                color: poster.inkDim,
                fontFamily: fonts.ui,
                fontSize: TYPE.title,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Keyed, but deliberately NOT wrapped in AnimatePresence: an
              exit-then-enter swap stalls whenever the tab is throttled (rAF
              stops, the exit never resolves) and the plate would then show a
              step the player has already finished. Remounting on key change
              always lands the new text; the fade-in is decoration. */}
          <div>
            <motion.div
              key={done ? 'done' : `${step}:${waitText ? 'w' : blocked ? 'b' : 'l'}:${titleText}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <div
                style={{
                  fontFamily: fonts.display,
                  fontSize: TYPE.title,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  lineHeight: 1.1,
                  marginBottom: isMobile ? 2 : 4,
                  // The rival's turn and a move out of reach are said quieter
                  // than a tap to make.
                  color: !done && (waitText || blocked) ? poster.inkDim : poster.ink,
                }}
              >
                {titleText}
              </div>
              {done ? (
                <Learned lines={lesson.learned} compact={isMobile} />
              ) : (
                <div style={{ ...text.body, fontSize: TYPE.body, lineHeight: isMobile ? 1.3 : 1.45, color: poster.inkDim }}>
                  {bodyText}
                </div>
              )}
            </motion.div>
          </div>

          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11 }}>
              {!done ? (
                <>
                  <TaskDot ticked={ticked} waiting={!!waitText} />
                  <span style={{ ...text.label, fontSize: TYPE.small, letterSpacing: '0.2em', color: ticked ? poster.ink : poster.inkDim }}>
                    {status}
                  </span>
                </>
              ) : null}
              <span style={{ flex: 1 }} />
              {action && <PlateAction label={action.label} onClick={next} muted={action.muted} />}
              {exits}
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
    </>
  );
}

function pick(t: string | ((v: CoachView) => string), v: CoachView): string {
  return typeof t === 'function' ? t(v) : t;
}

/** The lesson's steps as a row of pips, one a step: ink for the ones behind
 *  you, a red ring for the one you are on (ink once its tap has landed), rule
 *  grey for what is left. The row is the plate's progress bar. */
function StepPips({ count, at, ticked, label }: { count: number; at: number; ticked: boolean; label: string }) {
  return (
    <span role="img" aria-label={label} style={{ flex: 1, minWidth: 24, display: 'flex', alignItems: 'center', gap: 5 }}>
      {Array.from({ length: count }, (_, i) => {
        const behind = i < at || (i === at && ticked);
        const here = i === at && !ticked;
        return (
          <span
            key={i}
            aria-hidden
            style={{
              width: 8, height: 8, flexShrink: 0, borderRadius: '50%', boxSizing: 'border-box',
              background: behind ? poster.ink : 'transparent',
              border: `1.5px solid ${behind ? poster.ink : here ? poster.red : poster.inkRule}`,
              boxShadow: here ? `0 0 0 2px ${poster.paper}, 0 0 0 3px ${poster.red}` : undefined,
              transition: 'background 160ms ease, border-color 160ms ease',
            }}
          />
        );
      })}
    </span>
  );
}

/** The waiting marker — a red dot that breathes while the task is open,
 *  goes grey while the rival has the table, and snaps to a filled ink tick
 *  the moment the task lands (its breath settling over 0.2s). The breath
 *  keeps the pace it started at. */
function TaskDot({ ticked, waiting }: { ticked: boolean; waiting: boolean }) {
  const breath = useAmbientLoop<HTMLSpanElement>(ticked ? null : {
    keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(0.62)' }, { transform: 'scale(1)' }],
    duration: waiting ? 2400 : 1500,
    easing: 'ease-in-out',
  }, 200);
  return (
    <span
      ref={breath}
      aria-hidden
      style={{
        width: 9,
        height: 9,
        flexShrink: 0,
        borderRadius: '50%',
        background: ticked ? poster.ink : waiting ? poster.inkFaint : poster.red,
      }}
    />
  );
}

function PlateAction({ label, onClick, muted }: {
  label: string;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      transition={spring.snappy}
      style={{
        padding: '6px 13px',
        border: `1.5px solid ${muted ? poster.inkDim : poster.ink}`,
        background: muted ? 'transparent' : poster.ink,
        color: muted ? poster.inkDim : poster.paper,
        ...clipBoth(chamfer(6)),
        fontFamily: fonts.display,
        fontSize: TYPE.small,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        lineHeight: 1,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </motion.button>
  );
}
