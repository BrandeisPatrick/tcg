import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import type { BoardProps } from 'boardgame.io/react';
import type { GameState, CardInstance, PlayerID } from '@/engine/types';
import { CARDS_BY_ID } from '@/cards';
import { stepInCandidates } from '@/engine/util';
import { Log } from './side-panel/Log';
import { TargetingOverlay } from './overlays/TargetingOverlay';
import { CardPreview } from './overlays/CardPreview';
import { HeroDetailSheet } from './overlays/HeroDetailSheet';
import { OpponentHand } from './board/OpponentHand';
import { PosterBackdrop } from './PosterBackdrop';
import { DragArrow } from './effects/DragArrow';
import { MulliganOverlay } from './overlays/MulliganOverlay';
import { DraftOverlay } from './overlays/DraftOverlay';
import { PromotionOverlay } from './overlays/PromotionOverlay';
import { EquipmentReplaceOverlay } from './overlays/EquipmentReplaceOverlay';
import { MAX_EQUIPMENT_PER_HERO, RETREAT_COST } from '@/engine/game';
import { BenchRow } from './board/BenchRow';
import { ActiveDuel } from './board/ActiveDuel';
import { BoardIntro } from './board/BoardIntro';
import { BoardTable, boardRows, boardGutter, vitalsPull } from './board/BoardTable';
import { PatronPlaque } from './board/PatronPlaque';
import { BoardControls } from './board/BoardControls';
import type { TurnPhase } from './board/TurnCompass';
import { attackBlockReason, attackLine, readyHeroes, skillBlockReason, skillBlocked } from './board/heroActions';
import { enumerateAIMoves } from '@/ai/heuristic';
import { getAbility } from '@/abilities';
import { attackBlocked, planAttackPhase, type AttackPlan } from '@/engine/combat';
import { CombatChoreographer } from './effects/CombatChoreographer';
import { SoulsRail } from './board/SoulsRail';
import { CombatProgressContext, type CombatProgress } from './effects/CombatProgressContext';
import { FxLayer } from './effects/fx/FxLayer';
import { FxImpulseBus, FxImpulseContext } from './effects/fx/FxImpulse';
import { FxCalmContext, useCalmMotion } from './effects/fx/FxMotionContext';
import { FxTimingContext, type FxHoldResolver } from './effects/fx/FxTimingContext';
import { buildFxTimeline } from './effects/fx/fxTimeline';
import { FxStageProvider } from './effects/fx/stage/FxStage';
import { useDelayedValue } from './hooks/useDelayedValue';
import { UltMomentFlash } from './effects/UltMomentFlash';
import { CardPlayFlash, CARD_REVEAL_MS } from './effects/CardPlayFlash';
import { COMBAT_STEP_MS } from './hooks/useCombatSpeed';
import { useSettings, getSettings } from '@/storage/settings';
import { useFitScale } from './hooks/useFitScale';
import { useViewport, MOBILE_MAX } from './hooks/useViewport';
import { fonts, spring } from './tokens';
import { poster } from './poster';
import { SidePanel } from './side-panel/SidePanel';
import { PanelDrawer, PANEL_WIDTH } from './side-panel/PanelDrawer';
import { PATRON_NAMES } from './board/patrons';
import { HandTray } from './board/HandTray';
import { findOnBoard, filterAllows, type PendingPlay } from './helpers';
import { getMatchConfig } from '@/storage/matchConfig';
import { markLessonDone } from '@/storage/playerData';
import { LESSONS, lessonById, nextLesson } from '@/tutorial/lessons';
import { finishStoryBattle } from '@/story/storyRun';
import { MatchEndScreen } from './board/MatchEndScreen';
import { CoachPlate } from './tutorial/CoachPlate';
import { useMatchNav } from './hooks/matchNav';

// Animation / pacing constants.
const AI_THINK_MS = 800;        // delay between AI moves; also gives combat anims time to settle
/** The longest the board stays up after the match is decided, so the blow
 *  that decided it can be seen landing before the result sheet takes over. */
const FINAL_BLOW_MAX_MS = 2800;
/** What a click must land on to NOT cancel an armed card or skill. */
const TAP_AWAY_CONTROLS = 'button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="tab"]';

