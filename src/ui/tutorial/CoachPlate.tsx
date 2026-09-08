/**
 * The tutorial coach — a small cream plate printed in the poster's voice that
 * walks a first-time player through one lesson.
 *
 * It never drives a move. Task steps watch the game state and tick themselves
 * off when the player does the thing; stated steps advance on Next. Between
 * the two sits the gate: while a step is up, only what it allows can be
 * touched. A player who dismisses the plate gets an ordinary (very winnable)
 * match with the whole board back.
 *
 * Each render the plate is in exactly one mode:
 *   wait     — the rival is moving (or a stated step is holding for a
 *              moment). Light scrim, nothing tappable, no Next.
 *   blocked  — the task cannot be paid for right now. The plate says so and
 *              opens End Turn instead, so the player is never boxed in.
 *   ticked   — the task just landed. A short beat, sealed, before moving on.
 *   live     — the step's own spot and allow.
 *
 * When the script runs out the plate turns into the lesson's closing card:
 * next lesson, the list, or × to keep playing this match.
 *
 * Mounted by Board only when the match config names a lesson.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameState, PlayerID } from '@/engine/types';
import { fonts, spring, text } from '../tokens';
import { poster, chamfer, PAPER_MOTTLE, clipBoth } from '../poster';
import { useViewport } from '../hooks/useViewport';
import { markLessonDone } from '@/storage/playerData';
import {
  LESSONS, RIVAL_TURN, emptySeen, hasEquipment,
  type CoachSeen, type CoachView, type GateSpec, type Lesson,
} from '@/tutorial/lessons';
import { TutorialGate } from './TutorialGate';

/** Beat between a task ticking off and the next step sliding in, so the
 *  completion is legible rather than a jump-cut. */
const TICK_MS = 900;
const NONE: GateSpec[] = [];

