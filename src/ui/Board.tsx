import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import type { BoardProps } from 'boardgame.io/react';
import type { AbilityId, GameState, CardId, CardInstance, PlayerID } from '@/engine/types';
import { CARDS_BY_ID, itemCard } from '@/cards';
import {
  findCardOnBoard, findWornItem, handCard, isRespawning, itemPrice, kitAbilityIds, otherPlayer, resolveSkill, slotCap, stepInCandidates,
  ultimateCard, wornActives,
} from '@/engine/query';
import { upgradesOf } from '@/cards/decks';
import { RESPAWN_TURNS } from '@/engine/constants';
import { humanSeat } from './seat';
import { Log } from './side-panel/Log';
import { TargetingOverlay } from './overlays/TargetingOverlay';
import { CardPreview } from './overlays/CardPreview';
import { LiveScaleContext, boardLiveSpirit } from './card/liveScale';
import { plainText } from './card/scaling';
import { HeroDetailSheet, type SkillOffer } from './overlays/HeroDetailSheet';
import { DiscardOverlay } from './overlays/DiscardOverlay';
import { UpgradePicker } from './overlays/UpgradePicker';
import { DeckPile, DiscardPile, CardPiles } from './board/CardPiles';
import { OpponentHand } from './board/OpponentHand';
import { PosterBackdrop } from './PosterBackdrop';
import { DragArrow } from './effects/DragArrow';
import { DraftOverlay } from './overlays/DraftOverlay';
import { PromotionOverlay } from './overlays/PromotionOverlay';
import { BenchRow } from './board/BenchRow';
import { ActiveDuel } from './board/ActiveDuel';
import { BoardIntro } from './board/BoardIntro';
import { BoardTable, boardRows, boardGutter, vitalsPull, tablePad } from './board/BoardTable';
import { PatronPlaque } from './board/PatronPlaque';
import { BoardControls } from './board/BoardControls';
import type { TurnPhase } from './board/TurnCompass';
import {
  DISCARD_FIRST, actionRefusal, activateBlockReason, moveBlockReason, placeBlockReason, playBlockReason, readyHeroes, retreatBlock,
  skillBlockReason,
} from './board/heroActions';
import { isValidTarget } from './board/targeting';
import { attackOffer, tapAttackPlate, tapWhileAttackArmed } from './board/attackAim';
import { DEFAULT_AI_STRENGTH, enumerateAIMoves } from '@/ai/heuristic';
import { getAbility } from '@/abilities';
import {
  activateBlocked, activateTargets, attackBlocked, placeHeroBlocked, playBlocked, playCost, playTargets, retreatCost, skillBlocked,
  skillTargets,
} from '@/engine/legality';
import type { Action } from '@/engine/engine';
import { forecastAttack, type AttackPlan } from '@/engine/forecast';
import { CombatChoreographer } from './effects/CombatChoreographer';
import { SoulsRail } from './board/SoulsRail';
import { CombatProgressContext, type CombatProgress } from './effects/CombatProgressContext';
import { FxLayer } from './effects/fx/FxLayer';
import { FxImpulseBus, FxImpulseContext } from './effects/fx/FxImpulse';
import { FxCalmContext, useCalmMotion } from './effects/fx/FxMotionContext';
import { FxTimingContext, type FxHoldResolver } from './effects/fx/FxTimingContext';
import { buildFxTimeline, freshBatch } from './effects/fx/fxTimeline';
import { FxStageProvider } from './effects/fx/stage/FxStage';
import { DeckMotionLayer, DeckMotionProvider, useDeckMotion } from './motion';
import { useDelayedValue } from './hooks/useDelayedValue';
import { UltMomentFlash } from './effects/UltMomentFlash';
import { CardPlayFlash, CARD_REVEAL_MS } from './effects/CardPlayFlash';
import { COMBAT_STEP_MS } from './hooks/useCombatSpeed';
import { useSettings, getSettings } from '@/storage/settings';
import { useFitScale } from './hooks/useFitScale';
import { useViewport } from './hooks/useViewport';
import { fonts, spring } from './tokens';
import { poster } from './poster';
import { SidePanel } from './side-panel/SidePanel';
import { PanelDrawer, PANEL_WIDTH } from './side-panel/PanelDrawer';
import { PATRON_NAMES } from './board/patrons';
import { HandTray } from './board/HandTray';
import { shake } from './shop/shake';
import { useTurnBeat } from './board/turnBeat';
import { IncomeTick } from './board/IncomeTick';
import type { PendingPlay } from './helpers';
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
/** The band above the sheet, in stage px, where the rival's card backs hang:
 *  absolutely, peeking over the paper's top edge with the rest tucked behind
 *  it (OpponentHand), so they never take room of their own — an empty hand
 *  holds no row open, and a card the AI holds for a beat moves nothing.
 *  Phones: at a tall phone's fit scale (~0.84) the paper's top edge clears the
 *  System menu's gear (top 12 + 40px); on a shorter phone the sheet is scaled
 *  narrow enough to pass left of it instead. In a lesson the phone's coach
 *  plate sits there, above the board. Desktop: the backs' peek. */
const RIVAL_BAND = { phone: 52, lesson: 96, desktop: 40 } as const;
const rivalBand = (mobile: boolean, lesson: boolean) => (mobile ? (lesson ? RIVAL_BAND.lesson : RIVAL_BAND.phone) : RIVAL_BAND.desktop);
/** How long your turn holds on its End beat after the attack has been made,
 *  before it ends on its own, ms. */
const AUTO_END_MS = 500;
/** What a click must land on to NOT cancel an armed card or skill. */
const TAP_AWAY_CONTROLS = 'button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="tab"]';