export function Board(props: BoardProps<GameState>) {
  const { G, ctx, moves } = props;
  const me: PlayerID = '0';
  const matchNav = useMatchNav();
  const isMyTurn = ctx.currentPlayer === me;
  // A tutorial lesson is built from a scripted setup like a Story node, but it
  // exits to the lesson list and carries the coach plate. Read once — the
  // config is fixed for the life of the mount.
  const lesson = useMemo(() => lessonById(getMatchConfig().lesson), []);
  const isTutorial = !!lesson;
  // Winning the lesson counts as having had it, even if the player dismissed
  // the coach on the first step. (The coach marks it too, when its script
  // runs out — whichever happens first.)
  useEffect(() => {
    if (lesson && ctx.gameover?.winner === me) markLessonDone(lesson.id, LESSONS.length);
  }, [lesson, ctx.gameover, me]);
  const following = lesson ? nextLesson(lesson.id) : undefined;
  // Combat tempo honours the system-menu speed setting live.
  const { combatSpeed } = useSettings();
  // The backdrop's slow push-in runs only when neither the settings sheet
  const [pending, setPending] = useState<PendingPlay | null>(null);
  // Taps on cards the player cannot pay for. The coach counts them: one
  // lesson has the player feel the soul limit before it explains it.
  const [refusals, setRefusals] = useState(0);
  // Auto-play: when on, the same AI that runs the opponent also drives the
  // local player's turns, so the match plays itself hands-free. Toggle in the
  // top-right; flip off any time to take control back.
  const [autoPlay, setAutoPlay] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  // Panel default: the patron plaques carry the vitals on-board, so the
  // panel is optional depth (log + detail). The player's setting wins;
  // 'auto' opens it only where its 320px cost is negligible (wide screens).
  const [panelOpen, setPanelOpen] = useState(() => {
    const pref = getSettings().panelDefault;
    if (pref === 'open') return true;
    if (pref === 'closed') return false;
    return window.innerWidth >= 1100;
  });
  const [preview, setPreview] = useState<{ card: CardInstance; hover: boolean } | null>(null);
  const [heroDetail, setHeroDetail] = useState<CardInstance | null>(null);
  // Retreat with more than one bench hero able to go in: the chooser is up
  // until the player picks who (or backs out).
  const [retreatPick, setRetreatPick] = useState(false);
  // Equipment replacement flow: when the player tries to attach a 4th piece
  // to a hero, this holds the incoming card + the target hero until the
  // player picks which existing item to discard (or cancels).
  const [replaceTarget, setReplaceTarget] = useState<{ incoming: CardInstance; hero: CardInstance } | null>(null);
  // The turn's attack, being made. While non-null the choreographer is
  // walking its plan; when it finishes, the engine makes the attack for real.
  const [combatPlan, setCombatPlan] = useState<AttackPlan | null>(null);
  // Queued End Turn. If the player taps the button while a card or skill
  // reveal is in flight, we remember it here instead of silently dropping
  // the click, then fire once the reveal settles.
  const queuedEndRef = useRef(false);
  const mover = ctx.currentPlayer as PlayerID;
  // A turn is the player's to spend on cards, skills and a retreat, with one
  // attack among them. The dial marks the attack: 'battle' while the
  // choreographer walks it, 'regroup' once it is made, 'prepare' before.
  const turnPhase: TurnPhase = combatPlan ? 'battle' : G.attackUsed ? 'regroup' : 'prepare';
  /** The mover's attack can still be made — and is not being made already. */
  const attackOpen = !ctx.gameover && !combatPlan && attackBlocked(G, mover) === null;
  // The ready glint: your heroes that can still do something this turn —
  // none while an attack is being walked, when nothing can be done.
  const readyIids = useMemo(
    () => (isMyTurn && !combatPlan ? readyHeroes(G, me, attackOpen) : new Set<string>()),
    [G, me, isMyTurn, combatPlan, attackOpen],
  );
  // Mirror of the choreographer's beat index so the TurnCompass (via
  // CombatProgressContext) can paint its combat-mode ring without the
  // choreographer needing to own any UI other than the action visuals.
  const [combatBeat, setCombatBeat] = useState(0);
  // Snap back to 0 whenever a new plan mounts or combat ends so the
  // compass doesn't carry stale beat state into the next combat.
  useEffect(() => { setCombatBeat(0); }, [combatPlan]);

  // Board FX stream. Every move / turn tick the engine resolves pushes its
  // visible consequences onto G.fx (hits, heals, statuses, the cast itself…).
  // The events not yet played are the "fresh" batch: derived HERE, during
  // render, so the impact-delay context is in place on the very render the
  // HP changes and HeroSlot can hold its numbers until the bolt lands. The
  // high-water mark moves in an effect after commit; a remount seeds it from
  // the current stream so old hits are never replayed. Basic attacks are not
  // in the stream — the CombatChoreographer animates them before resolving.
  const lastSeenFxRef = useRef<number | null>(null);
  const maxFxSeq = G.fx.reduce((m, e) => Math.max(m, e.seq), 0);
  if (lastSeenFxRef.current === null) lastSeenFxRef.current = maxFxSeq;
  const freshFx = G.fx.filter((e) => e.seq > (lastSeenFxRef.current ?? 0));
  const freshFxKey = freshFx.length > 0 ? maxFxSeq : 0;
  useEffect(() => {
    if (maxFxSeq > (lastSeenFxRef.current ?? 0)) lastSeenFxRef.current = maxFxSeq;
  }, [maxFxSeq]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fxTimeline = useMemo(() => buildFxTimeline(freshFx), [freshFxKey]);
  // The tiles' recoil channel (FxLayer / CombatChoreographer emit, HeroSlot
  // listens) and the calm-motion switch every FX primitive reads. The FX
  // stage — the canvas where sparks, bolts and debris have height — is
  // mounted below, around everything that books effects on it.
  const fxBus = useMemo(() => new FxImpulseBus(), []);
  const calmMotion = useCalmMotion();
  const fxHoldFor = useCallback<FxHoldResolver>(
    (iid) => ({ impact: fxTimeline.impactDelay[iid] ?? 0, settle: fxTimeline.koCorpse[iid] ?? 0 }),
    [fxTimeline],
  );
  // The spell reveal (CardPlayFlash) sits left of centre on desktop and
  // centred on phones; a spell's bolt leaves from there. Read at fire time so
  // it tracks the live viewport without a dependency on the breakpoint hook.
  const spellOrigin = useCallback(() => ({
    x: window.innerWidth <= MOBILE_MAX ? window.innerWidth / 2 : Math.min(330, Math.max(170, window.innerWidth * 0.2)),
    y: window.innerHeight / 2,
  }), []);
  // When our Active is KO'd by a skill / spell, the promotion prompt waits for
  // the shatter to play instead of covering it.
  const myActiveIid = G.players[me].active?.iid;
  const koSettleDelay = myActiveIid ? (fxTimeline.koSettle[myActiveIid] ?? 0) : 0;
  const pendingPromotionShown = useDelayedValue(G.pendingPromotion, koSettleDelay);
  // The final blow gets to land. When the move that ended the match came
  // with a cast or a kill, the board stays up until that batch has played —
  // the bolt, the card breaking, the K.O. sticker — and only then hands over
  // to the result sheet. (A basic attack's kill has already been walked by
  // the choreographer; nothing to wait for.) Input is sealed meanwhile.
  const finalBlow = !!ctx.gameover && freshFx.some((e) => e.kind === 'cast' || (e.kind === 'hit' && e.ko));
  const gameover = useDelayedValue(ctx.gameover, finalBlow ? Math.min(fxTimeline.total, FINAL_BLOW_MAX_MS) : 0);

  // Memoized — a fresh object identity every Board render used to re-render
  // every CombatProgressContext consumer (TurnCompass) even between beats.
  const combatProgress: CombatProgress = useMemo(() => combatPlan
    ? { total: combatPlan.steps.length, currentBeat: combatBeat, attackerIsMe: combatPlan.attackerId === me }
    : null, [combatPlan, combatBeat, me]);

  // Ephemeral feedback sticker — explains otherwise-silent no-ops (unaffordable
  // card, invalid target — printed red as warnings) and confirms
  // fire-and-forget actions (mulligan — printed ink).
  const [notice, setNotice] = useState<{ id: number; msg: string; warn: boolean } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((msg: string, warn = false) => {
    setNotice({ id: Date.now(), msg, warn });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2000);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // Scale the battle stage to fit shorter viewports so the hand row never gets
  // clipped off the bottom of the screen.
  const { containerRef: fitContainerRef, contentRef: fitContentRef, scale: fitScale } = useFitScale();
  // Phone widths reflow the board to a narrower, shorter-row layout (cards
  // shrink to ~⅓ of the viewport width) instead of overflowing off the side.
  const { isMobile } = useViewport();

  // panelOpen's initializer only runs once — when the window is resized across
  // the phone breakpoint mid-match, sync the drawer (phones: the 320px overlay
  // would bury the whole board; desktop: restore the default-open panel).
  const wasMobileRef = useRef(isMobile);
  useEffect(() => {
    if (isMobile !== wasMobileRef.current) {
      wasMobileRef.current = isMobile;
      setPanelOpen(!isMobile);
    }
  }, [isMobile]);

  const slotRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerSlotRef = useCallback((iid: string, el: HTMLElement | null) => {
    if (el) {
      slotRefs.current.set(iid, el);
      return;
    }
    // Cleanup callback (el === null): during AnimatePresence layout transitions
    // (e.g., a hero promoted from bench to active), the entering element's
    // mount-ref can fire BEFORE the exiting element's cleanup-ref, even though
    // both share the same iid. Blindly deleting here wipes the just-set ref
    // and the choreographer can't find the slot, so the entire AttackBeat
    // bails (no tracer, no banner). Instead, only delete if the currently
    // registered element is detached from the DOM — meaning no replacement
    // has re-registered for this iid.
    const cur = slotRefs.current.get(iid);
    if (cur && !document.body.contains(cur)) {
      slotRefs.current.delete(iid);
    }
  }, []);

  // Face-damage projection feeds the patron HP bar indicator (the per-hero
  // ▼N badges were removed as visual noise — combat choreographer shows
  // damage events when they land). Projected only while the mover's attack
  // is still there to be made.
  const projectedFaceDamage = useMemo(
    () => (attackOpen ? planAttackPhase(G, mover).damageToFace : 0),
    [G, mover, attackOpen],
  );

  /** The choreographer has walked the attack: make it in the engine. The
   *  turn stays with the player. (Stable apart from `moves`; the
   *  choreographer keeps its callback in a ref.) */
  const handleCombatComplete = useCallback(() => {
    setCombatPlan(null);
    try { moves.attack(); } catch {}
  }, [moves]);

  /** Make the turn's attack. The player's Attack plate and the AI's
   *  `attack` both come here, so either one is walked by the choreographer
   *  before the engine makes it. The engine's own gate decides whether
   *  there is an attack to make. */
  const startAttack = useCallback(() => {
    if (combatPlan || G.action?.state === 'begin') return;
    if (attackBlocked(G, mover)) return;
    setCombatPlan(planAttackPhase(G, mover));
  }, [G, mover, combatPlan]);

  /** The turn button, and the AI's pass: end the turn. Ending it never
   *  attacks — an attack not made is simply let go. */
  const endTurn = useCallback(() => {
    // While the attack is being walked a press does nothing, and is not
    // queued either: the engine has not made the attack yet, and a turn
    // ended under it would leave the walk to land on the next player's turn.
    if (combatPlan) return;
    // Our Active has fallen and the choice of who steps up is still owed (its
    // prompt may be waiting out the knockout). That comes first: the turn
    // does not end with a corpse in the lane.
    if (mover === me && G.pendingPromotion === me) return;
    // A card or skill reveal is in flight. Don't drop the click: remember
    // the player's intent and let the drain effect below fire it once the
    // reveal settles. (The AI re-fires via its own effect, so only queue for
    // the human's turn to avoid a stray press leaking onto the player's turn
    // after the AI moves.)
    if (G.action?.state === 'begin') {
      if (mover === me) queuedEndRef.current = true;
      return;
    }
    queuedEndRef.current = false;
    moves.endTurn();
  }, [G.action?.state, G.pendingPromotion, mover, combatPlan, moves, me]);

  // Drain a queued press once the reveal finishes. If the turn has already
  // flipped (or the game ended) we just clear the flag so a stale intent
  // never acts on the player's next turn for them.
  useEffect(() => {
    if (!queuedEndRef.current) return;
    if (combatPlan || G.action?.state === 'begin') return; // still animating
    if (ctx.gameover || ctx.currentPlayer !== me) { queuedEndRef.current = false; return; }
    queuedEndRef.current = false;
    endTurn();
  }, [combatPlan, G.action?.state, ctx.currentPlayer, ctx.gameover, me, endTurn]);

  // Targeting needs the board visible — close any hover/long-press preview the
  // moment a pending action arms, AND any that opens mid-targeting (a hover
  // timer armed before the tap can fire after it), so the big card preview
  // never sits on top of the very targets the player is being asked to pick.
  useEffect(() => { if (pending && preview) setPreview(null); }, [pending, preview]);

  // Layered Escape: back out of the innermost mode first — the retreat
  // chooser, an open hero sheet, an armed targeting state — before the key
  // reaches the SystemLayer's pause-menu toggle. Capture phase +
  // stopImmediatePropagation so the system listener (bubble phase on window)
  // never sees the press.
  useEffect(() => {
    if (!pending && !heroDetail && !retreatPick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (retreatPick) setRetreatPick(false);
      else if (heroDetail) setHeroDetail(null);
      else setPending(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [pending, heroDetail, retreatPick]);

  // Tap-away: while a card or skill is armed, a click on anything that is
  // not a control — the sheet, the room, the log — backs out of targeting,
  // the way Escape does. Controls (hero tiles, hand cards, buttons) handle
  // their own clicks and may re-arm; this listener sits on window, after
  // React's handlers have run, and only acts on non-interactive targets.
  useEffect(() => {
    if (!pending) return;
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest(TAP_AWAY_CONTROLS)) return;
      setPending(null);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [pending]);

  // Safety net: if the previewed card (hand or attached equipment) is no longer present, drop the preview.
  useEffect(() => {
    if (!preview?.hover) return;
    const targetIid = preview.card.iid;
    const inHand = (['0', '1'] as PlayerID[]).some((pid) =>
      G.players[pid].hand.some((c) => c.iid === targetIid)
    );
    const inAttached = (['0', '1'] as PlayerID[]).some((pid) => {
      const all = [G.players[pid].active, ...G.players[pid].bench].filter(Boolean) as CardInstance[];
      return all.some((h) => (h.attached ?? []).some((eq) => eq.iid === targetIid));
    });
    if (!inHand && !inAttached) setPreview(null);
  }, [G, preview]);

  // Stuck-hover guard: if the cursor leaves the document or stops moving for
  // ~2.5s while a hover preview is open, close it. Catches the case where the
  // source card unmounts mid-hover and never fires pointerleave, or the user
  // tabs/alt-tabs away.
  useEffect(() => {
    if (!preview?.hover) return;
    let idleTimer: ReturnType<typeof setTimeout>;
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setPreview(null), 2500);
    };
    const onWinBlur = () => setPreview(null);
    const onDocLeave = (e: PointerEvent) => {
      if (e.relatedTarget === null) setPreview(null);
    };
    armIdle();
    window.addEventListener('pointermove', armIdle, { passive: true });
    window.addEventListener('blur', onWinBlur);
    document.addEventListener('pointerleave', onDocLeave);
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener('pointermove', armIdle);
      window.removeEventListener('blur', onWinBlur);
      document.removeEventListener('pointerleave', onDocLeave);
    };
  }, [preview]);

  // HP / BP change animations are now driven by `useStatTick` inside
  // HeroSlot (per-card) and the vitals rules (patron HP) — no central floater
  // pushes here. Removing the old HP-diff effect also drops the
  // combat-vs-card-diff deduplication ref it used to need.

  // Turn-change acknowledgement now lives on the TurnCompass itself
  // (ring-burst + chevron flip + hue swap on isMyTurn change). No
  // banner needed.

  // The opponent ('1') is always AI-driven; the local player is too while
  // auto-play is on. The AI holds while an attack is being walked or a
  // card-play / skill / ult reveal is in flight (so it doesn't fire its next
  // move on top of its previous animation), and while our Active has fallen
  // and the choice of who steps up is ours to make: the rest of the rival's
  // turn must not play out against a lane we have not refilled. Under
  // auto-play nobody answers that prompt, so the loop makes the promotion
  // itself — the enumerator returns an owed promotion first, from either seat.
  const aiControlled = ctx.currentPlayer === '1' || (autoPlay && ctx.currentPlayer === me);
  const aiHolds = !!ctx.gameover || !aiControlled || !!combatPlan || G.action?.state === 'begin'
    || (G.pendingPromotion === me && !autoPlay);

  // AI loop: enumerate, play the best move, end the turn when that is best.
  useEffect(() => {
    if (aiHolds) return;
    const t = setTimeout(() => {
      try {
        // enumerate inside the try — if the heuristic ever throws, falling
        // through to ending the turn keeps the match moving instead of
        // freezing the AI's turn forever (nothing else would re-arm this
        // effect).
        const opts = enumerateAIMoves(G, ctx);
        if (opts.length === 0) { endTurn(); return; }
        const best = opts[0];
        // boardgame.io types `moves` as Record<string, (...args: unknown[]) => void>
        // but won't infer per-move signatures. One Function-typed lookup is
        // tidier than four separate `as any` casts and keeps the AI loop in
        // one place if a new move kind is added.
        const dispatch = moves as unknown as Record<string, (...args: unknown[]) => void>;
        // The attack goes the way the player's Attack plate does, so the AI's
        // attack is walked by the choreographer like the player's.
        if (best.move === 'attack') startAttack();
        else if (best.move === 'endTurn') endTurn();
        else if (dispatch[best.move]) dispatch[best.move](...best.args);
        else endTurn(); // unknown move kind — bail rather than freeze the AI loop
      } catch {
        endTurn();
      }
    }, AI_THINK_MS);
    return () => clearTimeout(t);
  }, [aiHolds, ctx, G, moves, startAttack, endTurn]);

  // AI watchdog. The loop above re-arms on state changes — but a dispatched
  // move the engine rejects (INVALID_MOVE) leaves G untouched, so nothing
  // re-fires and the rival's turn would wedge forever. If an AI-controlled
  // turn sits with no state change well past the think delay, end it so the
  // match always keeps moving. (ctx and G are in the deps to restart the
  // clock on every state change.)
  useEffect(() => {
    if (aiHolds) return;
    const t = setTimeout(() => { endTurn(); }, AI_THINK_MS * 6);
    return () => clearTimeout(t);
  }, [aiHolds, ctx, G, endTurn]);

  // Action reveal driver. When the engine sets G.action with state='begin'
  // (after playCard / useSkill), schedule completeAction so the animation
  // hold matches the dispatcher unlock. Player input is blocked elsewhere
  // via `actionLocked` until this fires.
  useEffect(() => {
    // A move that ends the match leaves its reveal open: nothing to complete.
    if (ctx.gameover || G.action?.state !== 'begin') return;
    // Play / skill reveals are a quick "you played X" beat; the ultimate is a
    // dramatic screen-fill that needs longer to land. Keep each in sync with
    // its overlay's animation length (CardPlayFlash / UltMomentFlash 2.3s).
    const HOLD_MS = G.action.kind === 'ult' ? 2400 : CARD_REVEAL_MS;
    const t = setTimeout(() => {
      try { (moves as any).completeAction(); } catch {}
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [G.action?.id, G.action?.state, G.action?.kind, moves, ctx.gameover]);

  const isTargetable = useCallback((card: CardInstance, owner: PlayerID): boolean => {
    if (!pending) return false;
    // Corpses (respawning heroes) are never valid targets.
    if ((card.respawnTurnsLeft ?? 0) > 0) return false;
    // 'self' means the armed card itself; filterAllows has no source to compare.
    if (pending.filter === 'self') return owner === me && pending.iid === card.iid;
    return filterAllows(pending.filter, card, owner, me);
  }, [pending, me]);

  /** True while the player's next move must wait: a card-play / skill / ult
   *  reveal is mid-animation, the attack is being walked, or their Active has
   *  fallen and the choice of who steps up is still owed (its prompt may be
   *  waiting out the knockout). */
  const actionLocked = G.action?.state === 'begin' || !!combatPlan || G.pendingPromotion === me;
  /** The turn button shows as working: locked, or holding a queued press. */
  const turnBusy = isMyTurn && (actionLocked || queuedEndRef.current);
  const pressTurnButton = () => { setPending(null); endTurn(); };

  function onTapCardInHand(c: CardInstance) {
    if (!isMyTurn) return;
    if (actionLocked) return;
    const data = CARDS_BY_ID[c.cardId];
    if (!data) return;

    if (data.type === 'spell' || data.type === 'ultimate') {
      const ability = getAbility(data.abilities[0]);
      if (!ability) return;
      // Nothing to aim: a self-cast ultimate (Yamato's Shadow Transformation)
      // lands on its own hero, which the engine resolves.
      if (ability.target === 'noTarget' || (data.type === 'ultimate' && ability.target === 'self')) {
        moves.playCard(c.iid);
        return;
      }
      setPending({
        kind: 'playCard', iid: c.iid,
        title: data.name,
        desc: data.text ?? '',
        filter: ability.target,
      });
    } else if (data.type === 'equipment') {
      setPending({
        kind: 'playCard', iid: c.iid,
        title: data.name,
        desc: data.text ?? 'Attach to an ally hero.',
        filter: 'allyHero',
      });
    }
  }

  /**
   * Equipment attach gate: if the target hero is at the equipment cap (3),
   * open the replacement modal instead of dispatching playCard. The modal
   * calls back with the chosen discard iid, which is forwarded to playCard.
   * Returns true if the play was deferred to the modal (caller should not
   * call playCard directly).
   */
  function maybeOpenEquipmentReplace(handCardIid: string, heroCardIid: string): boolean {
    const handCard = G.players[me].hand.find((c) => c.iid === handCardIid);
    if (!handCard) return false;
    if (CARDS_BY_ID[handCard.cardId]?.type !== 'equipment') return false;
    const found = findOnBoard(G, heroCardIid);
    if (!found || found.owner !== me) return false;
    if ((found.card.attached ?? []).length < MAX_EQUIPMENT_PER_HERO) return false;
    setReplaceTarget({ incoming: handCard, hero: found.card });
    return true;
  }

  function onTapHero(card: CardInstance, owner: PlayerID) {
    // Corpses are non-interactive — they're respawning in their slot.
    if ((card.respawnTurnsLeft ?? 0) > 0) return;
    if (pending) {
      if (!isMyTurn || actionLocked) return;
      const valid = isTargetable(card, owner);
      if (!valid) {
        setPending(null);
        showNotice(`Not a valid target for ${pending.title}`, true);
        return;
      }
      if (pending.kind === 'playCard') {
        if (maybeOpenEquipmentReplace(pending.iid, card.iid)) { setPending(null); return; }
        moves.playCard(pending.iid, card.iid);
      } else {
        moves.useSkill(pending.iid, card.iid);
      }
      setPending(null);
      return;
    }
    // No pending action: open the sheet for any hero (own or enemy). The
    // skill and the attack are used from its plates.
    setHeroDetail(card);
  }

  /**
   * Try to activate this hero's skill. Checks the engine's own guards
   * (`skillBlocked` mirrors `useSkill`) so the UI never opens a stale
   * targeting overlay.
   */
  function tryUseSkill(card: CardInstance) {
    if (!isMyTurn) return;
    if (actionLocked) return;
    if (skillBlocked(G, me, card)) return;
    const data = CARDS_BY_ID[card.cardId];
    if (data?.type !== 'hero' || !data.skill) return;
    const ability = getAbility(data.skill);
    if (!ability) return;
    if (ability.target === 'noTarget') { moves.useSkill(card.iid); return; }
    if (ability.target === 'self')     { moves.useSkill(card.iid, card.iid); return; }
    setPending({
      kind: 'useSkill', iid: card.iid,
      title: `${data.name} · Skill`,
      desc: ability.prompt ?? 'Choose a target.',
      filter: ability.target,
    });
  }

  /** The Attack plate on your Active's sheet. */
  function attackFromSheet() {
    if (!isMyTurn || actionLocked) return;
    startAttack();
  }

  /** Swap the Active with this bench hero (the engine charges the souls). */
  function retreatTo(heroIid: string) {
    const slot = G.players[me].bench.findIndex((b) => b?.iid === heroIid) + 1;
    if (slot >= 1) moves.moveHero(slot, 0);
  }

  /** Retreat, from the Active's sheet. With one hero able to step in the swap
   *  happens at once; with more, the player picks who goes in. */
  function startRetreat() {
    if (!isMyTurn || actionLocked) return;
    const stepIns = stepInCandidates(G.players[me]);
    if (stepIns.length === 1) retreatTo(stepIns[0].iid);
    else if (stepIns.length > 1) setRetreatPick(true);
  }

  function onHandDragEnd(c: CardInstance, x: number, y: number) {
    if (!isMyTurn || actionLocked) return;
    const data = CARDS_BY_ID[c.cardId];
    if (!data) return;

    let targetIid: string | null = null;
    for (const [iid, el] of slotRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        targetIid = iid;
        break;
      }
    }

    if (data.type === 'spell' || data.type === 'ultimate') {
      const ability = getAbility(data.abilities[0]);
      if (!ability) return;
      if (ability.target === 'noTarget' || (data.type === 'ultimate' && ability.target === 'self')) {
        moves.playCard(c.iid); setPending(null); return;
      }
      if (targetIid) {
        const found = findOnBoard(G, targetIid);
        if (found && filterAllows(ability.target, found.card, found.owner, me)) {
          moves.playCard(c.iid, targetIid);
          setPending(null);
          return;
        }
      }
      setPending({
        kind: 'playCard', iid: c.iid,
        title: data.name,
        desc: data.text ?? '',
        filter: ability.target,
      });
    } else if (data.type === 'equipment') {
      if (targetIid) {
        const found = findOnBoard(G, targetIid);
        if (found && found.owner === me && CARDS_BY_ID[found.card.cardId]?.type === 'hero') {
          if (maybeOpenEquipmentReplace(c.iid, targetIid)) { setPending(null); return; }
          moves.playCard(c.iid, targetIid);
          setPending(null);
          return;
        }
      }
      setPending({
        kind: 'playCard', iid: c.iid,
        title: data.name,
        desc: data.text ?? 'Attach to an ally hero.',
        filter: 'allyHero',
      });
    }
  }

  if (gameover) {
    const isStory = !!getMatchConfig().story;
    const won = gameover.winner === me;
    // Story battles return to the campaign map (win advances, loss ends the
    // run); a draw counts as a loss so the run still resolves. Quick Match
    // offers Rematch (fresh mount via Root's matchEpoch) and Main Menu.
    return (
      <MatchEndScreen
        G={G}
        me={me}
        won={won}
        draw={!!gameover.draw}
        isStory={isStory}
        isTutorial={isTutorial}
        lessonNumber={lesson?.number}
        lessonOutro={lesson?.outro}
        onNextLesson={following && matchNav ? () => matchNav.startLesson(following.id) : undefined}
        onLessons={lesson && matchNav ? matchNav.toLessons : undefined}
        onRematch={() => { if (matchNav) matchNav.rematch(); else location.reload(); }}
        onMenu={matchNav ? matchNav.exitToMenu : null}
        onStoryReturn={() => finishStoryBattle(won)}
      />
    );
  }

  const opp: PlayerID = '1';

  // Pre-match draft: render only the DraftOverlay; suppress the rest of the
  // board chrome. Boardgame.io currentPlayer drives whose pick it is, so we
  // still need props from G + ctx down to the overlay.
  if (G.draft) {
    return (
      <DraftOverlay
        draft={G.draft}
        currentPlayer={ctx.currentPlayer as PlayerID}
        me={me}
        onPick={(heroId) => (moves as any).draftPick(heroId)}
      />
    );
  }

  return (
    <LayoutGroup>
      <CombatProgressContext.Provider value={combatProgress}>
      <FxTimingContext.Provider value={fxHoldFor}>
      <FxImpulseContext.Provider value={fxBus}>
      <FxCalmContext.Provider value={calmMotion}>
      {/* The deal-in: the heroes are dealt onto the board as it first shows. */}
      <BoardIntro me={me}>
      <FxStageProvider density={isMobile ? 0.6 : 1}>
      <PosterBackdrop />

      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        margin: '0 auto',
        padding: isMobile ? '6px 6px 0' : '12px 16px 0',
        fontFamily: fonts.ui, color: poster.ink,
        position: 'relative',
      }}>
        {/* MAIN COLUMN — battle stage centered, side panel lives in a
            drawer slid in from the right (toggled by the chevron tab). */}
        <div
          ref={fitContainerRef}
          style={{
            flex: '1 1 auto',
            maxWidth: 1100,
            width: '100%',
            // Flexbox min-width:auto would stop this column shrinking below
            // the stage's intrinsic width, shoving the open panel off-screen
            // on tablet-width windows. Allowing shrink lets useFitScale see
            // the true leftover width and scale the stage down instead.
            minWidth: 0,
            position: 'relative', // anchors the corner-pinned turn controls
            display: 'flex',
            flexDirection: 'column',
            // Center the stage vertically so unused space spreads to top/bottom
            // rather than ballooning the active row. When the stage is taller
            // than the viewport, useFitScale shrinks it (transform below) so the
            // hand row stays on-screen instead of overflowing off the bottom.
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 0,
            height: 'calc(100vh - 32px)',
          }}>
        <div
          ref={fitContentRef}
          style={{
            // Desktop: size to the stage's intrinsic width (the rows grid /
            // cream sheet) so useFitScale can fit BOTH axes — a 100%-wide
            // box always "fits" horizontally and the sheet clipped instead
            // of scaling on narrow windows.
            width: isMobile ? '100%' : 'fit-content',
            alignSelf: 'center',
            display: 'flex',
            flexDirection: 'column',
            // Generous fibonacci gap gives the rows visible breathing room
            // rather than packing them.
            gap: isMobile ? 20 : 40,
            transform: `scale(${fitScale})`,
            transformOrigin: 'center center',
          }}>
          {/* Rival's fan tucks behind the sheet's top edge — a small negative
              margin lets the card backs peek over the paper (the sheet stacks
              above via zIndex), so the face-down hand rests AT the board
              instead of floating in the room. Mobile keeps the flat gap. */}
          <div style={{ flex: '0 0 auto', position: 'relative', zIndex: 0, marginBottom: isMobile ? 0 : -10 }}>
            <OpponentHand cards={G.players[opp].hand} />
          </div>

          {/* 3×3 BOARD GRID — the three rows (opp bench, lane, my bench)
              sit on one flat cream sheet (BoardTable), a print floating on
              the blurred scene. Same flat plane on desktop and mobile. */}
          <div style={{
            // Stacks the sheet above the rival's fan so the paper's top edge
            // overlaps the tucked card bottoms (see OpponentHand wrapper).
            position: 'relative',
            zIndex: 1,
          }}>
          <div style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: boardRows.gap(isMobile),
            // Gutter margins: row tags live in the left margin; the turn
            // control dock sits in the right margin. Without them the
            // fit-content stage hugs the card grid and both sat on cards.
            paddingLeft: boardGutter(isMobile).left,
            paddingRight: boardGutter(isMobile).right,
            // translateZ(0) keeps a stacking context so the sheet layer can
            // never paint over the rows on either branch.
            transform: 'translateZ(0)',
          }}>
            {/* The cream sheet — decorative layer behind the rows. */}
            <BoardTable isMobile={isMobile} />

            {/* RIVAL VITALS — a narrow rule capping the top of the stack.
                Patron HP, deck, discard, hand, souls and skill readiness live
                here on the board rather than only in the panel, and being a
                real row it can't overlap the sheet's edge the way the old
                corner plate did. */}
            <div style={{ position: 'relative', zIndex: 1, flex: `0 0 ${boardRows.vitals(isMobile)}px`, height: boardRows.vitals(isMobile), marginBottom: -vitalsPull(isMobile) }}>
              <PatronPlaque
                label={PATRON_NAMES.rival}
                ps={G.players[opp]}
                hostile
                attackOpen={!isMyTurn && attackOpen}
                projectedFaceDamage={ctx.currentPlayer === me ? projectedFaceDamage : 0}
                side="top"
                isMobile={isMobile}
                myTurn={!isMyTurn}
              />
            </div>

            {/* OPP BENCH (3 cards) */}
            <div style={{ position: 'relative', zIndex: 1, flex: `0 0 ${boardRows.bench(isMobile)}px`, height: boardRows.bench(isMobile) }}>
              <BenchRow
                ps={G.players[opp]}
                owner={opp} myId={me}
                isOpponent
                pending={pending}
                onTapHero={onTapHero}
                onLongPressHero={(c) => setHeroDetail(c)}
                onEquipmentHover={(eq) => setPreview(eq ? { card: eq, hover: true } : null)}
                isTargetable={isTargetable}
                registerSlotRef={registerSlotRef}
              />
            </div>

            {/* THE DUEL — opp active and my active side by side. Active row
                is bench × golden ratio (180 × 1.618 ≈ 291) so the duel still
                reads as the focus while bench tiles show full portraits. */}
            <div style={{ position: 'relative', zIndex: 1, flex: `0 0 ${boardRows.lane(isMobile)}px`, height: boardRows.lane(isMobile) }}>
              <ActiveDuel
                G={G}
                me={me}
                opp={opp}
                isMyTurn={isMyTurn}
                turn={G.turnNumber}
                phase={turnPhase}
                pending={pending}
                onTapHero={onTapHero}
                onLongPressHero={(c) => setHeroDetail(c)}
                onEquipmentHover={(eq) => setPreview(eq ? { card: eq, hover: true } : null)}
                isTargetable={isTargetable}
                registerSlotRef={registerSlotRef}
                readyIids={readyIids}
              />
            </div>

            {/* MY BENCH (3 cards) */}
            <div style={{ position: 'relative', zIndex: 1, flex: `0 0 ${boardRows.bench(isMobile)}px`, height: boardRows.bench(isMobile) }}>
              <BenchRow
                ps={G.players[me]}
                owner={me} myId={me}
                isOpponent={false}
                pending={pending}
                onTapHero={onTapHero}
                onLongPressHero={(c) => setHeroDetail(c)}
                onEquipmentHover={(eq) => setPreview(eq ? { card: eq, hover: true } : null)}
                isTargetable={isTargetable}
                registerSlotRef={registerSlotRef}
                readyIids={readyIids}
              />
            </div>

            {/* YOUR VITALS — the same rule closing the bottom of the stack. */}
            <div style={{ position: 'relative', zIndex: 1, flex: `0 0 ${boardRows.vitals(isMobile)}px`, height: boardRows.vitals(isMobile), marginTop: -vitalsPull(isMobile) }}>
              <PatronPlaque
                label={PATRON_NAMES.you}
                ps={G.players[me]}
                attackOpen={isMyTurn && attackOpen}
                projectedFaceDamage={ctx.currentPlayer !== me ? projectedFaceDamage : 0}
                side="bottom"
                isMobile={isMobile}
                myTurn={isMyTurn}
              />
            </div>

            {/* Souls rail — vertical coin stack parallel to the 3×3 grid;
                top = rival, bottom = you, positions encode ownership. */}
            <SoulsRail
              rivalSouls={G.players[opp].souls}
              yourSouls={G.players[me].souls}
            />

            {/* Turn control dock — printed in the sheet's right margin,
                centred on the lane. Lives inside the plane so it reads as
                part of the board. Phones keep the controls in the hand tray
                instead. */}
            {!isMobile && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 150,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
                pointerEvents: 'none',
              }}>
                <BoardControls
                  variant="dock"
                  isMyTurn={isMyTurn}
                  busy={turnBusy}
                  hasPending={!!pending}
                  autoPlay={autoPlay}
                  onEndTurn={pressTurnButton}
                  onCancel={() => setPending(null)}
                  onToggleAuto={() => setAutoPlay((v) => !v)}
                />
              </div>
            )}
          </div>
          </div>

          {/* zIndex 2 keeps the hand row above the board plane (zIndex 1),
              so cards rising on select/hover/drag pass OVER the sheet's
              bottom edge instead of sliding beneath it. */}
          <div style={{ flex: '0 0 auto', position: 'relative', zIndex: 2 }}>
            <HandTray
              cards={G.players[me].hand}
              disabled={!isMyTurn}
              pending={pending}
              isMyTurn={isMyTurn}
              busy={turnBusy}
              hasPending={!!pending}
              mySouls={G.players[me].souls}
              onTap={onTapCardInHand}
              onLongPress={(c) => setPreview({ card: c, hover: false })}
              onHover={(c) => setPreview(c ? { card: c, hover: true } : null)}
              onDragEndOver={onHandDragEnd}
              onUnaffordable={(_, cost) => {
                setRefusals((n) => n + 1);
                showNotice(`Need ${cost} souls — you have ${G.players[me].souls}`, true);
              }}
              onEndTurn={pressTurnButton}
              onCancel={() => setPending(null)}
              autoPlay={autoPlay}
              onToggleAuto={() => setAutoPlay((v) => !v)}
            />
          </div>
        </div>

        </div>

        {/* PANEL DRAWER — slides in from the right edge, toggled by a thin
            chevron tab always visible at the right edge of the viewport. */}
        <PanelDrawer open={panelOpen} onToggle={() => setPanelOpen((v) => !v)}>
          <SidePanel
            G={G}
            turn={G.turnNumber}
            onLogToggle={() => setLogOpen((v) => !v)}
          />
        </PanelDrawer>

        <AnimatePresence>
          {pending && (
            <TargetingOverlay
              title={pending.title}
              desc={pending.desc}
              filter={pending.filter}
              onCancel={() => setPending(null)}
              // Desktop panel is an in-flow column the fixed banner can't see —
              // inset its centring so it tracks the visible board, not the
              // full viewport (its right end used to slide under the sheet).
              rightInset={!isMobile && panelOpen ? PANEL_WIDTH : 0}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>{logOpen && <Log entries={G.log} onClose={() => setLogOpen(false)} />}</AnimatePresence>

        <DragArrow
          active={!!pending}
          source={pending ? { x: window.innerWidth / 2, y: window.innerHeight - 130 } : null}
        />

        <AnimatePresence>
          {preview && <CardPreview key={preview.card.iid + (preview.hover ? '-h' : '-p')} cardId={preview.card.cardId} hover={preview.hover} onClose={() => setPreview(null)} />}
        </AnimatePresence>

        <AnimatePresence>
          {heroDetail && (() => {
            // The sheet reads the hero as it stands now, not as it was when
            // tapped, so its plates stay true if the board moves while it is
            // open. (A hero who has left the board keeps its last picture.)
            const found = findOnBoard(G, heroDetail.iid);
            const hero = found?.card ?? heroDetail;
            const isMine = found?.owner === me;
            const isMyActive = isMine && G.players[me].active?.iid === hero.iid;
            const mySouls = G.players[me].souls;
            // Retreat is the Active's own move, so it is offered on the
            // Active's sheet and nowhere else — whenever a bench hero could
            // take the fight, with the reason printed when it cannot be done
            // right now.
            const stepIns = isMyActive ? stepInCandidates(G.players[me]) : [];
            const retreat = stepIns.length === 0 ? undefined : {
              cost: RETREAT_COST,
              incomingName: stepIns.length === 1 ? CARDS_BY_ID[stepIns[0].cardId]?.name : undefined,
              blockedReason: !isMyTurn ? 'Not your turn'
                : mySouls < RETREAT_COST ? `Need ${RETREAT_COST} souls`
                : undefined,
            };

            // Any of your heroes may use its skill, once a turn, on the
            // engine's own terms (`skillBlocked`).
            const skillBlock = isMine ? skillBlocked(G, me, hero) : null;
            const skillBlockedReason = !isMine ? undefined
              : !isMyTurn ? 'Not your turn'
              : skillBlock ? skillBlockReason(skillBlock)
              : undefined;
            // The turn's attack is your Active's, offered on its sheet with
            // what it would do, or why it cannot be made.
            const attackBlock = isMyActive && isMyTurn ? attackBlocked(G, me) : null;
            const attack = !isMyActive ? undefined : {
              line: isMyTurn && attackBlock === null ? attackLine(planAttackPhase(G, me)) : undefined,
              blockedReason: !isMyTurn ? 'Not your turn' : attackBlock ? attackBlockReason(attackBlock, hero) : undefined,
              made: !!hero.attackedThisTurn,
              onAttack: attackFromSheet,
            };

            return (
              <HeroDetailSheet
                card={hero}
                isMine={isMine}
                canUseSkill={isMine && isMyTurn && skillBlock === null}
                skillBlockedReason={skillBlockedReason}
                onUseSkill={() => tryUseSkill(hero)}
                attack={attack}
                retreat={retreat}
                onRetreat={startRetreat}
                onClose={() => setHeroDetail(null)}
              />
            );
          })()}
        </AnimatePresence>

        <AnimatePresence>
          {G.mulliganPending && (
            <MulliganOverlay
              cards={G.players[me].hand}
              onConfirm={(iids) => {
                (moves as any).mulligan(iids);
                showNotice(iids.length === 0
                  ? 'Kept opening hand'
                  : `Swapped ${iids.length} card${iids.length === 1 ? '' : 's'}`);
              }}
            />
          )}
        </AnimatePresence>

        {/* Promotion prompt: opens when our Active is a corpse and we have at
            least one alive bench hero who can step up. Blocks board input
            until a choice is made. */}
        <AnimatePresence>
          {(() => {
            const ps = G.players[me];
            // Single source of truth: the engine's `resolve` pass flags when a
            // promotion is owed. (No recompute of the corpse/candidate condition.)
            // Shown late when a KO animation is still playing on our Active.
            if (pendingPromotionShown !== me || G.pendingPromotion !== me || G.mulliganPending) return null;
            const candidates = stepInCandidates(ps);
            if (candidates.length === 0) return null;
            return (
              <PromotionOverlay
                key="promotion"
                candidates={candidates}
                leavingName={CARDS_BY_ID[ps.active!.cardId]?.name ?? 'Your Active'}
                onPick={(iid) => (moves as any).promoteToActive(iid)}
              />
            );
          })()}
        </AnimatePresence>

        {/* Retreat chooser: the same sheet, asked for rather than owed — it
            names the cost and can be backed out of. */}
        <AnimatePresence>
          {retreatPick && G.players[me].active && (
            <PromotionOverlay
              key="retreat"
              candidates={stepInCandidates(G.players[me])}
              leavingName={CARDS_BY_ID[G.players[me].active.cardId]?.name ?? 'Your Active'}
              retreat={{ cost: RETREAT_COST, onCancel: () => setRetreatPick(false) }}
              onPick={(iid) => { setRetreatPick(false); retreatTo(iid); }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {replaceTarget && (
            <EquipmentReplaceOverlay
              incoming={replaceTarget.incoming}
              hero={replaceTarget.hero}
              onPick={(discardIid) => {
                moves.playCard(replaceTarget.incoming.iid, replaceTarget.hero.iid, discardIid);
                setReplaceTarget(null);
              }}
              onCancel={() => setReplaceTarget(null)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {combatPlan && (
            <CombatChoreographer
              plan={combatPlan}
              me={me}
              slotRefs={slotRefs.current}
              stepDuration={COMBAT_STEP_MS / combatSpeed}
              onComplete={handleCombatComplete}
              onBeatIndexChange={setCombatBeat}
            />
          )}
        </AnimatePresence>

        <UltMomentFlash G={G} />
        <CardPlayFlash
          G={G}
          // Once the match is decided there is nothing left to skip to.
          onSkip={ctx.gameover ? undefined : () => { try { (moves as any).completeAction(); } catch {} }}
        />

        {/* The match is decided and its last blow is still playing: nothing
            on the board can be touched until the result sheet takes over. */}
        {ctx.gameover && <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 94 }} />}

        {/* Board FX — skill flares and bolts, type-coloured impacts, status
            stamps, heals, shields, revives — anchored to the hero slots. */}
        <FxLayer batch={freshFx} batchKey={freshFxKey} slotRefs={slotRefs.current} spellOrigin={spellOrigin} />

        {/* Feedback sticker — one ink label above the hand (red when it is
            a warning). Explains silent no-ops and confirms fire-and-forget
            actions. */}
        <AnimatePresence>
          {notice && (
            <motion.div
              key={notice.id}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
              transition={spring.default}
              style={{
                position: 'fixed',
                left: 0, right: 0,
                bottom: 196,
                display: 'flex',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 95,
              }}
            >
              <span style={{
                padding: '8px 16px',
                background: notice.warn ? poster.red : poster.ink,
                color: poster.paper,
                borderRadius: 3,
                fontFamily: fonts.display,
                fontSize: 11,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                lineHeight: 1.2,
                boxShadow: '0 6px 16px rgba(0, 0, 0, 0.45)',
              }}>
                {notice.msg}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {lesson && (
        <CoachPlate
          G={G}
          me={me}
          isMyTurn={isMyTurn}
          targeting={!!pending}
          attacking={isMyTurn && !!combatPlan}
          sheetHero={heroDetail?.cardId ?? null}
          refusals={refusals}
          lesson={lesson}
          onNextLesson={following && matchNav ? () => matchNav.startLesson(following.id) : undefined}
          onLessons={matchNav ? matchNav.toLessons : undefined}
        />
      )}
      </FxStageProvider>
      </BoardIntro>
      </FxCalmContext.Provider>
      </FxImpulseContext.Provider>
      </FxTimingContext.Provider>
      </CombatProgressContext.Provider>
    </LayoutGroup>
  );
}
