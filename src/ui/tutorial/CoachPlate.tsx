/**
 * The tutorial coach — a small cream plate printed in the poster's voice that
 * walks a first-time player through one match.
 *
 * It never blocks input and never drives a move. Task steps watch the game
 * state and tick themselves off when the player does the thing; stated steps
 * advance on Next. A player who dismisses the plate is left with an ordinary
 * (very winnable) match.
 *
 * Mounted by Board only when the match config carries a tutorial setup.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameState, PlayerID } from '@/engine/types';
import { fonts, spring, text } from '../tokens';
import { poster, chamfer, PAPER_MOTTLE, clipBoth } from '../poster';
import { useViewport } from '../hooks/useViewport';
import { markTutorialDone } from '@/storage/playerData';
import { LESSON, emptySeen, hasEquipment, type CoachSeen } from '@/tutorial/lesson';

/** Beat between a task ticking off and the next step sliding in, so the
 *  completion is legible rather than a jump-cut. */
const TICK_MS = 900;

export function CoachPlate({ G, me, isMyTurn }: {
  G: GameState;
  me: PlayerID;
  isMyTurn: boolean;
}) {
  const { isMobile } = useViewport();
  const [step, setStep] = useState(0);
  const [ticked, setTicked] = useState(false);
  const [open, setOpen] = useState(true);
  const [seen, setSeen] = useState<CoachSeen>(emptySeen);

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
      // An ultimate is still a card leaving your hand at a target, so it
      // satisfies the "play a card" step as readily as a spell does.
      playedCard: s.playedCard || actionKind === 'play' || actionKind === 'ult',
      usedSkill: s.usedSkill || actionKind === 'skill',
    }));
  }, [actionId, actionKind]);

  // The only way the turn stops being mine is that I ended it.
  useEffect(() => {
    if (!isMyTurn) setSeen((s) => (s.endedTurn ? s : { ...s, endedTurn: true }));
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

  // ---- advance ----
  const current = LESSON[step];
  const done = step >= LESSON.length;
  const complete = !!current?.task && current.task({ G, me, isMyTurn, seen });

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

  // The script running out is what "finished the tutorial" means — the match
  // result is beside the point, and a player who reads every card and then
  // loses has still had the lesson.
  useEffect(() => { if (done) markTutorialDone(); }, [done]);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setOpen(false), 2600);
    return () => clearTimeout(t);
  }, [done]);

  /** Next / Skip — both just move on; clamped so the closing card stays. */
  const next = () => setStep((i) => Math.min(i + 1, LESSON.length));

  // Phones: a bar in the strip above the board, stopping short of the fixed
  // system gear in that corner (its hit area would otherwise swallow the
  // plate's own Next / dismiss). Desktop: bottom-left, clear of everything.
  const shell: CSSProperties = isMobile
    ? { left: 8, right: 56, top: 4 }
    : { left: 18, bottom: 18, width: 306 };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="coach"
          aria-live="polite"
          aria-label="Tutorial"
          initial={{ opacity: 0, y: isMobile ? -14 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: isMobile ? -14 : 14 }}
          transition={spring.soft}
          style={{
            position: 'fixed',
            zIndex: 60,
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
          {/* Rail: the chapter and step count, the red task dot, a progress
              rule, and the dismiss. On phones the action rides up here too —
              the plate sits in the strip above the board, and a third row
              would push it down over the rival's rule. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isMobile ? 3 : 7 }}>
            {/* Phones have no footer row, so the task marker rides the rail there. */}
            {isMobile && !done && current.task && <TaskDot ticked={ticked} />}
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
              {done ? 'Lesson' : `${current.phase} · ${step + 1}/${LESSON.length}`}
            </span>
            <ProgressRule done={done ? 1 : step / LESSON.length} />
            {isMobile && !done && (
              <PlateAction label={current.task ? 'Skip' : 'Next'} onClick={next} muted={!!current.task} />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Dismiss the tutorial coach"
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
              key={done ? 'done' : current.id}
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
                {done ? 'Ready' : current.title}
              </div>
              <div style={{ ...text.body, fontSize: isMobile ? 11 : 12.5, lineHeight: isMobile ? 1.3 : 1.45, color: poster.inkDim }}>
                {done ? 'The rest is yours.' : current.body}
              </div>
            </motion.div>
          </div>

          {!done && !isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11 }}>
              {current.task ? (
                <>
                  <TaskDot ticked={ticked} />
                  <span style={{ ...text.label, fontSize: 9.5, letterSpacing: '0.2em', color: ticked ? poster.ink : poster.inkDim }}>
                    {ticked ? 'Done' : isMyTurn ? 'Your move' : 'Rival moves'}
                  </span>
                  <span style={{ flex: 1 }} />
                  <PlateAction label="Skip" onClick={next} muted />
                </>
              ) : (
                <>
                  <span style={{ flex: 1 }} />
                  <PlateAction label="Next" onClick={next} />
                </>
              )}
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/** The rail's hairline doubles as the progress bar: ink for what's behind
 *  you, rule grey for what's left. Fifteen steps is enough that "how much
 *  more of this" is a fair question. */
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

/** The waiting marker — a red dot that breathes while the task is open and
 *  snaps to a filled ink tick the moment it lands. */
function TaskDot({ ticked }: { ticked: boolean }) {
  return (
    <motion.span
      aria-hidden
      animate={ticked ? { scale: 1 } : { scale: [1, 0.62, 1] }}
      transition={ticked ? { duration: 0.2 } : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        width: 9,
        height: 9,
        flexShrink: 0,
        borderRadius: '50%',
        background: ticked ? poster.ink : poster.red,
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
      }}
    >
      {label}
    </motion.button>
  );
}