export function CoachPlate({ G, me, isMyTurn, targeting, sheetOpen, lesson, onNextLesson, onLessons }: {
  G: GameState;
  me: PlayerID;
  isMyTurn: boolean;
  /** A card or skill is armed and waiting for its target. */
  targeting: boolean;
  /** The hero detail sheet is open — where Skill and Retreat live. */
  sheetOpen: boolean;
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
      // An ultimate is still a card leaving your hand, so it satisfies the
      // "play a card" step as readily as a spell does.
      playedCard: s.playedCard || actionKind === 'play' || actionKind === 'ult',
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

  // Gear is read off the board rather than off the action feed: an item can
  // also arrive by replacing a worn piece, which resolves as a plain play.
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

  // ---- the step, and which mode it is in ----
  const current = steps[step];
  const done = step >= steps.length;
  const view: CoachView = { G, me, isMyTurn, seen, targeting, sheetOpen };
  const complete = !!current?.task && current.task(view);

  const waitText: string | null = !current || done || complete ? null
    : current.wait ? current.wait(view)
    : current.task && !isMyTurn ? RIVAL_TURN
    : null;
  const blocked = !!current?.task && !waitText && !complete && !!current.ready && !current.ready(view);

  const bodyText = done ? lesson.outro
    : waitText ? waitText
    : blocked ? pick(current.blocked ?? current.body, view)
    : pick(current.body, view);

  // What the gate lights and lets through. Memoised on contents so the
  // gate's measuring effect is not restarted every frame by a fresh array.
  const gated = !done && open && !!current.spot;
  const hold = ticked || !!waitText;
  const spotList = !gated ? NONE
    : hold ? NONE
    : blocked ? ['End Turn']
    : current.spot!(view);
  const allowList = !gated || hold || !current.task ? NONE
    : blocked ? ['End Turn']
    : (current.allow ?? current.spot!)(view);
  const spotKey = spotList.join('|');
  const allowKey = allowList.join('|');
  const spot = useMemo(() => (spotKey ? spotKey.split('|') : NONE), [spotKey]);
  const allow = useMemo(() => (allowKey ? allowKey.split('|') : NONE), [allowKey]);

  // Deps are (complete, step) on purpose. `ticked` must stay out of them:
  // setting it re-renders, and if the effect re-ran it would clear its own
  // pending timeout and never advance. Keying on `step` as well means a task
  // the player happened to satisfy early still ticks when its step comes up.
  useEffect(() => {
    if (!complete) return;
    setTicked(true);
    const t = setTimeout(() => { setTicked(false); setStep((i) => i + 1); }, TICK_MS);
    return () => clearTimeout(t);
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
    : blocked ? 'Refill first'
    : 'Your move';
  // The action button: Skip on a task, Next on a statement, nothing while
  // the plate is holding for the rival (there is nothing to skip to yet).
  // On the closing card the actions are the lesson's exits.
  const action = done || waitText ? null
    : current.task ? { label: 'Skip', muted: true }
    : { label: 'Next', muted: false };

  // Phones: a bar in the strip above the board, stopping short of the fixed
  // system gear in that corner (its hit area would otherwise swallow the
  // plate's own Next / dismiss). Desktop: bottom-left, clear of everything.
  const shell: CSSProperties = isMobile
    ? { left: 8, right: 56, top: 4 }
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
          {/* Rail: the lesson and step count, the red task dot, a progress
              rule, and the dismiss. On phones the action rides up here too —
              the plate sits in the strip above the board, and a third row
              would push it down over the rival's rule. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isMobile ? 3 : 7 }}>
            {/* Phones have no footer row, so the task marker rides the rail there. */}
            {isMobile && !done && (current.task || waitText) && <TaskDot ticked={ticked} waiting={!!waitText} />}
            <span
              style={{
                ...text.label,
                fontSize: 9.5,
                letterSpacing: '0.2em',
                color: poster.inkDim,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {done ? `Lesson ${lesson.number} · done` : `Lesson ${lesson.number} · ${step + 1}/${steps.length}`}
            </span>
            <ProgressRule done={done ? 1 : step / steps.length} />
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
                fontSize: 15,
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
              key={done ? 'done' : `${current.id}:${waitText ? 'w' : blocked ? 'b' : 'l'}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <div
                style={{
                  fontFamily: fonts.display,
                  fontSize: isMobile ? 14 : 19,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  lineHeight: 1.1,
                  marginBottom: isMobile ? 2 : 4,
                }}
              >
                {done ? `${lesson.title} · done` : current.title}
              </div>
              <div style={{ ...text.body, fontSize: isMobile ? 11 : 12.5, lineHeight: isMobile ? 1.3 : 1.45, color: poster.inkDim }}>
                {bodyText}
                {done && (
                  <span style={{ display: 'block', marginTop: isMobile ? 2 : 4, color: poster.inkFaint }}>× keeps this match going.</span>
                )}
              </div>
            </motion.div>
          </div>

          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11 }}>
              {!done && (current.task || waitText) ? (
                <>
                  <TaskDot ticked={ticked} waiting={!!waitText} />
                  <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.2em', color: ticked ? poster.ink : poster.inkDim }}>
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

/** The rail's hairline doubles as the progress bar: ink for what's behind
 *  you, rule grey for what's left. */
function ProgressRule({ done }: { done: number }) {
  return (
    <span aria-hidden style={{ flex: 1, height: 2, background: poster.inkRule, position: 'relative', minWidth: 24 }}>
      <motion.span
        animate={{ width: `${Math.round(done * 100)}%` }}
        transition={spring.snappy}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: poster.ink }}
      />
    </span>
  );
}

/** The waiting marker — a red dot that breathes while the task is open,
 *  goes grey while the rival has the table, and snaps to a filled ink tick
 *  the moment the task lands. */
function TaskDot({ ticked, waiting }: { ticked: boolean; waiting: boolean }) {
  return (
    <motion.span
      aria-hidden
      animate={ticked ? { scale: 1 } : { scale: [1, 0.62, 1] }}
      transition={ticked ? { duration: 0.2 } : { duration: waiting ? 2.4 : 1.5, repeat: Infinity, ease: 'easeInOut' }}
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
        fontSize: 11,
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