export function Board(props: BoardProps<GameState>) {
  const { G, ctx, moves } = props;
  // The seat played here (the board lays itself out for seat 0) and the rival's.
  const me: PlayerID = humanSeat(G);
  const opp: PlayerID = otherPlayer(me);
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
  const [pending, setPending] = useState<PendingPlay | null>(null);
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
  // The card shown at full size: a card in the hand or a worn item's chip (by
  // its instance, so a hover peek closes if it goes).
  const [preview, setPreview] = useState<{ cardId: CardId; iid?: string; hover: boolean; cost?: number; inHand?: boolean } | null>(null);
  const [heroDetail, setHeroDetail] = useState<CardInstance | null>(null);
  // Retreat with more than one bench hero able to go in: the chooser is up
  // until the player picks who (or backs out).
  const [retreatPick, setRetreatPick] = useState(false);
  // An item put on a hero that could make one of several upgrades: the play
  // waits on the player's pick (UpgradePicker), or is backed out of.
  const [upgradePick, setUpgradePick] = useState<{ cardIid: string; heroIid: string; itemId: CardId; options: readonly CardId[] } | null>(null);
  // Where each card in the hand is on screen: the animation layer flies cards
  // to and from them.
  const handCardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerHandCard = useCallback((iid: string, el: HTMLElement | null) => {
    if (el) handCardRefs.current.set(iid, el);
    else handCardRefs.current.delete(iid);
  }, []);
  // An attack, being made. While non-null the choreographer is
  // walking its plan; when it finishes, the engine makes the attack for real.
  const [combatPlan, setCombatPlan] = useState<AttackPlan | null>(null);
  // Who the walked attack was aimed at, when it was not the default target —
  // the hero the player (or the AI) named. Left out, the engine's `attack`
  // takes the first of `attackTargets`, as it does for every hero without reach.
  const attackAimRef = useRef<string | undefined>(undefined);
  // Queued End Turn. If the player taps the button while a card or skill
  // reveal is in flight, we remember it here instead of silently dropping
  // the click, then fire once the reveal settles.
  const queuedEndRef = useRef(false);
  const mover = ctx.currentPlayer as PlayerID;
  // A turn is the player's to spend on cards, abilities and a retreat, then
  // its one attack, which ends it. The dial marks the attack: 'battle' while
  // the choreographer walks it, 'regroup' once it is made, 'prepare' before.
  const turnPhase: TurnPhase = combatPlan ? 'battle' : G.attackUsed ? 'regroup' : 'prepare';
  // The turn's beat (Income · Act · End) as the dial shows it: a turn's
  // hand-over plays its End and the next one's Income (turnBeat.ts).
  const spine = useTurnBeat({ turn: G.draft ? 0 : G.turnNumber, isMyTurn, attackMade: G.attackUsed && !combatPlan });
  /** The mover's attack can still be made, and it is not being made already. */
  const attackOpen = !ctx.gameover && !combatPlan && !G.pendingDiscard && attackBlocked(G, mover) === null;
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
  // the current stream so old hits are never replayed. An Active's attack is in
  // the stream, but the CombatChoreographer has already walked it before the
  // engine resolved, so the fresh batch leaves out what it walked (a card's
  // volley, inside its cast, was never walked: it stays, and plays).
  const lastSeenFxRef = useRef<number | null>(null);
  const maxFxSeq = G.fx.reduce((m, e) => Math.max(m, e.seq), 0);
  if (lastSeenFxRef.current === null) lastSeenFxRef.current = maxFxSeq;
  const freshFx = freshBatch(G.fx, lastSeenFxRef.current ?? 0);
  const freshFxKey = freshFx.length > 0 ? maxFxSeq : 0;
  useEffect(() => {
    if (maxFxSeq > (lastSeenFxRef.current ?? 0)) lastSeenFxRef.current = maxFxSeq;
  }, [maxFxSeq]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fxTimeline = useMemo(() => buildFxTimeline(freshFx), [freshFxKey]);
  // The deck's motion (ui/motion): the batch's `deck` events as flights
  // between the deck, the hand and the discard pile, planned on this render
  // so the hand knows which cards are landing.
  const deckMotion = useDeckMotion(freshFx, freshFxKey, G, me);
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
  // When our Active is KO'd by a skill / spell, the promotion prompt waits for
  // the shatter to play instead of covering it.
  const myActiveIid = G.players[me].active?.iid;
  const koSettleDelay = myActiveIid ? (fxTimeline.koSettle[myActiveIid] ?? 0) : 0;
  const pendingPromotionShown = useDelayedValue(G.pendingPromotion, koSettleDelay);
  // The first-Active prompt waits for the opening's deal (the heroes into the
  // deck, the draw) to play.
  const pendingActiveShown = useDelayedValue(G.pendingActive, deckMotion.openingDelay);
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

  // Ephemeral feedback sticker — explains otherwise-silent no-ops (an
  // unaffordable item, an invalid target — printed red as warnings).
  const [notice, setNotice] = useState<{ id: number; msg: string; warn: boolean } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((msg: string, warn = false) => {
    setNotice({ id: Date.now(), msg, warn });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2000);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // Scale the battle stage to fit shorter viewports so the controls row never
  // gets clipped off the bottom of the screen.
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
  // The hand row (strip + phone controls) — the targeting banner docks above
  // it on phones, and the sticker sits above it.
  const handRowRef = useRef<HTMLDivElement>(null);
  // How much of the screen's bottom the hand row takes.
  const [handInset, setHandInset] = useState(0);
  useEffect(() => {
    const el = handRowRef.current;
    if (!el) return;
    const measure = () => setHandInset(Math.max(0, Math.round(window.innerHeight - el.getBoundingClientRect().top)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
    // The row mounts once the draft is over, and moves when the layout flips.
  }, [isMobile, !!G.draft, !!ctx.gameover]);
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

  // What the mover's attack would push off the other side's structures, for
  // the hatched pips on its strip: the push of a hero it knocks out — the
  // swings themselves never reach a structure. (The per-hero ▼N badges were
  // removed as visual noise — combat choreographer shows damage events when
  // they land.) Projected only while the mover's attack is still there to be
  // made.
  const projectedPatronDamage = useMemo(
    () => (attackOpen ? forecastAttack(G, mover).pushDamage : 0),
    [G, mover, attackOpen],
  );

  /** The choreographer has walked the attack: make it in the engine, at the
   *  hero it was aimed at. The turn stays with the player. (Stable apart from
   *  `moves`; the choreographer keeps its callback in a ref.) */
  const handleCombatComplete = useCallback(() => {
    const aim = attackAimRef.current;
    attackAimRef.current = undefined;
    setCombatPlan(null);
    try { if (aim === undefined) moves.attack(); else moves.attack(aim); } catch {}
  }, [moves]);

  /** Make the Active's attack, at `targetIid` — left out, the default target.
   *  The player's Attack plate and the AI's `attack` both come here, so either
   *  one is walked by the choreographer before the engine makes it. The
   *  engine's own gate decides whether there is an attack to make, and at
   *  whom. */
  const startAttack = useCallback((targetIid?: string) => {
    if (combatPlan || G.action?.state === 'begin') return;
    if (attackBlocked(G, mover, targetIid)) return;
    attackAimRef.current = targetIid;
    setCombatPlan(forecastAttack(G, mover, targetIid));
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
    // does not end with a corpse in the lane. So does a draw card's discard.
    if (mover === me && G.pendingPromotion === me) return;
    if (G.pendingDiscard) return;
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
  }, [G.action?.state, G.pendingPromotion, G.pendingDiscard, mover, combatPlan, moves, me]);

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

  // The attack ends the turn's play: once it has been walked and made, your
  // turn ends on its own after a short End beat on the dial — no tap — unless
  // a promotion is owed (it comes first) or Auto is playing the turn. The
  // timer checks the turn it was set for is still the one in play.
  const liveTurnRef = useRef(G.turnNumber);
  liveTurnRef.current = G.turnNumber;
  useEffect(() => {
    if (!isMyTurn || autoPlay || ctx.gameover || !G.attackUsed || combatPlan) return;
    if (G.pendingPromotion === me || G.pendingDiscard || G.action?.state === 'begin') return;
    const turnAt = G.turnNumber;
    const t = setTimeout(() => { if (liveTurnRef.current === turnAt) endTurn(); }, AUTO_END_MS);
    return () => clearTimeout(t);
  }, [isMyTurn, autoPlay, ctx.gameover, G.attackUsed, combatPlan, G.pendingPromotion, G.pendingDiscard, G.action?.state, G.turnNumber, me, endTurn]);

  // Targeting needs the board visible — close any hover/long-press preview the
  // moment a pending action arms, AND any that opens mid-targeting (a hover
  // timer armed before the tap can fire after it), so the big card preview
  // never sits on top of the very targets the player is being asked to pick.
  useEffect(() => { if (pending && preview) setPreview(null); }, [pending, preview]);

  // Layered Escape: back out of the innermost mode first — the upgrade
  // picker, the retreat chooser, an open hero sheet, an armed targeting state
  // — before the key reaches the SystemLayer's pause-menu toggle. Capture
  // phase + stopImmediatePropagation so the system listener (bubble phase on
  // window) never sees the press.
  useEffect(() => {
    if (!pending && !heroDetail && !retreatPick && !upgradePick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (upgradePick) setUpgradePick(null);
      else if (retreatPick) setRetreatPick(false);
      else if (heroDetail) setHeroDetail(null);
      else setPending(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [pending, heroDetail, retreatPick, upgradePick]);

  // Tap-away: while a card or skill is armed, a click on anything that is
  // not a control — the sheet, the room, the log — backs out of targeting,
  // the way Escape does. Controls (hero tiles, item chips, buttons) handle
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

  // Safety net: if the previewed card is no longer in a hand or worn, drop the
  // preview (a held one too: its sale would name a card that is gone).
  useEffect(() => {
    if (!preview?.iid) return;
    const gone = !findWornItem(G, preview.iid) && !(['0', '1'] as PlayerID[]).some((pid) => handCard(G, pid, preview.iid!));
    if (gone) setPreview(null);
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

  // The rival's seat (whichever is not `me`) is always AI-driven; the local
  // player's is too while auto-play is on. The AI holds while an attack is being walked or a
  // card-play / skill / ult reveal is in flight (so it doesn't fire its next
  // move on top of its previous animation), and while our Active has fallen
  // and the choice of who steps up is ours to make: the rest of the rival's
  // turn must not play out against a lane we have not refilled. Under
  // auto-play nobody answers that prompt, so the loop makes the promotion
  // itself — the enumerator returns an owed promotion first, from either seat.
  const aiControlled = ctx.currentPlayer !== me || autoPlay;
  // The opening's first Active and a draw card's discard are the player's own
  // to answer too, unless auto-play is driving their seat.
  const aiHolds = !!ctx.gameover || !aiControlled || !!combatPlan || G.action?.state === 'begin'
    || (G.pendingPromotion === me && !autoPlay)
    || (G.pendingActive === me && !autoPlay)
    || (G.pendingDiscard?.pid === me && !autoPlay);

  // AI loop: enumerate, play the best move, end the turn when that is best.
  useEffect(() => {
    if (aiHolds) return;
    const t = setTimeout(() => {
      try {
        // Every match plays the default strength for now (the dial in
        // src/ai/heuristic.ts stays for the sims; no screen sets it).
        const strength = DEFAULT_AI_STRENGTH;
        // enumerate inside the try — if the heuristic ever throws, falling
        // through to ending the turn keeps the match moving instead of
        // freezing the AI's turn forever (nothing else would re-arm this
        // effect).
        const opts = enumerateAIMoves(G, ctx, true, { strength });
        if (opts.length === 0) { endTurn(); return; }
        const best = opts[0];
        // boardgame.io types `moves` as Record<string, (...args: unknown[]) => void>
        // but won't infer per-move signatures. One Function-typed lookup is
        // tidier than four separate `as any` casts and keeps the AI loop in
        // one place if a new move kind is added.
        const dispatch = moves as unknown as Record<string, (...args: unknown[]) => void>;
        // The attack goes the way the player's Attack plate does, so the AI's
        // attack is walked by the choreographer like the player's — at the
        // hero it named, when it named one (the first target goes bare).
        if (best.move === 'attack') startAttack(best.args[0] as string | undefined);
        else if (best.move === 'endTurn') endTurn();
        else if (dispatch[best.move]) dispatch[best.move](...best.args);
        else endTurn(); // unknown move kind — bail rather than freeze the AI loop
      } catch {
        endTurn();
      }
    }, AI_THINK_MS);
    return () => clearTimeout(t);
  }, [aiHolds, ctx, G, me, moves, startAttack, endTurn]);

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

  /** The glow on the tiles: is this hero a legal target for what is armed?
   *  The engine answers (`isValidTarget` asks `skillBlocked` /
   *  `activateBlocked` / `attackBlocked`), so the corpse rule and the filters
   *  are written once, in the engine. */
  const isTargetable = useCallback(
    (card: CardInstance): boolean => isValidTarget(G, me, pending, card),
    [G, me, pending],
  );

  /** What the Spirit behind a card's numbers comes to now (an active item's
   *  is your Active's, an ultimate's its linked hero's): the card prints its
   *  own number and its popover says "(N now)". */
  const liveSpirit = useMemo(() => boardLiveSpirit(G, me), [G, me]);

  /** True while the player's next move must wait: a card-play / skill / ult
   *  reveal is mid-animation, the attack is being walked, or a choice is still
   *  owed — who steps up for a fallen Active (its prompt may be waiting out the
   *  knockout), the first Active, a draw card's discard. */
  const actionLocked = G.action?.state === 'begin' || !!combatPlan || G.pendingPromotion === me
    || !!G.pendingActive || !!G.pendingDiscard;
  /** The turn button shows as working: locked, or holding a queued press. */
  const turnBusy = isMyTurn && (actionLocked || queuedEndRef.current);
  const pressTurnButton = () => { setPending(null); endTurn(); };

  // Every move the player makes is asked of the engine first (`actionRefusal`
  // wraps `blocked`, legality.ts). A move it will not make is said on the
  // sticker instead of being dispatched to go nowhere.

  /** Put the item `cardIid` from the hand on a hero, once the engine says it
   *  may go there; a refusal (a full hero, one already wearing it, not enough
   *  souls) is said on the sticker and the card stays in the hand. An item
   *  that could make one of several upgrades asks which first. */
  function playCardOn(cardIid: string, heroIid: string) {
    if (!isMyTurn || actionLocked) return;
    const no = actionRefusal(G, me, { type: 'playCard', cardIid, heroIid });
    if (no) { showNotice(no.text, true); shake(slotRefs.current.get(heroIid)); return; }
    const card = handCard(G, me, cardIid);
    const options = card ? upgradesOf(card.cardId) : [];
    if (card && options.length > 1) { setUpgradePick({ cardIid, heroIid, itemId: card.cardId, options }); return; }
    moves.playCard(cardIid, heroIid);
  }

  /** The upgrade picked for the play that waited on it. */
  function pickUpgrade(upgradeId: CardId) {
    const pick = upgradePick;
    setUpgradePick(null);
    if (!pick || !isMyTurn || actionLocked) return;
    const no = actionRefusal(G, me, { type: 'playCard', cardIid: pick.cardIid, heroIid: pick.heroIid, upgradeId });
    if (no) { showNotice(no.text, true); return; }
    moves.playCard(pick.cardIid, pick.heroIid, upgradeId);
  }

  /** Why the card `c` cannot be played right now, in the engine's words: a
   *  hero with no room on the board, an item no hero can take (the first
   *  hero's refusal: full, wearing it, too dear). */
  function stuckReason(c: CardInstance): string {
    if (CARDS_BY_ID[c.cardId]?.type === 'hero') {
      const why = placeHeroBlocked(G, me, c.iid);
      return why ? placeBlockReason(why) : 'It cannot go on the board now';
    }
    const heroes = [G.players[me].active, ...G.players[me].bench].filter((h): h is CardInstance => !!h);
    const first = heroes[0];
    if (!first) return 'Put a hero on the board first';
    const why = playBlocked(G, me, c.iid, first.iid);
    return why ? playBlockReason(why, {
      item: CARDS_BY_ID[c.cardId]?.name, hero: CARDS_BY_ID[first.cardId]?.name, slots: slotCap(G, me),
      cost: playCost(first, c.cardId), have: G.players[me].souls,
    }) : 'No hero can take it now';
  }

  /** Put the hero `c` from the hand on the board: into the lane when it is
   *  empty, else onto the bench. Free. */
  function placeFromHand(c: CardInstance) {
    const toActive = placeHeroBlocked(G, me, c.iid, true) === null;
    const no = actionRefusal(G, me, { type: 'placeHero', cardIid: c.iid, toActive });
    if (no) { showNotice(no.text, true); return; }
    if (toActive) moves.placeHero(c.iid, true);
    else moves.placeHero(c.iid);
  }

  /** A tap on a card in the hand. A hero goes on the board at once (the lane
   *  when it is empty, else the bench). An item is armed: the heroes it may go
   *  on glow, and the next tap on one of them puts it on for its price. */
  function onTapCardInHand(c: CardInstance) {
    if (!isMyTurn || actionLocked) return;
    const data = CARDS_BY_ID[c.cardId];
    if (data?.type === 'hero') { setPreview(null); placeFromHand(c); return; }
    if (playTargets(G, me, c.iid).length === 0) { showNotice(stuckReason(c), true); return; }
    setPreview(null);
    const price = itemPrice(c.cardId);
    setPending({
      kind: 'playCard', iid: c.iid,
      title: data?.name ?? 'Card',
      desc: `${price} soul${price === 1 ? '' : 's'} — put it on one of your heroes (an upgrade on the hero wearing its part costs the difference).`,
      filter: 'allyHero',
    });
  }

  /** A card from the hand let go over the board (a desktop drag): onto the
   *  hero under the pointer, if it is one; else as a tap would. */
  function onHandDragEnd(c: CardInstance, x: number, y: number) {
    if (!isMyTurn || actionLocked) return;
    if (CARDS_BY_ID[c.cardId]?.type !== 'hero') {
      for (const [iid, el] of slotRefs.current.entries()) {
        const rect = el.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          playCardOn(c.iid, iid);
          setPending(null);
          return;
        }
      }
    }
    onTapCardInHand(c);
  }

  /** Hold a card in the hand: the full card. */
  function holdHandCard(c: CardInstance) {
    setPreview({ cardId: c.cardId, iid: c.iid, hover: false, inHand: true });
  }

  /** Use an active item once the engine says it may be used. */
  function fireItem(itemIid: string, targetIid?: string) {
    const no = actionRefusal(G, me, { type: 'activate', itemIid, targetIid });
    if (no) { showNotice(no.text, true); return; }
    if (targetIid) moves.activate(itemIid, targetIid);
    else moves.activate(itemIid);
  }

  /** Use one of a hero's skills once the engine says it may be used. */
  function castSkill(heroIid: string, targetIid?: string, skillId?: AbilityId) {
    const no = actionRefusal(G, me, { type: 'useSkill', heroIid, targetIid, skillId });
    if (no) { showNotice(no.text, true); return; }
    // The move's arguments end at the last one given: [hero], [hero, target], [hero, target, skill].
    const args = [heroIid, targetIid, skillId];
    while (args.length > 1 && args[args.length - 1] === undefined) args.pop();
    moves.useSkill(...args);
  }

  function onTapHero(card: CardInstance) {
    if (pending) {
      if (!isMyTurn || actionLocked) return;
      // A tap on a hero the armed card, skill or item cannot go to or be
      // aimed at (a full hero, a corpse for a skill, the wrong side) is
      // refused with the reason.
      if (pending.kind === 'playCard') playCardOn(pending.iid, card.iid);
      else if (pending.kind === 'activate') fireItem(pending.iid, card.iid);
      else if (pending.kind === 'attack') aimAttack(card.iid);
      else castSkill(pending.iid, card.iid, pending.skillId);
      setPending(null);
      return;
    }
    // Corpses are non-interactive — they're respawning in their slot.
    if (isRespawning(card)) return;
    // No pending action: open the sheet for any hero (own or enemy). The
    // skill and the attack are used from its plates.
    setHeroDetail(card);
  }

  /**
   * Try to use one of this hero's kit abilities — a skill, its ultimate or a
   * borrowed ultimate. Asks the engine first (`skillBlocked`), so the UI never
   * opens a stale targeting overlay.
   */
  function tryUseSkill(card: CardInstance, skillId: AbilityId) {
    if (!isMyTurn) return;
    if (actionLocked) return;
    const why = skillBlocked(G, me, card, undefined, skillId);
    if (why) { if (why !== 'noSkill') showNotice(skillBlockReason(why, card, skillId), true); return; }
    const data = CARDS_BY_ID[card.cardId];
    const kit = resolveSkill(card, skillId);
    const ability = kit?.ability;
    if (data?.type !== 'hero' || !ability) return;
    if (skillTargets(G, me, card, skillId) === 'none') { castSkill(card.iid, undefined, skillId); return; }
    // An ability aimed at its own hero asks for nothing.
    if (ability.target === 'self') { castSkill(card.iid, card.iid, skillId); return; }
    const ult = kit.kind === 'skill' ? undefined : ultimateCard(skillId);
    setPending({
      kind: 'useSkill', iid: card.iid, skillId,
      title: ult ? `${data.name} · ${ult.name}` : `${data.name} · Skill`,
      desc: (ult ? plainText(ult.text) : ability.prompt) || 'Choose a target.',
      filter: ability.target,
    });
  }

  /**
   * Try to use an active item a hero wears. Asks the engine first
   * (`activateBlocked`); an item that takes no target goes at once, one that
   * does arms the targeting like a skill.
   */
  function tryUseItem(itemIid: string) {
    if (!isMyTurn) return;
    if (actionLocked) return;
    const worn = findWornItem(G, itemIid, me);
    const data = worn && itemCard(worn.item.cardId);
    if (!worn || data?.type !== 'spell') return;
    const why = activateBlocked(G, me, itemIid);
    if (why) { showNotice(activateBlockReason(why, worn.item, worn.bearer), true); return; }
    const targets = activateTargets(G, me, worn.item, worn.bearer);
    if (targets === 'none') { fireItem(itemIid); return; }
    setPending({
      kind: 'activate', iid: itemIid,
      title: `${CARDS_BY_ID[worn.bearer.cardId]?.name ?? ''} · ${data.name}`,
      desc: plainText(data.text) || 'Choose a target.',
      filter: getAbility(data.abilities[0])?.target ?? 'anyBoard',
    });
  }

  /** The Attack plate on your Active's sheet. With one hero to hit the attack
   *  goes at once; with more (a hero with reach) the board arms the attack and
   *  lights the heroes it may name, like a skill waiting for its target. */
  function attackFromSheet() {
    if (!isMyTurn || actionLocked) return;
    const tap = tapAttackPlate(G, me);
    if (tap.do === 'refuse') showNotice(tap.refusal.text, true);
    else if (tap.do === 'choose') setPending(tap.pending);
    else startAttack();
  }

  /** A tap on a hero while the attack is armed: the attack at that hero, or the
   *  engine's reason it cannot be made there. */
  function aimAttack(targetIid: string) {
    const tap = tapWhileAttackArmed(G, me, targetIid);
    if (tap.do === 'refuse') showNotice(tap.refusal.text, true);
    else startAttack(tap.target);
  }

  /** Swap the Active with this bench hero (the engine charges the souls). */
  function retreatTo(heroIid: string) {
    const slot = G.players[me].bench.findIndex((b) => b?.iid === heroIid) + 1;
    if (slot < 1) return;
    const no = actionRefusal(G, me, { type: 'moveHero', fromSlot: slot as 1 | 2 | 3, toSlot: 0 });
    if (no) { showNotice(no.text, true); return; }
    moves.moveHero(slot, 0);
  }

  /** Retreat, from the Active's sheet. With one hero able to step in the swap
   *  happens at once; with more, the player picks who goes in. */
  function startRetreat() {
    if (!isMyTurn || actionLocked) return;
    const stepIns = stepInCandidates(G.players[me]);
    const why = retreatBlock(G, me, stepIns);
    if (why) { showNotice(moveBlockReason(why, retreatCost(G, me)), true); return; }
    if (stepIns.length === 1) retreatTo(stepIns[0].iid);
    else if (stepIns.length > 1) setRetreatPick(true);
  }

  if (gameover) {
    const isStory = !!getMatchConfig().story;
    const won = gameover.winner === me;
    // Story battles return to the campaign map (win advances, loss ends the
    // run). Quick Match offers Rematch (fresh mount via Root's matchEpoch)
    // and Main Menu.
    return (
      <MatchEndScreen
        G={G}
        me={me}
        won={won}
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

  // An equipped item's chip previews the item (CardPreview, centre screen).
  // Under a pointer it is a peek that leaves with the pointer; on a phone
  // there is no pointer to leave, so the tap opens the held preview, which
  // stays until the next tap.
  const previewEquipment = (eq: CardInstance | null) => setPreview(eq ? { cardId: eq.cardId, iid: eq.iid, hover: !isMobile } : null);

  const incomeShown = !G.draft && !ctx.gameover && isMyTurn && spine.edge && spine.beat === 'income' && spine.mine;

  // The hand and, on phones, the turn controls under it. Desktop mounts it as
  // the last row of the fitted stage; phones mount it below the stage, at
  // full size (see the fit box in the column below).
  // zIndex 2 keeps the hand row above the board plane (zIndex 1), so cards
  // rising on select/hover/drag pass OVER the sheet's bottom edge instead of
  // sliding beneath it.
  const handRow = (
    <div ref={handRowRef} style={{ flex: '0 0 auto', position: 'relative', zIndex: 2, alignSelf: isMobile ? 'stretch' : undefined }}>
      <HandTray
        cards={G.players[me].hand}
        souls={G.players[me].souls}
        disabled={!isMyTurn || actionLocked}
        pending={pending}
        isMyTurn={isMyTurn}
        busy={turnBusy}
        hasPending={!!pending}
        playable={(c) => (CARDS_BY_ID[c.cardId]?.type === 'hero'
          ? placeHeroBlocked(G, me, c.iid) === null || placeHeroBlocked(G, me, c.iid, true) === null
          : playTargets(G, me, c.iid).length > 0)}
        onTap={onTapCardInHand}
        onLongPress={holdHandCard}
        onHover={(c) => setPreview(c ? { cardId: c.cardId, iid: c.iid, hover: true, inHand: true } : null)}
        onDragEndOver={onHandDragEnd}
        onBlocked={(c) => showNotice(stuckReason(c), true)}
        onEndTurn={pressTurnButton}
        onCancel={() => setPending(null)}
        autoPlay={autoPlay}
        onToggleAuto={() => setAutoPlay((v) => !v)}
        registerCard={registerHandCard}
        arriving={deckMotion.arriving}
        deckPile={<DeckPile count={G.players[me].deck.length} owner="you" size={isMobile ? 'chip' : 'full'} accent={poster.you} />}
        discardPile={<DiscardPile cards={G.players[me].discard} owner="you" size={isMobile ? 'chip' : 'full'} accent={poster.you} />}
      />
    </div>
  );

  return (
    <LayoutGroup>
      <CombatProgressContext.Provider value={combatProgress}>
      <FxTimingContext.Provider value={fxHoldFor}>
      <FxImpulseContext.Provider value={fxBus}>
      <FxCalmContext.Provider value={calmMotion}>
      <DeckMotionProvider ticker={deckMotion.ticker}>
      <LiveScaleContext.Provider value={liveSpirit}>
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
          ref={isMobile ? undefined : fitContainerRef}
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
            // controls stay on-screen instead of overflowing off the bottom.
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 0,
            // Phones: the visible height (dvh — 100vh runs under a mobile
            // browser's toolbar) less the 6px top padding, a matching 6px
            // under the controls and the home-indicator inset (the page is
            // viewport-fit=cover). The flat 32px it replaced was height the
            // fit-scale took from the board.
            height: isMobile ? 'calc(100dvh - 12px - env(safe-area-inset-bottom, 0px))' : 'calc(100vh - 32px)',
          }}>
        {/* Phones fit the stage into what the controls row leaves (the row
            stays out of the scale, below); elsewhere this box is not drawn and
            the column fits the whole stage. */}
        <div
          ref={isMobile ? fitContainerRef : undefined}
          style={isMobile ? {
            flex: '1 1 0', minHeight: 0, width: '100%',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          } : { display: 'contents' }}>
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
          {/* The band above the sheet (see RIVAL_BAND): the rival's backs hang
              in it at the paper's top edge, peeking over it and tucked behind
              it (the sheet stacks above via zIndex), so the face-down hand
              rests AT the board and never moves it. */}
          <div style={{ flex: '0 0 auto', position: 'relative', zIndex: 0, height: rivalBand(isMobile, isTutorial) }}>
            <OpponentHand
              cards={G.players[opp].hand}
              edge={rivalBand(isMobile, isTutorial) + boardRows.gap(isMobile) - tablePad(isMobile).top}
              compact={isMobile}
            />
            {/* The rival's deck and discard pile, at the band's left. */}
            <div style={{ position: 'absolute', left: isMobile ? 4 : 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
              <CardPiles ps={G.players[opp]} owner="rival" compact />
            </div>
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
                Patron HP, souls, the turn's step and the attack lamp live
                here on the board rather than only in the panel, and being a
                real row it can't overlap the sheet's edge the way the old
                corner plate did. */}
            <div style={{ position: 'relative', zIndex: 1, flex: `0 0 ${boardRows.vitals(isMobile)}px`, height: boardRows.vitals(isMobile), marginBottom: -vitalsPull(isMobile) }}>
              <PatronPlaque
                label={PATRON_NAMES.rival}
                ps={G.players[opp]}
                hostile
                attackOpen={!isMyTurn && attackOpen}
                projectedDamage={ctx.currentPlayer === me ? projectedPatronDamage : 0}
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
                onEquipmentHover={previewEquipment}
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
                onEquipmentHover={previewEquipment}
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
                onEquipmentHover={previewEquipment}
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
                projectedDamage={ctx.currentPlayer !== me ? projectedPatronDamage : 0}
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
                part of the board. Phones keep the controls in a row under the
                stage instead. */}
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

          {!isMobile && handRow}
        </div>
        </div>

        {/* Phones: the hand sits under the fitted stage at its own full
            size — scaled with the board it was too small to read. */}
        {isMobile && handRow}
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
              // Phones: the full-size hand strip reaches well above the
              // desktop dock height — sit above it, not on its cards.
              dockAbove={isMobile ? handRowRef : undefined}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>{logOpen && <Log entries={G.log} onClose={() => setLogOpen(false)} />}</AnimatePresence>

        <DragArrow
          active={!!pending}
          source={pending ? { x: window.innerWidth / 2, y: window.innerHeight - 130 } : null}
        />

        <AnimatePresence>
          {preview && (
            <CardPreview
              key={(preview.iid ?? preview.cardId) + (preview.hover ? '-h' : '-p')}
              cardId={preview.cardId}
              cost={preview.cost}
              hover={preview.hover}
              onClose={() => setPreview(null)}
            />
          )}
        </AnimatePresence>


        <AnimatePresence>
          {heroDetail && (() => {
            // The sheet reads the hero as it stands now, not as it was when
            // tapped, so its plates stay true if the board moves while it is
            // open. (A hero who has left the board keeps its last picture.)
            const found = findCardOnBoard(G, heroDetail.iid);
            const hero = found?.card ?? heroDetail;
            const isMine = found?.owner === me;
            const isMyActive = isMine && G.players[me].active?.iid === hero.iid;
            // Retreat is the Active's own move, so it is offered on the
            // Active's sheet and nowhere else — whenever a bench hero could
            // take the fight, with the reason printed when it cannot be done
            // right now (the engine's own `moveBlocked`).
            const stepIns = isMyActive ? stepInCandidates(G.players[me]) : [];
            const retreatWhy = retreatBlock(G, me, stepIns);
            // The price is the engine's (`retreatCost`): gear and Swift lower it.
            // Nothing on the board acts while a draw card's discard is owed.
            const discardFirst = isMyTurn && !!G.pendingDiscard;
            const retreat = stepIns.length === 0 ? undefined : {
              cost: retreatCost(G, me),
              incomingName: stepIns.length === 1 ? CARDS_BY_ID[stepIns[0].cardId]?.name : undefined,
              blockedReason: !isMyTurn ? 'Not your turn'
                : discardFirst ? DISCARD_FIRST
                : retreatWhy ? moveBlockReason(retreatWhy, retreatCost(G, me))
                : undefined,
            };

            // Any of your heroes may use one ability a turn, on the engine's
            // own terms (`skillBlocked`, `activateBlocked`) — each of its
            // skills, its ultimate, a borrowed ultimate and each active item it
            // wears asked on its own.
            const offer = (block: string | null, why: () => string): SkillOffer => ({
              canUse: isMine && isMyTurn && !discardFirst && block === null,
              blockedReason: !isMine ? undefined
                : !isMyTurn ? 'Not your turn'
                : discardFirst ? DISCARD_FIRST
                : block ? why()
                : undefined,
            });
            const skillOffers: Record<AbilityId, SkillOffer> = {};
            for (const skillId of kitAbilityIds(hero)) {
              const block = isMine ? skillBlocked(G, me, hero, undefined, skillId) : null;
              skillOffers[skillId] = offer(block, () => skillBlockReason(block!, hero, skillId));
            }
            const itemOffers: Record<string, SkillOffer> = {};
            for (const it of wornActives(hero)) {
              const block = isMine ? activateBlocked(G, me, it.iid) : null;
              itemOffers[it.iid] = offer(block, () => activateBlockReason(block!, it, hero));
            }
            // Your Active's attack is offered on its sheet with what it would
            // do, or why it cannot be made (one a turn, and it ends the turn).
            const attack = !isMyActive ? undefined : { ...attackOffer(G, me, hero, isMyTurn), onAttack: attackFromSheet };

            return (
              <HeroDetailSheet
                card={hero}
                isMine={isMine}
                skills={skillOffers}
                onUseSkill={(skillId) => tryUseSkill(hero, skillId)}
                items={itemOffers}
                onUseItem={tryUseItem}
                attack={attack}
                retreat={retreat}
                onRetreat={startRetreat}
                onClose={() => setHeroDetail(null)}
              />
            );
          })()}
        </AnimatePresence>

        {/* Your turn's Income beat: the souls count up as the card is drawn. */}
        <AnimatePresence>
          {incomeShown && <IncomeTick key={`income-${G.turnNumber}`} G={G} me={me} rightInset={!isMobile && panelOpen ? PANEL_WIDTH : 0} />}
        </AnimatePresence>

        {/* The match's opening: the heroes in your opening hand, one of which
            takes the lane. Blocks the board until it is chosen. */}
        <AnimatePresence>
          {G.pendingActive === me && pendingActiveShown === me && !autoPlay && (
            <PromotionOverlay
              key="opening"
              opening
              candidates={G.players[me].hand.filter((c) => CARDS_BY_ID[c.cardId]?.type === 'hero' && !(CARDS_BY_ID[c.cardId] as { flags?: { benchOnly?: boolean } }).flags?.benchOnly)}
              leavingName=""
              onPick={(iid) => moves.chooseActive(iid)}
            />
          )}
        </AnimatePresence>

        {/* A draw card's discard: pick the cards from your hand. */}
        <AnimatePresence>
          {G.pendingDiscard?.pid === me && !autoPlay && G.action?.state !== 'begin' && (
            <DiscardOverlay
              key={`discard-${G.counters?.fx ?? 0}`}
              hand={G.players[me].hand}
              count={G.pendingDiscard.count}
              drawCard={G.pendingDiscard.cardId}
              onDiscard={(iids) => moves.discard(iids)}
            />
          )}
        </AnimatePresence>

        {/* An item that could make one of several upgrades: which one. */}
        <AnimatePresence>
          {upgradePick && (
            <UpgradePicker
              key="upgrade"
              itemId={upgradePick.itemId}
              options={upgradePick.options}
              onPick={pickUpgrade}
              onCancel={() => setUpgradePick(null)}
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
            if (pendingPromotionShown !== me || G.pendingPromotion !== me) return null;
            const candidates = stepInCandidates(ps);
            if (candidates.length === 0) return null;
            return (
              <PromotionOverlay
                key="promotion"
                candidates={candidates}
                leavingName={ps.active ? CARDS_BY_ID[ps.active.cardId]?.name ?? 'Your Active' : 'Your Active'}
                backIn={ps.active ? RESPAWN_TURNS : 0}
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
              retreat={{ cost: retreatCost(G, me), onCancel: () => setRetreatPick(false) }}
              onPick={(iid) => { setRetreatPick(false); retreatTo(iid); }}
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
        <FxLayer batch={freshFx} batchKey={freshFxKey} slotRefs={slotRefs.current} action={G.action} />

        {/* The deck's motion — cards between the deck, the hand and the discard pile. */}
        <DeckMotionLayer plan={deckMotion.plan} planKey={freshFxKey} me={me} handRefs={handCardRefs.current} slotRefs={slotRefs.current} ticker={deckMotion.ticker} />

        {/* Feedback sticker — one ink label above the controls (red when it is
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
                // Above the hand row: on a phone just over it, on a desktop
                // no lower than the old dock height.
                bottom: isMobile ? handInset + 12 : Math.max(196, handInset + 12),
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
          choosing={!!upgradePick || G.pendingDiscard?.pid === me || G.pendingActive === me}
          lesson={lesson}
          onNextLesson={following && matchNav ? () => matchNav.startLesson(following.id) : undefined}
          onLessons={matchNav ? matchNav.toLessons : undefined}
        />
      )}
      </FxStageProvider>
      </BoardIntro>
      </LiveScaleContext.Provider>
      </DeckMotionProvider>
      </FxCalmContext.Provider>
      </FxImpulseContext.Provider>
      </FxTimingContext.Provider>
      </CombatProgressContext.Provider>
    </LayoutGroup>
  );
}
